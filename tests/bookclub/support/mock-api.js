// In-memory stand-in for bookclub-tool/worker/worker.js. Same routes, same
// PIN rule, same error text, so the page can't tell the difference.
const API = 'http://mock-bookclub.test'

const PUBLIC = ({ name, color, slots, cadence, hours, updatedAt }) => ({ name, color, slots, cadence, hours, updatedAt })

function member(name, pin, slots, cadence, hours, color) {
  return { name, pin, color, slots, cadence, hours, updatedAt: '2026-10-01T12:00:00Z' }
}

/** Four people who all share Tuesday 7–9 PM. */
function seedMembers() {
  const tue79 = ['1-19', '1-20']
  return [
    member('Hannah', '1111', [...tue79, '5-10'], 2, 5, 0),
    member('Marcus', '2222', [...tue79, '3-19'], 3, 3, 1),
    member('Priya', '3333', [...tue79, '5-10', '5-11'], 2, 8, 2),
    member('Jordan', '4444', [...tue79], 4, 2, 3),
  ]
}

/** Routes the mock onto `page` and returns the live member list for assertions. */
async function mockApi(page, { members = seedMembers() } = {}) {
  const db = { members }
  await page.route(`${API}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const json = (status, body) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'Access-Control-Allow-Origin': '*' } })
    if (req.method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE', 'Access-Control-Allow-Headers': 'Content-Type' },
      })
    }
    const sub = url.pathname.replace(/^\/api\/clubs\/[^/]+/, '')
    const body = req.postData() ? JSON.parse(req.postData()) : {}
    const find = (n) => db.members.find((m) => m.name.toLowerCase() === String(n).trim().toLowerCase())
    const wrongPin = (m) => json(401, { error: `That PIN doesn't match ${m.name}. If this is a different person, use a different name.` })

    if (req.method() === 'GET' && sub === '') return json(200, { members: db.members.map(PUBLIC) })
    if (req.method() === 'POST' && sub === '/signin') {
      const m = find(body.name)
      if (!m) return json(200, { member: null })
      return m.pin === body.pin ? json(200, { member: PUBLIC(m) }) : wrongPin(m)
    }
    if (req.method() === 'PUT' && sub === '/members') {
      let m = find(body.name)
      if (m && m.pin !== body.pin) return wrongPin(m)
      if (!m) {
        m = member(body.name.trim(), body.pin, [], null, null, db.members.length % 10)
        db.members.push(m)
      }
      Object.assign(m, { slots: body.slots, cadence: body.cadence, hours: body.hours, updatedAt: new Date().toISOString() })
      return json(200, { member: PUBLIC(m) })
    }
    if (req.method() === 'DELETE' && sub === '/members') {
      const m = find(body.name)
      if (m && m.pin !== body.pin) return wrongPin(m)
      db.members = db.members.filter((x) => x !== m)
      return json(200, { ok: true })
    }
    return json(404, { error: 'Not found' })
  })
  return db
}

const PAGE = `/static/bookclub/?api=${encodeURIComponent(API)}`

module.exports = { mockApi, seedMembers, PAGE }
