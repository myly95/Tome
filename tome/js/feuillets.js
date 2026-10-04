/* Tòme : boutique des feuillets du bac. */
document.addEventListener('DOMContentLoaded', async () => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const Auth = window.TomeAuth, CFG = window.TOME_CONFIG;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const htg = n => Number(n || 0).toLocaleString('fr-FR') + ' HTG';
  const logged = () => Auth.token() && !Auth.isDemo();
  const toast = (msg, isErr) => { let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); } t.textContent = msg; t.className = 'toast show' + (isErr ? ' err' : ''); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 4000); };
  async function getJSON(path) {
    const headers = { Accept: 'application/json' };
    if (logged()) headers.Authorization = 'Bearer ' + Auth.token();
    try { const r = await fetch((CFG.apiBase || '') + path, { headers }); return r.ok ? r.json() : null; } catch (e) { return null; }
  }
  let data = null, current = null;

  /* Retour de MonCash */
  const q = new URLSearchParams(location.search);
  if (logged() && (q.get('transactionId') || q.get('achat'))) {
    try {
      const v = await Auth.api('/api/boutique/verifier', { method: 'POST', body: { transactionId: q.get('transactionId') || undefined, achat: q.get('achat') || undefined } });
      toast(v.ok ? 'Paiement confirmé : votre feuillet est disponible !' : v.message, !v.ok);
    } catch (e) { toast(e.message, true); }
    history.replaceState(null, '', location.pathname);
  }

  async function load() {
    data = await getJSON('/api/boutique/catalogue');
    const box = $('#shop');
    if (!data) { box.innerHTML = '<p class="chat-empty">La boutique sera disponible quand le site sera relié au serveur Tòme.</p>'; return; }
    if (!data.produits.length) { box.innerHTML = '<p class="chat-empty">Aucun feuillet en vente pour le moment.</p>'; return; }
    const byMat = {};
    data.produits.forEach(p => (byMat[p.matiere] = byMat[p.matiere] || []).push(p));
    box.innerHTML = Object.entries(byMat).sort((a, b) => a[0].localeCompare(b[0], 'fr')).map(([m, list]) => `<h2 class="lib-h" style="margin-top:28px;">${esc(m)}</h2><div class="grid-3">${list.map(p => `
      <div class="card sheet">
        <div class="chips">${p.niveau ? `<span class="chip">${esc(p.niveau)}</span>` : ''}${p.annee ? `<span class="chip">${esc(p.annee)}</span>` : ''}${p.achete ? '<span class="chip ok">Acheté</span>' : p.en_attente ? '<span class="chip gold">Paiement en vérification</span>' : ''}</div>
        <h3 style="margin-top:14px;">${esc(p.titre)}</h3>
        <p>${esc(p.description || '')}</p>
        <div class="meta"><span>${p.fichiers.length} fichier${p.fichiers.length > 1 ? 's' : ''} PDF</span></div>
        <div class="sheet-foot"><strong class="price">${htg(p.prix)}</strong>${p.achete ? p.fichiers.map(f => `<button class="btn btn-ghost" data-open="${esc(p.id)}" data-f="${esc(f.nom)}">Ouvrir ${p.fichiers.length > 1 ? esc(f.nom) : ''}</button>`).join('') : `<button class="btn btn-primary" data-buy="${esc(p.id)}" ${p.en_attente ? 'disabled' : ''}>Acheter</button>`}</div>
      </div>`).join('')}</div>`).join('');
    $$('[data-buy]').forEach(b => b.addEventListener('click', () => buy(data.produits.find(p => p.id === b.dataset.buy))));
    $$('[data-open]').forEach(b => b.addEventListener('click', () => openPdf(b.dataset.open, b.dataset.f)));
    if (logged()) {
      const m = await Auth.api('/api/boutique/mes-achats').catch(() => null);
      const ST = { paye: ['ok', 'Payé'], en_attente: ['gold', 'En vérification'], refuse: ['accent', 'Refusé'] };
      $('#mine').innerHTML = m && m.achats.length ? m.achats.map(a => `<div class="nb-item"><div class="grow"><div class="t">${esc(a.produit)}</div><div class="s">${new Date(a.date).toLocaleDateString('fr-FR')} · ${htg(a.montant)} · ${a.methode === 'moncash' ? 'MonCash' : 'paiement manuel'}${a.note ? ' · ' + esc(a.note) : ''}</div></div><span class="chip ${ST[a.statut][0]}">${ST[a.statut][1]}</span>${a.statut === 'en_attente' && a.methode === 'moncash' ? `<button data-check="${a.id}">Vérifier</button>` : ''}</div>`).join('') : '<p class="small">Aucun achat pour l’instant.</p>';
      $$('[data-check]').forEach(b => b.addEventListener('click', async () => { try { const v = await Auth.api('/api/boutique/verifier', { method: 'POST', body: { achat: b.dataset.check } }); toast(v.ok ? 'Paiement confirmé !' : v.message, !v.ok); load(); } catch (e) { toast(e.message, true); } }));
    } else $('#mine').innerHTML = '<p class="small"><a href="connexion.html" style="color:var(--accent);font-weight:600;">Connectez-vous</a> pour acheter et retrouver vos feuillets.</p>';
  }

  function buy(p) {
    if (!logged()) { location.href = 'connexion.html'; return; }
    current = p;
    $('#buy-title').textContent = `${p.matiere} : ${p.titre}`;
    $('#buy-price').textContent = htg(p.prix);
    $('#buy-moncash').hidden = !data.paiement.moncash;
    $('#buy-manual').hidden = !data.paiement.manuel;
    $('#buy-manual-text').textContent = data.paiement.manuel || '';
    $('#buy-none').hidden = data.paiement.moncash || data.paiement.manuel;
    $('#buy-ref').value = '';
    $('#dlg-buy').showModal();
  }
  $('#btn-moncash').addEventListener('click', async e => {
    e.target.disabled = true;
    try { const r = await Auth.api('/api/boutique/acheter/' + encodeURIComponent(current.id), { method: 'POST', body: { methode: 'moncash' } }); location.href = r.redirection; }
    catch (er) { toast(er.message, true); e.target.disabled = false; }
  });
  $('#btn-manual').addEventListener('click', async e => {
    const ref = $('#buy-ref').value.trim();
    if (!ref) { toast('Indiquez le numéro de transaction.', true); return; }
    e.target.disabled = true;
    try { const r = await Auth.api('/api/boutique/acheter/' + encodeURIComponent(current.id), { method: 'POST', body: { methode: 'manuel', reference: ref } }); $('#dlg-buy').close(); toast(r.message); load(); }
    catch (er) { toast(er.message, true); }
    finally { e.target.disabled = false; }
  });
  async function openPdf(id, nom) {
    const w = window.open('', '_blank');
    try {
      const r = await fetch(`${CFG.apiBase || ''}/api/boutique/fichier/${encodeURIComponent(id)}/${encodeURIComponent(nom)}`, { headers: { Authorization: 'Bearer ' + Auth.token() } });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'Ouverture impossible.');
      const url = URL.createObjectURL(await r.blob());
      if (w) w.location = url; else location.href = url;
    } catch (e) { if (w) w.close(); toast(e.message, true); }
  }
  $$('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
  await load();

  /* ---------- Équipe ---------- */
  const me = Auth.user();
  if (!logged() || !me || !me.admin) return;
  $('#shop-admin').hidden = false;
  async function loadAdmin() {
    const d = await Auth.api('/api/boutique/admin');
    $('#adm-total').textContent = `${d.ventes} vente${d.ventes > 1 ? 's' : ''} · ${htg(d.total)} encaissés`;
    $('#adm-pending').innerHTML = d.en_attente.length ? d.en_attente.map(a => `<div class="nb-item"><div class="grow"><div class="t">${esc(a.produit)} · ${htg(a.montant)}</div><div class="s">${esc(a.adresse)} · ${a.methode === 'moncash' ? 'MonCash (non confirmé)' : 'Référence : ' + esc(a.reference)} · ${new Date(a.date).toLocaleString('fr-FR')}</div></div><button data-ok="${a.id}">Confirmer</button><button data-no="${a.id}">Refuser</button></div>`).join('') : '<p class="small">Aucun paiement à vérifier.</p>';
    $$('[data-ok]').forEach(b => b.addEventListener('click', () => decide(b.dataset.ok, 'confirmer')));
    $$('[data-no]').forEach(b => b.addEventListener('click', () => decide(b.dataset.no, 'refuser', prompt('Motif du refus (envoyé à l’élève) :') || '')));
    $('#adm-products').innerHTML = d.produits.map(p => `<div class="nb-item"><div class="grow"><div class="t">${esc(p.matiere)} : ${esc(p.titre)}</div><div class="s">${esc(p.id)} · ${htg(p.prix)} · ${(p.fichiers || []).length} PDF${p.publie === false ? ' · masqué' : ''}</div></div><button data-edit="${esc(p.id)}">Modifier</button></div>`).join('') || '<p class="small">Aucun produit.</p>';
    $$('[data-edit]').forEach(b => b.addEventListener('click', () => {
      const p = d.produits.find(x => x.id === b.dataset.edit);
      ['id', 'matiere', 'titre', 'niveau', 'annee', 'prix', 'description'].forEach(k => { $('#p-' + k).value = p[k] ?? ''; });
      $('#p-publie').checked = p.publie !== false;
      $('#p-files').innerHTML = (p.fichiers || []).map(f => `<span class="chip">${esc(f.nom)} <button data-delf="${esc(f.nom)}" title="Retirer" style="background:none;border:none;cursor:pointer;">×</button></span>`).join(' ');
      $$('[data-delf]').forEach(x => x.addEventListener('click', async () => { if (!confirm('Retirer ' + x.dataset.delf + ' ?')) return; await Auth.api(`/api/boutique/produits/${encodeURIComponent(p.id)}/fichiers/${encodeURIComponent(x.dataset.delf)}`, { method: 'DELETE' }); loadAdmin(); load(); }));
      $('#p-id').focus();
    }));
  }
  async function decide(id, decision, note) {
    try { await Auth.api('/api/boutique/achats/' + id, { method: 'POST', body: { decision, note } }); toast(decision === 'confirmer' ? 'Paiement confirmé, l’élève est prévenu.' : 'Paiement refusé, l’élève est prévenu.'); loadAdmin(); }
    catch (e) { toast(e.message, true); }
  }
  $('#p-save').addEventListener('click', async () => {
    const id = $('#p-id').value.trim();
    if (!id) return toast('Indiquez un identifiant, par exemple maths-ns4-2025.', true);
    try {
      await Auth.api('/api/boutique/produits/' + encodeURIComponent(id), { method: 'PUT', body: { matiere: $('#p-matiere').value, titre: $('#p-titre').value, niveau: $('#p-niveau').value, annee: $('#p-annee').value, prix: Number($('#p-prix').value || 100), description: $('#p-description').value, publie: $('#p-publie').checked } });
      const files = [...$('#p-pdf').files];
      for (const f of files) {
        const buf = new Uint8Array(await f.arrayBuffer()); let s = '';
        for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
        await Auth.api(`/api/boutique/produits/${encodeURIComponent(id)}/fichiers/${encodeURIComponent(f.name)}`, { method: 'PUT', body: { base64: btoa(s) } });
      }
      $('#p-pdf').value = '';
      toast('Produit enregistré.'); loadAdmin(); load();
    } catch (e) { toast(e.message, true); }
  });
  loadAdmin();
});
