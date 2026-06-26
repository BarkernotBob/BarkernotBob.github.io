/* ===========================================================================
   Grocery Tracker — "Sign in with GitHub" helper (Cloudflare Worker)
   ---------------------------------------------------------------------------
   WHAT THIS IS, in plain words:
   A plain web page (your grocery app) is NOT allowed by the browser to talk to
   GitHub's sign-in system directly. This tiny program sits in the middle and
   passes the messages along, which makes the browser happy.

   WHAT IT CAN SEE: only GitHub's own sign-in handshake. It holds NO passwords,
   NO secret keys, and stores nothing. It just relays two messages.

   You deploy this once, for free, on Cloudflare. Step-by-step instructions are
   in SIGN-IN-SETUP.md (right next to this file).
   =========================================================================== */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
};

export default {
  async fetch(request) {
    // Browser "pre-flight" check — just say yes.
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }
    if (request.method !== 'POST') {
      return new Response('This helper only accepts POST.', { status: 405, headers: CORS });
    }

    const path = new URL(request.url).pathname;
    let target;
    if (path.endsWith('/device/code')) {
      target = 'https://github.com/login/device/code';        // step 1: start sign-in
    } else if (path.endsWith('/access_token')) {
      target = 'https://github.com/login/oauth/access_token';  // step 2: collect the key
    } else {
      return new Response('Not found.', { status: 404, headers: CORS });
    }

    const body = await request.text();
    const ghResp = await fetch(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body,
    });

    const text = await ghResp.text();
    return new Response(text, {
      status: ghResp.status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  },
};
