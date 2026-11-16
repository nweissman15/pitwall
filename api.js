/* OpenF1 client: paced to the free limits (3 requests a second, 30 a minute), cached, optional sign-in. */
(function () {
  const BASE = (function () { try { return localStorage.getItem('pw_api_base'); } catch (e) { return null; } })() || 'https://api.openf1.org';
  const cache = new Map();
  const stamps = [];
  let chain = Promise.resolve();
  let pending = 0;
  const listeners = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function token() {
    try {
      const t = JSON.parse(sessionStorage.getItem('pw_token') || 'null');
      return t && t.exp > Date.now() ? t.value : null;
    } catch (e) { return null; }
  }
  function notify() { listeners.forEach((f) => f(pending)); }

  async function pace() {
    const authed = !!token();
    const gap = authed ? 120 : 380, perMin = authed ? 200 : 27;
    for (;;) {
      const now = Date.now();
      while (stamps.length && now - stamps[0] > 60000) stamps.shift();
      const last = stamps[stamps.length - 1] || 0;
      if (stamps.length >= perMin) { await sleep(60000 - (now - stamps[0]) + 50); continue; }
      if (now - last < gap) { await sleep(gap - (now - last)); continue; }
      stamps.push(Date.now());
      return;
    }
  }

  async function raw(path) {
    for (let attempt = 0; attempt < 4; attempt++) {
      await pace();
      const headers = { accept: 'application/json' };
      const t = token();
      if (t) headers.Authorization = 'Bearer ' + t;
      let res;
      try { res = await fetch(BASE + '/v1/' + path, { headers }); }
      catch (e) { throw new Error('Could not reach the data service. Check your connection and try again.'); }
      if (res.status === 429) { await sleep(1500 * (attempt + 1)); continue; }
      if (res.status === 404) return [];
      let body = null;
      try { body = await res.json(); } catch (e) { /* not JSON */ }
      if (!res.ok) {
        const detail = body && (body.detail || body.error || body.message);
        const msg = typeof detail === 'string' ? detail : '';
        if (res.status === 401 || res.status === 403 || /live|session in progress|authenticat/i.test(msg)) {
          const err = new Error('A session is running right now. Data during a session needs an OpenF1 sign-in (see the Live tab); it becomes free shortly after the session ends.');
          err.live = true; throw err;
        }
        throw new Error('The data service returned an error (' + res.status + ').' + (msg ? ' ' + msg : ''));
      }
      if (Array.isArray(body)) return body;
      if (body && body.detail) return [];
      return body || [];
    }
    throw new Error('The data service is busy. Wait a minute and try again.');
  }

  /* path example: "laps?session_key=9161&driver_number=63". Use op() for comparisons. */
  function get(path, opts) {
    const fresh = opts && opts.fresh;
    if (!fresh && cache.has(path)) return cache.get(path);
    pending++; notify();
    const p = (chain = chain.catch(() => {}).then(() => raw(path)));
    const out = p.finally(() => { pending--; notify(); });
    if (!fresh) { cache.set(path, out); out.catch(() => cache.delete(path)); }
    return out;
  }

  const OPS = { '>=': '%3E%3D', '<=': '%3C%3D', '>': '%3E', '<': '%3C' };
  function op(field, operator, value) { return field + OPS[operator] + encodeURIComponent(value); }

  async function signIn(username, password) {
    const body = new URLSearchParams();
    body.append('username', username); body.append('password', password);
    let res;
    try { res = await fetch(BASE + '/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }); }
    catch (e) { throw new Error('Could not reach OpenF1 to sign in.'); }
    if (!res.ok) throw new Error(res.status === 401 || res.status === 400 ? 'OpenF1 did not accept that username and password.' : 'Sign-in failed (' + res.status + ').');
    const d = await res.json();
    const secs = Number(d.expires_in) || 3600;
    sessionStorage.setItem('pw_token', JSON.stringify({ value: d.access_token, exp: Date.now() + (secs - 60) * 1000 }));
    cache.clear();
  }
  function signOut() { sessionStorage.removeItem('pw_token'); }

  window.F1 = { get, op, signIn, signOut, signedIn: () => !!token(), onLoad: (f) => listeners.push(f) };
})();
