// Mise en forme des valeurs des champs (partagée par la fiche et le PDF).
import { fmtPrice, fmtNum, fmtDate } from './ui.js';

export const isEmpty = (v) => v == null || v === '' || (Array.isArray(v) && !v.length);

export function optionLabel(f, v) {
  if (f.type !== 'select') return v;
  const o = f.options.find((x) => (typeof x === 'object' ? x.value : x) === v);
  return o ? (typeof o === 'object' ? o.label : o) : v;
}

export function formatValue(f, v) {
  if (f.type === 'number') {
    if ((f.unit || '').startsWith('€')) return fmtPrice(v) + (f.unit !== '€' ? f.unit.slice(1) : '');
    return fmtNum(v) + (f.unit ? ' ' + f.unit : '');
  }
  if (f.type === 'date') return fmtDate(v);
  if (Array.isArray(v)) return v.join(', ');
  return String(optionLabel(f, v));
}

/** Photos dans l'ordre des pièces + photo principale. */
export function orderPhotos(bien, photos) {
  const ordered = (bien.pieces || []).flatMap((piece) => photos.filter((p) => p.pieceId === piece.id));
  const cover = photos.find((p) => p.id === bien.coverPhotoId) || ordered[0] || photos[0] || null;
  return { ordered, cover };
}
