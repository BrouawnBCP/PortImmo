# Port'Immo

Application web installable (PWA) pour gérer un portefeuille de biens immobiliers
depuis un téléphone ou un ordinateur.

## Fonctionnalités

- **Accueil (tableau de bord)** : biens par statut, valeur du portefeuille, honoraires prévisionnels,
  prochaines visites, visites à compléter, offres en attente, mandats à renouveler, activité récente,
  rappel de sauvegarde.
- **Mes Biens** : liste (recherche, filtres, tri) et **carte** (OpenStreetMap ; adresses localisées via
  api-adresse.data.gouv.fr, une seule fois par adresse).
- **Fiche bien** :
  - informations type annonce + champs personnalisés, description générée automatiquement (à relire) ;
  - **journal du bien** : visites (compte rendu, note, export calendrier), offres (accepter / refuser),
    changements de prix et de statut (enregistrés automatiquement), notes, photos, documents ;
  - **pièces & photos** : surface et remarques par pièce, total des surfaces, photos par pièce
    (appareil photo / galerie), photo principale, ordre, rotation, recadrage ;
  - **documents** (PDF ou images : diagnostics, DPE, métré…) ;
  - **acquéreurs intéressés** (rapprochement automatique).
- **Partage** : mini-fiche image pour les messageries, annonce complète PDF, fiche vitrine A4 paysage.
- **Acquéreurs** : coordonnées, critères de recherche, biens correspondants avec score, visites & offres.
- **Simulateur** : honoraires (taux par défaut, montant modifiable à la main), prix net vendeur,
  frais de notaire, crédit (mensualité, assurance, revenus conseillés).
- **Réglages** : agence + logo (PDF, mini-fiche), valeurs par défaut des simulations,
  sauvegarde / restauration, installation.

> Les données sont stockées **sur l'appareil** (IndexedDB). Elles ne sont pas synchronisées entre
> le téléphone et l'ordinateur : utiliser la sauvegarde / restauration pour les transférer.

## Modifier les catégories

Tout est dans [`js/config.js`](js/config.js) : sections, champs, listes de choix,
pièces proposées, qualité des photos. Le formulaire, la fiche et les PDF se mettent à jour seuls.

## Lancer en local

```powershell
python -m http.server 5180
```

Puis ouvrir <http://localhost:5180>.

## Mise en ligne

Publication automatique sur GitHub Pages à chaque « Push » (workflow `.github/workflows/deploy.yml`).
Penser à incrémenter `VERSION` dans `sw.js` à chaque mise en ligne.
Le dossier `donnees-privees/` (données réelles) n'est jamais publié.

## Structure

```
index.html              page unique
sw.js                   service worker (hors-ligne)
css/styles.css          styles (mobile d'abord, thème clair/sombre)
js/config.js            catégories et champs  <- à personnaliser
js/db.js                stockage local (biens, photos, journal, documents, acquéreurs, réglages)
js/app.js               routeur + barre du haut
js/ui.js, dialogs.js    utilitaires d'interface et fenêtres de saisie
js/images.js            compression, rotation, recadrage des photos
js/describe.js          description automatique
js/matching.js          rapprochement biens <-> acquéreurs
js/minifiche.js         image de partage
js/pdf/                 générateur PDF (annonce, fiche vitrine)
js/views/               écrans
demo/exemple.json       annonce d'exemple (anonymisée)
```
