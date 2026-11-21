// Génère un texte d'annonce à partir des informations du bien (à relire avant d'enregistrer).
import { fmtPrice, fmtNum } from './ui.js';

const lc = (s) => String(s || '').toLowerCase();
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

const ARTICLE = {
  Maison: 'Belle maison', Appartement: 'Bel appartement', Studio: 'Studio', Loft: 'Loft', Villa: 'Belle villa',
  Terrain: 'Terrain', Immeuble: 'Immeuble', 'Local commercial': 'Local commercial', Bureau: 'Bureau',
  'Parking / Garage': 'Parking / garage',
};

function listFr(items) {
  if (items.length <= 1) return items.join('');
  return items.slice(0, -1).join(', ') + ' et ' + items[items.length - 1];
}

export function generateDescription(b) {
  const parts = [];

  // Accroche
  const type = ARTICLE[b.typeBien] || (b.typeBien ? b.typeBien : 'Bien');
  const action = b.transaction === 'Location' ? 'à louer' : b.transaction === 'Viager' ? 'en viager' : 'à vendre';
  // « à Le Cannet » -> « au Cannet », « à Les Mées » -> « aux Mées »
  const aVille = (v) => (/^le /i.test(v) ? 'au ' + v.slice(3) : /^les /i.test(v) ? 'aux ' + v.slice(4) : 'à ' + v);
  const lieu = b.ville ? ` ${aVille(b.ville)}` + (b.quartier ? `, quartier ${b.quartier}` : '') : '';
  parts.push(`${type} ${action}${lieu}.`);

  // Surfaces et pièces
  const s = [];
  if (b.surfaceHabitable) s.push(`d'une surface habitable de ${fmtNum(b.surfaceHabitable)} m²`);
  if (b.surfaceTerrain) s.push(`sur un terrain de ${fmtNum(b.surfaceTerrain)} m²`);
  let phrase = s.length ? `${s.join(' ')}, ce bien` : 'Ce bien';
  if (b.nbNiveaux > 1) phrase += ` réparti sur ${b.nbNiveaux} niveaux`;
  if (b.etage !== '' && b.etage != null && b.typeBien !== 'Maison' && b.typeBien !== 'Villa') {
    phrase += Number(b.etage) === 0 ? ' situé en rez-de-chaussée' : ` situé au ${b.etage}${Number(b.etage) === 1 ? 'er' : 'e'} étage`;
  }
  const compo = [];
  if (b.nbPieces) compo.push(plural(b.nbPieces, 'pièce', 'pièces'));
  if (b.nbChambres) compo.push(`dont ${plural(b.nbChambres, 'chambre', 'chambres')}`);
  if (compo.length) phrase += ` comprend ${compo.join(' ')}`;
  const eaux = [];
  if (b.nbSdb) eaux.push(plural(b.nbSdb, "salle d'eau ou de bain", "salles d'eau ou de bain"));
  if (b.nbWc) eaux.push(plural(b.nbWc, 'WC', 'WC'));
  if (eaux.length) phrase += `${compo.length ? ', ' : ' comprend '}${listFr(eaux)}`;
  if (phrase !== 'Ce bien') parts.push(phrase.charAt(0).toUpperCase() + phrase.slice(1) + '.');

  // Détail des pièces (si des surfaces ont été saisies)
  const pieces = (b.pieces || []).filter((p) => p.surface);
  if (pieces.length) {
    parts.push('Il se compose notamment de : ' + pieces.map((p) => `${lc(p.nom)} (${fmtNum(p.surface)} m²)`).join(', ') + '.');
  }

  // État, construction, exposition
  const etat = [];
  if (b.anneeConstruction) etat.push(`construit en ${b.anneeConstruction}`);
  if (b.etat) etat.push(b.etat === 'Neuf' ? 'neuf' : `en ${lc(b.etat).replace(/^très bon état$/, 'très bon état')}`.replace('en à ', 'à '));
  if (b.exposition) etat.push(`exposé ${lc(b.exposition)}`);
  if (etat.length) parts.push(listFr(etat).replace(/^./, (c) => c.toUpperCase()) + '.');

  // Prestations
  if (b.equipements && b.equipements.length) {
    parts.push(`Prestations : ${b.equipements.map(lc).join(', ')}.`);
  }

  // Énergie
  const ener = [];
  if (b.chauffage) ener.push(`chauffage ${lc(b.chauffage)}${b.modeChauffage ? ' ' + lc(b.modeChauffage) : ''}`);
  if (/^[A-G]$/.test(b.dpe || '')) ener.push(`classe énergie ${b.dpe}`);
  if (/^[A-G]$/.test(b.ges || '')) ener.push(`classe climat ${b.ges}`);
  if (ener.length) parts.push(listFr(ener).replace(/^./, (c) => c.toUpperCase()) + '.');

  // Frais
  const frais = [];
  if (b.charges) frais.push(`charges : ${fmtPrice(b.charges)}/mois`);
  if (b.taxeFonciere) frais.push(`taxe foncière : ${fmtPrice(b.taxeFonciere)}/an`);
  if (frais.length) parts.push(listFr(frais).replace(/^./, (c) => c.toUpperCase()) + '.');

  // Prix
  if (b.prix) {
    parts.push(`Prix : ${fmtPrice(b.prix)}${b.transaction === 'Location' ? ' par mois' : ''}${b.honoraires ? ` (${b.honoraires})` : ''}.`);
  }

  parts.push('Contactez-nous pour organiser une visite !');

  // Paragraphes : accroche + composition / pièces / état+prestations+énergie / frais+prix+contact
  return parts.join('\n\n').replace(/ {2,}/g, ' ');
}
