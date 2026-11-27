// Calls to the two serverless functions, /api/runs and /api/coach. The passphrase is kept in localStorage.
/* exported api, KEY */

const KEY = 'rc_key';

async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', 'x-app-key': localStorage.getItem(KEY) || '', ...(opts.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || `error ${r.status}`);
  return j;
}
