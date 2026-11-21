// Compression et retouche des photos (redimensionnement, rotation, recadrage -> JPEG).
import { PHOTO } from './config.js';

export function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')); };
    img.src = url;
  });
}

const srcSize = (src) => ({ w: src.naturalWidth || src.width, h: src.naturalHeight || src.height });

/** Redimensionne une image/canvas (côté max) et l'encode en JPEG. */
function encode(src, maxSize, quality) {
  const { w: w0, h: h0 } = srcSize(src);
  const scale = Math.min(1, maxSize / Math.max(w0, h0));
  const w = Math.round(w0 * scale);
  const h = Math.round(h0 * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve({ blob: b, width: w, height: h }) : reject(new Error('Compression impossible'))), 'image/jpeg', quality);
  });
}

async function finalize(src) {
  const full = await encode(src, PHOTO.maxSize, PHOTO.quality);
  const thumb = await encode(src, PHOTO.thumbSize, PHOTO.thumbQuality);
  return { blob: full.blob, thumb: thumb.blob, width: full.width, height: full.height };
}

/** Retourne { blob, thumb, width, height } prêt à être stocké. */
export async function processImage(file) {
  return finalize(await loadImage(file));
}

/** Rotation de 90° (sens horaire si clockwise). */
export async function rotateImage(blob, clockwise = true) {
  const img = await loadImage(blob);
  const { w, h } = srcSize(img);
  const canvas = document.createElement('canvas');
  canvas.width = h;
  canvas.height = w;
  const ctx = canvas.getContext('2d');
  ctx.translate(h / 2, w / 2);
  ctx.rotate((clockwise ? 1 : -1) * Math.PI / 2);
  ctx.drawImage(img, -w / 2, -h / 2);
  return finalize(canvas);
}

/** Recadrage : rect en proportions (0..1) de l'image { x, y, w, h }. */
export async function cropImage(blob, rect) {
  const img = await loadImage(blob);
  const { w, h } = srcSize(img);
  const sx = Math.round(rect.x * w);
  const sy = Math.round(rect.y * h);
  const sw = Math.max(1, Math.round(rect.w * w));
  const sh = Math.max(1, Math.round(rect.h * h));
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return finalize(canvas);
}
