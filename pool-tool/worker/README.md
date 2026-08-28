# Pool Care auth worker

A tiny Cloudflare Worker that completes "Sign in with GitHub" for the Pool Care
app. It swaps the temporary OAuth `code` for an access token using the OAuth App
secret, so the static website never has to hold that secret.

- **Code:** [`worker.js`](./worker.js)
- **Deploy / configure:** see [`../SETUP.md`](../SETUP.md) Step 3.
- **Holds no data.** Stores nothing. Only talks to `github.com/login/oauth/access_token`.

## Configuration (Cloudflare → Settings → Variables, as encrypted Secrets)
| Name | Value |
|---|---|
| `GITHUB_CLIENT_ID` | OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | OAuth App Client secret |

## Endpoint
`POST /exchange` with JSON `{ "code": "...", "redirect_uri": "..." }` →
returns GitHub's `{ "access_token": "..." }` (or `{ "error": "..." }`).

Only requests from `https://barkernotbob.github.io` are allowed (CORS); change
`ALLOWED_ORIGIN` in `worker.js` if the site URL ever changes.

## Deploying via CLI instead of the dashboard (optional)
```sh
npm i -g wrangler
wrangler login
wrangler deploy worker.js --name pool-auth
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
```

---

## Note on scope (GAP-W3, 2026-08-28)

The authorize URL this Worker serves still requests `scope=repo`, which is full
read/write to **every** private repository on the account. That is not an oversight
and it is not fixable here: the sign-in is a **classic GitHub OAuth App**, and classic
OAuth Apps offer only `public_repo` (useless for private data repos) and `repo`
(everything). There is no per-repository scope to downgrade to.

So the apps no longer steer people to this route. Their setup screens now recommend a
**fine-grained personal access token restricted to the one data repo**, and present
"Sign in with GitHub" as a clearly-labelled fallback that says what it asks for.

The Worker itself was deliberately left alone — the audit found it well built (the
client secret stays server-side, the origin is locked down, nothing is stored). The
problem was never the Worker; it was the breadth of what was being asked for.

Full reasoning, including what moving to a GitHub App would take:
[`DECISION-github-access-scope.md`](../../DECISION-github-access-scope.md).
