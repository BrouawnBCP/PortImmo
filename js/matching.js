// Rapprochement biens <-> acquéreurs.
// Critères éliminatoires : transaction, type de bien, secteur, budget (+5 % de marge de négociation).
// Critères de confort (donnent le score) : surface, pièces, chambres, terrain, équipements souhaités.
import { fmtPrice, fmtNum } from './ui.js';

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[-']/g, ' ').trim();
const MARGE_BUDGET = 0.05;

export const villesList = (acq) => String(acq.villes || '').split(/[,;\n]/).map(norm).filter(Boolean);

/**
 * @returns { ok: bool, score: 0..100, plus: string[], moins: string[] }
 */
export function matchBien(bien, acq) {
  const plus = [];
  const moins = [];

  if (acq.statut === 'inactif') return { ok: false, score: 0, plus, moins: ['Acquéreur inactif'] };
  if (bien.statut === 'vendu' || bien.statut === 'archive') return { ok: false, score: 0, plus, moins: ['Bien plus disponible'] };
  if (acq.transaction && bien.transaction && acq.transaction !== bien.transaction) {
    return { ok: false, score: 0, plus, moins: ['Transaction différente'] };
  }
  if (acq.types && acq.types.length && bien.typeBien && !acq.types.includes(bien.typeBien)) {
    return { ok: false, score: 0, plus, moins: ['Type de bien différent'] };
  }
  const villes = villesList(acq);
  if (villes.length) {
    const v = norm(bien.ville);
    const cp = String(bien.codePostal || '');
    const okVille = villes.some((x) => (v && (v === x || v.includes(x) || x.includes(v))) || (cp && (cp === x || (x.length === 2 && cp.startsWith(x)))));
    if (!okVille) return { ok: false, score: 0, plus, moins: ['Hors secteur recherché'] };
    plus.push('Secteur recherché');
  }
  const prix = Number(bien.prix) || 0;
  const max = Number(acq.budgetMax) || 0;
  if (max && prix) {
    if (prix > max * (1 + MARGE_BUDGET)) return { ok: false, score: 0, plus, moins: ['Au-dessus du budget'] };
    if (prix > max) moins.push(`Budget dépassé de ${Math.round((prix / max - 1) * 100)} % (négociable)`);
    else plus.push('Dans le budget');
  }

  // Critères de confort
  const crit = [];
  const check = (wanted, have, label, unit = '') => {
    if (!wanted) return;
    const ok = (Number(have) || 0) >= Number(wanted);
    crit.push(ok);
    if (ok) plus.push(`${label} ≥ ${fmtNum(wanted)}${unit}`);
    else moins.push(have ? `${label} : ${fmtNum(have)}${unit} (souhaité ${fmtNum(wanted)}${unit})` : `${label} non renseigné(e)`);
  };
  check(acq.surfaceMin, bien.surfaceHabitable, 'Surface', ' m²');
  check(acq.piecesMin, bien.nbPieces, 'Pièces');
  check(acq.chambresMin, bien.nbChambres, 'Chambres');
  check(acq.terrainMin, bien.surfaceTerrain, 'Terrain', ' m²');
  for (const eq of acq.equipements || []) {
    const ok = (bien.equipements || []).includes(eq);
    crit.push(ok);
    (ok ? plus : moins).push(ok ? eq : `Sans ${eq.toLowerCase()}`);
  }
  let score = crit.length ? Math.round((crit.filter(Boolean).length / crit.length) * 100) : 100;
  if (max && prix > max) score = Math.max(0, score - 10);
  return { ok: true, score, plus, moins };
}

/** Acquéreurs correspondant à un bien, triés par score. */
export function acquereursPour(bien, acquereurs, minScore = 50) {
  return acquereurs
    .map((a) => ({ acq: a, ...matchBien(bien, a) }))
    .filter((m) => m.ok && m.score >= minScore)
    .sort((a, b) => b.score - a.score);
}

/** Biens correspondant à un acquéreur, triés par score. */
export function biensPour(acq, biens, minScore = 0) {
  return biens
    .map((b) => ({ bien: b, ...matchBien(b, acq) }))
    .filter((m) => m.ok && m.score >= minScore)
    .sort((a, b) => b.score - a.score);
}

export function budgetText(acq) {
  const min = Number(acq.budgetMin) || 0;
  const max = Number(acq.budgetMax) || 0;
  if (min && max) return `${fmtPrice(min)} – ${fmtPrice(max)}`;
  if (max) return `jusqu’à ${fmtPrice(max)}`;
  if (min) return `à partir de ${fmtPrice(min)}`;
  return 'Budget non renseigné';
}
