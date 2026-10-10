/* Book club scheduler — pure group math. No DOM, so it's testable on its own.
 *
 * A slot is "day-hour": day 0 = Monday … 6 = Sunday, hour 0–23, meaning the
 * hour that starts then (club time, Eastern). The calendar shows FIRST_HOUR
 * through LAST_HOUR starts, i.e. 7 AM to 11 PM.
 */

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const DAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
export const FIRST_HOUR = 7
export const LAST_HOUR = 22
export const HOURS = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => FIRST_HOUR + i)
export const CADENCES = [2, 3, 4]
export const READING_CHOICES = [1, 2, 3, 4, 5, 6, 8, 10]

export const slotKey = (day, hour) => `${day}-${hour}`

export function parseSlot(key) {
  const [d, h] = key.split('-').map(Number)
  return { day: d, hour: h }
}

/** "7 AM", "12 PM", "10 PM". */
export function hourLabel(h) {
  const hh = ((h + 11) % 12) + 1
  return `${hh} ${h < 12 || h === 24 ? 'AM' : 'PM'}`
}

/** Short label for a block of hours [start, end): "7–9 PM", "11 AM–1 PM". */
export function rangeLabel(start, end) {
  const ap = (h) => (h % 24 < 12 ? 'AM' : 'PM')
  const n = (h) => ((h + 11) % 12) + 1
  if (ap(start) === ap(end)) return `${n(start)}–${n(end)} ${ap(end)}`
  return `${n(start)} ${ap(start)}–${n(end)} ${ap(end)}`
}

/** Map of slot → array of member names available then. */
export function availabilityMap(members) {
  const map = new Map()
  for (const m of members) {
    for (const s of m.slots || []) {
      if (!map.has(s)) map.set(s, [])
      map.get(s).push(m.name)
    }
  }
  return map
}

/** Members who have actually answered something (any slot, cadence or hours). */
export function responders(members) {
  return members.filter((m) => (m.slots && m.slots.length) || m.cadence || m.hours)
}

/**
 * The best meeting blocks: runs of consecutive hours on one day where the SAME
 * people are free the whole way through. Ranked by how many can come, then by
 * length (anything 2 hours or longer counts as a full meeting), then earliest
 * in the week. Overlapping blocks on the same day are dropped, so the list is
 * real alternatives, not one evening sliced five ways.
 */
export function bestBlocks(members, { max = 5 } = {}) {
  const sets = members.map((m) => new Set(m.slots || []))
  const freeAt = (day, hour) => members.filter((_, i) => sets[i].has(slotKey(day, hour))).map((m) => m.name)

  const candidates = []
  for (let day = 0; day < 7; day++) {
    for (const start of HOURS) {
      let people = freeAt(day, start)
      if (!people.length) continue
      let end = start + 1
      while (people.length) {
        const kept = end <= LAST_HOUR ? people.filter((p) => freeAt(day, end).includes(p)) : []
        if (kept.length < people.length) {
          // Record the block before it narrows; keep extending with whoever is left.
          candidates.push({ day, start, end, people: [...people] })
        }
        people = kept
        end++
      }
    }
  }

  const score = (b) => [-b.people.length, -Math.min(b.end - b.start, 2), -(b.end - b.start), b.day, b.start]
  candidates.sort((a, b) => {
    const sa = score(a)
    const sb = score(b)
    for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sa[i] - sb[i]
    return 0
  })

  const picked = []
  for (const c of candidates) {
    const overlaps = picked.some((p) => p.day === c.day && c.start < p.end && p.start < c.end)
    if (!overlaps) picked.push(c)
    if (picked.length >= max) break
  }
  const names = members.map((m) => m.name)
  return picked.map((b) => ({
    ...b,
    hours: b.end - b.start,
    missing: names.filter((n) => !b.people.includes(n)),
    label: `${DAYS[b.day]} · ${rangeLabel(b.start, b.end)}`,
  }))
}

/**
 * Meeting rhythm. Each member picks the MOST OFTEN they can commit to, so
 * someone who picked "every 2 weeks" can also make every 3 or 4. For each
 * cadence, who can make it; and the most frequent one everyone can make.
 */
export function cadenceSummary(members) {
  const answered = members.filter((m) => CADENCES.includes(m.cadence))
  const rows = CADENCES.map((weeks) => {
    const can = answered.filter((m) => m.cadence <= weeks).map((m) => m.name)
    return { weeks, can, picked: answered.filter((m) => m.cadence === weeks).map((m) => m.name) }
  })
  const everyone = answered.length ? Math.max(...answered.map((m) => m.cadence)) : null
  return { answered: answered.length, rows, everyone }
}

/** Reading hours per week: each person, plus group min / average. */
export function readingSummary(members) {
  const people = members
    .filter((m) => typeof m.hours === 'number' && m.hours > 0)
    .map((m) => ({ name: m.name, color: m.color, hours: m.hours }))
    .sort((a, b) => b.hours - a.hours)
  if (!people.length) return { people, min: null, max: null, avg: null }
  const hrs = people.map((p) => p.hours)
  const avg = hrs.reduce((a, b) => a + b, 0) / hrs.length
  return { people, min: Math.min(...hrs), max: Math.max(...hrs), avg: Math.round(avg * 10) / 10 }
}

export const hoursText = (h) => (h >= 10 ? '10+' : String(h))

/**
 * The next `count` meeting dates if the club meets on `day` at `hour` every
 * `weeks` weeks, starting from the first such day strictly after `from`.
 */
export function nextDates(day, weeks, { from = new Date(), count = 4 } = {}) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const jsDay = (day + 1) % 7 // our 0 = Monday; JS 0 = Sunday
  do d.setDate(d.getDate() + 1)
  while (d.getDay() !== jsDay)
  const out = []
  for (let i = 0; i < count; i++) {
    out.push(new Date(d))
    d.setDate(d.getDate() + weeks * 7)
  }
  return out
}

/** Quick-fill presets for the editor. */
export const PRESETS = [
  { id: 'weeknights', label: 'Weeknights 6–9 PM', slots: [0, 1, 2, 3, 4].flatMap((d) => [18, 19, 20].map((h) => slotKey(d, h))) },
  { id: 'weekends', label: 'Weekend afternoons 12–5 PM', slots: [5, 6].flatMap((d) => [12, 13, 14, 15, 16].map((h) => slotKey(d, h))) },
  { id: 'mornings', label: 'Weekend mornings 8–11 AM', slots: [5, 6].flatMap((d) => [8, 9, 10].map((h) => slotKey(d, h))) },
]
