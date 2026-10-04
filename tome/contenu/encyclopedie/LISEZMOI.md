# Ajouter un article à l'Encyclopédie

1. Copiez `MODELE.md`, ou écrivez dans Word (.docx).
2. En haut du fichier, gardez les lignes « Clé : valeur ». Seule **Matière** est obligatoire :
   - Titre, Matière, Niveau, Durée (calculée si absente), Résumé, Mots-clés, Publié (oui ou non).
3. Titres de section : `## Mon titre` en Markdown, ou le style **Titre 1** dans Word. Les images collées dans Word sont gardées.
4. Une section intitulée **À retenir** est mise en valeur automatiquement.
5. Déposez le fichier dans ce dossier sur GitHub (bouton **Add file**, puis **Upload files**, puis **Commit changes**).
   En une minute environ, l'article apparaît sur le site.

Pour corriger un article : modifiez le même fichier et renvoyez-le (même titre = même article).
Pour le retirer de l'affichage sans le supprimer : mettez `Publié : non`.
Si un fichier a un problème (par exemple pas de Matière), l'onglet **Actions** de GitHub affiche une croix rouge avec le nom du fichier et la raison.

Sans GitHub, sur un ordinateur : `pip install markdown mammoth`, puis `python3 _source/ajouter_articles.py` depuis le dossier du site.
