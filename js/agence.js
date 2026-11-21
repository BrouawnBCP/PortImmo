// Réglages de l'agence (coordonnées + valeurs par défaut des simulations).
import { getMeta, getLogo } from './db.js';

export const AGENCE_DEFAULTS = {
  nom: '', conseiller: '', telephone: '', email: '', site: '',
  honorairesPct: 5,              // % TTC appliqué par défaut dans les simulations
  honorairesCharge: 'acquereur', // 'acquereur' | 'vendeur'
  notairePctAncien: 7.5,         // estimation frais de notaire (ancien)
  notairePctNeuf: 2.5,           // estimation frais de notaire (neuf)
};

export async function getAgence() {
  return { ...AGENCE_DEFAULTS, ...((await getMeta('agence')) || {}) };
}

/** Agence + logo (Blob ou null) en une fois. */
export async function getAgenceWithLogo() {
  const [agence, logo] = await Promise.all([getAgence(), getLogo()]);
  return { ...agence, logo };
}
