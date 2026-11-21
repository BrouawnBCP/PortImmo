// Partage d'un bien : annonce PDF complète, fiche vitrine (PDF A4 paysage) ou mini-fiche (image).
import { h, fill, icon, openOverlay, toast, actionSheet, blobUrl, canShareFiles, downloadFile } from '../ui.js';
import { listPhotos } from '../db.js';
import { getAgenceWithLogo } from '../agence.js';
import { buildAnnoncePdf, pdfFileName, DEFAULT_OPTIONS } from '../pdf/annonce.js';
import { buildVitrinePdf } from '../pdf/vitrine.js';
import { buildMiniFiche, miniFicheText } from '../minifiche.js';

const KINDS = {
  annonce: {
    title: 'Annonce complète (PDF)',
    options: [
      { key: 'prix', label: 'Afficher le prix' },
      { key: 'adresse', label: "Afficher l'adresse exacte" },
      { key: 'photos', label: 'Ajouter toutes les photos par pièce' },
      { key: 'complements', label: 'Ajouter les informations complémentaires' },
    ],
  },
  vitrine: {
    title: 'Fiche vitrine (PDF A4 paysage)',
    intro: 'Une page à imprimer pour la vitrine : grande photo, prix, chiffres clés et étiquettes énergie.',
    options: [{ key: 'prix', label: 'Afficher le prix' }],
  },
  mini: {
    title: 'Mini-fiche (image)',
    intro: 'Une image prête à envoyer par WhatsApp, SMS ou e-mail, avec un petit texte.',
    options: [{ key: 'prix', label: 'Afficher le prix' }],
  },
};

function loadOptions() {
  try { return { ...DEFAULT_OPTIONS, ...JSON.parse(localStorage.getItem('portimmo-pdf-options') || '{}') }; } catch (e) { return { ...DEFAULT_OPTIONS }; }
}
function saveOptions(o) {
  try { localStorage.setItem('portimmo-pdf-options', JSON.stringify(o)); } catch (e) { /* ignore */ }
}

const fmtSize = (b) => (b > 1e6 ? (b / 1e6).toFixed(1) + ' Mo' : Math.round(b / 1e3) + ' ko');
const isMobile = () => /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);

/** Menu de choix du format. */
export function openShareMenu(bien) {
  actionSheet('Partager l’annonce', [
    { icon: 'message', label: 'Mini-fiche à envoyer par message', onClick: () => openShareDialog(bien, 'mini') },
    { icon: 'file', label: 'Annonce complète (PDF)', onClick: () => openShareDialog(bien, 'annonce') },
    { icon: 'printer', label: 'Fiche vitrine à imprimer (PDF)', onClick: () => openShareDialog(bien, 'vitrine') },
  ]);
}

/** Compatibilité : ancien nom. */
export const openPdfDialog = (bien) => openShareDialog(bien, 'annonce');

export function openShareDialog(bien, kind = 'annonce') {
  const def = KINDS[kind];
  const opts = loadOptions();
  const urls = [];
  const body = h('div', { class: 'pdf-dialog' });
  const ctl = openOverlay([h('div', { class: 'sheet-title' }, def.title), body], {
    kind: 'dialog',
    onClose: () => setTimeout(() => urls.forEach((u) => URL.revokeObjectURL(u)), 60000),
  });

  // ---- Étape 1 : options ----
  fill(body,
    def.intro ? h('p', { class: 'small muted pdf-note' }, def.intro) : null,
    def.options.map((o) => {
      const input = h('input', { type: 'checkbox', checked: !!opts[o.key] });
      input.addEventListener('change', () => { opts[o.key] = input.checked; });
      return h('label', { class: 'check-row' }, input, h('span', null, o.label));
    }),
    kind === 'annonce' ? h('p', { class: 'small muted pdf-note' }, '🔒 Le propriétaire et les notes privées ne sont jamais inclus.') : null,
    h('div', { class: 'dialog-actions' },
      h('button', { class: 'btn', type: 'button', onclick: () => ctl.close() }, 'Annuler'),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: generate }, 'Créer')));

  // ---- Étape 2 : création ----
  async function generate() {
    saveOptions(opts);
    const status = h('p', { class: 'pdf-status' }, 'Création…');
    fill(body, h('div', { class: 'spinner' }), status);
    const progress = (t) => { status.textContent = t; };
    try {
      const [photos, agence] = await Promise.all([listPhotos(bien.id), getAgenceWithLogo()]);
      if (kind === 'mini') {
        const blob = await buildMiniFiche(bien, photos, agence, opts);
        const name = pdfFileName(bien, 'Mini-fiche').replace(/\.pdf$/, '.jpg');
        readyImage(new File([blob], name, { type: 'image/jpeg' }), miniFicheText(bien, agence, opts));
      } else {
        const builder = kind === 'vitrine' ? buildVitrinePdf : buildAnnoncePdf;
        const blob = await builder(bien, photos, agence, opts, progress);
        const file = new File([blob], pdfFileName(bien, kind === 'vitrine' ? 'Vitrine' : 'Annonce'), { type: 'application/pdf' });
        readyPdf(file, !agence.nom);
      }
    } catch (e) {
      console.error(e);
      fill(body,
        h('p', null, 'La création a échoué.'),
        h('p', { class: 'small muted' }, String(e.message || e)),
        h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => ctl.close() }, 'Fermer')));
    }
  }

  // Le partage doit partir d'un nouveau toucher (sinon l'iPhone le refuse) -> écran « prêt ».
  async function share(file, text) {
    try {
      const data = { files: [file], title: bien.titre || 'Annonce' };
      if (text) data.text = text;
      await navigator.share(data);
    } catch (e) {
      if (e.name !== 'AbortError') { console.error(e); toast('Partage impossible, utilisez « Télécharger »'); }
    }
  }

  function readyPdf(file, noAgency) {
    const url = URL.createObjectURL(file);
    urls.push(url);
    const actions = [];
    if (canShareFiles() && isMobile()) actions.push(h('button', { class: 'btn btn-primary', type: 'button', onclick: () => share(file) }, icon('share'), 'Partager'));
    actions.push(h('button', { class: 'btn' + (actions.length ? '' : ' btn-primary'), type: 'button', onclick: () => downloadFile(file, file.name) }, icon('download'), 'Télécharger'));
    actions.push(h('a', { class: 'btn', href: url, target: '_blank', rel: 'noopener' }, icon(kind === 'vitrine' ? 'printer' : 'eye'), kind === 'vitrine' ? 'Ouvrir pour imprimer' : 'Ouvrir'));
    fill(body,
      h('div', { class: 'pdf-ready' }, icon('file', 'icon-xl'),
        h('div', null, h('div', { class: 'pdf-name' }, file.name), h('div', { class: 'small muted' }, fmtSize(file.size)))),
      noAgency ? h('p', { class: 'small muted pdf-note' }, 'Astuce : renseignez l’agence et son logo dans Réglages pour les afficher.') : null,
      h('div', { class: 'pdf-actions' }, actions),
      h('button', { class: 'btn btn-ghost pdf-close', type: 'button', onclick: () => ctl.close() }, 'Fermer'));
  }

  function readyImage(file, text) {
    const textArea = h('textarea', { class: 'input mini-text', rows: 5, value: text });
    const actions = [];
    if (canShareFiles('image/jpeg') && isMobile()) {
      actions.push(h('button', { class: 'btn btn-primary', type: 'button', onclick: () => share(file, textArea.value) }, icon('share'), 'Envoyer la mini-fiche'));
    }
    actions.push(h('button', { class: 'btn' + (actions.length ? '' : ' btn-primary'), type: 'button', onclick: () => downloadFile(file, file.name) }, icon('download'), 'Enregistrer l’image'));
    actions.push(h('button', { class: 'btn', type: 'button', onclick: async () => {
      try { await navigator.clipboard.writeText(textArea.value); toast('Texte copié'); } catch (e) { textArea.select(); toast('Sélectionnez puis copiez le texte'); }
    } }, icon('copy'), 'Copier le texte'));
    fill(body,
      h('img', { class: 'mini-preview', src: blobUrl(file), alt: 'Aperçu de la mini-fiche' }),
      h('label', { class: 'small muted' }, 'Texte du message (modifiable)'),
      textArea,
      h('div', { class: 'pdf-actions' }, actions),
      h('button', { class: 'btn btn-ghost pdf-close', type: 'button', onclick: () => ctl.close() }, 'Fermer'));
  }
}
