# Book club scheduler

Unlisted page where book club members mark when they can meet, how often they
can commit to meeting, and how many hours a week they can read. Everyone sees
the same group calendar.

- **Page:** https://barkernotbob.github.io/static/bookclub/ (source: `quartz/static/bookclub/`).
  It's a static file, so Quartz copies it as-is and it never appears in the sitemap or explorer.
- **Separate clubs:** add `?club=<name>` to the URL (letters, digits, dashes). Default club is `bookclub`.
- **API:** Cloudflare Worker `bookclub-api` at https://bookclub-api.barkernotbob.workers.dev,
  storing members in the D1 database `bookclub` (`1f89617e-198a-4126-aa69-3fb5ebbebf5a`).

## How it works

- "Signing in" = a name plus a 4-digit PIN the person makes up. The worker stores only a salted
  SHA-256 of the PIN. Same name + wrong PIN is refused. The browser remembers name + PIN in
  localStorage so people stay signed in on their device.
- Times are one-hour boxes, Monday–Sunday, 7 AM–11 PM, **Eastern Time** (a banner warns anyone
  whose device is on another time zone).
- Meeting rhythm: each person picks the most often they can commit to (every 2, 3 or 4 weeks).
  The group's rhythm is the least frequent pick.
- Best times: runs of hours where the same people are free throughout, ranked by headcount, then
  length (2 hours counts as a full meeting).

## API

All under `/api/clubs/:club`:

| Method | Path       | Body                                 | Returns                       |
| ------ | ---------- | ------------------------------------ | ----------------------------- |
| GET    | (none)     | —                                    | `{ members }` (no PIN data)   |
| POST   | `/signin`  | `{ name, pin }`                      | `{ member }` or `{ member: null }`; 401 on wrong PIN |
| PUT    | `/members` | `{ name, pin, slots, cadence, hours }` | `{ member }` (creates or updates) |
| DELETE | `/members` | `{ name, pin }`                      | `{ ok: true }`                |

Slots are `"day-hour"` strings, day 0 = Monday. Limits: name ≤ 40 chars, 60 members per club.

## Deploy the worker

```bash
cd bookclub-tool/worker && npx wrangler deploy
```

Wrangler is logged in to Isaiah's Cloudflare account on this Mac. Schema changes:
`npx wrangler d1 execute bookclub --remote --file schema.sql`.

## Local dev

`.claude/launch.json` has `bookclub-api` (wrangler dev, local D1, port 8787) and `bookclub`
(static server on 5178). Off github.io the page talks to `http://127.0.0.1:8787`; `?api=<url>`
overrides that locally (ignored on the live site).

## Tests

`tests/bookclub` (Playwright, desktop + phone, mocked API):

```bash
cd tests/bookclub && npm ci && npx playwright test
```

Peek at or clear real data:
`npx wrangler d1 execute bookclub --remote --command "SELECT club, name, updated_at FROM members"`.
