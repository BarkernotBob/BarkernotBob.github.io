/* =========================================================================
   shared/ids.js — record id generation.
   ========================================================================= */

/* `<prefix>_<unix seconds>_<4 random chars>`. Sortable by creation second, and
   the random tail keeps two records made in the same second distinct. */
export function uid(p) {
  return p + '_' + Math.floor(Date.now() / 1000) + '_' + Math.random().toString(36).slice(2, 6);
}
