// Outil de recadrage : openCropper(blob) -> Promise<{ x, y, w, h } en proportions | null>
import { h, icon } from '../ui.js';

const RATIOS = [
  { label: 'Libre', value: null },
  { label: '4:3', value: 4 / 3 },
  { label: '3:2', value: 3 / 2 },
  { label: '16:9', value: 16 / 9 },
  { label: 'Carré', value: 1 },
];
const MIN = 0.06;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function openCropper(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    let r = { x: 0.05, y: 0.05, w: 0.9, h: 0.9 };
    let ratio = null;
    let imgAspect = 1;

    const img = h('img', { class: 'crop-img', src: url, alt: '', draggable: 'false' });
    const box = h('div', { class: 'crop-box' },
      ['nw', 'ne', 'sw', 'se'].map((c) => h('span', { class: 'crop-h crop-' + c, 'data-h': c })));
    const wrap = h('div', { class: 'crop-wrap' }, img, box);
    const chips = h('div', { class: 'chips crop-ratios' }, RATIOS.map((o, i) => h('button', {
      class: 'chip' + (i === 0 ? ' active' : ''), type: 'button',
      onclick: (e) => {
        chips.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
        e.currentTarget.classList.add('active');
        setRatio(o.value);
      },
    }, o.label)));

    const root = h('div', { class: 'cropper' },
      h('div', { class: 'lb-top' }, h('div', { class: 'lb-caption' }, 'Recadrer la photo'), h('span')),
      chips,
      h('div', { class: 'crop-stage' }, wrap),
      h('div', { class: 'crop-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => done(null) }, 'Annuler'),
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => done(r) }, icon('check'), 'Valider')));

    function paint() {
      Object.assign(box.style, { left: r.x * 100 + '%', top: r.y * 100 + '%', width: r.w * 100 + '%', height: r.h * 100 + '%' });
    }

    function setRatio(v) {
      ratio = v;
      if (!v) return;
      const k = imgAspect / v; // hauteur relative pour une largeur relative de 1
      let w = 0.9;
      let hh = w * k;
      if (hh > 0.9) { hh = 0.9; w = hh / k; }
      r = { x: (1 - w) / 2, y: (1 - hh) / 2, w, h: hh };
      paint();
    }

    img.addEventListener('load', () => {
      imgAspect = img.naturalWidth / img.naturalHeight;
      paint();
    });

    // Glisser (déplacer le cadre) / tirer un coin (redimensionner)
    let drag = null;
    wrap.addEventListener('pointerdown', (e) => {
      const handle = e.target.dataset && e.target.dataset.h;
      if (!handle && !box.contains(e.target)) return;
      e.preventDefault();
      wrap.setPointerCapture(e.pointerId);
      drag = { mode: handle || 'move', x0: e.clientX, y0: e.clientY, r0: { ...r }, rect: wrap.getBoundingClientRect() };
    });
    wrap.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = (e.clientX - drag.x0) / drag.rect.width;
      const dy = (e.clientY - drag.y0) / drag.rect.height;
      const r0 = drag.r0;
      if (drag.mode === 'move') {
        r = { ...r0, x: clamp(r0.x + dx, 0, 1 - r0.w), y: clamp(r0.y + dy, 0, 1 - r0.h) };
      } else {
        const west = drag.mode.includes('w');
        const north = drag.mode.includes('n');
        const ax = west ? r0.x + r0.w : r0.x;        // coin opposé (fixe)
        const ay = north ? r0.y + r0.h : r0.y;
        const px = clamp((west ? r0.x : r0.x + r0.w) + dx, 0, 1);
        const py = clamp((north ? r0.y : r0.y + r0.h) + dy, 0, 1);
        let w = Math.max(MIN, west ? ax - px : px - ax);
        let hh = Math.max(MIN, north ? ay - py : py - ay);
        const availW = west ? ax : 1 - ax;
        const availH = north ? ay : 1 - ay;
        w = Math.min(w, availW);
        hh = Math.min(hh, availH);
        if (ratio) {
          const k = imgAspect / ratio;
          hh = w * k;
          if (hh > availH) { hh = availH; w = hh / k; }
        }
        r = { x: west ? ax - w : ax, y: north ? ay - hh : ay, w, h: hh };
      }
      paint();
    });
    const end = () => { drag = null; };
    wrap.addEventListener('pointerup', end);
    wrap.addEventListener('pointercancel', end);

    function done(result) {
      URL.revokeObjectURL(url);
      root.remove();
      resolve(result);
    }

    document.body.append(root);
    paint();
  });
}
