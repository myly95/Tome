# Tòme : front-end

Site statique (HTML, CSS, JS sans framework). Ouvrez `index.html` dans un navigateur pour naviguer.

Le site s'adapte au téléphone, à la tablette (iPad, en portrait comme en paysage) et à l'ordinateur : menu repliable sous 1080 px de large, menu latéral escamotable dans l'espace connecté, conversation en plein écran sur téléphone, tableur et poignée de recopie utilisables au doigt (toucher une cellule déjà choisie pour la modifier).

## Pages

| Fichier | Rôle |
|---|---|
| `index.html` | Accueil |
| `a-propos.html` | Mission, principes, feuille de route en six phases |
| `encyclopedie.html` | Articles filtrables par matière, recherche |
| `examens.html` | Entraînements élèves et concours d'admission pour les écoles |
| `missions.html` | Missions rémunérées, appel aux partenaires |
| `carrieres.html` | Postes ouverts (filtrables) et candidature spontanée |
| `connexion.html` | Connexion |
| `mot-de-passe-oublie.html` | Nouveau mot de passe avec le code de secours, un code donné par l'école ou l'équipe, ou un code reçu par e-mail |
| `compte.html` | Paramètres : changer de mot de passe, nouveau code de secours ; pour l'école et l'équipe, aider quelqu'un à retrouver son compte |
| `inscription.html` | Inscription en deux étapes avec choix du rôle (`?role=ecole` présélectionne) |
| `espace-eleve.html`, `espace-enseignant.html`, `espace-ecole.html`, `espace-partenaire.html` | Tableaux de bord par profil |
| `atelier.html` | Accueil de l'Atelier : Code, Abaque et Mesure, Plume, Design et Labo (bientôt) |
| `atelier-code.html` | Carnets multilangages : Python, R, SQL, JavaScript, HTML |
| `abaque.html` | Abaque (tableur, fichiers `.abk`, xlsx, ods, csv) et Mesure (statistiques) |
| `plume.html` | Plume (traitement de texte, fichiers `.plm`, docx, PDF) |
| `encyclopedie/<sujet>.html` | Un fichier HTML par article de l'Encyclopédie |
| `bibliotheque.html`, `serie.html`, `lecture.html` | Bibliothèque de webtoons et de contes, fiche d'une série, liseuse (nombre de lectures en haut) |
| `publier.html`, `moderation.html` | Envoi d'un chapitre par un élève ; relecture par l'équipe (et annonce à tous) |
| `tome-ia.html` | Tòme IA, l'assistant (et ses fiches de connaissances pour l'équipe) |
| `feuillets.html` | Feuillets du bac à 100 HTG (MonCash ou paiement manuel) et gestion de la boutique |
| `mes-notes.html` | Bulletins de l'élève publiés par son école |
| `gestion-ecole.html` | Pour l'école : élèves à confirmer, saisie ou import des notes, publication des bulletins. Pour l'équipe : liste des écoles et comptes école |
| `messagerie.html` | Messagerie : conversations à deux, groupes, « Nouveautés Tòme », sonnerie (activable ou non) |
| `404.html` | Page introuvable |

Styles partagés : `css/tome.css`. Script partagé : `js/tome.js`. Chaque outil a son script dans `js/` (par exemple `js/abaque.js`, `js/mesure-stats.js`, `js/plume.js`, `js/bibliotheque.js`, `js/feuillets.js`, `js/gestion-ecole.js`).

## Brancher le backend Express

L'API se trouve dans `tome-api.zip` (comptes, messagerie, espaces personnels, bibliothèque, Tòme IA, boutique, écoles et bulletins, stockés dans un dépôt GitHub privé). Son `README.md` explique la mise en route pas à pas.

Dans `js/tome.js`, objet `TOME_CONFIG` :

- `apiBase` : URL de l'API (vide si le front est servi par Express).
- `demo` : `true` tant que l'API n'est pas branchée. **Passer à `false` en production.**
- Routes attendues :
  - `POST /api/auth/login` avec `{ email, password }`
  - `POST /api/auth/signup` avec `{ role, prenom, nom, email, password, ...champs du rôle }`
  - Réponse attendue pour les deux : `{ token, user: { name, email, role } }` où `role` vaut `eleve`, `enseignant`, `ecole` ou `partenaire`.

Le jeton est conservé dans `localStorage` (`tome_token`) et l'utilisateur redirigé vers l'espace de son rôle. Les espaces connectés renvoient vers `connexion.html` sans jeton (hors mode démo).

Les chiffres des tableaux de bord sont des données de démonstration à remplacer par des appels à l'API.

## Atelier Code

Tout s'exécute dans le navigateur de l'élève : aucun serveur d'exécution à gérer.

| Langage | Moteur | Notes |
|---|---|---|
| Python | Pyodide | Plus de 300 paquets compilés (numpy, pandas, scipy, scikit-learn, xgboost, matplotlib, opencv…) et tout paquet pur Python de PyPI. Installation automatique à l'`import` ou avec `%pip install`. Pas de PyTorch ni TensorFlow. |
| R | webR | Paquets CRAN installés automatiquement avec `library()`. Graphiques capturés. |
| SQL | sql.js (SQLite) | Import d'un CSV en table, ouverture d'une base `.sqlite`, export de la base. |
| JavaScript | Web Worker isolé | `lireTexte()`, `ecrireFichier()`, `listeFichiers()` pour les fichiers. |
| HTML | iframe isolée | HTML, CSS et JS rendus sous la cellule. |

Chaque cellule peut avoir son propre langage. Les carnets s'importent et s'exportent en `.ipynb`.

**Fichiers.** Les fichiers importés (bouton ou glisser-déposer) sont stockés sur l'appareil (IndexedDB) et visibles depuis tous les langages, dans le dossier de travail. Les fichiers créés par le code apparaissent automatiquement et se téléchargent. Les graphiques ont un bouton de téléchargement PNG.

**GitHub.** Lecture des dépôts publics sans compte. Pour enregistrer (commit) un carnet ou un fichier, l'élève colle un jeton « fine-grained » limité à ses dépôts ; il reste dans le navigateur et n'est envoyé qu'à api.github.com. Étape suivante conseillée : une vraie connexion OAuth (« Se connecter avec GitHub »), qui demande une route sur le backend Express pour échanger le code contre un jeton.

**Hors ligne.** Le premier chargement de chaque langage demande internet (Python environ 10 Mo, R environ 30 Mo), ensuite le navigateur les garde en cache. Pour les écoles sans connexion, hébergez Pyodide, webR, sql.js, CodeMirror et marked sur votre serveur et changez les URL dans `TOME_CONFIG` (`js/tome.js`) et dans `atelier-code.html`.

## Encyclopédie

- **Index des sujets** : `js/encyclopedie-data.js`. Une entrée par sujet (titre, matière, niveau, durée, résumé, mots-clés, `publie`). La page `encyclopedie.html` se construit à partir de ce fichier : filtres par matière, recherche, et cartes « Bientôt » pour les sujets pas encore écrits.
- **Articles** : un fichier par sujet dans `encyclopedie/`, nommé d'après le `slug`. Chaque page a le fil d'Ariane, un sommaire automatique (à partir des titres de section), un bouton d'impression ou PDF, et les liens vers l'article précédent et suivant.
- **Ajouter un article (le plus simple)** : déposez un fichier `.md` ou `.docx` (Word) dans `contenu/encyclopedie/` sur GitHub. L'action « Encyclopédie » (`.github/workflows/encyclopedie.yml`) le convertit, met à jour l'index et régénère les pages ; l'hébergeur republie le site. Mode d'emploi et modèle : `contenu/encyclopedie/LISEZMOI.md` et `MODELE.md`. Sur un ordinateur : `pip install markdown mammoth` puis `python3 _source/ajouter_articles.py`.
- **À la main** : ajouter l'entrée dans l'index avec `publie: true`, puis créer `_source/pages/encyclopedie/<slug>.html` (corps de l'article seulement) et lancer `python3 _source/build.py`.

## Abaque, Mesure et Plume

- **Abaque** : tableur avec plus de 400 fonctions (noms anglais ou français, `;` ou `,`), références relatives recopiées avec la poignée, plusieurs feuilles. Format natif `.abk` (JSON) ; ouvre et enregistre aussi xlsx, ods et csv.
- **Mesure** (menus Statistiques, Tests, Qualité, Graphiques d'Abaque) : statistiques descriptives, intervalles de confiance, tests t, test F, proportions, khi-deux, ANOVA, corrélation, régression, normalité (Anderson-Darling), cartes de contrôle, capabilité, Pareto. Les résultats ont été vérifiés avec scipy et statsmodels.
- **Plume** : traitement de texte. Format natif `.plm` ; importe docx, md, html, txt ; exporte docx, PDF (impression) et html.
- Les trois enregistrent dans l'espace Tòme de la personne connectée (10 fichiers, 1 Mo chacun).

## Bibliothèque

- **Index** : `js/bibliotheque-data.js` (séries de Tòme). Une série par dossier dans `bibliotheque/<slug>/` avec `couverture.*`.
- **Webtoon** : les planches d'un épisode dans `episode-01/001.jpg`, `002.jpg`… **Conte** : un fichier `episode-01.js` par épisode (`window.TOME_EPISODE = { html: "…" }`).
- Les chapitres écrits par les élèves passent par `publier.html`, sont relus dans `moderation.html` puis apparaissent dans « Écrits par les élèves ». Les planches sont compressées dans le navigateur avant l'envoi.
