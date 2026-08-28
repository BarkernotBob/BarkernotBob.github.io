/* =========================================================================
   shared/github.js — GitHub request plumbing.

   The apps use GitHub as their database: each one reads and writes JSON in the
   owner's own private data repo. The audit was explicit that this design is a
   STRENGTH, not a problem to solve — this module exists to stop the plumbing
   being copy-pasted, not to replace the approach.
   ========================================================================= */

export const GITHUB_API = 'https://api.github.com';

/* The one GitHub OAuth App and the one Cloudflare Worker that cover every app
 * under barkernotbob.github.io/static/*. Deliberately shared, and deliberately
 * in the client: both values are PUBLIC, not secrets. The client secret stays
 * server-side in the Worker, which is why the Worker exists at all.
 *
 * This is the single place these live. Anything else that needs them imports
 * from here — they used to be duplicated in grocery/app.js and pool/index.html,
 * which is how a change to one silently failed to reach the other.
 *
 * Worker source and setup: pool-tool/worker/.
 *
 * NOTE: the scope this app requests at sign-in is a separate question, and a
 * live one — see GAP-W3 (#113), which is about asking for less than `repo`.
 */
export const OAUTH = Object.freeze({
  clientId: 'Ov23lirmVUCJFsZgphQC',
  workerUrl: 'https://pool-auth.barkernotbob.workers.dev',
});

export const oauthReady = () => Boolean(OAUTH.clientId && OAUTH.workerUrl);

/* Headers for an authenticated GitHub API call. The token is passed in rather
   than read from storage, so this module never has to know an app's key prefix. */
export function ghHeaders(token) {
  return {
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}
