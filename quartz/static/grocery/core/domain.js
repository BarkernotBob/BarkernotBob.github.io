/* =========================================================================
   core/domain.js — grocery's re-export of the shared helper modules.

   The implementations live ONCE, in quartz/static/shared/ (GAP-W5). This file
   is only a barrel, so grocery's ~10 import sites keep their short paths and a
   fix to an escaper or a date helper reaches every app that imports the same
   modules — which is the whole point of the extraction.

   DO NOT add an implementation here. If a helper is generic it belongs in
   shared/; if it is grocery-specific it belongs in the view that uses it.
   ========================================================================= */

export { $, el } from '../../shared/dom.js';
export { money, esc, norm, b64encode, b64decode } from '../../shared/text.js';
export { DAY_MS, todayISO, startOfDay, daysUntil, fmtShortDate } from '../../shared/dates.js';
export { uid } from '../../shared/ids.js';
