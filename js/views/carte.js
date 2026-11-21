// Carte des biens (OpenStreetMap + Leaflet). Les adresses sont localisées grâce au service public
// api-adresse.data.gouv.fr ; les coordonnées sont mémorisées dans le bien (pas de nouvel envoi ensuite).
import { h, icon, toast, fmtPrice } from '../ui.js';
import { listBiens, putBienSilently } from '../db.js';
import { STATUTS } from '../config.js';
import { setTopbar, isCurrent } from '../app.js';

const COLORS = { disponible: '#1e8a4c', option: '#d9822b', vendu: '#1f5fa8', archive: '#7a8591' };
let leafletPromise = null;

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!leafletPromise) {
    leafletPromise = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.append(css);
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      s.onload = () => resolve(window.L);
      s.onerror = () => { leafletPromise = null; reject(new Error('Carte indisponible')); };
      document.head.append(s);
    });
  }
  return leafletPromise;
}

const queryOf = (b) => [b.adresse, b.codePostal, b.ville].filter(Boolean).join(' ').trim();

async function geocode(bien) {
  const q = queryOf(bien);
  if (!bien.ville && !bien.codePostal) return null;
  if (bien.geo && bien.geo.q === q) return bien.geo;
  const url = 'https://api-adresse.data.gouv.fr/search/?limit=1&q=' + encodeURIComponent(q)
    + (/^\d{5}$/.test(bien.codePostal || '') ? '&postcode=' + bien.codePostal : '');
  const res = await fetch(url);
  if (!res.ok) throw new Error('Localisation impossible');
  const json = await res.json();
  const f = json.features && json.features[0];
  if (!f) return null;
  const [lon, lat] = f.geometry.coordinates;
  bien.geo = { lat, lon, q, precision: f.properties.type }; // housenumber, street, municipality…
  await putBienSilently(bien);
  return bien.geo;
}

const state = { tous: false };

export async function renderCarte(view, token) {
  setTopbar({ title: 'Carte des biens', back: '#/biens' });
  const mapEl = h('div', { class: 'map' });
  const status = h('p', { class: 'small muted map-status' }, 'Chargement de la carte…');
  const toggle = h('label', { class: 'check-row map-toggle' },
    h('input', { type: 'checkbox', checked: state.tous, onchange: (e) => { state.tous = e.target.checked; window.dispatchEvent(new HashChangeEvent('hashchange')); } }),
    h('span', null, 'Afficher aussi les biens vendus / archivés'));
  view.append(h('div', { class: 'carte' },
    h('div', { class: 'map-legend' }, STATUTS.map((s) => h('span', { class: 'legend-item' }, h('span', { class: 'dot', style: { background: COLORS[s.value] } }), s.label))),
    mapEl, status, toggle,
    h('p', { class: 'small muted' }, 'Les adresses sont envoyées au service public api-adresse.data.gouv.fr pour être placées sur la carte (une seule fois par adresse). Une adresse sans numéro est placée au centre de la rue ou de la ville.')));

  let L;
  try {
    L = await loadLeaflet();
  } catch (e) {
    status.textContent = 'La carte nécessite une connexion Internet.';
    return;
  }
  if (!isCurrent(token)) return;

  const map = L.map(mapEl, { zoomControl: true }).setView([46.6, 2.4], 6);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  const biens = (await listBiens()).filter((b) => state.tous || (b.statut !== 'vendu' && b.statut !== 'archive'));
  const points = [];
  let missing = 0;
  let i = 0;
  for (const b of biens) {
    if (!isCurrent(token)) return;
    i++;
    status.textContent = `Localisation des biens ${i}/${biens.length}…`;
    let geo = null;
    try { geo = await geocode(b); } catch (e) { /* hors ligne ou service indisponible */ }
    if (!geo) { missing++; continue; }
    const popup = h('div', { class: 'map-popup' },
      h('strong', null, b.titre || 'Sans titre'),
      h('div', null, [b.prix ? fmtPrice(b.prix) : '', b.ville].filter(Boolean).join(' · ')),
      geo.precision !== 'housenumber' ? h('div', { class: 'small muted' }, 'Position approximative') : null,
      h('a', { href: `#/bien/${encodeURIComponent(b.id)}` }, 'Voir la fiche →'));
    L.circleMarker([geo.lat, geo.lon], {
      radius: 10, weight: 3, color: '#fff', fillColor: COLORS[b.statut || 'disponible'] || COLORS.disponible, fillOpacity: 1,
    }).bindPopup(popup).addTo(map);
    points.push([geo.lat, geo.lon]);
  }
  if (points.length) map.fitBounds(points, { padding: [40, 40], maxZoom: 15 });
  status.textContent = `${points.length} bien${points.length > 1 ? 's' : ''} sur la carte`
    + (missing ? ` · ${missing} sans adresse ou ville localisable` : '');
  setTimeout(() => map.invalidateSize(), 200);
  if (!biens.length) toast('Aucun bien à afficher');
}
