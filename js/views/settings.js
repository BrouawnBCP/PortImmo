import { h, icon, toast, confirmDialog } from '../ui.js';
import { exportAll, importAll, listBiens } from '../db.js';
import { setTopbar, installPrompt } from '../app.js';

const fmtSize = (b) => (b > 1e9 ? (b / 1e9).toFixed(1) + ' Go' : (b / 1e6).toFixed(1) + ' Mo');

export async function renderSettings(view) {
  setTopbar({ title: 'Réglages' });
  const biens = await listBiens();

  const storage = h('p', { class: 'muted' }, 'Calcul en cours…');
  if (navigator.storage && navigator.storage.estimate) {
    navigator.storage.estimate().then(async ({ usage, quota }) => {
      const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
      storage.textContent = `${biens.length} bien${biens.length > 1 ? 's' : ''} · ${fmtSize(usage || 0)} utilisés sur ${fmtSize(quota || 0)} disponibles`
        + (persisted ? ' · stockage protégé ✔' : '');
    });
  } else {
    storage.textContent = `${biens.length} biens`;
  }

  const isStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

  const installCard = isStandalone
    ? h('p', { class: 'muted' }, '✔ L’application est installée sur cet appareil.')
    : installPrompt
      ? h('button', {
        class: 'btn btn-primary', type: 'button',
        onclick: async () => { installPrompt.prompt(); await installPrompt.userChoice; },
      }, icon('download'), 'Installer l’application')
      : h('div', { class: 'muted' },
        isIos
          ? h('p', null, 'Sur iPhone / iPad (Safari) : touchez le bouton ', h('strong', null, 'Partager'), ' puis ', h('strong', null, '« Sur l’écran d’accueil »'), '.')
          : h('p', null, 'Sur Android (Chrome) : menu ', h('strong', null, '⋮'), ' puis ', h('strong', null, '« Installer l’application »'), '. Sur ordinateur : icône d’installation dans la barre d’adresse.'));

  const fileInput = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' }, onchange: onImport });

  view.append(h('div', { class: 'settings' },
    h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h3', null, 'Installation')),
      installCard),
    h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h3', null, 'Données')),
      storage,
      h('p', { class: 'small' }, 'Les biens et photos sont enregistrés sur cet appareil uniquement. Faites une sauvegarde régulièrement (ou pour transférer vers un autre appareil).'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', onclick: onExport }, icon('download'), 'Exporter une sauvegarde'),
        h('button', { class: 'btn', type: 'button', onclick: () => fileInput.click() }, icon('upload'), 'Restaurer une sauvegarde')),
      fileInput),
    h('p', { class: 'muted small meta' }, "Port'Immo · version 0.1")));

  async function onExport() {
    toast('Préparation de la sauvegarde…', 0);
    try {
      const data = await exportAll();
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const name = `portimmo-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
      const file = new File([blob], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] }) && /android|iphone|ipad/i.test(navigator.userAgent)) {
        await navigator.share({ files: [file], title: name });
      } else {
        const a = h('a', { href: URL.createObjectURL(blob), download: name });
        document.body.append(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      }
      toast(`Sauvegarde exportée (${fmtSize(blob.size)})`);
    } catch (e) {
      if (e.name === 'AbortError') { toast('Export annulé'); return; }
      console.error(e);
      toast('Erreur lors de l’export');
    }
  }

  async function onImport() {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    const ok = await confirmDialog('Restaurer cette sauvegarde ? Les biens existants portant le même identifiant seront remplacés, les autres seront conservés.', { okLabel: 'Restaurer' });
    if (!ok) return;
    toast('Restauration en cours…', 0);
    try {
      const data = JSON.parse(await file.text());
      const r = await importAll(data);
      toast(`${r.biens} biens et ${r.photos} photos restaurés`);
      location.hash = '#/';
    } catch (e) {
      console.error(e);
      toast('Fichier de sauvegarde invalide');
    }
  }
}
