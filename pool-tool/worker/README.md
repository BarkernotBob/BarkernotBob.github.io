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
