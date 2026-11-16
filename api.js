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
      if (attempt) await (chain = chain.catch(() => {}).then(pace));
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
  /* Finished sessions never change, so their data is kept in the browser between visits. */
  let dbp = null;
  function db() {
    if (!dbp) dbp = new Promise((res) => {
      try { const r = indexedDB.open('pitwall', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); }
      catch (e) { res(null); }
    });
    return dbp;
  }
  async function kept(path) {
    const d = await db(); if (!d) return null;
    return new Promise((res) => { try { const q = d.transaction('kv').objectStore('kv').get(path); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); } catch (e) { res(null); } });
  }
  async function keep(path, data) {
    const d = await db(); if (!d) return;
    try { d.transaction('kv', 'readwrite').objectStore('kv').put(data, path); } catch (e) { /* storage full or blocked: carry on without it */ }
  }

  /* opts: fresh (skip caches), keep (store between visits), alive() (skip if the caller has moved on).
     Requests start at most three a second but run side by side. */
  function get(path, opts) {
    opts = opts || {};
    const fresh = opts.fresh;
    if (!fresh && cache.has(path)) return cache.get(path);
    pending++; notify();
    const p = (async () => {
      if (opts.keep && !fresh) { const hit = await kept(path); if (hit) return hit; }
      await (chain = chain.catch(() => {}).then(async () => {
        if (opts.alive && !opts.alive()) { const e = new Error('cancelled'); e.cancelled = true; throw e; }
        await pace();
      }));
      const data = await raw(path);
      if (opts.keep && Array.isArray(data) && data.length) keep(path, data);
      return data;
    })();
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
