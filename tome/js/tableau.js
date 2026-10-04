/* Tòme : tableau de bord personnel (chaque utilisateur voit ses propres données).
 * Sans connexion au serveur, la page garde ses données de démonstration. */
document.addEventListener('DOMContentLoaded', async () => {
  const $ = s => document.querySelector(s);
  const Auth = window.TomeAuth;
  const reel = $('#tb-reel'), demo = $('#tb-demo');
  if (!reel || !Auth.token() || Auth.isDemo()) return;
  const me = Auth.user() || {};
  const role = document.querySelector('.app')?.dataset.role || me.role;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = n => n === null || n === undefined ? '–' : Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
  const when = iso => { const d = new Date(iso), n = new Date(); return d.toDateString() === n.toDateString() ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); };
  const get = p => Auth.api(p).catch(() => null);
  const stat = (k, v, d, href) => `<${href ? `a href="${href}"` : 'div'} class="stat">` + `<div class="k">${k}</div><div class="v">${v}</div><div class="d">${d || ''}</div></${href ? 'a' : 'div'}>`;
  const panel = (titre, lien, corps, id = '') => `<div class="panel"${id ? ` id="${id}"` : ''}><div class="panel-head"><h2>${titre}</h2>${lien ? `<a href="${lien[0]}">${lien[1]}</a>` : ''}</div>${corps}</div>`;
  const row = (t, s, droite = '', href = '') => `<${href ? `a href="${href}"` : 'div'} class="row"><div class="grow"><div class="t">${t}</div>${s ? `<div class="s">${s}</div>` : ''}</div>${droite}</${href ? 'a' : 'div'}>`;
  const vide = t => `<p class="small" style="padding:6px 0;">${t}</p>`;

  reel.innerHTML = '<p class="chat-empty">Chargement de votre espace…</p>';
  reel.hidden = false; if (demo) demo.hidden = true;
  document.querySelectorAll('.demo-note').forEach(e => { e.hidden = true; });

  const [conv, espace] = await Promise.all([get('/api/messages/conversations'), get('/api/espace')]);
  if (!conv && !espace) {
    reel.innerHTML = '<div class="panel"><p class="chat-empty">Le serveur Tòme se réveille (cela peut prendre une minute la première fois). Rechargez la page dans un instant.</p></div>';
    return;
  }

  /* ---------- blocs communs ---------- */
  const nonLus = conv ? conv.non_lus : 0;
  const convs = conv ? conv.conversations : [];
  const blocMessages = panel('Messages récents', ['messagerie.html', 'Messagerie'],
    `<div class="list">${convs.slice(0, 4).map(c => row(esc(c.avec.name) + (c.non_lus ? ` <span class="chip accent">${c.non_lus}</span>` : ''), esc((c.dernier.de_moi ? 'Vous : ' : '') + c.dernier.texte), `<span class="s">${when(c.dernier.date)}</span>`, 'messagerie.html?avec=' + encodeURIComponent(c.id))).join('') || vide('Aucun message pour l’instant. Écrivez à un camarade ou créez un groupe dans la messagerie.')}</div>`);
  const carnets = espace ? espace.carnets : [], fichiers = espace ? espace.fichiers : [];
  const lim = espace ? espace.limites : { carnets: 10, fichiers: 10 };
  const blocAtelier = panel('Mon Atelier', ['atelier.html', 'Ouvrir'],
    `<div class="list">${[...carnets.map(c => ({ ...c, k: 'Carnet' })), ...fichiers.map(f => ({ ...f, k: 'Fichier' }))].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4)
      .map(x => row(esc(x.nom), `${x.k} · ${when(x.date)}`, '', x.k === 'Carnet' ? 'atelier-code.html' : (/\.(abk|xlsx|ods|csv)$/i.test(x.nom) ? 'abaque.html' : /\.(plm|docx)$/i.test(x.nom) ? 'plume.html' : 'atelier-code.html'))).join('')
      || vide('Rien d’enregistré pour l’instant. Vos carnets, classeurs et documents sauvegardés dans votre espace apparaîtront ici.')}</div>`);
  const lecture = (() => { try { return JSON.parse(localStorage.getItem('tome_lecture_v1') || '{}'); } catch (e) { return {}; } })();
  const lectures = Object.entries(lecture).sort((a, b) => b[1].date - a[1].date).slice(0, 3);
  const blocLecture = panel('Continuer la lecture', ['bibliotheque.html', 'Bibliothèque'],
    `<div class="list">${lectures.map(([k, v]) => { const [src, slug, ep] = k.split('/'); return `<a class="row" href="lecture.html?${src === 'c' ? 'c' : 's'}=${encodeURIComponent(slug)}&ep=${ep}"><div class="grow"><div class="t">${esc(v.titre || slug)}</div><div class="s" style="margin-bottom:8px;">Épisode ${esc(ep)}</div><div class="bar"><i style="width:${Math.round((v.pct || 0) * 100)}%"></i></div></div><span class="s" style="min-width:40px;text-align:right;">${Math.round((v.pct || 0) * 100)} %</span></a>`; }).join('')
      || vide('Commencez une histoire dans la Bibliothèque : vous la retrouverez ici.')}</div>`);

  let html = '';
  /* ---------- Élève ---------- */
  if (role === 'eleve') {
    const [notes, moi, achats, histoires] = await Promise.all([get('/api/notes'), get('/api/ecoles/moi'), get('/api/boutique/mes-achats'), get('/api/bibliotheque/soumissions/miennes')]);
    const bulletins = notes ? notes.releves : [];
    const dernier = bulletins[bulletins.length - 1];
    const ecole = moi && moi.rattachements.find(r => r.statut === 'valide' || r.statut === 'en_attente');
    const feuillets = achats ? achats.achats.filter(a => a.statut === 'paye') : [];
    const mesHist = histoires ? histoires.soumissions : [];
    html += `<div class="stats">
      ${stat('Messages non lus', nonLus, nonLus ? 'à lire' : 'tout est lu', 'messagerie.html')}
      ${stat('Dernière moyenne', dernier ? `${fmt(dernier.moyenne)}<small style="font-size:16px;color:var(--muted);"> / ${dernier.echelle}</small>` : '–', dernier ? `${esc(dernier.periode)}${dernier.rang ? ` · ${dernier.rang}${dernier.rang === 1 ? 'er' : 'e'} sur ${dernier.effectif}` : ''}` : 'aucun bulletin', 'mes-notes.html')}
      ${stat('Carnets', `${carnets.length}<small style="font-size:16px;color:var(--muted);"> / ${lim.carnets}</small>`, 'dans votre espace', 'atelier-code.html')}
      ${stat('Feuillets du bac', feuillets.length, feuillets.length ? 'achetés' : 'aucun pour l’instant', 'feuillets.html')}
    </div>`;
    const ST = { valide: ['ok', 'Confirmé'], en_attente: ['gold', 'En attente'] };
    const blocEcole = panel('Mon école', ['mes-notes.html', 'Mes notes'], ecole
      ? `<div class="list">${row(esc(ecole.ecole.nom), esc([ecole.classe, ecole.ecole.commune].filter(Boolean).join(' · ')), `<span class="chip ${ST[ecole.statut][0]}">${ST[ecole.statut][1]}</span>`)}${dernier ? row(`Bulletin : ${esc(dernier.periode)} ${esc(dernier.annee)}`, `Moyenne ${fmt(dernier.moyenne)} / ${dernier.echelle} · classe ${fmt(dernier.moyenne_classe)}`, '', 'mes-notes.html') : ''}</div>`
      : vide('Vous n’êtes rattaché·e à aucune école. Choisissez la vôtre dans <a href="mes-notes.html" style="color:var(--accent);font-weight:600;">Mes notes</a> pour recevoir vos bulletins.'));
    const STH = { en_attente: ['gold', 'En relecture'], acceptee: ['ok', 'Publié'], refusee: ['accent', 'À corriger'] };
    const blocHist = panel('Mes histoires', ['publier.html', 'Publier'],
      `<div class="list">${mesHist.slice(0, 3).map(s => row(esc(s.serie_titre) + ' · ' + esc(s.titre), s.type === 'conte' ? 'Conte' : 'Webtoon', `<span class="chip ${(STH[s.statut] || ['', ''])[0]}">${(STH[s.statut] || ['', esc(s.statut)])[1]}</span>`, 'publier.html')).join('') || vide('Écrivez un conte ou un webtoon : après relecture, il sera lu par toute la communauté.')}</div>`);
    html += `<div class="panels"><div class="stack">${blocMessages}${blocLecture}${blocHist}</div><div class="stack">${blocEcole}${blocAtelier}</div></div>`;
  }

  /* ---------- École ---------- */
  else if (role === 'ecole') {
    const g = await get('/api/ecoles/gestion');
    if (!g) {
      html += `<div class="panel" style="margin-bottom:16px;"><p class="chat-empty">Votre compte école est en cours de vérification par l’équipe Tòme. Dès qu’il sera validé, vous verrez ici vos élèves et vos bulletins. Vous recevrez un message.</p></div>`;
      html += `<div class="panels"><div class="stack">${blocMessages}</div><div class="stack">${blocAtelier}</div></div>`;
    } else {
      const valides = g.eleves.filter(e => e.statut === 'valide'), attente = g.eleves.filter(e => e.statut === 'en_attente');
      const classes = new Set(valides.map(e => e.classe).filter(Boolean));
      html += `<div class="stats">
        ${stat('Élèves confirmés', valides.length, classes.size ? `${classes.size} classe${classes.size > 1 ? 's' : ''}` : '', 'gestion-ecole.html')}
        ${stat('Demandes à confirmer', attente.length, attente.length ? 'en attente' : 'aucune', 'gestion-ecole.html')}
        ${stat('Bulletins publiés', g.releves.length, g.releves[0] ? `dernier : ${esc(g.releves[0].periode)}` : '', 'gestion-ecole.html')}
        ${stat('Messages non lus', nonLus, '', 'messagerie.html')}
      </div>`;
      const blocAttente = panel('Demandes à confirmer', ['gestion-ecole.html', 'Gérer'], `<div class="list">${attente.slice(0, 5).map(e => row(esc(e.nom), esc([e.adresse, e.classe].filter(Boolean).join(' · ')), '<span class="chip gold">En attente</span>', 'gestion-ecole.html')).join('') || vide('Aucune demande en attente.')}</div>`);
      const blocBull = panel('Derniers bulletins', ['gestion-ecole.html', 'Publier'], `<div class="list">${g.releves.slice(0, 4).map(r => row(`${esc(r.periode)} ${esc(r.annee)}`, `${esc(r.classe || 'Toutes les classes')} · ${r.eleves} élèves`, `<span class="s">moy. ${fmt(r.moyenne_classe)} / ${r.echelle}</span>`, 'gestion-ecole.html')).join('') || vide('Aucun bulletin publié pour l’instant.')}</div>`);
      html += `<div class="panels"><div class="stack">${blocAttente}${blocBull}</div><div class="stack">${blocMessages}</div></div>`;
    }
  }

  /* ---------- Enseignant et partenaire ---------- */
  else {
    const groupes = convs.filter(c => c.groupe).length;
    html += `<div class="stats">
      ${stat('Messages non lus', nonLus, '', 'messagerie.html')}
      ${stat('Conversations', convs.filter(c => !c.annonces).length, groupes ? `dont ${groupes} groupe${groupes > 1 ? 's' : ''}` : '', 'messagerie.html')}
      ${stat('Carnets', `${carnets.length}<small style="font-size:16px;color:var(--muted);"> / ${lim.carnets}</small>`, '', 'atelier-code.html')}
      ${stat('Fichiers', `${fichiers.length}<small style="font-size:16px;color:var(--muted);"> / ${lim.fichiers}</small>`, '', 'atelier.html')}
    </div>`;
    const raccourcis = panel('Raccourcis', null, `<div class="list">
      ${row('Encyclopédie', 'Les articles pour vos cours', '', 'encyclopedie.html')}
      ${row('Bibliothèque', 'Contes et webtoons', '', 'bibliotheque.html')}
      ${row('Atelier', 'Code, Abaque et Mesure, Plume', '', 'atelier.html')}
      ${role === 'partenaire' ? row('Missions', 'Bientôt : proposez des missions rémunérées aux élèves', '', 'missions.html') : row('Tòme IA', 'Préparer une leçon, des exercices', '', 'tome-ia.html')}
    </div>`);
    html += `<div class="panels"><div class="stack">${blocMessages}${blocAtelier}</div><div class="stack">${raccourcis}${blocLecture}</div></div>`;
  }

  reel.innerHTML = html;
});
