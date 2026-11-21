// Annonce d'exemple (anonymisée) chargée automatiquement au premier lancement.
import { listBiens, getBien, importAll } from './db.js';

const DEMO_ID = 'exemple-villa';
const KEY = 'portimmo-demo-chargee';       // '1' = déjà proposée une fois
const VERSION_KEY = 'portimmo-demo-version';
const DEMO_VERSION = '2';                  // v2 : photos réenregistrées au format compatible iPhone

function getLS(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function setLS(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* navigation privée */ } }

export async function loadDemo() {
  const res = await fetch('demo/exemple.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('Exemple introuvable');
  return importAll(await res.json());
}

/**
 * - Premier lancement sur une appli vide : ajoute l'exemple.
 * - Exemple déjà présent dans une ancienne version : le recharge (répare ses photos).
 * - Exemple supprimé par l'utilisateur : ne revient pas.
 * Retourne true si l'exemple a été (re)chargé.
 */
export async function loadDemoOnFirstLaunch() {
  if (getLS(VERSION_KEY) === DEMO_VERSION) return false;
  try {
    const alreadyOffered = getLS(KEY) === '1';
    const present = !!(await getBien(DEMO_ID));
    const empty = !(await listBiens()).length;
    if (present || (!alreadyOffered && empty)) await loadDemo();
    setLS(KEY, '1');
    setLS(VERSION_KEY, DEMO_VERSION);
    return present || (!alreadyOffered && empty);
  } catch (e) {
    console.warn('Exemple non chargé', e);
    return false;
  }
}
