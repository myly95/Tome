/* Tòme : script partagé
 *
 * Configuration :
 *   apiBase : URL du backend Express (laisser vide si le front est servi par le même serveur).
 *   demo    : true tant que le backend n'est pas branché. Les formulaires simulent alors
 *             une réponse et les espaces connectés s'ouvrent sans jeton. Passer à false en production.
 */
window.TOME_CONFIG = Object.assign({
  apiBase: '',
  demo: true,
  /* Pyodide (Python dans le navigateur). Pour un usage hors ligne, héberger ces fichiers sur votre serveur et changer l'URL. */
  pyodideBase: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/',
  /* webR (R dans le navigateur) et sql.js (SQLite dans le navigateur) */
  webrBase: 'https://webr.r-wasm.org/v0.6.0/',
  sqljsBase: 'https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/',
  routes: {
    login: '/api/auth/login',
    signup: '/api/auth/signup',
    me: '/api/auth/me'
  }
}, window.TOME_CONFIG || {});

const DASHBOARDS = {
  eleve: 'espace-eleve.html',
  enseignant: 'espace-enseignant.html',
  ecole: 'espace-ecole.html',
  partenaire: 'espace-partenaire.html'
};
const ROLE_LABELS = { eleve: 'Élève', enseignant: 'Enseignant·e', ecole: 'École', partenaire: 'Partenaire' };

/* Stockage sûr (peut être indisponible en navigation privée) */
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};

const Auth = {
  token() { return store.get('tome_token'); },
  user() { try { return JSON.parse(store.get('tome_user') || 'null'); } catch (e) { return null; } },
  save(token, user) { store.set('tome_token', token); store.set('tome_user', JSON.stringify(user)); },
  logout() {
    store.del('tome_token'); store.del('tome_user');
    location.href = (location.pathname.includes('/encyclopedie/') ? '../' : '') + 'connexion.html';
  },
  dashboardFor(role) { return DASHBOARDS[role] || 'index.html'; },

  /* Inscription et connexion. En mode démo, si l'API est absente, une réponse est simulée. */
  async request(path, body) {
    const cfg = window.TOME_CONFIG;
    let res;
    try {
      res = await fetch(cfg.apiBase + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch (err) {
      if (cfg.demo) return this.demoLogin(body);
      throw new Error('Impossible de joindre le serveur. Vérifiez votre connexion.');
    }
    if (cfg.demo && [404, 405, 501].includes(res.status)) return this.demoLogin(body);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.error || 'Une erreur est survenue.');
    return data;
  },
  async demoLogin(body) {
    await new Promise(r => setTimeout(r, 400));
    const name = body.prenom ? (body.prenom + ' ' + (body.nom || '')).trim() : (body.email || 'Invité').split('@')[0];
    const adresse = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '') + '@tome';
    return { token: 'demo-token', user: { id: 'demo', name, email: body.email, role: body.role || 'eleve', adresse } };
  },
  isDemo() { const t = this.token(); return window.TOME_CONFIG.demo && (!t || t === 'demo-token'); },

  /* Appel authentifié à l'API (JSON). Une session expirée renvoie vers la connexion. */
  async api(path, { method = 'GET', body } = {}) {
    const cfg = window.TOME_CONFIG;
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const t = this.token();
    if (t) headers.Authorization = 'Bearer ' + t;
    let res;
    try {
      res = await fetch(cfg.apiBase + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch (e) { throw new Error('Impossible de joindre le serveur. Vérifiez votre connexion.'); }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !cfg.demo) { this.logout(); throw new Error('Session expirée.'); }
    if (!res.ok) throw new Error(data.message || 'Une erreur est survenue.');
    return data;
  },

  /* À appeler sur chaque espace connecté */
  guard(expectedRole) {
    const cfg = window.TOME_CONFIG;
    let user = this.user();
    if (!this.token()) {
      if (!cfg.demo) { location.href = 'connexion.html'; return null; }
      user = { name: 'Invité', role: expectedRole || 'eleve' };
    }
    if (user && expectedRole && user.role && user.role !== expectedRole && !cfg.demo) {
      location.href = this.dashboardFor(user.role);
      return null;
    }
    return user;
  }
};
window.TomeAuth = Auth;

/* Espace personnel sur le serveur : carnets (.ipynb) et fichiers, avec limites. */
const Espace = {
  disponible() { return !!Auth.token() && !Auth.isDemo(); },
  liste() { return Auth.api('/api/espace'); },
  async lire(type, nom) {
    const res = await fetch(window.TOME_CONFIG.apiBase + `/api/espace/${type}/${encodeURIComponent(nom)}`, { headers: { Authorization: 'Bearer ' + Auth.token() } });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || 'Lecture impossible.'); }
    return new Uint8Array(await res.arrayBuffer());
  },
  enregistrerCarnet(nom, contenu) { return Auth.api('/api/espace/carnets/' + encodeURIComponent(nom), { method: 'PUT', body: { contenu } }); },
  enregistrerFichier(nom, octets) {
    let s = '';
    for (let i = 0; i < octets.length; i += 0x8000) s += String.fromCharCode.apply(null, octets.subarray(i, i + 0x8000));
    return Auth.api('/api/espace/fichiers/' + encodeURIComponent(nom), { method: 'PUT', body: { base64: btoa(s) } });
  },
  supprimer(type, nom) { return Auth.api(`/api/espace/${type}/${encodeURIComponent(nom)}`, { method: 'DELETE' }); }
};
window.TomeEspace = Espace;

document.addEventListener('DOMContentLoaded', () => {
  /* Année du pied de page */
  document.querySelectorAll('#yr, [data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });

  /* Menu mobile du site public */
  const nav = document.getElementById('nav');
  document.querySelectorAll('[data-menu-toggle]').forEach(b => b.addEventListener('click', () => nav && nav.classList.toggle('open')));
  document.querySelectorAll('.nav ul a').forEach(a => a.addEventListener('click', () => nav && nav.classList.remove('open')));

  /* Lien actif */
  const here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav ul a, .sidebar nav a').forEach(a => {
    if (a.getAttribute('href') === here) a.classList.add('active');
  });

  /* Apparition au défilement */
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach(el => io.observe(el));
  } else {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('in'));
  }

  /* Sons de la messagerie (synthétisés, aucun fichier à charger). Préférence gardée sur l'appareil. */
  const Son = (() => {
    let ctx = null;
    const KEY = 'tome_son';
    const actif = () => { try { return localStorage.getItem(KEY) !== 'off'; } catch (e) { return true; } };
    const unlock = () => { try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); } catch (e) {} };
    // les navigateurs n'autorisent le son qu'après un premier geste de la personne
    ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { once: true, capture: true }));
    function note(freq, start, dur, vol = 0.12, type = 'sine') {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, ctx.currentTime + start);
      g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      g.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + start + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur + 0.02);
    }
    const jouer = fn => { if (!actif()) return; unlock(); if (!ctx || ctx.state !== 'running') return; try { fn(); } catch (e) {} };
    return {
      actif,
      basculer() { try { localStorage.setItem(KEY, actif() ? 'off' : 'on'); } catch (e) {} return actif(); },
      /* envoi : petit glissement vers l'aigu */
      envoi: () => jouer(() => { note(660, 0, 0.09, 0.08, 'triangle'); note(990, 0.06, 0.12, 0.07, 'triangle'); }),
      /* réception : deux notes claires */
      reception: () => jouer(() => { note(880, 0, 0.18); note(1318.5, 0.12, 0.32); })
    };
  })();
  window.TomeSon = Son;

  /* Espace connecté : menu latéral mobile, déconnexion, identité */
  const app = document.querySelector('.app');
  if (app) {
    document.querySelectorAll('[data-app-menu]').forEach(b => b.addEventListener('click', () => app.classList.toggle('menu-open')));
    app.querySelector('.main')?.addEventListener('click', e => {
      if (app.classList.contains('menu-open') && !e.target.closest('[data-app-menu]')) app.classList.remove('menu-open');
    });
    document.querySelectorAll('[data-logout]').forEach(b => b.addEventListener('click', () => Auth.logout()));
    const user = Auth.guard(app.dataset.role);
    if (user) {
      const name = user.name || 'Invité';
      document.querySelectorAll('[data-user-name]').forEach(el => { el.textContent = name; });
      document.querySelectorAll('[data-user-first]').forEach(el => { el.textContent = name.split(' ')[0]; });
      document.querySelectorAll('[data-user-initials]').forEach(el => {
        el.textContent = name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('');
      });
      const role = app.dataset.role || user.role || 'eleve';
      document.querySelectorAll('[data-user-role]').forEach(el => { el.textContent = ROLE_LABELS[role] || ''; });
      document.querySelectorAll('[data-user-address]').forEach(el => { el.textContent = user.adresse || ''; el.title = user.adresse ? 'Votre adresse Tòme' : ''; });
      document.querySelectorAll('.sidebar a[href="mon-espace"]').forEach(a => { a.setAttribute('href', Auth.dashboardFor(role)); });
    }
    if (!Auth.token() && window.TOME_CONFIG.demo) {
      document.querySelectorAll('.demo-note').forEach(el => { el.hidden = false; });
    }
    /* Pastille des messages non lus + sonnerie, sur toutes les pages de l'espace (la messagerie gère les siens). */
    if (Auth.token() && !Auth.isDemo() && !document.getElementById('chat')) {
      let avant = null;
      const titre = document.title;
      const verifier = async () => {
        if (document.hidden) return;
        try {
          const d = await Auth.api('/api/messages/non-lus');
          document.querySelectorAll('.sidebar a[href="messagerie.html"]').forEach(a => {
            let b = a.querySelector('.nav-badge');
            if (!d.non_lus) { b && b.remove(); return; }
            if (!b) { b = document.createElement('span'); b.className = 'nav-badge'; a.appendChild(b); }
            b.textContent = d.non_lus > 99 ? '99+' : d.non_lus;
          });
          document.title = (d.non_lus ? `(${d.non_lus}) ` : '') + titre;
          if (avant !== null && d.non_lus > avant && d.dernier) {
            Son.reception();
            toastMsg(`${d.dernier.de} : ${d.dernier.texte}`, 'messagerie.html');
          }
          avant = d.non_lus;
        } catch (e) { /* hors ligne : on réessaiera */ }
      };
      verifier();
      setInterval(verifier, 30000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) verifier(); });
    }
  }
  function toastMsg(texte, lien) {
    const t = document.createElement('a');
    t.className = 'msg-toast'; t.href = lien; t.textContent = texte;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 6000);
  }

  /* Filtres génériques : [data-filter-group] + [data-filter-item][data-tags] + recherche [data-search] */
  document.querySelectorAll('[data-filter-scope]').forEach(scope => {
    const items = scope.querySelectorAll('[data-filter-item]');
    const buttons = scope.querySelectorAll('[data-filter]');
    const search = scope.querySelector('[data-search]');
    const empty = scope.querySelector('.empty');
    let active = 'tous';
    const apply = () => {
      const q = (search?.value || '').trim().toLowerCase();
      let shown = 0;
      items.forEach(it => {
        const tags = (it.dataset.tags || '').split(' ');
        const okTag = active === 'tous' || tags.includes(active);
        const okText = !q || it.textContent.toLowerCase().includes(q);
        const ok = okTag && okText;
        it.style.display = ok ? '' : 'none';
        if (ok) shown++;
      });
      if (empty) empty.style.display = shown ? 'none' : 'block';
    };
    buttons.forEach(b => b.addEventListener('click', () => {
      buttons.forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      active = b.dataset.filter;
      apply();
    }));
    search?.addEventListener('input', apply);
  });
});
