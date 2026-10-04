/* Tòme : gestion des élèves et des bulletins par l'école (et liste des écoles pour l'équipe). */
document.addEventListener('DOMContentLoaded', async () => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const Auth = window.TomeAuth;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const num = v => { if (v === null || v === undefined || String(v).trim() === '') return null; const n = Number(String(v).replace(',', '.').trim()); return Number.isFinite(n) ? n : null; };
  const fmt = n => n === null || n === undefined ? '–' : Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
  const toast = (msg, isErr) => { let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); } t.textContent = msg; t.className = 'toast show' + (isErr ? ' err' : ''); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 4500); };
  const info = (html) => { $('#g-msg').innerHTML = html ? `<div class="panel"><p class="chat-empty">${html}</p></div>` : ''; };
  const me = Auth.user() || {};
  if (!Auth.token() || Auth.isDemo()) { info('La gestion des élèves et des bulletins est disponible quand le site est relié au serveur Tòme.'); return; }

  const qEcole = new URLSearchParams(location.search).get('ecole');
  const suffix = qEcole ? '?ecole=' + encodeURIComponent(qEcole) : '';
  let G = null; // { ecole, eleves, releves }

  /* ---------- Onglets ---------- */
  $$('[data-tab]').forEach(b => b.addEventListener('click', () => {
    $$('[data-tab]').forEach(x => x.classList.toggle('on', x === b));
    $$('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== b.dataset.tab; });
    if (b.dataset.tab === 'saisie') renderGrid();
  }));
  $$('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));

  /* ---------- Chargement ---------- */
  async function load() {
    try { G = await Auth.api('/api/ecoles/gestion' + suffix); }
    catch (e) {
      G = null; $('#g-main').hidden = true;
      if (me.role === 'ecole' || qEcole) info(esc(e.message));
      else if (!me.admin) info('Cette page est réservée aux comptes école.');
      return;
    }
    info(''); $('#g-main').hidden = false;
    $('#g-ecole-nom').textContent = G.ecole.nom + (G.ecole.commune ? ' · ' + G.ecole.commune : '');
    const att = G.eleves.filter(e => e.statut === 'en_attente');
    $('#g-count-att').innerHTML = att.length ? `<span class="chip gold" style="margin-left:4px;">${att.length}</span>` : '';
    $('#g-attente').innerHTML = att.length ? att.map(e => `<div class="nb-item"><div class="grow"><div class="t">${esc(e.nom)}</div><div class="s">${esc(e.adresse)} · ${esc(e.classe || 'classe non précisée')} · ${new Date(e.date).toLocaleDateString('fr-FR')}</div></div><button data-val="${e.id}">Confirmer</button><button data-ref="${e.id}">Refuser</button></div>`).join('') : '<p class="small">Aucune demande en attente.</p>';
    $$('[data-val]').forEach(b => b.addEventListener('click', () => decide(b.dataset.val, 'valider')));
    $$('[data-ref]').forEach(b => b.addEventListener('click', () => decide(b.dataset.ref, 'refuser', prompt('Motif (facultatif, envoyé à l’élève) :') || '')));
    const classes = [...new Set(G.eleves.filter(e => e.statut === 'valide').map(e => e.classe).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
    const f = $('#g-filtre'), fv = f.value;
    f.innerHTML = '<option value="">Toutes les classes</option>' + classes.map(c => `<option>${esc(c)}</option>`).join(''); f.value = classes.includes(fv) ? fv : '';
    const bc = $('#b-classe'), bv = bc.value || brouillon().classe;
    bc.innerHTML = classes.map(c => `<option>${esc(c)}</option>`).join('') + '<option value="">Toutes les classes</option>';
    bc.value = classes.includes(bv) || bv === '' ? bv : (classes[0] || '');
    renderValides(); renderPublies();
    if (!$('[data-pane=saisie]').hidden) renderGrid();
  }
  const CLASSES = ['7e AF', '8e AF', '9e AF', 'NS1', 'NS2', 'NS3', 'NS4'];
  function renderValides() {
    const fc = $('#g-filtre').value;
    const v = G.eleves.filter(e => e.statut === 'valide' && (!fc || e.classe === fc));
    $('#g-valides').innerHTML = v.length ? v.map(e => `<tr><td><strong>${esc(e.nom)}</strong></td><td>${esc(e.adresse)}</td><td><select data-classe="${e.id}" aria-label="Classe">${[...new Set([...CLASSES, e.classe].filter(Boolean))].map(c => `<option ${c === e.classe ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></td><td style="text-align:right;white-space:nowrap;"><button class="tbtn" data-mdp="${e.utilisateur_id}" title="Créer un code pour choisir un nouveau mot de passe">Mot de passe oublié</button> <button class="tbtn" data-ret="${e.id}">Retirer</button></td></tr>`).join('') : '<tr><td colspan="4" class="small">Aucun élève confirmé pour l’instant. Les élèves choisissent votre école à l’inscription ou dans « Mes notes ».</td></tr>';
    $$('[data-classe]').forEach(s => s.addEventListener('change', () => decide(s.dataset.classe, 'valider', '', s.value, true)));
    $$('[data-mdp]').forEach(b => b.addEventListener('click', async () => {
      try {
        const d = await Auth.api('/api/auth/code-temporaire', { method: 'POST', body: { utilisateur_id: b.dataset.mdp } });
        $('#vb-title').textContent = 'Code pour ' + d.pour.nom;
        $('#vb-body').innerHTML = `<p style="margin-bottom:12px;">Donnez ce code à l'élève en main propre. Il le saisit sur la page « Mot de passe oublié » avec son adresse <strong>${esc(d.pour.adresse)}</strong>, puis choisit un nouveau mot de passe. Valable ${d.valable_heures} heures, une seule fois.</p><div class="addr-card">${esc(d.code)}</div>`;
        $('#dlg-bulletin').showModal();
      } catch (e) { toast(e.message, true); }
    }));
    $$('[data-ret]').forEach(b => b.addEventListener('click', () => { if (confirm('Retirer cet élève de l’école ? Ses bulletins déjà publiés restent visibles pour lui.')) decide(b.dataset.ret, 'retirer'); }));
  }
  $('#g-filtre').addEventListener('change', renderValides);
  async function decide(id, decision, note = '', classe, quiet) {
    try {
      await Auth.api('/api/ecoles/rattachements/' + id, { method: 'POST', body: { decision, note, ...(classe !== undefined ? { classe } : {}) } });
      if (!quiet) toast(decision === 'valider' ? 'Élève confirmé, il est prévenu.' : decision === 'refuser' ? 'Demande refusée.' : 'Élève retiré.');
      else toast('Classe mise à jour.');
      load();
    } catch (e) { toast(e.message, true); }
  }

  /* ---------- Saisie des notes ---------- */
  const KEY = () => 'tome_bulletin_' + (G ? G.ecole.id : '');
  const anneeScolaire = () => { const d = new Date(), y = d.getFullYear(); return d.getMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`; };
  let B = null;
  function brouillon() {
    if (B) return B;
    try { B = JSON.parse(localStorage.getItem(KEY()) || 'null'); } catch (e) { B = null; }
    B = B || { annee: anneeScolaire(), periode: '', classe: undefined, echelle: 10, matieres: [], notes: {}, appr: {} };
    $('#b-annee').value = B.annee; $('#b-periode').value = B.periode; $('#b-echelle').value = String(B.echelle);
    return B;
  }
  const garder = () => { try { localStorage.setItem(KEY(), JSON.stringify(B)); } catch (e) {} };
  ['annee', 'periode', 'echelle'].forEach(k => $('#b-' + k).addEventListener('input', () => { B[k] = k === 'echelle' ? Number($('#b-echelle').value) : $('#b-' + k).value; garder(); renderGrid(); }));
  $('#b-classe').addEventListener('change', () => { B.classe = $('#b-classe').value; garder(); renderGrid(); });
  const rows = () => G.eleves.filter(e => e.statut === 'valide' && (!$('#b-classe').value || e.classe === $('#b-classe').value));

  function moyenneDe(uid) {
    let s = 0, c = 0;
    for (const m of B.matieres) { const n = num((B.notes[uid] || {})[m.nom]); const sur = num(m.sur) || B.echelle, co = num(m.coefficient) || 1; if (n === null) continue; s += n / sur * co; c += co; }
    return c ? Math.round(s / c * B.echelle * 100) / 100 : null;
  }
  function renderGrid() {
    if (!G) return;
    brouillon();
    const t = $('#b-grid'), list = rows();
    if (!B.matieres.length) { t.innerHTML = '<tbody><tr><td class="nom" style="padding:18px;">Ajoutez les matières du bulletin pour commencer la saisie.</td></tr></tbody>'; $('#b-info').textContent = ''; return; }
    t.innerHTML = `<thead><tr><th class="nom">Élève</th>${B.matieres.map((m, i) => `<th>${esc(m.nom)} <button data-delm="${i}" title="Retirer la matière" style="background:none;border:none;cursor:pointer;color:var(--muted);">×</button><div class="bar-cfg">sur <input data-sur="${i}" value="${esc(m.sur)}" inputmode="decimal"> coef <input data-coef="${i}" value="${esc(m.coefficient)}" inputmode="decimal"></div></th>`).join('')}<th>Moyenne / ${B.echelle}</th><th>Appréciation</th></tr></thead>
      <tbody>${list.map(e => `<tr data-u="${e.utilisateur_id}"><td class="nom">${esc(e.nom)}<small>${esc(e.adresse)}</small></td>${B.matieres.map(m => `<td><input data-n="${esc(m.nom)}" value="${esc((B.notes[e.utilisateur_id] || {})[m.nom] ?? '')}" inputmode="decimal" aria-label="${esc(m.nom)}, ${esc(e.nom)}"></td>`).join('')}<td class="moy-c" data-moy>${fmt(moyenneDe(e.utilisateur_id))}</td><td class="appr"><input data-appr value="${esc(B.appr[e.utilisateur_id] || '')}" aria-label="Appréciation, ${esc(e.nom)}"></td></tr>`).join('') || `<tr><td class="nom" colspan="${B.matieres.length + 3}" style="padding:18px;">Aucun élève confirmé dans cette classe.</td></tr>`}</tbody>`;
    $$('[data-delm]', t).forEach(b => b.addEventListener('click', () => { B.matieres.splice(+b.dataset.delm, 1); garder(); renderGrid(); }));
    $$('[data-sur]', t).forEach(i => i.addEventListener('change', () => { B.matieres[+i.dataset.sur].sur = i.value; garder(); renderGrid(); }));
    $$('[data-coef]', t).forEach(i => i.addEventListener('change', () => { B.matieres[+i.dataset.coef].coefficient = i.value; garder(); renderGrid(); }));
    $$('tbody input[data-n]', t).forEach(i => {
      const check = () => { const m = B.matieres.find(x => x.nom === i.dataset.n), n = num(i.value), sur = num(m.sur) || B.echelle; i.classList.toggle('bad', i.value.trim() !== '' && (n === null ? !/^(abs|disp|disp\.|dispensé|nc)$/i.test(i.value.trim()) : n < 0 || n > sur)); };
      check();
      i.addEventListener('input', () => {
        const uid = i.closest('tr').dataset.u; (B.notes[uid] = B.notes[uid] || {})[i.dataset.n] = i.value; garder(); check();
        i.closest('tr').querySelector('[data-moy]').textContent = fmt(moyenneDe(uid)); stats();
      });
    });
    $$('[data-appr]', t).forEach(i => i.addEventListener('input', () => { B.appr[i.closest('tr').dataset.u] = i.value; garder(); }));
    stats();
  }
  // Entrée = case du dessous, comme dans un tableur
  $('#b-grid').addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT' || !e.target.closest('tbody')) return;
    e.preventDefault(); const td = e.target.closest('td'), tr = td.parentElement, idx = [...tr.children].indexOf(td);
    const next = tr.nextElementSibling?.children[idx]?.querySelector('input'); if (next) next.focus();
  });
  function stats() {
    const list = rows(), m = list.map(e => moyenneDe(e.utilisateur_id)).filter(x => x !== null);
    $('#b-info').textContent = `${list.length} élève${list.length > 1 ? 's' : ''}` + (m.length ? ` · moyenne de classe ${fmt(m.reduce((a, x) => a + x, 0) / m.length)} / ${B.echelle}` : '');
  }
  function ajouterMatiere(nom) {
    nom = String(nom || '').trim(); if (!nom) return false;
    if (B.matieres.some(m => norm(m.nom) === norm(nom))) return false;
    B.matieres.push({ nom, sur: B.echelle, coefficient: 1 }); return true;
  }
  $('#b-mat-add').addEventListener('click', () => { brouillon(); if (ajouterMatiere($('#b-mat').value)) { $('#b-mat').value = ''; garder(); renderGrid(); } $('#b-mat').focus(); });
  $('#b-mat').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#b-mat-add').click(); } });
  $('#b-mat-std').addEventListener('click', () => {
    brouillon();
    ['Français', 'Créole', 'Mathématiques', 'Anglais', 'Espagnol', 'Physique', 'Chimie', 'Biologie', 'Histoire et géographie', 'Éducation civique', 'Philosophie', 'Informatique'].forEach(ajouterMatiere);
    garder(); renderGrid(); toast('Matières ajoutées. Retirez celles que votre classe n’a pas avec ×.');
  });

  /* ---------- Import / modèle ---------- */
  function parseCsv(text) {
    text = text.replace(/^﻿/, '');
    const first = text.split(/\r?\n/)[0] || '';
    const sep = [';', '\t', ','].map(s => [s, first.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
    const out = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
      else if (c === '"') q = true;
      else if (c === sep) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); out.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); out.push(row); }
    return out.filter(r => r.some(x => String(x).trim() !== ''));
  }
  function loadXlsx() {
    if (window.XLSX) return Promise.resolve();
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = res; s.onerror = () => rej(new Error('Lecture Excel indisponible hors ligne. Enregistrez le fichier en CSV.')); document.head.appendChild(s); });
  }
  async function lireTableau(file) {
    if (/\.csv$/i.test(file.name)) return parseCsv(await file.text());
    await loadXlsx();
    const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' }).filter(r => r.some(x => String(x).trim() !== ''));
  }
  window.TomeLireTableau = lireTableau;
  $('#b-import-btn').addEventListener('click', () => $('#b-import').click());
  $('#b-import').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    brouillon();
    try {
      const t = await lireTableau(f);
      if (t.length < 2) throw new Error('Le fichier est vide.');
      const h = t[0].map(x => norm(x));
      const iAdr = h.findIndex(x => x.startsWith('adresse')), iNom = h.findIndex(x => ['eleve', 'nom complet', 'nom'].includes(x)), iPre = h.findIndex(x => x === 'prenom');
      const iApp = h.findIndex(x => x.startsWith('appreciation'));
      const skip = new Set([iAdr, iNom, iPre, iApp, h.findIndex(x => x === 'classe'), h.findIndex(x => x.startsWith('moyenne')), h.findIndex(x => x === 'rang')].filter(i => i >= 0));
      if (iAdr < 0 && iNom < 0) throw new Error('Il faut une colonne « Adresse » (adresse Tòme) ou « Élève » (nom complet).');
      const cols = t[0].map((x, i) => ({ i, nom: String(x).trim() })).filter(c => !skip.has(c.i) && c.nom);
      cols.forEach(c => ajouterMatiere(c.nom));
      const mat = c => B.matieres.find(m => norm(m.nom) === norm(c.nom));
      const list = rows(), byAdr = new Map(), byNom = new Map();
      list.forEach(e => { byAdr.set(norm(e.adresse), e); byAdr.set(norm(e.adresse.split('@')[0]), e); byNom.set(norm(e.nom), e); });
      let ok = 0; const inconnus = [];
      for (const r of t.slice(1)) {
        const tag = norm(r[iAdr >= 0 ? iAdr : iNom]);
        if (['sur', 'bareme', 'note max', 'note maximale'].includes(tag)) { cols.forEach(c => { if (num(r[c.i]) !== null) mat(c).sur = num(r[c.i]); }); continue; }
        if (['coef', 'coefficient', 'coefficients'].includes(tag)) { cols.forEach(c => { if (num(r[c.i]) !== null) mat(c).coefficient = num(r[c.i]); }); continue; }
        const nomComplet = iPre >= 0 && iNom >= 0 ? norm(r[iPre] + ' ' + r[iNom]) : norm(r[iNom]);
        const e = (iAdr >= 0 && byAdr.get(norm(r[iAdr]))) || byNom.get(nomComplet) || (iPre >= 0 && byNom.get(norm(r[iNom] + ' ' + r[iPre])));
        if (!e) { inconnus.push(String(r[iAdr >= 0 ? iAdr : iNom] || '?')); continue; }
        const n = B.notes[e.utilisateur_id] = B.notes[e.utilisateur_id] || {};
        cols.forEach(c => { const v = r[c.i]; n[mat(c).nom] = v === null || v === undefined ? '' : String(v).trim(); });
        if (iApp >= 0) B.appr[e.utilisateur_id] = String(r[iApp] || '').trim();
        ok++;
      }
      garder(); renderGrid();
      toast(`${ok} élève${ok > 1 ? 's' : ''} importé${ok > 1 ? 's' : ''}.` + (inconnus.length ? ` Non reconnus (pas confirmés dans cette classe ?) : ${inconnus.slice(0, 5).join(', ')}${inconnus.length > 5 ? '…' : ''}` : ''), inconnus.length > 0);
    } catch (er) { toast(er.message, true); }
  });
  $('#b-modele').addEventListener('click', () => {
    brouillon();
    const q = v => /[;"\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
    const m = B.matieres.length ? B.matieres : [{ nom: 'Mathématiques', sur: B.echelle, coefficient: 1 }, { nom: 'Français', sur: B.echelle, coefficient: 1 }];
    const lines = [['Adresse', 'Élève', ...m.map(x => x.nom), 'Appréciation'], ['sur', '', ...m.map(x => x.sur), ''], ['coef', '', ...m.map(x => x.coefficient), ''],
      ...rows().map(e => [e.adresse, e.nom, ...m.map(x => (B.notes[e.utilisateur_id] || {})[x.nom] ?? ''), B.appr[e.utilisateur_id] || ''])];
    const blob = new Blob(['﻿' + lines.map(r => r.map(q).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `bulletin-${($('#b-classe').value || 'ecole').replace(/\s+/g, '-')}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  /* ---------- Publication ---------- */
  $('#b-publier').addEventListener('click', async e => {
    brouillon();
    B.annee = $('#b-annee').value.trim(); B.periode = $('#b-periode').value.trim();
    if (!B.annee || !B.periode) return toast('Indiquez l’année scolaire et la période.', true);
    if ($$('#b-grid input.bad').length) return toast('Certaines notes sont hors barème (en rouge).', true);
    const list = rows().filter(x => B.matieres.some(m => String((B.notes[x.utilisateur_id] || {})[m.nom] ?? '').trim() !== ''));
    if (!list.length) return toast('Aucune note saisie.', true);
    const classe = $('#b-classe').value;
    if (!confirm(`Publier « ${B.periode} ${B.annee} »${classe ? ' pour la ' + classe : ''} ? ${list.length} élève(s) verront leur bulletin.`)) return;
    e.target.disabled = true;
    try {
      const r = await Auth.api('/api/ecoles/releves' + suffix, { method: 'POST', body: {
        annee: B.annee, periode: B.periode, classe, echelle: B.echelle, notifier: $('#b-notifier').checked,
        matieres: B.matieres.map(m => ({ nom: m.nom, sur: num(m.sur) || B.echelle, coefficient: num(m.coefficient) || 1 })),
        eleves: list.map(x => ({ eleve: x.utilisateur_id, notes: B.notes[x.utilisateur_id] || {}, appreciation: B.appr[x.utilisateur_id] || '' }))
      } });
      toast(`Bulletin publié pour ${r.eleves} élève${r.eleves > 1 ? 's' : ''}. Moyenne de classe : ${fmt(r.classe)} / ${B.echelle}.`);
      B.notes = {}; B.appr = {}; B.periode = ''; $('#b-periode').value = ''; garder(); load();
    } catch (er) { toast(er.message, true); }
    finally { e.target.disabled = false; }
  });

  /* ---------- Bulletins publiés ---------- */
  function renderPublies() {
    $('#g-publies').innerHTML = G.releves.length ? G.releves.map(r => `<tr><td><strong>${esc(r.periode)}</strong> <span class="small">${esc(r.annee)}</span></td><td>${esc(r.classe || 'Toutes')}</td><td>${r.eleves}</td><td>${fmt(r.moyenne_classe)} / ${r.echelle}</td><td>${new Date(r.date).toLocaleDateString('fr-FR')}</td><td style="text-align:right;white-space:nowrap;"><button class="tbtn" data-voir="${esc(r.id)}">Voir</button> <button class="tbtn" data-corr="${esc(r.id)}">Corriger</button> <button class="tbtn" data-supp="${esc(r.id)}">Retirer</button></td></tr>`).join('') : '<tr><td colspan="6" class="small">Aucun bulletin publié.</td></tr>';
    $$('[data-voir]').forEach(b => b.addEventListener('click', () => voir(b.dataset.voir)));
    $$('[data-corr]').forEach(b => b.addEventListener('click', () => corriger(b.dataset.corr)));
    $$('[data-supp]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Retirer ce bulletin ? Les élèves ne le verront plus.')) return;
      try { await Auth.api('/api/ecoles/releves/' + encodeURIComponent(b.dataset.supp) + suffix, { method: 'DELETE' }); toast('Bulletin retiré.'); load(); } catch (e) { toast(e.message, true); }
    }));
  }
  async function voir(id) {
    try {
      const b = await Auth.api('/api/ecoles/releves/' + encodeURIComponent(id) + suffix);
      $('#vb-title').textContent = `${b.periode} ${b.annee}${b.classe ? ' · ' + b.classe : ''}`;
      const ids = Object.keys(b.eleves).sort((x, y) => (b.calcul.rang[x] || 999) - (b.calcul.rang[y] || 999));
      $('#vb-body').innerHTML = `<table class="tbl"><thead><tr><th>Rang</th><th>Élève</th>${b.matieres.map(m => `<th>${esc(m.nom)}<br><span style="text-transform:none;letter-spacing:0;">/${fmt(m.sur)} · coef ${fmt(m.coefficient)}</span></th>`).join('')}<th>Moyenne / ${b.echelle}</th></tr></thead><tbody>${ids.map(id => `<tr><td>${b.calcul.rang[id] || '–'}</td><td><strong>${esc(b.noms[id].nom)}</strong></td>${b.matieres.map(m => { const v = b.eleves[id].notes[m.nom]; return `<td>${typeof v === 'number' ? fmt(v) : esc(v ?? '–')}</td>`; }).join('')}<td><strong>${fmt(b.calcul.moyennes[id])}</strong></td></tr>`).join('')}<tr><td></td><td><em>Moyenne de classe</em></td>${b.matieres.map(m => `<td><em>${fmt(b.calcul.parMatiere[m.nom])}</em></td>`).join('')}<td><em>${fmt(b.calcul.classe)}</em></td></tr></tbody></table>`;
      $('#dlg-bulletin').showModal();
    } catch (e) { toast(e.message, true); }
  }
  async function corriger(id) {
    try {
      const b = await Auth.api('/api/ecoles/releves/' + encodeURIComponent(id) + suffix);
      brouillon();
      Object.assign(B, { annee: b.annee, periode: b.periode, classe: b.classe, echelle: b.echelle, matieres: b.matieres.map(m => ({ ...m })), notes: {}, appr: {} });
      for (const [uid, e] of Object.entries(b.eleves)) { B.notes[uid] = Object.fromEntries(Object.entries(e.notes).map(([k, v]) => [k, String(v)])); B.appr[uid] = e.appreciation || ''; }
      garder();
      $('#b-annee').value = B.annee; $('#b-periode').value = B.periode; $('#b-echelle').value = String(B.echelle); $('#b-classe').value = B.classe || '';
      $('[data-tab=saisie]').click();
      toast('Bulletin chargé. Corrigez puis publiez à nouveau : il remplacera l’ancien.');
    } catch (e) { toast(e.message, true); }
  }

  await load();

  /* ---------- Équipe Tòme ---------- */
  if (!me.admin) return;
  $('#g-admin').hidden = false;
  if (!G && !qEcole) info('Vous êtes dans l’équipe Tòme : gérez ci-dessous la liste des écoles et les comptes école. Pour ouvrir la gestion d’une école, utilisez « Ouvrir » sur un compte validé.');
  async function loadAdmin() {
    let d; try { d = await Auth.api('/api/ecoles/admin'); } catch (e) { toast(e.message, true); return; }
    $('#a-total').textContent = `${d.total} école${d.total > 1 ? 's' : ''} dans la liste · ${d.eleves} élève${d.eleves > 1 ? 's' : ''} rattaché${d.eleves > 1 ? 's' : ''}`;
    $('#a-comptes').innerHTML = d.comptes.length ? d.comptes.map(c => `<div class="nb-item"><div class="grow"><div class="t">${esc(c.ecole.nom)}</div><div class="s">${esc(c.nom)}${c.fonction ? ' (' + esc(c.fonction) + ')' : ''} · ${esc(c.email)} · ${esc(c.adresse)}</div></div>${c.statut === 'en_attente' ? `<button data-aok="${c.id}">Valider</button><button data-ano="${c.id}">Refuser</button>` : `<span class="chip ok">Validé</span><a class="tbtn" href="gestion-ecole.html?ecole=${encodeURIComponent(c.ecole.id)}">Ouvrir</a>`}</div>`).join('') : '<p class="small">Aucun compte école.</p>';
    $('#a-hors').innerHTML = d.hors_liste.length ? d.hors_liste.map(c => `<div class="nb-item"><div class="grow"><div class="t">${esc(c.nom_ecole || '(nom non indiqué)')}</div><div class="s">${esc([c.commune, c.departement].filter(Boolean).join(', '))} · ${esc(c.nom)} · ${esc(c.email)}</div></div><button data-hors="${c.utilisateur_id}">Ajouter et valider</button></div>`).join('') : '<p class="small">Aucune.</p>';
    $$('[data-aok]').forEach(b => b.addEventListener('click', () => adec(b.dataset.aok, 'valider')));
    $$('[data-ano]').forEach(b => b.addEventListener('click', () => adec(b.dataset.ano, 'refuser', prompt('Motif (envoyé au compte) :') || '')));
    $$('[data-hors]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Ajouter cet établissement à la liste et valider le compte ? Vérifiez d’abord que la personne représente bien l’école.')) return;
      try { await Auth.api('/api/ecoles/admin/ajouter-compte', { method: 'POST', body: { utilisateur_id: b.dataset.hors } }); toast('École ajoutée et compte validé.'); loadAdmin(); } catch (e) { toast(e.message, true); }
    }));
  }
  async function adec(id, decision, note = '') {
    try { await Auth.api('/api/ecoles/rattachements/' + id, { method: 'POST', body: { decision, note } }); toast(decision === 'valider' ? 'Compte école validé.' : 'Compte refusé.'); loadAdmin(); } catch (e) { toast(e.message, true); }
  }
  $('#a-osm').addEventListener('click', async e => {
    if (!confirm('Importer les écoles d’Haïti depuis OpenStreetMap ? Cela peut prendre une ou deux minutes.')) return;
    e.target.disabled = true; const t0 = e.target.textContent; e.target.textContent = 'Import en cours…';
    try {
      const r = await Auth.api('/api/ecoles/admin/osm', { method: 'POST' });
      $('#a-res').textContent = `OpenStreetMap : ${r.recues} écoles reçues, ${r.ajoutees} ajoutées, ${r.ignorees} déjà présentes ou en double. La liste compte ${r.total} écoles.`;
      loadAdmin();
    } catch (er) { toast(er.message, true); }
    finally { e.target.disabled = false; e.target.textContent = t0; }
  });
  $('#a-import').addEventListener('click', async e => {
    const f = $('#a-file').files[0];
    if (!f) return toast('Choisissez un fichier CSV ou Excel.', true);
    e.target.disabled = true;
    try {
      const t = await lireTableau(f);
      const h = t[0].map(x => norm(x)), col = (...n) => h.findIndex(x => n.includes(x));
      const iN = col('nom', 'nom de l\'ecole', 'ecole', 'etablissement', 'nom de l\'etablissement', 'name', 'name:fr', 'nom_ecole'), iC = col('commune', 'ville', 'addr:city', 'addr_city', 'city'), iD = col('departement', 'dept', 'dep', 'addr:state', 'state', 'adm1', 'adm1_fr', 'is_in:state'), iT = col('type', 'secteur', 'statut', 'amenity');
      if (iN < 0) throw new Error('Colonne « nom » introuvable dans la première ligne.');
      const ecoles = t.slice(1).map(r => ({ nom: String(r[iN] ?? '').trim(), commune: iC >= 0 ? String(r[iC] ?? '').trim() : '', departement: iD >= 0 ? String(r[iD] ?? '').trim() : '', type: iT >= 0 ? String(r[iT] ?? '').trim() : '' })).filter(x => x.nom);
      const mode = $('#a-mode').value;
      if (mode === 'remplacer' && !confirm(`Remplacer toute la liste par ces ${ecoles.length} écoles ?`)) return;
      const r = await Auth.api('/api/ecoles/liste', { method: 'PUT', body: { ecoles, mode } });
      $('#a-res').textContent = `${r.ajoutees} ajoutée(s), ${r.ignorees} ignorée(s) (doublons ou lignes vides). La liste compte ${r.total} écoles.`;
      $('#a-file').value = ''; loadAdmin();
    } catch (er) { toast(er.message, true); }
    finally { e.target.disabled = false; }
  });
  loadAdmin();
});
