// Service worker : permet à l'application de fonctionner hors-ligne.
// Stratégie « réseau d'abord » : toujours la dernière version si connecté,
// la copie en cache sinon. Incrémenter VERSION à chaque mise en ligne.
const VERSION = 'portimmo-v12';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'fonts/nunito-latin.woff2',
  'fonts/nunito-latin-ext.woff2',
  'js/app.js',
  'js/agence.js',
  'js/backup.js',
  'js/contacts.js',
  'js/matching.js',
  'js/minifiche.js',
  'js/pdf/vitrine.js',
  'js/views/contacts.js',
  'js/views/carte.js',
  'js/views/dashboard.js',
  'js/views/simulateur.js',
  'js/config.js',
  'js/db.js',
  'js/demo.js',
  'js/dialogs.js',
  'js/describe.js',
  'js/format.js',
  'js/views/journal.js',
  'js/views/docs.js',
  'js/views/cropper.js',
  'js/pdf/writer.js',
  'js/pdf/annonce.js',
  'js/views/share.js',
  'js/images.js',
  'js/ui.js',
  'js/views/list.js',
  'js/views/detail.js',
  'js/views/form.js',
  'js/views/lightbox.js',
  'js/views/settings.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    // cache: 'no-cache' -> revalide auprès du serveur pour toujours avoir la dernière version
    fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
  );
});
