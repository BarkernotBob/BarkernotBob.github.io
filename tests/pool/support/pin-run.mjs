// Preload for running the real reminders.mjs: `node --import <this> reminders.mjs`.
// Pins the clock to noon Fort Wayne on FAKE_TODAY, and Open-Meteo to an inch of
// rain every day, so a run means the same thing whatever day the suite runs.
const NOW = new Date(process.env.FAKE_TODAY + 'T16:00:00Z').getTime()
const Real = Date
globalThis.Date = class extends Real {
  constructor(...a) { a.length ? super(...a) : super(NOW) }
  static now() { return NOW }
}
const realFetch = globalThis.fetch
globalThis.fetch = async (url, ...rest) => {
  if (!String(url).includes('open-meteo')) return realFetch(url, ...rest)
  const time = Array.from({ length: 11 }, (_, i) => new Real(NOW - (10 - i) * 864e5).toISOString().slice(0, 10))
  const each = (v) => time.map(() => v)
  return new Response(JSON.stringify({ daily: { time, precipitation_sum: each(1), temperature_2m_max: each(60), temperature_2m_min: each(40) }, hourly: { time: [], relative_humidity_2m: [] } }))
}
