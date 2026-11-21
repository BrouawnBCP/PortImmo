// Annonce d'exemple (anonymisée) chargée automatiquement au premier lancement.
import { listBiens, importAll } from './db.js';

const KEY = 'portimmo-demo-chargee';

function markDone() {
  try { localStorage.setItem(KEY, '1'); } catch (e) { /* navigation privée */ }
}

export async function loadDemo() {
  const res = await fetch('demo/exemple.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('Exemple introuvable');
  return importAll(await res.json());
}

/** Charge l'exemple une seule fois, et seulement si l'appli est vide. Retourne true si chargé. */
export async function loadDemoOnFirstLaunch() {
  let done = false;
  try { done = localStorage.getItem(KEY) === '1'; } catch (e) { /* ignore */ }
  if (done) return false;
  if ((await listBiens()).length) { markDone(); return false; }
  try {
    await loadDemo();
    markDone();
    return true;
  } catch (e) {
    console.warn('Exemple non chargé', e);
    return false;
  }
}
