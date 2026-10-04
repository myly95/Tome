/* Mesure : graphiques en SVG (aucune dépendance). Les couleurs suivent le thème du site (variables CSS). */
(function (root) {
  'use strict';
  const W = 680, H = 380, M = { l: 64, r: 24, t: 46, b: 56 };
  const PAL = ['#b5442c', '#14213d', '#c8962e', '#3f8a5a', '#7a5a9c', '#2b5c8a', '#a1661b', '#6b7286'];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = v => {
    if (v == null || !isFinite(v)) return '';
    const a = Math.abs(v);
    return Number(v.toPrecision(a >= 1e5 || (a < 1e-3 && a > 0) ? 3 : 4)).toLocaleString('fr-FR', { maximumFractionDigits: 6 });
  };
  function ticks(min, max, n = 6) {
    if (min === max) { min -= 1; max += 1; }
    const span = max - min, step0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= n) || 10 * mag;
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, out = [];
    for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v / step) * step);
    return { lo, hi, values: out };
  }
  function frame(titre, inner, extra = '') {
    return `<svg class="mesure-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(titre)}" xmlns="http://www.w3.org/2000/svg">
<style>.mesure-svg text{font-family:'Instrument Sans',system-ui,sans-serif;fill:var(--ink,#14213d)}.mesure-svg .ax{stroke:var(--ink-soft,#3d4a66);stroke-width:1}.mesure-svg .gr{stroke:var(--line,#e2dccd);stroke-width:1}.mesure-svg .lab{font-size:12px;fill:var(--ink-soft,#3d4a66)}.mesure-svg .ti{font-size:15px;font-weight:600}</style>
<rect x="0" y="0" width="${W}" height="${H}" fill="var(--card,#fbf8f2)"/>
<text class="ti" x="${W / 2}" y="26" text-anchor="middle">${esc(titre)}</text>${inner}${extra}</svg>`;
  }
  function axes(xr, yr, { axeX = '', axeY = '', xCats = null, yTicks = true } = {}) {
    const pw = W - M.l - M.r, ph = H - M.t - M.b;
    const X = v => M.l + (v - xr.lo) / (xr.hi - xr.lo) * pw;
    const Y = v => M.t + ph - (v - yr.lo) / (yr.hi - yr.lo) * ph;
    let s = '';
    if (yTicks) yr.values.forEach(v => { s += `<line class="gr" x1="${M.l}" x2="${M.l + pw}" y1="${Y(v)}" y2="${Y(v)}"/><text class="lab" x="${M.l - 8}" y="${Y(v) + 4}" text-anchor="end">${fmt(v)}</text>`; });
    if (!xCats) xr.values.forEach(v => { s += `<text class="lab" x="${X(v)}" y="${M.t + ph + 18}" text-anchor="middle">${fmt(v)}</text>`; });
    s += `<line class="ax" x1="${M.l}" x2="${M.l + pw}" y1="${M.t + ph}" y2="${M.t + ph}"/><line class="ax" x1="${M.l}" x2="${M.l}" y1="${M.t}" y2="${M.t + ph}"/>`;
    if (axeX) s += `<text class="lab" x="${M.l + pw / 2}" y="${H - 12}" text-anchor="middle">${esc(axeX)}</text>`;
    if (axeY) s += `<text class="lab" transform="translate(16 ${M.t + ph / 2}) rotate(-90)" text-anchor="middle">${esc(axeY)}</text>`;
    return { s, X, Y, pw, ph };
  }
  const extent = (a, pad = 0.05) => { const v = a.filter(x => x != null && isFinite(x)); let lo = Math.min(...v), hi = Math.max(...v); const d = (hi - lo) || Math.abs(hi) || 1; return [lo - d * pad, hi + d * pad]; };
  let uid = 0;
  const normPdf = z => Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);

  function barres(g) {
    const yr = ticks(0, Math.max(...g.valeurs));
    const a = axes({ lo: 0, hi: 1, values: [] }, yr, { axeY: g.axeY, xCats: g.categories });
    const n = g.categories.length, bw = a.pw / n;
    let s = a.s;
    g.categories.forEach((c, i) => {
      const x = M.l + i * bw + bw * 0.15, y = a.Y(g.valeurs[i]);
      s += `<rect x="${x}" y="${y}" width="${bw * 0.7}" height="${a.Y(0) - y}" fill="${PAL[0]}" rx="3"><title>${esc(c)} : ${fmt(g.valeurs[i])}</title></rect>`;
      if (n <= 24) s += `<text class="lab" x="${x + bw * 0.35}" y="${M.t + a.ph + 18}" text-anchor="middle">${esc(String(c).slice(0, 12))}</text>`;
    });
    return frame(g.titre, s);
  }
  function histogramme(g) {
    const v = g.values, n = v.length;
    let lo = Math.min(...v), hi = Math.max(...v);
    (g.lignes || []).forEach(l => { lo = Math.min(lo, l.x); hi = Math.max(hi, l.x); });
    const k = Math.max(5, Math.min(20, Math.ceil(Math.log2(n) + 1)));
    const t = ticks(lo, hi, k), width = (t.values[1] - t.values[0]) || 1;
    const bins = [];
    for (let b = t.lo; b < t.hi - width / 2; b += width) bins.push({ a: b, b: b + width, n: 0 });
    if (!bins.length) bins.push({ a: lo - 0.5, b: hi + 0.5, n: 0 });
    v.forEach(x => { const i = Math.min(bins.length - 1, Math.max(0, Math.floor((x - bins[0].a) / width))); bins[i].n++; });
    let ymax = Math.max(...bins.map(b => b.n));
    if (g.normale && g.normale.ecart > 0) ymax = Math.max(ymax, n * width * normPdf(0) / g.normale.ecart);
    const xr = { lo: bins[0].a, hi: bins[bins.length - 1].b, values: ticks(bins[0].a, bins[bins.length - 1].b).values.filter(x => x >= bins[0].a && x <= bins[bins.length - 1].b) };
    const a = axes(xr, ticks(0, ymax), { axeX: g.axeX, axeY: 'Effectif' });
    let s = a.s;
    bins.forEach(b => { const y = a.Y(b.n); s += `<rect x="${a.X(b.a) + 1}" y="${y}" width="${Math.max(1, a.X(b.b) - a.X(b.a) - 2)}" height="${a.Y(0) - y}" fill="${PAL[0]}" opacity=".85"><title>[${fmt(b.a)} ; ${fmt(b.b)}[ : ${b.n}</title></rect>`; });
    if (g.normale && g.normale.ecart > 0) {
      let d = '';
      for (let i = 0; i <= 80; i++) { const x = xr.lo + (xr.hi - xr.lo) * i / 80; const y = n * width * normPdf((x - g.normale.moyenne) / g.normale.ecart) / g.normale.ecart; d += (i ? 'L' : 'M') + a.X(x).toFixed(1) + ' ' + a.Y(y).toFixed(1); }
      s += `<path d="${d}" fill="none" stroke="${PAL[1]}" stroke-width="2"/>`;
    }
    (g.lignes || []).forEach(l => { s += `<line x1="${a.X(l.x)}" x2="${a.X(l.x)}" y1="${M.t}" y2="${M.t + a.ph}" stroke="${PAL[2]}" stroke-width="2" stroke-dasharray="6 4"/><text class="lab" x="${a.X(l.x)}" y="${M.t - 4}" text-anchor="middle">${esc(l.label)}</text>`; });
    return frame(g.titre, s);
  }
  function nuage(g) {
    const cid = 'mz' + (++uid);
    const [x0, x1] = extent(g.x), [y0, y1] = extent(g.y);
    const xr = ticks(x0, x1), yr = ticks(y0, y1);
    const a = axes(xr, yr, { axeX: g.axeX, axeY: g.axeY });
    let s = a.s;
    if (g.ligneZero && yr.lo < 0 && yr.hi > 0) s += `<line x1="${M.l}" x2="${M.l + a.pw}" y1="${a.Y(0)}" y2="${a.Y(0)}" stroke="${PAL[1]}" stroke-dasharray="4 4"/>`;
    if (g.droite) s += `<line x1="${a.X(xr.lo)}" y1="${a.Y(g.droite.a + g.droite.b * xr.lo)}" x2="${a.X(xr.hi)}" y2="${a.Y(g.droite.a + g.droite.b * xr.hi)}" stroke="${PAL[1]}" stroke-width="2" clip-path="url(#${cid})"/>`;
    g.x.forEach((x, i) => { s += `<circle cx="${a.X(x)}" cy="${a.Y(g.y[i])}" r="4" fill="${PAL[0]}" opacity=".8"><title>(${fmt(x)} ; ${fmt(g.y[i])})</title></circle>`; });
    const clip = `<defs><clipPath id="${cid}"><rect x="${M.l}" y="${M.t}" width="${a.pw}" height="${a.ph}"/></clipPath></defs>`;
    const eq = g.droite ? `<text class="lab" x="${W - M.r}" y="${M.t - 6}" text-anchor="end">y = ${fmt(g.droite.a)} ${g.droite.b < 0 ? '−' : '+'} ${fmt(Math.abs(g.droite.b))} x</text>` : '';
    return frame(g.titre, clip + s + eq);
  }
  function probabilite(g) {
    const cid = 'mp' + (++uid);
    const xs = g.points.map(p => p.x), [x0, x1] = extent(xs);
    const xr = ticks(x0, x1);
    const pct = [1, 5, 10, 20, 30, 50, 70, 80, 90, 95, 99];
    const zs = g.points.map(p => p.z), zmax = Math.max(2.5, ...zs.map(Math.abs));
    const yr = { lo: -zmax, hi: zmax, values: [] };
    const a = axes(xr, yr, { axeX: g.axeX, axeY: 'Pourcentage', yTicks: false });
    let s = a.s;
    const inv = window.Mesure ? window.Mesure.lois.normInv : null;
    pct.forEach(p => { const z = inv ? inv(p / 100) : 0; if (Math.abs(z) <= zmax) s += `<line class="gr" x1="${M.l}" x2="${M.l + a.pw}" y1="${a.Y(z)}" y2="${a.Y(z)}"/><text class="lab" x="${M.l - 8}" y="${a.Y(z) + 4}" text-anchor="end">${p}</text>`; });
    const zl = -zmax, zh = zmax;
    s += `<line x1="${a.X(g.moyenne + zl * g.ecart)}" y1="${a.Y(zl)}" x2="${a.X(g.moyenne + zh * g.ecart)}" y2="${a.Y(zh)}" stroke="${PAL[1]}" stroke-width="2" clip-path="url(#${cid})"/>`;
    g.points.forEach(p => { s += `<circle cx="${a.X(p.x)}" cy="${a.Y(p.z)}" r="4" fill="${PAL[0]}"><title>${fmt(p.x)}</title></circle>`; });
    return frame(g.titre, `<defs><clipPath id="${cid}"><rect x="${M.l}" y="${M.t}" width="${a.pw}" height="${a.ph}"/></clipPath></defs>` + s);
  }
  function boites(g) {
    const series = g.series.filter(x => x.values.length);
    const all = series.flatMap(x => x.values), [y0, y1] = extent(all);
    const yr = ticks(y0, y1);
    const a = axes({ lo: 0, hi: 1, values: [] }, yr, { xCats: true });
    const n = series.length, bw = a.pw / n;
    const q = (s, p) => { const pos = (s.length + 1) * p; if (pos <= 1) return s[0]; if (pos >= s.length) return s[s.length - 1]; const k = Math.floor(pos); return s[k - 1] + (pos - k) * (s[k] - s[k - 1]); };
    let s = a.s;
    series.forEach((ser, i) => {
      const v = [...ser.values].sort((x, y) => x - y), q1 = q(v, .25), q2 = q(v, .5), q3 = q(v, .75), iqr = q3 - q1;
      const lo = v.find(x => x >= q1 - 1.5 * iqr), hi = [...v].reverse().find(x => x <= q3 + 1.5 * iqr);
      const cx = M.l + (i + 0.5) * bw, w = Math.min(70, bw * 0.5), col = PAL[i % PAL.length];
      s += `<line x1="${cx}" x2="${cx}" y1="${a.Y(hi)}" y2="${a.Y(q3)}" stroke="${col}" stroke-width="1.5"/><line x1="${cx}" x2="${cx}" y1="${a.Y(q1)}" y2="${a.Y(lo)}" stroke="${col}" stroke-width="1.5"/>`;
      s += `<line x1="${cx - w / 4}" x2="${cx + w / 4}" y1="${a.Y(hi)}" y2="${a.Y(hi)}" stroke="${col}" stroke-width="1.5"/><line x1="${cx - w / 4}" x2="${cx + w / 4}" y1="${a.Y(lo)}" y2="${a.Y(lo)}" stroke="${col}" stroke-width="1.5"/>`;
      s += `<rect x="${cx - w / 2}" y="${a.Y(q3)}" width="${w}" height="${Math.max(1, a.Y(q1) - a.Y(q3))}" fill="${col}" fill-opacity=".18" stroke="${col}" stroke-width="1.5"><title>${esc(ser.nom)} : Q1 ${fmt(q1)}, médiane ${fmt(q2)}, Q3 ${fmt(q3)}</title></rect>`;
      s += `<line x1="${cx - w / 2}" x2="${cx + w / 2}" y1="${a.Y(q2)}" y2="${a.Y(q2)}" stroke="${col}" stroke-width="2.5"/>`;
      const m = ser.values.reduce((t, x) => t + x, 0) / ser.values.length;
      s += `<circle cx="${cx}" cy="${a.Y(m)}" r="3.5" fill="var(--card,#fff)" stroke="${col}" stroke-width="1.5"><title>Moyenne ${fmt(m)}</title></circle>`;
      v.filter(x => x < lo || x > hi).forEach(x => { s += `<text x="${cx}" y="${a.Y(x) + 4}" text-anchor="middle" fill="${col}" font-size="13">*</text>`; });
      s += `<text class="lab" x="${cx}" y="${M.t + a.ph + 18}" text-anchor="middle">${esc(String(ser.nom).slice(0, 16))}</text>`;
    });
    return frame(g.titre, s);
  }
  function controle(g) {
    const vals = g.valeurs, n = vals.length;
    const arr = v => Array.isArray(v) ? v : vals.map(() => v);
    const lsc = arr(g.lsc), lic = arr(g.lic);
    const [y0, y1] = extent([...vals, ...lsc, ...lic, g.centre].filter(v => v != null), 0.1);
    const xr = ticks(1, n), yr = ticks(y0, y1);
    xr.lo = Math.max(0.5, Math.min(xr.lo, 1)); xr.hi = n + 0.5; xr.values = xr.values.filter(v => v >= 1 && v <= n && Number.isInteger(v));
    const a = axes(xr, yr, { axeX: g.axeX || 'Observation', axeY: g.axeY });
    let s = a.s;
    const step = (lim, color, dash) => { let d = ''; lim.forEach((v, i) => { if (v == null) return; const x0 = a.X(i + 0.5), x1 = a.X(i + 1.5); d += `M${x0} ${a.Y(v)}L${x1} ${a.Y(v)}`; }); return `<path d="${d}" stroke="${color}" stroke-width="1.5" fill="none" ${dash ? 'stroke-dasharray="6 4"' : ''}/>`; };
    s += step(lsc, PAL[0], true) + step(lic, PAL[0], true);
    s += `<line x1="${a.X(0.5)}" x2="${a.X(n + 0.5)}" y1="${a.Y(g.centre)}" y2="${a.Y(g.centre)}" stroke="${PAL[3]}" stroke-width="1.5"/>`;
    let d = '';
    vals.forEach((v, i) => { if (v == null) return; d += (d ? 'L' : 'M') + a.X(i + 1) + ' ' + a.Y(v); });
    s += `<path d="${d}" fill="none" stroke="${PAL[1]}" stroke-width="1.5"/>`;
    vals.forEach((v, i) => { if (v == null) return; const out = v > lsc[i] + 1e-12 || v < lic[i] - 1e-12; s += `<circle cx="${a.X(i + 1)}" cy="${a.Y(v)}" r="${out ? 5 : 3.5}" fill="${out ? PAL[0] : PAL[1]}"><title>${i + 1} : ${fmt(v)}</title></circle>`; });
    const lab = (t, v) => `<text class="lab" x="${W - M.r + 2}" y="${a.Y(v) - 4}" text-anchor="end">${t}=${fmt(v)}</text>`;
    if (!Array.isArray(g.lsc)) s += lab('LSC', g.lsc) + lab('LIC', g.lic);
    s += lab(g.axeY && g.axeY.includes('Proportion') ? 'P̄' : 'Centre', g.centre);
    return frame(g.titre, s);
  }
  function pareto(g) {
    const tot = g.valeurs.reduce((s, v) => s + v, 0);
    const yr = ticks(0, tot);
    const a = axes({ lo: 0, hi: 1, values: [] }, yr, { axeY: 'Effectif', xCats: true });
    const n = g.categories.length, bw = a.pw / n;
    let s = a.s, cum = 0, d = '';
    g.categories.forEach((c, i) => {
      const x = M.l + i * bw, y = a.Y(g.valeurs[i]);
      s += `<rect x="${x + bw * 0.08}" y="${y}" width="${bw * 0.84}" height="${a.Y(0) - y}" fill="${PAL[0]}"><title>${esc(c)} : ${fmt(g.valeurs[i])}</title></rect>`;
      s += `<text class="lab" x="${x + bw / 2}" y="${M.t + a.ph + 18}" text-anchor="middle">${esc(String(c).slice(0, 12))}</text>`;
      cum += g.valeurs[i];
      d += (i ? 'L' : 'M') + (x + bw / 2) + ' ' + a.Y(cum);
    });
    s += `<path d="${d}" fill="none" stroke="${PAL[1]}" stroke-width="2"/>`;
    [0, 25, 50, 75, 100].forEach(p => { s += `<text class="lab" x="${W - M.r + 2}" y="${a.Y(tot * p / 100) + 4}" text-anchor="end">${p} %</text>`; });
    cum = 0;
    g.categories.forEach((c, i) => { cum += g.valeurs[i]; s += `<circle cx="${M.l + i * bw + bw / 2}" cy="${a.Y(cum)}" r="3.5" fill="${PAL[1]}"/>`; });
    return frame(g.titre, s);
  }
  function serie(g) {
    const all = g.series.flatMap(x => x.values).filter(v => v != null);
    const n = Math.max(...g.series.map(x => x.values.length));
    const a = axes(ticks(1, n), ticks(...extent(all)), { axeX: g.axeX });
    let s = a.s;
    g.series.forEach((ser, k) => {
      let d = '';
      ser.values.forEach((v, i) => { if (v != null) d += (d ? 'L' : 'M') + a.X(i + 1) + ' ' + a.Y(v); });
      s += `<path d="${d}" fill="none" stroke="${PAL[k % PAL.length]}" stroke-width="2"/>`;
      ser.values.forEach((v, i) => { if (v != null) s += `<circle cx="${a.X(i + 1)}" cy="${a.Y(v)}" r="3" fill="${PAL[k % PAL.length]}"/>`; });
      if (g.series.length > 1) s += `<text x="${M.l + 10 + k * 120}" y="${M.t - 8}" font-size="12" fill="${PAL[k % PAL.length]}">● ${esc(ser.nom)}</text>`;
    });
    return frame(g.titre, s);
  }
  function secteurs(g) {
    const tot = g.valeurs.reduce((s, v) => s + v, 0), cx = 230, cy = H / 2 + 14, r = 130;
    let s = '', ang = -Math.PI / 2;
    g.valeurs.forEach((v, i) => {
      const a2 = ang + 2 * Math.PI * v / tot, large = a2 - ang > Math.PI ? 1 : 0, col = PAL[i % PAL.length];
      if (g.valeurs.length === 1) s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${col}"/>`;
      else s += `<path d="M${cx} ${cy}L${cx + r * Math.cos(ang)} ${cy + r * Math.sin(ang)}A${r} ${r} 0 ${large} 1 ${cx + r * Math.cos(a2)} ${cy + r * Math.sin(a2)}Z" fill="${col}" stroke="var(--card,#fff)" stroke-width="2"><title>${esc(g.categories[i])} : ${fmt(v)}</title></path>`;
      const y = 80 + i * 24;
      if (i < 11) s += `<rect x="410" y="${y - 11}" width="14" height="14" rx="3" fill="${col}"/><text class="lab" x="432" y="${y}">${esc(String(g.categories[i]).slice(0, 22))} (${fmt(100 * v / tot)} %)</text>`;
      ang = a2;
    });
    return frame(g.titre, s);
  }
  const KINDS = { barres, histogramme, nuage, probabilite, boites, controle, pareto, serie, secteurs };
  function dessiner(spec) { const f = KINDS[spec.kind]; return f ? f(spec) : ''; }
  root.MesureGraphiques = { dessiner };
})(typeof self !== 'undefined' ? self : this);
