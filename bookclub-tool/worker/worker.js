/* Book club scheduler API — Cloudflare Worker + D1.
 *
 * The page lives at barkernotbob.github.io/static/bookclub/. Members "log in"
 * with a name and a 4-digit PIN: the PIN only stops one member overwriting
 * another's answers. Everything a member saves is readable by anyone with the
 * page link, which is the point — it's a shared calendar.
 *
 *   GET    /api/clubs/:club            → { members: [...] }   (no PIN data)
 *   POST   /api/clubs/:club/signin     { name, pin } → { member | null }  401 on wrong PIN
 *   PUT    /api/clubs/:club/members    { name, pin, slots, cadence, hours } → { member }
 *   DELETE /api/clubs/:club/members    { name, pin } → { ok: true }
 */

const ALLOWED_ORIGINS = [/^https:\/\/barkernotbob\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/]
const PALETTE_SIZE = 10
const SLOT_RE = /^[0-6]-([0-9]|1[0-9]|2[0-3])$/

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || ''
    const cors = corsHeaders(origin)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    try {
      const res = await route(request, env)
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v)
      return res
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status, cors)
      console.error(err)
      return json({ error: 'Something went wrong on our end. Try again.' }, 500, cors)
    }
  },
}

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function corsHeaders(origin) {
  const ok = ALLOWED_ORIGINS.some((re) => re.test(origin))
  return {
    'Access-Control-Allow-Origin': ok ? origin : 'https://barkernotbob.github.io',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
  })
}

async function route(request, env) {
  const url = new URL(request.url)
  const m = url.pathname.match(/^\/api\/clubs\/([a-z0-9-]{1,40})(\/signin|\/members)?\/?$/)
  if (!m) throw new HttpError(404, 'Not found')
  const club = m[1]
  const sub = m[2] || ''

  if (sub === '' && request.method === 'GET') return json({ members: await listMembers(env, club) })
  if (sub === '/signin' && request.method === 'POST') return signIn(env, club, await body(request))
  if (sub === '/members' && request.method === 'PUT') return save(env, club, await body(request))
  if (sub === '/members' && request.method === 'DELETE') return remove(env, club, await body(request))
  throw new HttpError(405, 'Method not allowed')
}

async function body(request) {
  try {
    return await request.json()
  } catch {
    throw new HttpError(400, 'Bad request')
  }
}

function cleanName(name) {
  const n = String(name ?? '').replace(/\s+/g, ' ').trim()
  if (!n) throw new HttpError(400, 'Enter your name.')
  if (n.length > 40) throw new HttpError(400, 'Name is too long (40 characters max).')
  return n
}

function cleanPin(pin) {
  const p = String(pin ?? '')
  if (!/^\d{4}$/.test(p)) throw new HttpError(400, 'PIN must be 4 digits.')
  return p
}

async function hash(salt, pin) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pin))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function publicMember(row) {
  return {
    name: row.name,
    color: row.color,
    slots: JSON.parse(row.slots),
    cadence: row.cadence,
    hours: row.hours,
    updatedAt: row.updated_at,
  }
}

async function listMembers(env, club) {
  const { results } = await env.DB.prepare('SELECT * FROM members WHERE club = ? ORDER BY created_at').bind(club).all()
  return results.map(publicMember)
}

async function findAndCheck(env, club, name, pin) {
  const key = name.toLowerCase()
  const row = await env.DB.prepare('SELECT * FROM members WHERE club = ? AND key = ?').bind(club, key).first()
  if (row && (await hash(row.salt, pin)) !== row.pin_hash) {
    throw new HttpError(401, `That PIN doesn't match ${row.name}. If this is a different person, use a different name.`)
  }
  return { key, row }
}

async function signIn(env, club, b) {
  const name = cleanName(b.name)
  const pin = cleanPin(b.pin)
  const { row } = await findAndCheck(env, club, name, pin)
  return json({ member: row ? publicMember(row) : null })
}

async function save(env, club, b) {
  const name = cleanName(b.name)
  const pin = cleanPin(b.pin)
  if (!Array.isArray(b.slots) || b.slots.length > 168 || !b.slots.every((s) => SLOT_RE.test(s))) {
    throw new HttpError(400, 'Bad availability data.')
  }
  const slots = [...new Set(b.slots)]
  const cadence = b.cadence == null ? null : Number(b.cadence)
  if (cadence !== null && ![2, 3, 4].includes(cadence)) throw new HttpError(400, 'Pick every 2, 3 or 4 weeks.')
  const hours = b.hours == null ? null : Number(b.hours)
  if (hours !== null && !(hours > 0 && hours <= 40)) throw new HttpError(400, 'Reading hours must be between 0 and 40.')

  const { key, row } = await findAndCheck(env, club, name, pin)
  const now = Date.now()
  if (row) {
    await env.DB.prepare(
      'UPDATE members SET name = ?, slots = ?, cadence = ?, hours = ?, updated_at = ? WHERE club = ? AND key = ?',
    )
      .bind(name, JSON.stringify(slots), cadence, hours, now, club, key)
      .run()
  } else {
    const count = await env.DB.prepare('SELECT COUNT(*) AS n, MAX(color) AS maxc FROM members WHERE club = ?').bind(club).first()
    if (count.n >= 60) throw new HttpError(400, 'This club is full.')
    const color = count.n === 0 ? 0 : (Number(count.maxc) + 1) % PALETTE_SIZE
    const salt = crypto.randomUUID()
    await env.DB.prepare(
      'INSERT INTO members (club, key, name, pin_hash, salt, color, slots, cadence, hours, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(club, key, name, await hash(salt, pin), salt, color, JSON.stringify(slots), cadence, hours, now, now)
      .run()
  }
  const saved = await env.DB.prepare('SELECT * FROM members WHERE club = ? AND key = ?').bind(club, key).first()
  return json({ member: publicMember(saved) })
}

async function remove(env, club, b) {
  const name = cleanName(b.name)
  const pin = cleanPin(b.pin)
  const { key, row } = await findAndCheck(env, club, name, pin)
  if (row) await env.DB.prepare('DELETE FROM members WHERE club = ? AND key = ?').bind(club, key).run()
  return json({ ok: true })
}
