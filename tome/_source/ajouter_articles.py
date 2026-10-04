#!/usr/bin/env python3
"""
Tòme : ajoute ou met à jour les articles de l'Encyclopédie à partir de fichiers simples.

Déposez un fichier .md (texte) ou .docx (Word) dans  contenu/encyclopedie/ , puis :
    python3 _source/ajouter_articles.py
(Sur GitHub, l'action « Encyclopédie » le fait toute seule à chaque envoi de fichier.)

En haut du fichier, quelques lignes « Clé : valeur » (toutes facultatives sauf Matière) :
    Titre : La photosynthèse
    Matière : Sciences
    Niveau : Fondamental
    Durée : 12 min               (calculée toute seule si absente)
    Résumé : Comment les plantes transforment la lumière…
    Mots-clés : plantes, chlorophylle, énergie
    Publié : oui                 (« non » pour préparer sans afficher)
Ensuite le texte. Titres de section : « ## » en Markdown, ou « Titre 1 » dans Word.
Une section « À retenir » est mise en valeur automatiquement.

Le même fichier peut être modifié et renvoyé : l'article est mis à jour (même titre = même article).
"""
import html, json, pathlib, re, subprocess, sys, unicodedata

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'contenu' / 'encyclopedie'
PAGES = ROOT / '_source' / 'pages' / 'encyclopedie'
IMG = ROOT / 'encyclopedie' / 'images'
DATA = ROOT / 'js' / 'encyclopedie-data.js'

CLES = {
    'titre': 'titre', 'matiere': 'matiere', 'niveau': 'niveau', 'duree': 'duree',
    'resume': 'resume', 'mots-cles': 'mots_cles', 'mots cles': 'mots_cles', 'motscles': 'mots_cles',
    'publie': 'publie', 'slug': 'slug', 'identifiant': 'slug',
}

def sans_accents(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')

def slugify(s):
    return re.sub(r'[^a-z0-9]+', '-', sans_accents(s).lower()).strip('-')[:80]

def lire_meta(lignes):
    """Lit les lignes « Clé : valeur » du début (et un éventuel bloc --- … --- en Markdown)."""
    meta, i = {}, 0
    if lignes and lignes[0].strip() == '---':
        i = 1
        while i < len(lignes) and lignes[i].strip() != '---':
            i += 1
        bloc, i = lignes[1:i], i + 1
    else:
        bloc = []
    for l in bloc:
        m = re.match(r'^\s*([^:]{2,20}?)\s*:\s*(.+?)\s*$', l)
        if m and sans_accents(m.group(1)).lower().strip() in CLES:
            meta[CLES[sans_accents(m.group(1)).lower().strip()]] = m.group(2)
    while i < len(lignes):
        l = lignes[i]
        if not l.strip():
            i += 1; continue
        m = re.match(r'^\s*\**([^:*]{2,20}?)\**\s*:\s*(.+?)\s*$', l)
        if m and sans_accents(m.group(1)).lower().strip() in CLES:
            meta[CLES[sans_accents(m.group(1)).lower().strip()]] = m.group(2).strip()
            i += 1
        else:
            break
    return meta, lignes[i:]

# ---------- Nettoyage du HTML ----------
AUTORISES = {'h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 'blockquote', 'br', 'a',
             'table', 'thead', 'tbody', 'tr', 'th', 'td', 'figure', 'figcaption', 'img', 'sup', 'sub', 'code', 'pre', 'hr', 'div'}

def nettoyer(h):
    h = re.sub(r'(?is)<(script|style|iframe|object|embed)[^>]*>.*?</\1>', '', h)
    h = re.sub(r'(?i)\son\w+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)', '', h)
    h = re.sub(r'(?i)(href|src)\s*=\s*"\s*javascript:[^"]*"', r'\1="#"', h)
    def tag(m):
        nom = m.group(2).lower()
        if nom == 'h1': return f'<{m.group(1)}h2>'   # le titre de la page est déjà un h1
        return m.group(0) if nom in AUTORISES else ''
    h = re.sub(r'<(/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>', tag, h)
    h = re.sub(r'<p>\s*</p>', '', h)
    return h.strip()

def mettre_en_forme(h):
    # « À retenir » : la section qui suit devient un encadré
    def callout(m):
        return m.group(1) + '\n<div class="callout">' + m.group(2).strip() + '</div>\n'
    h = re.sub(r'(?is)(<h2>\s*(?:À|A) retenir\s*</h2>)(.*?)(?=<h2>|$)', callout, h)
    # images seules dans un paragraphe : figure
    h = re.sub(r'(?is)<p>\s*(<img [^>]+>)\s*</p>', r'<figure>\1</figure>', h)
    h = re.sub(r'(?i)<img ', '<img loading="lazy" ', h)
    # tableaux Word : pas de <p> dans les cases, première ligne en en-tête
    h = re.sub(r'(?is)(<t[dh][^>]*>)\s*<p>(.*?)</p>\s*(</t[dh]>)', r'\1\2\3', h)
    def entete(m):
        t = m.group(0)
        if '<thead' in t or '<th' in t: return t
        return re.sub(r'(?is)<tr>(.*?)</tr>', lambda r: '<thead><tr>' + re.sub(r'(?i)<(/?)td', r'<\1th', r.group(1)) + '</tr></thead>', t, count=1)
    h = re.sub(r'(?is)<table>.*?</table>', entete, h)
    h = re.sub(r'(?is)<table>', '<div class="table-wrap"><table>', h)
    h = re.sub(r'(?is)</table>', '</table></div>', h)
    # une balise de bloc par ligne, plus lisible si on ouvre le fichier
    h = re.sub(r'(?i)(</(?:p|h2|h3|h4|ul|ol|blockquote|figure|div)>)\s*', r'\1\n', h)
    return h.strip()

# ---------- Lecture des fichiers ----------
def depuis_markdown(texte):
    import markdown
    lignes = texte.replace('\r\n', '\n').split('\n')
    meta, reste = lire_meta(lignes)
    if 'titre' not in meta:
        for k, l in enumerate(reste):
            if l.strip():
                if l.startswith('# '):
                    meta['titre'] = l[2:].strip(); reste = reste[k + 1:]
                break
    corps = markdown.markdown('\n'.join(reste), extensions=['tables', 'sane_lists'])
    return meta, corps

def depuis_docx(chemin, slug_provisoire):
    import mammoth
    images = []
    def image(img):
        ext = {'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/svg+xml': 'svg'}.get(img.content_type, 'png')
        with img.open() as f:
            data = f.read()
        images.append((ext, data))
        return {'src': f'__IMG{len(images) - 1}__', 'alt': img.alt_text or ''}
    style = "p[style-name='Title'] => h1:fresh\np[style-name='Titre'] => h1:fresh\np[style-name='Heading 1'] => h2:fresh\np[style-name='Titre 1'] => h2:fresh\np[style-name='Heading 2'] => h3:fresh\np[style-name='Titre 2'] => h3:fresh\np[style-name='Quote'] => blockquote > p:fresh\np[style-name='Citation'] => blockquote > p:fresh"
    with open(chemin, 'rb') as f:
        r = mammoth.convert_to_html(f, style_map=style, convert_image=mammoth.images.img_element(image))
    h = r.value
    # métadonnées : paragraphes « Clé : valeur » du début, puis titre (style Titre) éventuel
    meta = {}
    while True:
        m = re.match(r'^\s*<p>(?:<strong>)?([^<:]{2,20}?)\s*:(?:</strong>)?\s*(.+?)</p>', h)
        if m and sans_accents(m.group(1)).lower().strip() in CLES:
            meta[CLES[sans_accents(m.group(1)).lower().strip()]] = html.unescape(re.sub('<[^>]+>', '', m.group(2))).strip()
            h = h[m.end():]
        else:
            break
    m = re.match(r'^\s*<h1>(.*?)</h1>', h)
    if m:
        meta.setdefault('titre', html.unescape(re.sub('<[^>]+>', '', m.group(1))).strip()); h = h[m.end():]
    return meta, h, images

def duree(corps):
    mots = len(re.sub('<[^>]+>', ' ', corps).split())
    return f'{max(2, round(mots / 180))} min'

def resume_auto(corps):
    m = re.search(r'(?is)<p>(.*?)</p>', corps)
    t = html.unescape(re.sub('<[^>]+>', '', m.group(1))).strip() if m else ''
    return (t[:177] + '…') if len(t) > 180 else t

def oui(v):
    return sans_accents(str(v)).strip().lower() not in ('non', 'no', 'false', '0', 'brouillon')

# ---------- Programme ----------
def main():
    if not SRC.exists():
        print('Aucun dossier contenu/encyclopedie : rien à faire.'); return 0
    t = DATA.read_text(encoding='utf-8')
    avant, index, apres = t[:t.index('[')], json.loads(t[t.index('['):t.rindex(']') + 1]), t[t.rindex(']') + 1:]
    erreurs, faits = [], []
    fichiers = sorted(p for p in SRC.iterdir() if p.suffix.lower() in ('.md', '.markdown', '.txt', '.docx') and not p.name.startswith(('_', '.', 'MODELE', 'modele', 'LISEZMOI')))
    for p in fichiers:
        try:
            images = []
            if p.suffix.lower() == '.docx':
                meta, corps, images = depuis_docx(p, slugify(p.stem))
            else:
                meta, corps = depuis_markdown(p.read_text(encoding='utf-8'))
            titre = meta.get('titre') or p.stem.replace('-', ' ').replace('_', ' ').strip().capitalize()
            if not meta.get('matiere'):
                raise ValueError('ligne « Matière : … » manquante en haut du fichier')
            # même titre ou même identifiant = même article (les cartes « Bientôt » sont reprises)
            slug = slugify(meta.get('slug') or titre)
            existant = next((e for e in index if e['slug'] == slug or slugify(e['titre']) == slugify(titre)), None)
            if existant: slug = existant['slug']
            for n, (ext, data) in enumerate(images):
                IMG.mkdir(parents=True, exist_ok=True)
                nom = f'{slug}-{n + 1}.{ext}'
                (IMG / nom).write_bytes(data)
                corps = corps.replace(f'__IMG{n}__', f'images/{nom}')
            corps = mettre_en_forme(nettoyer(corps))
            if '<h2>' not in corps:
                raise ValueError('aucun titre de section (« ## Titre » en Markdown, style « Titre 1 » dans Word)')
            if not meta.get('resume') and not (existant or {}).get('resume'):
                meta['resume'] = resume_auto(corps)
            # si le résumé est le premier paragraphe, il sert de chapeau sous le titre : on ne le répète pas
            res = meta.get('resume') or (existant or {}).get('resume') or ''
            if res and res == resume_auto(corps):
                corps = re.sub(r'(?is)^\s*<p>.*?</p>\s*', '', corps, count=1)
            entree = {
                'slug': slug, 'titre': titre,
                'matiere': meta['matiere'].strip().capitalize() if meta['matiere'].islower() else meta['matiere'].strip(),
                'matiere_id': slugify(meta['matiere']),
                'niveau': meta.get('niveau', (existant or {}).get('niveau', 'Tous niveaux')),
                'duree': meta.get('duree') or duree(corps),
                'resume': meta.get('resume') or (existant or {}).get('resume') or resume_auto(corps),
                'mots_cles': [m.strip() for m in re.split(r'[,;]', meta.get('mots_cles', '')) if m.strip()] or (existant or {}).get('mots_cles', []),
                'publie': oui(meta.get('publie', 'oui')),
            }
            if existant: existant.clear(); existant.update(entree)
            else: index.append(entree)
            PAGES.mkdir(parents=True, exist_ok=True)
            corps_indente = '\n'.join('        ' + l if l.strip() else '' for l in corps.split('\n'))
            (PAGES / f'{slug}.html').write_text(f'@title: {titre} | Encyclopédie Tòme\n@desc: {entree["resume"]}\n@layout: article\n{corps_indente}\n', encoding='utf-8')
            faits.append(f'{p.name}  ->  encyclopedie/{slug}.html' + ('' if entree['publie'] else '  (brouillon, non affiché)'))
        except Exception as e:
            erreurs.append(f'{p.name} : {e}')
    DATA.write_text(avant + json.dumps(index, ensure_ascii=False, indent=2) + apres, encoding='utf-8')
    if faits:
        subprocess.run([sys.executable, str(ROOT / '_source' / 'build.py')], check=True, stdout=subprocess.DEVNULL)
    for f in faits: print('OK   ', f)
    for e in erreurs: print('ERREUR', e)
    if not faits and not erreurs: print('Aucun article à traiter dans contenu/encyclopedie/.')
    return 1 if erreurs else 0

if __name__ == '__main__':
    sys.exit(main())
