/* Book club scheduler — page wiring. Group math lives in logic.js. */
import {
  DAYS, DAYS_LONG, HOURS, CADENCES, READING_CHOICES, PRESETS,
  slotKey, hourLabel, rangeLabel, availabilityMap, bestBlocks, cadenceSummary,
  readingSummary, hoursText, nextDates, responders,
} from './logic.js'

const PALETTE = ['#2a6fdb', '#e8453c', '#1f8a52', '#e88a00', '#8e44ad', '#d6336c', '#0b8a8a', '#8a5a00', '#4f5bd5', '#5f7f1a']
const HEAT = '31, 138, 82'

const params = new URLSearchParams(location.search)
const CLUB = (params.get('club') || 'bookclub').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40) || 'bookclub'
// ?api= is for local testing only; on the live site a shared link can't point PINs elsewhere.
const LIVE = location.hostname.endsWith('github.io')
const API = LIVE ? 'https://bookclub-api.barkernotbob.workers.dev' : params.get('api') || 'http://127.0.0.1:8787'
const CRED_KEY = `bookclub.v1.${CLUB}.cred`

const $ = (s) => document.querySelector(s)
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

const state = {
  members: [],
  loaded: false,
  loadError: null,
  me: readCreds(), // { name, pin } or null
  draft: { slots: new Set(), cadence: null, hours: null },
  savedSnapshot: null, // JSON of the draft as last saved; null = never saved
  view: 'group',
  filter: 'all', // 'all' or a member name
  block: 0, // index into best blocks that's highlighted
  focus: null, // slot key tapped in the group grid
  saving: false,
}

/* ------------------------------------------------------------------ data */

function readCreds() {
  try {
    const c = JSON.parse(localStorage.getItem(CRED_KEY))
    return c && c.name && /^\d{4}$/.test(c.pin) ? c : null
  } catch {
    return null
  }
}

async function api(path, { method = 'GET', body } = {}) {
  let res
  try {
    res = await fetch(`${API}/api/clubs/${CLUB}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw Object.assign(new Error("Couldn't reach the club calendar. Check your connection and try again."), { status: 0 })
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong. Try again.'), { status: res.status })
  return data
}

async function load({ quiet = false } = {}) {
  try {
    const data = await api('')
    state.members = data.members || []
    state.loaded = true
    state.loadError = null
    // Signed in from an earlier visit: pick up what's saved (unless mid-edit).
    if (state.me && !isDirty()) {
      const mine = findMember(state.me.name)
      if (mine) setDraftFrom(mine)
    }
  } catch (err) {
    if (!quiet || !state.loaded) state.loadError = err.message
  }
  render()
}

const findMember = (name) => state.members.find((m) => m.name.toLowerCase() === String(name).trim().toLowerCase())

function setDraftFrom(m) {
  state.draft = { slots: new Set(m ? m.slots : []), cadence: m ? m.cadence : null, hours: m ? m.hours : null }
  state.savedSnapshot = m ? snapshot() : null
}

const snapshot = () =>
  JSON.stringify({ s: [...state.draft.slots].sort(), c: state.draft.cadence, h: state.draft.hours })
const isDirty = () =>
  state.savedSnapshot === null
    ? state.draft.slots.size > 0 || state.draft.cadence != null || state.draft.hours != null
    : snapshot() !== state.savedSnapshot

const colorOf = (m) => PALETTE[(m?.color ?? 0) % PALETTE.length]
function myColor() {
  const m = state.me && findMember(state.me.name)
  if (m) return colorOf(m)
  const used = new Set(state.members.map((x) => x.color))
  const next = state.members.length ? (Math.max(...used) + 1) % PALETTE.length : 0
  return PALETTE[next]
}
const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')

/* ------------------------------------------------------------------ feedback */

let toastTimer
function toast(msg, { error = false } = {}) {
  const t = $('#toast')
  t.textContent = msg
  t.classList.toggle('error', error)
  t.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => t.classList.remove('show'), error ? 4500 : 2800)
}

/* ------------------------------------------------------------------ render */

function render() {
  document.body.style.setProperty('--me', myColor())
  renderWho()
  renderTabs()
  renderBanner()
  if (state.view === 'group') renderGroup()
  else renderEditor()
}

function renderWho() {
  const who = $('#who')
  if (state.me) {
    who.innerHTML = `<span class="hello">Hi, <strong>${esc(state.me.name)}</strong></span>
      <button class="btn small" data-action="signout">Sign out</button>`
  } else {
    who.innerHTML = `<button class="btn small primary" data-action="start">Add my times</button>`
  }
}

function renderTabs() {
  for (const t of document.querySelectorAll('.tab')) t.setAttribute('aria-selected', String(t.dataset.view === state.view))
  $('#view-group').hidden = state.view !== 'group'
  $('#view-me').hidden = state.view !== 'me'
}

function renderBanner() {
  const b = $('#banner')
  const notes = []
  if (state.loadError) {
    notes.push(`<span>${esc(state.loadError)}</span><button class="btn small" data-action="retry">Try again</button>`)
  }
  const tz = tzNote()
  if (tz && !state.loadError) notes.push(`<span>${tz}</span>`)
  b.hidden = !notes.length
  b.innerHTML = notes.join('')
}

/* The club meets in Eastern Time. If this device is somewhere else, say so. */
function tzNote() {
  try {
    const now = new Date()
    const fmt = (tz) => new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(now)
    if (fmt('America/New_York') === fmt(Intl.DateTimeFormat().resolvedOptions().timeZone)) return ''
    return 'Heads up: your device isn’t on Eastern Time. All times here are <strong>Eastern</strong>, so enter yours that way.'
  } catch {
    return ''
  }
}

/* ---------- group view ---------- */

function renderGroup() {
  const members = state.members
  const withTimes = members.filter((m) => m.slots && m.slots.length)
  const blocks = bestBlocks(withTimes)
  if (state.loaded && state.block != null && state.block >= blocks.length) state.block = null

  renderStats(members, withTimes)
  renderLegend(withTimes.length)
  renderFilter(withTimes)
  renderGroupGrid(withTimes, blocks)
  renderDetail(state.focus, withTimes)
  renderBest(blocks, withTimes.length)
  renderPlan(blocks, members)
  renderRhythm(members)
  renderReading(members)
  renderMembers(members)
  $('#empty-overlay').hidden = !state.loaded || withTimes.length > 0
}

function renderStats(members, withTimes) {
  const cad = cadenceSummary(members)
  const read = readingSummary(members)
  const people = responders(members)
  $('#stats').innerHTML = `
    <div class="stat">
      <div class="stat-label">Joined</div>
      <div class="stat-num">${state.loaded ? people.length : '–'} <small>${people.length === 1 ? 'person' : 'people'}</small></div>
      <div class="stat-note">${withTimes.length} added times</div>
    </div>
    <div class="stat">
      <div class="stat-label">Meet every</div>
      <div class="stat-num">${cad.everyone ? `${cad.everyone} <small>weeks</small>` : '–'}</div>
      <div class="stat-note">${cad.everyone ? 'works for everyone' : 'no answers yet'}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Reading</div>
      <div class="stat-num">${
        read.min == null
          ? '–'
          : `${read.min === read.max ? hoursText(read.min) : `${hoursText(read.min)}–${hoursText(read.max)}`} <small>hrs/wk</small>`
      }</div>
      <div class="stat-note">${read.min == null ? 'no answers yet' : `average ${read.avg} hrs`}</div>
    </div>`
}

const heatColor = (n, total) => (n ? `rgba(${HEAT}, ${(0.14 + 0.62 * (n / Math.max(total, 1))).toFixed(3)})` : '#fff')

function renderLegend(total) {
  const steps = Math.max(Math.min(total, 5), 1)
  const ramp = Array.from({ length: steps }, (_, i) => `<span style="background:${heatColor(i + 1, steps + 1)}"></span>`).join('')
  $('#legend').innerHTML = `
    <span class="key">fewer <span class="ramp">${ramp}</span> more</span>
    <span class="key"><span class="swatch-all">★</span> everyone</span>
    ${state.me && findMember(state.me.name) ? '<span class="key"><span class="swatch-me"></span> your times</span>' : ''}`
}

function renderFilter(withTimes) {
  if (state.filter !== 'all' && !withTimes.some((m) => m.name === state.filter)) state.filter = 'all'
  const chip = (value, label, color) =>
    `<button class="chip" role="radio" aria-checked="${state.filter === value}" data-filter="${esc(value)}">
      ${color ? `<span class="dot" style="background:${color}"></span>` : ''}${esc(label)}</button>`
  $('#people-filter').innerHTML =
    chip('all', 'Everyone') + withTimes.map((m) => chip(m.name, m.name, colorOf(m))).join('')
  $('#people-filter').hidden = withTimes.length === 0
}

function gridSkeleton(id, { editable }) {
  const parts = ['<div class="g-corner"></div>']
  DAYS.forEach((d, i) => {
    parts.push(
      editable
        ? `<button class="g-day" data-day="${i}" aria-label="Toggle all of ${DAYS_LONG[i]}">${d}</button>`
        : `<div class="g-day" role="columnheader" aria-label="${DAYS_LONG[i]}">${d}</div>`,
    )
  })
  for (const h of HOURS) {
    parts.push(
      editable
        ? `<button class="g-hour" data-hour="${h}" aria-label="Toggle ${hourLabel(h)} every day">${hourLabel(h)}</button>`
        : `<div class="g-hour" role="rowheader">${hourLabel(h)}</div>`,
    )
    for (let d = 0; d < 7; d++) {
      const k = slotKey(d, h)
      parts.push(
        `<button class="cell" data-slot="${k}" aria-label="${DAYS_LONG[d]} ${hourLabel(h)}"${
          editable ? ' aria-pressed="false"' : ''
        }></button>`,
      )
    }
  }
  $(id).innerHTML = parts.join('')
}

function renderGroupGrid(withTimes, blocks) {
  const grid = $('#group-grid')
  if (!grid.firstChild) gridSkeleton('#group-grid', { editable: false })
  const map = availabilityMap(withTimes)
  const total = withTimes.length
  const mine = new Set((state.me && findMember(state.me.name)?.slots) || [])
  const person = state.filter !== 'all' ? withTimes.find((m) => m.name === state.filter) : null
  const personSlots = new Set(person?.slots || [])
  const block = state.block != null ? blocks[state.block] : null

  for (const cell of grid.querySelectorAll('.cell')) {
    const k = cell.dataset.slot
    const [d, h] = k.split('-').map(Number)
    const names = map.get(k) || []
    cell.className = 'cell'
    cell.style.background = ''
    cell.style.borderColor = ''
    cell.textContent = ''
    if (person) {
      if (personSlots.has(k)) {
        cell.style.background = colorOf(person)
        cell.style.borderColor = colorOf(person)
        cell.style.color = '#fff'
        cell.textContent = '✓'
      }
    } else {
      cell.style.color = ''
      if (names.length) {
        cell.textContent = names.length
        if (names.length === total) cell.classList.add('all')
        else cell.style.background = heatColor(names.length, total)
      }
      if (mine.has(k)) cell.classList.add('me')
    }
    if (block && block.day === d && h >= block.start && h < block.end) cell.classList.add('hl')
    if (state.focus === k) cell.classList.add('focus')
    cell.setAttribute(
      'aria-label',
      `${DAYS_LONG[d]} ${hourLabel(h)}: ${names.length} of ${total} free${names.length ? ' (' + names.join(', ') + ')' : ''}`,
    )
  }
}

function renderDetail(k, withTimes) {
  const box = $('#detail')
  if (!k) {
    box.innerHTML = withTimes.length
      ? `<span class="muted"><span class="only-fine">Hover over</span><span class="only-coarse">Tap</span> any box to see exactly who's free then.</span>`
      : `<span class="muted">Once people add their times, the darker a box is, the more people are free.</span>`
    return
  }
  const [d, h] = k.split('-').map(Number)
  const map = availabilityMap(withTimes)
  const yes = map.get(k) || []
  const no = withTimes.map((m) => m.name).filter((n) => !yes.includes(n))
  box.innerHTML = `<strong>${DAYS_LONG[d]}, ${rangeLabel(h, h + 1)}</strong> · ${yes.length} of ${withTimes.length} free<br>
    ${yes.length ? `<span class="yes">✓ ${yes.map(esc).join(', ')}</span>` : '<span class="no">No one is free.</span>'}
    ${no.length && yes.length ? ` &nbsp;<span class="no">✗ ${no.map(esc).join(', ')}</span>` : ''}`
}

function renderBest(blocks, total) {
  const list = $('#best')
  if (!blocks.length) {
    list.innerHTML = `<li class="muted">${state.loaded ? 'Best times appear here once people add their availability.' : 'Loading…'}</li>`
    return
  }
  list.innerHTML = blocks
    .map((b, i) => {
      const all = b.people.length === total
      const who = all
        ? total === 1
          ? esc(b.people[0])
          : 'Everyone can make it'
        : `Missing ${b.missing.map(esc).join(', ')}`
      return `<li><button class="best-item" data-block="${i}" aria-pressed="${state.block === i}">
        <span class="best-rank">${i + 1}</span>
        <span><div class="best-when">${DAYS_LONG[b.day]} · ${rangeLabel(b.start, b.end)}</div>
          <div class="best-who">${who}</div>
          <div class="bar"><span style="width:${(100 * b.people.length) / total}%"></span></div></span>
        <span class="best-count ${all ? 'all' : ''}">${b.people.length}/${total}<small>${b.hours} hr${b.hours > 1 ? 's' : ''}</small></span>
      </button></li>`
    })
    .join('')
}

function renderPlan(blocks, members) {
  const box = $('#plan')
  const b = state.block != null ? blocks[state.block] : null
  if (!b) {
    box.hidden = true
    return
  }
  box.hidden = false
  const cad = cadenceSummary(members)
  const weeks = cad.everyone || 4
  const dates = nextDates(b.day, weeks)
  const fmt = (d) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const end = Math.min(b.end, b.start + 2)
  box.innerHTML = `If we meet <strong>${DAYS_LONG[b.day]}s ${rangeLabel(b.start, end)}</strong>,
    every <strong>${weeks} weeks</strong>${cad.everyone ? '' : ' (until people pick a rhythm)'}, the next meetings would be:
    <div class="dates">${dates.map((d) => `<span class="date">${fmt(d)}</span>`).join('')}</div>`
}

function renderRhythm(members) {
  const cad = cadenceSummary(members)
  const answered = members.filter((m) => CADENCES.includes(m.cadence))
  if (!answered.length) {
    $('#rhythm').innerHTML = `<div class="verdict none">No one has picked a rhythm yet.</div>`
    return
  }
  const perYear = { 2: 26, 3: 17, 4: 13 }
  const rows = cad.rows
    .map((r) => {
      const all = r.can.length === answered.length
      const avatars = answered
        .map((m) => {
          const ok = r.can.includes(m.name)
          return `<span class="avatar ${ok ? '' : 'off'}" style="background:${colorOf(m)}" title="${esc(m.name)}${
            ok ? ' can' : ' can’t'
          } make this">${esc(initials(m.name))}</span>`
        })
        .join('')
      return `<div class="rhythm-row">
        <div class="rhythm-name">Every ${r.weeks} weeks<small>~${perYear[r.weeks]} meetings a year</small></div>
        <div class="avatars">${avatars}</div>
        <div class="rhythm-count ${all ? 'ok' : ''}">${all ? '✓ all' : `${r.can.length}/${answered.length}`}</div>
      </div>`
    })
    .join('')
  const faster = cad.rows.find((r) => r.weeks < cad.everyone && r.can.length)
  const pending = members.filter((m) => !CADENCES.includes(m.cadence) && m.slots?.length).map((m) => m.name)
  $('#rhythm').innerHTML = `${rows}
    <div class="verdict">✓ <strong>Every ${cad.everyone} weeks</strong> works for everyone who answered.${
      faster ? ` ${faster.can.length} could meet as often as every ${faster.weeks} weeks.` : ''
    }${pending.length ? ` <br><span class="muted">Still to answer: ${pending.map(esc).join(', ')}</span>` : ''}</div>`
}

function renderReading(members) {
  const r = readingSummary(members)
  if (!r.people.length) {
    $('#reading').innerHTML = `<div class="verdict none">No one has said how much they can read yet.</div>`
    return
  }
  const byName = new Map(members.map((m) => [m.name, m]))
  const rows = r.people
    .map(
      (p) => `<div class="read-row">
        <div class="read-name"><span class="dot" style="background:${colorOf(byName.get(p.name))}"></span><span>${esc(p.name)}</span></div>
        <div class="read-bar"><span style="width:${Math.min(100, (p.hours / 10) * 100)}%;background:${colorOf(byName.get(p.name))}"></span></div>
        <div class="read-hrs">${hoursText(p.hours)} hr${p.hours === 1 ? '' : 's'}</div>
      </div>`,
    )
    .join('')
  const weeks = cadenceSummary(members).everyone
  $('#reading').innerHTML = `${rows}
    <div class="verdict">Plan for the slowest pace: <strong>${hoursText(r.min)} hr${r.min === 1 ? '' : 's'} a week</strong>${
      weeks ? `, about <strong>${r.min * weeks} hours</strong> of reading between meetings (every ${weeks} weeks)` : ''
    }. Group average: ${r.avg} hrs.</div>`
}

function ago(ms) {
  const s = (Date.now() - ms) / 1000
  if (s < 90) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} hr ago`
  const d = Math.round(s / 86400)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

function renderMembers(members) {
  const box = $('#members')
  if (!members.length) {
    box.innerHTML = `<p class="muted">${state.loaded ? 'No members yet. Share this page’s link and add your own times.' : 'Loading…'}</p>`
    return
  }
  const meKey = state.me?.name.toLowerCase()
  box.innerHTML = members
    .map((m) => {
      const isMe = m.name.toLowerCase() === meKey
      return `<div class="member ${isMe ? 'is-me' : ''}">
        <span class="avatar" style="background:${colorOf(m)}">${esc(initials(m.name))}</span>
        <div>
          <div class="member-name">${esc(m.name)}${isMe ? '<em>You</em>' : ''}</div>
          <div class="member-facts">
            <span>🗓 <b>${m.slots.length}</b> hrs free/wk</span>
            <span>🔁 ${m.cadence ? `every <b>${m.cadence}</b> wks` : '—'}</span>
            <span>📖 ${m.hours ? `<b>${hoursText(m.hours)}</b> hrs/wk` : '—'}</span>
            <span class="muted">updated ${ago(m.updatedAt)}</span>
          </div>
        </div>
      </div>`
    })
    .join('')
}

/* ---------- editor ---------- */

function renderEditor() {
  if (!$('#my-grid').firstChild) gridSkeleton('#my-grid', { editable: true })
  paintMyGrid()
  $('#presets').innerHTML =
    PRESETS.map(
      (p) =>
        `<button class="chip" data-preset="${p.id}" aria-pressed="${p.slots.every((s) => state.draft.slots.has(s))}">+ ${esc(p.label)}</button>`,
    ).join('') + `<button class="chip" data-action="clear-slots">Clear all</button>`

  const perYear = { 2: 26, 3: 17, 4: 13 }
  $('#cadence-choices').innerHTML = CADENCES.map(
    (w) => `<button class="choice" role="radio" aria-checked="${state.draft.cadence === w}" data-cadence="${w}">
      <span class="radio"></span>
      <span><div class="choice-title">Every ${w} weeks</div><div class="choice-sub">About ${perYear[w]} meetings a year</div></span>
    </button>`,
  ).join('')

  $('#hours-choices').innerHTML = READING_CHOICES.map(
    (h) =>
      `<button class="chip" role="radio" aria-checked="${state.draft.hours === h}" data-hours="${h}">${hoursText(h)} hr${h === 1 ? '' : 's'}</button>`,
  ).join('')

  renderSaveState()
}

function paintMyGrid() {
  for (const cell of $('#my-grid').querySelectorAll('.cell')) paintCell(cell)
  updateCount()
}

function paintCell(cell) {
  const on = state.draft.slots.has(cell.dataset.slot)
  cell.classList.toggle('on', on)
  cell.setAttribute('aria-pressed', String(on))
}

function updateCount() {
  const n = state.draft.slots.size
  $('#my-count').textContent = n
    ? `You've marked ${n} hour${n === 1 ? '' : 's'} a week you could meet.`
    : 'Nothing marked yet.'
  for (const chip of document.querySelectorAll('[data-preset]')) {
    const p = PRESETS.find((x) => x.id === chip.dataset.preset)
    chip.setAttribute('aria-pressed', String(p.slots.every((s) => state.draft.slots.has(s))))
  }
}

function renderSaveState() {
  const el = $('#save-state')
  const btn = $('#save-btn')
  btn.disabled = state.saving
  btn.textContent = state.saving ? 'Saving…' : 'Save my availability'
  el.className = 'save-state'
  if (state.saving) el.textContent = ''
  else if (isDirty()) {
    el.textContent = state.savedSnapshot === null ? 'Not saved yet' : 'Unsaved changes'
    el.classList.add('dirty')
  } else if (state.savedSnapshot !== null) {
    el.textContent = 'All changes saved ✓'
    el.classList.add('saved')
  } else el.textContent = 'Fill in all three steps, then save.'
  $('#remove-btn').hidden = !(state.me && findMember(state.me.name))
}

function changed() {
  updateCount()
  renderSaveState()
}

/* ------------------------------------------------------------------ actions */

function setView(view) {
  if (view === 'me' && !state.me) return openSignin()
  state.view = view
  render()
  window.scrollTo({ top: 0 })
}

function openSignin() {
  $('#signin').hidden = false
  $('#signin-error').textContent = ''
  $('#in-pin').value = ''
  setTimeout(() => $('#in-name').focus(), 30)
}
function closeSignin() {
  $('#signin').hidden = true
}

async function submitSignin(e) {
  e.preventDefault()
  const name = $('#in-name').value.replace(/\s+/g, ' ').trim()
  const pin = $('#in-pin').value.trim()
  const err = $('#signin-error')
  if (!name) return (err.textContent = 'Enter your name.')
  if (!/^\d{4}$/.test(pin)) return (err.textContent = 'Your PIN needs to be exactly 4 digits.')
  const btn = $('#signin-btn')
  btn.disabled = true
  btn.textContent = 'Checking…'
  try {
    const { member } = await api('/signin', { method: 'POST', body: { name, pin } })
    state.me = { name: member ? member.name : name, pin }
    localStorage.setItem(CRED_KEY, JSON.stringify(state.me))
    if (member) {
      const i = state.members.findIndex((m) => m.name.toLowerCase() === member.name.toLowerCase())
      if (i >= 0) state.members[i] = member
      else state.members.push(member)
    }
    setDraftFrom(member)
    closeSignin()
    state.view = 'me'
    render()
    window.scrollTo({ top: 0 })
    toast(member ? `Welcome back, ${member.name}! Update anything below.` : `Welcome, ${name}! Mark your times below.`)
  } catch (ex) {
    err.textContent = ex.message
  } finally {
    btn.disabled = false
    btn.textContent = 'Continue'
  }
}

function signOut() {
  if (isDirty() && !confirm('You have unsaved changes. Sign out anyway?')) return
  state.me = null
  localStorage.removeItem(CRED_KEY)
  setDraftFrom(null)
  state.view = 'group'
  render()
  toast('Signed out')
}

async function save() {
  const d = state.draft
  const missing = !d.slots.size ? 'Mark at least one time you could meet (step 1).' : !d.cadence ? 'Pick how often you can meet (step 2).' : !d.hours ? 'Pick your weekly reading time (step 3).' : ''
  if (missing) {
    const target = !d.slots.size ? '#my-grid' : !d.cadence ? '#cadence-choices' : '#hours-choices'
    $(target).closest('.card').scrollIntoView({ behavior: 'smooth', block: 'center' })
    return toast(missing, { error: true })
  }
  state.saving = true
  renderSaveState()
  try {
    const { member } = await api('/members', {
      method: 'PUT',
      body: { name: state.me.name, pin: state.me.pin, slots: [...d.slots], cadence: d.cadence, hours: d.hours },
    })
    const i = state.members.findIndex((m) => m.name.toLowerCase() === member.name.toLowerCase())
    if (i >= 0) state.members[i] = member
    else state.members.push(member)
    state.me.name = member.name
    localStorage.setItem(CRED_KEY, JSON.stringify(state.me))
    state.savedSnapshot = snapshot()
    state.saving = false
    state.view = 'group'
    state.filter = 'all'
    state.block = 0
    render()
    window.scrollTo({ top: 0 })
    toast('Saved! Here’s how you fit with the group.')
  } catch (ex) {
    state.saving = false
    renderSaveState()
    toast(ex.message, { error: true })
  }
}

async function removeMe() {
  if (!confirm(`Remove ${state.me.name} and all your answers from the book club calendar?`)) return
  try {
    await api('/members', { method: 'DELETE', body: { name: state.me.name, pin: state.me.pin } })
    state.members = state.members.filter((m) => m.name.toLowerCase() !== state.me.name.toLowerCase())
    state.me = null
    localStorage.removeItem(CRED_KEY)
    setDraftFrom(null)
    state.view = 'group'
    render()
    toast('You’ve been removed.')
  } catch (ex) {
    toast(ex.message, { error: true })
  }
}

function toggleSlots(keys) {
  const all = keys.every((k) => state.draft.slots.has(k))
  for (const k of keys) all ? state.draft.slots.delete(k) : state.draft.slots.add(k)
  paintMyGrid()
  changed()
}

/* ------------------------------------------------------------------ events */

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-action],[data-view],[data-filter],[data-block],[data-preset],[data-cadence],[data-hours]')
  if (!t) return
  const a = t.dataset.action
  if (a === 'start') return state.me ? setView('me') : openSignin()
  if (a === 'signout') return signOut()
  if (a === 'retry') return load()
  if (a === 'close-signin') return closeSignin()
  if (a === 'clear-slots') return toggleSlots([...state.draft.slots])
  if (t.dataset.view) return setView(t.dataset.view)
  if (t.dataset.filter) {
    state.filter = t.dataset.filter
    return renderGroup()
  }
  if (t.dataset.block) {
    const i = Number(t.dataset.block)
    state.block = state.block === i ? null : i
    renderGroup()
    if (state.block != null && matchMedia('(max-width: 999px)').matches) {
      $('#cal-card').scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    return
  }
  if (t.dataset.preset) return toggleSlots(PRESETS.find((p) => p.id === t.dataset.preset).slots)
  if (t.dataset.cadence) {
    state.draft.cadence = Number(t.dataset.cadence)
    renderEditor()
    return
  }
  if (t.dataset.hours) {
    state.draft.hours = Number(t.dataset.hours)
    renderEditor()
  }
})

$('#signin-form').addEventListener('submit', submitSignin)
$('#signin').addEventListener('click', (e) => e.target.id === 'signin' && closeSignin())
$('#in-pin').addEventListener('input', (e) => (e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4)))
document.addEventListener('keydown', (e) => e.key === 'Escape' && !$('#signin').hidden && closeSignin())
$('#save-btn').addEventListener('click', save)
$('#remove-btn').addEventListener('click', removeMe)

/* Group grid: hover (mouse) or tap shows who's free. */
const groupGrid = $('#group-grid')
groupGrid.addEventListener('mouseover', (e) => {
  const c = e.target.closest('.cell')
  if (c && !state.focus) renderDetail(c.dataset.slot, state.members.filter((m) => m.slots?.length))
})
groupGrid.addEventListener('mouseleave', () => renderDetail(state.focus, state.members.filter((m) => m.slots?.length)))
groupGrid.addEventListener('click', (e) => {
  const c = e.target.closest('.cell')
  if (!c) return
  const k = c.dataset.slot
  groupGrid.querySelector('.cell.focus')?.classList.remove('focus')
  state.focus = state.focus === k ? null : k
  if (state.focus) c.classList.add('focus')
  renderDetail(state.focus || k, state.members.filter((m) => m.slots?.length))
})

/* Editor grid: with a mouse, drag from one box to another to fill (or clear)
   the whole rectangle between them. On touch, tap toggles one box so the page
   can still scroll; day/hour labels toggle a whole column/row. */
const myGrid = $('#my-grid')
let paint = null
let swallowClick = false
const cellAt = (x, y) => document.elementFromPoint(x, y)?.closest('#my-grid .cell')
myGrid.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'mouse' || e.button !== 0) return
  const c = e.target.closest('.cell')
  if (!c) return
  e.preventDefault()
  swallowClick = true
  const [day, hour] = c.dataset.slot.split('-').map(Number)
  paint = { on: !state.draft.slots.has(c.dataset.slot), day, hour, before: new Set(state.draft.slots), last: null }
  applyPaint(c)
})
window.addEventListener('pointermove', (e) => {
  if (!paint) return
  const c = cellAt(e.clientX, e.clientY)
  if (c) applyPaint(c)
})
window.addEventListener('pointerup', () => {
  if (paint) {
    changed()
    // The click that follows this pointerup (if it lands on the grid) is swallowed; never a later one.
    setTimeout(() => (swallowClick = false))
  }
  paint = null
})
function applyPaint(c) {
  if (paint.last === c.dataset.slot) return
  paint.last = c.dataset.slot
  const [day, hour] = c.dataset.slot.split('-').map(Number)
  const [d0, d1] = [Math.min(day, paint.day), Math.max(day, paint.day)]
  const [h0, h1] = [Math.min(hour, paint.hour), Math.max(hour, paint.hour)]
  const next = new Set(paint.before)
  for (let d = d0; d <= d1; d++)
    for (let h = h0; h <= h1; h++) paint.on ? next.add(slotKey(d, h)) : next.delete(slotKey(d, h))
  state.draft.slots = next
  paintMyGrid()
}
myGrid.addEventListener('click', (e) => {
  const c = e.target.closest('.cell')
  if (c) {
    if (swallowClick) return void (swallowClick = false)
    const k = c.dataset.slot
    state.draft.slots.has(k) ? state.draft.slots.delete(k) : state.draft.slots.add(k)
    paintCell(c)
    return changed()
  }
  const day = e.target.closest('[data-day]')
  if (day) return toggleSlots(HOURS.map((h) => slotKey(Number(day.dataset.day), h)))
  const hour = e.target.closest('[data-hour]')
  if (hour) return toggleSlots(DAYS.map((_, d) => slotKey(d, Number(hour.dataset.hour))))
})

window.addEventListener('beforeunload', (e) => {
  if (state.me && isDirty()) {
    e.preventDefault()
    e.returnValue = ''
  }
})

/* Keep the group view fresh when people come back to the tab. */
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && load({ quiet: true }))
setInterval(() => document.visibilityState === 'visible' && state.view === 'group' && load({ quiet: true }), 60_000)

render()
load()
