// Mise en page automatique de l'annonce PDF d'un bien.
// Les informations privées (propriétaire, notes, mandat) ne sont JAMAIS incluses.
import { PdfDoc, PAGE_W, PAGE_H, wrapText, textWidth, prepareJpeg } from './writer.js';
import { SECTIONS } from '../config.js';
import { fmtPrice, fmtNum } from '../ui.js';
import { formatValue, isEmpty, orderPhotos } from '../format.js';

const C = {
  text: [23, 32, 43],
  muted: [102, 113, 127],
  primary: [31, 78, 121],
  accent: [200, 150, 62],
  soft: [238, 243, 248],
  line: [221, 226, 233],
  white: [255, 255, 255],
};
const ENERGY = {
  A: [0, 156, 109], B: [82, 177, 83], C: [165, 204, 116], D: [244, 231, 15],
  E: [240, 180, 15], F: [235, 130, 53], G: [215, 34, 31],
};
const DARK_LETTERS = new Set(['C', 'D', 'E']);

const M = 40;                    // marge
const W = PAGE_W - 2 * M;        // largeur utile
const BOTTOM = PAGE_H - 58;      // limite basse du contenu (au-dessus du pied de page)

// Champs jamais affichés dans le tableau des caractéristiques
// (déjà affichés ailleurs, ou internes à l'agence).
const SKIP = new Set(['titre', 'reference', 'statut', 'mandat', 'dateMandat', 'description',
  'equipements', 'prix', 'transaction', 'typeBien', 'codePostal', 'ville', 'adresse']);

export const DEFAULT_OPTIONS = { prix: true, adresse: false, photos: true, complements: true };

/**
 * @param bien      le bien
 * @param photos    ses photos (avec blob)
 * @param agence    { nom, conseiller, telephone, email, site }
 * @param opts      voir DEFAULT_OPTIONS
 * @param progress  callback(texte)
 */
export async function buildAnnoncePdf(bien, photos, agence = {}, opts = DEFAULT_OPTIONS, progress = () => {}) {
  const doc = new PdfDoc();
  const { ordered, cover } = orderPhotos(bien, photos);
  let page;
  let y;

  const newPage = (first = false) => {
    page = doc.addPage();
    if (first) {
      y = M;
    } else {
      // petit en-tête sur les pages suivantes
      page.text(bien.titre || 'Annonce', M, 30, { size: 8.5, color: C.muted });
      if (bien.reference) page.text('Réf. ' + bien.reference, PAGE_W - M, 30, { size: 8.5, color: C.muted, align: 'right' });
      page.line(M, 36, PAGE_W - M, 36, C.line);
      y = 56;
    }
  };
  const ensure = (h) => { if (y + h > BOTTOM) newPage(); };

  let imgCount = 0;
  const totalImgs = (cover ? 1 : 0) + Math.min(3, Math.max(0, ordered.length - 1)) + (opts.photos ? ordered.length : 0);
  const addPhoto = async (photo, w, h, x, top, pxPerPt = 2) => {
    imgCount++;
    progress(`Préparation des photos ${imgCount}/${totalImgs}…`);
    try {
      const j = await prepareJpeg(photo.blob, w, h, pxPerPt);
      page.image(doc.addJpeg(j.bytes, j.w, j.h), x, top, w, h);
    } catch (e) {
      page.rect(x, top, w, h, C.soft);
    }
  };

  const heading = (title) => {
    ensure(40);
    y += 8;
    page.rect(M, y, 4, 15, C.accent);
    page.text(title, M + 12, y + 12, { size: 13, bold: true, color: C.primary });
    y += 26;
  };

  const paragraph = (text, size = 10.5, leading = 15, color = C.text) => {
    for (const line of wrapText(text, size, false, W)) {
      ensure(leading);
      if (line) page.text(line, M, y + size, { size, color });
      y += leading;
    }
  };

  // Tableau en 2 colonnes : [{ label, value, energy? }]
  const table = (rows) => {
    const colW = (W - 20) / 2;
    const labelW = 112;
    for (let i = 0; i < rows.length; i += 2) {
      const pair = rows.slice(i, i + 2).map((r) => ({
        ...r, lines: r.energy ? [r.value] : wrapText(r.value, 10, true, colW - labelW - 4),
      }));
      const h = Math.max(...pair.map((r) => r.lines.length)) * 13 + 9;
      ensure(h);
      pair.forEach((r, j) => {
        const x = M + j * (colW + 20);
        page.text(r.label, x, y + 12, { size: 9, color: C.muted });
        if (r.energy) {
          page.rect(x + labelW, y + 2, 26, 15, ENERGY[r.value]);
          page.text(r.value, x + labelW + 13, y + 13.5, { size: 10.5, bold: true, color: DARK_LETTERS.has(r.value) ? C.text : C.white, align: 'center' });
        } else {
          r.lines.forEach((l, k) => page.text(l, x + labelW, y + 12 + k * 13, { size: 10, bold: true, color: C.text }));
        }
        page.line(x, y + h - 2, x + colW, y + h - 2, C.line, 0.4);
      });
      y += h + 2;
    }
  };

  // ===================== PAGE 1 =====================
  progress('Mise en page…');
  newPage(true);

  // En-tête : agence + référence
  page.text(agence.nom || 'Annonce immobilière', M, y + 11, { size: 12, bold: true, color: C.primary });
  if (bien.reference) page.text('Réf. ' + bien.reference, PAGE_W - M, y + 11, { size: 9, color: C.muted, align: 'right' });
  y += 18;
  page.line(M, y, PAGE_W - M, y, C.line);
  y += 12;

  // Photo principale + 3 vignettes
  if (cover) {
    await addPhoto(cover, W, 290, M, y);
    y += 290 + 6;
    const extras = ordered.filter((p) => p !== cover).slice(0, 3);
    if (extras.length) {
      const gap = 6;
      const tw = (W - gap * 2) / 3;
      for (let i = 0; i < extras.length; i++) await addPhoto(extras[i], tw, 100, M + i * (tw + gap), y);
      y += 100;
    }
    y += 16;
  }

  // Titre
  for (const line of wrapText(bien.titre || 'Bien immobilier', 20, true, W)) {
    page.text(line, M, y + 19, { size: 20, bold: true, color: C.text });
    y += 25;
  }

  // Prix
  const hasPrice = opts.prix && !isEmpty(bien.prix);
  const priceText = hasPrice
    ? fmtPrice(bien.prix) + (bien.transaction === 'Location' ? ' / mois' : '')
    : 'Prix sur demande';
  page.text(priceText, M, y + 18, { size: hasPrice ? 18 : 14, bold: true, color: C.primary });
  if (hasPrice && bien.honoraires) {
    page.text(bien.honoraires, M + textWidth(priceText, 18, true) + 10, y + 18, { size: 9, color: C.muted });
  }
  y += 28;

  // Type, transaction, lieu
  const lieu = [bien.ville, bien.codePostal ? `(${bien.codePostal})` : ''].filter(Boolean).join(' ');
  const sous = [bien.typeBien, bien.transaction, lieu].filter(Boolean).join('  ·  ');
  if (sous) { page.text(sous, M, y + 11, { size: 11, color: C.muted }); y += 17; }
  if (opts.adresse && bien.adresse) {
    page.text([bien.adresse, bien.codePostal, bien.ville].filter(Boolean).join(', '), M, y + 10, { size: 10, color: C.muted });
    y += 16;
  }
  y += 8;

  // Chiffres clés
  const facts = [
    !isEmpty(bien.surfaceHabitable) && [`${fmtNum(bien.surfaceHabitable)} m²`, 'Surface'],
    !isEmpty(bien.nbPieces) && [String(bien.nbPieces), 'Pièces'],
    !isEmpty(bien.nbChambres) && [String(bien.nbChambres), 'Chambres'],
    !isEmpty(bien.nbSdb) && [String(bien.nbSdb), "Salles d'eau / bain"],
    !isEmpty(bien.surfaceTerrain) && [`${fmtNum(bien.surfaceTerrain)} m²`, 'Terrain'],
  ].filter(Boolean);
  if (facts.length) {
    ensure(50);
    const gap = 8;
    const bw = (W - gap * (facts.length - 1)) / facts.length;
    facts.forEach(([v, l], i) => {
      const x = M + i * (bw + gap);
      page.rect(x, y, bw, 44, C.soft);
      page.text(v, x + bw / 2, y + 20, { size: 13, bold: true, color: C.primary, align: 'center' });
      page.text(l, x + bw / 2, y + 34, { size: 8.5, color: C.muted, align: 'center' });
    });
    y += 56;
  }

  // Description
  if (bien.description) {
    heading('Description');
    paragraph(bien.description);
    y += 4;
  }

  // Caractéristiques (toutes sections publiques de config.js)
  const rows = [];
  for (const s of SECTIONS) {
    if (s.private) continue;
    for (const f of s.fields) {
      if (SKIP.has(f.key) || isEmpty(bien[f.key])) continue;
      const v = bien[f.key];
      rows.push(f.badge && /^[A-G]$/.test(v)
        ? { label: f.label, value: v, energy: true }
        : { label: f.label, value: formatValue(f, v) });
    }
  }
  if (rows.length) { heading('Caractéristiques'); table(rows); y += 4; }

  // Équipements
  if (!isEmpty(bien.equipements)) {
    heading('Équipements & prestations');
    paragraph(bien.equipements.join('  •  '), 10.5, 16);
    y += 4;
  }

  // Informations complémentaires
  const perso = (bien.champsPerso || []).filter((c) => c.label && c.value);
  if (opts.complements && perso.length) {
    heading('Informations complémentaires');
    table(perso.map((c) => ({ label: c.label, value: c.value })));
    y += 4;
  }

  // Contact
  const contactLines = [agence.conseiller, agence.telephone, agence.email, agence.site].filter(Boolean);
  if (contactLines.length) {
    const h = 34 + contactLines.length * 15;
    ensure(h + 16);
    y += 10;
    page.rect(M, y, W, h, C.soft);
    page.rect(M, y, 4, h, C.primary);
    page.text('Votre contact' + (agence.nom ? ' — ' + agence.nom : ''), M + 16, y + 20, { size: 11.5, bold: true, color: C.primary });
    contactLines.forEach((l, i) => page.text(l, M + 16, y + 38 + i * 15, { size: 10.5, color: C.text }));
    y += h + 6;
  }

  // ===================== PHOTOS PAR PIÈCE =====================
  if (opts.photos && ordered.length) {
    newPage();
    heading('Photos');
    const gap = 8;
    const pw = (W - gap) / 2;
    const ph = pw * 0.72;
    for (const piece of bien.pieces || []) {
      const list = photos.filter((p) => p.pieceId === piece.id);
      if (!list.length) continue;
      ensure(22 + ph);
      page.text(piece.nom, M, y + 12, { size: 11.5, bold: true, color: C.text });
      page.text(`${list.length} photo${list.length > 1 ? 's' : ''}`, PAGE_W - M, y + 12, { size: 9, color: C.muted, align: 'right' });
      y += 20;
      for (let i = 0; i < list.length; i += 2) {
        ensure(ph + gap);
        for (let j = 0; j < 2 && i + j < list.length; j++) {
          await addPhoto(list[i + j], pw, ph, M + j * (pw + gap), y, 1.6);
        }
        y += ph + gap;
      }
      y += 8;
    }
  }

  // ===================== PIED DE PAGE =====================
  const footer = [agence.nom, agence.telephone, agence.email].filter(Boolean).join('  ·  ') || 'Document non contractuel';
  doc.pages.forEach((p, i) => {
    p.line(M, PAGE_H - 40, PAGE_W - M, PAGE_H - 40, C.line);
    p.text(footer, M, PAGE_H - 26, { size: 8.5, color: C.muted });
    p.text(`Page ${i + 1} / ${doc.pages.length}`, PAGE_W - M, PAGE_H - 26, { size: 8.5, color: C.muted, align: 'right' });
  });

  progress('Finalisation…');
  return doc.toBlob();
}

export function pdfFileName(bien) {
  const base = ['Annonce', bien.reference, bien.titre].filter(Boolean).join(' - ')
    .replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 90);
  return (base || 'Annonce') + '.pdf';
}
