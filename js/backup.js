// Sauvegarde (export) + rappel de sauvegarde.
import { h, icon, toast, shareOrDownload } from './ui.js';
import { exportAll, getMeta, setMeta, listBiens } from './db.js';

const REMIND_AFTER_DAYS = 14;
let dismissedThisSession = false;

const fmtSize = (b) => (b > 1e6 ? (b / 1e6).toFixed(1) + ' Mo' : Math.round(b / 1e3) + ' ko');

/** Exporte toutes les données dans un fichier .json (partage sur téléphone, téléchargement sinon). */
export async function exportBackup() {
  toast('Préparation de la sauvegarde…', 0);
  try {
    const data = await exportAll();
    const name = `portimmo-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([JSON.stringify(data)], name, { type: 'application/json' });
    const done = await shareOrDownload(file, { title: name });
    if (!done) { toast('Export annulé'); return false; }
    await setMeta('lastBackup', new Date().toISOString());
    toast(`Sauvegarde exportée (${fmtSize(file.size)})`);
    return true;
  } catch (e) {
    console.error(e);
    toast('Erreur lors de l’export');
    return false;
  }
}

export async function daysSinceBackup() {
  const last = await getMeta('lastBackup');
  return last ? Math.floor((Date.now() - new Date(last).getTime()) / 86400e3) : null;
}

/** Bandeau « pensez à sauvegarder » (ou null si inutile). */
export async function backupReminder() {
  if (dismissedThisSession) return null;
  const biens = await listBiens();
  if (!biens.some((b) => b.id !== 'exemple-villa')) return null; // seulement l'exemple : rien à protéger
  const days = await daysSinceBackup();
  if (days !== null && days < REMIND_AFTER_DAYS) return null;
  const banner = h('div', { class: 'banner' },
    icon('alert'),
    h('div', { class: 'banner-text' },
      h('strong', null, days === null ? 'Aucune sauvegarde pour le moment' : `Dernière sauvegarde il y a ${days} jours`),
      h('span', { class: 'small' }, 'Vos biens sont uniquement sur cet appareil.')),
    h('div', { class: 'banner-actions' },
      h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: async () => { if (await exportBackup()) banner.remove(); } }, 'Sauvegarder'),
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { dismissedThisSession = true; banner.remove(); } }, 'Plus tard')));
  return banner;
}
