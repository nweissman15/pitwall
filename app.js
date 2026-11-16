(function () {
  const $ = (id) => document.getElementById(id);
  const C = window.Charts, get = F1.get, op = F1.op;
  const NOW = () => Date.now();
  const THIS_YEAR = new Date().getUTCFullYear();
  const YEARS = d3.range(THIS_YEAR, 2022, -1);

  /* ---------- helpers ---------- */
  const pd = (s) => s ? new Date(String(s).replace(/(\.\d{3})\d+/, '$1')) : null;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  function fmtLap(sec) {
    if (sec == null || isNaN(sec)) return '–';
    const m = Math.floor(sec / 60), s = sec - m * 60;
    return (m ? m + ':' + (s < 10 ? '0' : '') : '') + s.toFixed(3);
  }
  function fmtRace(sec) {
    if (sec == null || isNaN(sec)) return '–';
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + (s < 10 ? '0' : '') + s.toFixed(3);
  }
  const lastOf = (v) => Array.isArray(v) ? v.filter((x) => x != null).pop() : v;
  const dayFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const whenFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  function dname(d, n) {
    if (!d) return '#' + n;
    if (d.first_name && d.last_name) return d.first_name + ' ' + d.last_name;
    return d.full_name || d.broadcast_name || '#' + n;
  }
  const dcode = (d, n) => (d && d.name_acronym) || '#' + n;
  function fill(sel, items, value) {
    sel.replaceChildren(...items.map((i) => new Option(i.label, i.value)));
    if (value != null && items.some((i) => String(i.value) === String(value))) sel.value = String(value);
  }
  const isRealMeeting = (m) => !/testing/i.test(m.meeting_name || '') && !m.is_cancelled;
  const yearData = async (y) => {
    const [sessions, meetings] = await Promise.all([get('sessions?year=' + y), get('meetings?year=' + y)]);
    sessions.sort((a, b) => pd(a.date_start) - pd(b.date_start));
    meetings.sort((a, b) => pd(a.date_start) - pd(b.date_start));
    return { sessions: sessions.filter((s) => !s.is_cancelled), meetings };
  };
  /* Without a sign-in, a session can be opened once it has ended. */
  const ready = (s) => F1.signedIn() ? pd(s.date_start) < NOW() : pd(s.date_end) < NOW();
  const driverMap = (rows) => { const m = new Map(); rows.forEach((d) => m.set(d.driver_number, d)); return m; };

  /* ---------- links: the address carries the view so it can be shared ---------- */
  function linkParams() { const h = location.hash, i = h.indexOf('?'); return new URLSearchParams(i < 0 ? '' : h.slice(i + 1)); }
  function setLink() {
    const q = new URLSearchParams();
    if (current === 'season') q.set('y', season.year);
    if (current === 'drivers') { q.set('y', drv.year); if (drv.n) q.set('d', drv.n); }
    if ((current === 'session' || current === 'telemetry') && S.session) {
      q.set('y', S.year); q.set('m', S.session.meeting_key); q.set('s', S.session.session_key);
      if (current === 'session') q.set('d', S.selected.join('.'));
      else if (tel.last) { q.set('a', tel.last.A.n); q.set('la', tel.last.A.lap.lap_number); if (tel.last.B) { q.set('b', tel.last.B.n); q.set('lb', tel.last.B.lap.lap_number); } }
    }
    const s = q.toString();
    history.replaceState(null, '', '#' + current + (s ? '?' + s : ''));
  }

  /* ---------- Season ---------- */
  const season = { year: THIS_YEAR, data: null };
  async function loadSeason() {
    const y = season.year;
    $('season-title').textContent = y + ' season';
    $('season-lede').textContent = 'Loading the ' + y + ' season…';
    ['chart-drivers', 'chart-teams'].forEach((id) => C.note($(id), 'Loading…'));
    $('calendar').tBodies[0].replaceChildren();
    try {
      const { sessions, meetings } = await yearData(y);
      const races = sessions.filter((s) => s.session_name === 'Race');
      const done = races.filter((s) => pd(s.date_end) < NOW());
      const last = done[done.length - 1];
      let cd = [], ct = [], drivers = new Map(), winners = [];
      if (last) {
        const minKey = d3.min(sessions, (s) => s.session_key);
        const r = await Promise.all([
          get('championship_drivers?session_key=' + last.session_key).catch(() => []),
          get('championship_teams?session_key=' + last.session_key).catch(() => []),
          get('drivers?session_key=' + last.session_key).catch(() => []),
          get('session_result?position=1&' + op('session_key', '>=', minKey)).catch(() => [])]);
        cd = r[0]; ct = r[1]; drivers = driverMap(r[2]); winners = r[3];
      }
      if (season.year !== y) return;
      season.data = { sessions, meetings, races, done, last, cd, ct, drivers, winners };
      renderSeason(); if (current === 'season') setLink();
    } catch (e) {
      $('season-lede').textContent = e.message;
      ['chart-drivers', 'chart-teams'].forEach((id) => C.note($(id), 'Not loaded.', true));
    }
  }
  function renderSeason() {
    const D = season.data; if (!D) return;
    const pts = (r) => r.points_current != null ? r.points_current : r.points_start;
    const cd = D.cd.filter((r) => pts(r) != null).sort((a, b) => pts(b) - pts(a));
    const ct = D.ct.filter((r) => pts(r) != null).sort((a, b) => pts(b) - pts(a));
    const teamColor = new Map(); D.drivers.forEach((d) => teamColor.set(d.team_name, C.ink(d.team_colour)));
    const lastMeeting = D.last && D.meetings.find((m) => m.meeting_key === D.last.meeting_key);
    const after = lastMeeting ? 'After the ' + lastMeeting.meeting_name : '';
    $('drivers-sub').textContent = cd.length ? after + ', points scorers only' : '';
    $('teams-sub').textContent = ct.length ? after : '';
    const none = D.last ? 'OpenF1 has no championship table for this season.' : 'No race has finished yet this season.';
    C.hbars($('chart-drivers'), cd.filter((r) => pts(r) > 0).map((r, i) => {
      const d = D.drivers.get(r.driver_number);
      return { label: dname(d, r.driver_number), value: pts(r), color: C.ink(d && d.team_colour),
        tip: [{ label: 'Position', value: 'P' + (i + 1) }, { label: 'Team', value: (d && d.team_name) || '–' }, { label: 'Points', value: d3.format(',')(pts(r)) },
          { label: 'Scored at this race', value: r.points_start != null ? '+' + (pts(r) - r.points_start) : '–' }] };
    }), { aria: 'Drivers\' championship points', empty: none });
    C.hbars($('chart-teams'), ct.map((r, i) => ({ label: r.team_name, value: pts(r), color: teamColor.get(r.team_name) || '#8a919d',
      tip: [{ label: 'Position', value: 'P' + (i + 1) }, { label: 'Points', value: d3.format(',')(pts(r)) }] })),
    { aria: 'Constructors\' championship points', empty: none });

    const lede = $('season-lede'); lede.replaceChildren();
    const rounds = D.meetings.filter(isRealMeeting);
    const next = D.races.find((s) => pd(s.date_end) >= NOW());
    if (cd.length > 1) {
      const a = D.drivers.get(cd[0].driver_number), b = D.drivers.get(cd[1].driver_number);
      lede.append(el('b', '', dname(a, cd[0].driver_number)), (next ? ' leads' : ' won') + ' the drivers\' championship on ', el('b', '', pts(cd[0]) + ' points'),
        ', ' + (pts(cd[0]) - pts(cd[1])) + ' ahead of ' + dname(b, cd[1].driver_number) + ', after ' + D.done.length + ' of ' + D.races.length + ' races. ');
    } else if (D.last) lede.append(D.done.length + ' of ' + D.races.length + ' races are complete. ');
    else lede.append('The ' + season.year + ' season has not started. ');
    if (next) { const m = D.meetings.find((x) => x.meeting_key === next.meeting_key); lede.append('Next race: ', el('b', '', (m ? m.meeting_name : next.country_name)), ', ' + whenFmt.format(pd(next.date_start)) + ' your time.'); }

    const raceByMeeting = new Map(D.races.map((s) => [s.meeting_key, s]));
    const winBySession = new Map(D.winners.map((w) => [w.session_key, w]));
    const tb = $('calendar').tBodies[0]; tb.replaceChildren();
    rounds.forEach((m, i) => {
      const tr = el('tr'); const race = raceByMeeting.get(m.meeting_key);
      const w = race && winBySession.get(race.session_key);
      const started = D.sessions.some((x) => x.meeting_key === m.meeting_key && ready(x));
      if (next && race && race.session_key === next.session_key) tr.className = 'next';
      const win = el('td');
      if (w) { const d = D.drivers.get(w.driver_number); const bar = el('span', 'bar'); bar.style.background = C.ink(d && d.team_colour); win.append(bar, dname(d, w.driver_number)); }
      else { win.className = 'muted'; win.textContent = race && pd(race.date_end) < NOW() ? '–' : 'To come'; }
      const open = el('td');
      if (started) { const b = el('button', 'linkbtn', 'Open'); b.setAttribute('aria-label', 'Open ' + m.meeting_name); b.onclick = () => openMeeting(season.year, m.meeting_key); open.appendChild(b); }
      tr.append(el('td', 'muted', i + 1), el('td', '', m.meeting_name), el('td', 'muted', m.circuit_short_name || m.location || ''),
        el('td', '', dayFmt.format(pd(m.date_start)) + (m.date_end ? ' – ' + dayFmt.format(pd(m.date_end)) : '')), win, open);
      tb.appendChild(tr);
    });
  }

  /* ---------- Race weekend ---------- */
  const S = { year: THIS_YEAR, meetings: [], sessions: [], session: null, data: null, selected: [], want: null, wantTel: null, started: false };
  async function initPickers() {
    S.started = true;
    try {
      const { sessions, meetings } = await yearData(S.year);
      S.sessions = sessions; S.meetings = meetings.filter((m) => sessions.some((s) => s.meeting_key === m.meeting_key && ready(s)));
      if (!S.meetings.length) { fill($('sel-meeting'), []); fill($('sel-session'), []); S.session = null; S.data = null; $('session-lede').textContent = 'No sessions have run yet in ' + S.year + '.'; return; }
      const wantM = S.want && S.want.meeting;
      const mk = wantM && S.meetings.some((m) => m.meeting_key === wantM) ? wantM : S.meetings[S.meetings.length - 1].meeting_key;
      fill($('sel-meeting'), S.meetings.map((m) => ({ label: m.meeting_name, value: m.meeting_key })), mk);
      pickMeeting();
    } catch (e) { $('session-lede').textContent = e.message; }
  }
  function pickMeeting() {
    const mk = +$('sel-meeting').value;
    const list = S.sessions.filter((s) => s.meeting_key === mk && ready(s));
    const ws = S.want && S.want.session;
    const def = list.find((s) => s.session_key === ws) || list.find((s) => s.session_name === 'Race') || list[list.length - 1];
    fill($('sel-session'), list.map((s) => ({ label: s.session_name, value: s.session_key })), def && def.session_key);
    loadSession();
  }
  async function loadSession() {
    const key = +$('sel-session').value;
    const want = S.want; S.want = null;
    const s = S.sessions.find((x) => x.session_key === key);
    if (!s) return;
    S.wantTel = want && want.tel ? want.tel : null;
    S.session = s; S.data = null; tel.loadedFor = null;
    const m = S.meetings.find((x) => x.meeting_key === s.meeting_key);
    $('session-title').textContent = (m ? m.meeting_name : s.country_name);
    $('session-lede').textContent = 'Loading ' + s.session_name.toLowerCase() + '…';
    const alive = () => !!S.session && S.session.session_key === key;
    const o = { keep: true, alive }, k = 'session_key=' + key, isRaceType = s.session_type === 'Race';
    const soft = (p) => get(p, o).catch((e) => { if (e.live || e.cancelled) throw e; return []; });
    try {
      /* first the essentials, so the classification and lap times appear quickly */
      const [drivers, results, laps] = await Promise.all([get('drivers?' + k, o), soft('session_result?' + k), get('laps?' + k, o)]);
      if (!alive()) return;
      const dm = driverMap(drivers);
      const best = new Map();
      laps.forEach((l) => { if (l.lap_duration != null && (!best.has(l.driver_number) || l.lap_duration < best.get(l.driver_number))) best.set(l.driver_number, l.lap_duration); });
      const order = results.length ? results.slice().sort((a, b) => (a.position == null) - (b.position == null) || a.position - b.position)
        : drivers.map((d) => ({ driver_number: d.driver_number, position: null }));
      const D = S.data = { key, dm, results: order, hasResults: results.length > 0, laps, best, isRace: isRaceType, ready: false,
        stints: [], pits: [], weather: [], pos: [], rc: null, overtakes: isRaceType ? null : [], radio: null, asked: {} };
      const asked = want && want.drivers ? want.drivers.filter((n) => dm.has(n)).slice(0, 6) : [];
      S.selected = asked.length ? asked : order.slice(0, 4).map((r) => r.driver_number);
      renderSession(); if (current === 'session') setLink();
      if (current === 'telemetry') initTelemetry();
      /* then strategy, stops, positions and weather */
      const [stints, pits, pos, weather] = await Promise.all([soft('stints?' + k), soft('pit?' + k), isRaceType || !results.length ? soft('position?' + k) : [], soft('weather?' + k)]);
      if (!alive()) return;
      Object.assign(D, { stints, pits, pos, weather, ready: true });
      if (!D.hasResults) {
        const lastPos = new Map(); pos.forEach((p) => lastPos.set(p.driver_number, p.position));
        D.results = drivers.map((d) => ({ driver_number: d.driver_number, position: lastPos.get(d.driver_number) })).sort((a, b) => (a.position || 99) - (b.position || 99));
      }
      renderSession(); lazyCheck();
    } catch (e) {
      if (e.cancelled || !alive()) return;
      $('session-lede').textContent = e.message;
    }
  }
  /* Radio, overtakes and race control are fetched only when their panel scrolls into view. */
  const LAZY = [['rc', 'race-control', 'race_control'], ['overtakes', 'chart-overtakes', 'overtakes'], ['radio', 'team-radio', 'team_radio']];
  function lazyCheck() {
    const D = S.data; if (!D || !D.ready || current !== 'session') return;
    LAZY.forEach(([field, id, endpoint]) => {
      if (D[field] !== null || D.asked[field]) return;
      const r = $(id).getBoundingClientRect();
      if (r.width === 0 || r.top > innerHeight + 300 || r.bottom < -300) return;
      D.asked[field] = true;
      get(endpoint + '?session_key=' + D.key, { keep: true, alive: () => S.data === D }).catch(() => []).then((rows) => { if (S.data !== D) return; D[field] = rows; renderSession(); });
    });
  }
  function seriesStyle() {
    const D = S.data, seen = new Map(), out = new Map();
    S.selected.forEach((n) => {
      const d = D.dm.get(n), team = (d && d.team_name) || n;
      out.set(n, { color: C.ink(d && d.team_colour), dash: seen.has(team), name: dcode(d, n) });
      seen.set(team, true);
    });
    return out;
  }
  function legend(id, items) {
    const box = $(id); box.replaceChildren();
    items.forEach((it) => { const s = el('span'); const i = el('i', it.box ? 'box' : it.dash ? 'dash' : ''); if (it.box) i.style.background = it.color; else i.style.borderTopColor = it.color; s.append(i, it.label); box.appendChild(s); });
  }
  function renderSession() {
    const D = S.data, s = S.session; if (!D) return;
    const overall = d3.min([...D.best.values()]);
    /* lede */
    const lede = $('session-lede'); lede.replaceChildren();
    const first = D.results[0], fd = first && D.dm.get(first.driver_number);
    const fastest = [...D.best.entries()].sort((a, b) => a[1] - b[1])[0];
    lede.append(s.session_name + ', ' + whenFmt.format(pd(s.date_start)) + ' your time. ');
    if (first && D.hasResults) lede.append(el('b', '', dname(fd, first.driver_number)), D.isRace ? ' won. ' : ' was fastest. ');
    if (fastest) lede.append('Fastest lap: ', el('b', '', fmtLap(fastest[1])), ' by ' + dname(D.dm.get(fastest[0]), fastest[0]) + '.');
    /* weather tiles */
    const wt = $('weather-tiles'); wt.replaceChildren();
    if (D.weather.length) {
      const rng = (f) => { const e = d3.extent(D.weather, (w) => w[f]); return e[0] == null ? null : e; };
      const tile = (k, v, d) => { const t = el('div', 'tile'); t.append(el('div', 'k', k), el('div', 'v', v), el('div', 'd', d || '')); wt.appendChild(t); };
      const air = rng('air_temperature'), trk = rng('track_temperature'), hum = rng('humidity'), wind = rng('wind_speed');
      const f1 = (v) => (+v).toFixed(1);
      if (air) tile('Air temperature', f1(d3.mean(D.weather, (w) => w.air_temperature)) + ' °C', f1(air[0]) + ' to ' + f1(air[1]) + ' °C');
      if (trk) tile('Track temperature', f1(d3.mean(D.weather, (w) => w.track_temperature)) + ' °C', f1(trk[0]) + ' to ' + f1(trk[1]) + ' °C');
      if (hum) tile('Humidity', Math.round(d3.mean(D.weather, (w) => w.humidity)) + '%', Math.round(hum[0]) + ' to ' + Math.round(hum[1]) + '%');
      if (wind) tile('Wind', f1(d3.mean(D.weather, (w) => w.wind_speed)) + ' m/s', 'up to ' + f1(wind[1]) + ' m/s');
      const wet = D.weather.filter((w) => w.rainfall > 0).length;
      tile('Rain', wet ? 'Yes' : 'None', wet ? 'in ' + Math.round(100 * wet / D.weather.length) + '% of readings' : 'dry throughout');
    }
    /* classification */
    const stops = d3.rollup(D.pits, (v) => v.length, (p) => p.driver_number);
    const tb = $('results').tBodies[0]; tb.replaceChildren();
    D.results.forEach((r, i) => {
      const d = D.dm.get(r.driver_number), tr = el('tr');
      const who = el('td'); const bar = el('span', 'bar'); bar.style.background = C.ink(d && d.team_colour); who.append(bar, dname(d, r.driver_number));
      let gap = '–';
      if (r.dsq) gap = 'DSQ'; else if (r.dns) gap = 'DNS'; else if (r.dnf) gap = 'DNF';
      else if (i === 0 && r.duration != null) { const v = lastOf(r.duration); gap = D.isRace ? fmtRace(v) : fmtLap(v); }
      else if (r.gap_to_leader != null) { const g = lastOf(r.gap_to_leader); gap = typeof g === 'number' ? '+' + g.toFixed(3) : String(g == null ? '–' : g); }
      const b = D.best.get(r.driver_number);
      const bl = el('td', 'num' + (b != null && b === overall ? ' best' : ''), fmtLap(b));
      if (b != null && b === overall) bl.title = 'Fastest lap of the session';
      tr.append(el('td', 'muted', r.position != null ? r.position : '–'), who, el('td', 'muted', (d && d.team_name) || ''), el('td', 'num', r.number_of_laps != null ? r.number_of_laps : (d3.max(D.laps.filter((l) => l.driver_number === r.driver_number), (l) => l.lap_number) || '–')),
        el('td', 'num', gap), bl, el('td', 'num', !D.isRace ? '–' : D.ready ? (stops.get(r.driver_number) || 0) : '…'));
      tb.appendChild(tr);
    });
    /* chips */
    const chips = $('driver-chips'); chips.replaceChildren();
    D.results.forEach((r) => {
      const d = D.dm.get(r.driver_number), b = el('button', 'chip'); b.type = 'button';
      const on = S.selected.includes(r.driver_number);
      b.setAttribute('aria-pressed', on); b.title = dname(d, r.driver_number);
      const bar = el('span', 'bar'); bar.style.background = C.ink(d && d.team_colour); b.append(bar, dcode(d, r.driver_number));
      b.onclick = () => {
        if (on) S.selected = S.selected.filter((n) => n !== r.driver_number);
        else if (S.selected.length < 6) S.selected.push(r.driver_number); else return;
        renderSession(); setLink();
      };
      chips.appendChild(b);
    });
    renderSessionCharts();
    /* best sectors and speed trap */
    const who = (n) => { const d = D.dm.get(n), td = el('td'), bar = el('span', 'bar'); bar.style.background = C.ink(d && d.team_colour); td.append(bar, dname(d, n)); return td; };
    const agg = new Map();
    D.laps.forEach((l) => {
      const o = agg.get(l.driver_number) || { s1: null, s2: null, s3: null, st: null };
      [['s1', l.duration_sector_1], ['s2', l.duration_sector_2], ['s3', l.duration_sector_3]].forEach(([k, v]) => { if (v != null && (o[k] == null || v < o[k])) o[k] = v; });
      if (l.st_speed != null && (o.st == null || l.st_speed > o.st)) o.st = l.st_speed;
      agg.set(l.driver_number, o);
    });
    const vals = [...agg.values()];
    const bestOf = (k, max) => (max ? d3.max : d3.min)(vals, (o) => o[k]);
    const ideal = (o) => o.s1 != null && o.s2 != null && o.s3 != null ? o.s1 + o.s2 + o.s3 : null;
    const bS = { s1: bestOf('s1'), s2: bestOf('s2'), s3: bestOf('s3'), st: bestOf('st', true), id: d3.min(vals, ideal) };
    const sb = $('sectors').tBodies[0]; sb.replaceChildren();
    D.results.forEach((r) => {
      const o = agg.get(r.driver_number); if (!o) return;
      const cell = (v, best, f) => el('td', 'num' + (v != null && v === best ? ' best' : ''), v == null ? '–' : f(v));
      const tr = el('tr'), b = D.best.get(r.driver_number);
      tr.append(who(r.driver_number), cell(o.s1, bS.s1, (v) => v.toFixed(3)), cell(o.s2, bS.s2, (v) => v.toFixed(3)), cell(o.s3, bS.s3, (v) => v.toFixed(3)),
        cell(ideal(o), bS.id, fmtLap), cell(b, overall, fmtLap), cell(o.st, bS.st, (v) => Math.round(v) + ' km/h'));
      sb.appendChild(tr);
    });
    /* pit stops */
    const pb = $('pits').tBodies[0]; pb.replaceChildren();
    const lane = (p) => p.lane_duration != null ? p.lane_duration : p.pit_duration;
    const stopsList = D.pits.filter((p) => lane(p) != null || p.stop_duration != null).sort((x, y) => (lane(x) == null) - (lane(y) == null) || lane(x) - lane(y));
    const quick = d3.min(stopsList, (p) => p.stop_duration);
    stopsList.forEach((p) => { const tr = el('tr'); tr.append(who(p.driver_number), el('td', 'num', p.lap_number != null ? p.lap_number : '–'),
      el('td', 'num' + (p.stop_duration != null && p.stop_duration === quick ? ' best' : ''), p.stop_duration != null ? p.stop_duration.toFixed(1) + ' s' : '–'), el('td', 'num', lane(p) != null ? lane(p).toFixed(1) + ' s' : '–')); pb.appendChild(tr); });
    if (!stopsList.length) { const tr = el('tr'), td = el('td', 'muted', D.ready ? 'No pit stop times for this session.' : 'Loading…'); td.colSpan = 4; tr.appendChild(td); pb.appendChild(tr); }
    /* team radio */
    const rf = $('team-radio'); rf.replaceChildren();
    const clips = (D.radio || []).filter((c) => S.selected.includes(c.driver_number) && /^https:\/\//.test(c.recording_url || '')).sort((x, y) => pd(y.date) - pd(x.date)).slice(0, 40);
    if (!clips.length) rf.appendChild(el('li', 'muted', D.radio === null ? 'Loading…' : S.selected.length ? 'No radio clips published for these drivers.' : 'Choose a driver above.'));
    clips.forEach((c) => { const li = el('li'), au = document.createElement('audio'); au.controls = true; au.preload = 'none'; au.src = c.recording_url;
      au.setAttribute('aria-label', 'Radio from ' + dname(D.dm.get(c.driver_number), c.driver_number));
      li.append(el('time', '', pd(c.date).toISOString().slice(11, 16)), el('span', '', dcode(D.dm.get(c.driver_number), c.driver_number)), au); rf.appendChild(li); });
    /* race control */
    const feed = $('race-control'); feed.replaceChildren();
    const msgs = (D.rc || []).slice().sort((a, b) => pd(b.date) - pd(a.date)).slice(0, 250);
    if (!msgs.length) feed.appendChild(el('li', 'muted', D.rc === null ? 'Loading…' : 'No race control messages for this session.'));
    msgs.forEach((m) => {
      const li = el('li'); const t = el('time', '', m.lap_number ? 'Lap ' + m.lap_number : pd(m.date).toISOString().slice(11, 16));
      const f = el('span', 'flag ' + String(m.flag || '').split(' ')[0], m.flag ? String(m.flag).toLowerCase() : String(m.category || '').toLowerCase());
      li.append(t, f, el('span', '', m.message || '')); feed.appendChild(li);
    });
  }
  function renderSessionCharts() {
    const D = S.data; if (!D) return;
    $('race-extras').hidden = !D.isRace;
    const st = seriesStyle();
    const lg = S.selected.map((n) => ({ label: dname(D.dm.get(n), n), color: st.get(n).color, dash: st.get(n).dash }));
    legend('legend-laps', lg);
    /* lap times */
    const sel = D.laps.filter((l) => S.selected.includes(l.driver_number) && l.lap_duration != null);
    const cut = D.isRace ? (d3.median(sel, (l) => l.lap_duration) || 0) * 1.07 : (d3.min(sel, (l) => l.lap_duration) || 0) * 1.07;
    const slow = $('show-slow').checked;
    C.lines($('chart-laps'), S.selected.map((n) => ({ ...st.get(n),
      points: sel.filter((l) => l.driver_number === n && (slow || (!l.is_pit_out_lap && l.lap_duration <= cut))).sort((a, b) => a.lap_number - b.lap_number).map((l) => ({ x: l.lap_number, y: l.lap_duration })) })),
    { height: 320, yFmt: fmtLap, xInt: true, xFmt: (v) => String(Math.round(v)), xTip: (v) => 'Lap ' + v, xTitle: 'Lap', aria: 'Lap times by lap for the chosen drivers', empty: S.selected.length ? 'No timed laps for these drivers.' : 'Choose a driver above.' });
    /* gap to leader, from each driver's lap start times */
    $('panel-gaps').hidden = !D.isRace;
    if (D.isRace) {
      legend('legend-gaps', lg);
      const starts = D.laps.filter((l) => l.date_start && l.lap_number > 1).map((l) => ({ n: l.driver_number, lap: l.lap_number, t: +pd(l.date_start) }));
      const lead = d3.rollup(starts, (v) => d3.min(v, (x) => x.t), (x) => x.lap);
      const gs = S.selected.map((n) => ({ ...st.get(n), points: starts.filter((x) => x.n === n).sort((p, q) => p.lap - q.lap).map((x) => ({ x: x.lap - 1, y: (x.t - lead.get(x.lap)) / 1000 })) }));
      const worst = d3.max(gs.flatMap((s) => s.points), (p) => p.y) || 1;
      C.lines($('chart-gaps'), gs, { height: 320, invertY: true, yDomain: [0, worst], yFmt: (v) => v === 0 ? 'Leader' : '+' + v.toFixed(v < 10 ? 1 : 0) + ' s', xInt: true, xFmt: (v) => String(Math.round(v)), xTip: (v) => 'After lap ' + v, xTitle: 'Laps completed',
        aria: 'Gap to the race leader by lap for the chosen drivers', empty: S.selected.length ? 'No lap timing for these drivers.' : 'Choose a driver above.' });
    }
    /* positions */
    $('panel-positions').hidden = !D.isRace || !D.pos.length;
    if (D.isRace && D.pos.length) {
      legend('legend-pos', lg);
      /* The position feed opens long before lights out, so start the clock at the race start:
         the earliest lap 1 start, else lap 2 start less lap 1's time, else the scheduled start. */
      const l1 = d3.min(D.laps.filter((l) => l.lap_number === 1 && l.date_start), (l) => +pd(l.date_start));
      const l2 = d3.min(D.laps.filter((l) => l.lap_number === 2 && l.date_start), (l) => +pd(l.date_start));
      const d1 = d3.median(D.laps.filter((l) => l.lap_number === 1 && l.lap_duration != null), (l) => l.lap_duration);
      const first = d3.min(D.pos, (p) => +pd(p.date)), t1 = d3.max(D.pos, (p) => +pd(p.date));
      let t0 = l1 || (l2 && d1 ? l2 - d1 * 1000 : null) || +pd(S.session.date_start);
      if (!(t0 > first && t0 < t1)) t0 = first;
      const by = d3.group(D.pos, (p) => p.driver_number);
      const series = [...by.entries()].map(([n, rows]) => {
        const all = rows.map((p) => ({ t: +pd(p.date), y: p.position })).sort((a, b) => a.t - b.t);
        const grid = all.filter((p) => p.t <= t0).pop() || all[0];
        const pts = [{ x: 0, y: grid.y }].concat(all.filter((p) => p.t > t0).map((p) => ({ x: (p.t - t0) / 60000, y: p.y })));
        pts.push({ x: (t1 - t0) / 60000, y: pts[pts.length - 1].y });
        const s = st.get(n);
        return s ? { ...s, points: pts } : { name: dcode(D.dm.get(n), n), muted: true, points: pts };
      });
      const maxP = d3.max(D.pos, (p) => p.position) || 20;
      C.lines($('chart-pos'), series, { height: 340, step: true, snap: false, invertY: true, yDomain: [1, maxP], yTickValues: d3.range(1, maxP + 1).filter((v) => v === 1 || v % 5 === 0),
        yFmt: (v) => 'P' + v, xFmt: (v) => Math.round(v) + ' min', xTitle: 'Minutes since the race start', aria: 'Track position over the race for the chosen drivers' });
    }
    /* stints */
    const byD = d3.group(D.stints.filter((x) => x.lap_start != null && x.lap_end != null), (x) => x.driver_number);
    const rows = D.results.filter((r) => byD.has(r.driver_number)).map((r) => ({ label: dcode(D.dm.get(r.driver_number), r.driver_number),
      stints: byD.get(r.driver_number).sort((a, b) => a.stint_number - b.stint_number).map((x) => ({ from: x.lap_start, to: x.lap_end, compound: x.compound, age: x.tyre_age_at_start })) }));
    const comps = [...new Set(D.stints.map((x) => String(x.compound || '').toUpperCase()))].filter(Boolean);
    legend('legend-tyres', comps.map((c) => ({ box: true, color: C.tyre(c)[0], label: C.tyre(c)[1] + ' = ' + c.toLowerCase() })));
    if (D.ready) C.stints($('chart-stints'), rows, d3.max(D.stints, (x) => x.lap_end) || 1, 'Tyre stints by driver and lap'); else C.note($('chart-stints'), 'Loading…');
    if (D.isRace && D.overtakes === null) C.note($('chart-overtakes'), 'Loading…');
    else if (D.isRace) {
      const made = d3.rollup(D.overtakes, (v) => v.length, (o) => o.overtaking_driver_number), lost = d3.rollup(D.overtakes, (v) => v.length, (o) => o.overtaken_driver_number);
      C.hbars($('chart-overtakes'), [...made.entries()].sort((x, y) => y[1] - x[1]).map(([n, v]) => { const d = D.dm.get(n);
        return { label: dcode(d, n), value: v, color: C.ink(d && d.team_colour), tip: [{ label: 'Driver', value: dname(d, n) }, { label: 'Places taken', value: v }, { label: 'Places lost', value: lost.get(n) || 0 }] }; }),
      { aria: 'Overtakes made by each driver', empty: 'No overtake data for this race.' });
    }
  }
  function openMeeting(year, meetingKey) {
    S.year = year; $('sel-year').value = year; S.want = { meeting: meetingKey }; S.started = true;
    location.hash = '#session'; initPickers();
  }

  /* ---------- Telemetry ---------- */
  const tel = { loadedFor: null, last: null };
  const METRICS = [
    { key: 'speed', label: 'Speed', unit: 'km/h', h: 190, fmt: (v) => Math.round(v) + '' },
    { key: 'delta', label: 'Time gap', unit: 's', h: 120, single: true, fmt: (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(3) },
    { key: 'throttle', label: 'Throttle', unit: '%', h: 100, dom: [0, 100], ticks: [0, 50, 100], fmt: (v) => Math.round(v) + '%' },
    { key: 'brake', label: 'Brake', unit: '', h: 70, dom: [0, 100], ticks: [0, 100], step: true, fmt: (v) => v >= 50 ? 'On' : 'Off' },
    { key: 'n_gear', label: 'Gear', unit: '', h: 100, dom: [0, 8], ticks: [0, 2, 4, 6, 8], step: true, fmt: (v) => String(Math.round(v)) },
    { key: 'rpm', label: 'Engine revs', unit: 'rpm', h: 110, fmt: (v) => d3.format(',')(Math.round(v)) }];
  function lapsFor(n) {
    return S.data.laps.filter((l) => l.driver_number === n && l.lap_duration != null && l.date_start).sort((a, b) => a.lap_number - b.lap_number);
  }
  function fillLaps(sel, n) {
    if (!n) return fill(sel, [{ label: 'No lap', value: '' }]);
    const laps = lapsFor(n), best = d3.least(laps, (l) => l.lap_duration);
    fill(sel, laps.map((l) => ({ label: 'Lap ' + l.lap_number + ', ' + fmtLap(l.lap_duration) + (l === best ? ' (fastest)' : ''), value: l.lap_number })), best && best.lap_number);
  }
  async function initTelemetry() {
    if (!S.data) {
      $('tel-context').textContent = 'Loading the latest session…';
      if (!S.started) await initPickers();
      return; /* loadSession calls back here */
    }
    const s = S.session, m = S.meetings.find((x) => x.meeting_key === s.meeting_key);
    $('tel-context').textContent = (m ? m.meeting_name : '') + ', ' + s.session_name + '. Change it under Race weekend.';
    if (tel.loadedFor === s.session_key) { if (tel.last) renderTelemetry(); return; }
    tel.loadedFor = s.session_key; tel.last = null;
    const ds = S.data.results.map((r) => r.driver_number).filter((n) => lapsFor(n).length);
    const items = ds.map((n) => ({ label: dname(S.data.dm.get(n), n), value: n }));
    fill($('tel-a-driver'), items); fill($('tel-b-driver'), [{ label: 'No second driver', value: '' }].concat(items), ds[1] || '');
    const w = S.wantTel; S.wantTel = null;
    if (w && ds.includes(w.a)) $('tel-a-driver').value = w.a;
    if (w && w.b && ds.includes(w.b)) $('tel-b-driver').value = w.b;
    fillLaps($('tel-a-lap'), +$('tel-a-driver').value); fillLaps($('tel-b-lap'), +$('tel-b-driver').value);
    const setLap = (sel, v) => { if (v && [...sel.options].some((o) => o.value === String(v))) sel.value = String(v); };
    if (w) { setLap($('tel-a-lap'), w.la); setLap($('tel-b-lap'), w.lb); }
    $('tel-tiles').replaceChildren(); $('tel-charts').replaceChildren();
    C.note($('tel-charts'), ds.length ? 'Choose drivers and laps, then load.' : 'This session has no timed laps with telemetry.');
    C.note($('tel-map'), '');
    if (ds.length) loadTelemetry();
  }
  /* Corner positions come from the circuit file OpenF1 links to; if it can't be read, the charts simply have no markers. */
  const cornerCache = new Map();
  async function corners(meeting) {
    const u = meeting && meeting.circuit_info_url;
    if (!u || !/^https:\/\//.test(u)) return [];
    if (!cornerCache.has(u)) cornerCache.set(u, fetch(u).then((r) => r.ok ? r.json() : {}).then((j) => (j.corners || [])
      .map((c) => ({ label: String(c.number) + (c.letter || ''), x: c.trackPosition && c.trackPosition.x, y: c.trackPosition && c.trackPosition.y })).filter((c) => isFinite(c.x) && isFinite(c.y))).catch(() => []));
    return cornerCache.get(u);
  }
  async function fetchLap(n, lapNo, withLoc) {
    const lap = S.data.laps.find((l) => l.driver_number === n && l.lap_number === lapNo);
    const t0 = pd(lap.date_start), t1 = new Date(+t0 + lap.lap_duration * 1000);
    const q = 'session_key=' + S.session.session_key + '&driver_number=' + n + '&' + op('date', '>=', t0.toISOString()) + '&' + op('date', '<', t1.toISOString());
    const [car, loc] = await Promise.all([get('car_data?' + q, { keep: true }), withLoc ? get('location?' + q, { keep: true }).catch(() => []) : []]);
    const rows = car.map((c) => ({ ...c, t: +pd(c.date) })).sort((a, b) => a.t - b.t);
    let dist = 0;
    rows.forEach((r, i) => { if (i) dist += ((r.speed + rows[i - 1].speed) / 2 / 3.6) * (r.t - rows[i - 1].t) / 1000; r.dist = dist; });
    const bis = d3.bisector((r) => r.t).center;
    const map = loc.filter((p) => p.x || p.y).map((p) => { const r = rows[bis(rows, +pd(p.date))]; return r ? { x: p.x, y: p.y, speed: r.speed, dist: r.dist, t: +pd(p.date) } : null; }).filter(Boolean).sort((a, b) => a.t - b.t);
    return { n, lap, rows, map, d: S.data.dm.get(n) };
  }
  async function loadTelemetry() {
    const a = +$('tel-a-driver').value, la = +$('tel-a-lap').value, b = +$('tel-b-driver').value, lb = +$('tel-b-lap').value;
    if (!a || !la) return;
    const btn = $('tel-load'); btn.disabled = true;
    C.note($('tel-charts'), 'Loading telemetry…'); C.note($('tel-map'), 'Loading…');
    try {
      const A = await fetchLap(a, la, true);
      const B = b && lb && !(b === a && lb === la) ? await fetchLap(b, lb, false) : null;
      const turns = await corners(S.meetings.find((x) => x.meeting_key === S.session.meeting_key));
      tel.last = { A, B, turns }; renderTelemetry(); if (current === 'telemetry') setLink();
    } catch (e) { C.note($('tel-charts'), e.message, true); C.note($('tel-map'), ''); }
    btn.disabled = false;
  }
  function renderTelemetry() {
    const { A, B, turns } = tel.last; const css = getComputedStyle(document.documentElement);
    const colA = css.getPropertyValue('--a').trim(), colB = css.getPropertyValue('--b').trim();
    const box = $('tel-charts'); box.replaceChildren();
    if (!A.rows.length) { C.note(box, 'OpenF1 has no car data for this lap. Try another lap.'); C.note($('tel-map'), ''); $('tel-tiles').replaceChildren(); return; }
    const sets = [{ L: A, color: colA }].concat(B && B.rows.length ? [{ L: B, color: colB }] : []);
    const nm = (L) => dcode(L.d, L.n) + ' lap ' + L.lap.lap_number;
    /* time gap: B's elapsed time minus A's at the same point on the lap (B's distance scaled to A's lap length) */
    const two = sets.length > 1;
    if (two) {
      const k = B.rows[B.rows.length - 1].dist / (A.rows[A.rows.length - 1].dist || 1), bd = d3.bisector((r) => r.dist).left;
      A.rows.forEach((r) => {
        const d = r.dist * k, i = Math.min(B.rows.length - 1, Math.max(1, bd(B.rows, d))), p = B.rows[i - 1], q = B.rows[i];
        const tb = p.t + (q.dist > p.dist ? (d - p.dist) / (q.dist - p.dist) : 0) * (q.t - p.t);
        r.delta = ((tb - B.rows[0].t) - (r.t - A.rows[0].t)) / 1000;
      });
    } else A.rows.forEach((r) => { r.delta = null; });
    const shown = METRICS.filter((M) => !M.single || two);
    /* place each corner at the nearest point of A's line */
    const marks = A.map.length > 10 ? (turns || []).map((c) => { const p = d3.least(A.map, (q) => (q.x - c.x) ** 2 + (q.y - c.y) ** 2); return { label: c.label, x: p.dist, px: p }; }) : [];
    $('corner-note').hidden = !marks.length;
    /* tiles */
    const tiles = $('tel-tiles'); tiles.replaceChildren();
    const stat = (L) => ({ lap: L.lap.lap_duration, top: d3.max(L.rows, (r) => r.speed), avg: d3.mean(L.rows, (r) => r.speed),
      full: d3.mean(L.rows, (r) => r.throttle >= 99 ? 1 : 0) * 100, brake: d3.mean(L.rows, (r) => r.brake > 0 ? 1 : 0) * 100 });
    const sa = stat(A), sb = sets[1] ? stat(B) : null;
    const tile = (k, f, key) => { const t = el('div', 'tile'); t.style.borderLeftColor = colA; t.append(el('div', 'k', k), el('div', 'v', f(sa[key])), el('div', 'd', sb ? dcode(B.d, B.n) + ': ' + f(sb[key]) : dcode(A.d, A.n))); tiles.appendChild(t); };
    tile('Lap time', fmtLap, 'lap'); tile('Top speed', (v) => Math.round(v) + ' km/h', 'top'); tile('Average speed', (v) => Math.round(v) + ' km/h', 'avg');
    tile('Time at full throttle', (v) => Math.round(v) + '%', 'full'); tile('Time on the brakes', (v) => Math.round(v) + '%', 'brake');
    /* legend + charts */
    const lg = el('div', 'legend'); box.appendChild(lg);
    sets.forEach((s) => { const sp = el('span'); const i = el('i'); i.style.borderTopColor = s.color; sp.append(i, dname(s.L.d, s.L.n) + ', lap ' + s.L.lap.lap_number + ' (' + fmtLap(s.L.lap.lap_duration) + ')'); lg.appendChild(sp); });
    const handles = []; let map = { setDist() {} };
    const bis = d3.bisector((r) => r.dist).center;
    const xMax = d3.max(sets, (s) => s.L.rows[s.L.rows.length - 1].dist);
    shown.forEach((M, mi) => {
      const row = el('div', 'tel-row'); row.appendChild(el('h3', '', M.single ? 'Time gap (s): above zero, ' + dcode(A.d, A.n) + ' is ahead of ' + dcode(B.d, B.n) : M.label + (M.unit ? ' (' + M.unit + ')' : '')));
      const use = M.single ? [{ L: A, color: '#eef0f3' }] : sets;
      const dext = M.single ? d3.extent(A.rows, (r) => r.delta) : null;
      const ch = el('div', 'chart'); ch.style.minHeight = M.h + 'px'; row.appendChild(ch); box.appendChild(row);
      handles.push(C.lines(ch, use.map((s) => ({ name: nm(s.L), color: s.color, points: s.L.rows.filter((r) => r[M.key] != null).map((r) => ({ x: r.dist, y: r[M.key] })) })), {
        height: M.h + (M.key === 'speed' && marks.length ? 12 : 0), marks: M.key === 'speed' ? marks : null, left: 52, zero: M.single, yDomain: M.single ? [Math.min(0, dext[0]), Math.max(0, dext[1])] : M.dom, yTickValues: M.ticks, yTicks: 4, yFmt: M.fmt, step: M.step, labels: false, tip: false, xDomain: [0, xMax],
        xFmt: (v) => d3.format(',')(Math.round(v)) + ' m', xTitle: mi === shown.length - 1 ? 'Distance into the lap' : null,
        aria: M.label + ' by distance into the lap', empty: 'No ' + M.label.toLowerCase() + ' data.',
        onX: (x, ev) => {
          handles.forEach((h) => h.setX(x)); map.setDist(x);
          if (x == null) return C.hideTip();
          const rows = [];
          shown.forEach((Q) => (Q.single ? [{ L: A, color: '#eef0f3' }] : sets).forEach((s) => { const r = s.L.rows[bis(s.L.rows, x)]; if (r && r[Q.key] != null) rows.push({ label: Q.label + (sets.length > 1 && !Q.single ? ' ' + dcode(s.L.d, s.L.n) : ''), value: Q.fmt(r[Q.key]) + (Q.unit && Q.unit !== '%' ? ' ' + Q.unit : ''), color: s.color }); }));
          C.showTip(ev, d3.format(',')(Math.round(x)) + ' m into the lap', rows);
        } }));
    });
    $('map-sub').textContent = dname(A.d, A.n) + '\'s line on lap ' + A.lap.lap_number + ', brighter where the car is faster.';
    map = C.trackMap($('tel-map'), A.map, 'Track map coloured by speed', marks.map((k) => ({ label: k.label, x: k.px.x, y: k.px.y })));
  }

  /* ---------- Drivers ---------- */
  const drv = { year: THIS_YEAR, n: null, base: null, data: null, started: false };
  async function initDrivers() {
    drv.started = true; drv.data = null;
    $('drv-lede').textContent = 'Loading drivers…';
    try {
      const y = drv.year, { sessions, meetings } = await yearData(y);
      const done = sessions.filter((s) => s.session_name === 'Race' && pd(s.date_end) < NOW());
      const last = done[done.length - 1];
      if (!last) { fill($('drv-driver'), []); $('drv-lede').textContent = 'No race has finished yet in ' + y + '.'; return; }
      const list = await get('drivers?session_key=' + last.session_key);
      if (drv.year !== y) return;
      list.sort((p, q) => String(p.last_name || '').localeCompare(String(q.last_name || '')));
      drv.base = { sessions, meetings, list, minKey: d3.min(sessions, (s) => s.session_key) };
      fill($('drv-driver'), list.map((d) => ({ label: dname(d, d.driver_number), value: d.driver_number })), drv.n);
      drv.n = +$('drv-driver').value;
      loadDriver();
    } catch (e) { $('drv-lede').textContent = e.message; }
  }
  async function loadDriver() {
    const n = drv.n, B = drv.base; if (!B || !n) return;
    const me = B.list.find((d) => d.driver_number === n), mate = B.list.find((d) => d.driver_number !== n && d.team_name === (me && me.team_name));
    $('drv-title').textContent = dname(me, n);
    $('drv-lede').textContent = 'Loading the season…';
    try {
      const since = op('session_key', '>=', B.minKey);
      const [res, pts, mres] = await Promise.all([get('session_result?driver_number=' + n + '&' + since),
        get('championship_drivers?driver_number=' + n + '&' + since).catch(() => []),
        mate ? get('session_result?driver_number=' + mate.driver_number + '&' + since).catch(() => []) : []]);
      if (drv.n !== n) return;
      drv.data = { me, mate, res, pts, mres }; renderDriver(); if (current === 'drivers') setLink();
    } catch (e) { $('drv-lede').textContent = e.message; }
  }
  function renderDriver() {
    const D = drv.data, B = drv.base; if (!D) return;
    const byKey = (rows) => new Map(rows.map((r) => [r.session_key, r]));
    const mine = byKey(D.res), theirs = byKey(D.mres);
    const rounds = B.meetings.filter(isRealMeeting).map((m, i) => {
      const ss = B.sessions.filter((s) => s.meeting_key === m.meeting_key);
      const race = ss.find((s) => s.session_name === 'Race'), quali = ss.find((s) => s.session_name === 'Qualifying');
      return { rd: i + 1, m, race: race && mine.get(race.session_key), quali: quali && mine.get(quali.session_key), mateRace: race && theirs.get(race.session_key), mateQuali: quali && theirs.get(quali.session_key), over: race && pd(race.date_end) < NOW() };
    }).filter((r) => r.over);
    const fin = (r) => r && r.position != null ? r.position : null;
    const label = (r) => !r ? '–' : r.dsq ? 'DSQ' : r.dns ? 'DNS' : r.dnf ? 'DNF' : r.position != null ? 'P' + r.position : '–';
    const races = rounds.map((r) => fin(r.race)).filter((v) => v != null);
    const wins = races.filter((v) => v === 1).length, pods = races.filter((v) => v <= 3).length;
    const h2h = (a, b) => { let w = 0, l = 0; rounds.forEach((r) => { const x = fin(r[a]), y = fin(r[b]); if (x != null && y != null) { if (x < y) w++; else if (y < x) l++; } }); return w + ' – ' + l; };
    const sessionsByKey = new Map(B.sessions.map((s) => [s.session_key, s]));
    const prog = D.pts.filter((p) => sessionsByKey.has(p.session_key) && p.points_current != null).sort((p, q) => pd(sessionsByKey.get(p.session_key).date_start) - pd(sessionsByKey.get(q.session_key).date_start));
    const total = prog.length ? prog[prog.length - 1].points_current : null;
    const lede = $('drv-lede'); lede.replaceChildren();
    lede.append((D.me && D.me.team_name ? D.me.team_name + '. ' : ''), el('b', '', wins + (wins === 1 ? ' win' : ' wins')), ' and ', el('b', '', pods + (pods === 1 ? ' podium' : ' podiums')), ' from ' + rounds.length + ' races in ' + drv.year + '.');
    const tiles = $('drv-tiles'); tiles.replaceChildren();
    const col = C.ink(D.me && D.me.team_colour);
    const t = (k, v, d) => { const x = el('div', 'tile'); x.style.borderLeftColor = col; x.append(el('div', 'k', k), el('div', 'v', v), el('div', 'd', d || '')); tiles.appendChild(x); };
    if (total != null) t('Points', d3.format(',')(total), 'after ' + prog.length + ' scoring sessions');
    t('Best finish', races.length ? 'P' + d3.min(races) : '–', races.length ? 'average P' + d3.mean(races).toFixed(1) : '');
    const qs = rounds.map((r) => fin(r.quali)).filter((v) => v != null);
    t('Best qualifying', qs.length ? 'P' + d3.min(qs) : '–', qs.length ? 'average P' + d3.mean(qs).toFixed(1) : '');
    if (D.mate) { t('Qualifying head-to-head', h2h('quali', 'mateQuali'), 'against ' + dname(D.mate, D.mate.driver_number)); t('Race head-to-head', h2h('race', 'mateRace'), 'both cars classified'); }
    const css = getComputedStyle(document.documentElement), ca = css.getPropertyValue('--a').trim(), cb = css.getPropertyValue('--b').trim();
    legend('legend-drv', [{ label: 'Race', color: ca }, { label: 'Qualifying', color: cb, dash: true }]);
    const names = new Map(rounds.map((r) => [r.rd, r.m.meeting_name]));
    C.lines($('chart-drv-pos'), [{ name: 'Race', color: ca, points: rounds.filter((r) => fin(r.race) != null).map((r) => ({ x: r.rd, y: fin(r.race) })) },
      { name: 'Qualifying', color: cb, dash: true, points: rounds.filter((r) => fin(r.quali) != null).map((r) => ({ x: r.rd, y: fin(r.quali) })) }],
    { height: 300, invertY: true, yDomain: [1, 22], yTickValues: [1, 5, 10, 15, 20], yFmt: (v) => 'P' + v, xInt: true, xFmt: (v) => String(Math.round(v)), xTip: (v) => names.get(v) || 'Round ' + v, xTitle: 'Round', aria: 'Qualifying and race positions by round', empty: 'No results published for this driver.' });
    const order = prog.map((p, i) => ({ x: i + 1, y: p.points_current, s: sessionsByKey.get(p.session_key) }));
    const mname = (s) => { const m = B.meetings.find((x) => x.meeting_key === s.meeting_key); return (m ? m.meeting_name : '') + (s.session_name === 'Race' ? '' : ', ' + s.session_name.toLowerCase()); };
    C.lines($('chart-drv-pts'), [{ name: 'Points', color: col, points: order }], { height: 300, yDomain: [0, Math.max(10, total || 0)], xInt: true, xFmt: (v) => String(Math.round(v)), xTip: (v) => order[v - 1] ? mname(order[v - 1].s) : '', xTitle: 'Scoring session', aria: 'Championship points through the season', empty: 'OpenF1 has no points history for this season.' });
    const tb = $('drv-rounds').tBodies[0]; tb.replaceChildren();
    rounds.forEach((r) => { const tr = el('tr'); tr.append(el('td', 'muted', r.rd), el('td', '', r.m.meeting_name), el('td', 'num', label(r.quali)), el('td', 'num' + (fin(r.race) === 1 ? ' best' : ''), label(r.race)), el('td', 'num muted', D.mate ? label(r.mateRace) : '–')); tb.appendChild(tr); });
  }

  /* ---------- Live ---------- */
  const live = { timer: null, pos: new Map(), gaps: new Map(), lastLap: new Map(), tyres: new Map(), since: null };
  function tile(box, k, v, d) { const t = el('div', 'tile'); t.append(el('div', 'k', k), el('div', 'v', v), el('div', 'd', d || '')); box.appendChild(t); }
  async function initLive() {
    clearInterval(live.timer);
    const authed = F1.signedIn();
    $('live-out').hidden = !authed;
    $('live-auth-msg').textContent = authed ? 'Signed in to OpenF1 for this tab.' : '';
    const tiles = $('live-tiles'); tiles.replaceChildren();
    try {
      const { sessions, meetings } = await yearData(THIS_YEAR);
      const mname = (s) => { const m = meetings.find((x) => x.meeting_key === s.meeting_key); return m ? m.meeting_name : s.country_name; };
      const now = NOW();
      const running = sessions.find((s) => pd(s.date_start) <= now && pd(s.date_end) >= now);
      const next = sessions.find((s) => pd(s.date_start) > now);
      const prev = sessions.filter((s) => pd(s.date_end) < now).pop();
      if (running) tile(tiles, 'On track now', running.session_name, mname(running));
      if (next) { const h = (pd(next.date_start) - now) / 36e5; tile(tiles, 'Next session', h >= 48 ? Math.floor(h / 24) + ' days' : h >= 1 ? Math.floor(h) + ' h ' + Math.round((h % 1) * 60) + ' min' : Math.max(1, Math.round(h * 60)) + ' min', mname(next) + ', ' + next.session_name + ', ' + whenFmt.format(pd(next.date_start))); }
      else tile(tiles, 'Next session', 'None', 'No more sessions are scheduled this year.');
      $('live-lede').textContent = running ? (authed ? 'A session is running. The tower below refreshes every 8 seconds.' : 'A session is running. Sign in below to follow it; otherwise the results arrive here shortly after it ends.')
        : 'Nothing is on track right now. Below is the most recent session.';
      if (running && authed) { resetLive(); await pollLive(running); live.timer = setInterval(() => pollLive(running), 8000); }
      else if (prev) await showLatest(prev, mname(prev));
      else $('live-sub').textContent = 'No sessions have run yet this year.';
    } catch (e) { $('live-lede').textContent = e.message; }
  }
  function resetLive() { live.pos.clear(); live.gaps.clear(); live.lastLap.clear(); live.tyres.clear(); live.since = null; live.dm = null; }
  function towerRows(rows) {
    const tb = $('tower').tBodies[0]; tb.replaceChildren();
    rows.forEach((r) => {
      const tr = el('tr'), who = el('td'), bar = el('span', 'bar'); bar.style.background = C.ink(r.d && r.d.team_colour); who.append(bar, dname(r.d, r.n));
      tr.append(el('td', 'muted', r.pos != null ? r.pos : '–'), who, el('td', 'num', r.gap), el('td', 'num', r.int), el('td', 'num', r.last), el('td', '', r.tyre)); tb.appendChild(tr);
    });
  }
  async function showLatest(s, name) {
    $('live-tower-title').textContent = name + ', ' + s.session_name;
    $('live-sub').textContent = 'Final classification. Ended ' + whenFmt.format(pd(s.date_end)) + ' your time.';
    const k = 'session_key=' + s.session_key;
    const [res, drivers, stints, laps] = await Promise.all([get('session_result?' + k).catch(() => []), get('drivers?' + k), get('stints?' + k).catch(() => []), get('laps?' + k).catch(() => [])]);
    const dm = driverMap(drivers);
    const lastTyre = new Map(); stints.sort((a, b) => a.stint_number - b.stint_number).forEach((x) => lastTyre.set(x.driver_number, x.compound));
    const lastLap = new Map(); laps.sort((a, b) => a.lap_number - b.lap_number).forEach((l) => { if (l.lap_duration != null) lastLap.set(l.driver_number, l.lap_duration); });
    res.sort((a, b) => (a.position == null) - (b.position == null) || a.position - b.position);
    if (!res.length) { $('live-sub').textContent = 'Results for this session are not published yet.'; }
    towerRows(res.map((r, i) => { const g = lastOf(r.gap_to_leader); return { n: r.driver_number, d: dm.get(r.driver_number), pos: r.position,
      gap: r.dsq ? 'DSQ' : r.dns ? 'DNS' : r.dnf ? 'DNF' : i === 0 ? 'Leader' : typeof g === 'number' ? '+' + g.toFixed(3) : (g || '–'), int: '–', last: fmtLap(lastLap.get(r.driver_number)), tyre: String(lastTyre.get(r.driver_number) || '–').toLowerCase() }; }));
  }
  async function pollLive(s) {
    try {
      const k = 'session_key=' + s.session_key, f = { fresh: true };
      const since = live.since ? '&' + op('date', '>', live.since) : '';
      if (!live.dm) live.dm = driverMap(await get('drivers?' + k, f));
      const [pos, iv, laps, stints] = await Promise.all([get('position?' + k + since, f), get('intervals?' + k + since, f).catch(() => []),
        get('laps?' + k + (live.since ? '&' + op('date_start', '>', new Date(Date.now() - 4 * 60000).toISOString()) : ''), f).catch(() => []), get('stints?' + k, f).catch(() => [])]);
      pos.forEach((p) => live.pos.set(p.driver_number, p.position));
      iv.forEach((p) => live.gaps.set(p.driver_number, p));
      laps.sort((a, b) => a.lap_number - b.lap_number).forEach((l) => { if (l.lap_duration != null) live.lastLap.set(l.driver_number, l.lap_duration); });
      stints.sort((a, b) => a.stint_number - b.stint_number).forEach((x) => live.tyres.set(x.driver_number, x.compound));
      const stamp = d3.max(pos.concat(iv), (p) => p.date); if (stamp) live.since = pd(stamp).toISOString();
      $('live-tower-title').textContent = 'Timing tower, ' + s.session_name;
      $('live-sub').textContent = 'Updated ' + new Date().toLocaleTimeString() + '.';
      const g = (v) => v == null ? '–' : typeof v === 'number' ? '+' + v.toFixed(3) : String(v);
      towerRows([...live.dm.keys()].map((n) => { const x = live.gaps.get(n) || {}; return { n, d: live.dm.get(n), pos: live.pos.get(n), gap: live.pos.get(n) === 1 ? 'Leader' : g(x.gap_to_leader), int: g(x.interval), last: fmtLap(live.lastLap.get(n)), tyre: String(live.tyres.get(n) || '–').toLowerCase() }; })
        .sort((a, b) => (a.pos || 99) - (b.pos || 99)));
    } catch (e) { $('live-sub').textContent = e.message; }
  }

  /* ---------- wiring ---------- */
  let current = null; const started = {};
  function route() {
    const tab = (location.hash || '#season').slice(1).split('?')[0];
    const name = ['season', 'session', 'telemetry', 'drivers', 'live'].includes(tab) ? tab : 'season';
    current = name; clearInterval(live.timer); C.hideTip();
    document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== 'view-' + name; });
    document.querySelectorAll('nav a').forEach((a) => { if (a.dataset.tab === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (name === 'season') { if (!started.season) { started.season = true; loadSeason(); } else renderSeason(); }
    if (name === 'session') { if (!S.started) initPickers(); else if (S.data) { renderSessionCharts(); lazyCheck(); } }
    if (name === 'drivers') { if (!drv.started) initDrivers(); else renderDriver(); }
    if (name === 'telemetry') initTelemetry();
    if (name === 'live') initLive();
    setLink();
    window.scrollTo(0, 0);
  }
  /* restore a shared link */
  (function () {
    const q = linkParams(), y = +q.get('y'), tab = (location.hash || '').slice(1).split('?')[0];
    const nums = (v) => String(v || '').split('.').map(Number).filter(Boolean);
    if (YEARS.includes(y)) { if (tab === 'season') season.year = y; else if (tab === 'drivers') drv.year = y; else S.year = y; }
    if (tab === 'drivers' && +q.get('d')) drv.n = +q.get('d');
    if ((tab === 'session' || tab === 'telemetry') && +q.get('m')) S.want = { meeting: +q.get('m'), session: +q.get('s'), drivers: nums(q.get('d')), tel: +q.get('a') ? { a: +q.get('a'), la: +q.get('la'), b: +q.get('b'), lb: +q.get('lb') } : null };
  })();
  fill($('season-year'), YEARS.map((y) => ({ label: y, value: y })), season.year);
  fill($('sel-year'), YEARS.map((y) => ({ label: y, value: y })), S.year);
  fill($('drv-year'), YEARS.map((y) => ({ label: y, value: y })), drv.year);
  $('drv-year').onchange = (e) => { drv.year = +e.target.value; drv.n = null; initDrivers(); };
  $('drv-driver').onchange = (e) => { drv.n = +e.target.value; loadDriver(); };
  $('copy-link').onclick = async () => { const b = $('copy-link'); try { await navigator.clipboard.writeText(location.href); b.textContent = 'Link copied'; } catch (e) { b.textContent = 'Copy it from the address bar'; } setTimeout(() => { b.textContent = 'Copy link to this view'; }, 2500); };
  $('season-year').onchange = (e) => { season.year = +e.target.value; season.data = null; loadSeason(); };
  $('sel-year').onchange = (e) => { S.year = +e.target.value; initPickers(); };
  $('sel-meeting').onchange = pickMeeting;
  $('sel-session').onchange = loadSession;
  $('show-slow').onchange = renderSessionCharts;
  $('tel-a-driver').onchange = (e) => fillLaps($('tel-a-lap'), +e.target.value);
  $('tel-b-driver').onchange = (e) => fillLaps($('tel-b-lap'), +e.target.value);
  $('tel-load').onclick = loadTelemetry;
  $('live-form').onsubmit = async (e) => {
    e.preventDefault(); const msg = $('live-auth-msg'); msg.textContent = 'Signing in…';
    try { await F1.signIn($('live-user').value, $('live-pass').value); $('live-pass').value = ''; initLive(); }
    catch (err) { msg.textContent = err.message; }
  };
  $('live-out').onclick = () => { F1.signOut(); initLive(); };
  F1.onLoad((n) => { $('net-status').textContent = n ? 'Loading data…' : ''; });
  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => {
    if (current === 'season') renderSeason(); if (current === 'session') renderSessionCharts(); if (current === 'telemetry' && tel.last) renderTelemetry(); if (current === 'drivers') renderDriver();
  }, 200); });
  let sc = false; window.addEventListener('scroll', () => { if (sc) return; sc = true; requestAnimationFrame(() => { sc = false; lazyCheck(); }); }, { passive: true });
  window.addEventListener('hashchange', route);
  route();
})();
