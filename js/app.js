import { h, clear, icon, hydrateIcons, releaseBlobUrls, toast } from './ui.js';
import { renderList } from './views/list.js';
import { renderDetail } from './views/detail.js';
import { renderForm } from './views/form.js';
import { renderSettings } from './views/settings.js';

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

const routes = [
  { re: /^\/?$/, tab: 'biens', render: () => renderList(view) },
  { re: /^\/bien\/nouveau$/, tab: 'biens', render: () => renderForm(view, null) },
  { re: /^\/bien\/([^/]+)\/modifier$/, tab: 'biens', render: (m) => renderForm(view, m[1]) },
  { re: /^\/bien\/([^/]+)$/, tab: 'biens', render: (m, t) => renderDetail(view, m[1], t) },
  { re: /^\/reglages$/, tab: 'reglages', render: () => renderSettings(view) },
];

let renderToken = 0;
export async function router() {
  const path = decodeURIComponent((location.hash || '#/').slice(1));
  const token = ++renderToken;
  releaseBlobUrls();
  document.querySelectorAll('.overlay, .lightbox').forEach((el) => el.remove());
  document.body.classList.remove('no-scroll');
  clear(view);
  window.scrollTo(0, 0);
  for (const r of routes) {
    const m = path.match(r.re);
    if (!m) continue;
    tabbar.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === r.tab));
    try {
      await r.render(m, token);
    } catch (err) {
      console.error(err);
      if (token === renderToken) {
        view.append(h('div', { class: 'empty' }, h('p', null, 'Une erreur est survenue.'), h('p', { class: 'muted' }, String(err.message || err))));
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
