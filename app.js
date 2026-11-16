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
      renderSeason();
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
  const S = { year: THIS_YEAR, meetings: [], sessions: [], session: null, data: null, selected: [], want: null };
  async function initPickers() {
    try {
      const { sessions, meetings } = await yearData(S.year);
      S.sessions = sessions; S.meetings = meetings.filter((m) => sessions.some((s) => s.meeting_key === m.meeting_key && ready(s)));
      if (!S.meetings.length) { fill($('sel-meeting'), []); fill($('sel-session'), []); S.session = null; S.data = null; $('session-lede').textContent = 'No sessions have run yet in ' + S.year + '.'; return; }
      const wantM = S.want && S.want.meeting;
      const mk = wantM && S.meetings.some((m) => m.meeting_key === wantM) ? wantM : S.meetings[S.meetings.length - 1].meeting_key;
      fill($('sel-meeting'), S.meetings.map((m) => ({ label: m.meeting_name, value: m.meeting_key })), mk);
      S.want = null;
      pickMeeting();
    } catch (e) { $('session-lede').textContent = e.message; }
  }
  function pickMeeting() {
    const mk = +$('sel-meeting').value;
    const list = S.sessions.filter((s) => s.meeting_key === mk && ready(s));
    const def = list.find((s) => s.session_name === 'Race') || list[list.length - 1];
    fill($('sel-session'), list.map((s) => ({ label: s.session_name, value: s.session_key })), def && def.session_key);
    loadSession();
  }
  async function loadSession() {
    const key = +$('sel-session').value;
    const s = S.sessions.find((x) => x.session_key === key);
    if (!s) return;
    S.session = s; S.data = null; tel.loadedFor = null;
    const m = S.meetings.find((x) => x.meeting_key === s.meeting_key);
    $('session-title').textContent = (m ? m.meeting_name : s.country_name);
    $('session-lede').textContent = 'Loading ' + s.session_name.toLowerCase() + '…';
    try {
      const k = 'session_key=' + key;
      const soft = (p) => get(p).catch((e) => { if (e.live) throw e; return []; });
      const [drivers, results, laps, stints, pits, weather, rc, pos] = await Promise.all([
        get('drivers?' + k), soft('session_result?' + k), get('laps?' + k), soft('stints?' + k), soft('pit?' + k),
        soft('weather?' + k), soft('race_control?' + k), soft('position?' + k)]);
      if (!S.session || S.session.session_key !== key) return;
      const dm = driverMap(drivers);
      const best = new Map();
      laps.forEach((l) => { if (l.lap_duration != null && (!best.has(l.driver_number) || l.lap_duration < best.get(l.driver_number))) best.set(l.driver_number, l.lap_duration); });
      let order;
      if (results.length) order = results.slice().sort((a, b) => (a.position == null) - (b.position == null) || a.position - b.position);
      else {
        const lastPos = new Map(); pos.forEach((p) => lastPos.set(p.driver_number, p.position));
        order = drivers.map((d) => ({ driver_number: d.driver_number, position: lastPos.get(d.driver_number) })).sort((a, b) => (a.position || 99) - (b.position || 99));
      }
      S.data = { dm, results: order, hasResults: results.length > 0, laps, stints, pits, weather, rc, pos, best, isRace: s.session_type === 'Race' };
      S.selected = order.slice(0, 4).map((r) => r.driver_number);
      renderSession();
      if (current === 'telemetry') initTelemetry();
    } catch (e) {
      $('session-lede').textContent = e.message;
    }
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
        el('td', 'num', gap), bl, el('td', 'num', D.isRace ? (stops.get(r.driver_number) || 0) : '–'));
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
        renderSession();
      };
      chips.appendChild(b);
    });
    renderSessionCharts();
    /* race control */
    const feed = $('race-control'); feed.replaceChildren();
    const msgs = D.rc.slice().sort((a, b) => pd(b.date) - pd(a.date)).slice(0, 250);
    if (!msgs.length) feed.appendChild(el('li', 'muted', 'No race control messages for this session.'));
    msgs.forEach((m) => {
      const li = el('li'); const t = el('time', '', m.lap_number ? 'Lap ' + m.lap_number : pd(m.date).toISOString().slice(11, 16));
      const f = el('span', 'flag ' + String(m.flag || '').split(' ')[0], m.flag ? String(m.flag).toLowerCase() : String(m.category || '').toLowerCase());
      li.append(t, f, el('span', '', m.message || '')); feed.appendChild(li);
    });
  }
  function renderSessionCharts() {
    const D = S.data; if (!D) return;
    const st = seriesStyle();
    const lg = S.selected.map((n) => ({ label: dname(D.dm.get(n), n), color: st.get(n).color, dash: st.get(n).dash }));
    legend('legend-laps', lg);
    /* lap times */
    const sel = D.laps.filter((l) => S.selected.includes(l.driver_number) && l.lap_duration != null);
    const cut = D.isRace ? (d3.median(sel, (l) => l.lap_duration) || 0) * 1.07 : (d3.min(sel, (l) => l.lap_duration) || 0) * 1.07;
    const slow = $('show-slow').checked;
    C.lines($('chart-laps'), S.selected.map((n) => ({ ...st.get(n),
      points: sel.filter((l) => l.driver_number === n && (slow || (!l.is_pit_out_lap && l.lap_duration <= cut))).sort((a, b) => a.lap_number - b.lap_number).map((l) => ({ x: l.lap_number, y: l.lap_duration })) })),
    { height: 320, yFmt: fmtLap, xFmt: (v) => String(Math.round(v)), xTip: (v) => 'Lap ' + v, xTitle: 'Lap', aria: 'Lap times by lap for the chosen drivers', empty: S.selected.length ? 'No timed laps for these drivers.' : 'Choose a driver above.' });
    /* positions */
    $('panel-positions').hidden = !D.isRace || !D.pos.length;
    if (D.isRace && D.pos.length) {
      legend('legend-pos', lg);
      const t0 = d3.min(D.pos, (p) => +pd(p.date)), t1 = d3.max(D.pos, (p) => +pd(p.date));
      const by = d3.group(D.pos, (p) => p.driver_number);
      const series = [...by.entries()].map(([n, rows]) => {
        const pts = rows.map((p) => ({ x: (+pd(p.date) - t0) / 60000, y: p.position })).sort((a, b) => a.x - b.x);
        pts.push({ x: (t1 - t0) / 60000, y: pts[pts.length - 1].y });
        const s = st.get(n);
        return s ? { ...s, points: pts } : { name: dcode(D.dm.get(n), n), muted: true, points: pts };
      });
      const maxP = d3.max(D.pos, (p) => p.position) || 20;
      C.lines($('chart-pos'), series, { height: 340, step: true, snap: false, invertY: true, yDomain: [1, maxP], yTickValues: d3.range(1, maxP + 1).filter((v) => v === 1 || v % 5 === 0),
        yFmt: (v) => 'P' + v, xFmt: (v) => Math.round(v) + ' min', xTitle: 'Minutes since the start', aria: 'Track position over the session for the chosen drivers' });
    }
    /* stints */
    const byD = d3.group(D.stints.filter((x) => x.lap_start != null && x.lap_end != null), (x) => x.driver_number);
    const rows = D.results.filter((r) => byD.has(r.driver_number)).map((r) => ({ label: dcode(D.dm.get(r.driver_number), r.driver_number),
      stints: byD.get(r.driver_number).sort((a, b) => a.stint_number - b.stint_number).map((x) => ({ from: x.lap_start, to: x.lap_end, compound: x.compound, age: x.tyre_age_at_start })) }));
    const comps = [...new Set(D.stints.map((x) => String(x.compound || '').toUpperCase()))].filter(Boolean);
    legend('legend-tyres', comps.map((c) => ({ box: true, color: C.tyre(c)[0], label: C.tyre(c)[1] + ' = ' + c.toLowerCase() })));
    C.stints($('chart-stints'), rows, d3.max(D.stints, (x) => x.lap_end) || 1, 'Tyre stints by driver and lap');
  }
  function openMeeting(year, meetingKey) {
    S.year = year; $('sel-year').value = year; S.want = { meeting: meetingKey };
    location.hash = '#session'; initPickers();
  }

  /* ---------- Telemetry ---------- */
  const tel = { loadedFor: null, last: null };
  const METRICS = [
    { key: 'speed', label: 'Speed', unit: 'km/h', h: 190, fmt: (v) => Math.round(v) + '' },
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
      if (!S.sessions.length) await initPickers();
      return; /* loadSession calls back here */
    }
    const s = S.session, m = S.meetings.find((x) => x.meeting_key === s.meeting_key);
    $('tel-context').textContent = (m ? m.meeting_name : '') + ', ' + s.session_name + '. Change it under Race weekend.';
    if (tel.loadedFor === s.session_key) { if (tel.last) renderTelemetry(); return; }
    tel.loadedFor = s.session_key; tel.last = null;
    const ds = S.data.results.map((r) => r.driver_number).filter((n) => lapsFor(n).length);
    const items = ds.map((n) => ({ label: dname(S.data.dm.get(n), n), value: n }));
    fill($('tel-a-driver'), items); fill($('tel-b-driver'), [{ label: 'No second driver', value: '' }].concat(items), ds[1] || '');
    fillLaps($('tel-a-lap'), +$('tel-a-driver').value); fillLaps($('tel-b-lap'), +$('tel-b-driver').value);
    $('tel-tiles').replaceChildren(); $('tel-charts').replaceChildren();
    C.note($('tel-charts'), ds.length ? 'Choose drivers and laps, then load.' : 'This session has no timed laps with telemetry.');
    C.note($('tel-map'), '');
    if (ds.length) loadTelemetry();
  }
  async function fetchLap(n, lapNo, withLoc) {
    const lap = S.data.laps.find((l) => l.driver_number === n && l.lap_number === lapNo);
    const t0 = pd(lap.date_start), t1 = new Date(+t0 + lap.lap_duration * 1000);
    const q = 'session_key=' + S.session.session_key + '&driver_number=' + n + '&' + op('date', '>=', t0.toISOString()) + '&' + op('date', '<', t1.toISOString());
    const [car, loc] = await Promise.all([get('car_data?' + q), withLoc ? get('location?' + q).catch(() => []) : []]);
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
      tel.last = { A, B }; renderTelemetry();
    } catch (e) { C.note($('tel-charts'), e.message, true); C.note($('tel-map'), ''); }
    btn.disabled = false;
  }
  function renderTelemetry() {
    const { A, B } = tel.last; const css = getComputedStyle(document.documentElement);
    const colA = css.getPropertyValue('--a').trim(), colB = css.getPropertyValue('--b').trim();
    const box = $('tel-charts'); box.replaceChildren();
    if (!A.rows.length) { C.note(box, 'OpenF1 has no car data for this lap. Try another lap.'); C.note($('tel-map'), ''); $('tel-tiles').replaceChildren(); return; }
    const sets = [{ L: A, color: colA }].concat(B && B.rows.length ? [{ L: B, color: colB }] : []);
    const nm = (L) => dcode(L.d, L.n) + ' lap ' + L.lap.lap_number;
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
    METRICS.forEach((M, mi) => {
      const row = el('div', 'tel-row'); row.appendChild(el('h3', '', M.label + (M.unit ? ' (' + M.unit + ')' : '')));
      const ch = el('div', 'chart'); ch.style.minHeight = M.h + 'px'; row.appendChild(ch); box.appendChild(row);
      handles.push(C.lines(ch, sets.map((s) => ({ name: nm(s.L), color: s.color, points: s.L.rows.filter((r) => r[M.key] != null).map((r) => ({ x: r.dist, y: r[M.key] })) })), {
        height: M.h, left: 52, yDomain: M.dom, yTickValues: M.ticks, yTicks: 4, yFmt: M.fmt, step: M.step, labels: false, tip: false, xDomain: [0, xMax],
        xFmt: (v) => d3.format(',')(Math.round(v)) + ' m', xTitle: mi === METRICS.length - 1 ? 'Distance into the lap' : null,
        aria: M.label + ' by distance into the lap', empty: 'No ' + M.label.toLowerCase() + ' data.',
        onX: (x, ev) => {
          handles.forEach((h) => h.setX(x)); map.setDist(x);
          if (x == null) return C.hideTip();
          const rows = [];
          METRICS.forEach((Q) => sets.forEach((s) => { const r = s.L.rows[bis(s.L.rows, x)]; if (r && r[Q.key] != null) rows.push({ label: Q.label + (sets.length > 1 ? ' ' + dcode(s.L.d, s.L.n) : ''), value: Q.fmt(r[Q.key]) + (Q.unit && Q.unit !== '%' ? ' ' + Q.unit : ''), color: s.color }); }));
          C.showTip(ev, d3.format(',')(Math.round(x)) + ' m into the lap', rows);
        } }));
    });
    $('map-sub').textContent = dname(A.d, A.n) + '\'s line on lap ' + A.lap.lap_number + ', brighter where the car is faster.';
    map = C.trackMap($('tel-map'), A.map, 'Track map coloured by speed');
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
    const tab = (location.hash || '#season').slice(1);
    const name = ['season', 'session', 'telemetry', 'live'].includes(tab) ? tab : 'season';
    current = name; clearInterval(live.timer); C.hideTip();
    document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== 'view-' + name; });
    document.querySelectorAll('nav a').forEach((a) => { if (a.dataset.tab === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (name === 'season') { if (!started.season) { started.season = true; loadSeason(); } else renderSeason(); }
    if (name === 'session') { if (!S.sessions.length && !S.want) initPickers(); else if (S.data) renderSessionCharts(); }
    if (name === 'telemetry') initTelemetry();
    if (name === 'live') initLive();
    window.scrollTo(0, 0);
  }
  fill($('season-year'), YEARS.map((y) => ({ label: y, value: y })), THIS_YEAR);
  fill($('sel-year'), YEARS.map((y) => ({ label: y, value: y })), THIS_YEAR);
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
    if (current === 'season') renderSeason(); if (current === 'session') renderSessionCharts(); if (current === 'telemetry' && tel.last) renderTelemetry();
  }, 200); });
  window.addEventListener('hashchange', route);
  route();
})();
