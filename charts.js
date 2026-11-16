/* Small chart kit on d3. Every chart redraws from scratch into its container. */
(function () {
  const tipEl = () => document.getElementById('tip');
  function showTip(ev, head, rows) {
    const t = tipEl();
    t.replaceChildren();
    if (head) { const h = document.createElement('div'); h.className = 'h'; h.textContent = head; t.appendChild(h); }
    rows.forEach((r) => {
      const d = document.createElement('div'); d.className = 'r';
      const l = document.createElement('span');
      if (r.color) { const i = document.createElement('i'); i.style.background = r.color; l.appendChild(i); }
      l.appendChild(document.createTextNode(r.label));
      const v = document.createElement('span'); v.textContent = r.value;
      d.append(l, v); t.appendChild(d);
    });
    t.hidden = false;
    const w = t.offsetWidth, h = t.offsetHeight;
    let x = ev.clientX + 14, y = ev.clientY + 14;
    if (x + w > innerWidth - 8) x = ev.clientX - w - 14;
    if (y + h > innerHeight - 8) y = ev.clientY - h - 14;
    t.style.left = Math.max(8, x) + 'px'; t.style.top = Math.max(8, y) + 'px';
  }
  function hideTip() { tipEl().hidden = true; }

  function note(el, text, err) {
    el.replaceChildren();
    const p = document.createElement('p'); p.className = 'note' + (err ? ' err' : ''); p.textContent = text; el.appendChild(p);
  }

  /* Team colours come without '#', and some are too dark for this surface. */
  function ink(hex) {
    const c = d3.hsl('#' + String(hex || '8a919d').replace('#', ''));
    if (isNaN(c.h) && c.l < 0.5) c.l = 0.7;
    if (c.l < 0.5) c.l = 0.58;
    return c.formatHex();
  }

  function textWidth(svg, cls, strings) {
    const g = svg.append('g'); let w = 0;
    strings.forEach((s) => { w = Math.max(w, g.append('text').attr('class', cls).text(s).node().getComputedTextLength()); });
    g.remove(); return Math.ceil(w);
  }

  /* Horizontal bars: rows = [{label, value, color, tip:[{label,value}]}] */
  function hbars(el, rows, opts) {
    el.replaceChildren();
    if (!rows.length) return note(el, opts.empty || 'No data.');
    const W = Math.max(260, el.clientWidth), rh = 24, gap = 2;
    const H = rows.length * (rh + gap);
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', opts.aria);
    const fmt = opts.fmt || d3.format(',');
    const left = textWidth(svg, 'lbl', rows.map((r) => r.label)) + 12;
    const right = textWidth(svg, 'val', rows.map((r) => fmt(r.value))) + 10;
    const x = d3.scaleLinear().domain([0, d3.max(rows, (r) => r.value) || 1]).range([0, Math.max(20, W - left - right)]);
    const g = svg.selectAll('g').data(rows).join('g').attr('transform', (r, i) => `translate(0,${i * (rh + gap)})`);
    g.append('text').attr('class', 'lbl').attr('x', left - 10).attr('y', rh / 2).attr('dy', '.35em').attr('text-anchor', 'end').text((r) => r.label);
    g.append('path').attr('fill', (r) => r.color).attr('d', (r) => {
      const w = r.value > 0 ? Math.max(3, x(r.value)) : 0, h = rh - 6, rr = Math.min(4, w);
      return w ? `M${left},3h${w - rr}a${rr},${rr} 0 0 1 ${rr},${rr}v${h - 2 * rr}a${rr},${rr} 0 0 1 -${rr},${rr}h-${w - rr}z` : '';
    });
    g.append('text').attr('class', 'val').attr('x', (r) => left + x(r.value) + 6).attr('y', rh / 2).attr('dy', '.35em').text((r) => fmt(r.value));
    g.append('rect').attr('width', W).attr('height', rh + gap).attr('fill', 'transparent')
      .on('pointermove', (ev, r) => showTip(ev, r.label, r.tip || [{ label: opts.unit || 'Value', value: fmt(r.value) }]))
      .on('pointerleave', hideTip);
  }

  /* Line chart. series = [{name, color, dash, muted, points:[{x,y}]}]
     opts: height, xFmt, yFmt, yTicks, xTitle, invertY, step, yDomain, onX(x|null), labels(bool), aria */
  function lines(el, series, opts) {
    el.replaceChildren();
    const all = series.flatMap((s) => s.points);
    if (!all.length) { note(el, opts.empty || 'No data.'); return { setX() {} }; }
    const W = Math.max(280, el.clientWidth), H = opts.height || 300;
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', opts.aria);
    const yFmt = opts.yFmt || d3.format(','), xFmt = opts.xFmt || d3.format(',');
    let yd = opts.yDomain || d3.extent(all, (p) => p.y);
    if (yd[0] === yd[1]) yd = [yd[0] - 1, yd[1] + 1];
    const y = d3.scaleLinear().domain(opts.invertY ? [yd[1], yd[0]] : yd);
    if (!opts.yDomain) y.nice();
    const yt = opts.yTickValues || y.ticks(opts.yTicks || 5);
    const named = series.filter((s) => !s.muted);
    const withLabels = opts.labels !== false && named.length <= 6 && named.length > 1;
    const m = { t: 10, b: opts.xTitle ? 38 : 24, l: opts.left || textWidth(svg, '', yt.map(yFmt)) + 10, r: withLabels ? textWidth(svg, 'lbl', named.map((s) => s.name)) + 12 : 12 };
    y.range([H - m.b, m.t]);
    const x = d3.scaleLinear().domain(opts.xDomain || d3.extent(all, (p) => p.x)).range([m.l, W - m.r]);
    const g = svg.append('g');
    g.selectAll('line').data(yt).join('line').attr('class', 'gridline').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y);
    g.selectAll('text').data(yt).join('text').attr('x', m.l - 8).attr('y', y).attr('dy', '.32em').attr('text-anchor', 'end').text(yFmt);
    const xt = x.ticks(Math.max(2, Math.floor((W - m.l - m.r) / 80)));
    const gx = svg.append('g');
    gx.selectAll('text').data(xt).join('text').attr('x', x).attr('y', H - m.b + 16).attr('text-anchor', 'middle').text(xFmt);
    if (opts.xTitle) gx.append('text').attr('x', (m.l + W - m.r) / 2).attr('y', H - 4).attr('text-anchor', 'middle').text(opts.xTitle);
    const line = d3.line().defined((p) => p.y != null).x((p) => x(p.x)).y((p) => y(p.y));
    if (opts.step) line.curve(d3.curveStepAfter);
    const ordered = series.filter((s) => s.muted).concat(named);
    svg.append('g').selectAll('path').data(ordered).join('path').attr('fill', 'none')
      .attr('stroke', (s) => s.muted ? '#4a515d' : s.color).attr('stroke-width', (s) => s.muted ? 1 : 2)
      .attr('stroke-dasharray', (s) => s.dash ? '5 4' : null).attr('stroke-linejoin', 'round').attr('d', (s) => line(s.points));
    if (withLabels) {
      const ends = named.map((s) => { const p = s.points.filter((q) => q.y != null).pop(); return { s, y: y(p.y) }; }).sort((a, b) => a.y - b.y);
      for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
      svg.append('g').selectAll('text').data(ends).join('text').attr('class', 'lbl').attr('x', W - m.r + 6).attr('y', (e) => e.y).attr('dy', '.32em').text((e) => e.s.name);
    }
    const cursor = svg.append('line').attr('class', 'cursor').attr('y1', m.t).attr('y2', H - m.b).style('display', 'none');
    const dots = svg.append('g');
    const bis = d3.bisector((p) => p.x).center;
    const bisR = d3.bisector((p) => p.x).right;
    function at(xv) { return named.map((s) => ({ s, p: s.points[opts.step ? Math.max(0, bisR(s.points, xv) - 1) : bis(s.points, xv)] })).filter((d) => d.p && d.p.y != null); }
    function setX(xv) {
      if (xv == null) { cursor.style('display', 'none'); dots.selectAll('*').remove(); return; }
      cursor.style('display', null).attr('x1', x(xv)).attr('x2', x(xv));
      dots.selectAll('circle').data(at(xv)).join('circle').attr('r', 4).attr('fill', (d) => d.s.color).attr('stroke', '#1c2027').attr('stroke-width', 2)
        .attr('cx', (d) => opts.snap === false ? x(xv) : x(d.p.x)).attr('cy', (d) => y(d.p.y));
    }
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', Math.max(1, W - m.l - m.r)).attr('height', H - m.t - m.b).attr('fill', 'transparent')
      .on('pointermove', (ev) => {
        const xv = x.invert(d3.pointer(ev, svg.node())[0]);
        const hits = at(xv);
        if (!hits.length) return;
        const snap = opts.snap === false ? xv : hits[0].p.x;
        setX(snap); if (opts.onX) opts.onX(snap, ev);
        if (opts.tip !== false) showTip(ev, (opts.xTip || xFmt)(snap), hits.map((d) => ({ label: d.s.name, value: yFmt(d.p.y), color: d.s.color })));
      })
      .on('pointerleave', () => { setX(null); hideTip(); if (opts.onX) opts.onX(null); });
    return { setX };
  }

  /* Tyre stints: rows = [{label, stints:[{from,to,compound,age}]}] */
  const TYRE = { SOFT: ['#e8423f', 'S'], MEDIUM: ['#f2c230', 'M'], HARD: ['#e9ecef', 'H'], INTERMEDIATE: ['#3ecf6e', 'I'], WET: ['#3987e5', 'W'] };
  function tyre(c) { return TYRE[String(c || '').toUpperCase()] || ['#6b7280', '?']; }
  function stints(el, rows, maxLap, aria) {
    el.replaceChildren();
    if (!rows.length) return note(el, 'No tyre data for this session.');
    const W = Math.max(280, el.clientWidth), rh = 22, gap = 4, top = 4, bottom = 24;
    const H = top + rows.length * (rh + gap) + bottom;
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', aria);
    const left = textWidth(svg, 'lbl', rows.map((r) => r.label)) + 12;
    const x = d3.scaleLinear().domain([0, maxLap]).range([left, W - 8]);
    const g = svg.selectAll('g.row').data(rows).join('g').attr('class', 'row').attr('transform', (r, i) => `translate(0,${top + i * (rh + gap)})`);
    g.append('text').attr('class', 'lbl').attr('x', left - 10).attr('y', rh / 2).attr('dy', '.35em').attr('text-anchor', 'end').text((r) => r.label);
    const seg = g.selectAll('g.seg').data((r) => r.stints.map((s) => ({ s, r }))).join('g').attr('class', 'seg');
    seg.append('rect').attr('x', (d) => x(d.s.from - 1) + 1).attr('width', (d) => Math.max(2, x(d.s.to) - x(d.s.from - 1) - 2)).attr('y', 2).attr('height', rh - 4).attr('rx', 3)
      .attr('fill', (d) => tyre(d.s.compound)[0])
      .on('pointermove', (ev, d) => showTip(ev, d.r.label, [
        { label: 'Tyre', value: String(d.s.compound || 'Unknown').toLowerCase() },
        { label: 'Laps', value: d.s.from + '–' + d.s.to + ' (' + (d.s.to - d.s.from + 1) + ')' },
        { label: 'Tyre age at start', value: (d.s.age || 0) + ' laps' }]))
      .on('pointerleave', hideTip);
    seg.filter((d) => x(d.s.to) - x(d.s.from - 1) > 18).append('text').attr('x', (d) => (x(d.s.from - 1) + x(d.s.to)) / 2).attr('y', rh / 2).attr('dy', '.35em')
      .attr('text-anchor', 'middle').style('fill', '#14171c').style('font-weight', 600).style('pointer-events', 'none').text((d) => tyre(d.s.compound)[1]);
    const ticks = x.ticks(Math.max(2, Math.floor((W - left) / 70))).filter((t) => t > 0);
    svg.append('g').selectAll('text').data(ticks).join('text').attr('x', x).attr('y', H - 6).attr('text-anchor', 'middle').text((t) => 'Lap ' + t);
  }

  /* Track map: pts=[{x,y,speed,dist}], brighter = faster. Returns {setDist(d)} */
  function trackMap(el, pts, aria) {
    el.replaceChildren();
    if (pts.length < 10) { note(el, 'No track position data for this lap.'); return { setDist() {} }; }
    const W = Math.max(260, el.clientWidth), H = Math.min(W, 420), pad = 16;
    const ex = d3.extent(pts, (p) => p.x), ey = d3.extent(pts, (p) => p.y);
    const k = Math.min((W - 2 * pad) / (ex[1] - ex[0] || 1), (H - 2 * pad - 24) / (ey[1] - ey[0] || 1));
    const ox = (W - k * (ex[1] - ex[0])) / 2, oy = (H - 24 - k * (ey[1] - ey[0])) / 2;
    const px = (p) => ox + k * (p.x - ex[0]), py = (p) => H - 24 - oy - k * (p.y - ey[0]);
    const sp = d3.extent(pts, (p) => p.speed);
    const col = d3.scaleLinear().domain(sp).range(['#184f95', '#cde2fb']).interpolate(d3.interpolateLab);
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', aria);
    const segs = d3.pairs(pts);
    svg.append('g').selectAll('line').data(segs).join('line').attr('x1', (s) => px(s[0])).attr('y1', (s) => py(s[0])).attr('x2', (s) => px(s[1])).attr('y2', (s) => py(s[1]))
      .attr('stroke', (s) => col(s[1].speed)).attr('stroke-width', 5).attr('stroke-linecap', 'round');
    const grad = svg.append('defs').append('linearGradient').attr('id', 'spd');
    grad.append('stop').attr('offset', '0').attr('stop-color', '#184f95'); grad.append('stop').attr('offset', '1').attr('stop-color', '#cde2fb');
    svg.append('rect').attr('x', pad + 60).attr('y', H - 14).attr('width', 120).attr('height', 6).attr('rx', 3).attr('fill', 'url(#spd)');
    svg.append('text').attr('x', pad + 54).attr('y', H - 8).attr('text-anchor', 'end').text(Math.round(sp[0]) + ' km/h');
    svg.append('text').attr('x', pad + 186).attr('y', H - 8).text(Math.round(sp[1]) + ' km/h');
    const dot = svg.append('circle').attr('r', 7).attr('fill', '#fff').attr('stroke', '#14171c').attr('stroke-width', 2).style('display', 'none');
    const bis = d3.bisector((p) => p.dist).center;
    function setDist(d) {
      if (d == null) return dot.style('display', 'none');
      const p = pts[bis(pts, d)]; dot.style('display', null).attr('cx', px(p)).attr('cy', py(p));
    }
    svg.append('rect').attr('width', W).attr('height', H - 24).attr('fill', 'transparent')
      .on('pointermove', (ev) => {
        const [mx, my] = d3.pointer(ev, svg.node());
        const p = d3.least(pts, (q) => (px(q) - mx) ** 2 + (py(q) - my) ** 2);
        dot.style('display', null).attr('cx', px(p)).attr('cy', py(p));
        showTip(ev, Math.round(p.dist) + ' m into the lap', [{ label: 'Speed', value: Math.round(p.speed) + ' km/h' }]);
      })
      .on('pointerleave', () => { dot.style('display', 'none'); hideTip(); });
    return { setDist };
  }

  window.Charts = { hbars, lines, stints, trackMap, note, ink, tyre, showTip, hideTip };
})();
