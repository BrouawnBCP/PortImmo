// Fenêtre « Annonce PDF » : options -> création -> partager / télécharger / ouvrir.
import { h, icon, openOverlay, toast } from '../ui.js';
import { listPhotos, getMeta } from '../db.js';
import { buildAnnoncePdf, pdfFileName, DEFAULT_OPTIONS } from '../pdf/annonce.js';

const OPTIONS = [
  { key: 'prix', label: 'Afficher le prix' },
  { key: 'adresse', label: "Afficher l'adresse exacte" },
  { key: 'photos', label: 'Ajouter toutes les photos par pièce' },
  { key: 'complements', label: 'Ajouter les informations complémentaires' },
];

// Les options choisies sont mémorisées sur l'appareil.
function loadOptions() {
  try { return { ...DEFAULT_OPTIONS, ...JSON.parse(localStorage.getItem('portimmo-pdf-options') || '{}') }; } catch (e) { return { ...DEFAULT_OPTIONS }; }
}
function saveOptions(o) {
  try { localStorage.setItem('portimmo-pdf-options', JSON.stringify(o)); } catch (e) { /* ignore */ }
}

const fmtSize = (b) => (b > 1e6 ? (b / 1e6).toFixed(1) + ' Mo' : Math.round(b / 1e3) + ' ko');

function canShareFiles() {
  try {
    return !!(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'test.pdf', { type: 'application/pdf' })] }));
  } catch (e) { return false; }
}

export function openPdfDialog(bien) {
  const opts = loadOptions();
  let url = null;
  const cleanup = () => { if (url) { const u = url; url = null; setTimeout(() => URL.revokeObjectURL(u), 60000); } };
  const body = h('div', { class: 'pdf-dialog' });
  const ctl = openOverlay([h('div', { class: 'sheet-title' }, 'Annonce PDF'), body], { kind: 'dialog', onClose: cleanup });

  // ---- Étape 1 : options ----
  const checks = OPTIONS.map((o) => {
    const input = h('input', { type: 'checkbox', checked: !!opts[o.key] });
    input.addEventListener('change', () => { opts[o.key] = input.checked; });
    return h('label', { class: 'check-row' }, input, h('span', null, o.label));
  });
  body.append(
    ...checks,
    h('p', { class: 'small muted pdf-note' }, '🔒 Le propriétaire et les notes privées ne sont jamais inclus.'),
    h('div', { class: 'dialog-actions' },
      h('button', { class: 'btn', type: 'button', onclick: () => ctl.close() }, 'Annuler'),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: generate }, 'Créer le PDF')),
  );

  // ---- Étape 2 : création ----
  async function generate() {
    saveOptions(opts);
    const status = h('p', { class: 'pdf-status' }, 'Création du PDF…');
    body.replaceChildren(h('div', { class: 'spinner' }), status);
    try {
      const [photos, agence] = await Promise.all([listPhotos(bien.id), getMeta('agence')]);
      const blob = await buildAnnoncePdf(bien, photos, agence || {}, opts, (t) => { status.textContent = t; });
      ready(new File([blob], pdfFileName(bien), { type: 'application/pdf' }), !agence || !agence.nom);
    } catch (e) {
      console.error(e);
      body.replaceChildren(
        h('p', null, 'La création du PDF a échoué.'),
        h('p', { class: 'small muted' }, String(e.message || e)),
        h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => ctl.close() }, 'Fermer')));
    }
  }

  // ---- Étape 3 : PDF prêt ----
  // (le partage doit partir d'un nouveau toucher, sinon iPhone le refuse)
  function ready(file, noAgency) {
    url = URL.createObjectURL(file);
    const actions = [];
    if (canShareFiles()) {
      actions.push(h('button', { class: 'btn btn-primary', type: 'button', onclick: async () => {
        try {
          await navigator.share({ files: [file], title: bien.titre || 'Annonce' });
        } catch (e) {
          if (e.name !== 'AbortError') { console.error(e); toast('Partage impossible, utilisez « Télécharger »'); }
        }
      } }, icon('share'), 'Partager'));
    }
    actions.push(h('button', { class: 'btn' + (actions.length ? '' : ' btn-primary'), type: 'button', onclick: () => {
      const a = h('a', { href: url, download: file.name });
      document.body.append(a);
      a.click();
      a.remove();
    } }, icon('download'), 'Télécharger'));
    actions.push(h('a', { class: 'btn', href: url, target: '_blank', rel: 'noopener' }, icon('eye'), 'Ouvrir'));

    body.replaceChildren(...[
      h('div', { class: 'pdf-ready' }, icon('file', 'icon-xl'),
        h('div', null, h('div', { class: 'pdf-name' }, file.name), h('div', { class: 'small muted' }, fmtSize(file.size)))),
      noAgency ? h('p', { class: 'small muted pdf-note' }, 'Astuce : renseignez les coordonnées de l’agence dans Réglages pour les afficher sur le PDF.') : null,
      h('div', { class: 'pdf-actions' }, actions),
      h('button', { class: 'btn btn-ghost pdf-close', type: 'button', onclick: () => ctl.close() }, 'Fermer'),
    ].filter(Boolean));
  }
}
