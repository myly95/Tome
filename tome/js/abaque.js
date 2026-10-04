/* Tòme : Abaque (tableur) et Mesure (statistiques). Interface. */
(() => {
  'use strict';
  const A = window.AbaqueMoteur, S = window.Mesure, Gr = window.MesureGraphiques;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const STORE = 'tome_abaque_v1';
  const COLW = 104, ROWH = 28;

  let wb = new A.Classeur();
  let nom = 'Classeur sans titre';
  let si = 0;                                  // feuille active
  let sel = { r: 1, c: 1, r2: 1, c2: 1 };      // sélection (r,c = cellule active)
  let editing = null;                          // { r, c, input, viaBar }
  let session = [];                            // résultats Mesure
  let undoStack = [], redoStack = [];
  let clip = null;                             // presse-papiers interne { cells: [[raw]], r, c }
  let espaceNom = null;

  const grid = $('#grid'), gridWrap = $('#grid-wrap'), bar = $('#fx'), nameBox = $('#namebox');
  const sessionEl = $('#session-body');

  /* ---------------- Utilitaires ---------------- */
  const ref = (r, c) => A.numToCol(c) + r;
  const norm = () => ({ r1: Math.min(sel.r, sel.r2), r2: Math.max(sel.r, sel.r2), c1: Math.min(sel.c, sel.c2), c2: Math.max(sel.c, sel.c2) });
  const F = () => wb.feuilles[si];
  const toast = (msg, isErr) => {
    let t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3200);
  };
  const saveAs = (name, data, type) => {
    const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const safe = n => (n || 'classeur').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'classeur';

  /* ---------------- Rendu de la grille ---------------- */
  /* largeur explicite : sinon le navigateur écrase les colonnes pour faire tenir le tableau dans l'écran */
  function tableWidth() { const f = F(); let w = 46; for (let c = 1; c <= f.cols; c++) w += f.widths[c] || COLW; grid.style.width = w + 'px'; }
  function buildGrid() {
    const f = F();
    let h = '<thead><tr><th class="corner"></th>';
    for (let c = 1; c <= f.cols; c++) h += `<th class="ch" data-c="${c}" style="width:${f.widths[c] || COLW}px">${A.numToCol(c)}<span class="rs" data-rs="${c}"></span></th>`;
    h += '</tr></thead><tbody>';
    tableWidth();
    for (let r = 1; r <= f.rows; r++) {
      h += `<tr><th class="rh" data-r="${r}">${r}</th>`;
      for (let c = 1; c <= f.cols; c++) h += `<td data-r="${r}" data-c="${c}"></td>`;
      h += '</tr>';
    }
    grid.innerHTML = h + '</tbody>';
    renderAll();
  }
  const td = (r, c) => grid.querySelector(`td[data-r="${r}"][data-c="${c}"]`);
  function renderCell(r, c) {
    const el = td(r, c);
    if (!el) return;
    const v = wb.valeur(si, r, c), fmt = wb.format(si, r, c);
    el.textContent = A.afficher(v, fmt);
    el.className = (typeof v === 'number' ? 'n' : A.isErr(v) ? 'e' : typeof v === 'boolean' ? 'bo' : '') + (fmt.b ? ' b' : '') + (fmt.i ? ' i' : '') + (fmt.al ? ' al-' + fmt.al : '');
    el.style.background = fmt.bg || '';
    if (A.isErr(v)) el.title = wb.erreurSyntaxe(si, r, c) || errHelp(v.code); else el.removeAttribute('title');
  }
  function errHelp(code) {
    return { '#DIV/0!': 'Division par zéro', '#NOM?': 'Fonction ou nom inconnu', '#VALEUR!': 'Type de valeur incorrect (texte au lieu d’un nombre ?)', '#REF!': 'Référence invalide', '#N/A': 'Valeur non disponible (introuvable)', '#NOMBRE!': 'Résultat numérique impossible', '#CIRC!': 'Référence circulaire : la formule dépend d’elle-même' }[code] || '';
  }
  function renderAll() {
    const f = F();
    for (let r = 1; r <= f.rows; r++) for (let c = 1; c <= f.cols; c++) renderCell(r, c);
    renderSel(); renderTabs();
  }
  function renderSel() {
    $$('td.sel, td.act', grid).forEach(el => el.classList.remove('sel', 'act'));
    $$('th.hl', grid).forEach(el => el.classList.remove('hl'));
    const { r1, r2, c1, c2 } = norm();
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) td(r, c)?.classList.add('sel');
    td(sel.r, sel.c)?.classList.add('act');
    for (let c = c1; c <= c2; c++) grid.querySelector(`th.ch[data-c="${c}"]`)?.classList.add('hl');
    for (let r = r1; r <= r2; r++) grid.querySelector(`th.rh[data-r="${r}"]`)?.classList.add('hl');
    nameBox.value = r1 === r2 && c1 === c2 ? ref(sel.r, sel.c) : ref(r1, c1) + ':' + ref(r2, c2);
    if (!editing || !editing.viaBar) bar.value = wb.brut(si, sel.r, sel.c);
    placeHandle();
    status();
    const fmt = wb.format(si, sel.r, sel.c);
    $('#fmt-b').classList.toggle('on', !!fmt.b);
    $('#fmt-i').classList.toggle('on', !!fmt.i);
    $('#fmt-pct').classList.toggle('on', !!fmt.pct);
  }
  function placeHandle() {
    const { r2, c2 } = norm(), el = td(r2, c2), h = $('#fill-handle');
    if (!el) { h.hidden = true; return; }
    h.hidden = false;
    h.style.left = (el.offsetLeft + el.offsetWidth - 4) + 'px';
    h.style.top = (el.offsetTop + el.offsetHeight - 4) + 'px';
  }
  function status() {
    const { r1, r2, c1, c2 } = norm();
    if (r1 === r2 && c1 === c2) { $('#status').textContent = ''; return; }
    const nums = []; let cnt = 0;
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) { const v = wb.valeur(si, r, c); if (v !== null && v !== '') cnt++; if (typeof v === 'number') nums.push(v); }
    const s = nums.reduce((a, b) => a + b, 0);
    $('#status').textContent = nums.length ? `Moyenne : ${A.afficher(s / nums.length)}   Nb : ${cnt}   Somme : ${A.afficher(s)}` : `Nb : ${cnt}`;
  }
  function scrollIntoView(r, c) {
    const el = td(r, c); if (!el) return;
    const wr = gridWrap.getBoundingClientRect(), er = el.getBoundingClientRect();
    if (er.bottom > wr.bottom) gridWrap.scrollTop += er.bottom - wr.bottom + 4;
    if (er.top < wr.top + ROWH) gridWrap.scrollTop -= wr.top + ROWH - er.top + 4;
    if (er.right > wr.right) gridWrap.scrollLeft += er.right - wr.right + 4;
    if (er.left < wr.left + 48) gridWrap.scrollLeft -= wr.left + 48 - er.left + 4;
  }
  function refreshValues() { const f = F(); for (let r = 1; r <= f.rows; r++) for (let c = 1; c <= f.cols; c++) renderCell(r, c); status(); persistSoon(); }

  /* ---------------- Modifications avec annulation ---------------- */
  function apply(changes, label) { // changes: [{r,c,raw, fmt?}]
    const rec = [];
    let grew = false;
    changes.forEach(ch => {
      rec.push({ si, r: ch.r, c: ch.c, before: wb.brut(si, ch.r, ch.c), after: ch.raw });
      if (ch.r > F().rows || ch.c > F().cols) grew = true;
      wb.saisir(si, ch.r, ch.c, ch.raw);
    });
    if (!rec.length) return;
    undoStack.push({ label, rec }); if (undoStack.length > 200) undoStack.shift();
    redoStack = [];
    if (grew) buildGrid(); else refreshValues();
  }
  function undo(redo) {
    const st = redo ? redoStack : undoStack, other = redo ? undoStack : redoStack;
    const op = st.pop(); if (!op) return;
    op.rec.forEach(x => { if (x.si === si || true) wb.saisir(x.si, x.r, x.c, redo ? x.after : x.before); });
    other.push(op);
    refreshValues(); renderSel();
  }

  /* ---------------- Édition ---------------- */
  function startEdit(initial, keepContent) {
    const el = td(sel.r, sel.c); if (!el) return;
    cancelEdit();
    const inp = document.createElement('input');
    inp.className = 'cell-input';
    inp.value = keepContent ? wb.brut(si, sel.r, sel.c) : (initial ?? '');
    inp.style.left = el.offsetLeft + 'px'; inp.style.top = el.offsetTop + 'px';
    inp.style.minWidth = el.offsetWidth + 'px'; inp.style.height = el.offsetHeight + 'px';
    $('#grid-layer').appendChild(inp);
    editing = { r: sel.r, c: sel.c, input: inp, viaBar: false };
    inp.focus();
    inp.setSelectionRange(inp.value.length, inp.value.length);
    inp.addEventListener('input', () => { bar.value = inp.value; });
    inp.addEventListener('keydown', editKeys);
    bar.value = inp.value;
  }
  function editKeys(e) {
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(); move(e.shiftKey ? -1 : 1, 0); }
    else if (e.key === 'Tab') { e.preventDefault(); commitEdit(); move(0, e.shiftKey ? -1 : 1); }
    else if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); renderSel(); gridWrap.focus(); }
  }
  function commitEdit() {
    if (!editing) return;
    const raw = editing.viaBar ? bar.value : editing.input.value;
    const { r, c } = editing;
    cancelEdit();
    if (raw !== wb.brut(si, r, c)) apply([{ r, c, raw }], 'Saisie');
    gridWrap.focus();
  }
  function cancelEdit() {
    if (!editing) return;
    if (editing.input) editing.input.remove();
    editing = null;
  }
  const isFormulaEditing = () => editing && (editing.viaBar ? bar.value : editing.input.value).startsWith('=');

  /* ---------------- Navigation ---------------- */
  function select(r, c, extend) {
    r = Math.max(1, Math.min(F().rows, r)); c = Math.max(1, Math.min(F().cols, c));
    if (extend) { sel.r2 = r; sel.c2 = c; } else sel = { r, c, r2: r, c2: c };
    renderSel();
    scrollIntoView(extend ? r : sel.r, extend ? c : sel.c);
  }
  function move(dr, dc, extend) {
    if (extend) select(sel.r2 + dr, sel.c2 + dc, true);
    else select(sel.r + dr, sel.c + dc);
  }

  /* ---------------- Souris ---------------- */
  let dragging = null, lastPointer = 'mouse';
  grid.addEventListener('pointerdown', e => { lastPointer = e.pointerType; }, true);
  grid.addEventListener('mousedown', e => {
    const cell = e.target.closest('td'), rh = e.target.closest('th.rh'), ch = e.target.closest('th.ch');
    if (e.target.classList.contains('rs')) return startResize(e);
    if (cell) {
      const r = +cell.dataset.r, c = +cell.dataset.c;
      if (isFormulaEditing() && !(r === editing.r && c === editing.c)) { // clic = insérer la référence
        e.preventDefault();
        const inp = editing.viaBar ? bar : editing.input;
        const pos = inp.selectionStart ?? inp.value.length;
        const txt = ref(r, c);
        inp.value = inp.value.slice(0, pos) + txt + inp.value.slice(inp.selectionEnd ?? pos);
        inp.focus(); inp.setSelectionRange(pos + txt.length, pos + txt.length);
        if (!editing.viaBar) bar.value = inp.value;
        return;
      }
      if (lastPointer !== 'mouse') {
        // écran tactile : toucher une cellule déjà choisie ouvre l'édition (le double-clic n'existe pas)
        if (!editing && sel.r === r && sel.c === c && sel.r2 === r && sel.c2 === c) { e.preventDefault(); startEdit(null, true); return; }
        commitEdit(); select(r, c, false); dragging = null; return;
      }
      commitEdit();
      select(r, c, e.shiftKey);
      dragging = 'cells';
    } else if (rh) { commitEdit(); const r = +rh.dataset.r; sel = { r, c: 1, r2: r, c2: F().cols }; renderSel(); dragging = 'rows'; }
    else if (ch) { commitEdit(); const c = +ch.dataset.c; sel = { r: 1, c, r2: F().rows, c2: c }; renderSel(); dragging = 'cols'; }
    gridWrap.focus({ preventScroll: true });
  });
  grid.addEventListener('mouseover', e => {
    if (!dragging) return;
    const cell = e.target.closest('td, th');
    if (!cell) return;
    if (dragging === 'cells' && cell.dataset.c && cell.dataset.r) { sel.r2 = +cell.dataset.r; sel.c2 = +cell.dataset.c; renderSel(); }
    if (dragging === 'fill' && cell.dataset.c && cell.dataset.r) { fillTarget = { r: +cell.dataset.r, c: +cell.dataset.c }; showFillPreview(); }
  });
  document.addEventListener('mouseup', () => { if (dragging === 'fill') doFill(); dragging = null; });
  grid.addEventListener('dblclick', e => { if (e.target.closest('td')) startEdit(null, true); });

  /* Poignée de recopie */
  let fillTarget = null;
  $('#fill-handle').addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); commitEdit(); dragging = 'fill'; fillTarget = null; });
  // poignée au doigt ou au stylet
  $('#fill-handle').addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    e.preventDefault(); e.stopPropagation(); commitEdit(); dragging = 'fill-touch'; fillTarget = null;
  });
  document.addEventListener('pointermove', e => {
    if (dragging !== 'fill-touch') return;
    const td = document.elementFromPoint(e.clientX, e.clientY)?.closest('#grid td');
    if (td) { fillTarget = { r: +td.dataset.r, c: +td.dataset.c }; showFillPreview(); }
  });
  document.addEventListener('pointerup', () => { if (dragging === 'fill-touch') { doFill(); dragging = null; } });
  function showFillPreview() {
    $$('td.fillprev', grid).forEach(el => el.classList.remove('fillprev'));
    if (!fillTarget) return;
    const { r1, r2, c1, c2 } = norm();
    const down = Math.abs(fillTarget.r - r2) >= Math.abs(fillTarget.c - c2);
    const R1 = down ? Math.min(r1, fillTarget.r) : r1, R2 = down ? Math.max(r2, fillTarget.r) : r2;
    const C1 = down ? c1 : Math.min(c1, fillTarget.c), C2 = down ? c2 : Math.max(c2, fillTarget.c);
    for (let r = R1; r <= R2; r++) for (let c = C1; c <= C2; c++) td(r, c)?.classList.add('fillprev');
  }
  function doFill() {
    $$('td.fillprev', grid).forEach(el => el.classList.remove('fillprev'));
    if (!fillTarget) return;
    const { r1, r2, c1, c2 } = norm();
    const down = Math.abs(fillTarget.r - r2) >= Math.abs(fillTarget.c - c2);
    const changes = [];
    if (down && fillTarget.r > r2) {
      for (let c = c1; c <= c2; c++) fillSeries(r1, r2, c, fillTarget.r, true, changes);
      sel.r2 = fillTarget.r;
    } else if (!down && fillTarget.c > c2) {
      for (let r = r1; r <= r2; r++) fillSeries(c1, c2, r, fillTarget.c, false, changes);
      sel.c2 = fillTarget.c;
    }
    fillTarget = null;
    apply(changes, 'Recopie');
    renderSel();
  }
  function fillSeries(a, b, fixed, to, vertical, out) {
    const get = k => vertical ? wb.brut(si, k, fixed) : wb.brut(si, fixed, k);
    const src = []; for (let k = a; k <= b; k++) src.push(get(k));
    const nums = src.map(s => A.parseInput(s)).map(p => p.kind === 'number' ? p.value : null);
    const linear = src.length >= 2 && nums.every(v => v !== null);
    const step = linear ? (nums[nums.length - 1] - nums[0]) / (nums.length - 1) : 0;
    for (let k = b + 1, i = 0; k <= to; k++, i++) {
      let raw;
      if (linear) raw = String(+(nums[nums.length - 1] + step * (i + 1)).toFixed(10));
      else {
        const j = i % src.length, s = src[j], off = k - (a + j);
        raw = s.startsWith('=') ? A.decaler(s, vertical ? off : 0, vertical ? 0 : off) : s;
      }
      out.push(vertical ? { r: k, c: fixed, raw } : { r: fixed, c: k, raw });
    }
  }

  /* Redimensionnement des colonnes */
  function startResize(e) {
    e.preventDefault(); e.stopPropagation();
    const c = +e.target.dataset.rs, th = e.target.parentElement, x0 = e.clientX, w0 = th.offsetWidth;
    const mv = ev => { const w = Math.max(40, w0 + ev.clientX - x0); th.style.width = w + 'px'; F().widths[c] = w; tableWidth(); };
    const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); placeHandle(); persistSoon(); };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  }

  /* ---------------- Clavier ---------------- */
  gridWrap.addEventListener('keydown', e => {
    if (editing) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key;
    if (k === 'ArrowDown') { e.preventDefault(); ctrl ? jump(1, 0, e.shiftKey) : move(1, 0, e.shiftKey); }
    else if (k === 'ArrowUp') { e.preventDefault(); ctrl ? jump(-1, 0, e.shiftKey) : move(-1, 0, e.shiftKey); }
    else if (k === 'ArrowRight') { e.preventDefault(); ctrl ? jump(0, 1, e.shiftKey) : move(0, 1, e.shiftKey); }
    else if (k === 'ArrowLeft') { e.preventDefault(); ctrl ? jump(0, -1, e.shiftKey) : move(0, -1, e.shiftKey); }
    else if (k === 'Enter') { e.preventDefault(); move(e.shiftKey ? -1 : 1, 0); }
    else if (k === 'Tab') { e.preventDefault(); move(0, e.shiftKey ? -1 : 1); }
    else if (k === 'F2') { e.preventDefault(); startEdit(null, true); }
    else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); clearSel(); }
    else if (ctrl && k.toLowerCase() === 'z') { e.preventDefault(); undo(e.shiftKey); }
    else if (ctrl && k.toLowerCase() === 'y') { e.preventDefault(); undo(true); }
    else if (ctrl && k.toLowerCase() === 'd') { e.preventDefault(); fillDir(true); }
    else if (ctrl && k.toLowerCase() === 'r') { e.preventDefault(); fillDir(false); }
    else if (ctrl && k.toLowerCase() === 'b') { e.preventDefault(); toggleFmt('b'); }
    else if (ctrl && k.toLowerCase() === 'i') { e.preventDefault(); toggleFmt('i'); }
    else if (ctrl && k.toLowerCase() === 'a') { e.preventDefault(); sel = { r: 1, c: 1, r2: F().rows, c2: F().cols }; renderSel(); }
    else if (ctrl && k.toLowerCase() === 's') { e.preventDefault(); downloadAbk(); }
    else if (!ctrl && !e.altKey && k.length === 1) { e.preventDefault(); startEdit(k, false); }
  });
  function jump(dr, dc, extend) {
    let r = extend ? sel.r2 : sel.r, c = extend ? sel.c2 : sel.c;
    const filled = (rr, cc) => wb.brut(si, rr, cc) !== '';
    const inRange = (rr, cc) => rr >= 1 && cc >= 1 && rr <= F().rows && cc <= F().cols;
    if (inRange(r + dr, c + dc) && filled(r, c) && filled(r + dr, c + dc)) { while (inRange(r + dr, c + dc) && filled(r + dr, c + dc)) { r += dr; c += dc; } }
    else { r += dr; c += dc; while (inRange(r, c) && !filled(r, c) && inRange(r + dr, c + dc)) { r += dr; c += dc; } }
    select(r, c, extend);
  }
  function clearSel() {
    const { r1, r2, c1, c2 } = norm(), ch = [];
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) if (wb.brut(si, r, c) !== '') ch.push({ r, c, raw: '' });
    apply(ch, 'Effacer');
  }
  function fillDir(down) {
    const { r1, r2, c1, c2 } = norm(), ch = [];
    if (down) { if (r1 === r2) return; for (let c = c1; c <= c2; c++) { const s = wb.brut(si, r1, c); for (let r = r1 + 1; r <= r2; r++) ch.push({ r, c, raw: s.startsWith('=') ? A.decaler(s, r - r1, 0) : s }); } }
    else { if (c1 === c2) return; for (let r = r1; r <= r2; r++) { const s = wb.brut(si, r, c1); for (let c = c1 + 1; c <= c2; c++) ch.push({ r, c, raw: s.startsWith('=') ? A.decaler(s, 0, c - c1) : s }); } }
    apply(ch, 'Recopie');
  }

  /* Copier / coller */
  function copySel(e) {
    const { r1, r2, c1, c2 } = norm();
    const cells = [], lines = [];
    for (let r = r1; r <= r2; r++) {
      const row = [], line = [];
      for (let c = c1; c <= c2; c++) { row.push(wb.brut(si, r, c)); line.push(A.afficher(wb.valeur(si, r, c), wb.format(si, r, c))); }
      cells.push(row); lines.push(line.join('\t'));
    }
    const text = lines.join('\n');
    clip = { cells, r: r1, c: c1, text };
    e.clipboardData.setData('text/plain', text);
    e.preventDefault();
  }
  document.addEventListener('copy', e => { if (editing || document.activeElement !== gridWrap) return; copySel(e); toast('Copié.'); });
  document.addEventListener('cut', e => { if (editing || document.activeElement !== gridWrap) return; copySel(e); clearSel(); });
  document.addEventListener('paste', e => {
    if (editing || document.activeElement !== gridWrap) return;
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    const ch = [];
    if (clip && text === clip.text) {
      clip.cells.forEach((row, i) => row.forEach((raw, j) => ch.push({ r: sel.r + i, c: sel.c + j, raw: raw.startsWith('=') ? A.decaler(raw, sel.r - clip.r, sel.c - clip.c) : raw })));
    } else {
      const rows = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map(l => l.split('\t'));
      rows.forEach((row, i) => row.forEach((raw, j) => ch.push({ r: sel.r + i, c: sel.c + j, raw })));
    }
    apply(ch, 'Coller');
    sel.r2 = Math.max(...ch.map(x => x.r)); sel.c2 = Math.max(...ch.map(x => x.c)); renderSel();
  });

  /* Barre de formule */
  bar.addEventListener('focus', () => {
    if (editing && !editing.viaBar) { const v = editing.input.value; cancelEdit(); bar.value = v; }
    editing = { r: sel.r, c: sel.c, input: null, viaBar: true };
  });
  bar.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(); move(1, 0); }
    else if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); renderSel(); gridWrap.focus(); }
  });
  bar.addEventListener('blur', () => setTimeout(() => { if (editing && editing.viaBar && document.activeElement !== bar) commitEdit(); }, 150));
  nameBox.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const m = nameBox.value.trim().toUpperCase().split(':').map(A.parseRef);
    if (!m[0]) return toast('Référence invalide.', true);
    sel = { r: m[0].row, c: m[0].col, r2: (m[1] || m[0]).row, c2: (m[1] || m[0]).col };
    renderSel(); scrollIntoView(sel.r, sel.c); gridWrap.focus();
  });

  /* ---------------- Mise en forme ---------------- */
  function toggleFmt(key) {
    const { r1, r2, c1, c2 } = norm(), on = !wb.format(si, sel.r, sel.c)[key];
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) wb.setFormat(si, r, c, { [key]: on || undefined });
    refreshValues(); renderSel();
  }
  function setFmt(patch) {
    const { r1, r2, c1, c2 } = norm();
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
      const p = typeof patch === 'function' ? patch(wb.format(si, r, c), wb.valeur(si, r, c)) : patch;
      wb.setFormat(si, r, c, p);
    }
    refreshValues(); renderSel();
  }
  const decimals = v => { if (typeof v !== 'number') return 2; const s = String(v); return s.includes('.') ? Math.min(10, s.split('.')[1].length) : 0; };
  $('#fmt-b').addEventListener('click', () => toggleFmt('b'));
  $('#fmt-i').addEventListener('click', () => toggleFmt('i'));
  $('#fmt-pct').addEventListener('click', () => toggleFmt('pct'));
  $('#fmt-dec-plus').addEventListener('click', () => setFmt((f, v) => ({ dec: Math.min(10, (f.dec ?? decimals(v)) + 1) })));
  $('#fmt-dec-moins').addEventListener('click', () => setFmt((f, v) => ({ dec: Math.max(0, (f.dec ?? decimals(v)) - 1) })));
  $$('[data-align]').forEach(b => b.addEventListener('click', () => setFmt({ al: b.dataset.align === 'auto' ? undefined : b.dataset.align })));
  $('#fmt-bg').addEventListener('input', e => setFmt({ bg: e.target.value }));
  $('#fmt-clear').addEventListener('click', () => setFmt({ b: undefined, i: undefined, pct: undefined, dec: undefined, al: undefined, bg: undefined }));

  /* ---------------- Feuilles ---------------- */
  function renderTabs() {
    const box = $('#tabs');
    box.innerHTML = '';
    wb.feuilles.forEach((f, i) => {
      const b = document.createElement('button');
      b.className = 'sheet-tab' + (i === si ? ' on' : '');
      b.textContent = f.nom;
      b.title = 'Double-cliquez pour renommer';
      b.addEventListener('click', () => { if (i !== si) { commitEdit(); si = i; sel = { r: 1, c: 1, r2: 1, c2: 1 }; buildGrid(); } });
      b.addEventListener('dblclick', () => {
        const n = prompt('Nom de la feuille :', f.nom);
        if (n && n.trim()) { if (wb.feuilleIndex(n.trim()) >= 0 && wb.feuilleIndex(n.trim()) !== i) return toast('Ce nom existe déjà.', true); f.nom = n.trim(); wb.version++; renderTabs(); persistSoon(); }
      });
      box.appendChild(b);
    });
  }
  $('#add-sheet').addEventListener('click', () => { si = wb.ajouterFeuille(); sel = { r: 1, c: 1, r2: 1, c2: 1 }; buildGrid(); persistSoon(); });
  $('#del-sheet').addEventListener('click', () => {
    if (wb.feuilles.length < 2) return toast('Un classeur doit garder au moins une feuille.', true);
    if (!confirm('Supprimer la feuille « ' + F().nom + ' » ?')) return;
    wb.feuilles.splice(si, 1); wb.version++; si = Math.max(0, si - 1); undoStack = []; redoStack = []; buildGrid(); persistSoon();
  });
  $('#add-rows').addEventListener('click', () => { F().rows += 100; buildGrid(); });
  $('#add-cols').addEventListener('click', () => { F().cols += 5; buildGrid(); });

  /* Tri d'une plage par sa première colonne sélectionnée (valeurs seulement) */
  function sortSel(asc) {
    let { r1, r2, c1, c2 } = norm();
    if (r1 === r2) { r1 = 1; r2 = F().usedBounds().rows; c1 = 1; c2 = F().usedBounds().cols; }
    const header = typeof wb.valeur(si, r1, sel.c) === 'string' && wb.valeur(si, r1 + 1, sel.c) !== null && typeof wb.valeur(si, r1 + 1, sel.c) === 'number';
    if (header) r1++;
    const rows = [];
    for (let r = r1; r <= r2; r++) { const row = []; for (let c = c1; c <= c2; c++) row.push(wb.brut(si, r, c)); rows.push({ key: wb.valeur(si, r, sel.c), row }); }
    const cmp = (a, b) => { const x = a.key, y = b.key; if (x === null) return 1; if (y === null) return -1; if (typeof x === 'number' && typeof y === 'number') return x - y; return String(x).localeCompare(String(y), 'fr'); };
    rows.sort((a, b) => asc ? cmp(a, b) : -cmp(a, b));
    const ch = [];
    rows.forEach((x, i) => x.row.forEach((raw, j) => ch.push({ r: r1 + i, c: c1 + j, raw })));
    apply(ch, 'Trier');
    toast('Tri effectué' + (header ? ' (en-tête conservé).' : '.'));
  }

  /* ---------------- Fichiers ---------------- */
  const toJSON = () => ({ ...wb.toJSON(), nom, session });
  function loadJSON(o) {
    wb = A.Classeur.fromJSON(o);
    nom = o.nom || nom;
    session = Array.isArray(o.session) ? o.session : [];
    si = 0; sel = { r: 1, c: 1, r2: 1, c2: 1 }; undoStack = []; redoStack = [];
    $('#wb-title').value = nom;
    buildGrid(); renderSession(); persistSoon();
  }
  let pt;
  function persistSoon() { clearTimeout(pt); pt = setTimeout(() => { try { localStorage.setItem(STORE, JSON.stringify({ ...toJSON(), espaceNom })); } catch (e) {} }, 400); }
  $('#wb-title').addEventListener('input', e => { nom = e.target.value; persistSoon(); });

  function downloadAbk() { saveAs(safe(nom) + '.abk', JSON.stringify(toJSON()), 'application/json'); toast('Classeur enregistré (.abk).'); }
  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    const first = text.split('\n')[0];
    const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : (first.match(/\t/g) || []).length > (first.match(/,/g) || []).length ? '\t' : ',';
    const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
      else if (ch === '"') q = true;
      else if (ch === sep) { row.push(f); f = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
      else f += ch;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows;
  }
  function sheetFromRows(rows, name) {
    const i = wb.feuilles.length === 1 && !wb.feuilles[0].cells.size ? 0 : wb.ajouterFeuille(name);
    if (i === 0) wb.feuilles[0].nom = name;
    const f = wb.feuilles[i];
    f.rows = Math.max(100, rows.length + 20); f.cols = Math.max(26, Math.max(...rows.map(r => r.length)) + 2);
    rows.forEach((row, r) => row.forEach((v, c) => { if (v !== '' && v != null) wb.saisir(i, r + 1, c + 1, String(v)); }));
    return i;
  }
  async function openFile(file, bytes) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const buf = bytes || new Uint8Array(await file.arrayBuffer());
    const text = () => new TextDecoder().decode(buf);
    if (ext === 'abk') { loadJSON(JSON.parse(text())); toast('Classeur ouvert.'); return; }
    if (['csv', 'tsv', 'txt'].includes(ext)) { si = sheetFromRows(parseCSV(text()), file.name.replace(/\.[^.]+$/, '').slice(0, 30)); buildGrid(); persistSoon(); toast('Fichier importé dans la feuille « ' + F().nom + ' ».'); return; }
    if (['xlsx', 'xls', 'ods'].includes(ext)) {
      if (!window.XLSX) return toast('Le module Excel n’a pas pu se charger (connexion ?).', true);
      const x = XLSX.read(buf, { type: 'array', cellFormula: true });
      const fresh = new A.Classeur(); fresh.feuilles = [];
      x.SheetNames.forEach(sn => {
        const ws = x.Sheets[sn], f = new A.Feuille(sn);
        fresh.feuilles.push(f);
        const idx = fresh.feuilles.length - 1;
        const range = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : { e: { r: 0, c: 0 } };
        f.rows = Math.max(100, range.e.r + 21); f.cols = Math.max(26, range.e.c + 3);
        Object.keys(ws).filter(k => k[0] !== '!').forEach(k => {
          const cell = ws[k], p = XLSX.utils.decode_cell(k);
          const raw = cell.f ? '=' + cell.f : cell.t === 'b' ? (cell.v ? 'VRAI' : 'FAUX') : cell.t === 'n' ? String(cell.v) : String(cell.v ?? '');
          if (raw !== '') {
            const z = typeof cell.z === 'string' ? cell.z : '';
            const m = /^0(?:\.(0+))?(%?)$/.exec(z);
            fresh.saisir(idx, p.r + 1, p.c + 1, raw, m ? { dec: m[1] ? m[1].length : 0, pct: m[2] ? true : undefined } : undefined);
          }
        });
      });
      if (!fresh.feuilles.length) fresh.feuilles.push(new A.Feuille('Feuille1'));
      wb = fresh; nom = file.name.replace(/\.[^.]+$/, ''); $('#wb-title').value = nom; si = 0; undoStack = []; redoStack = [];
      buildGrid(); persistSoon(); toast('Classeur Excel ouvert. Vérifiez les formules : certaines fonctions avancées peuvent différer.');
      return;
    }
    toast('Format non pris en charge : .' + ext, true);
  }
  const FR_TO_EN = A.FR;
  function toExcelFormula(raw) { // noms anglais et virgules, comme Excel l'enregistre
    let out = '', i = 0, s = raw.slice(1);
    while (i < s.length) {
      if (s[i] === '"') { const j = s.indexOf('"', i + 1); const end = j < 0 ? s.length : j + 1; out += s.slice(i, end); i = end; continue; }
      const m = /^[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_.]*(?=\()/.exec(s.slice(i));
      if (m) { const up = m[0].toUpperCase(); out += FR_TO_EN[up] || up; i += m[0].length; continue; }
      out += s[i] === ';' ? ',' : s[i]; i++;
    }
    return out;
  }
  function toXlsx() {
    const x = XLSX.utils.book_new();
    wb.feuilles.forEach((f, k) => {
      const ws = {}; let maxR = 0, maxC = 0;
      for (const [key, cell] of f.cells) {
        const [r, c] = key.split(':').map(Number);
        if (cell.raw === '') continue;
        const v = wb.valeur(k, r, c), addr = XLSX.utils.encode_cell({ r: r - 1, c: c - 1 });
        const o = {};
        if (cell.raw.startsWith('=')) o.f = toExcelFormula(cell.raw);
        if (typeof v === 'number') { o.t = 'n'; o.v = v; } else if (typeof v === 'boolean') { o.t = 'b'; o.v = v; } else if (A.isErr(v)) { o.t = 'e'; o.v = 0x0F; } else { o.t = 's'; o.v = v ?? ''; }
        if (cell.fmt?.pct) o.z = '0' + (cell.fmt.dec ? '.' + '0'.repeat(cell.fmt.dec) : '') + '%';
        else if (cell.fmt?.dec !== undefined && typeof v === 'number') o.z = '0' + (cell.fmt.dec ? '.' + '0'.repeat(cell.fmt.dec) : '');
        ws[addr] = o; maxR = Math.max(maxR, r); maxC = Math.max(maxC, c);
      }
      ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, maxR - 1), c: Math.max(0, maxC - 1) } });
      XLSX.utils.book_append_sheet(x, ws, f.nom.slice(0, 31));
    });
    return x;
  }
  function exportCsv() {
    const f = F(), b = f.usedBounds(), lines = [];
    for (let r = 1; r <= b.rows; r++) {
      const row = [];
      for (let c = 1; c <= b.cols; c++) {
        const v = wb.valeur(si, r, c);
        let s = v === null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : A.afficher(v);
        if (/[;"\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
        row.push(s);
      }
      lines.push(row.join(';'));
    }
    saveAs(safe(nom) + ' - ' + safe(f.nom) + '.csv', '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  }

  /* Espace Tòme */
  async function saveToEspace() {
    if (!(window.TomeEspace && TomeEspace.disponible())) return toast('Connectez-vous pour sauvegarder dans votre espace Tòme.', true);
    const name = espaceNom || safe(nom) + '.abk';
    try {
      const r = await TomeEspace.enregistrerFichier(name, new TextEncoder().encode(JSON.stringify(toJSON())));
      espaceNom = r.nom; persistSoon(); toast('Classeur sauvegardé dans votre espace (' + r.nom + ').');
    } catch (e) { toast(e.message, true); }
  }
  async function openFromEspace() {
    const box = $('#espace-list');
    if (!(window.TomeEspace && TomeEspace.disponible())) { box.innerHTML = '<p class="small">Connectez-vous pour retrouver vos classeurs sur tous vos appareils.</p>'; $('#dlg-espace').showModal(); return; }
    box.innerHTML = '<p class="small">Chargement…</p>'; $('#dlg-espace').showModal();
    try {
      const d = await TomeEspace.liste();
      const items = d.fichiers.filter(f => /\.(abk|csv|xlsx|xls|ods|tsv)$/i.test(f.nom));
      box.innerHTML = items.length ? '' : '<p class="small">Aucun classeur dans votre espace.</p>';
      items.forEach(it => {
        const row = document.createElement('div'); row.className = 'nb-item';
        row.innerHTML = '<div class="grow"><div class="t"></div><div class="s"></div></div><button>Ouvrir</button>';
        row.querySelector('.t').textContent = it.nom;
        row.querySelector('.s').textContent = new Date(it.date).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        row.querySelector('button').addEventListener('click', async () => {
          try { await openFile({ name: it.nom }, await TomeEspace.lire('fichiers', it.nom)); if (/\.abk$/i.test(it.nom)) espaceNom = it.nom; $('#dlg-espace').close(); }
          catch (e) { toast(e.message, true); }
        });
        box.appendChild(row);
      });
    } catch (e) { box.innerHTML = ''; toast(e.message, true); }
  }

  /* ---------------- Colonnes pour Mesure ---------------- */
  function colonnes() {
    const f = F(), b = f.usedBounds(), out = [];
    for (let c = 1; c <= b.cols; c++) {
      const h = wb.valeur(si, 1, c);
      let filled = 0; for (let r = 1; r <= b.rows; r++) if (wb.valeur(si, r, c) !== null) filled++;
      if (!filled) continue;
      const hasHeader = typeof h === 'string' && h.trim() !== '';
      out.push({ c, nom: hasHeader ? h : 'Colonne ' + A.numToCol(c), label: A.numToCol(c) + (hasHeader ? ' · ' + h : ''), start: hasHeader ? 2 : 1, end: b.rows });
    }
    return out;
  }
  function donnees(col, { texte = false } = {}) {
    const vals = [], raw = [];
    let manquants = 0;
    for (let r = col.start; r <= col.end; r++) {
      const v = wb.valeur(si, r, col.c);
      raw.push(v);
      if (texte) { if (v !== null && v !== '') vals.push(typeof v === 'number' ? A.afficher(v) : String(v)); }
      else if (typeof v === 'number') vals.push(v);
      else if (v === null || v === '') manquants++;
      else manquants++;
    }
    while (raw.length && raw[raw.length - 1] === null) raw.pop();
    return { nom: col.nom, values: vals, manquants, brut: raw };
  }
  /* valeurs alignées par ligne (pour les paires et la régression) */
  const aligned = col => donnees(col).brut.map(v => typeof v === 'number' ? v : null);

  /* ---------------- Boîtes de dialogue d'analyse ---------------- */
  const ALT = [['diff', 'Différent de (≠)'], ['inf', 'Inférieur à (<)'], ['sup', 'Supérieur à (>)']];
  const ANALYSES = {
    descriptives: { titre: 'Statistiques descriptives', champs: [{ id: 'cols', type: 'cols', label: 'Variables' }], run: v => S.descriptives(v.cols.map(c => donnees(c))) },
    frequences: { titre: 'Tableau de fréquences', champs: [{ id: 'col', type: 'col', label: 'Variable' }], run: v => S.frequences(donnees(v.col, { texte: true })) },
    correlation: { titre: 'Corrélation', champs: [{ id: 'cols', type: 'cols', label: 'Variables (au moins 2)' }], run: v => S.correlation(v.cols.map(c => ({ nom: c.nom, values: aligned(c) }))) },
    normalite: { titre: 'Test de normalité', champs: [{ id: 'col', type: 'col', label: 'Variable' }], run: v => S.normalite(donnees(v.col)) },
    icmoy: { titre: 'Intervalle de confiance de la moyenne', champs: [{ id: 'col', type: 'col', label: 'Variable' }, { id: 'conf', type: 'num', label: 'Niveau de confiance (%)', def: 95 }], run: v => S.icMoyenne(donnees(v.col), v.conf / 100) },
    t1: { titre: 'Test t à 1 échantillon', champs: [{ id: 'col', type: 'col', label: 'Échantillon' }, { id: 'mu', type: 'num', label: 'Moyenne hypothétique (μ₀)', def: 0 }, { id: 'alt', type: 'choix', label: 'Hypothèse alternative', options: ALT }, { id: 'conf', type: 'num', label: 'Niveau de confiance (%)', def: 95 }], run: v => S.test1t(donnees(v.col), v.mu, v.alt, v.conf / 100) },
    t2: { titre: 'Test t à 2 échantillons', champs: [{ id: 'a', type: 'col', label: 'Échantillon 1' }, { id: 'b', type: 'col', label: 'Échantillon 2', second: true }, { id: 'alt', type: 'choix', label: 'Hypothèse alternative', options: ALT }, { id: 'eg', type: 'case', label: 'Supposer des variances égales' }, { id: 'conf', type: 'num', label: 'Niveau de confiance (%)', def: 95 }], run: v => S.test2t(donnees(v.a), donnees(v.b), { egales: v.eg, alt: v.alt, conf: v.conf / 100 }) },
    tp: { titre: 'Test t apparié', champs: [{ id: 'a', type: 'col', label: 'Échantillon 1 (avant)' }, { id: 'b', type: 'col', label: 'Échantillon 2 (après)', second: true }, { id: 'alt', type: 'choix', label: 'Hypothèse alternative', options: ALT }], run: v => S.testApparie({ nom: v.a.nom, values: aligned(v.a) }, { nom: v.b.nom, values: aligned(v.b) }, { alt: v.alt }) },
    f2: { titre: 'Test F de 2 variances', champs: [{ id: 'a', type: 'col', label: 'Échantillon 1' }, { id: 'b', type: 'col', label: 'Échantillon 2', second: true }], run: v => S.test2var(donnees(v.a), donnees(v.b)) },
    p1: { titre: 'Test de proportion à 1 échantillon', champs: [{ id: 'x', type: 'num', label: 'Nombre d’événements (succès)', def: 0 }, { id: 'n', type: 'num', label: 'Nombre d’essais', def: 0 }, { id: 'p0', type: 'num', label: 'Proportion hypothétique', def: 0.5 }, { id: 'alt', type: 'choix', label: 'Hypothèse alternative', options: ALT }], run: v => S.prop1(v.x, v.n, v.p0, v.alt) },
    p2: { titre: 'Test de proportion à 2 échantillons', champs: [{ id: 'x1', type: 'num', label: 'Événements (échantillon 1)', def: 0 }, { id: 'n1', type: 'num', label: 'Essais (échantillon 1)', def: 0 }, { id: 'x2', type: 'num', label: 'Événements (échantillon 2)', def: 0 }, { id: 'n2', type: 'num', label: 'Essais (échantillon 2)', def: 0 }, { id: 'alt', type: 'choix', label: 'Hypothèse alternative', options: ALT }], run: v => S.prop2(v.x1, v.n1, v.x2, v.n2, v.alt) },
    chi2: { titre: 'Khi-deux d’indépendance', champs: [{ id: 'a', type: 'col', label: 'Variable en lignes (catégories)' }, { id: 'b', type: 'col', label: 'Variable en colonnes (catégories)', second: true }], run: v => { const x = donnees(v.a, { texte: true }).brut, y = donnees(v.b, { texte: true }).brut; const L = [], C = []; for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== null && y[i] !== null) { L.push(A.afficher(x[i])); C.push(A.afficher(y[i])); } return S.khiDeux({ ligne: L, colonne: C, nomL: v.a.nom, nomC: v.b.nom }); } },
    anova: { titre: 'ANOVA à un facteur', champs: [{ id: 'mode', type: 'choix', label: 'Disposition des données', options: [['cols', 'Une colonne par groupe'], ['fact', 'Une colonne de réponses et une colonne de groupes']] }, { id: 'cols', type: 'cols', label: 'Colonnes des groupes (disposition 1)', optional: true }, { id: 'rep', type: 'col', label: 'Réponse (disposition 2)', optional: true }, { id: 'fac', type: 'col', label: 'Facteur / groupe (disposition 2)', optional: true, second: true }],
      run: v => {
        if (v.mode === 'cols') { if (!v.cols.length) throw new Error('Cochez les colonnes des groupes.'); return S.anova1(v.cols.map(c => donnees(c))); }
        const y = aligned(v.rep), g = donnees(v.fac, { texte: true }).brut, m = new Map();
        for (let i = 0; i < y.length; i++) if (y[i] !== null && g[i] !== null && g[i] !== undefined) { const k = A.afficher(g[i]); if (!m.has(k)) m.set(k, []); m.get(k).push(y[i]); }
        return S.anova1([...m.entries()].map(([nom, values]) => ({ nom, values })));
      } },
    regression: { titre: 'Régression linéaire', champs: [{ id: 'y', type: 'col', label: 'Réponse (Y)' }, { id: 'xs', type: 'cols', label: 'Prédicteurs (X)' }], run: v => S.regression({ nom: v.y.nom, values: aligned(v.y) }, v.xs.filter(c => c.c !== v.y.c).map(c => ({ nom: c.nom, values: aligned(c) }))) },
    imr: { titre: 'Carte I-MR', champs: [{ id: 'col', type: 'col', label: 'Variable (dans l’ordre de mesure)' }], run: v => S.carteIMR(donnees(v.col)) },
    xbarr: { titre: 'Carte X̄-R', champs: [{ id: 'col', type: 'col', label: 'Variable (dans l’ordre de mesure)' }, { id: 'n', type: 'num', label: 'Taille des sous-groupes (2 à 10)', def: 5 }], run: v => S.carteXbarR(donnees(v.col), Math.round(v.n)) },
    pchart: { titre: 'Carte P', champs: [{ id: 'd', type: 'col', label: 'Nombre de défectueux' }, { id: 'n', type: 'col', label: 'Taille des échantillons', second: true }], run: v => S.carteP({ nom: v.d.nom, values: aligned(v.d).filter(x => x !== null) }, { nom: v.n.nom, values: aligned(v.n).filter(x => x !== null) }) },
    capa: { titre: 'Analyse de capabilité', champs: [{ id: 'col', type: 'col', label: 'Variable' }, { id: 'lsl', type: 'num', label: 'Limite inférieure de spécification (LIS)', optional: true }, { id: 'usl', type: 'num', label: 'Limite supérieure de spécification (LSS)', optional: true }, { id: 'n', type: 'num', label: 'Taille des sous-groupes (1 = valeurs individuelles)', def: 1 }], run: v => S.capabilite(donnees(v.col), { lsl: v.lsl, usl: v.usl, taille: Math.round(v.n) }) },
    pareto: { titre: 'Diagramme de Pareto', champs: [{ id: 'col', type: 'col', label: 'Catégories (défauts)' }, { id: 'eff', type: 'col', label: 'Effectifs (facultatif : sinon on compte les catégories)', optional: true, second: true }], run: v => S.pareto({ nom: v.col.nom, values: donnees(v.col, { texte: true }).brut.filter(x => x !== null).map(x => A.afficher(x)) }, v.eff ? { values: aligned(v.eff) } : null) },
    g_hist: { titre: 'Histogramme', champs: [{ id: 'col', type: 'col', label: 'Variable' }, { id: 'norm', type: 'case', label: 'Ajouter la courbe de la loi normale' }], run: v => S.graphique('histogramme', [donnees(v.col)], { normale: v.norm }) },
    g_box: { titre: 'Boîtes à moustaches', champs: [{ id: 'cols', type: 'cols', label: 'Variables' }], run: v => S.graphique('boites', v.cols.map(c => donnees(c))) },
    g_nuage: { titre: 'Nuage de points', champs: [{ id: 'x', type: 'col', label: 'Variable X' }, { id: 'y', type: 'col', label: 'Variable Y', second: true }, { id: 'droite', type: 'case', label: 'Ajouter la droite de régression' }], run: v => S.graphique('nuage', [{ nom: v.x.nom, values: aligned(v.x) }, { nom: v.y.nom, values: aligned(v.y) }], { droite: v.droite }) },
    g_serie: { titre: 'Série chronologique', champs: [{ id: 'cols', type: 'cols', label: 'Variables' }], run: v => S.graphique('serie', v.cols.map(c => ({ nom: c.nom, values: aligned(c) }))) },
    g_barres: { titre: 'Diagramme en barres', champs: [{ id: 'col', type: 'col', label: 'Variable (catégories)' }], run: v => S.frequences(donnees(v.col, { texte: true })) },
    g_secteurs: { titre: 'Diagramme circulaire', champs: [{ id: 'col', type: 'col', label: 'Variable (catégories)' }], run: v => S.graphique('secteurs', [donnees(v.col, { texte: true })]) }
  };

  function openAnalysis(key) {
    commitEdit();
    const def = ANALYSES[key];
    const cols = colonnes();
    const needsCols = def.champs.some(f => (f.type === 'col' || f.type === 'cols') && !f.optional);
    if (needsCols && !cols.length) return toast('La feuille est vide : saisissez ou importez des données. Mettez le nom de chaque variable en ligne 1.', true);
    const dlg = $('#dlg-analyse');
    $('#dlg-analyse-t').textContent = def.titre;
    const form = $('#analyse-form');
    form.innerHTML = '';
    const selCol = sel.c, colOpts = (pick) => cols.map(c => `<option value="${c.c}"${c.c === pick ? ' selected' : ''}>${escapeHtml(c.label)}</option>`).join('');
    def.champs.forEach(f => {
      const wrap = document.createElement('div'); wrap.className = 'field';
      if (f.type === 'col') {
        const pick = f.second ? (cols.find(c => c.c > selCol) || cols[1] || cols[0])?.c : (cols.find(c => c.c === selCol) || cols[0])?.c;
        wrap.innerHTML = `<label>${f.label}</label><select data-id="${f.id}">${f.optional ? '<option value="">(aucune)</option>' : ''}${colOpts(f.optional ? null : pick)}</select>`;
      } else if (f.type === 'cols') {
        const { c1, c2 } = norm();
        wrap.innerHTML = `<label>${f.label}</label><div class="col-checks" data-id="${f.id}">${cols.map(c => `<label class="check"><input type="checkbox" value="${c.c}" ${c.c >= c1 && c.c <= c2 && !f.optional ? 'checked' : ''}> ${escapeHtml(c.label)}</label>`).join('')}</div>`;
      } else if (f.type === 'num') wrap.innerHTML = `<label>${f.label}</label><input type="text" inputmode="decimal" data-id="${f.id}" value="${f.def ?? ''}" ${f.optional ? 'placeholder="facultatif"' : ''}>`;
      else if (f.type === 'choix') wrap.innerHTML = `<label>${f.label}</label><select data-id="${f.id}">${f.options.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>`;
      else if (f.type === 'case') wrap.innerHTML = `<label class="check"><input type="checkbox" data-id="${f.id}"> ${f.label}</label>`;
      form.appendChild(wrap);
    });
    const help = $('#analyse-help');
    help.textContent = 'Astuce : écrivez le nom de chaque variable en ligne 1, et les données en dessous.';
    dlg.dataset.key = key;
    dlg.showModal();
  }
  const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  $('#analyse-ok').addEventListener('click', e => {
    e.preventDefault();
    const dlg = $('#dlg-analyse'), def = ANALYSES[dlg.dataset.key], cols = colonnes(), v = {};
    try {
      def.champs.forEach(f => {
        const el = $(`[data-id="${f.id}"]`, dlg);
        if (f.type === 'col') { v[f.id] = cols.find(c => String(c.c) === el.value) || null; if (!v[f.id] && !f.optional) throw new Error('Choisissez : ' + f.label); }
        else if (f.type === 'cols') { v[f.id] = $$('input:checked', el).map(i => cols.find(c => String(c.c) === i.value)); if (!v[f.id].length && !f.optional) throw new Error('Cochez au moins une variable.'); }
        else if (f.type === 'num') { const s = el.value.trim(); if (s === '') { if (!f.optional) throw new Error('Indiquez : ' + f.label); v[f.id] = null; } else { const n = A.toNumberLoose(s); if (!n) throw new Error('Nombre invalide : ' + f.label); v[f.id] = n.value; } }
        else if (f.type === 'choix') v[f.id] = el.value;
        else if (f.type === 'case') v[f.id] = el.checked;
      });
      const res = def.run(v);
      res.date = new Date().toISOString();
      res.feuille = F().nom;
      session.push(res);
      dlg.close();
      renderSession(true);
      persistSoon();
    } catch (er) { $('#analyse-help').textContent = er.message; $('#analyse-help').classList.add('err'); setTimeout(() => $('#analyse-help').classList.remove('err'), 2500); }
  });

  /* ---------------- Fenêtre de session ---------------- */
  const fmtCell = v => {
    if (v === null || v === undefined || (typeof v === 'number' && isNaN(v))) return '<span class="mute">*</span>';
    if (typeof v === 'number') { const a = Math.abs(v); return Number(v.toPrecision(a >= 1e6 ? 7 : 5)).toLocaleString('fr-FR', { maximumFractionDigits: 6 }); }
    return escapeHtml(v);
  };
  function renderBloc(b) {
    if (b.type === 'texte') return `<p>${escapeHtml(b.texte)}</p>`;
    if (b.type === 'graphique') return `<div class="graph">${Gr.dessiner(b)}<button class="tbtn dl-svg" title="Télécharger le graphique">PNG</button></div>`;
    if (b.type === 'table') return `${b.titre ? `<h4>${escapeHtml(b.titre)}</h4>` : ''}<div class="tbl-wrap"><table class="stat"><thead><tr>${b.colonnes.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead><tbody>${b.lignes.map(r => `<tr>${r.map((v, i) => `<td class="${typeof v === 'number' || i > 0 ? 'n' : ''}">${fmtCell(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${b.note ? `<p class="note">${escapeHtml(b.note)}</p>` : ''}`;
    return '';
  }
  function renderSession(scroll) {
    $('#session-count').textContent = session.length ? '(' + session.length + ')' : '';
    if (!session.length) { sessionEl.innerHTML = '<p class="session-empty">Les résultats de vos analyses apparaîtront ici. Ouvrez un menu : Statistiques, Tests, Qualité ou Graphiques.</p>'; return; }
    sessionEl.innerHTML = session.map((r, i) => `<article class="result" data-i="${i}"><header><h3>${escapeHtml(r.titre)}</h3><span>${new Date(r.date).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${escapeHtml(r.feuille || '')}</span><button class="del" title="Supprimer ce résultat">×</button></header>${r.blocs.map(renderBloc).join('')}</article>`).join('');
    $$('.result .del', sessionEl).forEach(b => b.addEventListener('click', () => { session.splice(+b.closest('.result').dataset.i, 1); renderSession(); persistSoon(); }));
    $$('.dl-svg', sessionEl).forEach(b => b.addEventListener('click', () => svgToPng(b.previousElementSibling)));
    if (scroll) { $('#session').classList.add('open'); const last = sessionEl.lastElementChild; last && last.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }
  function svgToPng(svg) {
    const src = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = 680 * 2; c.height = 380 * 2;
      const ctx = c.getContext('2d'); ctx.scale(2, 2); ctx.drawImage(img, 0, 0, 680, 380);
      c.toBlob(b => saveAs('graphique.png', b), 'image/png');
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
  }
  $('#session-toggle').addEventListener('click', () => $('#session').classList.toggle('open'));
  $('#session-close').addEventListener('click', () => $('#session').classList.remove('open'));
  $('#session-clear').addEventListener('click', () => { if (session.length && confirm('Effacer tous les résultats de la session ?')) { session = []; renderSession(); persistSoon(); } });
  $('#session-print').addEventListener('click', () => {
    const w = window.open('', '_blank');
    if (!w) return toast('Autorisez les fenêtres pour imprimer.', true);
    w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Session Mesure : ${escapeHtml(nom)}</title><link rel="stylesheet" href="css/tome.css"></head><body class="print-session"><h1>${escapeHtml(nom)}</h1>${sessionEl.innerHTML}<script>setTimeout(()=>print(),400)<\/script></body></html>`);
    w.document.close();
  });

  /* ---------------- Menus ---------------- */
  $$('.menu > button').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    const m = b.parentElement, open = m.classList.contains('open');
    $$('.menu.open').forEach(x => x.classList.remove('open'));
    if (!open) m.classList.add('open');
  }));
  document.addEventListener('click', () => $$('.menu.open').forEach(x => x.classList.remove('open')));
  const ACTIONS = {
    nouveau: () => { if (!confirm('Créer un nouveau classeur ? Pensez à enregistrer celui-ci.')) return; wb = new A.Classeur(); nom = 'Classeur sans titre'; espaceNom = null; session = []; $('#wb-title').value = nom; si = 0; undoStack = []; redoStack = []; sel = { r: 1, c: 1, r2: 1, c2: 1 }; buildGrid(); renderSession(); persistSoon(); },
    ouvrir: () => $('#open-file').click(),
    abk: downloadAbk,
    xlsx: () => { if (!window.XLSX) return toast('Le module Excel n’a pas pu se charger.', true); XLSX.writeFile(toXlsx(), safe(nom) + '.xlsx'); },
    ods: () => { if (!window.XLSX) return toast('Le module n’a pas pu se charger.', true); XLSX.writeFile(toXlsx(), safe(nom) + '.ods', { bookType: 'ods' }); },
    csv: exportCsv,
    espace_save: saveToEspace,
    espace_open: openFromEspace,
    annuler: () => undo(false), retablir: () => undo(true),
    effacer: clearSel, bas: () => fillDir(true), droite: () => fillDir(false),
    tri_asc: () => sortSel(true), tri_desc: () => sortSel(false),
    fonctions: () => { renderFnList(''); $('#dlg-fn').showModal(); $('#fn-search').focus(); },
    aide: () => $('#dlg-aide').showModal(),
    exemple: loadExample
  };
  $$('[data-action]').forEach(b => b.addEventListener('click', () => { $$('.menu.open').forEach(x => x.classList.remove('open')); ACTIONS[b.dataset.action](); }));
  $$('[data-analyse]').forEach(b => b.addEventListener('click', () => { $$('.menu.open').forEach(x => x.classList.remove('open')); openAnalysis(b.dataset.analyse); }));
  $('#open-file').addEventListener('change', async e => { const f = e.target.files[0]; if (f) { try { await openFile(f); espaceNom = null; } catch (er) { toast('Ouverture impossible : ' + er.message, true); } } e.target.value = ''; });
  $$('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));

  /* Liste des fonctions */
  const FN_DESC = {
    SOMME: 'Additionne des nombres', MOYENNE: 'Moyenne arithmétique', SI: 'SI(test ; si_vrai ; si_faux)', NB: 'Compte les nombres', 'NB.SI': 'Compte selon un critère, ex. NB.SI(A2:A30;">=10")',
    'SOMME.SI': 'Additionne selon un critère', RECHERCHEV: 'Cherche une valeur dans la 1re colonne d’un tableau', ARRONDI: 'ARRONDI(nombre ; décimales)', MAX: 'Plus grande valeur', MIN: 'Plus petite valeur',
    MEDIANE: 'Valeur du milieu', ECARTYPE: 'Écart-type d’un échantillon', VAR: 'Variance d’un échantillon', 'NB.VAL': 'Compte les cellules non vides', CONCATENER: 'Assemble des textes', AUJOURDHUI: 'Date du jour',
    RACINE: 'Racine carrée', PUISSANCE: 'PUISSANCE(nombre ; exposant)', ET: 'VRAI si toutes les conditions sont vraies', OU: 'VRAI si au moins une condition est vraie', SIERREUR: 'Valeur de remplacement en cas d’erreur',
    PENTE: 'Pente de la droite de régression', COEFFICIENT_CORRELATION: 'Corrélation de deux séries', QUARTILE: 'QUARTILE(plage ; 1, 2 ou 3)', RANG: 'Rang d’une valeur dans une liste', 'LOI.NORMALE.N': 'Loi normale'
  };
  function renderFnList(q) {
    const nq = q.trim().toUpperCase();
    const list = A.listeFonctions().filter(f => !nq || f.fr.includes(nq) || f.en.includes(nq) || (FN_DESC[f.fr] || '').toUpperCase().includes(nq));
    $('#fn-list').innerHTML = list.slice(0, 200).map(f => `<button class="fn-item" data-fn="${f.fr}"><strong>${f.fr}</strong><span>${FN_DESC[f.fr] || 'Équivalent Excel anglais : ' + f.en}</span></button>`).join('') || '<p class="small">Aucune fonction trouvée.</p>';
    $$('.fn-item').forEach(b => b.addEventListener('click', () => {
      $('#dlg-fn').close();
      startEdit('=' + b.dataset.fn + '(', false);
    }));
  }
  $('#fn-search').addEventListener('input', e => renderFnList(e.target.value));

  /* Exemple de données pour découvrir */
  function loadExample() {
    if (F().cells.size && !confirm('Charger l’exemple dans une nouvelle feuille ?')) return;
    const rows = [['Élève', 'Classe', 'Maths', 'Français', 'Sciences', 'Heures d’étude'],
      ['Wilda', 'NS2 A', 14, 15, 13, 6], ['Ricardo', 'NS2 A', 11, 12, 10, 3], ['Nathalie', 'NS2 B', 17, 14, 16, 8], ['Kervens', 'NS2 B', 9, 11, 8, 2],
      ['Mirlande', 'NS2 A', 15, 16, 14, 7], ['Jean-Marc', 'NS2 B', 12, 10, 13, 4], ['Stéphanie', 'NS2 A', 16, 17, 15, 7], ['Peterson', 'NS2 B', 10, 13, 9, 3],
      ['Lovely', 'NS2 A', 13, 14, 12, 5], ['Daniel', 'NS2 B', 18, 15, 17, 9], ['Fabiola', 'NS2 A', 12, 13, 11, 4], ['Wesley', 'NS2 B', 14, 12, 15, 6]];
    const i = F().cells.size ? wb.ajouterFeuille('Exemple') : si;
    if (i === si) F().nom = 'Exemple';
    rows.forEach((row, r) => row.forEach((v, c) => wb.saisir(i, r + 1, c + 1, String(v))));
    wb.saisir(i, 14, 1, 'Moyenne'); ['C', 'D', 'E', 'F'].forEach((L, k) => wb.saisir(i, 14, 3 + k, `=MOYENNE(${L}2:${L}13)`));
    wb.saisir(i, 1, 7, 'Moyenne élève'); for (let r = 2; r <= 13; r++) wb.saisir(i, r, 7, `=ARRONDI(MOYENNE(C${r}:E${r});2)`);
    wb.setFormat(i, 14, 1, { b: true }); [3, 4, 5, 6].forEach(c => wb.setFormat(i, 14, c, { b: true, dec: 2 }));
    for (let c = 1; c <= 7; c++) wb.setFormat(i, 1, c, { b: true });
    si = i; sel = { r: 2, c: 3, r2: 2, c2: 3 }; buildGrid(); persistSoon();
    toast('Exemple chargé : essayez Statistiques, puis Statistiques descriptives.');
  }

  /* ---------------- Démarrage ---------------- */
  document.addEventListener('DOMContentLoaded', () => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (saved) { wb = A.Classeur.fromJSON(saved); nom = saved.nom || nom; session = saved.session || []; espaceNom = saved.espaceNom || null; }
    } catch (e) {}
    $('#wb-title').value = nom;
    buildGrid();
    renderSession();
    gridWrap.focus();
    window.addEventListener('beforeunload', () => { try { localStorage.setItem(STORE, JSON.stringify({ ...toJSON(), espaceNom })); } catch (e) {} });
    gridWrap.addEventListener('scroll', () => { if (editing && editing.input) { /* l'éditeur suit la cellule */ } });
    window.addEventListener('resize', placeHandle);
    if (new URLSearchParams(location.search).has('mesure')) $('#session').classList.add('open');
  });
})();
