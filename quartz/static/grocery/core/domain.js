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
