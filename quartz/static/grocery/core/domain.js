/* =========================================================================
   core/domain.js — pure, dependency-free helpers (money/date/text/dom/ids).
   No app state, no GitHub, no imports. Shared by app.js + every view module
   (§11.1 module split). Keep this leaf: anything that reads D/DB/HEAD or the
   network belongs in app.js, not here.
   ========================================================================= */

export const $ = (sel) => document.querySelector(sel);
export const el = (tag, attrs = {}, html = '') => {
  const e = document.createElement(tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (html !== '') e.innerHTML = html;
  return e;
};
export const money = (n) => (n == null || isNaN(n) ? '—' : '$' + Number(n).toFixed(2));
export const esc = (s) =>
  (s == null ? '' : String(s)).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
export const todayISO = () => new Date().toISOString().slice(0, 10);

/* Calendar-date helpers shared by every view (§11.1). Parse a YYYY-MM-DD as UTC
   midnight so it lines up with todayISO() (the UTC calendar date) — a local-
   midnight parse drifts a day in +/- offset timezones (this-week bucket loses
   "today", a use-by countdown fires a day early). */
export const DAY_MS = 86400000;
// Take the date part only, so a stray time suffix can't turn the parse into NaN.
export const startOfDay = (iso) => Date.parse(String(iso).slice(0, 10) + 'T00:00:00Z');
export const daysUntil = (iso) => Math.round((startOfDay(iso) - startOfDay(todayISO())) / DAY_MS);
export function fmtShortDate(iso, withYear = false) {
  if (!iso) return '';
  const d = new Date(startOfDay(iso));
  if (isNaN(d)) return '';
  // Format in UTC — the instant is UTC-midnight of the calendar date, so a local
  // -offset zone (the owner is in FL) must not render it as the previous day.
  const opts = { month: 'short', day: 'numeric', timeZone: 'UTC' };
  if (withYear) opts.year = 'numeric';
  return d.toLocaleDateString('en-US', opts);
}
export function uid(p) {
  return p + '_' + Math.floor(Date.now() / 1000) + '_' + Math.random().toString(36).slice(2, 6);
}
export function b64encode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
export function b64decode(b64) {
  return decodeURIComponent(escape(atob(b64)));
}
export function norm(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
