// Générateur PDF minimal (sans bibliothèque externe) :
// texte en Helvetica / Helvetica-Bold (encodage WinAnsi : accents, €, ², œ…),
// rectangles, traits et photos JPEG.
// Coordonnées : en points (A4 = 595 x 842), origine EN HAUT à gauche (converties en interne).

export const PAGE_W = 595.28;
export const PAGE_H = 841.89;

const WINANSI = {
  0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
  0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91,
  0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98,
  0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F,
};

/** Remplace les caractères non imprimables en Helvetica standard. */
export function cleanText(str) {
  return String(str ?? '')
    .normalize('NFC')
    .replace(/[    ]/g, ' ')
    .replace(/[\t\r]/g, ' ');
}

function toWinAnsi(str) {
  const out = [];
  for (const ch of cleanText(str)) {
    const c = ch.codePointAt(0);
    if (c >= 0x20 && c < 0x7f) out.push(c);
    else if (c >= 0xa0 && c <= 0xff) out.push(c);
    else if (WINANSI[c]) out.push(WINANSI[c]);
    else if (c === 0x0a) out.push(0x20);
    else out.push(0x3f); // « ? »
  }
  return out;
}

function pdfString(str) {
  let s = '(';
  for (const b of toWinAnsi(str)) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) s += '\\' + String.fromCharCode(b);
    else if (b < 0x20 || b > 0x7e) s += '\\' + b.toString(8).padStart(3, '0');
    else s += String.fromCharCode(b);
  }
  return s + ')';
}

const n = (v) => (Math.round(v * 100) / 100).toString();
const rgb = (c) => c.map((x) => n(x / 255)).join(' ');

// Mesure du texte : Arial a exactement les mêmes largeurs que Helvetica.
const measureCtx = document.createElement('canvas').getContext('2d');
export function textWidth(str, size, bold = false) {
  measureCtx.font = `${bold ? 'bold ' : ''}100px Helvetica, Arial, "Liberation Sans", sans-serif`;
  return (measureCtx.measureText(cleanText(str)).width * size) / 100;
}

/** Découpe un texte en lignes tenant dans maxWidth (marge de sécurité de 4 %). */
export function wrapText(str, size, bold, maxWidth) {
  const max = maxWidth * 0.96;
  const lines = [];
  for (const para of cleanText(str).split('\n')) {
    const words = para.split(/ +/).filter(Boolean);
    if (!words.length) { lines.push(''); continue; }
    let line = '';
    for (let word of words) {
      // mot plus long que la ligne : on le coupe
      while (textWidth(word, size, bold) > max) {
        let i = word.length - 1;
        while (i > 1 && textWidth(word.slice(0, i), size, bold) > max) i--;
        if (line) { lines.push(line); line = ''; }
        lines.push(word.slice(0, i));
        word = word.slice(i);
      }
      const test = line ? line + ' ' + word : word;
      if (textWidth(test, size, bold) <= max) line = test;
      else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
  }
  return lines;
}

export class PdfDoc {
  constructor() {
    this.pages = [];
    this.images = [];
  }

  addPage() {
    const page = new PdfPage(this);
    this.pages.push(page);
    return page;
  }

  /** bytes : Uint8Array d'un JPEG ; w/h : dimensions en pixels. Retourne l'identifiant de l'image. */
  addJpeg(bytes, w, h) {
    this.images.push({ bytes, w, h });
    return this.images.length - 1;
  }

  /** Assemble le fichier PDF et retourne un Blob. */
  toBlob() {
    const enc = new TextEncoder();
    const chunks = [];
    const offsets = [];
    let pos = 0;
    const push = (data) => {
      const bytes = typeof data === 'string' ? enc.encode(data) : data;
      chunks.push(bytes);
      pos += bytes.length;
    };
    const startObj = (num) => { offsets[num] = pos; push(`${num} 0 obj\n`); };

    const FIRST_IMG = 5;
    const firstPage = FIRST_IMG + this.images.length;
    const pageNum = (i) => firstPage + i * 2;
    const total = firstPage + this.pages.length * 2;

    push('%PDF-1.4\n');
    push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

    startObj(1);
    push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    startObj(2);
    push(`<< /Type /Pages /Count ${this.pages.length} /Kids [${this.pages.map((_, i) => `${pageNum(i)} 0 R`).join(' ')}] >>\nendobj\n`);
    startObj(3);
    push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n');
    startObj(4);
    push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n');

    this.images.forEach((img, i) => {
      startObj(FIRST_IMG + i);
      push(`<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`);
      push(img.bytes);
      push('\nendstream\nendobj\n');
    });

    const xobjects = this.images.map((_, i) => `/Im${i} ${FIRST_IMG + i} 0 R`).join(' ');
    this.pages.forEach((page, i) => {
      const content = enc.encode(page.ops.join('\n'));
      startObj(pageNum(i));
      push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(PAGE_W)} ${n(PAGE_H)}] `
        + `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << ${xobjects} >> >> `
        + `/Contents ${pageNum(i) + 1} 0 R >>\nendobj\n`);
      startObj(pageNum(i) + 1);
      push(`<< /Length ${content.length} >>\nstream\n`);
      push(content);
      push('\nendstream\nendobj\n');
    });

    const xrefPos = pos;
    let xref = `xref\n0 ${total}\n0000000000 65535 f \n`;
    for (let i = 1; i < total; i++) xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    push(xref);
    push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`);
    return new Blob(chunks, { type: 'application/pdf' });
  }
}

class PdfPage {
  constructor(doc) {
    this.doc = doc;
    this.ops = [];
  }

  /** y = ligne de base du texte, depuis le haut de la page. */
  text(str, x, y, { size = 10, bold = false, color = [0, 0, 0], align = 'left' } = {}) {
    let tx = x;
    if (align === 'right') tx = x - textWidth(str, size, bold);
    else if (align === 'center') tx = x - textWidth(str, size, bold) / 2;
    this.ops.push(`BT /${bold ? 'F2' : 'F1'} ${n(size)} Tf ${rgb(color)} rg ${n(tx)} ${n(PAGE_H - y)} Td ${pdfString(str)} Tj ET`);
  }

  rect(x, y, w, h, color) {
    this.ops.push(`${rgb(color)} rg ${n(x)} ${n(PAGE_H - y - h)} ${n(w)} ${n(h)} re f`);
  }

  line(x1, y1, x2, y2, color, width = 0.5) {
    this.ops.push(`${rgb(color)} RG ${n(width)} w ${n(x1)} ${n(PAGE_H - y1)} m ${n(x2)} ${n(PAGE_H - y2)} l S`);
  }

  image(id, x, y, w, h) {
    this.ops.push(`q ${n(w)} 0 0 ${n(h)} ${n(x)} ${n(PAGE_H - y - h)} cm /Im${id} Do Q`);
  }
}

/** Convertit une photo (Blob) en JPEG recadré aux proportions w/h (en points). */
export async function prepareJpeg(blob, w, h, pxPerPt = 2, quality = 0.82) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('Photo illisible'));
      im.src = url;
    });
    const cw = Math.round(w * pxPerPt);
    const ch = Math.round(h * pxPerPt);
    const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const sw = cw / scale;
    const sh = ch / scale;
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cw, ch);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, cw, ch);
    const jpeg = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return { bytes: new Uint8Array(await jpeg.arrayBuffer()), w: cw, h: ch };
  } finally {
    URL.revokeObjectURL(url);
  }
}
