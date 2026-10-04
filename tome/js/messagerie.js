/* Tòme : messagerie (conversations à deux, groupes, annonces des nouveautés), API ou démonstration. */
document.addEventListener('DOMContentLoaded', () => {
  const $ = s => document.querySelector(s);
  const chat = $('#chat');
  if (!chat) return;
  const listEl = $('#conv-list'), threadEl = $('#thread'), headEl = $('#thread-head'), form = $('#composer');
  const input = $('#composer-text'), searchEl = $('#people-search'), resultsEl = $('#people-results');
  const Auth = window.TomeAuth, Son = window.TomeSon;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- Démonstration ---------- */
  const demo = Auth.isDemo();
  const DEMO = (() => {
    const t = m => new Date(Date.now() - m * 60000).toISOString();
    const people = [{ id: 'd1', name: 'Mme Nathalie Dorvil', role: 'enseignant', adresse: 'nathalie.dorvil@tome' }, { id: 'd2', name: 'Lycée de Milot', role: 'ecole', adresse: 'lycee.de.milot@tome' }, { id: 'd3', name: 'Kervens Bien-Aimé', role: 'eleve', adresse: 'kervens.bien.aime@tome' }, { id: 'd4', name: 'Wilda Joseph', role: 'eleve', adresse: 'wilda.joseph@tome' }];
    const msgs = {
      d1: [{ de_moi: false, texte: 'Bonjour ! Avez-vous terminé l’exercice sur les fonctions affines ?', date: t(300), lu: true },
           { de_moi: true, texte: 'Oui madame, je l’ai rendu ce matin.', date: t(280), lu: true },
           { de_moi: false, texte: 'Très bien. Pensez à relire le chapitre 4 avant jeudi.', date: t(40), lu: false }],
      d2: [{ de_moi: false, texte: 'Les résultats du concours seront publiés vendredi.', date: t(1500), lu: true }],
      g_demo: [{ systeme: true, texte: 'Kervens Bien-Aimé a créé le groupe « Révisions NS4 ».', date: t(200) },
               { de_moi: false, expediteur: 'Kervens Bien-Aimé', texte: 'On révise la chimie ensemble samedi ?', date: t(190), lu: true },
               { de_moi: false, expediteur: 'Wilda Joseph', texte: 'Oui ! À la bibliothèque à 10 h.', date: t(60), lu: false }],
      annonces: [{ de_moi: false, titre: 'Nouvelle histoire : Le tambour de Ti Jan', texte: 'Un nouveau conte est arrivé dans la Bibliothèque.', lien: 'serie.html?s=le-tambour-de-ti-jan', date: t(900), lu: false }]
    };
    const groupes = { g_demo: { nom: 'Révisions NS4', membres: ['d3', 'd4'] } };
    const avec = id => groupes[id] ? { id, name: groupes[id].nom, role: 'groupe', membres: groupes[id].membres.length + 1 } : id === 'annonces' ? { id, name: 'Nouveautés Tòme', role: 'annonce' } : people.find(p => p.id === id);
    return {
      async conversations() {
        const conversations = Object.entries(msgs).map(([id, m]) => {
          const last = m[m.length - 1];
          return { id, groupe: !!groupes[id], annonces: id === 'annonces', avec: avec(id), dernier: { texte: last.titre || ((last.expediteur && !last.de_moi ? last.expediteur.split(' ')[0] + ' : ' : '') + last.texte), date: last.date, de_moi: !!last.de_moi }, non_lus: m.filter(x => !x.de_moi && !x.systeme && !x.lu).length };
        }).sort((a, b) => b.dernier.date.localeCompare(a.dernier.date));
        return { conversations, non_lus: conversations.reduce((s, c) => s + c.non_lus, 0), retention_heures: 24 };
      },
      async thread(id) { return { messages: (msgs[id] || []).map((m, i) => ({ id: id + '|' + i, ...m })), groupe: groupes[id] ? { id, nom: groupes[id].nom, admin: true } : undefined }; },
      async send(conv, texte) {
        const id = conv.id || conv.avec.id;
        (msgs[id] = msgs[id] || []).push({ de_moi: true, texte, date: new Date().toISOString(), lu: false });
        return { message: { conversation: id } };
      },
      async read(id) { (msgs[id] || []).forEach(m => { if (!m.de_moi) m.lu = true; }); },
      async garder(m, val) { const [c, i] = m.id.split('|'); msgs[c][+i].garder = val; },
      async search(q) { const n = q.toLowerCase(); return { resultats: people.filter(p => p.name.toLowerCase().includes(n) || p.adresse.startsWith(n)) }; },
      async creerGroupe(nom, membres) { const id = 'g_' + Date.now(); groupes[id] = { nom, membres }; msgs[id] = [{ systeme: true, texte: `Vous avez créé le groupe « ${nom} ».`, date: new Date().toISOString() }]; return { groupe: { conversation: id, nom } }; },
      async groupe(id) { const g = groupes['g_' + id] || groupes[id]; return { groupe: { id, nom: g.nom, admin: true, membres: [{ id: 'moi', name: 'Vous', moi: true, admin: true }, ...g.membres.map(m => ({ ...people.find(p => p.id === m) }))] } }; },
      async ajouter(id, ids) { (groupes['g_' + id] || groupes[id]).membres.push(...ids); },
      async retirer(id, uid) { const g = groupes['g_' + id] || groupes[id]; if (uid === 'moi') { delete groupes['g_' + id]; delete msgs['g_' + id]; } else g.membres = g.membres.filter(x => x !== uid); },
      async renommer(id, nom) { (groupes['g_' + id] || groupes[id]).nom = nom; }
    };
  })();
  const API = {
    conversations: () => Auth.api('/api/messages/conversations'),
    thread: id => Auth.api('/api/messages/conversations/' + encodeURIComponent(id)),
    send: (conv, texte) => Auth.api('/api/messages', { method: 'POST', body: conv.groupe ? { conversation: conv.id, texte } : { destinataire_id: conv.avec.id, texte } }),
    read: id => Auth.api('/api/messages/conversations/' + encodeURIComponent(id) + '/lu', { method: 'POST' }),
    search: q => Auth.api('/api/utilisateurs/recherche?q=' + encodeURIComponent(q)),
    garder: (m, val) => Auth.api('/api/messages/' + encodeURIComponent(m.id) + '/garder', { method: 'POST', body: { garder: val, conversation: current?.id } }),
    creerGroupe: (nom, membres) => Auth.api('/api/groupes', { method: 'POST', body: { nom, membres } }),
    groupe: id => Auth.api('/api/groupes/' + encodeURIComponent(id)),
    ajouter: (id, membres) => Auth.api(`/api/groupes/${encodeURIComponent(id)}/membres`, { method: 'POST', body: { membres } }),
    retirer: (id, uid) => Auth.api(`/api/groupes/${encodeURIComponent(id)}/membres/${encodeURIComponent(uid)}`, { method: 'DELETE' }),
    renommer: (id, nom) => Auth.api('/api/groupes/' + encodeURIComponent(id), { method: 'PUT', body: { nom } })
  };
  const src = demo ? DEMO : API;
  if (demo) $('#chat-demo').hidden = false;
  const me = Auth.user();
  if (me && me.adresse) { const a = $('#my-address'); a.querySelector('strong').textContent = me.adresse; a.hidden = false; }

  /* ---------- Son ---------- */
  const sonBtn = $('#son-toggle');
  const majSon = () => { const on = Son.actif(); sonBtn.textContent = on ? '🔔 Son activé' : '🔕 Son coupé'; sonBtn.setAttribute('aria-pressed', on); };
  sonBtn.addEventListener('click', () => { Son.basculer(); majSon(); if (Son.actif()) Son.reception(); });
  majSon();

  /* ---------- État ---------- */
  let convs = [], current = null, lastThreadSig = '', totalNonLus = null;
  const ROLE = { eleve: 'Élève', enseignant: 'Enseignant·e', ecole: 'École', partenaire: 'Partenaire' };
  const initials = n => (n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('');
  const when = iso => {
    const d = new Date(iso), n = new Date();
    if (d.toDateString() === n.toDateString()) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };
  const showError = msg => { const e = $('#chat-error'); e.textContent = msg; e.hidden = !msg; };
  const avatar = (el, c) => {
    el.textContent = c.annonces ? '★' : c.groupe ? '' : initials(c.avec.name);
    if (c.groupe) el.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14c2.6 0 4.4 1.6 5 4"/></svg>';
    el.classList.toggle('group', !!c.groupe); el.classList.toggle('news', !!c.annonces);
  };

  /* ---------- Liste ---------- */
  async function loadConversations() {
    try {
      const data = await src.conversations();
      convs = data.conversations;
      // la conversation ouverte sonne de son côté (loadThread) : on ne compte que les autres
      const autres = convs.filter(c => !current || c.id !== current.id).reduce((s, c) => s + c.non_lus, 0);
      if (totalNonLus !== null && autres > totalNonLus) Son.reception();
      totalNonLus = autres;
      document.title = (data.non_lus ? `(${data.non_lus}) ` : '') + 'Messagerie | Tòme';
      const note = $('#retention-note');
      const h = data.retention_heures;
      if (h && note) { note.textContent = `Les messages disparaissent ${h % 24 ? 'après ' + h + ' heures' : h === 24 ? 'au bout de 24 heures' : 'après ' + h / 24 + ' jours'}, sauf ceux que vous gardez (☆).`; note.hidden = false; }
      renderList(); showError('');
    } catch (e) { showError(e.message); }
  }
  function renderList() {
    listEl.innerHTML = '';
    if (!convs.length) { listEl.innerHTML = '<p class="chat-empty">Aucune conversation. Recherchez une personne ci-dessus pour lui écrire, ou créez un groupe.</p>'; return; }
    convs.forEach(c => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'conv' + (current && current.id === c.id ? ' on' : '') + (c.non_lus ? ' unread' : '');
      b.innerHTML = '<span class="avatar"></span><span class="grow"><span class="row1"><strong></strong><time></time></span><span class="row2"><span class="txt"></span><span class="badge"></span></span></span>';
      avatar(b.querySelector('.avatar'), c);
      b.querySelector('strong').textContent = c.avec.name;
      b.querySelector('time').textContent = when(c.dernier.date);
      b.querySelector('.txt').textContent = (c.dernier.de_moi ? 'Vous : ' : '') + c.dernier.texte;
      const badge = b.querySelector('.badge');
      if (c.non_lus) badge.textContent = c.non_lus; else badge.remove();
      b.addEventListener('click', () => open(c));
      listEl.appendChild(b);
    });
  }

  /* ---------- Fil ---------- */
  async function open(conv) {
    current = { id: conv.id, avec: conv.avec, groupe: !!conv.groupe, annonces: !!conv.annonces };
    if (totalNonLus !== null) totalNonLus = convs.filter(c => c.id !== conv.id).reduce((s, c) => s + c.non_lus, 0);
    lastThreadSig = '';
    chat.classList.add('show-thread');
    headEl.innerHTML = '<button type="button" class="back" aria-label="Retour">←</button><span class="avatar"></span><div class="grow"><strong></strong><span class="role"></span></div>';
    avatar(headEl.querySelector('.avatar'), current);
    headEl.querySelector('strong').textContent = conv.avec.name;
    headEl.querySelector('.role').textContent = current.groupe ? `Groupe · ${conv.avec.membres || ''} membres` : current.annonces ? 'Nouvelles histoires et annonces de l’équipe Tòme' : [ROLE[conv.avec.role], conv.avec.adresse].filter(Boolean).join(' · ');
    if (current.groupe) {
      const mb = document.createElement('button'); mb.type = 'button'; mb.className = 'tbtn'; mb.textContent = 'Membres';
      mb.addEventListener('click', ouvrirMembres); headEl.appendChild(mb);
    }
    headEl.querySelector('.back').addEventListener('click', () => { chat.classList.remove('show-thread'); current = null; renderList(); });
    form.hidden = current.annonces;
    threadEl.innerHTML = '<p class="chat-empty">Chargement…</p>';
    renderList();
    await loadThread(true);
    if (!current?.annonces && matchMedia('(pointer: fine)').matches) input.focus();
  }
  async function loadThread(first) {
    if (!current) return;
    if (!current.id) { threadEl.innerHTML = '<p class="chat-empty">Écrivez votre premier message à ' + esc(current.avec.name) + '.</p>'; return; }
    try {
      const { messages } = await src.thread(current.id);
      const sig = messages.map(m => m.id + (m.lu ? m.lu : 0) + (m.garder ? 1 : 0)).join('|');
      if (sig !== lastThreadSig) {
        const nouveaux = !first && lastThreadSig && messages.length && !messages[messages.length - 1].de_moi && !lastThreadSig.includes(messages[messages.length - 1].id);
        lastThreadSig = sig;
        const atBottom = threadEl.scrollHeight - threadEl.scrollTop - threadEl.clientHeight < 80;
        threadEl.innerHTML = '';
        let day = '', prev = null;
        messages.forEach(m => {
          const d = new Date(m.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
          if (d !== day) { day = d; prev = null; const sep = document.createElement('div'); sep.className = 'day'; sep.textContent = d.charAt(0).toUpperCase() + d.slice(1); threadEl.appendChild(sep); }
          if (m.systeme) { const s = document.createElement('div'); s.className = 'sys'; s.textContent = m.texte; threadEl.appendChild(s); prev = null; return; }
          const el = document.createElement('div');
          el.className = 'bubble ' + (m.de_moi ? 'me' : 'them') + (current.annonces ? ' news' : '');
          const showName = current.groupe && !m.de_moi && prev !== m.expediteur;
          el.innerHTML = (showName ? '<span class="who"></span>' : '') + (m.titre ? '<strong class="ttl"></strong>' : '') + '<p></p>' + (m.lien ? '<a class="tbtn primary" style="margin-top:8px;display:inline-flex;">Lire</a>' : '') + '<time></time>' + (current.annonces ? '' : '<button type="button" class="keep"></button>');
          if (showName) el.querySelector('.who').textContent = m.expediteur;
          if (m.titre) el.querySelector('.ttl').textContent = m.titre;
          if (m.lien) el.querySelector('a').href = m.lien;
          el.querySelector('p').textContent = m.texte;
          prev = m.de_moi ? null : m.expediteur;
          const kb = el.querySelector('.keep');
          if (kb) {
            kb.textContent = m.garder ? '★' : '☆';
            kb.title = m.garder ? 'Message gardé (ne sera pas effacé)' : 'Garder ce message';
            kb.setAttribute('aria-pressed', m.garder ? 'true' : 'false');
            if (m.garder) el.classList.add('kept');
            kb.addEventListener('click', async () => {
              kb.disabled = true;
              try { await src.garder(m, !m.garder); lastThreadSig = ''; await loadThread(false); }
              catch (e) { showError(e.message); kb.disabled = false; }
            });
          }
          const heure = new Date(m.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
          let etat = '';
          if (m.de_moi) etat = current.groupe ? (m.lus_sur ? (m.lu ? ` · Vu par ${m.lu}/${m.lus_sur}` : ' · Envoyé') : '') : (m.lu ? ' · Lu' : ' · Envoyé');
          el.querySelector('time').textContent = heure + etat;
          threadEl.appendChild(el);
        });
        if (first || atBottom) threadEl.scrollTop = threadEl.scrollHeight;
        if (nouveaux) Son.reception();
      }
      if (messages.some(m => !m.de_moi && !m.systeme && !m.lu) || (current.groupe && (convs.find(x => x.id === current.id)?.non_lus))) {
        await src.read(current.id);
        const c = convs.find(x => x.id === current.id);
        if (c && c.non_lus) { c.non_lus = 0; renderList(); }
      }
    } catch (e) { showError(e.message); }
  }

  /* ---------- Envoi ---------- */
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const texte = input.value.trim();
    if (!texte || !current || current.annonces) return;
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    const pending = document.createElement('div');
    pending.className = 'bubble me pending';
    pending.innerHTML = '<p></p><time>Envoi…</time>';
    pending.querySelector('p').textContent = texte;
    threadEl.querySelector('.chat-empty')?.remove();
    threadEl.appendChild(pending);
    threadEl.scrollTop = threadEl.scrollHeight;
    input.value = ''; autosize();
    try {
      const r = await src.send(current, texte);
      Son.envoi();
      if (!current.id) current.id = r.message.conversation;
      await loadConversations();
      lastThreadSig = '';
      await loadThread(false);
    } catch (err) {
      pending.classList.add('failed');
      pending.querySelector('time').textContent = 'Échec : ' + err.message;
      input.value = texte;
    } finally { btn.disabled = false; input.focus(); }
  });
  const autosize = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 160) + 'px'; };
  input.addEventListener('input', autosize);
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && matchMedia('(pointer: fine)').matches) { e.preventDefault(); form.requestSubmit(); } });

  /* ---------- Recherche de personnes (réutilisée par les groupes) ---------- */
  function recherche(inputEl, box, onPick, exclure = () => false) {
    let st;
    inputEl.addEventListener('input', () => {
      clearTimeout(st);
      const q = inputEl.value.trim();
      if (q.length < 2) { box.hidden = true; return; }
      st = setTimeout(async () => {
        try {
          const { resultats } = await src.search(q);
          const list = resultats.filter(p => !exclure(p));
          box.innerHTML = list.length ? '' : '<p class="chat-empty">Personne trouvée.</p>';
          list.forEach(p => {
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'conv';
            b.innerHTML = '<span class="avatar"></span><span class="grow"><strong></strong><span class="row2"><span class="txt"></span></span></span>';
            b.querySelector('.avatar').textContent = initials(p.name);
            b.querySelector('strong').textContent = p.name;
            b.querySelector('.txt').textContent = [p.adresse, ROLE[p.role]].filter(Boolean).join(' · ');
            b.addEventListener('click', () => { box.hidden = true; inputEl.value = ''; onPick(p); });
            box.appendChild(b);
          });
          box.hidden = false;
        } catch (e) { showError(e.message); }
      }, 300);
    });
  }
  recherche(searchEl, resultsEl, p => {
    const existing = convs.find(c => !c.groupe && c.avec.id === p.id);
    open(existing || { id: null, avec: p });
  });

  /* ---------- Groupes ---------- */
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
  let choisis = [];
  const chips = () => {
    $('#g-chips').innerHTML = choisis.map((p, i) => `<span class="chip">${esc(p.name)} <button type="button" data-rm="${i}" aria-label="Retirer" style="background:none;border:none;cursor:pointer;">×</button></span>`).join('');
    $('#g-chips').querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { choisis.splice(+b.dataset.rm, 1); chips(); }));
  };
  recherche($('#g-search'), $('#g-results'), p => { choisis.push(p); chips(); $('#g-search').focus(); }, p => choisis.some(x => x.id === p.id));
  $('#new-group').addEventListener('click', () => { choisis = []; chips(); $('#g-nom').value = ''; $('#dlg-groupe').showModal(); $('#g-nom').focus(); });
  $('#g-create').addEventListener('click', async e => {
    const nom = $('#g-nom').value.trim();
    if (!nom) return showGErr('Donnez un nom au groupe.');
    if (!choisis.length) return showGErr('Ajoutez au moins une personne.');
    e.target.disabled = true;
    try {
      const r = await src.creerGroupe(nom, choisis.map(p => p.id));
      $('#dlg-groupe').close();
      await loadConversations();
      const c = convs.find(x => x.id === r.groupe.conversation);
      if (c) open(c);
    } catch (er) { showGErr(er.message); }
    finally { e.target.disabled = false; }
  });
  function showGErr(m) { let p = $('#g-err'); if (!p) { p = document.createElement('p'); p.id = 'g-err'; p.className = 'alert err show'; $('#g-create').before(p); } p.textContent = m; }

  const gid = () => current.id.replace(/^g_/, '');
  async function ouvrirMembres() {
    try {
      const { groupe: g } = await src.groupe(gid());
      $('#m-title').textContent = `${g.nom} · ${g.membres.length} membres`;
      $('#m-rename').hidden = !g.admin; $('#m-nom').value = g.nom;
      $('#m-add').hidden = !g.admin;
      $('#m-list').innerHTML = g.membres.map(u => `<div class="nb-item"><div class="grow"><div class="t">${esc(u.moi ? 'Vous' : u.name)}${u.admin ? ' <span class="chip">Responsable</span>' : ''}</div><div class="s">${esc([u.adresse, ROLE[u.role]].filter(Boolean).join(' · '))}</div></div>${g.admin && !u.moi ? `<button data-rmu="${esc(u.id)}">Retirer</button>` : ''}</div>`).join('');
      $('#m-list').querySelectorAll('[data-rmu]').forEach(b => b.addEventListener('click', async () => {
        if (!confirm('Retirer cette personne du groupe ?')) return;
        try { await src.retirer(gid(), b.dataset.rmu); ouvrirMembres(); lastThreadSig = ''; loadThread(false); } catch (e) { alert(e.message); }
      }));
      membresActuels = g.membres.map(u => u.id);
      if (!$('#dlg-membres').open) $('#dlg-membres').showModal();
    } catch (e) { showError(e.message); }
  }
  let membresActuels = [];
  recherche($('#m-search'), $('#m-results'), async p => {
    try { await src.ajouter(gid(), [p.id]); await ouvrirMembres(); lastThreadSig = ''; loadThread(false); } catch (e) { alert(e.message); }
  }, p => membresActuels.includes(p.id));
  $('#m-rename-btn').addEventListener('click', async () => {
    const nom = $('#m-nom').value.trim(); if (!nom) return;
    try { await src.renommer(gid(), nom); current.avec.name = nom; headEl.querySelector('strong').textContent = nom; await ouvrirMembres(); loadConversations(); lastThreadSig = ''; loadThread(false); } catch (e) { alert(e.message); }
  });
  $('#m-leave').addEventListener('click', async () => {
    if (!confirm('Quitter ce groupe ? Vous ne verrez plus ses messages.')) return;
    try { await src.retirer(gid(), 'moi'); $('#dlg-membres').close(); chat.classList.remove('show-thread'); current = null; headEl.innerHTML = '<p class="chat-empty" style="margin:0;">Choisissez une conversation.</p>'; threadEl.innerHTML = ''; form.hidden = true; loadConversations(); } catch (e) { alert(e.message); }
  });

  /* ---------- Rafraîchissement ---------- */
  loadConversations().then(() => {
    const want = new URLSearchParams(location.search).get('avec');
    const c = want && convs.find(x => x.avec.id === want || x.id === want);
    if (c) open(c);
  });
  setInterval(() => { if (!document.hidden) loadConversations(); }, 15000);
  setInterval(() => { if (!document.hidden && current && current.id) loadThread(false); }, 6000);
});
