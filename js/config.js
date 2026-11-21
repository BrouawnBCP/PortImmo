// =====================================================================
//  CONFIGURATION DES CATÉGORIES ET CHAMPS
//  -> Modifie ce fichier pour ajouter / retirer / renommer des champs.
//  Le formulaire et la fiche du bien sont générés automatiquement à partir
//  de cette liste.
//
//  Types de champs disponibles :
//    text, number, select, textarea, tel, email, date, chips (choix multiples)
//  Options utiles :
//    full: true      -> le champ prend toute la largeur
//    unit: 'm²'      -> unité affichée à côté de la valeur
//    private: true   -> section marquée "privée" (non destinée à l'annonce)
// =====================================================================

export const STATUTS = [
  { value: 'disponible', label: 'Disponible', color: 'green' },
  { value: 'option', label: 'Sous offre / compromis', color: 'orange' },
  { value: 'vendu', label: 'Vendu / Loué', color: 'blue' },
  { value: 'archive', label: 'Archivé', color: 'grey' },
];

export const TYPES_BIEN = [
  'Maison', 'Appartement', 'Studio', 'Loft', 'Villa', 'Terrain',
  'Immeuble', 'Local commercial', 'Bureau', 'Parking / Garage', 'Autre',
];

const CLASSES_ENERGIE = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'Non soumis', 'En cours'];

export const SECTIONS = [
  {
    id: 'general',
    title: 'Informations générales',
    fields: [
      { key: 'titre', label: "Titre de l'annonce", type: 'text', full: true, required: true, placeholder: 'Ex : Maison familiale avec jardin' },
      { key: 'reference', label: 'Référence', type: 'text', placeholder: 'Ex : PI-0042' },
      { key: 'statut', label: 'Statut', type: 'select', options: STATUTS, default: 'disponible' },
      { key: 'transaction', label: 'Transaction', type: 'select', options: ['Vente', 'Location', 'Viager'], default: 'Vente' },
      { key: 'typeBien', label: 'Type de bien', type: 'select', options: TYPES_BIEN },
      { key: 'mandat', label: 'Mandat', type: 'select', options: ['Simple', 'Exclusif', 'Semi-exclusif'] },
      { key: 'dateMandat', label: 'Date du mandat', type: 'date' },
      { key: 'finMandat', label: 'Fin du mandat', type: 'date' },
    ],
  },
  {
    id: 'prix',
    title: 'Prix & charges',
    fields: [
      { key: 'prix', label: 'Prix / Loyer', type: 'number', unit: '€' },
      { key: 'honoraires', label: 'Honoraires', type: 'text', placeholder: 'Ex : 5 % TTC charge acquéreur' },
      { key: 'charges', label: 'Charges', type: 'number', unit: '€/mois' },
      { key: 'taxeFonciere', label: 'Taxe foncière', type: 'number', unit: '€/an' },
    ],
  },
  {
    id: 'localisation',
    title: 'Localisation',
    fields: [
      { key: 'adresse', label: 'Adresse', type: 'text', full: true },
      { key: 'codePostal', label: 'Code postal', type: 'text', inputmode: 'numeric' },
      { key: 'ville', label: 'Ville', type: 'text' },
      { key: 'quartier', label: 'Quartier / secteur', type: 'text', full: true },
    ],
  },
  {
    id: 'caracteristiques',
    title: 'Caractéristiques',
    fields: [
      { key: 'surfaceHabitable', label: 'Surface habitable', type: 'number', unit: 'm²' },
      { key: 'surfaceTerrain', label: 'Surface du terrain', type: 'number', unit: 'm²' },
      { key: 'nbPieces', label: 'Pièces', type: 'number' },
      { key: 'nbChambres', label: 'Chambres', type: 'number' },
      { key: 'nbSdb', label: "Salles de bain / d'eau", type: 'number' },
      { key: 'nbWc', label: 'WC', type: 'number' },
      { key: 'etage', label: 'Étage', type: 'number' },
      { key: 'nbNiveaux', label: 'Niveaux', type: 'number' },
      { key: 'anneeConstruction', label: 'Année de construction', type: 'number' },
      { key: 'etat', label: 'État général', type: 'select', options: ['Neuf', 'Très bon état', 'Bon état', 'À rafraîchir', 'À rénover'] },
    ],
  },
  {
    id: 'energie',
    title: 'Énergie & chauffage',
    fields: [
      { key: 'dpe', label: 'DPE (énergie)', type: 'select', options: CLASSES_ENERGIE, badge: 'dpe' },
      { key: 'ges', label: 'GES (climat)', type: 'select', options: CLASSES_ENERGIE, badge: 'ges' },
      { key: 'chauffage', label: 'Chauffage', type: 'select', options: ['Gaz', 'Électrique', 'Fioul', 'Bois / granulés', 'Pompe à chaleur', 'Solaire', 'Autre'] },
      { key: 'modeChauffage', label: 'Mode', type: 'select', options: ['Individuel', 'Collectif'] },
      { key: 'exposition', label: 'Exposition', type: 'select', options: ['Nord', 'Nord-Est', 'Est', 'Sud-Est', 'Sud', 'Sud-Ouest', 'Ouest', 'Nord-Ouest', 'Traversant'] },
    ],
  },
  {
    id: 'equipements',
    title: 'Équipements & prestations',
    fields: [
      {
        key: 'equipements', label: 'Équipements', type: 'chips', full: true,
        options: [
          'Jardin', 'Terrasse', 'Balcon', 'Piscine', 'Garage', 'Parking', 'Cave',
          'Grenier', 'Ascenseur', 'Cuisine équipée', 'Climatisation', 'Cheminée',
          'Double vitrage', 'Volets roulants', 'Alarme', 'Interphone / digicode',
          'Gardien', 'Fibre', 'Accès PMR', 'Vue dégagée', 'Meublé',
        ],
      },
    ],
  },
  {
    id: 'description',
    title: 'Description',
    fields: [
      { key: 'description', label: "Texte de l'annonce", type: 'textarea', full: true, rows: 6 },
    ],
  },
  {
    id: 'proprietaire',
    title: 'Propriétaire & notes',
    private: true,
    fields: [
      { key: 'proprioNom', label: 'Nom du propriétaire', type: 'text', full: true },
      { key: 'proprioTel', label: 'Téléphone', type: 'tel' },
      { key: 'proprioEmail', label: 'E-mail', type: 'email' },
      { key: 'notes', label: 'Notes privées', type: 'textarea', full: true, rows: 4 },
    ],
  },
];

// Pièces / emplacements proposés lors de l'ajout de photos.
export const PIECES_SUGGEREES = [
  'Façade', 'Extérieur', 'Entrée', 'Séjour', 'Salon', 'Salle à manger',
  'Cuisine', 'Chambre', 'Suite parentale', 'Salle de bain', "Salle d'eau",
  'WC', 'Bureau', 'Dressing', 'Buanderie', 'Couloir', 'Escalier',
  'Combles', 'Cave', 'Garage', 'Jardin', 'Terrasse', 'Balcon', 'Piscine',
  'Vue', 'Plan',
];

// Paramètres de compression des photos (pour économiser la place sur le téléphone).
export const PHOTO = {
  maxSize: 1920,   // côté le plus long, en pixels
  quality: 0.82,
  thumbSize: 480,
  thumbQuality: 0.72,
};
