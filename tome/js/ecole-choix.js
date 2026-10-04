/* Tòme : choix d'une école dans la liste de référence (inscription, Mes notes).
 * TomeEcoleChoix(input, { departement: () => 'Ouest', onChoix: ecole => {} })
 * Renvoie { id(), ecole() }. Sans serveur, le champ reste un simple texte libre. */
(function () {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  window.TomeEcoleChoix = function (input, opts = {}) {
    const CFG = window.TOME_CONFIG || {};
    let choisie = null, timer = null, actif = -1, items = [];
    const box = document.createElement('div'); box.className = 'picker';
    input.parentNode.insertBefore(box, input); box.appendChild(input);
    input.setAttribute('autocomplete', 'off');
    if (!input.placeholder || /Tapez/.test(input.placeholder)) input.placeholder = 'Touchez pour voir la liste, ou tapez le nom'; input.setAttribute('role', 'combobox'); input.setAttribute('aria-expanded', 'false');
    const list = document.createElement('ul'); list.className = 'picker-list'; list.setAttribute('role', 'listbox'); list.hidden = true; box.appendChild(list);
    const etat = document.createElement('span'); etat.className = 'hint'; box.appendChild(etat);
    const fermer = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); actif = -1; };
    function choisir(e) {
      choisie = e;
      if (e) { input.value = e.nom; etat.innerHTML = `<span class="chip ok">Dans la liste</span> ${esc([e.commune, e.departement].filter(Boolean).join(', '))}${e.sur_tome ? ' · école présente sur Tòme' : ''}`; }
      else etat.textContent = input.value.trim() ? 'École hors liste : l’équipe Tòme pourra l’ajouter.' : '';
      fermer();
      opts.onChoix && opts.onChoix(e);
    }
    function rendre(res, titre) {
      items = res;
      list.innerHTML = (titre ? `<li class="titre" aria-hidden="true">${esc(titre)}</li>` : '') + res.map((e, i) => `<li role="option" data-i="${i}"><strong>${esc(e.nom)}</strong><span>${esc([e.commune, e.departement].filter(Boolean).join(', '))}</span></li>`).join('')
        + `<li role="option" data-i="-1" class="none">Mon école n’est pas dans la liste</li>`;
      list.hidden = false; input.setAttribute('aria-expanded', 'true');
    }
    /* Liste à parcourir : toutes les écoles du département choisi, sans rien taper. */
    async function parcourir() {
      if (input.value.trim().length >= 2) return chercher();
      const dep = opts.departement ? opts.departement() : '';
      try {
        const r = await fetch(`${CFG.apiBase || ''}/api/ecoles?limite=200${dep ? '&departement=' + encodeURIComponent(dep) : ''}`, { headers: { Accept: 'application/json' } });
        if (!r.ok) throw 0;
        const d = await r.json();
        if (!d.total) { etat.textContent = 'La liste des écoles n’est pas encore en ligne : écrivez simplement le nom de votre établissement.'; return; }
        if (input.value.trim().length >= 2) return;
        if (!d.ecoles.length) { etat.textContent = 'Aucune école de ce département dans la liste : tapez le nom pour chercher partout.'; return; }
        rendre(d.ecoles, d.ecoles.length >= 200 ? `Les 200 premières écoles${dep ? ' du ' + dep : ''} : tapez quelques lettres pour trouver la vôtre` : `${d.ecoles.length} école${d.ecoles.length > 1 ? 's' : ''}${dep ? ' · ' + dep : ''}`);
      } catch (e) {}
    }
    async function chercher() {
      const q = input.value.trim();
      if (q.length < 2) { fermer(); return; }
      const dep = opts.departement ? opts.departement() : '';
      try {
        const r = await fetch(`${CFG.apiBase || ''}/api/ecoles?q=${encodeURIComponent(q)}${dep ? '&departement=' + encodeURIComponent(dep) : ''}`, { headers: { Accept: 'application/json' } });
        if (!r.ok) throw 0;
        const d = await r.json();
        if (!d.total) { fermer(); etat.textContent = 'La liste des écoles n’est pas encore en ligne : écrivez simplement le nom de votre établissement.'; return; } // liste pas encore importée : texte libre
        let res = d.ecoles;
        if (!res.length && dep) { // rien dans ce département : chercher partout
          const r2 = await fetch(`${CFG.apiBase || ''}/api/ecoles?q=${encodeURIComponent(q)}`); res = (await r2.json()).ecoles;
        }
        if (input.value.trim() === q) rendre(res);
      } catch (e) { fermer(); }
    }
    input.addEventListener('input', () => { if (choisie) { choisie = null; etat.textContent = ''; opts.onChoix && opts.onChoix(null); } clearTimeout(timer); timer = setTimeout(chercher, 200); });
    input.addEventListener('keydown', e => {
      if (list.hidden) return;
      const lis = [...list.children].filter(li => !li.classList.contains('titre'));
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); actif = (actif + (e.key === 'ArrowDown' ? 1 : -1) + lis.length) % lis.length;
        lis.forEach((li, i) => li.classList.toggle('on', i === actif));
      } else if (e.key === 'Enter' && actif >= 0) { e.preventDefault(); const i = +lis[actif].dataset.i; choisir(i < 0 ? null : items[i]); }
      else if (e.key === 'Escape') fermer();
    });
    list.addEventListener('mousedown', e => { const li = e.target.closest('li'); if (!li || li.classList.contains('titre')) return; e.preventDefault(); const i = +li.dataset.i; choisir(i < 0 ? null : items[i]); });
    input.addEventListener('blur', () => setTimeout(fermer, 150));
    input.addEventListener('focus', () => { if (!choisie) parcourir(); });
    input.addEventListener('click', () => { if (!choisie && list.hidden) parcourir(); });
    if (opts.departementEl) opts.departementEl.addEventListener('change', () => { if (choisie) return; fermer(); });
    return { id: () => choisie ? choisie.id : '', ecole: () => choisie, vider: () => { input.value = ''; choisir(null); } };
  };
})();
