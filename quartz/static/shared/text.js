/* =========================================================================
   shared/text.js — text, money and base64 helpers.
   ========================================================================= */

/* HTML-escape for interpolation into markup.
 *
 * Escapes the single quote as well as & < > " — grocery hardened this years
 * after the other apps copied it, and the copies never got the fix. That is
 * the whole reason this directory exists.
 *
 * IMPORTANT — this is safe for TEXT and for quoted ATTRIBUTE values. It is NOT
 * safe for building an inline event handler (`onclick="fn('...')"`). A handler
 * attribute is HTML-decoded BEFORE its contents are parsed as JavaScript, so
 * `&#39;` turns back into a quote and a value can still break out of the call.
 * There is no escaping fix for that; data must not go into inline handlers at
 * all. See GAP-W4 (#112).
 */
export const esc = (s) =>
  (s == null ? '' : String(s)).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

/* Fixed 2dp currency, or an em dash for "no number". */
export const money = (n) => (n == null || isNaN(n) ? '—' : '$' + Number(n).toFixed(2));

/* Fold to lowercase alphanumerics + single spaces, for fuzzy name matching. */
export function norm(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* Unicode-safe base64, for GitHub blob content. */
export function b64encode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
export function b64decode(b64) {
  return decodeURIComponent(escape(atob(b64)));
}
