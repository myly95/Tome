/* Tòme : mon compte (mot de passe, code de secours, aide à la récupération). */
document.addEventListener('DOMContentLoaded', async () => {
  const $ = s => document.querySelector(s);
  const Auth = window.TomeAuth;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const toast = (msg, isErr) => { let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); } t.textContent = msg; t.className = 'toast show' + (isErr ? ' err' : ''); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 4500); };
  const me = Auth.user() || {};
  const ROLE = { eleve: 'Élève', enseignant: 'Enseignant·e', ecole: 'École', partenaire: 'Partenaire' };
  $('#c-info').innerHTML = [['Nom', me.name], ['Adresse Tòme', me.adresse], ['E-mail', me.email], ['Profil', ROLE[me.role]]].filter(x => x[1])
    .map(([k, v]) => `<div class="nb-item"><div class="grow"><div class="s">${k}</div><div class="t">${esc(v)}</div></div></div>`).join('');
  if (!Auth.token() || Auth.isDemo()) {
    $('#c-msg').innerHTML = '<div class="panel" style="margin-bottom:16px;"><p class="chat-empty">Ces réglages fonctionnent quand le site est relié au serveur Tòme.</p></div>';
    return;
  }
  const codeBox = (el, code, texte) => { el.innerHTML = `<p class="small" style="margin-bottom:8px;">${texte}</p><div class="addr-card">${esc(code)}</div>`; };

  // état du code de secours
  const etat = async () => { try { const d = await Auth.api('/api/auth/code-secours'); $('#cs-etat').textContent = d.existe ? 'Actif' : 'Aucun code'; $('#cs-etat').className = 'chip ' + (d.existe ? 'ok' : 'gold'); } catch (e) {} };
  etat();

  $('#f-pw').addEventListener('submit', async e => {
    e.preventDefault();
    const a = $('#pw-old').value, n = $('#pw-new').value;
    if (n.length < 8) return toast('Le nouveau mot de passe doit contenir au moins 8 caractères.', true);
    if (n !== $('#pw-new2').value) return toast('Les deux nouveaux mots de passe ne sont pas identiques.', true);
    const b = e.target.querySelector('button'); b.disabled = true;
    try { const d = await Auth.api('/api/auth/mot-de-passe', { method: 'POST', body: { actuel: a, nouveau: n } }); Auth.save(d.token, d.user); e.target.reset(); toast('Mot de passe changé.'); }
    catch (er) { toast(er.message, true); }
    finally { b.disabled = false; }
  });

  $('#cs-go').addEventListener('click', async e => {
    const pw = $('#cs-pw').value;
    if (!pw) { $('#cs-pw').focus(); return toast('Confirmez avec votre mot de passe.', true); }
    e.target.disabled = true;
    try { const d = await Auth.api('/api/auth/code-secours', { method: 'POST', body: { mot_de_passe: pw } }); $('#cs-pw').value = ''; codeBox($('#cs-res'), d.code_secours, 'Votre nouveau code de secours (l’ancien ne marche plus). Notez-le maintenant, il ne sera plus affiché :'); etat(); }
    catch (er) { toast(er.message, true); }
    finally { e.target.disabled = false; }
  });

  // école (pour ses élèves) ou équipe Tòme (pour tout le monde)
  if (me.admin || me.role === 'ecole') {
    $('#p-aide').hidden = false;
    $('#aide-texte').textContent = me.admin
      ? 'Équipe Tòme : créez un code temporaire (valable 24 heures, une seule fois) et donnez-le à la personne, de vive voix ou par téléphone, après avoir vérifié son identité.'
      : 'Pour un élève confirmé de votre école qui a oublié son mot de passe : créez un code temporaire (valable 24 heures, une seule fois) et donnez-le-lui en main propre. Il le saisit sur la page « Mot de passe oublié ».';
    $('#aide-go').addEventListener('click', async e => {
      const id = $('#aide-id').value.trim(); if (!id) return $('#aide-id').focus();
      e.target.disabled = true;
      try { const d = await Auth.api('/api/auth/code-temporaire', { method: 'POST', body: { identifiant: id } }); codeBox($('#aide-res'), d.code, `Code pour ${esc(d.pour.nom)} (${esc(d.pour.adresse)}), valable ${d.valable_heures} heures :`); $('#aide-id').value = ''; }
      catch (er) { toast(er.message, true); }
      finally { e.target.disabled = false; }
    });
  }
});
