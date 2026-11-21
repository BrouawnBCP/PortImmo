import { h, clear, icon, hydrateIcons, releaseBlobUrls, toast } from './ui.js';
import { renderList } from './views/list.js';
import { renderDetail } from './views/detail.js';
import { renderForm } from './views/form.js';
import { renderSettings } from './views/settings.js';
import { renderDashboard } from './views/dashboard.js';
import { renderCarte } from './views/carte.js';
import { renderContacts, renderContact, renderContactForm, migrateVendeurs } from './views/contacts.js';
import { getMeta, setMeta } from './db.js';
import { renderSimulateur } from './views/simulateur.js';
import { loadDemoOnFirstLaunch } from './demo.js';

const view = document.getElementById('view');
const topbar = document.getElementById('topbar');
const tabbar = document.getElementById('tabbar');

/** Chaque écran configure la barre du haut via cette fonction. */
export function setTopbar({ title = "Port'Immo", back = null, actions = [] } = {}) {
  clear(topbar);
  if (back) {
    topbar.append(h('a', { class: 'icon-btn', href: back, 'aria-label': 'Retour' }, icon('back')));
  }
  topbar.append(h('h1', { class: 'topbar-title' + (back ? '' : ' brand') }, title));
  const right = h('div', { class: 'topbar-actions' });
  actions.forEach((a) => right.append(
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': a.label, title: a.label, onclick: a.onClick }, icon(a.icon))));
  topbar.append(right);
}

// Chaque écran est rendu dans un conteneur neuf : si l'utilisateur change d'écran
// pendant un chargement, l'ancien rendu s'écrit dans un conteneur détaché (invisible).
const routes = [
  { re: /^\/?$/, tab: 'accueil', render: (m, t, c) => renderDashboard(c) },
  { re: /^\/biens$/, tab: 'biens', render: (m, t, c) => renderList(c) },
  { re: /^\/carte$/, tab: 'biens', render: (m, t, c) => renderCarte(c, t) },
  { re: /^\/bien\/nouveau$/, tab: 'biens', render: (m, t, c) => renderForm(c, null) },
  { re: /^\/bien\/nouveau\/vendeur\/([^/]+)$/, tab: 'biens', render: (m, t, c) => renderForm(c, null, { vendeurId: m[1] }) },
  { re: /^\/bien\/([^/]+)\/modifier$/, tab: 'biens', render: (m, t, c) => renderForm(c, m[1]) },
  { re: /^\/bien\/([^/]+)$/, tab: 'biens', render: (m, t, c) => renderDetail(c, m[1], t) },
  { re: /^\/(?:contacts|acquereurs)$/, tab: 'contacts', render: (m, t, c) => renderContacts(c) },
  { re: /^\/(?:contact|acquereur)\/nouveau(?:\/(acquereur|vendeur))?$/, tab: 'contacts', render: (m, t, c) => renderContactForm(c, null, m[1] || null) },
  { re: /^\/(?:contact|acquereur)\/([^/]+)\/modifier$/, tab: 'contacts', render: (m, t, c) => renderContactForm(c, m[1]) },
  { re: /^\/(?:contact|acquereur)\/([^/]+)$/, tab: 'contacts', render: (m, t, c) => renderContact(c, m[1], t) },
  { re: /^\/simulateur(?:\/([^/]+))?$/, tab: 'simulateur', render: (m, t, c) => renderSimulateur(c, m[1] || null) },
  { re: /^\/reglages$/, tab: 'reglages', render: (m, t, c) => renderSettings(c) },
];

let renderToken = 0;
export async function router() {
  const path = decodeURIComponent((location.hash || '#/').slice(1));
  const token = ++renderToken;
  releaseBlobUrls();
  document.querySelectorAll('.overlay, .lightbox, .cropper').forEach((el) => el.remove());
  document.body.classList.remove('no-scroll');
  const container = document.createElement('div');
  view.replaceChildren(container);
  window.scrollTo(0, 0);
  for (const r of routes) {
    const m = path.match(r.re);
    if (!m) continue;
    tabbar.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === r.tab));
    try {
      await r.render(m, token, container);
    } catch (err) {
      console.error(err);
      if (token === renderToken) {
        container.append(h('div', { class: 'empty' }, h('p', null, 'Une erreur est survenue.'), h('p', { class: 'muted' }, String(err.message || err))));
      }
    }
    return;
  }
  location.hash = '#/';
}

export function isCurrent(token) { return token === renderToken; }

window.addEventListener('hashchange', router);
hydrateIcons();
router();

// Migration unique : anciens « propriétaires » des biens -> fiches Contact vendeur.
(async () => {
  try {
    if (await getMeta('migration-vendeurs')) return;
    const n = await migrateVendeurs();
    await setMeta('migration-vendeurs', new Date().toISOString());
    if (n) { toast(`${n} fiche${n > 1 ? 's' : ''} vendeur créée${n > 1 ? 's' : ''} à partir des propriétaires`); router(); }
  } catch (e) { console.warn('Migration vendeurs', e); }
})();

// Premier lancement : ajoute l'annonce d'exemple puis rafraîchit l'écran.
loadDemoOnFirstLaunch().then((loaded) => {
  if (!loaded) return;
  toast("Annonce d'exemple chargée");
  // rafraîchit l'écran sauf pendant une saisie
  if (!/\/(modifier|nouveau)$/.test(location.hash)) router();
});

// ---------- Service worker (fonctionnement hors-ligne + installation) ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW non enregistré', e));
  });
}

// Demande au navigateur de ne pas effacer les données en cas de manque de place.
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persisted().then((p) => { if (!p) navigator.storage.persist(); });
}

// Invite d'installation (Android / ordinateur avec Chrome ou Edge).
export let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
});
window.addEventListener('appinstalled', () => { installPrompt = null; toast('Application installée ✔'); });
