/* Tòme : Bibliothèque (webtoons et contes) : catalogue, série, lecteur, publication et modération. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const CFG = window.TOME_CONFIG || {};
  const TOME = window.TOME_BIBLIOTHEQUE || [];
  const ROOT = document.body.dataset.root || '';
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nf = n => Number(n || 0).toLocaleString('fr-FR');
  const lectures = n => `${nf(n)} lecture${n > 1 ? 's' : ''}`;
  const PROG = 'tome_lecture_v1';
  const prog = { get() { try { return JSON.parse(localStorage.getItem(PROG) || '{}'); } catch (e) { return {}; } }, set(v) { try { localStorage.setItem(PROG, JSON.stringify(v)); } catch (e) {} } };
  const toast = (msg, isErr) => {
    let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.className = 'toast show' + (isErr ? ' err' : ''); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3500);
  };

  /* Appels publics (sans compte) à l'API ; renvoient null si l'API n'est pas disponible */
  async function pub(path, opts = {}) {
    try {
      const headers = { Accept: 'application/json' };
      const tk = window.TomeAuth && TomeAuth.token();
      if (tk && tk !== 'demo-token') headers.Authorization = 'Bearer ' + tk;
      if (opts.body) headers['Content-Type'] = 'application/json';
      const res = await fetch((CFG.apiBase || '') + path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) { return null; }
  }
  const tomeCover = s => s.couverture ? `${ROOT}bibliotheque/${s.slug}/${s.couverture}` : null;
  const coverHtml = (title, src) => src ? `<img src="${esc(src)}" alt="" loading="lazy">` : `<div class="cover-ph"><span>${esc(title)}</span></div>`;

  /* ================= Catalogue ================= */
  async function pageCatalogue() {
    const grid = $('#lib-grid'), grid2 = $('#lib-com'), filters = $('#lib-filters'), search = $('#lib-search');
    let active = 'tous';
    const keys = TOME.flatMap(s => s.episodes.filter(e => e.publie).map(e => `t/${s.slug}/${e.num}`));
    const counts = (await pub('/api/bibliotheque/lectures?cles=' + encodeURIComponent(keys.join(','))))?.lectures || {};
    const com = (await pub('/api/bibliotheque/communaute'))?.series || null;
    const items = [
      ...TOME.map(s => ({ src: 'tome', slug: s.slug, titre: s.titre, type: s.type, genre: s.genre, resume: s.resume, auteur: s.auteur, cover: tomeCover(s), nb: s.episodes.filter(e => e.publie).length, statut: s.statut, lect: s.episodes.reduce((t, e) => t + (counts[`t/${s.slug}/${e.num}`] || 0), 0) })),
      ...(com || []).map(s => ({ src: 'com', slug: s.slug, titre: s.titre, type: s.type, genre: s.genre, resume: s.resume, auteur: s.auteur, cover: s.type === 'webtoon' && s.episodes.length ? `${CFG.apiBase || ''}/api/bibliotheque/planche/${encodeURIComponent(s.slug)}/${s.episodes[0].num}/1` : null, nb: s.episodes.length, lect: s.lectures }))
    ];
    const card = it => `<a class="book" href="serie.html?${it.src === 'com' ? 'c' : 's'}=${encodeURIComponent(it.slug)}">
      <div class="cover">${coverHtml(it.titre, it.cover)}<span class="chip type">${it.type === 'conte' ? 'Conte' : 'Webtoon'}</span>${it.src === 'com' ? '<span class="chip com">Élèves</span>' : ''}</div>
      <div class="book-body"><h3>${esc(it.titre)}</h3><p>${esc(it.resume || '')}</p>
      <div class="meta"><span>${it.nb} épisode${it.nb > 1 ? 's' : ''}</span><span>${lectures(it.lect)}</span>${it.auteur ? `<span>par ${esc(it.auteur)}</span>` : ''}</div></div></a>`;
    function render() {
      const q = (search.value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const ok = it => (active === 'tous' || it.type === active) && (!q || (it.titre + ' ' + (it.resume || '') + ' ' + (it.genre || '') + ' ' + (it.auteur || '')).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q));
      const t = items.filter(i => i.src === 'tome' && ok(i)), c = items.filter(i => i.src === 'com' && ok(i));
      grid.innerHTML = t.map(card).join('') || '<p class="small">Aucune série ne correspond.</p>';
      grid2.innerHTML = com === null ? '<p class="small">Les créations des élèves s’affichent quand le site est relié au serveur Tòme.</p>'
        : c.map(card).join('') || '<p class="small">Pas encore de création publiée. Soyez la première ou le premier : <a href="publier.html" style="color:var(--accent);font-weight:600;">publiez un chapitre</a>.</p>';
    }
    $$('[data-type]', filters).forEach(b => b.addEventListener('click', () => { active = b.dataset.type; $$('[data-type]', filters).forEach(x => x.classList.toggle('on', x === b)); render(); }));
    search.addEventListener('input', render);
    render();
    // Continuer la lecture
    const p = prog.get(), last = Object.entries(p).sort((a, b) => b[1].date - a[1].date)[0];
    if (last) {
      const [key, v] = last;
      const box = $('#lib-continue');
      box.innerHTML = `<a class="card continue" href="lecture.html?${key.startsWith('c/') ? 'c' : 's'}=${encodeURIComponent(key.split('/')[1])}&ep=${key.split('/')[2]}"><span class="eyebrow">Continuer la lecture</span><h3>${esc(v.titre || '')}</h3><div class="bar"><i style="width:${Math.round((v.pct || 0) * 100)}%"></i></div></a>`;
      box.hidden = false;
    }
  }

  /* ================= Fiche d'une série ================= */
  async function pageSerie() {
    const q = new URLSearchParams(location.search), slug = q.get('s') || q.get('c'), isCom = q.has('c');
    const box = $('#serie');
    let s;
    if (isCom) {
      const list = (await pub('/api/bibliotheque/communaute'))?.series || [];
      const x = list.find(y => y.slug === slug);
      if (x) s = { ...x, episodes: x.episodes.map(e => ({ ...e, publie: true })), cover: x.type === 'webtoon' && x.episodes.length ? `${CFG.apiBase || ''}/api/bibliotheque/planche/${encodeURIComponent(x.slug)}/${x.episodes[0].num}/1` : null };
    } else {
      const x = TOME.find(y => y.slug === slug);
      if (x) {
        const keys = x.episodes.map(e => `t/${x.slug}/${e.num}`);
        const c = (await pub('/api/bibliotheque/lectures?cles=' + encodeURIComponent(keys.join(','))))?.lectures || {};
        s = { ...x, cover: tomeCover(x), episodes: x.episodes.map(e => ({ ...e, lectures: c[`t/${x.slug}/${e.num}`] || 0 })) };
        s.lectures = s.episodes.reduce((t, e) => t + e.lectures, 0);
      }
    }
    if (!s) { box.innerHTML = '<p class="chat-empty">Série introuvable.</p>'; return; }
    document.title = s.titre + ' | Bibliothèque Tòme';
    const p = prog.get(), prefix = (isCom ? 'c/' : 't/') + slug + '/';
    const firstUnread = s.episodes.find(e => e.publie && !(p[prefix + e.num] && p[prefix + e.num].pct > 0.9)) || s.episodes.find(e => e.publie);
    const link = e => `lecture.html?${isCom ? 'c' : 's'}=${encodeURIComponent(slug)}&ep=${e.num}`;
    box.innerHTML = `<div class="serie-head">
        <div class="cover big">${coverHtml(s.titre, s.cover)}</div>
        <div><span class="eyebrow">${s.type === 'conte' ? 'Conte' : 'Webtoon'}${isCom ? ' · Création d’élève' : ''}</span>
          <h1>${esc(s.titre)}</h1>
          <div class="chips">${s.genre ? `<span class="chip">${esc(s.genre)}</span>` : ''}${s.public ? `<span class="chip">${esc(s.public)}</span>` : ''}${s.statut ? `<span class="chip gold">${esc(s.statut)}</span>` : ''}<span class="chip accent">${lectures(s.lectures)}</span></div>
          <p class="lead">${esc(s.resume || '')}</p>
          ${s.auteur ? `<p class="small">par ${esc(s.auteur)}</p>` : ''}
          ${firstUnread ? `<a class="btn btn-primary" href="${link(firstUnread)}" style="margin-top:18px;">${p[prefix + firstUnread.num] ? 'Reprendre' : 'Commencer'} : épisode ${firstUnread.num}</a>` : ''}
        </div></div>
      <h2 class="ep-title">Épisodes</h2>
      <div class="episodes">${s.episodes.map(e => e.publie ? `<a class="episode" href="${link(e)}"><span class="num">${e.num}</span><span class="grow"><strong>${esc(e.titre)}</strong><span class="small">${e.lectures !== undefined ? lectures(e.lectures) : ''}</span></span>${p[prefix + e.num] ? `<span class="chip ${p[prefix + e.num].pct > 0.9 ? 'ok' : ''}">${p[prefix + e.num].pct > 0.9 ? 'Lu' : 'En cours'}</span>` : ''}</a>`
        : `<div class="episode soon"><span class="num">${e.num}</span><span class="grow"><strong>${esc(e.titre)}</strong></span><span class="chip gold">Bientôt</span></div>`).join('')}</div>`;
  }

  /* ================= Lecteur ================= */
  async function pageLecture() {
    const q = new URLSearchParams(location.search), slug = q.get('s') || q.get('c'), isCom = q.has('c'), num = Number(q.get('ep') || 1);
    const page = $('#reader'), head = $('#reader-head'), foot = $('#reader-foot');
    const key = (isCom ? 'c/' : 't/') + slug + '/' + num;
    let serie, ep, content = '';
    if (isCom) {
      const d = await pub(`/api/bibliotheque/communaute/${encodeURIComponent(slug)}/${num}`);
      if (!d) { page.innerHTML = '<p class="chat-empty">Épisode introuvable ou serveur indisponible.</p>'; return; }
      serie = d.serie; ep = d.episode;
      content = serie.type === 'conte'
        ? `<div class="tale">${ep.texte.split(/\n{2,}/).map(par => `<p>${esc(par).replace(/\n/g, '<br>')}</p>`).join('')}</div>`
        : Array.from({ length: ep.pages }, (_, i) => `<img src="${CFG.apiBase || ''}/api/bibliotheque/planche/${encodeURIComponent(slug)}/${num}/${i + 1}" alt="Planche ${i + 1}" loading="${i < 2 ? 'eager' : 'lazy'}">`).join('');
      serie.episodes = serie.episodes.map(e => ({ ...e, publie: true }));
    } else {
      serie = TOME.find(y => y.slug === slug);
      ep = serie && serie.episodes.find(e => e.num === num && e.publie);
      if (!ep) { page.innerHTML = '<p class="chat-empty">Épisode introuvable.</p>'; return; }
      const dir = `${ROOT}bibliotheque/${slug}/`;
      if (serie.type === 'conte') {
        await new Promise((res, rej) => { const s = document.createElement('script'); s.src = dir + 'episode-' + String(num).padStart(2, '0') + '.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }).catch(() => {});
        content = window.TOME_EPISODE ? `<div class="tale">${window.TOME_EPISODE.html}</div>` : '<p class="chat-empty">Texte introuvable.</p>';
      } else {
        const ext = ep.extension || 'jpg';
        content = Array.from({ length: ep.pages }, (_, i) => `<img src="${dir}episode-${String(num).padStart(2, '0')}/${String(i + 1).padStart(3, '0')}.${ext}" alt="Planche ${i + 1}" loading="${i < 2 ? 'eager' : 'lazy'}">`).join('');
      }
    }
    document.title = `${ep.titre} | ${serie.titre}`;
    const pubs = serie.episodes.filter(e => e.publie);
    const idx = pubs.findIndex(e => e.num === num), prev = pubs[idx - 1], next = pubs[idx + 1];
    const link = e => `lecture.html?${isCom ? 'c' : 's'}=${encodeURIComponent(slug)}&ep=${e.num}`;
    head.innerHTML = `<a href="serie.html?${isCom ? 'c' : 's'}=${encodeURIComponent(slug)}" class="back">← ${esc(serie.titre)}</a><div class="ep"><strong>Épisode ${num}</strong> · ${esc(ep.titre)}</div><span class="chip accent" id="reads">… lectures</span>`;
    page.className = 'reader ' + (serie.type === 'conte' ? 'is-tale' : 'is-webtoon');
    page.innerHTML = (serie.type === 'conte' ? `<h1 class="tale-title">${esc(ep.titre)}</h1>` : '') + content;
    foot.innerHTML = `${prev ? `<a class="btn btn-ghost" href="${link(prev)}">← Épisode ${prev.num}</a>` : '<span></span>'}${next ? `<a class="btn btn-primary" href="${link(next)}">Épisode ${next.num} →</a>` : `<a class="btn btn-ghost" href="serie.html?${isCom ? 'c' : 's'}=${encodeURIComponent(slug)}">Tous les épisodes</a>`}`;
    // Compteur : compté après quelques secondes de lecture
    const showReads = n => { $('#reads').textContent = lectures(n); };
    const initial = await pub('/api/bibliotheque/lectures?cles=' + encodeURIComponent(key));
    if (initial) showReads(initial.lectures[key] || 0); else $('#reads').hidden = true;
    setTimeout(async () => { const r = await pub('/api/bibliotheque/lecture', { method: 'POST', body: { cle: key } }); if (r) showReads(r.lectures); }, 4000);
    // Progression
    const p = prog.get();
    const saved = p[key];
    if (saved && saved.pct > 0.02 && saved.pct < 0.95) setTimeout(() => window.scrollTo(0, saved.pct * (document.documentElement.scrollHeight - innerHeight)), 300);
    let tick;
    window.addEventListener('scroll', () => {
      head.classList.toggle('hide', window.scrollY > 200 && window.scrollY > (window.__y || 0));
      window.__y = window.scrollY;
      clearTimeout(tick);
      tick = setTimeout(() => {
        const pct = Math.min(1, window.scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight));
        const all = prog.get(); all[key] = { pct, date: Date.now(), titre: `${serie.titre} · épisode ${num}` }; prog.set(all);
        $('#reader-progress').style.width = (pct * 100) + '%';
      }, 150);
    }, { passive: true });
  }

  /* ================= Publier (élèves) ================= */
  async function pagePublier() {
    if (!(window.TomeAuth && TomeAuth.token() && !TomeAuth.isDemo())) {
      $('#pub-form').hidden = true; $('#pub-login').hidden = false;
    }
    const mine = await pub('/api/bibliotheque/soumissions/miennes');
    const sel = $('#pub-serie');
    (mine?.series || []).forEach(s => sel.insertAdjacentHTML('beforeend', `<option value="${esc(s.slug)}" data-type="${s.type}">${esc(s.titre)} (${s.type === 'conte' ? 'conte' : 'webtoon'})</option>`));
    const syncType = () => {
      const isNew = sel.value === '';
      $('#pub-new').hidden = !isNew;
      const type = isNew ? $('input[name=type]:checked').value : sel.selectedOptions[0].dataset.type;
      $('#pub-images').hidden = type !== 'webtoon'; $('#pub-texte').hidden = type !== 'conte';
    };
    sel.addEventListener('change', syncType); $$('input[name=type]').forEach(r => r.addEventListener('change', syncType)); syncType();
    // Planches : compression et ordre
    const pages = [];
    const list = $('#pub-pages');
    const renderPages = () => {
      list.innerHTML = pages.map((p, i) => `<div class="page-thumb"><img src="${p.url}" alt=""><span>${i + 1}</span><div><button type="button" data-up="${i}" title="Monter">↑</button><button type="button" data-down="${i}" title="Descendre">↓</button><button type="button" data-del="${i}" title="Retirer">×</button></div></div>`).join('');
      $('#pub-count').textContent = pages.length ? `${pages.length} planche${pages.length > 1 ? 's' : ''} · ${Math.round(pages.reduce((t, p) => t + p.size, 0) / 1024)} Ko` : '';
      $$('[data-up]', list).forEach(b => b.onclick = () => { const i = +b.dataset.up; if (i > 0) { [pages[i - 1], pages[i]] = [pages[i], pages[i - 1]]; renderPages(); } });
      $$('[data-down]', list).forEach(b => b.onclick = () => { const i = +b.dataset.down; if (i < pages.length - 1) { [pages[i + 1], pages[i]] = [pages[i], pages[i + 1]]; renderPages(); } });
      $$('[data-del]', list).forEach(b => b.onclick = () => { pages.splice(+b.dataset.del, 1); renderPages(); });
    };
    $('#pub-files').addEventListener('change', async e => {
      const files = [...e.target.files].sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }));
      e.target.value = '';
      for (const f of files) {
        if (pages.length >= 20) { toast('20 planches maximum par chapitre.', true); break; }
        try { pages.push(await compress(f)); } catch (er) { toast(f.name + ' : image illisible.', true); }
      }
      renderPages();
    });
    $('#pub-form').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = $('#pub-send'), err = $('#pub-err');
      err.classList.remove('show');
      const isNew = sel.value === '';
      const type = isNew ? $('input[name=type]:checked').value : sel.selectedOptions[0].dataset.type;
      const body = { titre: $('#pub-titre').value.trim(), serie: isNew ? { titre: $('#pub-stitre').value.trim(), type, genre: $('#pub-genre').value.trim(), resume: $('#pub-resume').value.trim() } : { slug: sel.value } };
      if (type === 'conte') body.texte = $('#pub-text').value; else body.images = pages.map(p => p.url);
      btn.disabled = true; btn.textContent = 'Envoi en cours…';
      try {
        await TomeAuth.api('/api/bibliotheque/soumissions', { method: 'POST', body });
        toast('Chapitre envoyé ! Il sera relu par l’équipe avant publication.');
        $('#pub-form').reset(); pages.length = 0; renderPages(); syncType(); loadMine();
      } catch (er) { err.textContent = er.message; err.classList.add('show'); }
      finally { btn.disabled = false; btn.textContent = 'Envoyer pour relecture'; }
    });
    const STAT = { en_attente: ['gold', 'En relecture'], acceptee: ['ok', 'Publié'], refusee: ['accent', 'Refusé'] };
    async function loadMine() {
      const d = await pub('/api/bibliotheque/soumissions/miennes');
      const box = $('#pub-mine');
      if (!d) { box.innerHTML = '<p class="small">Connectez-vous pour voir vos envois.</p>'; return; }
      box.innerHTML = d.soumissions.length ? d.soumissions.map(s => `<div class="nb-item"><div class="grow"><div class="t">${esc(s.serie_titre)} · ${esc(s.titre)}</div><div class="s">${new Date(s.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}${s.motif ? ' · ' + esc(s.motif) : ''}</div></div>${s.publication ? `<a class="chip ok" href="lecture.html?c=${encodeURIComponent(s.publication.slug)}&ep=${s.publication.num}">Lire</a>` : `<span class="chip ${STAT[s.statut][0]}">${STAT[s.statut][1]}</span>`}</div>`).join('') : '<p class="small">Aucun envoi pour l’instant.</p>';
    }
    loadMine();
  }
  function compress(file) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const w = Math.min(1000, img.width), h = Math.round(img.height * w / img.width);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        let q = 0.85, url = c.toDataURL('image/jpeg', q);
        while (url.length * 0.75 > 950 * 1024 && q > 0.4) { q -= 0.1; url = c.toDataURL('image/jpeg', q); }
        if (url.length * 0.75 > 1024 * 1024) { rej(new Error('trop lourd')); return; }
        URL.revokeObjectURL(img.src);
        res({ url, size: Math.round(url.length * 0.75) });
      };
      img.onerror = rej;
      img.src = URL.createObjectURL(file);
    });
  }

  /* ================= Modération ================= */
  async function pageModeration() {
    const box = $('#mod-list'), view = $('#mod-view');
    async function load() {
      let d;
      try { d = await TomeAuth.api('/api/bibliotheque/moderation'); }
      catch (e) { box.innerHTML = `<p class="chat-empty">${esc(e.message)}</p>`; return; }
      $('#mod-count').textContent = d.en_attente.length ? `(${d.en_attente.length})` : '';
      box.innerHTML = d.en_attente.length ? d.en_attente.map(s => `<button class="conv" data-id="${s.id}"><span class="avatar">${s.type === 'conte' ? 'C' : 'W'}</span><span class="grow"><strong>${esc(s.serie_titre)} · ${esc(s.titre)}</strong><span class="txt">${esc(s.auteur_nom)} · ${new Date(s.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span></span></button>`).join('')
        : '<p class="chat-empty">Aucun chapitre en attente. Tout est à jour.</p>';
      $$('[data-id]', box).forEach(b => b.addEventListener('click', () => { $$('.conv', box).forEach(x => x.classList.toggle('on', x === b)); open(b.dataset.id); }));
      $('#mod-recent').innerHTML = d.recentes.map(s => `<div class="nb-item"><div class="grow"><div class="t">${esc(s.serie_titre)} · ${esc(s.titre)}</div><div class="s">${esc(s.auteur_nom)}${s.motif ? ' · ' + esc(s.motif) : ''}</div></div><span class="chip ${s.statut === 'acceptee' ? 'ok' : 'accent'}">${s.statut === 'acceptee' ? 'Accepté' : 'Refusé'}</span></div>`).join('') || '<p class="small">Aucune décision récente.</p>';
    }
    async function open(id) {
      view.innerHTML = '<p class="chat-empty">Chargement…</p>';
      const { soumission: s } = await TomeAuth.api('/api/bibliotheque/soumissions/' + id);
      const token = TomeAuth.token();
      let body;
      if (s.type === 'conte') body = `<div class="tale small-tale">${s.texte.split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}</div>`;
      else {
        body = '<div class="mod-pages" id="mod-pages"></div>';
      }
      view.innerHTML = `<header class="mod-head"><span class="eyebrow">${s.type === 'conte' ? 'Conte' : 'Webtoon'} · ${s.serie.nouvelle ? 'nouvelle série' : 'série existante'}</span><h2>${esc(s.serie.titre)} · ${esc(s.titre)}</h2><p class="small">par ${esc(s.auteur_nom)} (${esc(s.auteur_adresse || '')}) · ${new Date(s.date).toLocaleString('fr-FR')}</p>${s.serie.resume ? `<p>${esc(s.serie.resume)}</p>` : ''}</header>${body}
        <div class="mod-decide"><textarea id="mod-motif" rows="3" placeholder="Message pour l'élève (obligatoire en cas de refus)"></textarea><label class="check"><input type="checkbox" id="mod-annoncer" checked> Annoncer la publication à tous dans la messagerie</label><div><button class="btn btn-ghost" id="mod-no">Refuser</button><button class="btn btn-primary" id="mod-yes">Accepter et publier</button></div></div>`;
      if (s.type !== 'conte') {
        const wrap = $('#mod-pages');
        for (let i = 1; i <= s.pages; i++) {
          const res = await fetch(`${CFG.apiBase || ''}/api/bibliotheque/soumissions/${id}/planche/${i}`, { headers: { Authorization: 'Bearer ' + token } });
          if (res.ok) { const img = document.createElement('img'); img.src = URL.createObjectURL(await res.blob()); img.alt = 'Planche ' + i; wrap.appendChild(img); }
        }
      }
      const decide = async decision => {
        try {
          await TomeAuth.api('/api/bibliotheque/moderation/' + id, { method: 'POST', body: { decision, motif: $('#mod-motif').value.trim(), annoncer: $('#mod-annoncer').checked } });
          toast(decision === 'accepter' ? ($('#mod-annoncer').checked ? 'Chapitre publié et annoncé à tous. L’élève a été prévenu.' : 'Chapitre publié. L’élève a été prévenu.') : 'Chapitre refusé. L’élève a reçu votre message.');
          view.innerHTML = '<p class="chat-empty">Choisissez un chapitre à relire.</p>';
          load();
        } catch (e) { toast(e.message, true); }
      };
      $('#mod-yes').onclick = () => decide('accepter');
      $('#mod-no').onclick = () => decide('refuser');
    }
    load();
  }

  const PAGES = { catalogue: pageCatalogue, serie: pageSerie, lecture: pageLecture, publier: pagePublier, moderation: pageModeration };
  document.addEventListener('DOMContentLoaded', () => { const f = PAGES[document.body.dataset.page]; if (f) f(); });
})();
