(function () {
/* Борис RTTF: data from the dashboard store (r_*), calcs, drawings. Buttons work only inside Claude. */
const C = {green: '#32d74b', red: '#ff6961', blue: '#0a84ff', indigo: '#7d7aff', teal: '#64d2ff', grid: 'rgba(255,255,255,.07)'};
const motionOK = () => window.matchMedia('(prefers-reduced-motion: no-preference)').matches;
window.ttAnimDone = window.ttAnimDone || {};
const firstAnim = (name) => { if (window.ttAnimDone[name] || !motionOK()) return false; window.ttAnimDone[name] = true; return true; };
const fmtInt = (v) => d3.format(',')(v).replace(/,/g, ' ');
const fmtDate = (s) => { const d = d3.utcParse('%Y-%m-%d')(s); return d ? d3.utcFormat('%d.%m.%Y')(d) : s; };
const ru = (v) => String(v).replace('.', ',');
const signed = (v) => (v == null || isNaN(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + ru(Math.round(Math.abs(v) * 10) / 10));
const goodBad = (v) => (+v > 0 ? 'tt-good' : +v < 0 ? 'tt-bad' : '');
const inClaude = typeof claude !== 'undefined' && claude && typeof claude.use === 'function';
if (inClaude) document.querySelectorAll('#r-refresh-box').forEach((b) => { b.hidden = false; });

/* On the public site the archive of tournaments up to 22.11.2026 lives in rttf_hist.json ({cols, rows}),
   so the daily rttf.json stays small. Inside Claude it comes from the dashboard's own r_tours_hist source. */
window.__RTTF_HIST = window.__RTTF_HIST || null;
if (!inClaude && typeof fetch === 'function') {
  fetch('rttf_hist.json?v=' + Date.now()).then((r) => (r.ok ? r.json() : null)).then((h) => {
    if (!h || !Array.isArray(h.rows) || !Array.isArray(h.cols)) return;
    window.__RTTF_HIST = h.rows.map((row) => Object.fromEntries(h.cols.map((c, i) => [c, row[i]])));
    ['r-rating', 'r-deltas', 'r-monthly'].forEach((k) => { window.ttAnimDone[k] = false; });
    if (window.__RTTF && window.__drawAll) window.__drawAll();
  }).catch(() => {});
}

dash.calc('r_tournaments', {
  title: 'RTTF: все турниры',
  description: 'Архив турниров RTTF до 22.11.2026 вместе с новыми, по порядку номеров.',
  inputs: ['r_tours_hist', 'r_tours_new'],
  fn: (r_tours_hist, r_tours_new) => {
    const seen = new Set(); const out = [];
    const hist = r_tours_hist && r_tours_hist.length ? r_tours_hist : (window.__RTTF_HIST || []);
    [...hist, ...(r_tours_new || [])].forEach((r) => {
      const n = +r.n; if (!n || seen.has(n)) return; seen.add(n);
      out.push({n, date: r.date, time: r.time, club: r.club, cap: +r.cap, players: +r.players, place: +r.place, wins: +r.wins, losses: +r.losses, rating_before: +r.rating_before, delta: +r.delta, rating_after: +r.rating_after});
    });
    return out.sort((a, b) => a.n - b.n);
  },
});
dash.calc('r_dyn', {
  title: 'RTTF: динамика рейтинга',
  description: 'Изменение рейтинга за 10 турниров, 30 дней, с начала года, средний итог последних 20 турниров, лучший и худший турнир.',
  inputs: ['r_tournaments'],
  fn: (r_tournaments) => {
    const t = r_tournaments;
    if (!t.length) return [];
    const r1 = (v) => Math.round(v * 10) / 10;
    const last = t[t.length - 1];
    const cut30 = new Date(Date.parse(last.date) - 30 * 864e5).toISOString().slice(0, 10);
    const in30 = t.filter((r) => r.date > cut30);
    const ytdRows = t.filter((r) => r.date.slice(0, 4) === last.date.slice(0, 4));
    const best = t.reduce((a, r) => (r.delta > a.delta ? r : a), t[0]);
    const worst = t.reduce((a, r) => (r.delta < a.delta ? r : a), t[0]);
    const l20 = t.slice(-20);
    return [{
      last10: r1(t.slice(-10).reduce((a, r) => a + r.delta, 0)), last30: r1(in30.reduce((a, r) => a + r.delta, 0)), n30: in30.length,
      ytd: r1(last.rating_after - ytdRows[0].rating_before), n_ytd: ytdRows.length, avg20: r1(l20.reduce((a, r) => a + r.delta, 0) / l20.length),
      best: best.delta, best_date: best.date, worst: worst.delta, worst_date: worst.date,
    }];
  },
});
dash.calc('r_kpi', {
  title: 'RTTF: ключевые показатели',
  description: 'Процент побед, медали и отставание от пика.',
  inputs: ['r_tournaments', 'r_summary'],
  fn: (r_tournaments, r_summary) => {
    const s = r_summary[0] || {};
    const p = r_tournaments.map((r) => +r.place);
    return [{win_pct: Math.round(+s.wins / +s.games * 1000) / 10, gold: p.filter((x) => x === 1).length, silver: p.filter((x) => x === 2).length,
      bronze: p.filter((x) => x === 3).length, podium: p.filter((x) => x <= 3).length, from_peak: +s.rating - +s.max_rating}];
  },
});
dash.calc('r_years', {
  title: 'RTTF: итоги по годам',
  description: 'Турниры, победы, первые места и рейтинг по календарным годам.',
  inputs: ['r_tournaments'],
  fn: (r_tournaments) => [...d3.group(r_tournaments, (r) => r.date.slice(0, 4))].map(([year, rs]) => {
    const w = d3.sum(rs, (r) => r.wins), l = d3.sum(rs, (r) => r.losses);
    const start = rs[0].rating_before, end = Math.round(rs[rs.length - 1].rating_after);
    return {year, tournaments: rs.length, wins: w, losses: l, win_pct: Math.round(w / (w + l) * 1000) / 10, gold: rs.filter((r) => r.place === 1).length, rating_end: end, change: Math.round(end - start)};
  }).sort((a, b) => b.year.localeCompare(a.year)),
});
dash.calc('r_monthly', {
  title: 'RTTF: турниры по месяцам',
  description: 'Число турниров и суммарное изменение рейтинга за каждый месяц, включая пустые.',
  inputs: ['r_tournaments'],
  fn: (r_tournaments) => {
    const t = r_tournaments; if (!t.length) return [];
    const by = d3.rollup(t, (rs) => ({tournaments: rs.length, delta: Math.round(d3.sum(rs, (r) => r.delta) * 10) / 10}), (r) => r.date.slice(0, 7));
    const p = d3.utcParse('%Y-%m');
    return d3.utcMonth.range(p(t[0].date.slice(0, 7)), d3.utcMonth.offset(p(t[t.length - 1].date.slice(0, 7)), 1)).map((m) => {
      const k = d3.utcFormat('%Y-%m')(m); const v = by.get(k) || {tournaments: 0, delta: 0};
      return {month: k, tournaments: v.tournaments, delta: v.delta};
    });
  },
});
dash.calc('r_bands', {
  title: 'RTTF: победы по рейтингу соперника',
  description: 'Процент побед в каждом диапазоне рейтинга соперника.',
  inputs: ['r_opponents'],
  fn: (r_opponents) => [...r_opponents].sort((a, b) => +a.band_from - +b.band_from).map((r) => ({band: r.band, games: +r.games, wins: +r.wins, losses: +r.losses, win_pct: Math.round(+r.wins / +r.games * 1000) / 10})),
});
dash.calc('r_score_dist', {
  title: 'RTTF: распределение счёта',
  description: 'Сколько матчей закончилось каждым счётом.',
  inputs: ['r_opponents'],
  fn: (r_opponents) => [['3:0', 's30'], ['3:1', 's31'], ['3:2', 's32'], ['2:3', 's23'], ['1:3', 's13'], ['0:3', 's03']].map(([score, k]) => ({score, games: d3.sum(r_opponents, (r) => +r[k])})),
});
dash.calc('r_sets', {
  title: 'RTTF: сеты и счёт матчей',
  description: 'Победы и поражения по счёту, решающие пятые сеты и общий счёт по сетам.',
  inputs: ['r_opponents', 'r_clubs'],
  fn: (r_opponents, r_clubs) => {
    const s = (k) => d3.sum(r_opponents, (r) => +r[k]);
    const w30 = s('s30'), w31 = s('s31'), w32 = s('s32'), l23 = s('s23'), l13 = s('s13'), l03 = s('s03');
    const wins = w30 + w31 + w32, losses = l23 + l13 + l03;
    const sw = d3.sum(r_clubs, (r) => +r.sets_won), sl = d3.sum(r_clubs, (r) => +r.sets_lost);
    const pct = (a, b) => Math.round(a / b * 1000) / 10;
    return [{w30, w31, w32, l23, l13, l03, wins, losses, w30_share: pct(w30, wins), w31_share: pct(w31, wins), w32_share: pct(w32, wins),
      deciders: w32 + l23, decider_wins: w32, decider_pct: pct(w32, w32 + l23), sets_won: sw, sets_lost: sl, sets_pct: pct(sw, sw + sl)}];
  },
});
dash.calc('r_decider_bands', {
  title: 'RTTF: пятый сет по рейтингу соперника',
  description: 'Сколько матчей дошло до пятого сета и какая доля выиграна, по диапазонам рейтинга соперника.',
  inputs: ['r_opponents'],
  fn: (r_opponents) => [...r_opponents].sort((a, b) => +a.band_from - +b.band_from).map((r) => ({band: r.band, deciders: +r.s32 + +r.s23, wins: +r.s32, losses: +r.s23}))
    .filter((r) => r.deciders > 0).map((r) => ({...r, win_pct: Math.round(r.wins / r.deciders * 1000) / 10})),
});

/* helpers */
function msg(el, s) { const p = document.createElement('p'); p.className = 'tt-sub'; p.textContent = s; el.replaceChildren(p); }
function notOk(el, d) { if (d.status === 'ok') return false; msg(el, d.status === 'error' ? 'Не удалось загрузить данные.' : '—'); return true; }
function tipPos(tip, box, x, y) { const w = tip.offsetWidth, W = box.clientWidth; tip.style.left = Math.max(0, Math.min(W - w, x - w / 2)) + 'px'; tip.style.top = Math.max(-8, y - tip.offsetHeight - 14) + 'px'; }
function tipLines(tip, a, b, c) {
  tip.replaceChildren();
  const s1 = document.createElement('small'); s1.textContent = a;
  const s2 = document.createElement('b'); s2.textContent = b; s2.style.display = 'block';
  tip.append(s1, s2);
  if (c) { const s3 = document.createElement('small'); s3.textContent = c; tip.append(s3); }
}
function yGrid(svg, y, x0, x1, ticks) {
  const g = svg.append('g');
  y.ticks(ticks).forEach((v) => { g.append('line').attr('x1', x0).attr('x2', x1).attr('y1', y(v)).attr('y2', y(v)).attr('stroke', C.grid); g.append('text').attr('x', x0 - 8).attr('y', y(v) + 4).attr('text-anchor', 'end').text(v); });
}
function td(tr, v, cls) { const c = document.createElement('td'); c.textContent = v == null ? '—' : v; if (cls) c.className = cls; tr.append(c); return c; }
const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };
function text(name, src, field, fmt, cls) {
  dash.draw(name, (el) => {
    const d = dash.data(src);
    if (d.status !== 'ok' || !d.data || !d.data[0]) { el.textContent = '—'; return; }
    const v = d.data[0][field];
    el.textContent = v == null ? '—' : fmt ? fmt(v) : String(v);
    if (cls) { el.classList.remove('tt-good', 'tt-bad'); const c = cls(v); if (c) el.classList.add(c); }
  });
}
text('r-h-rating', 'r_summary', 'rating');
text('r-h-max', 'r_summary', 'max_rating');
text('r-h-30', 'r_dyn', 'last30', (v) => signed(+v), goodBad);
text('r-h-ytd', 'r_dyn', 'ytd', (v) => signed(+v), goodBad);
text('r-h-10', 'r_dyn', 'last10', (v) => signed(+v), goodBad);
text('r-d-avg', 'r_dyn', 'avg20', (v) => signed(+v), goodBad);
text('r-d-best', 'r_dyn', 'best', (v) => signed(+v));
text('r-d-bestdate', 'r_dyn', 'best_date', fmtDate);
text('r-d-worst', 'r_dyn', 'worst', (v) => signed(+v));
text('r-d-worstdate', 'r_dyn', 'worst_date', fmtDate);
text('r-k-tours', 'r_summary', 'tournaments');
text('r-k-first', 'r_summary', 'first_tournament', fmtDate);
text('r-k-games', 'r_summary', 'games', (v) => fmtInt(+v));
text('r-k-wins', 'r_summary', 'wins');
text('r-k-losses', 'r_summary', 'losses');
text('r-k-winpct', 'r_kpi', 'win_pct', ru);
text('r-k-rank', 'r_summary', 'rank', (v) => fmtInt(+v));
text('r-podium', 'r_kpi', 'podium');
text('r-podium-of', 'r_summary', 'tournaments');
text('r-gold', 'r_kpi', 'gold');
text('r-silver', 'r_kpi', 'silver');
text('r-bronze', 'r_kpi', 'bronze');
[['decpct', 'decider_pct', ru], ['decw', 'decider_wins'], ['dec', 'deciders'], ['w30', 'w30'], ['w31', 'w31'], ['w32', 'w32'], ['w30p', 'w30_share', ru], ['w31p', 'w31_share', ru], ['w32p', 'w32_share', ru],
  ['l23', 'l23'], ['l13', 'l13'], ['l03', 'l03'], ['ltot', 'losses'], ['sw', 'sets_won', (v) => fmtInt(+v)], ['sl', 'sets_lost', (v) => fmtInt(+v)], ['spct', 'sets_pct', ru]]
  .forEach(([n, f, fmt]) => text('r-s-' + n, 'r_sets', f, fmt));

/* range control */
window.ttRRange = window.ttRRange || 'all';
const rangeRows = (rows) => { const r = window.ttRRange; if (r === 'all' || !rows.length) return rows; const cut = d3.utcDay.offset(rows[rows.length - 1].dt, -+r); return rows.filter((x) => x.dt >= cut); };
document.querySelectorAll('[data-rrange]').forEach((b) => b.addEventListener('click', () => {
  window.ttRRange = b.getAttribute('data-rrange');
  document.querySelectorAll('[data-rrange]').forEach((x) => x.classList.toggle('on', x === b));
  window.ttAnimDone['r-rating'] = false; window.ttAnimDone['r-deltas'] = false;
  dash.draw('r-rating'); dash.draw('r-deltas');
}));
const parseD = d3.utcParse('%Y-%m-%d');
const tline = (r) => fmtDate(r.date) + ' · ' + r.club + ' (до ' + r.cap + ')';

dash.draw('r-rating', (el) => {
  const d = dash.data('r_tournaments');
  if (notOk(el, d)) return;
  const rows = rangeRows(d.data.map((r) => ({...r, dt: parseD(r.date)})));
  if (!rows.length) { msg(el, 'Турниров пока нет.'); return; }
  const W = el.clientWidth || 600, H = 320, m = {t: 30, r: 44, b: 28, l: 38};
  const x = d3.scaleUtc().domain(d3.extent(rows, (r) => r.dt)).range([m.l, W - m.r]);
  const y = d3.scaleLinear().domain([d3.min(rows, (r) => r.rating_after) - 8, d3.max(rows, (r) => r.rating_after) + 14]).nice().range([H - m.b, m.t]);
  const svg = d3.create('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Рейтинг RTTF после каждого турнира');
  const uid = 'r' + Math.random().toString(36).slice(2, 7);
  const defs = svg.append('defs');
  const ga = defs.append('linearGradient').attr('id', 'a' + uid).attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', 1);
  ga.append('stop').attr('offset', '0%').attr('stop-color', C.indigo).attr('stop-opacity', 0.45);
  ga.append('stop').attr('offset', '60%').attr('stop-color', C.teal).attr('stop-opacity', 0.08);
  ga.append('stop').attr('offset', '100%').attr('stop-color', C.teal).attr('stop-opacity', 0);
  const gl = defs.append('linearGradient').attr('id', 'l' + uid).attr('x1', 0).attr('x2', 1).attr('y1', 0).attr('y2', 0);
  gl.append('stop').attr('offset', '0%').attr('stop-color', C.indigo); gl.append('stop').attr('offset', '55%').attr('stop-color', C.blue); gl.append('stop').attr('offset', '100%').attr('stop-color', C.teal);
  const glow = defs.append('filter').attr('id', 'g' + uid).attr('x', '-20%').attr('y', '-20%').attr('width', '140%').attr('height', '140%');
  glow.append('feGaussianBlur').attr('stdDeviation', 5).attr('result', 'b');
  const mg = glow.append('feMerge'); mg.append('feMergeNode').attr('in', 'b'); mg.append('feMergeNode').attr('in', 'SourceGraphic');
  yGrid(svg, y, m.l, W - m.r, 5);
  svg.append('g').attr('transform', `translate(0,${H - m.b + 6})`).call(d3.axisBottom(x).ticks(Math.max(2, Math.floor(W / 120))).tickSize(0).tickPadding(6)).select('.domain').remove();
  const area = svg.append('path').datum(rows).attr('fill', `url(#a${uid})`).attr('d', d3.area().curve(d3.curveMonotoneX).x((r) => x(r.dt)).y0(H - m.b).y1((r) => y(r.rating_after)));
  const line = svg.append('path').datum(rows).attr('fill', 'none').attr('stroke', `url(#l${uid})`).attr('stroke-width', 2.6).attr('stroke-linecap', 'round').attr('filter', `url(#g${uid})`).attr('d', d3.line().curve(d3.curveMonotoneX).x((r) => x(r.dt)).y((r) => y(r.rating_after)));
  const peak = rows.reduce((a, r) => (r.rating_after > a.rating_after ? r : a), rows[0]);
  const lastR = rows[rows.length - 1];
  const marks = svg.append('g');
  if (peak !== lastR && Math.abs(x(peak.dt) - x(lastR.dt)) > 60) {
    marks.append('circle').attr('cx', x(peak.dt)).attr('cy', y(peak.rating_after)).attr('r', 9).attr('fill', C.green).attr('opacity', 0.18);
    marks.append('circle').attr('cx', x(peak.dt)).attr('cy', y(peak.rating_after)).attr('r', 4).attr('fill', C.green);
    marks.append('text').attr('class', 'tt-lbl').attr('x', x(peak.dt)).attr('y', y(peak.rating_after) - 14).attr('text-anchor', 'middle').text('пик ' + Math.round(peak.rating_after));
  }
  marks.append('circle').attr('cx', x(lastR.dt)).attr('cy', y(lastR.rating_after)).attr('r', 9).attr('fill', C.teal).attr('opacity', 0.2);
  marks.append('circle').attr('cx', x(lastR.dt)).attr('cy', y(lastR.rating_after)).attr('r', 4).attr('fill', '#fff');
  marks.append('text').attr('class', 'tt-lbl').attr('x', x(lastR.dt) + 10).attr('y', y(lastR.rating_after) + 4).text(Math.round(lastR.rating_after));
  const tip = mk('div', 'tt-tip'); tip.hidden = true;
  const guide = svg.append('line').attr('y1', m.t).attr('y2', H - m.b).attr('stroke', 'rgba(255,255,255,.25)').attr('stroke-dasharray', '2 4').style('display', 'none');
  const dot = svg.append('circle').attr('r', 5).attr('fill', '#fff').attr('stroke', C.blue).attr('stroke-width', 2.5).style('display', 'none');
  const bis = d3.bisector((r) => r.dt).center;
  svg.append('rect').attr('x', m.l).attr('y', 0).attr('width', W - m.l - m.r).attr('height', H).attr('fill', 'transparent')
    .on('pointermove', (ev) => {
      const [px] = d3.pointer(ev); const r = rows[bis(rows, x.invert(px))];
      guide.style('display', null).attr('x1', x(r.dt)).attr('x2', x(r.dt)); dot.style('display', null).attr('cx', x(r.dt)).attr('cy', y(r.rating_after));
      tip.hidden = false;
      tipLines(tip, tline(r), 'Рейтинг ' + ru(Math.round(r.rating_after * 10) / 10) + '  ' + signed(r.delta), r.place + ' место из ' + r.players + ' · матчи ' + r.wins + '–' + r.losses);
      tipPos(tip, el, x(r.dt) * el.clientWidth / W, y(r.rating_after) * el.clientWidth / W);
    })
    .on('pointerleave', () => { tip.hidden = true; dot.style('display', 'none'); guide.style('display', 'none'); });
  el.replaceChildren(svg.node(), tip);
  if (firstAnim('r-rating')) {
    const len = line.node().getTotalLength();
    line.attr('stroke-dasharray', `${len} ${len}`).attr('stroke-dashoffset', len).transition().duration(1400).ease(d3.easeCubicInOut).attr('stroke-dashoffset', 0).on('end', () => line.attr('stroke-dasharray', null));
    area.attr('opacity', 0).transition().delay(500).duration(1000).attr('opacity', 1);
    marks.attr('opacity', 0).transition().delay(1200).duration(500).attr('opacity', 1);
  }
});

dash.draw('r-deltas', (el) => {
  const d = dash.data('r_tournaments');
  if (notOk(el, d)) return;
  const rows = rangeRows(d.data.map((r) => ({...r, dt: parseD(r.date)})));
  if (!rows.length) { msg(el, 'Турниров пока нет.'); return; }
  const W = el.clientWidth || 600, H = 220, m = {t: 14, r: 10, b: 26, l: 38};
  const x = d3.scaleBand().domain(rows.map((r) => r.n)).range([m.l, W - m.r]).paddingInner(rows.length > 120 ? 0.15 : 0.3);
  const ext = d3.max(rows, (r) => Math.abs(r.delta)) || 1;
  const y = d3.scaleLinear().domain([-ext, ext]).nice().range([H - m.b, m.t]);
  const svg = d3.create('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Изменение рейтинга RTTF после каждого турнира');
  yGrid(svg, y, m.l, W - m.r, 4);
  svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', 'rgba(255,255,255,.25)');
  let lastX = -Infinity;
  const shown = rows.filter((r, i) => (i === 0 || r.date.slice(0, 7) !== rows[i - 1].date.slice(0, 7))).filter((r) => { const px = x(r.n); if (px - lastX < 54 || px > W - m.r - 34) return false; lastX = px; return true; });
  svg.append('g').selectAll('text').data(shown).join('text').attr('x', (r) => x(r.n)).attr('y', H - 6).text((r) => d3.utcFormat('%m.%y')(r.dt));
  const bw = Math.max(1, x.bandwidth());
  const bars = svg.append('g').selectAll('rect').data(rows).join('rect').attr('x', (r) => x(r.n)).attr('width', bw).attr('rx', Math.min(3, bw / 2)).attr('fill', (r) => (r.delta >= 0 ? C.green : C.red)).attr('opacity', 0.9);
  const setH = (sel) => sel.attr('y', (r) => Math.min(y(0), y(r.delta))).attr('height', (r) => Math.max(1, Math.abs(y(r.delta) - y(0))));
  const tip = mk('div', 'tt-tip'); tip.hidden = true;
  bars.on('pointerenter', (ev, r) => {
    bars.attr('opacity', (b) => (b === r ? 1 : 0.45)); tip.hidden = false;
    tipLines(tip, tline(r), signed(r.delta) + ' → ' + ru(Math.round(r.rating_after * 10) / 10), r.place + ' место из ' + r.players + ' · матчи ' + r.wins + '–' + r.losses);
    tipPos(tip, el, (x(r.n) + bw / 2) * el.clientWidth / W, Math.min(y(0), y(r.delta)) * el.clientWidth / W);
  }).on('pointerleave', () => { tip.hidden = true; bars.attr('opacity', 0.9); });
  el.replaceChildren(svg.node(), tip);
  if (firstAnim('r-deltas')) bars.attr('y', y(0)).attr('height', 0).transition().delay((r, i) => i * Math.min(12, 900 / rows.length)).duration(600).call(setH);
  else setH(bars);
});

dash.draw('r-monthly', (el) => {
  const d = dash.data('r_monthly');
  if (notOk(el, d)) return;
  const rows = d.data, parse = d3.utcParse('%Y-%m');
  if (!rows.length) { msg(el, 'Пока нет данных.'); return; }
  const W = el.clientWidth || 600, H = 220, m = {t: 10, r: 8, b: 26, l: 30};
  const x = d3.scaleBand().domain(rows.map((r) => r.month)).range([m.l, W - m.r]).padding(0.22);
  const y = d3.scaleLinear().domain([0, d3.max(rows, (r) => r.tournaments) || 1]).nice().range([H - m.b, m.t]);
  const svg = d3.create('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Турниры RTTF по месяцам');
  yGrid(svg, y, m.l, W - m.r, 4);
  svg.append('g').selectAll('text').data(rows.filter((r) => r.month.endsWith('-01'))).join('text').attr('x', (r) => x(r.month)).attr('y', H - 6).text((r) => r.month.slice(0, 4));
  const tip = mk('div', 'tt-tip'); tip.hidden = true;
  const bw = x.bandwidth();
  const bars = svg.append('g').selectAll('rect').data(rows.filter((r) => r.tournaments > 0)).join('rect').attr('x', (r) => x(r.month)).attr('width', bw).attr('rx', Math.min(4, bw / 2)).attr('fill', (r) => (r.delta >= 0 ? C.green : C.red)).attr('opacity', 0.88);
  bars.on('pointerenter', (ev, r) => {
    bars.attr('opacity', (b) => (b === r ? 1 : 0.4)); tip.hidden = false;
    tipLines(tip, d3.utcFormat('%m.%Y')(parse(r.month)), r.tournaments + ' турниров', 'рейтинг за месяц ' + signed(r.delta));
    tipPos(tip, el, (x(r.month) + bw / 2) * el.clientWidth / W, y(r.tournaments) * el.clientWidth / W);
  }).on('pointerleave', () => { tip.hidden = true; bars.attr('opacity', 0.88); });
  el.replaceChildren(svg.node(), tip);
  const setH = (s) => s.attr('y', (r) => y(r.tournaments)).attr('height', (r) => y(0) - y(r.tournaments));
  if (firstAnim('r-monthly')) bars.attr('y', y(0)).attr('height', 0).transition().delay((r, i) => i * 18).duration(700).call(setH); else setH(bars);
});

function hbars(el, name, rows, opt) {
  const W = el.clientWidth || 400, rowH = 36, m = {t: 2, r: opt.right, b: 2, l: opt.left}, H = m.t + m.b + rows.length * rowH;
  const x = d3.scaleLinear().domain([0, opt.max || 1]).range([m.l, W - m.r]);
  const svg = d3.create('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', opt.aria);
  if (opt.ref !== undefined) svg.append('line').attr('x1', x(opt.ref)).attr('x2', x(opt.ref)).attr('y1', 0).attr('y2', H).attr('stroke', 'rgba(255,255,255,.22)').attr('stroke-dasharray', '2 4');
  const g = svg.append('g').selectAll('g').data(rows).join('g').attr('transform', (r, i) => `translate(0,${m.t + i * rowH})`);
  g.append('text').attr('class', opt.labelBold ? 'tt-lbl' : null).attr('x', m.l - 10).attr('y', rowH / 2 + 4).attr('text-anchor', 'end').text(opt.label);
  g.append('rect').attr('x', m.l).attr('y', 10).attr('height', rowH - 20).attr('width', W - m.l - m.r).attr('rx', (rowH - 20) / 2).attr('fill', 'rgba(255,255,255,.06)');
  const bar = g.append('rect').attr('x', m.l).attr('y', 10).attr('height', rowH - 20).attr('rx', (rowH - 20) / 2).attr('fill', opt.color).attr('opacity', opt.opacity || 1);
  g.append('text').attr('class', 'tt-lbl').attr('x', W - m.r + 10).attr('y', rowH / 2 + 4).text(opt.v1);
  g.append('text').attr('x', W - m.r + 56).attr('y', rowH / 2 + 4).text(opt.v2);
  el.replaceChildren(svg.node());
  const w = (r) => Math.max(rowH - 20, x(opt.value(r)) - m.l);
  if (firstAnim(name)) bar.attr('width', 0).transition().delay((r, i) => 80 * i).duration(800).attr('width', w); else bar.attr('width', w);
}
const bandColor = (r) => (r.win_pct >= 50 ? C.green : r.win_pct >= 30 ? C.blue : C.red);
dash.draw('r-bands', (el) => { const d = dash.data('r_bands'); if (notOk(el, d)) return;
  hbars(el, 'r-bands', d.data, {left: 64, right: 104, max: 100, ref: 50, aria: 'Процент побед по рейтингу соперника', label: (r) => r.band, value: (r) => r.win_pct, color: bandColor, v1: (r) => ru(r.win_pct) + '%', v2: (r) => r.games + ' игр'}); });
dash.draw('r-scores', (el) => { const d = dash.data('r_score_dist'); if (notOk(el, d)) return;
  const total = d3.sum(d.data, (r) => r.games); const op = {'3:0': 1, '3:1': 0.78, '3:2': 0.56, '2:3': 0.56, '1:3': 0.78, '0:3': 1};
  hbars(el, 'r-scores', d.data, {left: 44, right: 100, max: d3.max(d.data, (r) => r.games), aria: 'Распределение счёта матчей', labelBold: true, label: (r) => r.score, value: (r) => r.games,
    color: (r) => (r.score.startsWith('3') ? C.green : C.red), opacity: (r) => op[r.score], v1: (r) => r.games, v2: (r) => ru(Math.round(r.games / total * 1000) / 10) + '%'}); });
dash.draw('r-deciders', (el) => { const d = dash.data('r_decider_bands'); if (notOk(el, d)) return;
  hbars(el, 'r-deciders', d.data, {left: 64, right: 150, max: 100, ref: 50, aria: 'Процент выигранных пятых сетов', label: (r) => r.band, value: (r) => r.win_pct, color: bandColor, v1: (r) => ru(r.win_pct) + '%', v2: (r) => r.wins + '–' + r.losses + ' в 5-м сете'}); });

/* tables */
function balBar(tr, w, l) {
  const c = document.createElement('td'); const bar = mk('span', 'tt-bar');
  const a = document.createElement('i'); a.style.width = (w / (w + l) * 100) + '%'; a.style.background = C.green;
  const b = document.createElement('i'); b.style.width = (l / (w + l) * 100) + '%'; b.style.background = C.red;
  bar.append(a, b); c.append(bar); tr.append(c);
}
function table(name, src, rowFn) { dash.draw(name, (el) => { const d = dash.data(src); if (d.status !== 'ok') { el.replaceChildren(); return; } el.replaceChildren(...rowFn(d.data)); }); }
table('r-years', 'r_years', (rows) => rows.map((r) => {
  const tr = document.createElement('tr'); tr.dataset.key = encodeURIComponent(r.year);
  td(tr, r.year); td(tr, r.tournaments, 'r'); td(tr, r.wins, 'r'); td(tr, r.losses, 'r'); td(tr, ru(r.win_pct), 'r'); td(tr, r.gold, 'r'); td(tr, r.rating_end, 'r');
  td(tr, signed(r.change), 'r ' + (r.change >= 0 ? 'tt-good' : 'tt-bad')); return tr;
}));
table('r-rivals', 'r_rivals', (rows) => [...rows].sort((a, b) => b.games - a.games).map((r) => {
  const tr = document.createElement('tr'); tr.dataset.key = encodeURIComponent(r.rival); td(tr, r.rival); td(tr, r.rival_rating, 'r'); td(tr, r.wins, 'r'); td(tr, r.losses, 'r'); balBar(tr, +r.wins, +r.losses); return tr;
}));
table('r-bestwins', 'r_best_wins', (rows) => [...rows].sort((a, b) => b.opponent_rating - a.opponent_rating).map((r) => {
  const tr = document.createElement('tr'); tr.dataset.key = encodeURIComponent(r.date) + ',' + encodeURIComponent(r.opponent);
  td(tr, fmtDate(r.date)); td(tr, r.opponent); td(tr, r.opponent_rating, 'r'); td(tr, r.my_rating, 'r'); td(tr, r.score, 'r'); return tr;
}));
table('r-clubs', 'r_clubs', (rows) => [...rows].sort((a, b) => b.tournaments - a.tournaments).map((r) => {
  const tr = document.createElement('tr'); tr.dataset.key = encodeURIComponent(r.club); td(tr, r.club); td(tr, r.tournaments, 'r'); td(tr, r.games, 'r'); td(tr, r.wins, 'r'); td(tr, r.losses, 'r'); balBar(tr, +r.wins, +r.losses); return tr;
}));
table('r-recent', 'r_tournaments', (rows) => rows.slice(-12).reverse().map((r) => {
  const tr = document.createElement('tr'); tr.dataset.key = String(r.n);
  td(tr, fmtDate(r.date)); td(tr, r.club); td(tr, r.cap, 'r');
  const p = td(tr, r.place, 'r'); if (r.place <= 3) p.textContent = ['🥇', '🥈', '🥉'][r.place - 1] + ' ' + r.place;
  td(tr, r.players, 'r'); td(tr, r.wins, 'r'); td(tr, r.losses, 'r');
  const c = td(tr, signed(r.delta), 'r'); if (r.delta) c.classList.add(r.delta > 0 ? 'tt-good' : 'tt-bad'); return tr;
}));

/* last tournament */
const lastRows = () => { const d = dash.data('r_last'); return d.status === 'ok' ? [...d.data].sort((a, b) => (+a.i || 0) - (+b.i || 0)) : null; };
dash.draw('r-last-sub', (el) => { const rows = lastRows(); el.textContent = rows && rows.length ? fmtDate(rows[0].date) + ' · ' + rows[0].club + ' (до ' + rows[0].cap + ') · ' + rows[0].time : '—'; });
dash.draw('r-last', (el) => {
  const rows = lastRows();
  if (!rows) { notOk(el, dash.data('r_last')); return; }
  if (!rows.length) { msg(el, 'Матчей последнего турнира пока нет.'); return; }
  const t = (dash.data('r_tournaments').data || []).find((x) => x.date === rows[0].date && x.club === rows[0].club && x.cap === +rows[0].cap);
  const w = rows.filter((r) => +r.for > +r.against).length, l = rows.length - w;
  const sum = Math.round(rows.reduce((s, r) => s + (+r.delta || 0), 0) * 10) / 10;
  const chips = mk('div', 'tt-last-chips');
  const chip = (label, val, cls) => { const c = mk('div', 'tt-last-chip'); c.append(mk('span', null, label), mk('b', cls || null, val)); chips.append(c); };
  if (t) chip('Место', t.place + ' из ' + t.players);
  chip('Матчи', w + '–' + l);
  chip('Рейтинг за турнир', signed(t ? t.delta : sum), goodBad(t ? t.delta : sum));
  chip('Рейтинг до турнира', String(rows[0].my_rating));
  const wins = rows.filter((r) => +r.for > +r.against);
  if (wins.length) { const b = wins.reduce((a, r) => (+r.opp_rating > +a.opp_rating ? r : a)); chip('Лучшая победа', b.opp + ' · ' + b.opp_rating); }
  const list = mk('div', 'tt-last-list');
  let stage = null;
  rows.forEach((r) => {
    if (r.stage !== stage) { stage = r.stage; list.append(mk('p', 'tt-last-stage', stage || '')); }
    const won = +r.for > +r.against;
    const row = mk('div', 'tt-match');
    row.append(mk('div', 'tt-match-res ' + (won ? 'w' : 'l'), won ? 'В' : 'П'));
    const who = mk('div', 'tt-match-who'); who.append(mk('b', null, r.opp), mk('small', null, 'рейтинг ' + r.opp_rating + (r.dur ? ' · ' + r.dur : '')));
    row.append(who, mk('div', 'tt-match-score ' + (won ? 'tt-good' : 'tt-bad'), r.for + ':' + r.against), mk('div', 'tt-match-delta ' + goodBad(r.delta), signed(+r.delta)));
    list.append(row);
  });
  const parts = [chips, list];
  if (/^\d+$/.test(String(rows[0].tid || ''))) { const a = mk('a', 'tt-last-link', 'Турнир на rttf.ru ↗'); a.href = 'https://rttf.ru/tournaments/' + rows[0].tid; a.target = '_blank'; a.rel = 'noopener'; parts.push(a); }
  el.replaceChildren(...parts);
});

/* actions (Claude only): scheduled tasks through the Claude Code Remote connector */
const TRIG = {action: 'trig_0164EFga5zwQ2keDKHYgTPDX', update: 'trig_018nP2wD7DHPzhAv4ktPeDk1', autoreg: 'trig_01BSapjwb6TbHiE8LJaWuQUr'};
window.ttAct = window.ttAct || {up: {}, refresh: null};
const errText = (e) => {
  const c = e && e.code;
  if (c === 'server_not_connected' || c === 'server_not_found' || c === 'selection_required') return 'Не найден коннектор Claude Code Remote — напишите команду в чат.';
  if (c === 'needs_reauth') return 'Переподключите Claude Code Remote в настройках claude.ai.';
  if (c === 'not_in_manifest' || c === 'not_granted' || c === 'capability_disabled' || c === 'capability_removed' || c === 'consent_required') return 'Странице не разрешено запускать задачи — напишите команду в чат.';
  if (c === 'server_unavailable' || c === 'upstream_error') return 'Сервис не ответил. Если через пару минут ничего не изменится — нажмите ещё раз.';
  return 'Не получилось запустить: ' + ((e && e.message) || 'неизвестная ошибка');
};
async function fireTask(id, txt) {
  const mcpc = inClaude ? await claude.use('mcp') : null;
  if (!mcpc) throw {code: 'not_granted'};
  return mcpc.callTool('Claude Code Remote', 'fire_trigger', txt ? {trigger_id: id, text: txt} : {trigger_id: id});
}
dash.draw('r-refresh-msg', (el) => {
  const s = window.ttAct.refresh;
  el.className = 'tt-act-msg' + (s && s.state === 'err' ? ' err' : s && s.state === 'ok' ? ' ok' : '');
  el.textContent = !s ? '' : s.state === 'busy' ? 'Запускаю автозапись и обновление…' : s.state === 'ok' ? 'Запущено — данные обновятся через 5–7 минут' : s.msg;
});
document.querySelectorAll('[data-act="r-refresh"]').forEach((b) => b.addEventListener('click', async () => {
  if (window.ttAct.refresh && window.ttAct.refresh.state === 'busy') return;
  window.ttAct.refresh = {state: 'busy'}; b.disabled = true; dash.draw('r-refresh-msg');
  try { await fireTask(TRIG.autoreg); await fireTask(TRIG.update, 'Ручной запуск с кнопки «Обновить» на странице.'); window.ttAct.refresh = {state: 'ok'}; }
  catch (e) { window.ttAct.refresh = {state: 'err', msg: errText(e)}; }
  b.disabled = false; dash.draw('r-refresh-msg');
}));

/* upcoming tournaments */
window.ttUpOpen = window.ttUpOpen || {};
dash.draw('r-upcoming', (el) => {
  const d = dash.data('r_upcoming');
  if (d.status !== 'ok') { msg(el, d.status === 'error' ? 'Не удалось загрузить список турниров.' : '—'); return; }
  const today = new Date().toLocaleDateString('sv-SE', {timeZone: 'Europe/Moscow'});
  const rowsAll = d.data.filter((r) => String(r.date) >= today);
  if (!rowsAll.length) { msg(el, 'Пока нет заявок на турниры.'); return; }
  const mon = ['ЯНВ', 'ФЕВ', 'МАР', 'АПР', 'МАЙ', 'ИЮН', 'ИЮЛ', 'АВГ', 'СЕН', 'ОКТ', 'НОЯ', 'ДЕК'];
  const wd = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  const soonCut = new Date(Date.now() + 2 * 864e5).toLocaleDateString('sv-SE', {timeZone: 'Europe/Moscow'});
  const groups = [...d3.group(rowsAll, (r) => String(r.tid))].sort((a, b) => (a[1][0].date + a[1][0].time).localeCompare(b[1][0].date + b[1][0].time));
  el.replaceChildren(...groups.map(([tid, rs]) => {
    const t = rs.find((r) => r.status === 'info') || rs[0];
    const mineOut = rs.some((r) => r.mine === 'out');
    const all = rs.filter((r) => r.status !== 'info').map((r) => ({...r, n: +r.n, rating: +r.rating, me: r.me === '1' || r.me === 1, wait: r.status === 'wait'})).sort((a, b) => a.n - b.n);
    const players = all.filter((p) => !p.wait), waiting = all.filter((p) => p.wait);
    const meWait = waiting.find((p) => p.me), meRow = players.find((p) => p.me);
    const byRating = [...players].sort((a, b) => b.rating - a.rating);
    const seed = meRow ? byRating.indexOf(meRow) + 1 : null;
    const others = players.filter((p) => !p.me);
    const avg = others.length ? Math.round(d3.mean(others, (p) => p.rating)) : null;
    const stronger = meRow ? others.filter((p) => p.rating > meRow.rating).length : 0;
    const top = byRating[0];
    const dt = d3.utcParse('%Y-%m-%d')(t.date);
    const full = +t.registered >= +t.capacity;
    let pend = window.ttAct.up[tid];
    if (pend && pend.state === 'sent' && ((pend.action === 'unregister' && mineOut) || (pend.action === 'register' && !mineOut))) { delete window.ttAct.up[tid]; pend = null; }
    const det = document.createElement('details');
    if (mineOut) det.className = 'out';
    det.open = !!window.ttUpOpen[tid];
    det.addEventListener('toggle', () => { window.ttUpOpen[tid] = det.open; });
    const sum = document.createElement('summary');
    const cal = mk('div', 'tt-cal' + (String(t.date) <= soonCut ? ' soon' : ''));
    cal.append(mk('span', 'tt-cal-m', dt ? mon[dt.getUTCMonth()] : ''), mk('b', 'tt-cal-d', dt ? String(dt.getUTCDate()) : ''), mk('span', 'tt-cal-w', dt ? wd[dt.getUTCDay()] + ' · ' + t.time : ''));
    const main = mk('div', 'tt-up-main');
    main.append(mk('p', 'tt-up-title', t.club + ' · до ' + (+t.cap >= 9999 ? '∞' : t.cap)));
    const meta = mineOut ? 'Заявка снята · ' + players.length + ' участников' : meWait ? 'Я в листе ожидания: №' + (waiting.indexOf(meWait) + 1) : seed ? 'Я ' + seed + '-й по рейтингу из ' + players.length : players.length + ' участников';
    main.append(mk('p', 'tt-up-meta', meta + (top && !top.me ? ' · сильнейший ' + top.rating : top ? ' · я сильнейший' : '')));
    const pill = mineOut ? mk('span', 'tt-up-pill out', 'снят') : mk('span', 'tt-up-pill' + (full ? ' full' : ''), t.registered + '/' + t.capacity + (full ? ' · мест нет' : '') + (waiting.length ? ' · ' + waiting.length + ' в ожидании' : ''));
    sum.append(cal, main, pill, mk('span', 'tt-up-chev'));
    const body = mk('div', 'tt-up-body');
    if (inClaude) {
      const actions = mk('div', 'tt-up-actions');
      const action = mineOut ? 'register' : 'unregister';
      const send = async () => {
        window.ttAct.up[tid] = {state: 'busy', action}; dash.draw('r-upcoming');
        try { await fireTask(TRIG.action, action + ' ' + tid); window.ttAct.up[tid] = {state: 'sent', action, at: Date.now()}; }
        catch (e) { window.ttAct.up[tid] = {state: 'err', action, msg: errText(e)}; }
        dash.draw('r-upcoming');
      };
      if (pend && pend.state === 'confirm') {
        actions.append(mk('span', 'tt-act-msg', 'Снять заявку на этот турнир?'));
        const yes = mk('button', 'tt-btn danger', 'Да, снять'); yes.type = 'button';
        const no = mk('button', 'tt-btn ghost', 'Отмена'); no.type = 'button';
        yes.addEventListener('click', send); no.addEventListener('click', () => { delete window.ttAct.up[tid]; dash.draw('r-upcoming'); });
        actions.append(yes, no);
      } else if (pend && (pend.state === 'busy' || pend.state === 'sent')) {
        const b = mk('button', 'tt-btn ' + (pend.action === 'unregister' ? 'danger' : 'go')); b.type = 'button'; b.disabled = true;
        b.append(mk('span', 'tt-btn-ico', '↻'), document.createTextNode(pend.action === 'unregister' ? 'Снимаю заявку…' : 'Регистрирую…'));
        const late = pend.state === 'sent' && Date.now() - pend.at > 5 * 60e3;
        actions.append(b, mk('span', 'tt-act-msg', late ? 'Изменений пока нет — проверьте уведомление от задачи' : 'Обычно 1–2 минуты, список обновится сам'));
      } else {
        const b = mk('button', 'tt-btn ' + (mineOut ? 'go' : 'danger'), mineOut ? '＋ Зарегистрироваться' : '✕ Снять регистрацию'); b.type = 'button';
        b.addEventListener('click', () => { if (action === 'unregister') { window.ttAct.up[tid] = {state: 'confirm', action}; dash.draw('r-upcoming'); } else send(); });
        actions.append(b);
        if (pend && pend.state === 'err') actions.append(mk('span', 'tt-act-msg err', pend.msg));
      }
      body.append(actions);
    }
    const stats = mk('div', 'tt-up-stats');
    const chip = (label, val) => { const s = mk('span', null, label + ' '); s.append(mk('b', null, val)); return s; };
    if (avg !== null) stats.append(chip('Средний рейтинг соперников', String(avg)));
    if (meRow) stats.append(chip('Сильнее меня', String(stronger)), chip('Слабее или равны', String(others.length - stronger)));
    stats.append(chip('Свободных мест', String(Math.max(0, +t.capacity - +t.registered))));
    if (waiting.length) stats.append(chip('В листе ожидания', String(waiting.length)));
    const ref = meRow || meWait;
    const mkTable = (list) => {
      const wrap = mk('div', 'tt-tablewrap'); const tbl = mk('table', 'tt-table');
      const thead = document.createElement('thead'); const hr = document.createElement('tr');
      [['№', ''], ['Игрок', ''], ['Рейтинг', 'r'], ['Разница', 'r'], ['Регистрация', 'r']].forEach(([h, c]) => hr.append(mk('th', c, h)));
      thead.append(hr); const tb = document.createElement('tbody');
      list.forEach((p, i) => {
        const tr = document.createElement('tr'); if (p.me) tr.className = 'me';
        td(tr, i + 1); td(tr, p.player + (p.me ? ' (я)' : '')); td(tr, p.rating, 'r');
        const diff = ref && !p.me ? p.rating - ref.rating : null;
        const c = td(tr, diff === null ? '' : signed(diff), 'r'); if (diff) c.classList.add(diff > 0 ? 'tt-bad' : 'tt-good');
        td(tr, p.reg_at, 'r'); tb.append(tr);
      });
      tbl.append(thead, tb); wrap.append(tbl); return wrap;
    };
    body.append(stats);
    if (players.length) body.append(mkTable(players));
    if (waiting.length) body.append(mk('p', 'tt-up-wait', 'Лист ожидания · ' + waiting.length), mkTable(waiting));
    if (/^https:\/\//.test(t.url)) { const a = mk('a', 'tt-up-link', 'Открыть турнир на RTTF ↗'); a.href = t.url; a.target = '_blank'; a.rel = 'noopener'; body.append(a); }
    det.append(sum, body);
    return det;
  }));
});
})();
