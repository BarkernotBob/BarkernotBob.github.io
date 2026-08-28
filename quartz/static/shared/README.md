# quartz/static/shared

One implementation of the helpers every app needs, instead of four copy-pasted
ones (GAP-W5, issue #111).

## Why

`ghHeaders()` was byte-identical in grocery and pool. The escaper, the
localStorage accessor, the toast, the modal and the id generator were pasted
into all four. That meant **fixes did not travel**:

- grocery's escaper was hardened to escape `'`; the other three still don't.
- grocery's save path was made safe against two writes landing at once; the
  others were never updated.
- `modal()` detached its overlay before resolving, so any caller reading its
  form fields got `null`. bank-bonus's copy was fixed when its test suite caught
  it — grocery's copy was still carrying the bug, and would have shipped it
  onward to every app that copied from grocery next.

Every future fix had the same problem. Now there is one place to fix.

| Module | Holds |
| --- | --- |
| `dom.js` | `$`, `el` |
| `text.js` | `esc`, `money`, `norm`, `b64encode`, `b64decode` |
| `dates.js` | `DAY_MS`, `todayISO`, `startOfDay`, `daysUntil`, `fmtShortDate` |
| `ids.js` | `uid` |
| `storage.js` | `createStore(prefix, spec)` — builds an app's localStorage accessor |
| `github.js` | `GITHUB_API`, `ghHeaders(token)`, and the shared `OAUTH` config |
| `ui.js` | `toast`, `modal`, `confirmModal`, `openSheet`, `isModalOpen` |

## Two things to know

**`esc()` is not safe for inline event handlers.** It escapes `& < > " '`, which
covers text and quoted attribute values. It does **not** make
`onclick="fn('…')"` safe: a handler attribute is HTML-decoded *before* its
contents are parsed as JavaScript, so `&#39;` turns back into a quote and a
value can still break out of the call. There is no escaping fix for that —
data must not go into inline handlers at all. That is GAP-W4 (#112).

**The OAuth client id and Worker URL are deliberately shared and deliberately
public** (`github.js`). One GitHub OAuth App and one Cloudflare Worker cover
everything under `barkernotbob.github.io/static/*`. The client *secret* stays
server-side in the Worker — that is why the Worker exists. The **scope** those
credentials request at sign-in is a separate, open question: GAP-W3 (#113).

## Who imports it

- **grocery** — via `core/domain.js` and `ui/components.js`, which are now thin
  re-export barrels so the app's ~10 import sites keep their short paths. Don't
  put an implementation back in either file.
- **pool, vehicle, bank-bonus** — not yet. They are single-file apps whose
  behaviour is written inline in the HTML, so they cannot use ES modules until
  those inline handlers are gone. They join as part of GAP-W4 (#112), which is
  exactly the sequencing #111 asks for.

## Offline

The modules sit one directory above each app, outside its service worker's
scope. That is fine, and load-bearing to understand: **scope decides which
pages a worker controls, not which URLs it may intercept.** A controlled page's
request for `/static/shared/*.js` still reaches its worker's fetch handler, so
precaching them in the app's shell list keeps it launching offline. Grocery's
`sw.js` does this, and `tests/grocery/pwa.spec.js` proves it by pulling the
network and cold-starting.
