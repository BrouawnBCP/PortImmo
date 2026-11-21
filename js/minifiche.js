// Mini-fiche : image 1080 x 1350 (format portrait des messageries) + texte d'accompagnement.
import { fmtPrice, fmtNum } from './ui.js';
import { loadImage } from './images.js';
import { isEmpty, orderPhotos } from './format.js';

const W = 1080;
const H = 1350;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
const COL = {
  primary: '#1f4e79', accent: '#c8963e', text: '#17202b', muted: '#66717f', soft: '#eef3f8', white: '#ffffff',
};
const ENERGY = { A: '#009c6d', B: '#52b153', C: '#a5cc74', D: '#f4e70f', E: '#f0b40f', F: '#eb8235', G: '#d7221f' };

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx, text, maxW) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width <= maxW || !line) line = t;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

function drawCover(ctx, img, x, y, w, h) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}

export function statusLabel(bien) {
  if (bien.statut === 'vendu') return bien.transaction === 'Location' ? 'LOUÉ' : 'VENDU';
  if (bien.statut === 'option') return 'SOUS OFFRE';
  if (bien.transaction === 'Location') return 'À LOUER';
  if (bien.transaction === 'Viager') return 'EN VIAGER';
  return 'À VENDRE';
}

export async function buildMiniFiche(bien, photos, agence = {}, { prix = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = COL.white;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic';

  // Photo
  const PH = 740;
  const { cover } = orderPhotos(bien, photos);
  if (cover) {
    try { drawCover(ctx, await loadImage(cover.blob), 0, 0, W, PH); } catch (e) { /* photo illisible */ }
  } else {
    ctx.fillStyle = COL.soft;
    ctx.fillRect(0, 0, W, PH);
  }

  // Étiquette statut
  ctx.font = `800 34px ${FONT}`;
  const label = statusLabel(bien);
  const lw = ctx.measureText(label).width + 48;
  ctx.fillStyle = COL.accent;
  roundRect(ctx, 40, 40, lw, 64, 32);
  ctx.fill();
  ctx.fillStyle = COL.white;
  ctx.fillText(label, 64, 84);

  // Logo
  if (agence.logo) {
    try {
      const logo = await loadImage(agence.logo);
      const s = Math.min(220 / logo.naturalWidth, 90 / logo.naturalHeight);
      const w = logo.naturalWidth * s;
      const h = logo.naturalHeight * s;
      ctx.fillStyle = COL.white;
      roundRect(ctx, W - 40 - w - 28, 40, w + 28, h + 24, 18);
      ctx.fill();
      ctx.drawImage(logo, W - 40 - w - 14, 52, w, h);
    } catch (e) { /* logo illisible */ }
  }

  // Texte
  const X = 56;
  const MAXW = W - 2 * X;
  let y = PH + 70;
  const sous = [bien.typeBien, [bien.ville, bien.codePostal ? `(${bien.codePostal})` : ''].filter(Boolean).join(' ')].filter(Boolean).join('  ·  ');
  if (sous) {
    ctx.font = `700 30px ${FONT}`;
    ctx.fillStyle = COL.accent;
    ctx.fillText(sous.toUpperCase(), X, y);
    y += 62;
  }
  ctx.font = `700 50px ${FONT}`;
  ctx.fillStyle = COL.text;
  wrap(ctx, bien.titre || 'Bien immobilier', MAXW).slice(0, 2).forEach((l) => { ctx.fillText(l, X, y); y += 60; });
  y += 18;

  const hasPrice = prix && !isEmpty(bien.prix);
  ctx.font = `800 ${hasPrice ? 72 : 52}px ${FONT}`;
  ctx.fillStyle = COL.primary;
  const priceTxt = hasPrice ? fmtPrice(bien.prix) + (bien.transaction === 'Location' ? ' /mois' : '') : 'Prix sur demande';
  ctx.fillText(priceTxt, X, y + 16);
  // Pastille DPE
  if (/^[A-G]$/.test(bien.dpe || '')) {
    ctx.font = `800 40px ${FONT}`;
    const bx = W - X - 150;
    ctx.fillStyle = COL.muted;
    ctx.font = `600 24px ${FONT}`;
    ctx.fillText('DPE', bx, y - 26);
    ctx.fillStyle = ENERGY[bien.dpe];
    roundRect(ctx, bx, y - 16, 70, 50, 10);
    ctx.fill();
    ctx.fillStyle = ['C', 'D', 'E'].includes(bien.dpe) ? COL.text : COL.white;
    ctx.font = `800 36px ${FONT}`;
    ctx.fillText(bien.dpe, bx + 23, y + 22);
  }
  y += 60;

  // Chiffres clés
  const facts = [
    !isEmpty(bien.surfaceHabitable) && [`${fmtNum(bien.surfaceHabitable)} m²`, 'Surface'],
    !isEmpty(bien.nbPieces) && [String(bien.nbPieces), 'Pièces'],
    !isEmpty(bien.nbChambres) && [String(bien.nbChambres), 'Chambres'],
    !isEmpty(bien.surfaceTerrain) && [`${fmtNum(bien.surfaceTerrain)} m²`, 'Terrain'],
  ].filter(Boolean);
  if (facts.length) {
    const gap = 16;
    const bw = (MAXW - gap * (facts.length - 1)) / facts.length;
    facts.forEach(([v, l], i) => {
      const bx = X + i * (bw + gap);
      ctx.fillStyle = COL.soft;
      roundRect(ctx, bx, y, bw, 112, 18);
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.fillStyle = COL.primary;
      ctx.font = `800 ${v.length > 8 ? 34 : 42}px ${FONT}`;
      ctx.fillText(v, bx + bw / 2, y + 56);
      ctx.fillStyle = COL.muted;
      ctx.font = `600 24px ${FONT}`;
      ctx.fillText(l, bx + bw / 2, y + 92);
      ctx.textAlign = 'left';
    });
  }

  // Bandeau agence
  const BH = 110;
  ctx.fillStyle = COL.primary;
  ctx.fillRect(0, H - BH, W, BH);
  ctx.fillStyle = COL.white;
  ctx.font = `700 34px ${FONT}`;
  const contact = [agence.nom, agence.telephone].filter(Boolean).join('  ·  ') || 'Contactez-nous';
  ctx.fillText(contact, X, H - BH / 2 + 12);
  if (bien.reference) {
    ctx.font = `500 26px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText('Réf. ' + bien.reference, W - X, H - BH / 2 + 10);
    ctx.textAlign = 'left';
  }

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  return blob;
}

/** Texte d'accompagnement pour le message. */
export function miniFicheText(bien, agence = {}, { prix = true } = {}) {
  const facts = [
    bien.surfaceHabitable ? `${fmtNum(bien.surfaceHabitable)} m²` : '',
    bien.nbPieces ? `${bien.nbPieces} pièces` : '',
    bien.nbChambres ? `${bien.nbChambres} ch.` : '',
    bien.surfaceTerrain ? `terrain ${fmtNum(bien.surfaceTerrain)} m²` : '',
  ].filter(Boolean).join(' · ');
  const lieu = [bien.typeBien, bien.ville].filter(Boolean).join(' – ');
  return [
    `🏡 ${bien.titre || 'Bien immobilier'}`,
    lieu ? `📍 ${lieu}` : '',
    facts ? `📐 ${facts}` : '',
    prix && !isEmpty(bien.prix) ? `💶 ${fmtPrice(bien.prix)}${bien.transaction === 'Location' ? ' /mois' : ''}` : '',
    bien.reference ? `Réf. ${bien.reference}` : '',
    agence.telephone ? `📞 ${[agence.conseiller || agence.nom, agence.telephone].filter(Boolean).join(' – ')}` : '',
  ].filter(Boolean).join('\n').replace(/ /g, ' ');
}
