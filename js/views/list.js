import { h, icon, blobUrl, fmtPrice, fmtNum } from '../ui.js';
import { listBiens, getCoverThumb, countPhotos, listAcquereurs } from '../db.js';
import { STATUTS } from '../config.js';
import { setTopbar } from '../app.js';
import { backupReminder } from '../backup.js';

const FILTRES = [
  { id: 'actifs', label: 'Actifs', test: (b) => b.statut !== 'archive' },
  { id: 'disponible', label: 'Disponibles', test: (b) => (b.statut || 'disponible') === 'disponible' },
  { id: 'option', label: 'Sous offre', test: (b) => b.statut === 'option' },
  { id: 'vendu', label: 'Vendus / Loués', test: (b) => b.statut === 'vendu' },
  { id: 'archive', label: 'Archivés', test: (b) => b.statut === 'archive' },
  { id: 'tous', label: 'Tous', test: () => true },
];

const TRIS = [
  { id: 'recent', label: 'Plus récents', fn: (a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '') },
  { id: 'prix-asc', label: 'Prix croissant', fn: (a, b) => (Number(a.prix) || Infinity) - (Number(b.prix) || Infinity) },
  { id: 'prix-desc', label: 'Prix décroissant', fn: (a, b) => (Number(b.prix) || 0) - (Number(a.prix) || 0) },
  { id: 'surface', label: 'Surface', fn: (a, b) => (Number(b.surfaceHabitable) || 0) - (Number(a.surfaceHabitable) || 0) },
  { id: 'ville', label: 'Ville (A→Z)', fn: (a, b) => (a.ville || '').localeCompare(b.ville || '', 'fr') },
  { id: 'vendeur', label: 'Vendeur (A→Z)', fn: null }, // tri calculé avec les fiches contact (voir refresh)
];

// L'état des filtres est conservé pendant la session.
const state = { q: '', filtre: 'actifs', tri: 'recent', vendeur: '' };

export function statutInfo(value) {
  return STATUTS.find((s) => s.value === value) || STATUTS[0];
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export async function renderList(view) {
  setTopbar({ title: 'Mes Biens' });
  const [biens, contacts] = await Promise.all([listBiens(), listAcquereurs()]);
  const contactById = Object.fromEntries(contacts.map((c) => [c.id, c]));
  const vendeurOf = (b) => (b.vendeurId && contactById[b.vendeurId]) || null;
  const vendeurName = (b) => {
    const v = vendeurOf(b);
    return v ? [v.prenom, v.nom].filter(Boolean).join(' ') : b.proprioNom || '';
  };
  /** Nom de famille (ou prénom à défaut) pour le badge et le tri. */
  const vendeurLast = (b) => {
    const v = vendeurOf(b);
    return v ? (v.nom || v.prenom || '') : '';
  };

  const results = h('div', { class: 'cards' });
  const count = h('div', { class: 'list-count muted' });

  // Filtre par vendeur (affiché seulement s'il existe des biens liés à un vendeur)
  const vendeurIds = [...new Set(biens.map((b) => b.vendeurId).filter((id) => id && contactById[id]))];
  if (state.vendeur && state.vendeur !== '__none' && !vendeurIds.includes(state.vendeur)) state.vendeur = '';
  const vendeurFilter = vendeurIds.length ? h('label', { class: 'vendeur-filter' },
    icon('user'),
    h('select', {
      class: 'input select-sm', 'aria-label': 'Filtrer par vendeur',
      onchange: (e) => { state.vendeur = e.target.value; refresh(); },
      value: state.vendeur,
    },
    h('option', { value: '' }, 'Tous les vendeurs'),
    vendeurIds
      .map((id) => contactById[id])
      .sort((a, b) => (a.nom || a.prenom || '').localeCompare(b.nom || b.prenom || '', 'fr'))
      .map((c) => h('option', { value: c.id }, `${[c.nom, c.prenom].filter(Boolean).join(' ')} (${biens.filter((b) => b.vendeurId === c.id).length})`)),
    h('option', { value: '__none' }, 'Sans vendeur lié'))) : null;

  const search = h('input', {
    class: 'input search-input', type: 'search', placeholder: 'Rechercher (titre, ville, réf., vendeur…)', value: state.q,
    oninput: (e) => { state.q = e.target.value; refresh(); },
  });
  const chips = h('div', { class: 'chips chips-scroll' }, FILTRES.map((f) =>
    h('button', {
      class: 'chip' + (state.filtre === f.id ? ' active' : ''), type: 'button', 'data-id': f.id,
      onclick: () => {
        state.filtre = f.id;
        chips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.dataset.id === f.id));
        refresh();
      },
    }, f.label)));
  const sort = h('select', {
    class: 'input select-sm', 'aria-label': 'Trier', onchange: (e) => { state.tri = e.target.value; refresh(); },
    value: state.tri,
  }, TRIS.map((t) => h('option', { value: t.id }, t.label)));

  view.append(
    ...[await backupReminder()].filter(Boolean),
    h('div', { class: 'list-toolbar' },
      h('div', { class: 'search' }, icon('search'), search),
      chips,
      vendeurFilter,
      h('div', { class: 'list-meta' }, count, h('div', { class: 'list-meta-right' },
        h('a', { class: 'btn btn-sm', href: '#/carte' }, icon('map'), 'Carte'),
        sort))),
    results,
    h('a', { class: 'fab', href: '#/bien/nouveau', 'aria-label': 'Ajouter un bien' }, icon('plus'), h('span', null, 'Ajouter un bien')),
  );

  function refresh() {
    const filtre = FILTRES.find((f) => f.id === state.filtre) || FILTRES[0];
    const q = norm(state.q).trim();
    const list = biens
      .filter(filtre.test)
      .filter((b) => !q || norm([b.titre, b.ville, b.codePostal, b.reference, b.adresse, b.quartier, b.typeBien, vendeurName(b)].join(' ')).includes(q))
      .filter((b) => !state.vendeur || (state.vendeur === '__none' ? !vendeurOf(b) : b.vendeurId === state.vendeur))
      .sort(state.tri === 'vendeur'
        // Biens sans vendeur à la fin
        ? (a, b) => (vendeurLast(a) ? 0 : 1) - (vendeurLast(b) ? 0 : 1) || vendeurLast(a).localeCompare(vendeurLast(b), 'fr')
        : (TRIS.find((t) => t.id === state.tri) || TRIS[0]).fn);

    results.replaceChildren();
    count.textContent = `${list.length} bien${list.length > 1 ? 's' : ''}`;

    if (!biens.length) {
      results.append(h('div', { class: 'empty' },
        icon('home', 'icon-xl'),
        h('h2', null, 'Aucun bien pour le moment'),
        h('p', { class: 'muted' }, 'Ajoutez votre premier bien pour commencer votre portefeuille.'),
        h('a', { class: 'btn btn-primary', href: '#/bien/nouveau' }, icon('plus'), 'Ajouter un bien')));
      return;
    }
    if (!list.length) {
      results.append(h('div', { class: 'empty' }, h('p', { class: 'muted' }, 'Aucun bien ne correspond à la recherche.')));
      return;
    }
    list.forEach((b) => results.append(card(b, vendeurLast(b))));
  }

  refresh();
}

function card(b, vendeur = '') {
  const st = statutInfo(b.statut);
  const cover = h('div', { class: 'card-cover' }, icon('image', 'icon-placeholder'));
  const photoCount = h('span', { class: 'photo-count', hidden: true });
  cover.append(photoCount);

  // Chargement asynchrone de la miniature.
  getCoverThumb(b).then((blob) => {
    if (!blob) return;
    const img = h('img', { src: blobUrl(blob), alt: '', loading: 'lazy' });
    cover.querySelector('.icon-placeholder')?.remove();
    cover.prepend(img);
  });
  countPhotos(b.id).then((n) => {
    if (n) { photoCount.hidden = false; photoCount.replaceChildren(icon('camera'), String(n)); }
  });

  const facts = [
    b.surfaceHabitable ? [icon('surface'), `${fmtNum(b.surfaceHabitable)} m²`] : null,
    b.nbPieces ? [icon('grid'), `${b.nbPieces} p.`] : null,
    b.nbChambres ? [icon('bed'), `${b.nbChambres} ch.`] : null,
    b.surfaceTerrain ? [icon('tree'), `${fmtNum(b.surfaceTerrain)} m²`] : null,
  ].filter(Boolean);

  const lieu = [b.ville, b.codePostal ? `(${b.codePostal})` : ''].filter(Boolean).join(' ');

  return h('a', { class: 'card', href: `#/bien/${encodeURIComponent(b.id)}` },
    cover,
    h('div', { class: 'card-body' },
      h('div', { class: 'card-top' },
        h('span', { class: `badge badge-${st.color}` }, st.label),
        b.transaction ? h('span', { class: 'badge badge-outline' }, b.transaction) : null,
        vendeur ? h('span', { class: 'badge badge-vendeur', title: 'Vendeur' }, icon('user'), vendeur) : null,
        b.reference ? h('span', { class: 'card-ref muted' }, b.reference) : null),
      h('div', { class: 'card-title' }, b.titre || 'Sans titre'),
      h('div', { class: 'card-price' }, fmtPrice(b.prix) + (b.prix && b.transaction === 'Location' ? ' /mois' : '')),
      lieu || b.typeBien ? h('div', { class: 'card-place muted' }, icon('pin'), [b.typeBien, lieu].filter(Boolean).join(' · ')) : null,
      facts.length ? h('div', { class: 'facts' }, facts.map((f) => h('span', { class: 'fact' }, f))) : null));
}
