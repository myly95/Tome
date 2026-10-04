/* Abaque : moteur de calcul du tableur Tòme.
 * Analyse des formules (syntaxe Excel, noms français ou anglais), calcul, recopie relative,
 * format de fichier .abk. Les fonctions viennent de formula.js (licence MIT).
 * Fonctionne dans le navigateur (window.AbaqueMoteur) et dans Node (tests).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('@formulajs/formulajs'));
  else root.AbaqueMoteur = factory(root.formulajs);
})(typeof self !== 'undefined' ? self : this, function (F) {
  'use strict';

  /* ---------------- Erreurs Excel ---------------- */
  class XErr { constructor(code) { this.code = code; } toString() { return this.code; } }
  const E = { div0: '#DIV/0!', name: '#NOM?', value: '#VALEUR!', ref: '#REF!', na: '#N/A', num: '#NOMBRE!', circ: '#CIRC!', null: '#NUL!' };
  const FJS_ERR = { '#DIV/0!': E.div0, '#NAME?': E.name, '#VALUE!': E.value, '#REF!': E.ref, '#N/A': E.na, '#NUM!': E.num, '#NULL!': E.null, '#ERROR!': E.value, '#DATA!': E.value, '#GETTING_DATA': E.na };
  const err = c => new XErr(c);
  const isErr = v => v instanceof XErr;

  /* ---------------- Noms de fonctions français ---------------- */
  const FR = {
    SOMME: 'SUM', MOYENNE: 'AVERAGE', SI: 'IF', NB: 'COUNT', 'NB.VAL': 'COUNTA', 'NB.VIDE': 'COUNTBLANK', 'NB.SI': 'COUNTIF', 'NB.SI.ENS': 'COUNTIFS',
    'SOMME.SI': 'SUMIF', 'SOMME.SI.ENS': 'SUMIFS', 'MOYENNE.SI': 'AVERAGEIF', 'MOYENNE.SI.ENS': 'AVERAGEIFS', SOMMEPROD: 'SUMPRODUCT', 'SOMME.CARRES': 'SUMSQ',
    RECHERCHEV: 'VLOOKUP', RECHERCHEH: 'HLOOKUP', RECHERCHE: 'LOOKUP', RECHERCHEX: 'XLOOKUP', EQUIV: 'MATCH', INDEX: 'INDEX', CHOISIR: 'CHOOSE',
    ARRONDI: 'ROUND', 'ARRONDI.SUP': 'ROUNDUP', 'ARRONDI.INF': 'ROUNDDOWN', ENT: 'INT', TRONQUE: 'TRUNC', ABS: 'ABS', RACINE: 'SQRT', PUISSANCE: 'POWER',
    EXP: 'EXP', LN: 'LN', LOG: 'LOG', LOG10: 'LOG10', MOD: 'MOD', PI: 'PI', SIGNE: 'SIGN', PAIR: 'EVEN', IMPAIR: 'ODD', FACT: 'FACT', PGCD: 'GCD', PPCM: 'LCM',
    QUOTIENT: 'QUOTIENT', 'ALEA': 'RAND', 'ALEA.ENTRE.BORNES': 'RANDBETWEEN', PRODUIT: 'PRODUCT', COMBIN: 'COMBIN', PERMUTATION: 'PERMUT',
    MAX: 'MAX', MIN: 'MIN', MEDIANE: 'MEDIAN', MODE: 'MODE.SNGL', 'MODE.SIMPLE': 'MODE.SNGL', 'GRANDE.VALEUR': 'LARGE', 'PETITE.VALEUR': 'SMALL', RANG: 'RANK', 'RANG.EQ': 'RANK.EQ',
    ECARTYPE: 'STDEV.S', 'ECARTYPE.STANDARD': 'STDEV.S', 'ECARTYPEP': 'STDEV.P', 'ECARTYPE.PEARSON': 'STDEV.P', VAR: 'VAR.S', 'VAR.S': 'VAR.S', 'VAR.P': 'VAR.P', VAR_P: 'VAR.P',
    QUARTILE: 'QUARTILE.INC', 'QUARTILE.INCLURE': 'QUARTILE.INC', CENTILE: 'PERCENTILE.INC', 'CENTILE.INCLURE': 'PERCENTILE.INC',
    COEFFICIENT_CORRELATION: 'CORREL', 'COEFFICIENT.CORRELATION': 'CORREL', CORRELATION: 'CORREL', COVARIANCE: 'COVARIANCE.S', 'COVARIANCE.STANDARD': 'COVARIANCE.S',
    PENTE: 'SLOPE', 'ORDONNEE.ORIGINE': 'INTERCEPT', 'COEFFICIENT.DETERMINATION': 'RSQ', PREVISION: 'FORECAST', 'PREVISION.LINEAIRE': 'FORECAST', TENDANCE: 'TREND', DROITEREG: 'LINEST',
    'LOI.NORMALE.N': 'NORM.DIST', 'LOI.NORMALE.INVERSE.N': 'NORM.INV', 'LOI.NORMALE.STANDARD.N': 'NORM.S.DIST', 'LOI.NORMALE.STANDARD.INVERSE.N': 'NORM.S.INV',
    'LOI.STUDENT.N': 'T.DIST', 'LOI.STUDENT.BILATERALE': 'T.DIST.2T', 'LOI.STUDENT.INVERSE.N': 'T.INV', 'LOI.STUDENT.INVERSE.BILATERALE': 'T.INV.2T', 'T.TEST': 'T.TEST',
    'LOI.BINOMIALE.N': 'BINOM.DIST', 'LOI.POISSON.N': 'POISSON.DIST', 'LOI.KHIDEUX.N': 'CHISQ.DIST', 'LOI.KHIDEUX.DROITE': 'CHISQ.DIST.RT', 'CHISQ.TEST': 'CHISQ.TEST', 'TEST.KHIDEUX': 'CHISQ.TEST',
    'INTERVALLE.CONFIANCE.NORMAL': 'CONFIDENCE.NORM', 'INTERVALLE.CONFIANCE.STUDENT': 'CONFIDENCE.T', 'CENTREE.REDUITE': 'STANDARDIZE', FREQUENCE: 'FREQUENCY',
    ET: 'AND', OU: 'OR', NON: 'NOT', OUX: 'XOR', VRAI: 'TRUE', FAUX: 'FALSE', SIERREUR: 'IFERROR', 'SI.NON.DISP': 'IFNA', 'SI.CONDITIONS': 'IFS', SI_CONDITIONS: 'IFS',
    ESTVIDE: 'ISBLANK', ESTNUM: 'ISNUMBER', ESTTEXTE: 'ISTEXT', ESTERREUR: 'ISERROR', ESTNA: 'ISNA', 'EST.PAIR': 'ISEVEN', 'EST.IMPAIR': 'ISODD',
    CONCATENER: 'CONCATENATE', CONCAT: 'CONCAT', JOINDRE_TEXTE: 'TEXTJOIN', 'JOINDRE.TEXTE': 'TEXTJOIN', GAUCHE: 'LEFT', DROITE: 'RIGHT', STXT: 'MID', NBCAR: 'LEN',
    MAJUSCULE: 'UPPER', MINUSCULE: 'LOWER', NOMPROPRE: 'PROPER', SUPPRESPACE: 'TRIM', SUBSTITUE: 'SUBSTITUTE', REMPLACER: 'REPLACE', TROUVE: 'FIND', CHERCHE: 'SEARCH',
    REPT: 'REPT', TEXTE: 'TEXT', CNUM: 'VALUE', CAR: 'CHAR', CODE: 'CODE', EXACT: 'EXACT',
    AUJOURDHUI: 'TODAY', MAINTENANT: 'NOW', DATE: 'DATE', ANNEE: 'YEAR', MOIS: 'MONTH', JOUR: 'DAY', HEURE: 'HOUR', MINUTE: 'MINUTE', SECONDE: 'SECOND',
    JOURSEM: 'WEEKDAY', 'NB.JOURS.OUVRES': 'NETWORKDAYS', 'SERIE.JOUR.OUVRE': 'WORKDAY', DATEDIF: 'DATEDIF', JOURS: 'DAYS', FIN_MOIS: 'EOMONTH', 'FIN.MOIS': 'EOMONTH', MOIS_DECALER: 'EDATE', 'MOIS.DECALER': 'EDATE',
    VPM: 'PMT', VA: 'PV', VC: 'FV', TAUX: 'RATE', NPM: 'NPER', VAN: 'NPV', TRI: 'IRR', TRANSPOSE: 'TRANSPOSE', LIGNE: 'ROW', COLONNE: 'COLUMN', LIGNES: 'ROWS', COLONNES: 'COLUMNS'
  };
  const LOCAL_FN = {
    ROW: () => null, COLUMN: () => null, TRUE: () => true, FALSE: () => false, PI: () => Math.PI
  };

  /* ---------------- Références ---------------- */
  const colToNum = s => s.toUpperCase().split('').reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
  const numToCol = n => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const refName = (r, c) => numToCol(c) + r;
  const REF_RE = /^(\$?)([A-Za-z]{1,3})(\$?)(\d{1,6})$/;
  function parseRef(s) {
    const m = REF_RE.exec(s);
    if (!m) return null;
    return { col: colToNum(m[2]), row: Number(m[4]), absCol: !!m[1], absRow: !!m[3] };
  }

  /* ---------------- Analyse lexicale ---------------- */
  function tokenize(src) {
    const t = [];
    let i = 0;
    const isAlpha = c => /[A-Za-zÀ-ÿ_]/.test(c);
    while (i < src.length) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '"') {
        let s = ''; i++;
        while (i < src.length) { if (src[i] === '"') { if (src[i + 1] === '"') { s += '"'; i += 2; continue; } break; } s += src[i++]; }
        if (src[i] !== '"') throw new Error('Guillemet non fermé');
        i++; t.push({ type: 'str', value: s }); continue;
      }
      if (/[0-9.]/.test(c) && !(c === '.' && !/[0-9]/.test(src[i + 1] || ''))) {
        const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
        if (m) {
          // Une ligne entière (1:1) ? On laisse le parseur gérer ':'
          t.push({ type: 'num', value: Number(m[0]), text: m[0] }); i += m[0].length; continue;
        }
      }
      if (c === "'") { // 'Nom de feuille'!A1
        let s = ''; i++;
        while (i < src.length && src[i] !== "'") s += src[i++];
        i++;
        if (src[i] !== '!') throw new Error('Nom de feuille invalide');
        i++; t.push({ type: 'sheet', value: s }); continue;
      }
      if (isAlpha(c) || c === '$') {
        const m = /^[$A-Za-zÀ-ÿ_][$A-Za-zÀ-ÿ0-9_.]*/.exec(src.slice(i));
        const w = m[0];
        if (src[i + w.length] === '!') { t.push({ type: 'sheet', value: w }); i += w.length + 1; continue; }
        if (src[i + w.length] === '(' ) { t.push({ type: 'fn', value: w.toUpperCase() }); i += w.length; continue; }
        if (REF_RE.test(w)) { t.push({ type: 'ref', value: w }); i += w.length; continue; }
        if (/^\$?[A-Za-z]{1,3}$/.test(w) && src[i + w.length] === ':') { t.push({ type: 'col', value: w }); i += w.length; continue; }
        if (/^\$?[A-Za-z]{1,3}$/.test(w) && t.length && t[t.length - 1].type === 'op' && t[t.length - 1].value === ':') { t.push({ type: 'col', value: w }); i += w.length; continue; }
        const up = w.toUpperCase();
        if (up === 'VRAI' || up === 'TRUE') { t.push({ type: 'bool', value: true }); i += w.length; continue; }
        if (up === 'FAUX' || up === 'FALSE') { t.push({ type: 'bool', value: false }); i += w.length; continue; }
        t.push({ type: 'name', value: w }); i += w.length; continue;
      }
      if (c === '#') { const m = /^#[A-Z/0-9!?]+/i.exec(src.slice(i)); t.push({ type: 'errlit', value: m[0] }); i += m[0].length; continue; }
      const two = src.slice(i, i + 2);
      if (two === '<=' || two === '>=' || two === '<>') { t.push({ type: 'op', value: two }); i += 2; continue; }
      if ('+-*/^&=<>%:'.includes(c)) { t.push({ type: 'op', value: c }); i++; continue; }
      if (c === '(' || c === ')') { t.push({ type: c }); i++; continue; }
      if (c === ';' || c === ',') { t.push({ type: 'sep' }); i++; continue; }
      if (c === '{' || c === '}') throw new Error('Les tableaux de constantes ne sont pas pris en charge');
      throw new Error('Caractère inattendu : ' + c);
    }
    return t;
  }

  /* ---------------- Analyse syntaxique (précédence Excel) ---------------- */
  const BIN = { '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1, '&': 2, '+': 3, '-': 3, '*': 4, '/': 4, '^': 5 };
  function parse(src) {
    const toks = tokenize(src);
    let p = 0;
    const peek = () => toks[p], next = () => toks[p++];
    const expect = type => { const t = next(); if (!t || t.type !== type) throw new Error('Formule incomplète'); return t; };

    function primary() {
      const t = next();
      if (!t) throw new Error('Formule incomplète');
      let node;
      if (t.type === 'num') node = { k: 'num', v: t.value };
      else if (t.type === 'str') node = { k: 'str', v: t.value };
      else if (t.type === 'bool') node = { k: 'bool', v: t.value };
      else if (t.type === 'errlit') node = { k: 'err', v: t.value };
      else if (t.type === 'op' && (t.value === '-' || t.value === '+')) { const a = unary(); return t.value === '-' ? { k: 'neg', a } : a; }
      else if (t.type === '(') { node = expr(0); expect(')'); }
      else if (t.type === 'fn') {
        expect('(');
        const args = [];
        if (peek() && peek().type === ')') next();
        else {
          for (;;) {
            if (peek() && (peek().type === 'sep' || peek().type === ')')) args.push({ k: 'empty' });
            else args.push(expr(0));
            const s = next();
            if (!s) throw new Error('Parenthèse manquante');
            if (s.type === ')') break;
            if (s.type !== 'sep') throw new Error('Séparateur attendu');
          }
        }
        node = { k: 'fn', name: t.value, args };
      } else if (t.type === 'sheet') {
        const r = next();
        if (!r || (r.type !== 'ref' && r.type !== 'col')) throw new Error('Référence attendue après ' + t.value + '!');
        node = refNode(r, t.value);
      } else if (t.type === 'ref' || t.type === 'col') node = refNode(t, null);
      else if (t.type === 'name') throw Object.assign(new Error('Nom inconnu : ' + t.value), { xerr: E.name });
      else throw new Error('Formule invalide');
      // Plages A1:B5, A:A
      while (peek() && peek().type === 'op' && peek().value === ':') {
        next();
        let r2 = next();
        if (r2 && r2.type === 'sheet') r2 = next();
        if (!r2 || (r2.type !== 'ref' && r2.type !== 'col')) throw new Error('Plage invalide');
        node = { k: 'range', a: node, b: refNode(r2, node.sheet) };
      }
      while (peek() && peek().type === 'op' && peek().value === '%') { next(); node = { k: 'pct', a: node }; }
      return node;
    }
    function refNode(t, sheet) {
      if (t.type === 'col') { const abs = t.value.startsWith('$'); return { k: 'ref', sheet, col: colToNum(t.value.replace('$', '')), row: null, absCol: abs, absRow: false, whole: true }; }
      return { k: 'ref', sheet, ...parseRef(t.value) };
    }
    function unary() { return primary(); }
    function expr(minPrec) {
      let left = unary();
      for (;;) {
        const t = peek();
        if (!t || t.type !== 'op' || !(t.value in BIN)) break;
        const prec = BIN[t.value];
        if (prec < minPrec) break;
        next();
        const right = expr(t.value === '^' ? prec : prec + 1);
        left = { k: 'bin', op: t.value, a: left, b: right };
      }
      return left;
    }
    const ast = expr(0);
    if (p < toks.length) throw new Error('Formule invalide près de « ' + (toks[p].value ?? toks[p].type) + ' »');
    return ast;
  }

  /* ---------------- Conversion des saisies ---------------- */
  function parseInput(raw) {
    const s = String(raw ?? '');
    if (s === '') return { kind: 'empty', value: null };
    if (s[0] === '=' && s.length > 1) return { kind: 'formula', formula: s.slice(1) };
    if (s[0] === "'") return { kind: 'text', value: s.slice(1) };
    const t = s.trim();
    const up = t.toUpperCase();
    if (up === 'VRAI' || up === 'TRUE') return { kind: 'bool', value: true };
    if (up === 'FAUX' || up === 'FALSE') return { kind: 'bool', value: false };
    const n = toNumberLoose(t);
    if (n !== null) return { kind: 'number', value: n.value, pct: n.pct };
    return { kind: 'text', value: s };
  }
  function toNumberLoose(t) {
    let s = t.replace(/[\s  ]/g, '');
    let pct = false;
    if (s.endsWith('%')) { pct = true; s = s.slice(0, -1); }
    if (/^[-+]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^[-+]?\d+,\d+$/.test(s)) s = s.replace(',', '.');
    else if (/^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
    if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return null;
    return { value: Number(s) / (pct ? 100 : 1), pct };
  }

  /* ---------------- Classeur ---------------- */
  class Feuille {
    constructor(nom, rows = 100, cols = 26) { this.nom = nom; this.cells = new Map(); this.rows = rows; this.cols = cols; this.widths = {}; }
    key(r, c) { return r + ':' + c; }
    get(r, c) { return this.cells.get(this.key(r, c)); }
    usedBounds() {
      let maxR = 0, maxC = 0;
      for (const k of this.cells.keys()) { const [r, c] = k.split(':').map(Number); if (r > maxR) maxR = r; if (c > maxC) maxC = c; }
      return { rows: maxR, cols: maxC };
    }
  }

  class Classeur {
    constructor() { this.feuilles = [new Feuille('Feuille1')]; this.version = 0; }

    feuilleIndex(nom) { return this.feuilles.findIndex(f => f.nom.toLowerCase() === String(nom).toLowerCase()); }
    ajouterFeuille(nom) {
      let base = nom || 'Feuille' + (this.feuilles.length + 1), n = 2, name = base;
      while (this.feuilleIndex(name) >= 0) name = base + ' (' + n++ + ')';
      this.feuilles.push(new Feuille(name));
      return this.feuilles.length - 1;
    }

    /** Saisie d'une cellule (texte brut tel que tapé). */
    saisir(si, r, c, raw, fmt) {
      const f = this.feuilles[si];
      const k = f.key(r, c);
      const prev = f.cells.get(k);
      const input = parseInput(raw);
      if (input.kind === 'empty' && !(prev && prev.fmt && Object.keys(prev.fmt).length)) f.cells.delete(k);
      else {
        const cell = { raw: String(raw ?? ''), fmt: { ...(prev?.fmt || {}), ...(fmt || {}) } };
        if (input.kind === 'number' && input.pct && cell.fmt.pct === undefined) cell.fmt.pct = true;
        f.cells.set(k, cell);
        if (r > f.rows) f.rows = r;
        if (c > f.cols) f.cols = c;
      }
      this.version++;
    }
    brut(si, r, c) { return this.feuilles[si].get(r, c)?.raw ?? ''; }
    format(si, r, c) { return this.feuilles[si].get(r, c)?.fmt || {}; }
    setFormat(si, r, c, patch) {
      const f = this.feuilles[si];
      const k = f.key(r, c);
      const cell = f.cells.get(k) || { raw: '', fmt: {} };
      cell.fmt = { ...cell.fmt, ...patch };
      Object.keys(cell.fmt).forEach(x => cell.fmt[x] === undefined && delete cell.fmt[x]);
      f.cells.set(k, cell);
      this.version++;
    }

    /* ----- Calcul ----- */
    recalculer() { this._memo = new Map(); this._stack = new Set(); this._calcVersion = this.version; }
    valeur(si, r, c) {
      if (this._calcVersion !== this.version || !this._memo) this.recalculer();
      const f = this.feuilles[si];
      if (!f) return err(E.ref);
      const key = si + '|' + r + ':' + c;
      if (this._memo.has(key)) return this._memo.get(key);
      const cell = f.get(r, c);
      let v;
      if (!cell || cell.raw === '') v = null;
      else {
        const input = parseInput(cell.raw);
        if (input.kind !== 'formula') v = input.value;
        else {
          if (this._stack.has(key)) return err(E.circ);
          this._stack.add(key);
          try {
            if (!cell._ast || cell._astSrc !== input.formula) { cell._astSrc = input.formula; try { cell._ast = parse(input.formula); cell._parseErr = null; } catch (e) { cell._ast = null; cell._parseErr = e; } }
            if (!cell._ast) v = err(cell._parseErr && cell._parseErr.xerr || E.name);
            else v = this.eval(cell._ast, si);
            if (Array.isArray(v)) v = v.length && Array.isArray(v[0]) ? v[0][0] : v[0];
            if (v === undefined) v = null;
            if (typeof v === 'number' && !isFinite(v)) v = err(E.num);
          } finally { this._stack.delete(key); }
        }
      }
      this._memo.set(key, v);
      return v;
    }
    /** Erreur de syntaxe éventuelle d'une formule (pour l'afficher à l'élève). */
    erreurSyntaxe(si, r, c) { const cell = this.feuilles[si].get(r, c); this.valeur(si, r, c); return cell && cell._parseErr ? cell._parseErr.message : null; }

    sheetOf(name, si) {
      if (!name) return si;
      const i = this.feuilleIndex(name);
      if (i < 0) throw Object.assign(new Error('Feuille inconnue'), { xerr: E.ref });
      return i;
    }
    rangeValues(node, si) {
      const s = this.sheetOf(node.a.sheet, si);
      const f = this.feuilles[s];
      let r1 = node.a.row, r2 = node.b.row, c1 = node.a.col, c2 = node.b.col;
      if (node.a.whole || node.b.whole) { r1 = 1; r2 = Math.max(1, f.usedBounds().rows); }
      if (r1 > r2) [r1, r2] = [r2, r1];
      if (c1 > c2) [c1, c2] = [c2, c1];
      const out = [];
      for (let r = r1; r <= r2; r++) { const row = []; for (let c = c1; c <= c2; c++) row.push(this.valeur(s, r, c)); out.push(row); }
      return out;
    }
    eval(n, si) {
      switch (n.k) {
        case 'num': case 'str': case 'bool': return n.v;
        case 'err': return err(FJS_ERR[n.v.toUpperCase()] || n.v.toUpperCase());
        case 'empty': return null;
        case 'ref': {
          if (n.whole) return this.rangeValues({ a: n, b: n }, si);
          try { return this.valeur(this.sheetOf(n.sheet, si), n.row, n.col); } catch (e) { return err(e.xerr || E.ref); }
        }
        case 'range': try { return this.rangeValues(n, si); } catch (e) { return err(e.xerr || E.ref); }
        case 'neg': { const a = num(scalar(this.eval(n.a, si))); return isErr(a) ? a : -a; }
        case 'pct': { const a = num(scalar(this.eval(n.a, si))); return isErr(a) ? a : a / 100; }
        case 'bin': return binop(n.op, scalar(this.eval(n.a, si)), scalar(this.eval(n.b, si)));
        case 'fn': return this.callFn(n, si);
      }
      return err(E.value);
    }
    callFn(n, si) {
      const name = FR[n.name] || n.name;
      if (name === 'IF') { // évaluation paresseuse
        const c = scalar(this.eval(n.args[0] || { k: 'empty' }, si));
        if (isErr(c)) return c;
        const b = truthy(c);
        if (isErr(b)) return b;
        const branch = b ? n.args[1] : n.args[2];
        return branch ? this.eval(branch, si) : (b ? true : false);
      }
      if (name === 'IFERROR') { const v = this.eval(n.args[0], si); const s = scalar(v); return isErr(s) ? this.eval(n.args[1] || { k: 'num', v: 0 }, si) : v; }
      if (name === 'ROW' || name === 'COLUMN') { const a = n.args[0]; if (!a || a.k !== 'ref') return err(E.value); return name === 'ROW' ? a.row : a.col; }
      if (name === 'ROWS' || name === 'COLUMNS') { const v = this.eval(n.args[0], si); return Array.isArray(v) ? (name === 'ROWS' ? v.length : v[0].length) : 1; }
      const fn = resolveFn(name);
      if (!fn) return err(E.name);
      const args = n.args.map(a => toFjs(this.eval(a, si)));
      for (const a of args) if (a instanceof Error && !['ISERROR', 'ISERR', 'ISNA', 'IFNA', 'ERROR.TYPE'].includes(name)) return fromFjs(a);
      let r;
      try { r = fn.apply(null, args); } catch (e) { return err(E.value); }
      return fromFjs(r);
    }

    /* ----- Fichier .abk ----- */
    toJSON() {
      return {
        format: 'abaque', version: 1, cree_avec: 'Tòme Abaque',
        feuilles: this.feuilles.map(f => ({
          nom: f.nom, lignes: f.rows, colonnes: f.cols, largeurs: f.widths,
          cellules: Object.fromEntries([...f.cells.entries()].map(([k, v]) => { const [r, c] = k.split(':').map(Number); const o = { s: v.raw }; if (v.fmt && Object.keys(v.fmt).length) o.f = v.fmt; return [refName(r, c), o]; }))
        }))
      };
    }
    static fromJSON(o) {
      if (!o || o.format !== 'abaque') throw new Error('Ce fichier n’est pas un classeur Abaque (.abk).');
      const wb = new Classeur();
      wb.feuilles = (o.feuilles || []).map(fd => {
        const f = new Feuille(fd.nom || 'Feuille', fd.lignes || 100, fd.colonnes || 26);
        f.widths = fd.largeurs || {};
        for (const [ref, v] of Object.entries(fd.cellules || {})) { const p = parseRef(ref); if (p) f.cells.set(f.key(p.row, p.col), { raw: v.s ?? '', fmt: v.f || {} }); }
        return f;
      });
      if (!wb.feuilles.length) wb.feuilles = [new Feuille('Feuille1')];
      return wb;
    }
  }

  /* ---------------- Opérateurs et conversions ---------------- */
  function scalar(v) { return Array.isArray(v) ? (Array.isArray(v[0]) ? v[0][0] : v[0]) : v; }
  function num(v) {
    if (isErr(v)) return v;
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    const n = toNumberLoose(String(v));
    return n ? n.value : err(E.value);
  }
  function truthy(v) {
    if (typeof v === 'boolean') return v;
    if (v === null) return false;
    if (typeof v === 'number') return v !== 0;
    const s = String(v).toUpperCase();
    if (s === 'VRAI' || s === 'TRUE') return true;
    if (s === 'FAUX' || s === 'FALSE') return false;
    return err(E.value);
  }
  function binop(op, a, b) {
    if (isErr(a)) return a;
    if (isErr(b)) return b;
    if (op === '&') return text(a) + text(b);
    if (['=', '<>', '<', '>', '<=', '>='].includes(op)) {
      let x = a, y = b;
      if (x === null) x = typeof y === 'string' ? '' : typeof y === 'boolean' ? false : 0;
      if (y === null) y = typeof x === 'string' ? '' : typeof x === 'boolean' ? false : 0;
      const rank = v => typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2;
      let cmp;
      if (rank(x) !== rank(y)) cmp = rank(x) - rank(y);
      else if (typeof x === 'string') cmp = x.toLowerCase().localeCompare(y.toLowerCase());
      else cmp = (x > y) - (x < y);
      return { '=': cmp === 0, '<>': cmp !== 0, '<': cmp < 0, '>': cmp > 0, '<=': cmp <= 0, '>=': cmp >= 0 }[op];
    }
    const x = num(a), y = num(b);
    if (isErr(x)) return x;
    if (isErr(y)) return y;
    switch (op) {
      case '+': return x + y;
      case '-': return x - y;
      case '*': return x * y;
      case '/': return y === 0 ? err(E.div0) : x / y;
      case '^': { const r = Math.pow(x, y); return isNaN(r) ? err(E.num) : r; }
    }
    return err(E.value);
  }
  function text(v) {
    if (v === null) return '';
    if (typeof v === 'boolean') return v ? 'VRAI' : 'FAUX';
    if (typeof v === 'number') return String(Math.round(v * 1e12) / 1e12);
    return String(v);
  }
  function toFjs(v) {
    if (isErr(v)) { const code = Object.keys(FJS_ERR).find(k => FJS_ERR[k] === v.code) || '#VALUE!'; return new Error(code); }
    if (Array.isArray(v)) return v.map(row => Array.isArray(row) ? row.map(x => isErr(x) ? toFjs(x) : x) : (isErr(row) ? toFjs(row) : row));
    return v;
  }
  function fromFjs(r) {
    if (r instanceof Error) return err(FJS_ERR[r.message] || FJS_ERR[r.name] || E.value);
    if (r instanceof Date) return excelDate(r);
    if (r === undefined) return null;
    return r;
  }
  function excelDate(d) { return (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()) - Date.UTC(1899, 11, 30)) / 86400000; }
  function resolveFn(name) {
    if (LOCAL_FN[name] && !(F && F[name])) return LOCAL_FN[name];
    if (!F) return null;
    let o = F;
    for (const part of name.split('.')) { if (o == null) return null; o = o[part]; }
    if (typeof o === 'function') return o;
    if (o && typeof o === 'object') return null;
    return null;
  }

  /* ---------------- Recopie relative des formules ---------------- */
  function decaler(raw, dRow, dCol) {
    const s = String(raw || '');
    if (s[0] !== '=') return s;
    const body = s.slice(1);
    const re = /"(?:[^"]|"")*"|('[^']*'!|[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_.]*!)?(\$?)([A-Za-z]{1,3})(\$?)(\d{1,6})(?![A-Za-z0-9_(])/g;
    let out = '', last = 0, m;
    while ((m = re.exec(body))) {
      if (m[0][0] === '"') continue;
      const before = body[m.index - 1] || '';
      if (!m[1] && /[A-Za-zÀ-ÿ0-9_.$]/.test(before)) continue;
      out += body.slice(last, m.index);
      const col = m[2] ? colToNum(m[3]) : colToNum(m[3]) + dCol;
      const row = m[4] ? Number(m[5]) : Number(m[5]) + dRow;
      out += (m[1] || '') + (col < 1 || row < 1 ? '#REF!' : m[2] + numToCol(col) + m[4] + row);
      last = m.index + m[0].length;
    }
    return '=' + out + body.slice(last);
  }

  /* ---------------- Affichage ---------------- */
  function afficher(v, fmt = {}) {
    if (v === null || v === undefined) return '';
    if (isErr(v)) return v.code;
    if (typeof v === 'boolean') return v ? 'VRAI' : 'FAUX';
    if (typeof v === 'number') {
      let x = v;
      const opts = {};
      if (fmt.pct) x = v * 100;
      if (fmt.dec !== undefined) { opts.minimumFractionDigits = fmt.dec; opts.maximumFractionDigits = fmt.dec; }
      else {
        const abs = Math.abs(x);
        if (abs !== 0 && (abs >= 1e15 || abs < 1e-9)) return x.toExponential(4).replace('.', ',');
        opts.maximumFractionDigits = abs >= 1 ? Math.max(0, 10 - Math.floor(Math.log10(abs)) - 1) : 10;
      }
      opts.useGrouping = fmt.sep !== false;
      return x.toLocaleString('fr-FR', opts).replace(/ /g, ' ') + (fmt.pct ? ' %' : '');
    }
    return String(v);
  }

  /* ---------------- Liste des fonctions (aide) ---------------- */
  function listeFonctions() {
    const fr = Object.keys(FR).filter(k => !k.includes('_')).sort();
    return fr.map(k => ({ fr: k, en: FR[k] }));
  }

  return { Classeur, Feuille, parse, tokenize, parseInput, afficher, decaler, colToNum, numToCol, refName, parseRef, isErr, XErr, E, FR, listeFonctions, toNumberLoose };
});
