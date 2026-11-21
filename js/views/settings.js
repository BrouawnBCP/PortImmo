import { h, icon, toast, confirmDialog, blobUrl, pickFiles } from '../ui.js';
import { importAll, listBiens, setMeta, setLogo, getLogo } from '../db.js';
import { setTopbar, installPrompt } from '../app.js';
import { loadDemo } from '../demo.js';
import { getAgence } from '../agence.js';
import { exportBackup, daysSinceBackup } from '../backup.js';
import { loadImage } from '../images.js';

const AGENCE_FIELDS = [
  { key: 'nom', label: "Nom de l'agence", placeholder: 'Ex : Agence du Cannet', full: true },
  { key: 'conseiller', label: 'Conseiller', placeholder: 'Ex : Jean Dupont' },
  { key: 'telephone', label: 'Téléphone', type: 'tel' },
  { key: 'email', label: 'E-mail', type: 'email' },
  { key: 'site', label: 'Site web', placeholder: 'Ex : www.mon-agence.fr' },
];

const SIMU_FIELDS = [
  { key: 'honorairesPct', label: 'Honoraires par défaut', unit: '% TTC' },
  { key: 'honorairesCharge', label: 'À la charge de', type: 'select', options: [['acquereur', "l'acquéreur"], ['vendeur', 'du vendeur']] },
  { key: 'notairePctAncien', label: 'Frais de notaire (ancien)', unit: '%' },
  { key: 'notairePctNeuf', label: 'Frais de notaire (neuf)', unit: '%' },
];

const fmtSize = (b) => (b > 1e9 ? (b / 1e9).toFixed(1) + ' Go' : (b / 1e6).toFixed(1) + ' Mo');
const num = (v) => { const n = Number(String(v).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };

/** Logo : redimensionné (800 px max) et enregistré en PNG (garde la transparence). */
async function prepareLogo(file) {
  const img = await loadImage(file);
  const scale = Math.min(1, 800 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise((resolve) => c.toBlob(resolve, 'image/png'));
}

export async function renderSettings(view) {
  setTopbar({ title: 'Réglages' });
  const [biens, agence, logo, days] = await Promise.all([listBiens(), getAgence(), getLogo(), daysSinceBackup()]);

  // ---------- Agence ----------
  const field = (f, prefix) => h('div', { class: 'field' + (f.full ? ' full' : '') },
    h('label', { for: prefix + f.key }, f.label),
    f.type === 'select'
      ? h('select', { class: 'input', id: prefix + f.key, name: f.key, value: agence[f.key] }, f.options.map(([v, l]) => h('option', { value: v }, l)))
      : f.unit
        ? h('div', { class: 'input-unit' }, h('input', { class: 'input', id: prefix + f.key, name: f.key, inputmode: 'decimal', value: String(agence[f.key] ?? '').replace('.', ',') }), h('span', { class: 'unit' }, f.unit))
        : h('input', { class: 'input', id: prefix + f.key, name: f.key, type: f.type || 'text', placeholder: f.placeholder || '', value: agence[f.key] || '' }));

  const logoPreview = h('div', { class: 'logo-preview' });
  const drawLogo = (blob) => {
    logoPreview.replaceChildren(blob
      ? h('img', { src: blobUrl(blob), alt: 'Logo' })
      : h('span', { class: 'muted small' }, 'Aucun logo'));
  };
  drawLogo(logo);

  const agenceForm = h('form', { class: 'form-grid', onsubmit: async (e) => {
    e.preventDefault();
    const value = { ...agence };
    for (const f of AGENCE_FIELDS) value[f.key] = agenceForm.elements[f.key].value.trim();
    for (const f of SIMU_FIELDS) {
      const raw = agenceForm.elements[f.key].value;
      if (f.type === 'select') { value[f.key] = raw; continue; }
      const n = num(raw);
      if (n === null || n < 0) { toast(`« ${f.label} » doit être un nombre`); return; }
      value[f.key] = n;
    }
    await setMeta('agence', value);
    toast('Réglages enregistrés');
  } },
  AGENCE_FIELDS.map((f) => field(f, 'ag-')),
  h('div', { class: 'field full' },
    h('label', null, 'Logo (affiché sur les PDF et la mini-fiche)'),
    h('div', { class: 'logo-row' },
      logoPreview,
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn btn-sm', type: 'button', onclick: async () => {
          const [file] = await pickFiles({ accept: 'image/*' });
          if (!file) return;
          try {
            const blob = await prepareLogo(file);
            await setLogo(blob);
            drawLogo(blob);
            toast('Logo enregistré');
          } catch (err) { console.error(err); toast('Image illisible'); }
        } }, icon('image'), 'Choisir une image'),
        h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: async () => { await setLogo(null); drawLogo(null); toast('Logo retiré'); } }, 'Retirer')))),
  h('div', { class: 'field full form-subtitle' }, 'Valeurs par défaut des simulations'),
  SIMU_FIELDS.map((f) => field(f, 'si-')),
  h('div', { class: 'field full' }, h('button', { class: 'btn btn-primary', type: 'submit' }, icon('check'), 'Enregistrer')));

  // ---------- Données ----------
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
  const lastBackup = h('p', { class: 'small' + (days === null || days >= 14 ? ' warn-text' : ' muted') },
    days === null ? '⚠️ Aucune sauvegarde effectuée.' : days === 0 ? '✔ Dernière sauvegarde : aujourd’hui.' : `Dernière sauvegarde : il y a ${days} jour${days > 1 ? 's' : ''}.`);

  // ---------- Installation ----------
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
      h('div', { class: 'section-head' }, h('h3', null, 'Agence')),
      h('p', { class: 'small muted' }, 'Coordonnées et logo affichés sur les annonces PDF, la fiche vitrine et la mini-fiche. Valeurs utilisées par défaut dans le simulateur.'),
      agenceForm),
    h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h3', null, 'Données')),
      storage,
      lastBackup,
      h('p', { class: 'small' }, 'Les biens, photos, documents et acquéreurs sont enregistrés sur cet appareil uniquement. Faites une sauvegarde régulièrement (ou pour transférer vers un autre appareil).'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', onclick: async () => { if (await exportBackup()) renderAgain(); } }, icon('download'), 'Exporter une sauvegarde'),
        h('button', { class: 'btn', type: 'button', onclick: () => fileInput.click() }, icon('upload'), 'Restaurer une sauvegarde')),
      fileInput),
    h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h3', null, 'Installation')),
      installCard),
    h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h3', null, 'Annonce d’exemple')),
      h('p', { class: 'small' }, 'Une villa fictive avec photos par pièce, pour découvrir l’application.'),
      h('button', { class: 'btn', type: 'button', onclick: onDemo }, icon('home'), 'Ajouter / réinitialiser l’exemple')),
    h('p', { class: 'muted small meta' }, "Port'Immo · version 0.3")));

  function renderAgain() {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }

  async function onDemo() {
    toast('Chargement de l’exemple…', 0);
    try {
      await loadDemo();
      toast('Annonce d’exemple ajoutée');
      location.hash = '#/bien/exemple-villa';
    } catch (e) {
      console.error(e);
      toast('Impossible de charger l’exemple (connexion ?)');
    }
  }

  async function onImport() {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    const ok = await confirmDialog('Restaurer cette sauvegarde ? Les éléments existants portant le même identifiant seront remplacés, les autres seront conservés.', { okLabel: 'Restaurer' });
    if (!ok) return;
    toast('Restauration en cours…', 0);
    try {
      const data = JSON.parse(await file.text());
      const r = await importAll(data);
      toast(`${r.biens} biens, ${r.photos} photos et ${r.acquereurs} contacts restaurés`);
      location.hash = '#/biens';
    } catch (e) {
      console.error(e);
      toast('Fichier de sauvegarde invalide');
    }
  }
}
