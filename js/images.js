// Compression des photos avant stockage (redimensionnement + JPEG).
import { PHOTO } from './config.js';

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')); };
    img.src = url;
  });
}

function toBlob(img, maxSize, quality) {
  const w0 = img.naturalWidth;
  const h0 = img.naturalHeight;
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
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve({ blob: b, width: w, height: h }) : reject(new Error('Compression impossible'))), 'image/jpeg', quality);
  });
}

/** Retourne { blob, thumb, width, height } prêt à être stocké. */
export async function processImage(file) {
  const img = await loadImage(file);
  const full = await toBlob(img, PHOTO.maxSize, PHOTO.quality);
  const thumb = await toBlob(img, PHOTO.thumbSize, PHOTO.thumbQuality);
  return { blob: full.blob, thumb: thumb.blob, width: full.width, height: full.height };
}
