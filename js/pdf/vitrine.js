// Fiche vitrine : une page A4 paysage à imprimer pour la vitrine de l'agence.
import { PdfDoc, PAGE_W, PAGE_H, wrapText, textWidth, prepareJpeg } from './writer.js';
import { C, ENERGY, DARK_LETTERS, drawLogo } from './annonce.js';
import { fmtPrice, fmtNum } from '../ui.js';
import { isEmpty, orderPhotos } from '../format.js';

const GES = {
  A: [234, 222, 248], B: [214, 192, 240], C: [190, 160, 228], D: [164, 126, 212],
  E: [138, 94, 194], F: [110, 62, 172], G: [82, 32, 146],
};
const GES_DARK = new Set(['A', 'B', 'C']);
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

const W = PAGE_H; // paysage
const H = PAGE_W;
const M = 28;

/** Étiquette énergie / climat : 7 barres A→G, la classe du bien mise en avant. */
function energyScale(page, x, y, title, value, colors, darkSet) {
  page.text(title, x, y + 10, { size: 9.5, bold: true, color: C.text });
  const top = y + 16;
  const bh = 11;
  const gap = 2;
  LETTERS.forEach((L, i) => {
    const by = top + i * (bh + gap);
    const bw = 34 + i * 9;
    const active = L === value;
    page.rect(x, by, bw, bh, colors[L]);
    page.text(L, x + 5, by + 8.5, { size: 8, bold: true, color: darkSet.has(L) ? C.text : C.white });
    if (active) {
      // repère : triangle + case avec la lettre
      const ax = x + bw + 4;
      page.polygon([[ax, by + bh / 2], [ax + 7, by - 2], [ax + 7, by + bh + 2]], C.text);
      page.rect(ax + 7, by - 2, 18, bh + 4, C.text);
      page.text(L, ax + 16, by + 9.5, { size: 10, bold: true, color: C.white, align: 'center' });
    }
  });
  if (!/^[A-G]$/.test(value || '')) {
    page.text(value ? String(value) : 'Non renseigné', x, top + 7 * (bh + gap) + 10, { size: 8.5, color: C.muted });
  }
}

export async function buildVitrinePdf(bien, photos, agence = {}, opts = {}, progress = () => {}) {
  const doc = new PdfDoc(W, H);
  const page = doc.addPage();
  const { ordered, cover } = orderPhotos(bien, photos);

  // ---------- Bandeau ----------
  page.rect(0, 0, W, 58, C.primary);
  let nameX = M;
  if (agence.logo) {
    progress('Logo…');
    const lw = await drawLogo(doc, page, agence.logo, M + 4, 12, 130, 34);
    if (lw) {
      // fond blanc derrière le logo : inséré juste avant l'image dans la liste des opérations
      page.ops.splice(page.ops.length - 1, 0, `1 1 1 rg ${M - 4} ${H - 50} ${lw + 16} 42 re f`);
      nameX = M + lw + 22;
    }
  }
  page.text(agence.nom || 'Agence immobilière', nameX, 36, { size: 15, bold: true, color: C.white });
  const label = bien.statut === 'vendu'
    ? (bien.transaction === 'Location' ? 'LOUÉ' : 'VENDU')
    : bien.statut === 'option' ? 'SOUS OFFRE'
      : bien.transaction === 'Location' ? 'À LOUER' : bien.transaction === 'Viager' ? 'EN VIAGER' : 'À VENDRE';
  const lblW = textWidth(label, 18, true) + 28;
  page.rect(W - M - lblW, 12, lblW, 34, C.accent);
  page.text(label, W - M - lblW / 2, 35, { size: 18, bold: true, color: C.white, align: 'center' });

  // ---------- Colonne gauche : photos ----------
  const LW = 500;
  let y = 74;
  if (cover) {
    progress('Photos…');
    const j = await prepareJpeg(cover.blob, LW, 300, 2.4);
    page.image(doc.addJpeg(j.bytes, j.w, j.h), M, y, LW, 300);
    const extras = ordered.filter((p) => p !== cover).slice(0, 3);
    const tw = (LW - 16) / 3;
    for (let i = 0; i < extras.length; i++) {
      const t = await prepareJpeg(extras[i].blob, tw, 104, 2);
      page.image(doc.addJpeg(t.bytes, t.w, t.h), M + i * (tw + 8), y + 308, tw, 104);
    }
  } else {
    page.rect(M, y, LW, 412, C.soft);
    page.text('Photo à venir', M + LW / 2, y + 206, { size: 14, color: C.muted, align: 'center' });
  }

  // Description courte sous les photos
  if (bien.description) {
    const lines = wrapText(bien.description.replace(/\n+/g, ' '), 9.5, false, LW);
    const max = 4;
    lines.slice(0, max).forEach((l, i) => {
      const txt = i === max - 1 && lines.length > max ? l.replace(/\s+\S*$/, '') + '…' : l;
      page.text(txt, M, y + 430 + i * 12.5, { size: 9.5, color: C.text });
    });
  }

  // ---------- Colonne droite : infos ----------
  const RX = M + LW + 22;
  const RW = W - M - RX;
  y = 80;
  const sous = [bien.typeBien, [bien.ville, bien.codePostal ? `(${bien.codePostal})` : ''].filter(Boolean).join(' ')].filter(Boolean).join('  ·  ');
  if (sous) { page.text(sous.toUpperCase(), RX, y + 9, { size: 9.5, bold: true, color: C.accent }); y += 18; }
  wrapText(bien.titre || 'Bien immobilier', 17, true, RW).slice(0, 3).forEach((l) => {
    page.text(l, RX, y + 16, { size: 17, bold: true, color: C.text });
    y += 21;
  });
  y += 8;

  const hasPrice = opts.prix !== false && !isEmpty(bien.prix);
  if (hasPrice) {
    page.text(fmtPrice(bien.prix) + (bien.transaction === 'Location' ? ' /mois' : ''), RX, y + 28, { size: 30, bold: true, color: C.primary });
    y += 38;
    if (bien.honoraires) {
      wrapText(bien.honoraires, 8.5, false, RW).forEach((l) => { page.text(l, RX, y + 8, { size: 8.5, color: C.muted }); y += 11; });
    }
  } else {
    page.text('Prix sur demande', RX, y + 20, { size: 18, bold: true, color: C.primary });
    y += 28;
  }
  y += 10;

  // Chiffres clés
  const facts = [
    !isEmpty(bien.surfaceHabitable) && ['Surface habitable', `${fmtNum(bien.surfaceHabitable)} m²`],
    !isEmpty(bien.surfaceTerrain) && ['Terrain', `${fmtNum(bien.surfaceTerrain)} m²`],
    !isEmpty(bien.nbPieces) && ['Pièces', String(bien.nbPieces)],
    !isEmpty(bien.nbChambres) && ['Chambres', String(bien.nbChambres)],
    !isEmpty(bien.nbSdb) && ["Salles d'eau / bain", String(bien.nbSdb)],
    (bien.equipements || []).length && ['Atouts', bien.equipements.slice(0, 4).join(', ')],
  ].filter(Boolean);
  for (const [l, v] of facts) {
    const vLines = wrapText(v, 10.5, true, RW - 110);
    page.text(l, RX, y + 11, { size: 9.5, color: C.muted });
    vLines.forEach((vl, k) => page.text(vl, RX + 110, y + 11 + k * 12, { size: 10.5, bold: true, color: C.text }));
    y += 6 + vLines.length * 12;
    page.line(RX, y + 2, RX + RW, y + 2, C.line, 0.4);
    y += 6;
  }
  y += 12;

  // Étiquettes énergie et climat
  const scaleTop = Math.min(y, H - 44 - 120);
  energyScale(page, RX, scaleTop, 'Énergie (DPE)', bien.dpe, ENERGY, DARK_LETTERS);
  energyScale(page, RX + RW / 2 + 4, scaleTop, 'Climat (GES)', bien.ges, GES, GES_DARK);

  // ---------- Pied de page ----------
  page.rect(0, H - 34, W, 34, C.soft);
  const contact = [agence.conseiller, agence.telephone, agence.email, agence.site].filter(Boolean).join('   ·   ');
  page.text(contact || agence.nom || 'Document non contractuel', M, H - 13, { size: 10.5, bold: !!contact, color: C.primary });
  if (bien.reference) page.text('Réf. ' + bien.reference, W - M, H - 13, { size: 9.5, color: C.muted, align: 'right' });

  progress('Finalisation…');
  return doc.toBlob();
}
