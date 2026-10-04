import re, pathlib
import os
OUT = pathlib.Path(__file__).resolve().parent.parent
os.chdir(pathlib.Path(__file__).resolve().parent)
LOGO = '''<svg viewBox="0 0 32 32" fill="none" aria-hidden="true" width="30" height="30">
        <rect x="4" y="5" width="7" height="23" rx="1.5" fill="currentColor"/>
        <rect x="12.5" y="8" width="6" height="20" rx="1.5" fill="var(--accent)"/>
        <rect x="20" y="4" width="8" height="24" rx="1.5" transform="rotate(8 24 16)" fill="var(--gold)"/>
      </svg>'''
HEAD = '''<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,400&family=Instrument+Sans:wght@400;500;600&display=swap" rel="stylesheet">
{extra_head}<link rel="stylesheet" href="css/tome.css">
</head>
<body{body_attrs}>
'''
NAV = f'''<header class="nav" id="nav">
  <div class="wrap">
    <a href="index.html" class="logo" aria-label="Tòme, accueil">
      {LOGO}
      Tòme
    </a>
    <ul>
      <li><a href="encyclopedie.html">Encyclopédie</a></li>
      <li><a href="bibliotheque.html">Bibliothèque</a></li>
      <li><a href="examens.html">Examens</a></li>
      <li><a href="missions.html">Missions</a></li>
      <li><a href="a-propos.html">À propos</a></li>
      <li><a href="carrieres.html">Carrières</a></li>
      <li class="menu-only"><a href="connexion.html">Se connecter</a></li>
    </ul>
    <div class="nav-actions">
      <a href="connexion.html" class="btn btn-ghost">Se connecter</a>
      <a href="inscription.html" class="btn btn-primary">Commencer</a>
      <button class="menu-toggle" aria-label="Ouvrir le menu" data-menu-toggle>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
      </button>
    </div>
  </div>
</header>
'''
FOOTER = f'''<footer>
  <div class="wrap">
    <div class="cols">
      <div>
        <a href="index.html" class="logo">
          {LOGO}
          Tòme
        </a>
        <p class="tag">Compagnie haïtienne pour l'intégration et le développement de l'éducation haïtienne.</p>
      </div>
      <div>
        <h4>Plateforme</h4>
        <ul>
          <li><a href="encyclopedie.html">Encyclopédie</a></li>
          <li><a href="bibliotheque.html">Bibliothèque</a></li>
          <li><a href="examens.html">Examens</a></li>
          <li><a href="missions.html">Missions</a></li>
          <li><a href="index.html#profils">Pour qui</a></li>
        </ul>
      </div>
      <div>
        <h4>Entreprise</h4>
        <ul>
          <li><a href="a-propos.html">À propos</a></li>
          <li><a href="carrieres.html">Carrières</a></li>
          <li><a href="mailto:contact@tome.ht">Contact</a></li>
        </ul>
      </div>
      <div>
        <h4>Compte</h4>
        <ul>
          <li><a href="connexion.html">Se connecter</a></li>
          <li><a href="inscription.html">Créer un compte</a></li>
        </ul>
      </div>
    </div>
    <div class="legal">
      <span>© <span data-year>2026</span> Tòme. Tous droits réservés.</span>
      <span>Milot, Haïti</span>
    </div>
  </div>
</footer>
'''
I = {
 'home':'<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
 'book':'<path d="M4 19.5V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2"/><path d="M19 19v3H6a2 2 0 0 1-2-2"/>',
 'check':'<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>',
 'coin':'<circle cx="12" cy="12" r="9"/><path d="M14.8 9a2.5 2.5 0 0 0-2.3-1.5h-1a2.25 2.25 0 0 0 0 4.5h1a2.25 2.25 0 0 1 0 4.5h-1A2.5 2.5 0 0 1 9.2 15"/>',
 'users':'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14a6 6 0 0 1 3.5 6"/>',
 'chart':'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
 'pen':'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
 'brief':'<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
 'cog':'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
 'cal':'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
 'school':'<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/>',
 'out':'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
 'plus':'<path d="M12 5v14M5 12h14"/>',
 'menu':'<path d="M4 7h16M4 12h16M4 17h16"/>',
 'code':'<path d="M8 6l-6 6 6 6M16 6l6 6-6 6"/>',
 'palette':'<circle cx="13.5" cy="6.5" r="1.2"/><circle cx="17.5" cy="10.5" r="1.2"/><circle cx="8.5" cy="7.5" r="1.2"/><circle cx="6.5" cy="12.5" r="1.2"/><path d="M12 2a10 10 0 0 0 0 20c1.4 0 2-1 2-2 0-.6-.3-1-.6-1.4-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.3A4.8 4.8 0 0 0 22 10.6C22 5.8 17.5 2 12 2z"/>',
 'flask':'<path d="M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3"/><path d="M7 15h10"/>',
 'mail':'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
 'chat':'<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/>',
 'dl':'<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
}
def icon(n, w=18): return f'<svg width="{w}" height="{w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">{I[n]}</svg>'

def sidebar(items):
    links=[]
    for it in items:
        if it[0]=='group': links.append(f'<div class="group">{it[1]}</div>')
        else:
            href,ic,label=it
            links.append(f'<a href="{href}">{icon(ic)}{label}</a>')
    return f'''<aside class="sidebar">
    <a href="index.html" class="logo">{LOGO} Tòme</a>
    <nav>
      {"".join(links)}
    </nav>
    <div class="me">
      <div class="avatar" data-user-initials>IN</div>
      <div class="who"><strong data-user-name>Invité</strong><span data-user-role></span><span class="addr" data-user-address></span></div>
      <button data-logout aria-label="Se déconnecter" title="Se déconnecter">{icon('out')}</button>
    </div>
  </aside>'''

def render(text):
    text = re.sub(r'\{\{icon:(\w+)(?::(\d+))?\}\}', lambda m: icon(m.group(1), int(m.group(2) or 18)), text)
    text = text.replace('{{LOGO}}', LOGO)
    return text

import json, html as H

def chrome(s, prefix):
    if not prefix: return s
    return re.sub(r'(href|src)="(?!https?:|mailto:|#|/|data:|\.\./)([^"]*)"', lambda m: f'{m.group(1)}="{prefix}{m.group(2)}"', s)

DATA_JS = OUT/'js'/'encyclopedie-data.js'
def enc_data():
    t = DATA_JS.read_text()
    return json.loads(t[t.index('['):t.rindex(']')+1])

def article_chrome(slug):
    d = {e['slug']: e for e in enc_data()}[slug]
    e = {k: H.escape(str(v)) for k, v in d.items() if isinstance(v, (str, int))}
    return f"""<article class="article" data-slug="{e['slug']}">
  <div class="wrap">
    <nav class="crumbs" aria-label="Fil d'Ariane"><a href="../encyclopedie.html">Encyclopédie</a><span>/</span><a href="../encyclopedie.html#{e['matiere_id']}">{e['matiere']}</a></nav>
    <header class="article-head">
      <div class="chips"><span class="chip accent">{e['matiere']}</span><span class="chip">{e['niveau']}</span><span class="chip">{e['duree']} de lecture</span></div>
      <h1>{e['titre']}</h1>
      <p class="lead">{e['resume']}</p>
      <div class="article-actions"><button class="tbtn" onclick="window.print()">Imprimer ou enregistrer en PDF</button></div>
    </header>
    <div class="article-grid">
      <aside class="toc" id="toc" aria-label="Sommaire"></aside>
      <div class="article-body" id="article-body">
"""

ARTICLE_END = """      </div>
    </div>
    <nav class="article-nav" id="article-nav" aria-label="Articles voisins"></nav>
  </div>
</article>
"""

def build(f, prefix=''):
    raw = f.read_text()
    meta = dict(re.findall(r'^@(\w+):[ \t]*(.*)$', raw, re.M))
    body = re.sub(r'^@\w+:.*\n', '', raw, flags=re.M)
    layout = meta.get('layout', 'article' if prefix else 'site')
    if layout == 'article':
        d = {e['slug']: e for e in enc_data()}[f.stem]
        meta.setdefault('title', d['titre'] + ' | Encyclopédie Tòme')
        meta.setdefault('desc', d['resume'])
    head = HEAD.format(body_attrs=(f' data-page="{meta["page"]}"' if meta.get('page') else ''), title=H.escape(meta['title'], quote=False), desc=H.escape(meta.get('desc',''), quote=True), extra_head=''.join(f'<link rel="stylesheet" href="{h.strip()}">\n' for h in meta.get('css','').split(',') if h.strip()))
    out = chrome(head, prefix)
    if layout == 'site':
        out += chrome(NAV, prefix) + '\n<main>\n' + body + '\n</main>\n\n' + chrome(FOOTER, prefix)
    elif layout == 'article':
        out += chrome(NAV, prefix) + '\n<main>\n' + article_chrome(f.stem) + body + ARTICLE_END + '</main>\n\n' + chrome(FOOTER, prefix)
        out += f'<script src="{prefix}js/encyclopedie-data.js"></script>\n<script src="{prefix}js/article.js"></script>\n'
    elif layout == 'auth':
        out += body
    elif layout == 'app':
        side = eval(meta['sidebar'])
        out += f'<div class="app" data-role="{meta["role"]}">\n  {chrome(sidebar(side), prefix)}\n  <main class="main">\n{body}\n  </main>\n</div>\n'
    out += f'\n<script src="{prefix}js/tome.js"></script>\n' + meta.get('script', '') + '</body>\n</html>\n'
    dest = OUT / (f.relative_to('pages'))
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(render(out))
    print('built', dest.relative_to(OUT))

for f in sorted(pathlib.Path('pages').glob('*.html')):
    build(f)
for f in sorted(pathlib.Path('pages/encyclopedie').glob('*.html')):
    build(f, '../')
