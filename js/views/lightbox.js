// Visionneuse plein écran : navigation (boutons, clavier, glissement) + actions sur la photo.
//
// handlers (tous optionnels, asynchrones) :
//   onSetCover(p)            -> photo principale
//   onRotate(p)  -> photo    -> photo pivotée (nouvel objet)
//   onCrop(p)    -> photo|null
//   onShift(p, dir) -> liste -> nouvel ordre de la liste affichée (dir = -1 / +1)
//   onMove(p)    -> bool     -> déplacée vers une autre pièce
//   onDelete(p)  -> bool
import { h, icon, actionSheet, toast } from '../ui.js';

export function openLightbox({ photos, index = 0, pieceName, isCover, ...handlers }) {
  let list = [...photos];
  let i = Math.max(0, index);
  let url = null;
  let busy = false;

  const img = h('img', { class: 'lb-img', alt: '' });
  const caption = h('div', { class: 'lb-caption' });
  const coverBtn = h('button', { class: 'lb-btn', type: 'button', onclick: () => act(async (p) => { await handlers.onSetCover(p); }) });

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
      h('button', { class: 'lb-btn', type: 'button', onclick: rotate }, icon('rotate'), h('span', null, 'Pivoter')),
      h('button', { class: 'lb-btn', type: 'button', onclick: crop }, icon('crop'), h('span', null, 'Recadrer')),
      h('button', { class: 'lb-btn', type: 'button', onclick: more }, icon('more'), h('span', null, 'Plus'))));

  /** Exécute une action en évitant les doubles touchers. */
  async function act(fn) {
    if (busy || !list.length) return;
    busy = true;
    root.classList.add('busy');
    try { await fn(list[i]); } catch (e) { console.error(e); toast('Action impossible'); }
    busy = false;
    root.classList.remove('busy');
    update();
  }

  function rotate() {
    act(async (p) => {
      const np = await handlers.onRotate(p);
      if (np) list[i] = np;
    });
  }

  function crop() {
    act(async (p) => {
      const np = await handlers.onCrop(p);
      if (np) list[i] = np;
    });
  }

  function more() {
    const p = list[i];
    const actions = [];
    if (list.length > 1 && i > 0) actions.push({ icon: 'left', label: 'Placer avant', onClick: () => shift(-1) });
    if (list.length > 1 && i < list.length - 1) actions.push({ icon: 'right', label: 'Placer après', onClick: () => shift(1) });
    actions.push({ icon: 'rotate', label: 'Pivoter vers la gauche', onClick: () => act(async (ph) => { const np = await handlers.onRotate(ph, false); if (np) list[i] = np; }) });
    actions.push({ icon: 'move', label: 'Déplacer vers une autre pièce…', onClick: () => act(async (ph) => { await handlers.onMove(ph); }) });
    actions.push({ icon: 'trash', label: 'Supprimer la photo', danger: true, onClick: () => act(async (ph) => {
      if (await handlers.onDelete(ph)) list = list.filter((x) => x.id !== ph.id);
    }) });
    actionSheet(pieceName(p) || 'Photo', actions);
  }

  function shift(dir) {
    act(async (p) => {
      const nl = await handlers.onShift(p, dir);
      if (nl) { list = nl; i = list.findIndex((x) => x.id === p.id); }
    });
  }

  function update() {
    if (!list.length) { close(); return; }
    i = Math.min(Math.max(0, i), list.length - 1);
    const p = list[i];
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(p.blob);
    img.src = url;
    caption.textContent = `${pieceName(p)} — ${i + 1} / ${list.length}`;
    const cover = isCover(p);
    coverBtn.replaceChildren(icon('star', cover ? 'filled' : ''), h('span', null, cover ? 'Principale' : 'Principale ?'));
    coverBtn.disabled = cover;
    root.classList.toggle('single', list.length < 2);
  }

  function go(d) {
    if (list.length < 2 || busy) return;
    i = (i + d + list.length) % list.length;
    update();
  }

  function onKey(e) {
    if (document.querySelector('.overlay, .cropper')) return; // une fenêtre est ouverte par-dessus
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
