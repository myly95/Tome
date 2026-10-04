/* Mesure : bibliothèque statistique de Tòme (sans dépendance).
 * Lois de probabilité, statistiques descriptives, tests, régression, ANOVA, khi-deux,
 * maîtrise statistique des procédés (cartes de contrôle, capabilité, Pareto).
 * Chaque analyse renvoie un objet { titre, blocs: [...] } que l'interface affiche dans la fenêtre de session.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Mesure = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ================= Fonctions spéciales ================= */
  function lgamma(x) {
    const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
      12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
    x -= 1;
    let a = c[0];
    const t = x + g + 0.5;
    for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  /* Gamma incomplète régularisée P(a, x) */
  function gammainc(a, x) {
    if (x <= 0) return 0;
    if (x < a + 1) {
      let sum = 1 / a, del = sum, ap = a;
      for (let n = 0; n < 1000; n++) { ap += 1; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-15) break; }
      return sum * Math.exp(-x + a * Math.log(x) - lgamma(a));
    }
    let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d;
    for (let i = 1; i < 1000; i++) {
      const an = -i * (i - a); b += 2;
      d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d; const del = d * c; h *= del;
      if (Math.abs(del - 1) < 1e-15) break;
    }
    return 1 - Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
  }
  /* Bêta incomplète régularisée I_x(a, b) */
  function betacf(a, b, x) {
    const qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    d = 1 / d; let h = d;
    for (let m = 1; m <= 1000; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d; const del = d * c; h *= del;
      if (Math.abs(del - 1) < 1e-15) break;
    }
    return h;
  }
  function betai(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
  }

  /* ================= Lois ================= */
  const erf = x => (x >= 0 ? 1 : -1) * gammainc(0.5, x * x);
  const normCdf = z => z < -8 ? 0 : z > 8 ? 1 : 0.5 * (1 + erf(z / Math.SQRT2));
  const normPdf = z => Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
  function normInv(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    const pl = 0.02425;
    let q, x;
    if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    else if (p <= 1 - pl) { q = p - 0.5; const r = q * q; x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
    else { q = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    const e = normCdf(x) - p; // une itération de Halley
    const u = e * Math.sqrt(2 * Math.PI) * Math.exp(x * x / 2);
    return x - u / (1 + x * u / 2);
  }
  function tCdf(t, df) {
    if (!isFinite(t)) return t > 0 ? 1 : 0;
    const x = df / (df + t * t);
    const tail = 0.5 * betai(df / 2, 0.5, x);
    return t > 0 ? 1 - tail : tail;
  }
  const fCdf = (x, d1, d2) => x <= 0 ? 0 : betai(d1 / 2, d2 / 2, d1 * x / (d1 * x + d2));
  const chi2Cdf = (x, k) => x <= 0 ? 0 : gammainc(k / 2, x / 2);
  function invert(cdf, p, lo, hi) {
    for (let i = 0; i < 200 && cdf(hi) < p; i++) hi *= 2;
    for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (cdf(mid) < p) lo = mid; else hi = mid; if (hi - lo < 1e-12 * Math.max(1, Math.abs(mid))) break; }
    return (lo + hi) / 2;
  }
  const tInv = (p, df) => p === 0.5 ? 0 : p < 0.5 ? -tInv(1 - p, df) : invert(t => tCdf(t, df), p, 0, 10);
  const chi2Inv = (p, k) => invert(x => chi2Cdf(x, k), p, 0, Math.max(10, k * 3));
  const fInv = (p, d1, d2) => invert(x => fCdf(x, d1, d2), p, 0, 10);

  /* ================= Utilitaires ================= */
  const sum = a => a.reduce((s, x) => s + x, 0);
  const mean = a => sum(a) / a.length;
  const sorted = a => [...a].sort((x, y) => x - y);
  function variance(a) { const m = mean(a); return a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1); }
  const sd = a => Math.sqrt(variance(a));
  /* Quantile, méthode Minitab : position (n + 1) p avec interpolation */
  function quantileMinitab(s, p) {
    const n = s.length, pos = (n + 1) * p;
    if (pos <= 1) return s[0];
    if (pos >= n) return s[n - 1];
    const k = Math.floor(pos), f = pos - k;
    return s[k - 1] + f * (s[k] - s[k - 1]);
  }
  function median(a) { const s = sorted(a), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; }
  function skewness(a) { const n = a.length, m = mean(a), s = sd(a); return n < 3 || s === 0 ? NaN : n / ((n - 1) * (n - 2)) * a.reduce((t, x) => t + ((x - m) / s) ** 3, 0); }
  function kurtosis(a) {
    const n = a.length, m = mean(a), s = sd(a);
    if (n < 4 || s === 0) return NaN;
    return n * (n + 1) / ((n - 1) * (n - 2) * (n - 3)) * a.reduce((t, x) => t + ((x - m) / s) ** 4, 0) - 3 * (n - 1) ** 2 / ((n - 2) * (n - 3));
  }
  function modes(a) {
    const cnt = new Map(); a.forEach(x => cnt.set(x, (cnt.get(x) || 0) + 1));
    const max = Math.max(...cnt.values());
    if (max === 1) return { valeurs: [], n: 1 };
    return { valeurs: [...cnt.entries()].filter(([, c]) => c === max).map(([v]) => v).sort((x, y) => x - y), n: max };
  }
  const pAlt = (stat, cdf, alt) => alt === 'inf' ? cdf(stat) : alt === 'sup' ? 1 - cdf(stat) : 2 * Math.min(cdf(stat), 1 - cdf(stat));
  const ALT_TXT = { diff: '≠', inf: '<', sup: '>' };
  const need = (cond, msg) => { if (!cond) throw new Error(msg); };

  /* Résolution de systèmes linéaires (élimination de Gauss avec pivot) */
  function solve(A, b) {
    const n = A.length, M = A.map((r, i) => [...r, b[i]]);
    for (let i = 0; i < n; i++) {
      let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
      if (Math.abs(M[p][i]) < 1e-12) return null;
      [M[i], M[p]] = [M[p], M[i]];
      for (let r = 0; r < n; r++) if (r !== i) { const f = M[r][i] / M[i][i]; for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c]; }
    }
    return M.map((r, i) => r[n] / r[i]);
  }
  function inverse(A) {
    const n = A.length, cols = [];
    for (let j = 0; j < n; j++) { const e = Array(n).fill(0); e[j] = 1; const x = solve(A, e); if (!x) return null; cols.push(x); }
    return A.map((_, i) => cols.map(col => col[i]));
  }

  /* ================= Mise en forme des résultats ================= */
  const T = (titre, colonnes, lignes, note) => ({ type: 'table', titre, colonnes, lignes, note });
  const P = texte => ({ type: 'texte', texte });
  const G = spec => ({ type: 'graphique', ...spec });
  const pTxt = p => p < 0.001 ? '< 0,001' : p;

  /* ================= Analyses : statistiques de base ================= */
  function descriptives(cols) {
    need(cols.length, 'Choisissez au moins une colonne.');
    const lignes = cols.map(c => {
      const x = c.values, n = x.length;
      if (!n) return [c.nom, 0, c.manquants];
      const s = sorted(x), m = mean(x), v = n > 1 ? variance(x) : NaN, et = Math.sqrt(v);
      const q1 = quantileMinitab(s, 0.25), q3 = quantileMinitab(s, 0.75);
      const mo = modes(x);
      return [c.nom, n, c.manquants, m, et / Math.sqrt(n), et, v, m !== 0 ? 100 * et / m : NaN, s[0], q1, median(x), q3, s[n - 1], s[n - 1] - s[0], q3 - q1,
        mo.valeurs.length ? mo.valeurs.slice(0, 3).join(' ; ') + (mo.valeurs.length > 3 ? '…' : '') : 'aucun', skewness(x), kurtosis(x)];
    });
    return {
      titre: 'Statistiques descriptives',
      blocs: [T(null, ['Variable', 'N', 'N*', 'Moyenne', 'ErT moy.', 'ÉcTyp', 'Variance', 'CoefVar (%)', 'Minimum', 'Q1', 'Médiane', 'Q3', 'Maximum', 'Étendue', 'EIQ', 'Mode', 'Asymétrie', 'Aplatissement'], lignes,
        'N* = valeurs manquantes. Quartiles calculés comme Minitab. Asymétrie et aplatissement corrigés (comme Excel).')]
    };
  }

  function frequences(col) {
    need(col.values.length, 'La colonne est vide.');
    const cnt = new Map();
    col.values.forEach(v => cnt.set(v, (cnt.get(v) || 0) + 1));
    const entries = [...cnt.entries()].sort((a, b) => typeof a[0] === 'number' && typeof b[0] === 'number' ? a[0] - b[0] : String(a[0]).localeCompare(String(b[0]), 'fr'));
    const n = col.values.length; let cum = 0;
    const lignes = entries.map(([k, c]) => { cum += c; return [k, c, 100 * c / n, cum, 100 * cum / n]; });
    lignes.push(['Total', n, 100, null, null]);
    return {
      titre: 'Tableau de fréquences : ' + col.nom,
      blocs: [T(null, ['Valeur', 'Effectif', 'Pourcentage', 'Effectif cumulé', '% cumulé'], lignes),
        G({ kind: 'barres', titre: 'Diagramme en barres de ' + col.nom, categories: entries.map(e => String(e[0])), valeurs: entries.map(e => e[1]), axeY: 'Effectif' })]
    };
  }

  function correlation(cols) {
    need(cols.length >= 2, 'Choisissez au moins deux colonnes.');
    const k = cols.length, lignes = [];
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
      const pairs = pairUp(cols[i].values, cols[j].values);
      const n = pairs.x.length;
      if (n < 3) { lignes.push([cols[i].nom, cols[j].nom, n, null, null]); continue; }
      const r = pearson(pairs.x, pairs.y);
      const t = r * Math.sqrt((n - 2) / (1 - r * r));
      const p = Math.abs(r) >= 1 ? 0 : 2 * (1 - tCdf(Math.abs(t), n - 2));
      lignes.push([cols[i].nom, cols[j].nom, n, r, pTxt(p)]);
    }
    const blocs = [T('Corrélation de Pearson', ['Variable 1', 'Variable 2', 'N', 'r', 'Valeur de p'], lignes, 'Valeur de p < 0,05 : la corrélation est significative au seuil de 5 %.')];
    if (k === 2) {
      const pr = pairUp(cols[0].values, cols[1].values);
      blocs.push(G({ kind: 'nuage', titre: cols[1].nom + ' en fonction de ' + cols[0].nom, x: pr.x, y: pr.y, axeX: cols[0].nom, axeY: cols[1].nom, droite: linfit(pr.x, pr.y) }));
    }
    return { titre: 'Corrélation', blocs };
  }
  function pairUp(a, b) { const x = [], y = []; for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] != null && b[i] != null && isFinite(a[i]) && isFinite(b[i])) { x.push(a[i]); y.push(b[i]); } return { x, y }; }
  function pearson(x, y) { const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxy / Math.sqrt(sxx * syy); }
  function linfit(x, y) { const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0; for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; } const b = sxy / sxx; return { a: my - b * mx, b }; }

  /* Test de normalité d'Anderson-Darling (comme Minitab) */
  function andersonDarling(x) {
    const n = x.length, s = sorted(x), m = mean(x), et = sd(x);
    let A = 0;
    for (let i = 0; i < n; i++) {
      const Fi = Math.min(Math.max(normCdf((s[i] - m) / et), 1e-15), 1 - 1e-15);
      const Fj = Math.min(Math.max(normCdf((s[n - 1 - i] - m) / et), 1e-15), 1 - 1e-15);
      A += (2 * i + 1) * (Math.log(Fi) + Math.log(1 - Fj));
    }
    A = -n - A / n;
    const As = A * (1 + 0.75 / n + 2.25 / (n * n));
    let p;
    if (As >= 0.6) p = Math.exp(1.2937 - 5.709 * As + 0.0186 * As * As);
    else if (As >= 0.34) p = Math.exp(0.9177 - 4.279 * As - 1.38 * As * As);
    else if (As >= 0.2) p = 1 - Math.exp(-8.318 + 42.796 * As - 59.938 * As * As);
    else p = 1 - Math.exp(-13.436 + 101.14 * As - 223.73 * As * As);
    return { A, p: Math.min(Math.max(p, 0), 1) };
  }
  function normalite(col) {
    const x = col.values; need(x.length >= 3, 'Il faut au moins 3 valeurs.');
    const ad = andersonDarling(x);
    const s = sorted(x), n = x.length;
    const pts = s.map((v, i) => ({ x: v, z: normInv((i + 1 - 0.3) / (n + 0.4)) }));
    return {
      titre: 'Test de normalité : ' + col.nom,
      blocs: [
        T('Anderson-Darling', ['N', 'Moyenne', 'ÉcTyp', 'AD', 'Valeur de p'], [[n, mean(x), sd(x), ad.A, pTxt(ad.p)]]),
        P(ad.p < 0.05 ? 'Valeur de p < 0,05 : on rejette l’hypothèse de normalité. Les données ne semblent pas suivre une loi normale.'
          : 'Valeur de p ≥ 0,05 : rien ne permet de rejeter la normalité. Les données sont compatibles avec une loi normale.'),
        G({ kind: 'probabilite', titre: 'Droite de Henry (probabilité normale) de ' + col.nom, points: pts, moyenne: mean(x), ecart: sd(x), axeX: col.nom })
      ]
    };
  }

  function icMoyenne(col, conf = 0.95) {
    const x = col.values, n = x.length; need(n >= 2, 'Il faut au moins 2 valeurs.');
    const m = mean(x), se = sd(x) / Math.sqrt(n), t = tInv(1 - (1 - conf) / 2, n - 1);
    return { titre: 'Intervalle de confiance de la moyenne : ' + col.nom,
      blocs: [T(null, ['N', 'Moyenne', 'ÉcTyp', 'ErT moy.', `IC à ${fmtPct(conf)}`], [[n, m, sd(x), se, `(${fmtN(m - t * se)} ; ${fmtN(m + t * se)})`]])] };
  }
  const fmtN = v => Number(v.toPrecision(6)).toLocaleString('fr-FR', { maximumFractionDigits: 6 });
  const fmtPct = p => (p * 100).toLocaleString('fr-FR') + ' %';

  /* ================= Tests ================= */
  function test1t(col, mu0, alt = 'diff', conf = 0.95) {
    const x = col.values, n = x.length; need(n >= 2, 'Il faut au moins 2 valeurs.');
    const m = mean(x), s = sd(x), se = s / Math.sqrt(n), t = (m - mu0) / se, df = n - 1;
    const p = pAlt(t, v => tCdf(v, df), alt);
    const ic = bornes(m, se, df, conf, alt);
    return { titre: 'Test t à 1 échantillon : ' + col.nom, blocs: [
      P(`Hypothèse nulle H₀ : μ = ${fmtN(mu0)}. Hypothèse alternative H₁ : μ ${ALT_TXT[alt]} ${fmtN(mu0)}.`),
      T(null, ['N', 'Moyenne', 'ÉcTyp', 'ErT moy.', ic.label, 'T', 'DL', 'Valeur de p'], [[n, m, s, se, ic.txt, t, df, pTxt(p)]]),
      conclusion(p, 1 - conf)] };
  }
  function bornes(m, se, df, conf, alt) {
    const lab = `IC à ${fmtPct(conf)}`;
    if (alt === 'diff') { const t = tInv(1 - (1 - conf) / 2, df); return { label: lab, txt: `(${fmtN(m - t * se)} ; ${fmtN(m + t * se)})` }; }
    const t = tInv(conf, df);
    return alt === 'sup' ? { label: 'Borne inf. ' + fmtPct(conf), txt: fmtN(m - t * se) } : { label: 'Borne sup. ' + fmtPct(conf), txt: fmtN(m + t * se) };
  }
  function conclusion(p, alpha = 0.05) {
    return P(p < alpha ? `Valeur de p < ${String(alpha).replace('.', ',')} : on rejette H₀. La différence est statistiquement significative.`
      : `Valeur de p ≥ ${String(alpha).replace('.', ',')} : on ne peut pas rejeter H₀. Pas de différence significative mise en évidence.`);
  }
  function test2t(a, b, { egales = false, alt = 'diff', conf = 0.95 } = {}) {
    const x = a.values, y = b.values; need(x.length >= 2 && y.length >= 2, 'Chaque échantillon doit avoir au moins 2 valeurs.');
    const n1 = x.length, n2 = y.length, m1 = mean(x), m2 = mean(y), v1 = variance(x), v2 = variance(y);
    let se, df;
    if (egales) { const sp2 = ((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2); se = Math.sqrt(sp2 * (1 / n1 + 1 / n2)); df = n1 + n2 - 2; }
    else { se = Math.sqrt(v1 / n1 + v2 / n2); df = (v1 / n1 + v2 / n2) ** 2 / ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1)); }
    const d = m1 - m2, t = d / se, p = pAlt(t, v => tCdf(v, df), alt), ic = bornes(d, se, df, conf, alt);
    return { titre: 'Test t à 2 échantillons : ' + a.nom + ' et ' + b.nom, blocs: [
      T('Échantillons', ['Échantillon', 'N', 'Moyenne', 'ÉcTyp', 'ErT moy.'], [[a.nom, n1, m1, Math.sqrt(v1), Math.sqrt(v1 / n1)], [b.nom, n2, m2, Math.sqrt(v2), Math.sqrt(v2 / n2)]]),
      P(`Différence μ₁ − μ₂. H₀ : différence = 0. H₁ : différence ${ALT_TXT[alt]} 0. ${egales ? 'Variances supposées égales.' : 'Variances non supposées égales (Welch).'}`),
      T('Résultat', ['Différence', ic.label, 'T', 'DL', 'Valeur de p'], [[d, ic.txt, t, egales ? df : Math.floor(df * 1000) / 1000, pTxt(p)]]),
      conclusion(p, 1 - conf),
      G({ kind: 'boites', titre: 'Boîtes à moustaches', series: [{ nom: a.nom, values: x }, { nom: b.nom, values: y }] })] };
  }
  function testApparie(a, b, { alt = 'diff', conf = 0.95 } = {}) {
    const pr = pairUp(a.values, b.values); need(pr.x.length >= 2, 'Il faut au moins 2 paires complètes.');
    const d = pr.x.map((v, i) => v - pr.y[i]);
    const r = test1t({ nom: 'Différence', values: d }, 0, alt, conf);
    r.titre = 'Test t apparié : ' + a.nom + ' − ' + b.nom;
    r.blocs.unshift(T('Échantillons', ['Échantillon', 'N', 'Moyenne', 'ÉcTyp'], [[a.nom, pr.x.length, mean(pr.x), sd(pr.x)], [b.nom, pr.y.length, mean(pr.y), sd(pr.y)]]));
    return r;
  }
  function test2var(a, b, alt = 'diff') {
    const x = a.values, y = b.values; need(x.length >= 2 && y.length >= 2, 'Chaque échantillon doit avoir au moins 2 valeurs.');
    const F = variance(x) / variance(y), d1 = x.length - 1, d2 = y.length - 1;
    const p = pAlt(F, v => fCdf(v, d1, d2), alt);
    return { titre: 'Test F de 2 variances : ' + a.nom + ' et ' + b.nom, blocs: [
      T(null, ['Échantillon', 'N', 'ÉcTyp', 'Variance'], [[a.nom, x.length, sd(x), variance(x)], [b.nom, y.length, sd(y), variance(y)]]),
      T('Test', ['Rapport des variances F', 'DL num.', 'DL dén.', 'Valeur de p'], [[F, d1, d2, pTxt(p)]]),
      P('Ce test suppose des données normales.'), conclusion(p)] };
  }
  function prop1(x, n, p0 = 0.5, alt = 'diff', conf = 0.95) {
    need(n > 0 && x >= 0 && x <= n, 'Effectifs invalides.');
    const ph = x / n, z = (ph - p0) / Math.sqrt(p0 * (1 - p0) / n), p = pAlt(z, normCdf, alt);
    const zc = normInv(1 - (1 - conf) / 2), se = Math.sqrt(ph * (1 - ph) / n);
    return { titre: 'Test de proportion à 1 échantillon', blocs: [
      P(`H₀ : p = ${fmtN(p0)}. H₁ : p ${ALT_TXT[alt]} ${fmtN(p0)}. Méthode : approximation normale.`),
      T(null, ['Événements', 'N', 'Proportion', `IC à ${fmtPct(conf)}`, 'Z', 'Valeur de p'], [[x, n, ph, `(${fmtN(Math.max(0, ph - zc * se))} ; ${fmtN(Math.min(1, ph + zc * se))})`, z, pTxt(p)]]),
      P(n * p0 < 5 || n * (1 - p0) < 5 ? 'Attention : l’approximation normale est peu fiable avec si peu d’observations.' : ''), conclusion(p, 1 - conf)].filter(b => b.texte !== '') };
  }
  function prop2(x1, n1, x2, n2, alt = 'diff') {
    need(n1 > 0 && n2 > 0, 'Effectifs invalides.');
    const p1 = x1 / n1, p2 = x2 / n2, pp = (x1 + x2) / (n1 + n2);
    const z = (p1 - p2) / Math.sqrt(pp * (1 - pp) * (1 / n1 + 1 / n2)), p = pAlt(z, normCdf, alt);
    return { titre: 'Test de proportion à 2 échantillons', blocs: [
      T(null, ['Échantillon', 'Événements', 'N', 'Proportion'], [['1', x1, n1, p1], ['2', x2, n2, p2]]),
      T('Test', ['Différence', 'Z', 'Valeur de p'], [[p1 - p2, z, pTxt(p)]]), conclusion(p)] };
  }

  /* Khi-deux d'indépendance à partir de deux colonnes de catégories, ou d'un tableau d'effectifs */
  function khiDeux({ ligne, colonne, tableau, etiquettesLignes, etiquettesColonnes, nomL = 'Lignes', nomC = 'Colonnes' }) {
    let obs, rl, cl;
    if (tableau) { obs = tableau; rl = etiquettesLignes || obs.map((_, i) => String(i + 1)); cl = etiquettesColonnes || obs[0].map((_, j) => String(j + 1)); }
    else {
      const n = Math.min(ligne.length, colonne.length);
      rl = [...new Set(ligne.slice(0, n).map(String))].sort((a, b) => a.localeCompare(b, 'fr'));
      cl = [...new Set(colonne.slice(0, n).map(String))].sort((a, b) => a.localeCompare(b, 'fr'));
      obs = rl.map(() => cl.map(() => 0));
      for (let i = 0; i < n; i++) obs[rl.indexOf(String(ligne[i]))][cl.indexOf(String(colonne[i]))]++;
    }
    need(obs.length >= 2 && obs[0].length >= 2, 'Il faut au moins 2 catégories dans chaque variable.');
    const R = obs.map(r => sum(r)), C = obs[0].map((_, j) => sum(obs.map(r => r[j]))), N = sum(R);
    let chi = 0, faibles = 0;
    const att = obs.map((r, i) => r.map((o, j) => { const e = R[i] * C[j] / N; if (e < 5) faibles++; chi += (o - e) ** 2 / e; return e; }));
    const df = (obs.length - 1) * (obs[0].length - 1), p = 1 - chi2Cdf(chi, df);
    const lignes = obs.map((r, i) => [rl[i], ...r.map((o, j) => `${o} (${fmtN(att[i][j])})`), R[i]]);
    lignes.push(['Total', ...C, N]);
    return { titre: 'Test du khi-deux d’indépendance', blocs: [
      T('Effectifs observés (attendus)', [nomL + ' \\ ' + nomC, ...cl, 'Total'], lignes),
      T('Test', ['Khi-deux de Pearson', 'DL', 'Valeur de p'], [[chi, df, pTxt(p)]]),
      P(faibles ? `Attention : ${faibles} effectif(s) attendu(s) inférieur(s) à 5. Le test peut être peu fiable.` : ''),
      P(p < 0.05 ? 'Valeur de p < 0,05 : les deux variables sont liées (non indépendantes).' : 'Valeur de p ≥ 0,05 : rien ne permet de conclure à un lien entre les deux variables.')].filter(b => b.texte !== '') };
  }

  /* ANOVA à un facteur : groupes = [{ nom, values }] */
  function anova1(groupes) {
    groupes = groupes.filter(g => g.values.length);
    need(groupes.length >= 2, 'Il faut au moins 2 groupes.');
    const all = groupes.flatMap(g => g.values), N = all.length, k = groupes.length, gm = mean(all);
    const ssb = sum(groupes.map(g => g.values.length * (mean(g.values) - gm) ** 2));
    const ssw = sum(groupes.map(g => g.values.reduce((s, x) => s + (x - mean(g.values)) ** 2, 0)));
    const dfb = k - 1, dfw = N - k;
    need(dfw > 0, 'Pas assez d’observations.');
    const msb = ssb / dfb, msw = ssw / dfw, F = msb / msw, p = 1 - fCdf(F, dfb, dfw);
    const sp = Math.sqrt(msw), t = tInv(0.975, dfw);
    return { titre: 'ANOVA à un facteur', blocs: [
      P('H₀ : toutes les moyennes sont égales. H₁ : au moins une moyenne est différente. Variances supposées égales.'),
      T('Analyse de la variance', ['Source', 'DL', 'SomCar', 'CM', 'F', 'Valeur de p'], [['Facteur', dfb, ssb, msb, F, pTxt(p)], ['Erreur', dfw, ssw, msw, null, null], ['Total', N - 1, ssb + ssw, null, null, null]]),
      T('Récapitulatif du modèle', ['S', 'R²', 'R² (ajust.)'], [[sp, ssb / (ssb + ssw), 1 - (ssw / dfw) / ((ssb + ssw) / (N - 1))]]),
      T('Moyennes', ['Groupe', 'N', 'Moyenne', 'ÉcTyp', 'IC à 95 %'], groupes.map(g => { const m = mean(g.values), h = t * sp / Math.sqrt(g.values.length); return [g.nom, g.values.length, m, g.values.length > 1 ? sd(g.values) : null, `(${fmtN(m - h)} ; ${fmtN(m + h)})`]; }), 'ÉcTyp regroupé = ' + fmtN(sp)),
      conclusion(p),
      G({ kind: 'boites', titre: 'Boîtes à moustaches par groupe', series: groupes })] };
  }

  /* Régression linéaire (moindres carrés) : y = b0 + b1 x1 + ... */
  function regression(y, xs) {
    need(xs.length >= 1, 'Choisissez au moins un prédicteur.');
    const rows = [];
    for (let i = 0; i < y.values.length; i++) {
      const r = [y.values[i], ...xs.map(x => x.values[i])];
      if (r.every(v => v != null && isFinite(v))) rows.push(r);
    }
    const n = rows.length, p = xs.length + 1;
    need(n > p, 'Pas assez d’observations complètes pour ce modèle.');
    const X = rows.map(r => [1, ...r.slice(1)]), Y = rows.map(r => r[0]);
    const XtX = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => sum(X.map(r => r[i] * r[j]))));
    const XtY = Array.from({ length: p }, (_, i) => sum(X.map((r, k) => r[i] * Y[k])));
    const inv = inverse(XtX);
    need(inv, 'Les prédicteurs sont parfaitement liés entre eux (colinéarité) : impossible d’estimer le modèle.');
    const b = inv.map(r => sum(r.map((v, j) => v * XtY[j])));
    const fit = X.map(r => sum(r.map((v, j) => v * b[j]))), res = Y.map((v, i) => v - fit[i]);
    const sse = sum(res.map(e => e * e)), my = mean(Y), sst = sum(Y.map(v => (v - my) ** 2)), ssr = sst - sse;
    const dfe = n - p, mse = sse / dfe, s = Math.sqrt(mse);
    const se = inv.map((r, i) => Math.sqrt(r[i] * mse));
    const names = ['Constante', ...xs.map(x => x.nom)];
    const coef = b.map((v, i) => { const t = v / se[i]; return [names[i], v, se[i], t, pTxt(2 * (1 - tCdf(Math.abs(t), dfe)))]; });
    const F = (ssr / (p - 1)) / mse, pF = 1 - fCdf(F, p - 1, dfe);
    const eq = y.nom + ' = ' + b.map((v, i) => (i === 0 ? fmtN(v) : (v < 0 ? ' − ' : ' + ') + fmtN(Math.abs(v)) + ' × ' + names[i])).join('');
    const blocs = [
      P('Équation de régression : ' + eq),
      T('Coefficients', ['Terme', 'Coef', 'ErT coef', 'T', 'Valeur de p'], coef),
      T('Récapitulatif du modèle', ['S', 'R²', 'R² (ajust.)', 'N'], [[s, ssr / sst, 1 - (sse / dfe) / (sst / (n - 1)), n]]),
      T('Analyse de la variance', ['Source', 'DL', 'SomCar', 'CM', 'F', 'Valeur de p'], [['Régression', p - 1, ssr, ssr / (p - 1), F, pTxt(pF)], ['Erreur', dfe, sse, mse, null, null], ['Total', n - 1, sst, null, null, null]])
    ];
    if (xs.length === 1) blocs.push(G({ kind: 'nuage', titre: 'Droite de régression', x: X.map(r => r[1]), y: Y, axeX: xs[0].nom, axeY: y.nom, droite: { a: b[0], b: b[1] } }));
    blocs.push(G({ kind: 'nuage', titre: 'Résidus en fonction des valeurs ajustées', x: fit, y: res, axeX: 'Valeur ajustée', axeY: 'Résidu', ligneZero: true }));
    const ad = andersonDarling(res);
    blocs.push(P(`Normalité des résidus (Anderson-Darling) : valeur de p = ${ad.p < 0.001 ? '< 0,001' : fmtN(ad.p)}${ad.p < 0.05 ? ' : les résidus ne semblent pas normaux, interprétez les tests avec prudence.' : '.'}`));
    return { titre: 'Régression : ' + y.nom + ' en fonction de ' + xs.map(x => x.nom).join(', '), blocs, coefficients: b, r2: ssr / sst };
  }

  /* ================= Qualité ================= */
  const CONST = { // n : d2, A2, D3, D4
    2: [1.128, 1.880, 0, 3.267], 3: [1.693, 1.023, 0, 2.574], 4: [2.059, 0.729, 0, 2.282], 5: [2.326, 0.577, 0, 2.114],
    6: [2.534, 0.483, 0, 2.004], 7: [2.704, 0.419, 0.076, 1.924], 8: [2.847, 0.373, 0.136, 1.864], 9: [2.970, 0.337, 0.184, 1.816], 10: [3.078, 0.308, 0.223, 1.777]
  };
  function hors(values, lcl, ucl) { return values.map((v, i) => (v > ucl || v < lcl ? i + 1 : null)).filter(Boolean); }
  function carteIMR(col) {
    const x = col.values; need(x.length >= 3, 'Il faut au moins 3 valeurs.');
    const mr = x.slice(1).map((v, i) => Math.abs(v - x[i])), mrb = mean(mr), m = mean(x), sigma = mrb / 1.128;
    const ucl = m + 3 * sigma, lcl = m - 3 * sigma, mrUcl = 3.267 * mrb;
    const hi = hors(x, lcl, ucl), hmr = hors(mr, 0, mrUcl).map(i => i + 1);
    return { titre: 'Carte I-MR : ' + col.nom, blocs: [
      G({ kind: 'controle', titre: 'Carte des valeurs individuelles', valeurs: x, centre: m, lsc: ucl, lic: lcl, axeY: 'Valeur individuelle' }),
      G({ kind: 'controle', titre: 'Carte des étendues mobiles', valeurs: [null, ...mr], centre: mrb, lsc: mrUcl, lic: 0, axeY: 'Étendue mobile' }),
      T('Limites', ['Carte', 'Centre', 'LSC', 'LIC'], [['I', m, ucl, lcl], ['MR', mrb, mrUcl, 0]], 'σ estimée (à court terme) = MR moyen / 1,128 = ' + fmtN(sigma)),
      P(hi.length || hmr.length ? `Points hors limites : ${hi.length ? 'carte I, observation(s) ' + hi.join(', ') : ''}${hi.length && hmr.length ? ' ; ' : ''}${hmr.length ? 'carte MR, observation(s) ' + hmr.join(', ') : ''}. Le procédé n’est pas sous contrôle : cherchez une cause spéciale.` : 'Aucun point hors des limites de contrôle.')] };
  }
  function carteXbarR(col, taille) {
    const x = col.values; need(taille >= 2 && taille <= 10, 'La taille des sous-groupes doit être comprise entre 2 et 10.');
    const k = Math.floor(x.length / taille); need(k >= 2, 'Il faut au moins 2 sous-groupes complets.');
    const sg = Array.from({ length: k }, (_, i) => x.slice(i * taille, (i + 1) * taille));
    const xb = sg.map(mean), R = sg.map(g => Math.max(...g) - Math.min(...g)), xbb = mean(xb), rb = mean(R);
    const [d2, A2, D3, D4] = CONST[taille];
    const u = xbb + A2 * rb, l = xbb - A2 * rb;
    const hx = hors(xb, l, u), hr = hors(R, D3 * rb, D4 * rb);
    return { titre: `Carte X̄-R : ${col.nom} (sous-groupes de ${taille})`, blocs: [
      G({ kind: 'controle', titre: 'Carte des moyennes (X̄)', valeurs: xb, centre: xbb, lsc: u, lic: l, axeY: 'Moyenne du sous-groupe', axeX: 'Sous-groupe' }),
      G({ kind: 'controle', titre: 'Carte des étendues (R)', valeurs: R, centre: rb, lsc: D4 * rb, lic: D3 * rb, axeY: 'Étendue', axeX: 'Sous-groupe' }),
      T('Limites', ['Carte', 'Centre', 'LSC', 'LIC'], [['X̄', xbb, u, l], ['R', rb, D4 * rb, D3 * rb]], `σ estimée = R̄ / d2 = ${fmtN(rb / d2)}${x.length % taille ? ` ; ${x.length % taille} valeur(s) en fin de colonne ignorée(s)` : ''}`),
      P(hx.length || hr.length ? `Sous-groupes hors limites : ${[...new Set([...hx, ...hr])].join(', ')}.` : 'Aucun sous-groupe hors des limites de contrôle.')] };
  }
  function carteP(defauts, tailles) {
    const n = Math.min(defauts.values.length, tailles.values.length); need(n >= 2, 'Il faut au moins 2 échantillons.');
    const d = defauts.values.slice(0, n), s = tailles.values.slice(0, n), pb = sum(d) / sum(s);
    const p = d.map((v, i) => v / s[i]);
    const lsc = s.map(ni => Math.min(1, pb + 3 * Math.sqrt(pb * (1 - pb) / ni))), lic = s.map(ni => Math.max(0, pb - 3 * Math.sqrt(pb * (1 - pb) / ni)));
    const h = p.map((v, i) => (v > lsc[i] || v < lic[i] ? i + 1 : null)).filter(Boolean);
    return { titre: 'Carte P : ' + defauts.nom, blocs: [
      G({ kind: 'controle', titre: 'Proportion de défectueux', valeurs: p, centre: pb, lsc, lic, axeY: 'Proportion', axeX: 'Échantillon' }),
      T(null, ['P̄', 'Échantillons', 'Défectueux au total', 'Unités inspectées'], [[pb, n, sum(d), sum(s)]]),
      P(h.length ? `Échantillons hors limites : ${h.join(', ')}.` : 'Aucun échantillon hors des limites de contrôle.')] };
  }
  function capabilite(col, { lsl = null, usl = null, taille = 1 } = {}) {
    const x = col.values; need(x.length >= 5, 'Il faut au moins 5 valeurs.');
    need(lsl != null || usl != null, 'Indiquez au moins une limite de spécification.');
    const m = mean(x), sOverall = sd(x);
    let sWithin;
    if (taille <= 1) { const mr = x.slice(1).map((v, i) => Math.abs(v - x[i])); sWithin = mean(mr) / 1.128; }
    else { const k = Math.floor(x.length / taille); const R = Array.from({ length: k }, (_, i) => { const g = x.slice(i * taille, (i + 1) * taille); return Math.max(...g) - Math.min(...g); }); sWithin = mean(R) / CONST[taille][0]; }
    const idx = sg => {
      const cpu = usl != null ? (usl - m) / (3 * sg) : null, cpl = lsl != null ? (m - lsl) / (3 * sg) : null;
      return { cp: lsl != null && usl != null ? (usl - lsl) / (6 * sg) : null, cpu, cpl, cpk: Math.min(...[cpu, cpl].filter(v => v != null)) };
    };
    const w = idx(sWithin), o = idx(sOverall);
    const obs = 1e6 * x.filter(v => (lsl != null && v < lsl) || (usl != null && v > usl)).length / x.length;
    const exp = sg => 1e6 * ((lsl != null ? normCdf((lsl - m) / sg) : 0) + (usl != null ? 1 - normCdf((usl - m) / sg) : 0));
    return { titre: 'Analyse de capabilité : ' + col.nom, blocs: [
      T('Données du procédé', ['LIS', 'Cible', 'LSS', 'Moyenne', 'N', 'ÉcTyp (intra)', 'ÉcTyp (global)'], [[lsl, null, usl, m, x.length, sWithin, sOverall]]),
      T('Capabilité', ['', 'Cp / Pp', 'CPL / PPL', 'CPU / PPU', 'Cpk / Ppk'], [['Potentielle (intra)', w.cp, w.cpl, w.cpu, w.cpk], ['Globale', o.cp, o.cpl, o.cpu, o.cpk]]),
      T('Hors spécifications (PPM)', ['Observées', 'Attendues (intra)', 'Attendues (globale)'], [[obs, exp(sWithin), exp(sOverall)]]),
      P(w.cpk >= 1.33 ? 'Cpk ≥ 1,33 : le procédé est capable.' : w.cpk >= 1 ? 'Cpk entre 1 et 1,33 : le procédé est tout juste capable, à surveiller.' : 'Cpk < 1 : le procédé n’est pas capable de respecter les spécifications.'),
      G({ kind: 'histogramme', titre: 'Histogramme et spécifications', values: x, normale: { moyenne: m, ecart: sOverall }, lignes: [lsl != null && { x: lsl, label: 'LIS' }, usl != null && { x: usl, label: 'LSS' }].filter(Boolean) })] };
  }
  function pareto(col, effectifs) {
    let entries;
    if (effectifs) { entries = col.values.map((c, i) => [String(c), effectifs.values[i]]).filter(e => e[1] != null && isFinite(e[1])); }
    else { const m = new Map(); col.values.forEach(v => m.set(String(v), (m.get(String(v)) || 0) + 1)); entries = [...m.entries()]; }
    need(entries.length >= 2, 'Il faut au moins 2 catégories.');
    entries.sort((a, b) => b[1] - a[1]);
    const tot = sum(entries.map(e => e[1])); let cum = 0;
    const lignes = entries.map(([c, n]) => { cum += n; return [c, n, 100 * n / tot, 100 * cum / tot]; });
    return { titre: 'Diagramme de Pareto : ' + col.nom, blocs: [
      G({ kind: 'pareto', titre: 'Diagramme de Pareto', categories: entries.map(e => e[0]), valeurs: entries.map(e => e[1]) }),
      T(null, ['Catégorie', 'Effectif', 'Pourcentage', '% cumulé'], lignes)] };
  }

  /* ================= Graphiques simples ================= */
  function graphique(kind, cols, opts = {}) {
    const c = cols[0];
    need(c && c.values.length, 'Choisissez une colonne avec des valeurs.');
    switch (kind) {
      case 'histogramme': return { titre: 'Histogramme de ' + c.nom, blocs: [G({ kind: 'histogramme', titre: 'Histogramme de ' + c.nom, values: c.values, normale: opts.normale ? { moyenne: mean(c.values), ecart: sd(c.values) } : null, axeX: c.nom })] };
      case 'boites': return { titre: 'Boîtes à moustaches', blocs: [G({ kind: 'boites', titre: 'Boîtes à moustaches', series: cols.map(x => ({ nom: x.nom, values: x.values })) })] };
      case 'nuage': need(cols.length >= 2, 'Choisissez une colonne X puis une colonne Y.'); { const pr = pairUp(cols[0].values, cols[1].values); return { titre: 'Nuage de points', blocs: [G({ kind: 'nuage', titre: cols[1].nom + ' en fonction de ' + cols[0].nom, x: pr.x, y: pr.y, axeX: cols[0].nom, axeY: cols[1].nom, droite: opts.droite ? linfit(pr.x, pr.y) : null })] }; }
      case 'serie': return { titre: 'Série chronologique', blocs: [G({ kind: 'serie', titre: 'Série chronologique de ' + c.nom, series: cols.map(x => ({ nom: x.nom, values: x.values })), axeX: 'Indice' })] };
      case 'secteurs': { const m = new Map(); c.values.forEach(v => m.set(String(v), (m.get(String(v)) || 0) + 1)); return { titre: 'Diagramme circulaire de ' + c.nom, blocs: [G({ kind: 'secteurs', titre: 'Diagramme circulaire de ' + c.nom, categories: [...m.keys()], valeurs: [...m.values()] })] }; }
    }
    throw new Error('Graphique inconnu');
  }

  return {
    lois: { normCdf, normInv, normPdf, tCdf, tInv, fCdf, fInv, chi2Cdf, chi2Inv, betai, gammainc, lgamma },
    util: { mean, sd, variance, median, quantileMinitab, skewness, kurtosis, pearson, linfit, andersonDarling, sorted },
    descriptives, frequences, correlation, normalite, icMoyenne,
    test1t, test2t, testApparie, test2var, prop1, prop2, khiDeux, anova1, regression,
    carteIMR, carteXbarR, carteP, capabilite, pareto, graphique
  };
});
