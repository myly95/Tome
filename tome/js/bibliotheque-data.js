/* Tòme : index de la Bibliothèque (webtoons et contes)
 *
 * Une entrée par série, dans le dossier bibliotheque/<slug>/ :
 *   couverture   : image de couverture (couverture.jpg, .png, .webp ou .svg)
 *   type         : "webtoon" (planches en images) ou "conte" (texte)
 *   episodes     : liste des épisodes
 *     - webtoon : dossier episode-01/ contenant 001.jpg, 002.jpg… ; "pages" = nombre d'images, "extension" = jpg (par défaut), png, webp ou svg
 *     - conte   : fichier episode-01.js qui contient le texte (window.TOME_EPISODE = { html: "…" })
 *   publie : false tant que l'épisode n'est pas prêt (affiché « Bientôt »)
 */
window.TOME_BIBLIOTHEQUE = [
  {
    "slug": "le-tambour-de-ti-jan",
    "titre": "Le tambour de Ti Jan",
    "type": "conte",
    "genre": "Conte",
    "public": "Dès 8 ans",
    "auteur": "Tòme",
    "statut": "terminé",
    "resume": "Pendant une sécheresse, un garçon et son petit tambour rappellent à tout un village la force d'être ensemble. Conte d'exemple.",
    "couverture": "couverture.svg",
    "episodes": [
      {
        "num": 1,
        "titre": "Le tambour de Ti Jan",
        "publie": true
      }
    ]
  },
  {
    "slug": "exemple-webtoon",
    "titre": "Exemple de webtoon",
    "type": "webtoon",
    "genre": "Démonstration",
    "public": "Tout public",
    "auteur": "Tòme",
    "statut": "en cours",
    "resume": "Une série de démonstration qui montre comment les épisodes s'affichent : des planches verticales qui défilent sur le téléphone.",
    "couverture": "couverture.svg",
    "episodes": [
      {
        "num": 1,
        "titre": "Comment ça marche",
        "pages": 4,
        "extension": "svg",
        "publie": true
      },
      {
        "num": 2,
        "titre": "La suite",
        "pages": 0,
        "publie": false
      }
    ]
  }
];
