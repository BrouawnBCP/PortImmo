# Port'Immo

Application web installable (PWA) pour gérer un portefeuille de biens immobiliers
depuis un téléphone ou un ordinateur.

## Fonctionnalités actuelles

- **Mes Biens** : liste des biens avec photo principale, prix, statut, recherche, filtres et tri.
- **Fiche bien** : catégories type annonce (général, prix, localisation, caractéristiques,
  énergie/DPE, équipements, description, propriétaire & notes privées) + champs personnalisés.
- **Photos par pièce / emplacement** : création de pièces (Façade, Séjour, Cuisine…),
  photos depuis l'appareil photo ou la galerie, photo principale, déplacement entre pièces,
  visionneuse plein écran (glisser pour changer de photo).
- Photos compressées automatiquement (1920 px max) pour économiser la place.
- Fonctionne hors-ligne, s'installe sur l'écran d'accueil.
- Sauvegarde / restauration (fichier `.json`) dans Réglages.

> Les données sont stockées **sur l'appareil** (IndexedDB). Elles ne sont pas encore
> synchronisées entre le téléphone et l'ordinateur.

## Modifier les catégories

Tout est dans [`js/config.js`](js/config.js) : sections, champs, listes de choix,
pièces proposées, qualité des photos. Le formulaire et la fiche se mettent à jour seuls.

## Lancer en local

```powershell
python -m http.server 5180
```

Puis ouvrir <http://localhost:5180>.

## Mise en ligne

Aucune étape de compilation : il suffit d'héberger les fichiers tels quels sur un
hébergement HTTPS statique (GitHub Pages, Netlify, Cloudflare Pages…).
Penser à incrémenter `VERSION` dans `sw.js` à chaque mise en ligne.

## Structure

```
index.html            page unique
manifest.webmanifest  infos d'installation (nom, icônes, couleurs)
sw.js                 service worker (hors-ligne)
css/styles.css        styles (mobile d'abord, thème clair/sombre)
js/config.js          catégories et champs  <- à personnaliser
js/db.js              stockage local (biens + photos)
js/images.js          compression des photos
js/ui.js              utilitaires d'interface (icônes, modales…)
js/app.js             routeur + barre du haut
js/views/*.js         écrans (liste, fiche, formulaire, visionneuse, réglages)
icons/                icônes de l'application
```
