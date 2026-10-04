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
    input.setAttribute('autocomplete', 'off'); input.setAttribute('role', 'combobox'); input.setAttribute('aria-expanded', 'false');
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
    function rendre(res) {
      items = res;
      list.innerHTML = res.map((e, i) => `<li role="option" data-i="${i}"><strong>${esc(e.nom)}</strong><span>${esc([e.commune, e.departement].filter(Boolean).join(', '))}</span></li>`).join('')
        + `<li role="option" data-i="-1" class="none">Mon école n’est pas dans la liste</li>`;
      list.hidden = false; input.setAttribute('aria-expanded', 'true');
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
      const lis = [...list.children];
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); actif = (actif + (e.key === 'ArrowDown' ? 1 : -1) + lis.length) % lis.length;
        lis.forEach((li, i) => li.classList.toggle('on', i === actif));
      } else if (e.key === 'Enter' && actif >= 0) { e.preventDefault(); const i = +lis[actif].dataset.i; choisir(i < 0 ? null : items[i]); }
      else if (e.key === 'Escape') fermer();
    });
    list.addEventListener('mousedown', e => { const li = e.target.closest('li'); if (!li) return; e.preventDefault(); const i = +li.dataset.i; choisir(i < 0 ? null : items[i]); });
    input.addEventListener('blur', () => setTimeout(fermer, 150));
    return { id: () => choisie ? choisie.id : '', ecole: () => choisie, vider: () => { input.value = ''; choisir(null); } };
  };
})();
