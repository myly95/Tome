/* Tòme : Atelier Code
 * Carnets multilangages (Python, R, SQL, JavaScript, HTML) exécutés dans le navigateur,
 * espace de fichiers partagé entre les langages, et connexion à GitHub.
 */
(() => {
  'use strict';
  const CFG = window.TOME_CONFIG;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const MAX_SYNC = 50 * 1024 * 1024;
  const JUNK = /^(default\.profraw|Rplots\.pdf|\.Rhistory)$/;

  const LANGS = {
    python: { label: 'Python', mode: 'python' },
    r: { label: 'R', mode: 'r' },
    sql: { label: 'SQL', mode: 'text/x-sqlite' },
    javascript: { label: 'JavaScript', mode: 'javascript' },
    html: { label: 'HTML', mode: 'htmlmixed' }
  };

  /* ---------------- Utilitaires ---------------- */
  const ls = {
    get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtSize = n => n < 1024 ? n + ' o' : n < 1048576 ? (n / 1024).toFixed(1) + ' Ko' : (n / 1048576).toFixed(1) + ' Mo';
  const toBytes = d => d instanceof Uint8Array ? d : typeof d === 'string' ? enc.encode(d) : new Uint8Array(d);
  function b64(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function hash(u8) {
    let h = 2166136261 ^ u8.length;
    for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function saveAs(name, data, type = 'application/octet-stream') {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res;
      s.onerror = () => rej(new Error('Chargement impossible : vérifiez la connexion internet.'));
      document.head.appendChild(s);
    });
  }
  function toast(msg, isErr) {
    let t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3200);
  }
  const safeName = n => n.replace(/[\\/:*?"<>|]+/g, '-').replace(/^\.+/, '').trim() || 'fichier';

  /* ---------------- Espace de fichiers (IndexedDB) ---------------- */
  const Files = {
    map: new Map(),
    db: null,
    async open() {
      try {
        this.db = await new Promise((res, rej) => {
          const r = indexedDB.open('tome-atelier', 1);
          r.onupgradeneeded = () => r.result.createObjectStore('files', { keyPath: 'name' });
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        });
        const all = await this.tx('readonly', s => s.getAll());
        all.forEach(f => this.map.set(f.name, { ...f, data: new Uint8Array(f.data), h: hash(new Uint8Array(f.data)) }));
      } catch (e) { this.db = null; }
    },
    tx(mode, fn) {
      return new Promise((res, rej) => {
        if (!this.db) return res(null);
        const t = this.db.transaction('files', mode);
        const r = fn(t.objectStore('files'));
        t.oncomplete = () => res(r && r.result);
        t.onerror = () => rej(t.error);
      });
    },
    async put(name, data, from = null) {
      name = safeName(name);
      const u8 = toBytes(data);
      const h = hash(u8);
      const prev = this.map.get(name);
      if (prev && prev.h === h && prev.data.length === u8.length) return;
      const rec = { name, data: u8, size: u8.length, updated: Date.now(), h };
      this.map.set(name, rec);
      this.tx('readwrite', s => s.put({ name, data: u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength), size: u8.length, updated: rec.updated })).catch(() => {});
      for (const k of Object.values(Kernels)) if (k.id !== from && k.live) { try { await k.writeFile(name, u8); } catch (e) {} }
      renderFiles();
    },
    async remove(name) {
      this.map.delete(name);
      this.tx('readwrite', s => s.delete(name)).catch(() => {});
      for (const k of Object.values(Kernels)) if (k.live) { try { await k.unlink(name); } catch (e) {} }
      renderFiles();
    }
  };

  /* ---------------- Noyaux ---------------- */
  class Kernel {
    constructor(id, label) { this.id = id; this.label = label; this.ready = null; this.live = false; }
    ensure() {
      if (!this.ready) {
        this.setState('loading', 'chargement…');
        this.ready = (async () => {
          await this.boot();
          this.live = true;
          for (const f of Files.map.values()) { try { await this.writeFile(f.name, f.data); } catch (e) {} }
          this.setState('ready', 'prêt');
        })().catch(e => { this.ready = null; this.live = false; this.setState('error', 'indisponible'); throw e; });
      }
      return this.ready;
    }
    async restart() { this.live = false; this.ready = null; try { await this.shutdown(); } catch (e) {} this.setState('off', ''); }
    setState(state, msg) {
      let pill = $(`.kpill[data-k="${this.id}"]`);
      if (!pill) {
        pill = document.createElement('span');
        pill.className = 'kpill'; pill.dataset.k = this.id;
        pill.innerHTML = '<i></i><span></span>';
        $('#kernels').appendChild(pill);
      }
      if (state === 'off') { pill.remove(); return; }
      pill.className = 'kpill ' + state;
      pill.querySelector('span').textContent = this.label + ' ' + msg;
    }
    async writeFile() {} async unlink() {} async scan() { return []; } async shutdown() {}
  }

  /* Python (Pyodide) */
  const PY_HELPER = `
import os, sys, io, base64, warnings, ast, importlib, importlib.util
os.environ["MPLBACKEND"] = "Agg"
warnings.filterwarnings("ignore", message=".*non-interactive.*")
warnings.filterwarnings("ignore", message=r"(?s).*Pyarrow")
from pyodide.code import eval_code_async

_TOME_ALIASES = {"sklearn": "scikit-learn", "PIL": "pillow", "cv2": "opencv-python", "bs4": "beautifulsoup4",
                 "yaml": "pyyaml", "skimage": "scikit-image", "dateutil": "python-dateutil", "Bio": "biopython",
                 "docx": "python-docx", "pptx": "python-pptx", "dotenv": "python-dotenv"}
_tome_buf = []

def _tome_repr(val):
    rep = getattr(val, "_repr_html_", None)
    if callable(rep):
        try:
            html = rep()
            if html:
                return ["html", html]
        except Exception:
            pass
    return ["text", repr(val)]

def display(*objs):
    for o in objs:
        _tome_buf.append(_tome_repr(o))

def _tome_plan(src):
    keep, pip = [], []
    for line in src.split("\\n"):
        s = line.strip()
        parts = s.split()
        if len(parts) > 2 and parts[0] in ("%pip", "!pip", "%pip3", "!pip3") and parts[1] == "install":
            pip += [p for p in parts[2:] if not p.startswith("-")]
            keep.append("")
        else:
            keep.append(line)
    code = "\\n".join(keep)
    missing = []
    try:
        mods = set()
        for node in ast.walk(ast.parse(code)):
            if isinstance(node, ast.Import):
                mods |= {a.name.split(".")[0] for a in node.names}
            elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
                mods.add(node.module.split(".")[0])
        for m in sorted(mods):
            if m not in sys.modules and importlib.util.find_spec(m) is None:
                missing.append(_TOME_ALIASES.get(m, m))
    except SyntaxError:
        pass
    return {"code": code, "pip": pip, "missing": missing}

async def _tome_install(pkgs):
    import micropip
    ok, bad = [], []
    for p in pkgs:
        try:
            await micropip.install(p)
            ok.append(p)
        except Exception as e:
            bad.append(p + " : " + str(e).split("\\n")[0])
    importlib.invalidate_caches()
    return {"ok": ok, "bad": bad}

async def _tome_exec(src):
    _tome_buf.clear()
    out = {"display": [], "result": None, "images": []}
    val = await eval_code_async(src, globals(), filename="<cellule>")
    out["display"] = list(_tome_buf)
    if val is not None:
        out["result"] = _tome_repr(val)
    if "matplotlib.pyplot" in sys.modules:
        import matplotlib.pyplot as plt
        for n in plt.get_fignums():
            buf = io.BytesIO()
            plt.figure(n).savefig(buf, format="png", bbox_inches="tight", dpi=110)
            out["images"].append(base64.b64encode(buf.getvalue()).decode())
        plt.close("all")
    return out
`;
  const Py = new Kernel('python', 'Python');
  Py.home = '/home/pyodide';
  Py.boot = async function () {
    if (!window.loadPyodide) await loadScript(CFG.pyodideBase + 'pyodide.js');
    this.py = await loadPyodide({ indexURL: CFG.pyodideBase });
    await this.py.loadPackage('micropip');
    await this.py.runPythonAsync(PY_HELPER);
    try { this.py.FS.mkdirTree(this.home); } catch (e) {}
    this.py.FS.chdir(this.home);
  };
  Py.shutdown = async function () { this.py = null; };
  Py.writeFile = async function (n, d) { this.py.FS.writeFile(this.home + '/' + n, d); };
  Py.unlink = async function (n) { this.py.FS.unlink(this.home + '/' + n); };
  Py.scan = async function () {
    const out = [];
    for (const n of this.py.FS.readdir(this.home)) {
      if (n.startsWith('.')) continue;
      const p = this.home + '/' + n;
      const st = this.py.FS.stat(p);
      if (this.py.FS.isFile(st.mode) && st.size <= MAX_SYNC) out.push({ name: n, data: this.py.FS.readFile(p) });
    }
    return out;
  };
  Py.call = function (fn, ...args) { return this.py.globals.get(fn)(...args); };
  Py.toJs = p => { const v = p.toJs({ dict_converter: Object.fromEntries }); p.destroy(); return v; };
  Py.run = async function (code, out) {
    const py = this.py;
    py.setStdout({ batched: s => out.add('stdout', s + '\n') });
    py.setStderr({ batched: s => out.add('stderr', s + '\n') });
    let plan = this.toJs(this.call('_tome_plan', code));
    await py.loadPackagesFromImports(plan.code);
    plan = this.toJs(this.call('_tome_plan', code));
    const todo = [...new Set([...plan.pip, ...plan.missing])];
    if (todo.length) {
      out.add('note', 'Installation : ' + todo.join(', ') + '…');
      const res = this.toJs(await this.call('_tome_install', py.toPy(todo)));
      if (res.ok.length) out.add('note', 'Installé : ' + res.ok.join(', '));
      res.bad.forEach(b => out.add('stderr', 'Installation impossible pour ' + b + '\n'));
    }
    if (!plan.code.trim()) return;
    py.globals.set('_tome_src', plan.code);
    const res = this.toJs(await py.runPythonAsync('await _tome_exec(_tome_src)'));
    res.display.forEach(([k, v]) => out.add(k === 'html' ? 'html' : 'result', v));
    if (res.result) out.add(res.result[0] === 'html' ? 'html' : 'result', res.result[1]);
    res.images.forEach(i => out.add('image', 'data:image/png;base64,' + i));
  };
  Py.cleanError = function (msg) {
    const lines = String(msg).split('\n');
    const i = lines.findIndex(l => l.includes('File "<cellule>"'));
    return (i >= 0 ? ['Traceback (most recent call last):', ...lines.slice(i)] : lines).join('\n').replace(/File "<cellule>"/g, 'Cellule').trim();
  };
  Py.install = async function (pkgs) {
    await this.ensure();
    return this.toJs(await this.call('_tome_install', this.py.toPy(pkgs)));
  };

  /* R (webR) */
  const R = new Kernel('r', 'R');
  R.home = '/home/web_user';
  R.boot = async function () {
    const { WebR } = await import(CFG.webrBase + 'webr.mjs');
    this.r = new WebR({ baseUrl: CFG.webrBase });
    await this.r.init();
    this.shelter = await new this.r.Shelter();
    await this.r.evalRVoid('webr::shim_install(); setwd("' + this.home + '")');
  };
  R.shutdown = async function () { try { this.r.close(); } catch (e) {} this.r = null; };
  R.writeFile = async function (n, d) { await this.r.FS.writeFile(this.home + '/' + n, d); };
  R.unlink = async function (n) { await this.r.FS.unlink(this.home + '/' + n); };
  R.scan = async function () {
    const out = [];
    const node = await this.r.FS.lookupPath(this.home);
    for (const [n, c] of Object.entries(node.contents || {})) {
      if (c.isFolder || n.startsWith('.')) continue;
      const data = await this.r.FS.readFile(this.home + '/' + n);
      if (data.length <= MAX_SYNC) out.push({ name: n, data });
    }
    return out;
  };
  R.install = async function (pkgs) {
    await this.ensure();
    const ok = [], bad = [];
    for (const p of pkgs) {
      try { await this.r.installPackages([p], { quiet: true }); ok.push(p); }
      catch (e) { bad.push(p + ' : ' + e.message); }
    }
    return { ok, bad };
  };
  R.run = async function (code, out) {
    const pkgs = [...new Set([...code.matchAll(/(?:library|require)\(\s*["']?([A-Za-z][A-Za-z0-9.]*)/g)].map(m => m[1]))];
    for (const p of pkgs) {
      const has = await this.r.evalRBoolean('requireNamespace("' + p + '", quietly = TRUE)');
      if (!has) {
        out.add('note', 'Installation du paquet R ' + p + '…');
        try { await this.r.installPackages([p], { quiet: true }); }
        catch (e) { out.add('stderr', 'Installation impossible pour ' + p + '\n'); }
      }
    }
    try {
      const res = await this.shelter.captureR(code, {
        withAutoprint: true, captureStreams: true, captureConditions: false,
        captureGraphics: { width: 720, height: 450 }
      });
      res.output.forEach(o => out.add(o.type === 'stdout' ? 'stdout' : 'stderr', o.data + '\n'));
      res.images.forEach(img => {
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        out.add('image', c.toDataURL('image/png'));
      });
    } finally { await this.shelter.purge(); }
  };
  R.cleanError = m => String(m).replace(/^Error:\s*/, 'Erreur : ');

  /* JavaScript (Web Worker isolé) */
  function jsWorkerMain() {
    const fichiers = {};
    let cur = null;
    const send = (kind, text) => self.postMessage({ id: cur, kind, text });
    const fmt = v => {
      if (typeof v === 'string') return v;
      if (typeof v === 'function') return v.toString();
      try { const s = JSON.stringify(v, null, 2); return s === undefined ? String(v) : s; } catch (e) { return String(v); }
    };
    const show = v => typeof v === 'string' ? JSON.stringify(v) : fmt(v);
    self.lireTexte = n => { if (!(n in fichiers)) throw new Error('Fichier introuvable : ' + n); return new TextDecoder().decode(fichiers[n]); };
    self.lireOctets = n => { if (!(n in fichiers)) throw new Error('Fichier introuvable : ' + n); return fichiers[n]; };
    self.ecrireFichier = (n, contenu) => {
      const d = typeof contenu === 'string' ? new TextEncoder().encode(contenu) : new Uint8Array(contenu);
      fichiers[n] = d;
      self.postMessage({ kind: 'file', name: n, data: d });
      return n;
    };
    self.listeFichiers = () => Object.keys(fichiers);
    console.log = console.info = (...a) => send('stdout', a.map(fmt).join(' ') + '\n');
    console.warn = console.error = (...a) => send('stderr', a.map(fmt).join(' ') + '\n');
    console.table = d => send('table', JSON.stringify(d));
    self.onmessage = async e => {
      const m = e.data;
      if (m.type === 'file') { fichiers[m.name] = m.data; return; }
      if (m.type === 'unlink') { delete fichiers[m.name]; return; }
      cur = m.id;
      try {
        let r;
        if (/\bawait\b/.test(m.code)) r = await (0, eval)('(async () => {\n' + m.code + '\n})()');
        else {
          r = (0, eval)(m.code.replace(/^(let|const)\s/gm, 'var '));
          if (r && typeof r.then === 'function') r = await r;
        }
        if (r !== undefined) send('result', show(r));
      } catch (err) {
        send('err', err && err.name ? err.name + ' : ' + err.message : String(err));
      }
      self.postMessage({ id: cur, kind: 'done' });
    };
  }
  const JS = new Kernel('javascript', 'JavaScript');
  JS.boot = async function () {
    const url = URL.createObjectURL(new Blob(['(' + jsWorkerMain.toString() + ')()'], { type: 'text/javascript' }));
    this.w = new Worker(url);
    this.seq = 0; this.pending = new Map();
    this.w.onmessage = e => {
      const m = e.data;
      if (m.kind === 'file') { Files.put(m.name, m.data, 'javascript'); return; }
      const p = this.pending.get(m.id);
      if (!p) return;
      if (m.kind === 'done') { this.pending.delete(m.id); p.resolve(); }
      else if (m.kind === 'err') p.out.add('err', m.text);
      else if (m.kind === 'table') p.out.add('htmltable', jsonToTable(JSON.parse(m.text)));
      else p.out.add(m.kind, m.text);
    };
  };
  JS.shutdown = async function () { this.w?.terminate(); this.pending?.forEach(p => p.resolve()); this.w = null; };
  JS.writeFile = async function (n, d) { this.w.postMessage({ type: 'file', name: n, data: d }); };
  JS.unlink = async function (n) { this.w.postMessage({ type: 'unlink', name: n }); };
  JS.run = function (code, out) {
    return new Promise(resolve => {
      const id = ++this.seq;
      this.pending.set(id, { out, resolve });
      this.w.postMessage({ id, code });
    });
  };
  function jsonToTable(d) {
    const rows = Array.isArray(d) ? d : Object.entries(d || {}).map(([k, v]) => (typeof v === 'object' && v ? { '(index)': k, ...v } : { '(index)': k, Valeur: v }));
    const cols = [...new Set(rows.flatMap(r => (r && typeof r === 'object') ? Object.keys(r) : ['Valeur']))];
    return '<table><thead><tr>' + cols.map(c => '<th>' + esc(c) + '</th>').join('') + '</tr></thead><tbody>' +
      rows.map(r => '<tr>' + cols.map(c => '<td>' + esc(r && typeof r === 'object' ? (r[c] ?? '') : r) + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
  }

  /* SQL (sql.js / SQLite) */
  const SQL = new Kernel('sql', 'SQL');
  SQL.boot = async function () {
    if (!window.initSqlJs) await loadScript(CFG.sqljsBase + 'sql-wasm.js');
    this.lib = await initSqlJs({ locateFile: f => CFG.sqljsBase + f });
    this.db = new this.lib.Database();
  };
  SQL.shutdown = async function () { try { this.db.close(); } catch (e) {} this.db = null; };
  SQL.run = async function (code, out) {
    const results = this.db.exec(code);
    if (!results.length) { out.add('note', 'Requête exécutée. ' + this.db.getRowsModified() + ' ligne(s) modifiée(s).'); return; }
    results.forEach(r => {
      const shown = r.values.slice(0, 500);
      out.add('htmltable', '<table><thead><tr>' + r.columns.map(c => '<th>' + esc(c) + '</th>').join('') + '</tr></thead><tbody>' +
        shown.map(v => '<tr>' + v.map(x => '<td>' + esc(x == null ? 'NULL' : x) + '</td>').join('') + '</tr>').join('') + '</tbody></table>');
      out.add('note', r.values.length + ' ligne(s)' + (r.values.length > 500 ? ', 500 affichées' : ''));
    });
  };
  SQL.importCSV = async function (name) {
    await this.ensure();
    const text = dec.decode(Files.map.get(name).data).replace(/^﻿/, '');
    const rows = parseCSV(text);
    if (rows.length < 1) throw new Error('Fichier vide.');
    const table = name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1') || 'donnees';
    const head = rows[0].map((h, i) => (h || 'col' + (i + 1)).replace(/"/g, ''));
    const body = rows.slice(1).filter(r => r.length > 1 || r[0] !== '');
    const numeric = head.map((_, i) => body.length > 0 && body.every(r => r[i] === undefined || r[i] === '' || !isNaN(Number(r[i]))));
    this.db.run('DROP TABLE IF EXISTS "' + table + '"');
    this.db.run('CREATE TABLE "' + table + '" (' + head.map((h, i) => '"' + h + '" ' + (numeric[i] ? 'REAL' : 'TEXT')).join(', ') + ')');
    const st = this.db.prepare('INSERT INTO "' + table + '" VALUES (' + head.map(() => '?').join(',') + ')');
    this.db.run('BEGIN');
    body.forEach(r => st.run(head.map((_, i) => r[i] === undefined || r[i] === '' ? null : numeric[i] ? Number(r[i]) : r[i])));
    this.db.run('COMMIT');
    st.free();
    return { table, rows: body.length };
  };
  SQL.openDb = async function (name) {
    await this.ensure();
    this.db.close();
    this.db = new this.lib.Database(Files.map.get(name).data);
  };
  SQL.exportDb = async function () {
    await this.ensure();
    await Files.put('base.sqlite', this.db.export());
  };
  function parseCSV(text) {
    const sep = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === sep) { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
      else f += c;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows;
  }

  /* HTML (iframe isolée) */
  const HTML = new Kernel('html', 'HTML');
  HTML.boot = async function () {};
  HTML.setState = function () {};
  HTML.run = async function (code, out) { out.add('frame', code); };

  const Kernels = { python: Py, r: R, sql: SQL, javascript: JS, html: HTML };

  /* ---------------- Modèles de carnets ---------------- */
  const TEMPLATES = {
    python: { title: 'Carnet Python', cells: [
      ['markdown', "# Carnet Python\nCliquez dans une cellule de code puis appuyez sur **Maj + Entrée**.\n\nToutes les bibliothèques s'installent automatiquement à l'import. Vous pouvez aussi écrire `%pip install nom-du-paquet`."],
      ['code', 'print("Bonjour, Haïti !")\n2026 - 1804  # années depuis l\'indépendance'],
      ['markdown', "## Analyse de données avec pandas"],
      ['code', 'import pandas as pd\n\ndf = pd.DataFrame({\n    "departement": ["Artibonite", "Centre", "Grand\'Anse", "Nippes", "Nord",\n                    "Nord-Est", "Nord-Ouest", "Ouest", "Sud", "Sud-Est"],\n    "chef_lieu": ["Gonaïves", "Hinche", "Jérémie", "Miragoâne", "Cap-Haïtien",\n                  "Fort-Liberté", "Port-de-Paix", "Port-au-Prince", "Les Cayes", "Jacmel"],\n})\ndf.to_csv("departements.csv", index=False)  # apparaît dans Fichiers\ndf.head()'],
      ['markdown', "## Un graphique"],
      ['code', 'import numpy as np\nimport matplotlib.pyplot as plt\n\nx = np.linspace(-3, 3, 200)\nplt.plot(x, x**2 - 2, color="#b5442c", lw=2)\nplt.axhline(0, color="#14213d", lw=0.8)\nplt.title("f(x) = x² - 2")\nplt.grid(alpha=0.3)'],
      ['code', '']
    ] },
    r: { title: 'Carnet R', cells: [
      ['markdown', "# Carnet R\nR fonctionne dans le navigateur. Les paquets CRAN s'installent automatiquement avec `library()`."],
      ['code', 'notes <- c(12, 15, 9, 17, 14, 11, 16)\nsummary(notes)'],
      ['code', 'hist(rnorm(500, mean = 50, sd = 10), col = "#b5442c", border = "white",\n     main = "Distribution normale", xlab = "Valeur")'],
      ['markdown', "Pour lire un fichier importé dans **Fichiers** : `read.csv(\"mon_fichier.csv\")`"],
      ['code', '']
    ] },
    sql: { title: 'Carnet SQL', cells: [
      ['markdown', "# Carnet SQL\nUne base SQLite vit dans votre navigateur. Importez un CSV depuis **Fichiers** pour le transformer en table."],
      ['code', "CREATE TABLE departements (nom TEXT, chef_lieu TEXT);\nINSERT INTO departements VALUES\n  ('Artibonite', 'Gonaïves'), ('Centre', 'Hinche'), ('Grand''Anse', 'Jérémie'),\n  ('Nippes', 'Miragoâne'), ('Nord', 'Cap-Haïtien'), ('Nord-Est', 'Fort-Liberté'),\n  ('Nord-Ouest', 'Port-de-Paix'), ('Ouest', 'Port-au-Prince'), ('Sud', 'Les Cayes'),\n  ('Sud-Est', 'Jacmel');"],
      ['code', "SELECT nom, chef_lieu FROM departements WHERE nom LIKE 'Nord%' ORDER BY nom;"],
      ['code', '']
    ] },
    javascript: { title: 'Carnet JavaScript', cells: [
      ['markdown', "# Carnet JavaScript\nLes variables sont conservées d'une cellule à l'autre. Fonctions utiles : `lireTexte(nom)`, `ecrireFichier(nom, contenu)`, `listeFichiers()`."],
      ['code', 'const notes = [12, 15, 9, 17, 14];\nconst moyenne = notes.reduce((a, b) => a + b, 0) / notes.length;\nconsole.log("Moyenne :", moyenne);\nmoyenne >= 10 ? "Admis" : "Ajourné"'],
      ['code', 'console.table([{ nom: "Nord", chef_lieu: "Cap-Haïtien" }, { nom: "Sud", chef_lieu: "Les Cayes" }])'],
      ['code', '']
    ] },
    html: { title: 'Carnet Web', cells: [
      ['markdown', "# Carnet Web\nÉcrivez du HTML, du CSS et du JavaScript : le rendu s'affiche sous la cellule."],
      ['code', '<style>\n  .carte { font-family: Georgia, serif; padding: 24px; border-radius: 14px;\n          background: #14213d; color: #f6f1e7; max-width: 360px; }\n  .carte b { color: #c8962e; }\n</style>\n<div class="carte">\n  <h2>Bonjour, <b>Haïti</b> !</h2>\n  <button onclick="this.textContent = \'Merci !\'">Cliquez-moi</button>\n</div>'],
      ['code', '']
    ] }
  };

  /* ---------------- Carnet ---------------- */
  const STORE = 'tome_atelier_v1';
  const nbEl = $('#nb');
  const titleEl = $('#nb-title');
  let state = ls.get(STORE) || { current: null, notebooks: {} };
  let nb = null;
  let cells = [];
  let selected = null;
  let queue = Promise.resolve();
  let execCount = 0;
  let uid = 0;

  const newId = () => 'nb' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  function persist() {
    if (!nb) return;
    nb.title = titleEl.value;
    nb.cells = cells.map(c => ({ type: c.type, lang: c.lang, source: c.cm.getValue() }));
    nb.updated = Date.now();
    nb.cloudDirty = true;
    state.notebooks[nb.id] = nb;
    state.current = nb.id;
    ls.set(STORE, state);
  }
  let saveT;
  const saveSoon = () => { clearTimeout(saveT); saveT = setTimeout(persist, 500); };

  function fromTemplate(lang) {
    const t = TEMPLATES[lang] || TEMPLATES.python;
    return { id: newId(), title: t.title, lang, updated: Date.now(), cells: t.cells.map(([type, source]) => ({ type, lang, source })) };
  }

  function openNotebook(n) {
    if (nb) persist();
    nb = n;
    nbEl.innerHTML = ''; cells = []; selected = null;
    titleEl.value = n.title || 'Carnet sans titre';
    $('#nb-lang').value = n.lang || 'python';
    const list = n.cells && n.cells.length ? n.cells : [{ type: 'code', lang: n.lang, source: '' }];
    list.forEach(c => makeCell(c.type, c.source, cells.length, c.lang || n.lang));
    select(cells[0]);
    persist();
    Kernels[n.lang]?.ensure().catch(() => {});
    history.replaceState(null, '', location.pathname + '?carnet=' + encodeURIComponent(n.id));
  }

  const icon = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const langOptions = cur => Object.entries(LANGS).map(([k, v]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${v.label}</option>`).join('');

  function makeCell(type, source = '', index = cells.length, lang = nb.lang) {
    const el = document.createElement('div');
    el.className = 'cell ' + (type === 'code' ? 'code' : 'md');
    el.innerHTML = `
      <div class="gutter">
        ${type === 'code' ? `<button class="run" title="Exécuter (Maj + Entrée)" aria-label="Exécuter la cellule"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z"/></svg></button><span class="count">[ ]</span>` : ''}
      </div>
      <div class="body">
        <div class="cell-actions">
          <button data-act="up" title="Monter">${icon('<path d="M12 19V5M5 12l7-7 7 7"/>')}</button>
          <button data-act="down" title="Descendre">${icon('<path d="M12 5v14M5 12l7 7 7-7"/>')}</button>
          <button data-act="toggle" title="Changer le type">${type === 'code' ? 'Texte' : 'Code'}</button>
          <button data-act="delete" title="Supprimer">${icon('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>')}</button>
        </div>
        <div class="editor">${type === 'code' ? `<select class="lang-pick" aria-label="Langage de la cellule">${langOptions(lang)}</select>` : ''}</div>
        ${type === 'code' ? '<div class="output" aria-live="polite"></div>' : '<div class="md-render"></div>'}
      </div>`;
    const cell = { id: ++uid, type, lang, el, count: null, outputs: [] };
    cell.cm = CodeMirror(el.querySelector('.editor'), {
      value: source,
      mode: type === 'code' ? LANGS[lang].mode : 'markdown',
      theme: 'tome', lineWrapping: true, matchBrackets: true, autoCloseBrackets: true,
      indentUnit: lang === 'python' ? 4 : 2, viewportMargin: Infinity,
      placeholder: type === 'code' ? 'Écrivez du code ici…' : 'Écrivez du texte (Markdown)…',
      extraKeys: {
        'Shift-Enter': () => runAndAdvance(cell),
        'Ctrl-Enter': () => runCell(cell),
        'Cmd-Enter': () => runCell(cell),
        Tab: c => c.somethingSelected() ? c.indentSelection('add') : c.replaceSelection(' '.repeat(c.getOption('indentUnit')), 'end'),
        'Shift-Tab': c => c.indentSelection('subtract')
      }
    });
    if (type === 'code') {
      cell.outEl = el.querySelector('.output');
      cell.countEl = el.querySelector('.count');
      el.querySelector('.run').addEventListener('click', e => { e.stopPropagation(); select(cell); runCell(cell); });
      el.querySelector('.lang-pick').addEventListener('change', e => {
        cell.lang = e.target.value;
        cell.cm.setOption('mode', LANGS[cell.lang].mode);
        cell.cm.setOption('indentUnit', cell.lang === 'python' ? 4 : 2);
        Kernels[cell.lang].ensure().catch(() => {});
        saveSoon();
      });
    } else {
      cell.mdEl = el.querySelector('.md-render');
      cell.mdEl.addEventListener('dblclick', () => editMarkdown(cell));
    }
    cell.cm.on('focus', () => select(cell));
    cell.cm.on('change', saveSoon);
    el.addEventListener('mousedown', () => select(cell));
    el.querySelectorAll('.cell-actions button').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); cellAction(cell, b.dataset.act); }));
    nbEl.insertBefore(el, nbEl.children[index] || null);
    cells.splice(index, 0, cell);
    if (type !== 'code') { if (source.trim()) renderMarkdown(cell); else editMarkdown(cell); }
    setTimeout(() => cell.cm.refresh(), 0);
    return cell;
  }

  function renderMarkdown(cell) {
    const src = cell.cm.getValue();
    cell.mdEl.innerHTML = src.trim() ? marked.parse(src) : '<p class="placeholder">Double-cliquez pour écrire du texte.</p>';
    cell.el.querySelector('.editor').hidden = true;
    cell.mdEl.hidden = false;
  }
  function editMarkdown(cell) {
    cell.el.querySelector('.editor').hidden = false;
    cell.mdEl.hidden = true;
    cell.cm.refresh(); cell.cm.focus();
  }
  function select(cell) {
    if (!cell || selected === cell) return;
    selected?.el.classList.remove('selected');
    selected = cell;
    cell.el.classList.add('selected');
  }

  /* Sorties */
  function makeOut(cell) {
    return {
      add(kind, text) {
        const last = cell.outputs[cell.outputs.length - 1];
        if (last && (kind === 'stdout' || kind === 'stderr') && last.kind === kind) {
          last.text += text; last.node.textContent = last.text; return;
        }
        let node;
        if (kind === 'image') {
          node = document.createElement('div');
          node.className = 'img-out';
          node.innerHTML = `<img alt="Graphique" src="${text}"><button class="tbtn dl-img" title="Télécharger l'image">${icon('<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>')}PNG</button>`;
          node.querySelector('button').addEventListener('click', () => {
            const a = document.createElement('a'); a.href = text; a.download = 'graphique-' + Date.now() + '.png'; a.click();
          });
        } else if (kind === 'html' || kind === 'htmltable') {
          if (kind === 'html' && /<script/i.test(text)) { node = frame(text); }
          else { node = document.createElement('div'); node.className = 'html'; node.innerHTML = text; }
        } else if (kind === 'frame') {
          node = frame(text);
        } else {
          node = document.createElement('pre');
          node.className = kind === 'err' ? 'err' : kind === 'stderr' ? 'stderr' : kind === 'note' ? 'note' : '';
          node.textContent = text;
        }
        cell.outEl.appendChild(node);
        cell.outputs.push({ kind, text, node });
      }
    };
  }
  function frame(src) {
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', 'allow-scripts allow-modals allow-forms');
    f.srcdoc = src;
    f.style.height = '320px';
    return f;
  }

  function runCell(cell) {
    if (cell.type !== 'code') { renderMarkdown(cell); return Promise.resolve(); }
    const code = cell.cm.getValue();
    const k = Kernels[cell.lang];
    cell.outEl.innerHTML = ''; cell.outputs = [];
    cell.countEl.textContent = '[*]';
    cell.el.classList.add('running');
    const out = makeOut(cell);
    queue = queue.then(async () => {
      try {
        await k.ensure();
      } catch (e) {
        out.add('err', k.label + ' n’a pas pu démarrer : ' + (e.message || e));
        cell.countEl.textContent = '[ ]'; cell.el.classList.remove('running');
        return;
      }
      k.setState('busy', 'exécution…');
      try {
        if (code.trim()) await k.run(code, out);
      } catch (e) {
        out.add('err', k.cleanError ? k.cleanError(e.message || String(e)) : (e.message || String(e)));
      } finally {
        execCount += 1;
        cell.count = execCount;
        cell.countEl.textContent = `[${execCount}]`;
        cell.el.classList.remove('running');
        if (k.live) k.setState('ready', 'prêt');
        try { for (const f of await k.scan()) if (f.data.length && !JUNK.test(f.name)) await Files.put(f.name, f.data, k.id); } catch (e) {}
        persist();
      }
    });
    return queue;
  }
  function runAndAdvance(cell) {
    runCell(cell);
    const i = cells.indexOf(cell);
    let next = cells[i + 1] || makeCell('code', '', i + 1, cell.type === 'code' ? cell.lang : nb.lang);
    select(next);
    if (next.type === 'code' || !next.mdEl.hidden) next.cm.focus();
    next.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function cellAction(cell, act) {
    const i = cells.indexOf(cell);
    if (act === 'delete') {
      if (cells.length === 1) { cell.cm.setValue(''); return; }
      cell.el.remove(); cells.splice(i, 1);
      select(cells[Math.min(i, cells.length - 1)]);
    } else if (act === 'up' && i > 0) {
      nbEl.insertBefore(cell.el, cells[i - 1].el); cells.splice(i, 1); cells.splice(i - 1, 0, cell);
    } else if (act === 'down' && i < cells.length - 1) {
      nbEl.insertBefore(cells[i + 1].el, cell.el); cells.splice(i, 1); cells.splice(i + 1, 0, cell);
    } else if (act === 'toggle') {
      const src = cell.cm.getValue();
      cell.el.remove(); cells.splice(i, 1);
      select(makeCell(cell.type === 'code' ? 'markdown' : 'code', src, i, cell.lang));
    }
    persist();
  }
  function insertCell(type) {
    const i = selected ? cells.indexOf(selected) + 1 : cells.length;
    const c = makeCell(type, '', i, selected?.type === 'code' ? selected.lang : nb.lang);
    select(c); c.cm.focus(); persist();
  }

  /* ---------------- .ipynb ---------------- */
  const KSPEC = {
    python: { name: 'python3', display_name: 'Python 3', language: 'python' },
    r: { name: 'ir', display_name: 'R', language: 'R' },
    sql: { name: 'sql', display_name: 'SQL', language: 'sql' },
    javascript: { name: 'javascript', display_name: 'JavaScript', language: 'javascript' },
    html: { name: 'html', display_name: 'HTML', language: 'html' }
  };
  function toIpynb() {
    persist();
    const split = s => s.split(/(?<=\n)/);
    return {
      nbformat: 4, nbformat_minor: 5,
      metadata: { kernelspec: KSPEC[nb.lang], language_info: { name: KSPEC[nb.lang].language.toLowerCase() }, tome: { title: nb.title, lang: nb.lang } },
      cells: cells.map((c, i) => c.type === 'code'
        ? { cell_type: 'code', id: 'cell-' + i, metadata: c.lang !== nb.lang ? { tome: { lang: c.lang } } : {}, execution_count: c.count, source: split(c.cm.getValue()),
            outputs: c.outputs.filter(o => o.kind !== 'note').map(o =>
              o.kind === 'image' ? { output_type: 'display_data', metadata: {}, data: { 'image/png': o.text.split(',')[1] } }
              : (o.kind === 'html' || o.kind === 'htmltable' || o.kind === 'frame') ? { output_type: 'display_data', metadata: {}, data: { 'text/html': split(o.text) } }
              : o.kind === 'result' ? { output_type: 'execute_result', execution_count: c.count, metadata: {}, data: { 'text/plain': split(o.text) } }
              : o.kind === 'err' ? { output_type: 'error', ename: 'Erreur', evalue: '', traceback: o.text.split('\n') }
              : { output_type: 'stream', name: o.kind === 'stderr' ? 'stderr' : 'stdout', text: split(o.text) }) }
        : { cell_type: 'markdown', id: 'cell-' + i, metadata: {}, source: split(c.cm.getValue()) })
    };
  }
  function fromIpynb(json, fallbackTitle) {
    const join = s => Array.isArray(s) ? s.join('') : (s || '');
    const kl = (json.metadata?.tome?.lang || json.metadata?.kernelspec?.language || json.metadata?.language_info?.name || 'python').toLowerCase();
    const lang = LANGS[kl] ? kl : 'python';
    return {
      id: newId(), lang, updated: Date.now(),
      title: json.metadata?.tome?.title || fallbackTitle || 'Carnet importé',
      cells: (json.cells || []).filter(c => c.cell_type === 'code' || c.cell_type === 'markdown')
        .map(c => ({ type: c.cell_type, lang: c.metadata?.tome?.lang || lang, source: join(c.source) }))
    };
  }
  const nbFileName = () => safeName(titleEl.value || 'carnet') + '.ipynb';

  /* ---------------- Dialogue : Carnets ---------------- */
  function renderNotebookList() {
    const box = $('#nb-list');
    const list = Object.values(state.notebooks).sort((a, b) => (b.updated || 0) - (a.updated || 0));
    box.innerHTML = '';
    list.forEach(n => {
      const row = document.createElement('div');
      row.className = 'nb-item' + (n.id === nb?.id ? ' current' : '');
      row.innerHTML = `<span class="chip">${LANGS[n.lang]?.label || 'Python'}</span><div class="grow"><div class="t"></div><div class="s"></div></div>
        <button data-a="open">Ouvrir</button><button data-a="del" title="Supprimer">${icon('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>')}</button>`;
      row.querySelector('.t').textContent = n.title || 'Carnet sans titre';
      row.querySelector('.s').textContent = (n.cells || []).length + ' cellules · ' + new Date(n.updated || Date.now()).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      row.querySelector('[data-a=open]').addEventListener('click', () => { openNotebook(n); $('#dlg-nb').close(); });
      row.querySelector('[data-a=del]').addEventListener('click', () => {
        if (!confirm('Supprimer « ' + (n.title || 'ce carnet') + ' » de cet appareil ?')) return;
        delete state.notebooks[n.id];
        if (n.id === nb.id) { nb = null; openNotebook(Object.values(state.notebooks)[0] || fromTemplate('python')); }
        ls.set(STORE, state);
        renderNotebookList();
      });
      box.appendChild(row);
    });
  }

  /* ---------------- Dialogue : Fichiers ---------------- */
  function renderFiles() {
    const box = $('#file-list');
    if (!box) return;
    const list = [...Files.map.values()].sort((a, b) => a.name.localeCompare(b.name));
    $('#files-count').textContent = list.length ? '(' + list.length + ')' : '';
    if (!list.length) { box.innerHTML = '<p class="small">Aucun fichier. Importez un CSV, un Excel, une image ou une base SQLite pour commencer.</p>'; return; }
    box.innerHTML = '';
    list.forEach(f => {
      const row = document.createElement('div');
      row.className = 'nb-item';
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      row.innerHTML = `<span class="chip">${esc(ext.toUpperCase() || 'FICHIER')}</span><div class="grow"><div class="t"></div><div class="s">${fmtSize(f.size || f.data.length)}</div></div>
        ${['csv', 'tsv'].includes(ext) ? '<button data-a="sql">Vers SQL</button>' : ''}
        ${['db', 'sqlite', 'sqlite3'].includes(ext) ? '<button data-a="opendb">Ouvrir en SQL</button>' : ''}
        <button data-a="cloud" title="Sauvegarder dans mon espace Tòme">Sauvegarder</button>
        <button data-a="gh" title="Envoyer sur GitHub">GitHub</button>
        <button data-a="dl" title="Télécharger">${icon('<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>')}</button>
        <button data-a="del" title="Supprimer">${icon('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>')}</button>`;
      row.querySelector('.t').textContent = f.name;
      row.querySelector('[data-a=dl]').addEventListener('click', () => saveAs(f.name, f.data));
      row.querySelector('[data-a=del]').addEventListener('click', () => { if (confirm('Supprimer ' + f.name + ' ?')) Files.remove(f.name); });
      row.querySelector('[data-a=gh]').addEventListener('click', () => { $('#dlg-files').close(); openGitHub({ file: f.name }); });
      row.querySelector('[data-a=cloud]').addEventListener('click', async e => {
        if (!Cloud.ok()) return;
        const b = e.currentTarget; b.disabled = true; b.textContent = 'Envoi…';
        try { await TomeEspace.enregistrerFichier(f.name, f.data); toast(f.name + ' sauvegardé dans votre espace.'); renderCloudFiles(); }
        catch (er) { toast(er.message, true); }
        finally { b.disabled = false; b.textContent = 'Sauvegarder'; }
      });
      row.querySelector('[data-a=sql]')?.addEventListener('click', async () => {
        try { const r = await SQL.importCSV(f.name); toast('Table « ' + r.table + ' » créée (' + r.rows + ' lignes).'); }
        catch (e) { toast('Import SQL impossible : ' + e.message, true); }
      });
      row.querySelector('[data-a=opendb]')?.addEventListener('click', async () => {
        try { await SQL.openDb(f.name); toast('Base ouverte dans les cellules SQL.'); }
        catch (e) { toast('Ouverture impossible : ' + e.message, true); }
      });
      box.appendChild(row);
    });
  }
  async function addUploads(fileList) {
    for (const f of fileList) {
      if (f.size > 200 * 1024 * 1024) { toast(f.name + ' dépasse 200 Mo.', true); continue; }
      await Files.put(f.name, new Uint8Array(await f.arrayBuffer()));
    }
    toast(fileList.length > 1 ? fileList.length + ' fichiers importés.' : 'Fichier importé.');
  }

  /* ---------------- Espace Tòme (serveur) ---------------- */
  const Cloud = {
    ok() {
      if (window.TomeEspace && TomeEspace.disponible()) return true;
      toast('Connectez-vous à votre compte Tòme pour sauvegarder dans votre espace.', true);
      return false;
    },
    async list() { return TomeEspace.liste(); }
  };
  async function saveNotebookToCloud(silent) {
    if (!(window.TomeEspace && TomeEspace.disponible())) { if (!silent) Cloud.ok(); return; }
    persist();
    const name = nb.serveur || (safeName(titleEl.value || 'carnet').slice(0, 70) + '.ipynb');
    const btn = $('#save-cloud');
    btn.disabled = true;
    try {
      const r = await TomeEspace.enregistrerCarnet(name, JSON.stringify(toIpynb()));
      nb.serveur = r.nom; nb.cloudDirty = false; nb.cloudSaved = Date.now();
      state.notebooks[nb.id] = nb; ls.set(STORE, state);
      if (!silent) toast('Carnet enregistré dans votre espace Tòme.');
    } catch (e) { if (!silent) toast(e.message, true); }
    finally { btn.disabled = false; }
  }
  setInterval(() => { if (nb && nb.serveur && nb.cloudDirty) saveNotebookToCloud(true); }, 3 * 60 * 1000);

  function cloudRow(item, buttons) {
    const row = document.createElement('div');
    row.className = 'nb-item';
    row.innerHTML = '<div class="grow"><div class="t"></div><div class="s"></div></div>';
    row.querySelector('.t').textContent = item.nom;
    row.querySelector('.s').textContent = fmtSize(item.taille) + ' · ' + new Date(item.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    buttons.forEach(([label, fn]) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', async () => { b.disabled = true; try { await fn(); } catch (e) { toast(e.message, true); } b.disabled = false; });
      row.appendChild(b);
    });
    return row;
  }
  async function renderCloud(kind) {
    const box = $(kind === 'carnets' ? '#cloud-nb-list' : '#cloud-file-list');
    const quota = $(kind === 'carnets' ? '#cloud-nb-quota' : '#cloud-file-quota');
    if (!box) return;
    if (!(window.TomeEspace && TomeEspace.disponible())) { box.innerHTML = '<p class="small">Connectez-vous pour retrouver vos ' + kind + ' sur tous vos appareils.</p>'; quota.textContent = ''; return; }
    box.innerHTML = '<p class="small">Chargement…</p>';
    try {
      const data = await Cloud.list();
      const items = data[kind];
      quota.textContent = `(${items.length} / ${data.limites[kind]}, ${fmtSize(data.limites.taille)} max. par ${kind === 'carnets' ? 'carnet' : 'fichier'})`;
      box.innerHTML = items.length ? '' : '<p class="small">Rien pour l’instant.</p>';
      items.forEach(it => {
        const del = ['Supprimer', async () => { if (!confirm('Supprimer ' + it.nom + ' de votre espace ?')) return; await TomeEspace.supprimer(kind, it.nom); renderCloud(kind); }];
        if (kind === 'carnets') {
          box.appendChild(cloudRow(it, [['Ouvrir', async () => {
            const n = fromIpynb(JSON.parse(dec.decode(await TomeEspace.lire('carnets', it.nom))), it.nom.replace(/\.ipynb$/i, ''));
            n.serveur = it.nom; n.cloudDirty = false;
            const existing = Object.values(state.notebooks).find(x => x.serveur === it.nom);
            if (existing) n.id = existing.id;
            openNotebook(n); $('#dlg-nb').close(); toast('Carnet ouvert depuis votre espace.');
          }], del]));
        } else {
          box.appendChild(cloudRow(it, [
            ['Ajouter aux fichiers', async () => { await Files.put(it.nom, await TomeEspace.lire('fichiers', it.nom)); toast(it.nom + ' ajouté à vos fichiers.'); }],
            ['Télécharger', async () => saveAs(it.nom, await TomeEspace.lire('fichiers', it.nom))],
            del]));
        }
      });
    } catch (e) { box.innerHTML = '<p class="small"></p>'; box.firstChild.textContent = e.message; }
  }
  const renderCloudFiles = () => renderCloud('fichiers');

  /* ---------------- Dialogue : Bibliothèques ---------------- */
  async function installFrom(lang) {
    const input = $('#lib-input-' + lang);
    const status = $('#lib-status-' + lang);
    const pkgs = input.value.split(/[\s,]+/).filter(Boolean);
    if (!pkgs.length) return;
    status.textContent = 'Installation en cours…';
    try {
      const res = await (lang === 'python' ? Py : R).install(pkgs);
      status.textContent = (res.ok.length ? 'Installé : ' + res.ok.join(', ') + '. ' : '') + (res.bad.length ? 'Échec : ' + res.bad.join(' ; ') : '');
      input.value = '';
    } catch (e) { status.textContent = 'Erreur : ' + e.message; }
  }

  /* ---------------- GitHub ---------------- */
  const GH = {
    token() { return ls.get('tome_gh_token', ''); },
    async api(path, opts = {}) {
      const headers = { Accept: 'application/vnd.github+json', ...(opts.headers || {}) };
      const t = this.token();
      if (t) headers.Authorization = 'Bearer ' + t;
      const res = await fetch('https://api.github.com' + path, { ...opts, headers });
      if (!res.ok) {
        let msg = res.status + '';
        try { msg = (await res.json()).message || msg; } catch (e) {}
        const err = new Error(res.status === 404 ? 'Introuvable (ou accès refusé) : ' + msg : res.status === 401 ? 'Jeton invalide ou expiré.' : msg);
        err.status = res.status; throw err;
      }
      return opts.raw ? new Uint8Array(await res.arrayBuffer()) : res.status === 204 ? null : res.json();
    },
    repo() { return ($('#gh-repo').value || '').trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, ''); },
    branch() { return ($('#gh-branch').value || '').trim(); },
    path: '',
    enc(p) { return p.split('/').map(encodeURIComponent).join('/'); },
    async putFile(path, bytes, message) {
      const repo = this.repo(), branch = this.branch();
      let sha;
      try { sha = (await this.api(`/repos/${repo}/contents/${this.enc(path)}` + (branch ? '?ref=' + encodeURIComponent(branch) : ''))).sha; }
      catch (e) { if (e.status !== 404) throw e; }
      const body = { message, content: b64(bytes) };
      if (sha) body.sha = sha;
      if (branch) body.branch = branch;
      return this.api(`/repos/${repo}/contents/${this.enc(path)}`, { method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
    }
  };
  async function ghRefreshUser() {
    const box = $('#gh-user');
    if (!GH.token()) { box.innerHTML = '<span class="chip">Non connecté</span> <span class="small">Les dépôts publics restent accessibles en lecture.</span>'; $('#gh-logout').hidden = true; return; }
    try {
      const u = await GH.api('/user');
      box.innerHTML = '<span class="chip ok">Connecté</span> <strong></strong>';
      box.querySelector('strong').textContent = u.login;
      $('#gh-logout').hidden = false;
    } catch (e) { box.innerHTML = '<span class="chip accent"></span>'; box.querySelector('.chip').textContent = e.message; $('#gh-logout').hidden = false; }
  }
  async function ghBrowse(path = GH.path) {
    const repo = GH.repo();
    const box = $('#gh-tree');
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) { box.innerHTML = '<p class="small">Indiquez un dépôt sous la forme propriétaire/nom.</p>'; return; }
    ls.set('tome_gh_repo', { repo, branch: GH.branch() });
    box.innerHTML = '<p class="small">Chargement…</p>';
    try {
      const b = GH.branch();
      const items = await GH.api(`/repos/${repo}/contents/${GH.enc(path)}` + (b ? '?ref=' + encodeURIComponent(b) : ''));
      GH.path = path;
      $('#gh-path').textContent = '/' + path;
      box.innerHTML = '';
      const list = (Array.isArray(items) ? items : [items]).sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
      if (path) list.unshift({ name: '..', type: 'up' });
      list.forEach(it => {
        const row = document.createElement('div');
        row.className = 'nb-item';
        const isNb = /\.ipynb$/i.test(it.name);
        row.innerHTML = `<span class="chip">${it.type === 'dir' || it.type === 'up' ? 'Dossier' : isNb ? 'Carnet' : 'Fichier'}</span><div class="grow"><div class="t"></div>${it.size ? `<div class="s">${fmtSize(it.size)}</div>` : ''}</div>
          ${it.type === 'file' && isNb ? '<button data-a="open">Ouvrir le carnet</button>' : ''}
          ${it.type === 'file' ? '<button data-a="add">Ajouter aux fichiers</button>' : ''}`;
        row.querySelector('.t').textContent = it.name;
        if (it.type === 'dir' || it.type === 'up') {
          row.style.cursor = 'pointer';
          row.addEventListener('click', () => ghBrowse(it.type === 'up' ? path.split('/').slice(0, -1).join('/') : it.path));
        }
        const fetchRaw = () => GH.api(`/repos/${repo}/contents/${GH.enc(it.path)}` + (b ? '?ref=' + encodeURIComponent(b) : ''), { raw: true, headers: { Accept: 'application/vnd.github.raw' } });
        row.querySelector('[data-a=open]')?.addEventListener('click', async () => {
          try {
            const n = fromIpynb(JSON.parse(dec.decode(await fetchRaw())), it.name.replace(/\.ipynb$/i, ''));
            n.github = { repo, branch: b, path: it.path };
            openNotebook(n); $('#dlg-gh').close(); toast('Carnet ouvert depuis GitHub.');
          } catch (e) { toast(e.message, true); }
        });
        row.querySelector('[data-a=add]')?.addEventListener('click', async () => {
          try { await Files.put(it.name, await fetchRaw()); toast(it.name + ' ajouté à vos fichiers.'); }
          catch (e) { toast(e.message, true); }
        });
        box.appendChild(row);
      });
      if (!list.length) box.innerHTML = '<p class="small">Dossier vide.</p>';
    } catch (e) { box.innerHTML = '<p class="small"></p>'; box.firstChild.textContent = e.message; }
  }
  function openGitHub(opts = {}) {
    const saved = ls.get('tome_gh_repo', {});
    if (nb.github) { $('#gh-repo').value = nb.github.repo; $('#gh-branch').value = nb.github.branch || ''; }
    else if (saved.repo && !$('#gh-repo').value) { $('#gh-repo').value = saved.repo; $('#gh-branch').value = saved.branch || ''; }
    $('#gh-save-path').value = opts.file ? 'donnees/' + opts.file : (nb.github?.path || 'carnets/' + nbFileName());
    $('#gh-save-what').value = opts.file ? 'file:' + opts.file : 'notebook';
    $('#gh-msg').value = opts.file ? 'Ajout de ' + opts.file + ' depuis Tòme' : 'Mise à jour du carnet « ' + titleEl.value + ' » depuis Tòme';
    ghRefreshUser();
    $('#dlg-gh').showModal();
    if ($('#gh-repo').value) ghBrowse('');
  }

  /* ---------------- Câblage de l'interface ---------------- */
  function wire() {
    $('#run-all').addEventListener('click', () => cells.forEach(c => runCell(c)));
    $('#add-code').addEventListener('click', () => insertCell('code'));
    $('#add-md').addEventListener('click', () => insertCell('markdown'));
    $$('[data-add]').forEach(b => b.addEventListener('click', () => {
      const c = makeCell(b.dataset.add, '', cells.length, nb.lang); select(c); c.cm.focus(); persist();
    }));
    $('#nb-lang').addEventListener('change', e => {
      const prev = nb.lang; nb.lang = e.target.value;
      cells.forEach(c => { if (c.type === 'code' && c.lang === prev && !c.cm.getValue().trim()) { c.lang = nb.lang; c.el.querySelector('.lang-pick').value = nb.lang; c.cm.setOption('mode', LANGS[nb.lang].mode); } });
      Kernels[nb.lang].ensure().catch(() => {});
      persist();
    });
    $('#restart').addEventListener('click', async () => {
      if (!confirm('Redémarrer tous les langages ? Les variables seront effacées (vos fichiers sont conservés).')) return;
      for (const k of Object.values(Kernels)) await k.restart();
      cells.forEach(c => { if (c.type === 'code') { c.countEl.textContent = '[ ]'; c.count = null; } });
      execCount = 0;
      Kernels[nb.lang].ensure().catch(() => {});
    });
    $('#clear-out').addEventListener('click', () => cells.forEach(c => { if (c.type === 'code') { c.outEl.innerHTML = ''; c.outputs = []; c.countEl.textContent = '[ ]'; c.count = null; } }));
    titleEl.addEventListener('input', saveSoon);

    $$('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
    $$('dialog.dlg').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));

    $('#open-nb').addEventListener('click', () => { persist(); renderNotebookList(); renderCloud('carnets'); $('#dlg-nb').showModal(); });
    $('#save-cloud').addEventListener('click', () => saveNotebookToCloud(false));
    $$('.templates [data-tpl]').forEach(b => b.addEventListener('click', () => { openNotebook(fromTemplate(b.dataset.tpl)); $('#dlg-nb').close(); }));
    $('#export').addEventListener('click', () => saveAs(nbFileName(), JSON.stringify(toIpynb(), null, 1), 'application/x-ipynb+json'));
    const ipynbIn = $('#ipynb-file');
    $('#import').addEventListener('click', () => ipynbIn.click());
    ipynbIn.addEventListener('change', async () => {
      const f = ipynbIn.files[0]; if (!f) return;
      try { openNotebook(fromIpynb(JSON.parse(await f.text()), f.name.replace(/\.ipynb$/i, ''))); $('#dlg-nb').close(); }
      catch (e) { toast('Ce fichier n’est pas un carnet .ipynb valide.', true); }
      ipynbIn.value = '';
    });

    $('#open-files').addEventListener('click', () => { renderFiles(); renderCloudFiles(); $('#dlg-files').showModal(); });
    const up = $('#upload');
    $('#upload-btn').addEventListener('click', () => up.click());
    up.addEventListener('change', async () => { await addUploads([...up.files]); up.value = ''; });
    const dz = $('#dropzone');
    ['dragenter', 'dragover'].forEach(ev => document.addEventListener(ev, e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); dz.classList.add('over'); } }));
    ['dragleave', 'drop'].forEach(ev => document.addEventListener(ev, e => { if (ev === 'dragleave' && e.relatedTarget) return; dz.classList.remove('over'); }));
    document.addEventListener('drop', async e => {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      const fl = [...e.dataTransfer.files];
      const nbs = fl.filter(f => /\.ipynb$/i.test(f.name));
      if (nbs.length === 1 && fl.length === 1 && confirm('Ouvrir ' + nbs[0].name + ' comme carnet ? (Annuler pour l’ajouter aux fichiers)')) {
        try { openNotebook(fromIpynb(JSON.parse(await nbs[0].text()), nbs[0].name.replace(/\.ipynb$/i, ''))); } catch (er) { toast('Carnet invalide.', true); }
        return;
      }
      await addUploads(fl);
    });
    $('#sql-export').addEventListener('click', async () => {
      try { await SQL.exportDb(); toast('base.sqlite enregistrée dans vos fichiers.'); } catch (e) { toast(e.message, true); }
    });
    $('#dl-all').addEventListener('click', () => { [...Files.map.values()].forEach((f, i) => setTimeout(() => saveAs(f.name, f.data), i * 350)); });

    $('#open-libs').addEventListener('click', () => $('#dlg-libs').showModal());
    $$('[data-libtab]').forEach(b => b.addEventListener('click', () => {
      $$('[data-libtab]').forEach(x => x.classList.toggle('on', x === b));
      $$('[data-libpane]').forEach(p => { p.hidden = p.dataset.libpane !== b.dataset.libtab; });
    }));
    $('#lib-install-python').addEventListener('click', () => installFrom('python'));
    $('#lib-install-r').addEventListener('click', () => installFrom('r'));
    $$('.libs [data-try]').forEach(c => c.addEventListener('click', () => {
      const lang = c.closest('[data-libpane]').dataset.libpane;
      const input = $('#lib-input-' + lang);
      input.value = (input.value + ' ' + c.dataset.try).trim();
    }));

    $('#open-gh').addEventListener('click', () => openGitHub());
    $('#gh-connect').addEventListener('click', () => {
      const t = $('#gh-token').value.trim();
      if (!t) return;
      ls.set('tome_gh_token', t); $('#gh-token').value = '';
      ghRefreshUser();
    });
    $('#gh-logout').addEventListener('click', () => { ls.del('tome_gh_token'); ghRefreshUser(); });
    $('#gh-browse').addEventListener('click', () => ghBrowse(''));
    $('#gh-save').addEventListener('click', async () => {
      const status = $('#gh-status');
      if (!GH.token()) { status.textContent = 'Connectez-vous avec un jeton pour enregistrer sur GitHub.'; return; }
      const path = $('#gh-save-path').value.trim().replace(/^\/+/, '');
      if (!path) { status.textContent = 'Indiquez un chemin.'; return; }
      const what = $('#gh-save-what').value;
      let bytes;
      if (what === 'notebook') bytes = enc.encode(JSON.stringify(toIpynb(), null, 1));
      else { const f = Files.map.get(what.slice(5)); if (!f) { status.textContent = 'Fichier introuvable.'; return; } bytes = f.data; }
      status.textContent = 'Envoi…';
      try {
        const r = await GH.putFile(path, bytes, $('#gh-msg').value || 'Mise à jour depuis Tòme');
        if (what === 'notebook') { nb.github = { repo: GH.repo(), branch: GH.branch(), path }; persist(); }
        status.innerHTML = 'Enregistré. <a target="_blank" rel="noopener" style="color:var(--accent);font-weight:600;">Voir sur GitHub</a>';
        status.querySelector('a').href = r.content.html_url;
        ghBrowse(GH.path);
      } catch (e) { status.textContent = 'Échec : ' + e.message; }
    });
  }

  function fillSaveOptions() {
    const sel = $('#gh-save-what');
    const cur = sel.value;
    sel.innerHTML = '<option value="notebook">Ce carnet (.ipynb)</option>' + [...Files.map.keys()].map(n => `<option value="file:${esc(n)}">Fichier : ${esc(n)}</option>`).join('');
    if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
  }

  /* ---------------- Démarrage ---------------- */
  document.addEventListener('DOMContentLoaded', async () => {
    if (!window.CodeMirror || !window.marked) {
      nbEl.innerHTML = '<div class="output"><pre class="err">L’éditeur n’a pas pu se charger. Vérifiez la connexion puis rechargez la page.</pre></div>';
      return;
    }
    $('#nb-lang').innerHTML = langOptions('python');
    await Files.open();
    const _render = renderFiles;
    renderFiles = function () { _render(); fillSaveOptions(); };
    wire();
    renderFiles();

    // Ancien carnet de l'Atelier Python : récupération automatique
    const old = ls.get('tome_carnet_v1');
    if (old && old.cells && !Object.keys(state.notebooks).length) {
      const n = { id: newId(), title: old.title, lang: 'python', updated: Date.now(), cells: old.cells.map(c => ({ type: c.type, lang: 'python', source: c.source })) };
      state.notebooks[n.id] = n; state.current = n.id; ls.set(STORE, state);
    }
    const q = new URLSearchParams(location.search);
    const want = q.get('carnet'), fresh = q.get('nouveau');
    if (fresh && LANGS[fresh]) openNotebook(fromTemplate(fresh));
    else openNotebook(state.notebooks[want] || state.notebooks[state.current] || fromTemplate('python'));
    window.addEventListener('beforeunload', persist);
  });
})();
