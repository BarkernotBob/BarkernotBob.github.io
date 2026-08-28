/* =========================================================================
   shared/storage.js — the per-app localStorage accessor.

   Every app hand-writes the same getter/setter pair per key, differing only in
   its two-letter prefix (gt_ grocery, pl_ pool, bb_ bank-bonus). createStore
   builds them from a spec instead.

   NOTE ON THE TOKENS THESE HOLD: every app is served from the one origin
   barkernotbob.github.io, so gt_token, pl_token and bb_token are all readable
   by any script running on any of these pages. That is the shared risk GAP-W4
   (#112) is about; this module does not change it, it just stops each app
   spelling the accessor out again.
   ========================================================================= */

/* createStore('gt_', { repo: '', token: '', theme: { default: 'system', clearOn: 'system' } })
 *
 * Each entry is either a plain default value, or { default, clearOn }:
 *   default  — returned when the key is absent
 *   clearOn  — writing this value REMOVES the key instead of storing it, so
 *              "system"/"auto" style settings fall back rather than pinning.
 */
export function createStore(prefix, spec) {
  const store = {};
  for (const [name, raw] of Object.entries(spec)) {
    const cfg = raw && typeof raw === 'object' && 'default' in raw ? raw : { default: raw };
    const key = prefix + name;
    Object.defineProperty(store, name, {
      enumerable: true,
      get() {
        // `||`, not a null check: the hand-written accessors this replaces all
        // read `localStorage.getItem(k) || <default>`, so a stored empty string
        // falls back to the default too. Kept exactly, so the extraction cannot
        // change behaviour — which is the one thing it must not do.
        return localStorage.getItem(key) || cfg.default;
      },
      set(v) {
        if ('clearOn' in cfg && v === cfg.clearOn) localStorage.removeItem(key);
        else localStorage.setItem(key, v);
      },
    });
  }
  return store;
}
