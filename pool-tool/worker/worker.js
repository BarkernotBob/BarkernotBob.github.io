/* =========================================================================
   Pool Care — GitHub sign-in helper (Cloudflare Worker)
   -------------------------------------------------------------------------
   This tiny server does ONE job: the secure half of "Sign in with GitHub."

   The app page (static HTML) can't safely hold the OAuth App's *secret*, so it
   sends the temporary `code` GitHub hands back after you approve sign-in to
   THIS worker. The worker swaps that code for an access token using the secret
   (which lives only here, never in the website), and returns the token.

   It holds no data and stores nothing. Two secrets are configured in the
   Cloudflare dashboard (Settings → Variables), never in this file:
     GITHUB_CLIENT_ID      — your OAuth App's Client ID
     GITHUB_CLIENT_SECRET  — your OAuth App's Client secret

   Deploy steps are in ../SETUP.md (Step 3).
   ========================================================================= */

// Only your website is allowed to call this worker.
const ALLOWED_ORIGIN = 'https://barkernotbob.github.io';

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    if (request.method !== 'POST' || !url.pathname.endsWith('/exchange')) {
      return new Response('Pool Care auth worker is running. POST /exchange { code }.', { status: 200, headers: cors });
    }

    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'bad_request' }, 400, cors); }
    if (!body || !body.code) return json({ error: 'missing_code' }, 400, cors);

    const params = new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code: body.code,
    });
    if (body.redirect_uri) params.set('redirect_uri', body.redirect_uri);

    let data;
    try {
      const r = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      data = await r.json();
    } catch (e) {
      return json({ error: 'github_unreachable' }, 502, cors);
    }

    // data is either { access_token, ... } or { error, error_description }
    return json(data, 200, cors);
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
