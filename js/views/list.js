import { h, icon, blobUrl, fmtPrice, fmtNum } from '../ui.js';
import { listBiens, getCoverThumb, countPhotos } from '../db.js';
import { STATUTS } from '../config.js';
import { setTopbar } from '../app.js';

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
];

// L'état des filtres est conservé pendant la session.
const state = { q: '', filtre: 'actifs', tri: 'recent' };

export function statutInfo(value) {
  return STATUTS.find((s) => s.value === value) || STATUTS[0];
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export async function renderList(view) {
  setTopbar({ title: 'Mes Biens' });
  const biens = await listBiens();

  const results = h('div', { class: 'cards' });
  const count = h('div', { class: 'list-count muted' });

  const search = h('input', {
    class: 'input search-input', type: 'search', placeholder: 'Rechercher (titre, ville, réf…)', value: state.q,
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
    h('div', { class: 'list-toolbar' },
      h('div', { class: 'search' }, icon('search'), search),
      chips,
      h('div', { class: 'list-meta' }, count, sort)),
    results,
    h('a', { class: 'fab', href: '#/bien/nouveau', 'aria-label': 'Ajouter un bien' }, icon('plus'), h('span', null, 'Ajouter un bien')),
  );

  function refresh() {
    const filtre = FILTRES.find((f) => f.id === state.filtre) || FILTRES[0];
    const q = norm(state.q).trim();
    const list = biens
      .filter(filtre.test)
      .filter((b) => !q || norm([b.titre, b.ville, b.codePostal, b.reference, b.adresse, b.quartier, b.typeBien, b.proprioNom].join(' ')).includes(q))
      .sort((TRIS.find((t) => t.id === state.tri) || TRIS[0]).fn);

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
    list.forEach((b) => results.append(card(b)));
  }

  refresh();
}

function card(b) {
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
        b.reference ? h('span', { class: 'card-ref muted' }, b.reference) : null),
      h('div', { class: 'card-title' }, b.titre || 'Sans titre'),
      h('div', { class: 'card-price' }, fmtPrice(b.prix) + (b.prix && b.transaction === 'Location' ? ' /mois' : '')),
      lieu || b.typeBien ? h('div', { class: 'card-place muted' }, icon('pin'), [b.typeBien, lieu].filter(Boolean).join(' · ')) : null,
      facts.length ? h('div', { class: 'facts' }, facts.map((f) => h('span', { class: 'fact' }, f))) : null));
}
