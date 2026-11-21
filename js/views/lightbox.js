// Visionneuse plein écran avec navigation (boutons, clavier, glissement du doigt).
import { h, icon } from '../ui.js';

export function openLightbox({ photos, index = 0, pieceName, isCover, onSetCover, onMove, onDelete }) {
  let list = [...photos];
  let i = Math.max(0, index);
  let url = null;

  const img = h('img', { class: 'lb-img', alt: '' });
  const caption = h('div', { class: 'lb-caption' });
  const coverBtn = h('button', { class: 'lb-btn', type: 'button', onclick: async () => { await onSetCover(list[i]); update(); } });
  const root = h('div', { class: 'lightbox', role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'lb-top' },
      caption,
      h('button', { class: 'lb-btn', type: 'button', 'aria-label': 'Fermer', onclick: close }, icon('close'))),
    h('div', { class: 'lb-stage' },
      h('button', { class: 'lb-nav lb-prev', type: 'button', 'aria-label': 'Précédente', onclick: () => go(-1) }, icon('left')),
      img,
      h('button', { class: 'lb-nav lb-next', type: 'button', 'aria-label': 'Suivante', onclick: () => go(1) }, icon('right'))),
    h('div', { class: 'lb-bar' },
      coverBtn,
      h('button', { class: 'lb-btn', type: 'button', onclick: async () => { if (await onMove(list[i])) update(); } }, icon('move'), h('span', null, 'Déplacer')),
      h('button', { class: 'lb-btn danger', type: 'button', onclick: del }, icon('trash'), h('span', null, 'Supprimer'))));

  function update() {
    if (!list.length) { close(); return; }
    i = Math.min(i, list.length - 1);
    const p = list[i];
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(p.blob);
    img.src = url;
    caption.textContent = `${pieceName(p)} — ${i + 1} / ${list.length}`;
    const cover = isCover(p);
    coverBtn.replaceChildren(icon('star', cover ? 'filled' : ''), h('span', null, cover ? 'Photo principale' : 'Mettre en principale'));
    coverBtn.disabled = cover;
    root.classList.toggle('single', list.length < 2);
  }

  function go(d) {
    if (list.length < 2) return;
    i = (i + d + list.length) % list.length;
    update();
  }

  async function del() {
    const p = list[i];
    if (await onDelete(p)) {
      list = list.filter((x) => x.id !== p.id);
      update();
    }
  }

  function onKey(e) {
    if (document.querySelector('.overlay')) return; // une modale est ouverte par-dessus
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'ArrowRight') go(1);
  }

  function close() {
    document.removeEventListener('keydown', onKey);
    if (url) URL.revokeObjectURL(url);
    root.remove();
    document.body.classList.remove('no-scroll');
  }

  // Glissement horizontal (mobile)
  let x0 = null;
  img.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  img.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
    x0 = null;
  });

  document.addEventListener('keydown', onKey);
  document.body.classList.add('no-scroll');
  document.body.append(root);
  update();
}
