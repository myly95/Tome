/* Tòme : bulletins de l'élève. */
document.addEventListener('DOMContentLoaded', async () => {
  const $ = s => document.querySelector(s);
  const Auth = window.TomeAuth;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = n => n === null || n === undefined ? '–' : typeof n === 'number' ? n.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : esc(n);
  const toast = (msg, isErr) => { let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); } t.textContent = msg; t.className = 'toast show' + (isErr ? ' err' : ''); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 4000); };
  const box = $('#bulletins');
  if (!Auth.token() || Auth.isDemo()) {
    box.innerHTML = '<div class="panel"><p class="chat-empty">Vos bulletins s’afficheront ici quand le site sera relié au serveur Tòme et que votre école les aura publiés.</p></div>';
    $('#ecole-etat').innerHTML = '<p class="small">Disponible avec un compte Tòme.</p>';
    return;
  }
  const choix = TomeEcoleChoix($('#ecole-q'));
  const ST = { valide: ['ok', 'Confirmé'], en_attente: ['gold', 'En attente de l’école'], refuse: ['accent', 'Refusé'], ancien: ['', 'Ancienne école'], retire: ['', 'Retiré'] };

  async function ecole() {
    const d = await Auth.api('/api/ecoles/moi').catch(() => ({ rattachements: [] }));
    const r = d.rattachements;
    $('#ecole-etat').innerHTML = r.length ? `<div class="nb-list">${r.slice(0, 4).map(x => `<div class="nb-item"><div class="grow"><div class="t">${esc(x.ecole.nom)}</div><div class="s">${esc([x.classe, x.ecole.commune].filter(Boolean).join(' · '))}${x.note ? ' · ' + esc(x.note) : ''}</div></div><span class="chip ${ST[x.statut]?.[0] || ''}">${ST[x.statut]?.[1] || esc(x.statut)}</span></div>`).join('')}</div>` : '<p class="small">Vous n’êtes rattaché·e à aucune école pour l’instant.</p>';
    const actif = r.find(x => x.statut === 'valide' || x.statut === 'en_attente');
    $('#ecole-form').hidden = !!actif;
    if (actif && !$('#change')) {
      $('#ecole-etat').insertAdjacentHTML('beforeend', '<button class="tbtn" id="change" style="margin-top:12px;">Changer d’école</button>');
      $('#change').addEventListener('click', () => { $('#ecole-form').hidden = false; $('#change').remove(); $('#ecole-q').focus(); });
    }
  }
  $('#ecole-demander').addEventListener('click', async e => {
    if (!choix.id()) return toast('Choisissez votre école dans la liste. Si elle n’y est pas, demandez-lui de s’inscrire sur Tòme.', true);
    e.target.disabled = true;
    try { await Auth.api('/api/ecoles/rattachement', { method: 'POST', body: { ecole_id: choix.id(), classe: $('#ecole-classe').value } }); toast('Demande envoyée à votre école.'); choix.vider(); $('#change')?.remove(); ecole(); }
    catch (er) { toast(er.message, true); }
    finally { e.target.disabled = false; }
  });

  async function bulletins() {
    let d;
    try { d = await Auth.api('/api/notes'); } catch (e) { box.innerHTML = `<div class="panel"><p class="chat-empty">${esc(e.message)}</p></div>`; return; }
    const list = d.releves;
    if (!list.length) { box.innerHTML = '<div class="panel"><p class="chat-empty">Aucun bulletin publié pour l’instant. Ils apparaîtront ici dès que votre école les publiera.</p></div>'; return; }
    $('#print').hidden = false;
    box.innerHTML = list.slice().reverse().map(b => `
      <article class="panel bulletin">
        <div class="bulletin-head">
          <div><span class="eyebrow">${esc(b.annee)}</span><h3>${esc(b.periode)}</h3><div class="s">${esc(b.ecole)}${b.classe ? ' · ' + esc(b.classe) : ''}</div></div>
          <div class="moy"><div class="v">${fmt(b.moyenne)}<small> / ${b.echelle}</small></div><div class="s">${b.rang ? `Rang ${b.rang}${b.rang === 1 ? 'er' : 'e'} sur ${b.effectif}` : ''}${b.moyenne_classe !== null ? ` · classe ${fmt(b.moyenne_classe)}` : ''}</div></div>
        </div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Matière</th><th>Note</th><th>Coef.</th><th style="min-width:130px;">Vous et la classe</th><th>Moy. classe</th></tr></thead><tbody>
        ${b.matieres.map(m => { const n = typeof m.note === 'number' ? m.note : null; return `<tr><td><strong>${esc(m.nom)}</strong></td><td>${fmt(m.note)} <span class="small">/ ${fmt(m.sur)}</span></td><td>${fmt(m.coefficient)}</td><td><div class="note-bar" title="Barre : votre note · trait rouge : moyenne de la classe">${n !== null ? `<i style="width:${Math.min(100, n / m.sur * 100)}%"></i>` : ''}${m.moyenne_classe !== null ? `<b style="left:${Math.min(100, m.moyenne_classe / m.sur * 100)}%"></b>` : ''}</div></td><td>${fmt(m.moyenne_classe)}</td></tr>`; }).join('')}
        </tbody></table></div>
        ${b.appreciation ? `<div class="appr"><strong>Appréciation :</strong> ${esc(b.appreciation)}</div>` : ''}
      </article>`).join('');
    if (list.length > 1) {
      $('#evol-panel').hidden = false;
      $('#evol').innerHTML = list.slice(-8).map(b => `<div class="col"><strong>${fmt(b.moyenne)}</strong><i style="height:${b.moyenne ? Math.max(4, b.moyenne / b.echelle * 100) : 2}%"></i><span>${esc(b.periode)}</span></div>`).join('');
      const ech = [...new Set(list.map(b => b.echelle))];
      $('#evol-scale').textContent = ech.length === 1 ? 'moyenne sur ' + ech[0] : '';
    }
  }
  $('#print').addEventListener('click', () => window.print());
  await Promise.all([ecole(), bulletins()]);
});
