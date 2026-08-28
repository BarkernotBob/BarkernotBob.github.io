/* =========================================================================
   shared/dates.js — calendar-date helpers.

   Every date in these apps is a calendar date (YYYY-MM-DD), not an instant.
   They are parsed as UTC midnight so they line up with todayISO(), which is
   the UTC calendar date. Parsing at LOCAL midnight instead drifts a day in
   any offset timezone: a this-week bucket loses "today", a use-by countdown
   fires a day early. The owner is in UTC-4/-5, so this is not hypothetical.
   ========================================================================= */

export const DAY_MS = 86400000;

export const todayISO = () => new Date().toISOString().slice(0, 10);

/* Date part only, so a stray time suffix can't turn the parse into NaN. */
export const startOfDay = (iso) => Date.parse(String(iso).slice(0, 10) + 'T00:00:00Z');

export const daysUntil = (iso) => Math.round((startOfDay(iso) - startOfDay(todayISO())) / DAY_MS);

export function fmtShortDate(iso, withYear = false) {
  if (!iso) return '';
  const d = new Date(startOfDay(iso));
  if (isNaN(d)) return '';
  // Formatted in UTC for the same reason it is parsed in UTC — the instant is
  // UTC midnight of the calendar date, and a local -offset zone would render
  // it as the previous day.
  const opts = { month: 'short', day: 'numeric', timeZone: 'UTC' };
  if (withYear) opts.year = 'numeric';
  return d.toLocaleDateString('en-US', opts);
}
