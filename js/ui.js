// Petits utilitaires d'interface : création d'éléments, icônes, modales, toasts.

/** Crée un élément DOM. Le texte est toujours inséré en texte brut (sécurisé). */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  let value;
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'multiple' || k === 'required') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  if (value !== undefined) el.value = value;
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
}

export function clear(el) { while (el.firstChild) el.firstChild.remove(); }

/** Remplace le contenu d'un élément (ignore null/false, accepte des tableaux). */
export function fill(el, ...children) {
  clear(el);
  append(el, children);
  return el;
}

// ---------- Icônes (tracés type « Lucide », licence ISC) ----------
const ICONS = {
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  edit: '<path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  home: '<path d="M3 10a2 2 0 0 1 .71-1.53l7-6a2 2 0 0 1 2.58 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/>',
  settings: '<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
  star: '<path d="M11.53 2.3a.53.53 0 0 1 .95 0l2.31 4.68a2.12 2.12 0 0 0 1.6 1.16l5.16.76a.53.53 0 0 1 .3.9l-3.74 3.64a2.12 2.12 0 0 0-.61 1.88l.88 5.14a.53.53 0 0 1-.77.56l-4.62-2.43a2.12 2.12 0 0 0-1.97 0L6.4 21.01a.53.53 0 0 1-.77-.56l.88-5.14a2.12 2.12 0 0 0-.61-1.88L2.16 9.8a.53.53 0 0 1 .3-.91l5.16-.75a2.12 2.12 0 0 0 1.6-1.16z"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  pin: '<path d="M20 10c0 5-5.54 10.19-7.4 11.8a1 1 0 0 1-1.2 0C9.54 20.19 4 15 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  move: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
  surface: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  bed: '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>',
  grid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
  tree: '<path d="M12 22v-7"/><path d="M17 8.5a5 5 0 1 0-10 0c0 2.5 2 4.5 5 6.5 3-2 5-4 5-6.5z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  rename: '<path d="M12 20h9"/><path d="M16.38 3.62a1 1 0 0 1 3 3L7.37 18.64a2 2 0 0 1-.85.5l-2.87.84a.5.5 0 0 1-.62-.62l.84-2.87a2 2 0 0 1 .5-.85z"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  building: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  euro: '<path d="M4 10h12"/><path d="M4 14h9"/><path d="M19 6a7.7 7.7 0 0 0-5.2-2A7.9 7.9 0 0 0 6 12c0 4.4 3.5 8 7.8 8 2 0 3.8-.8 5.2-2"/>',
  tag: '<path d="M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.42l8.7 8.7a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r="1"/>',
  note: '<path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z"/><path d="M15 3v6h6"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  clip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  rotate: '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
  crop: '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>',
  sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 3v4"/><path d="M21 5h-4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  dashboard: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  calculator: '<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M8 6h8"/><path d="M16 14v4"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/>',
  map: '<path d="M14.1 5.55a2 2 0 0 0 1.79 0l3.66-1.83A1 1 0 0 1 21 4.62v12.76a1 1 0 0 1-.55.9l-4.56 2.27a2 2 0 0 1-1.79 0l-4.2-2.1a2 2 0 0 0-1.8 0l-3.65 1.83A1 1 0 0 1 3 19.38V6.62a1 1 0 0 1 .55-.9l4.56-2.27a2 2 0 0 1 1.79 0z"/><path d="M15 5.76v15"/><path d="M9 3.24v15"/>',
  list: '<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  message: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  printer: '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98"/><path d="m15.41 6.51-6.82 3.98"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  eye: '<path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
};

export function icon(name, cls = '') {
  const span = document.createElement('span');
  span.className = 'icon ' + cls;
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  return span;
}

export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    if (!el.firstChild) el.append(icon(el.dataset.icon));
  });
}

// ---------- URLs d'objets (photos) libérées à chaque changement d'écran ----------
const objectUrls = new Set();
export function blobUrl(blob) {
  const u = URL.createObjectURL(blob);
  objectUrls.add(u);
  return u;
}
export function releaseBlobUrls() {
  objectUrls.forEach((u) => URL.revokeObjectURL(u));
  objectUrls.clear();
}

// ---------- Formatage ----------
const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
export const fmtPrice = (v) => (v === '' || v == null ? '' : eur.format(v));
export const fmtNum = (v) => (v === '' || v == null ? '' : num.format(v));
export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR') : '');
export const fmtDateTime = (iso) => (iso
  ? new Date(iso).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '');

/** Le navigateur sait-il partager des fichiers (téléphones) ? */
export function canShareFiles(type = 'application/pdf') {
  try {
    return !!(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'test', { type })] }));
  } catch (e) { return false; }
}

/** Télécharge un fichier (Blob/File). */
export function downloadFile(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Partage un fichier si possible (téléphone), sinon le télécharge. Doit partir d'un toucher. */
export async function shareOrDownload(file, { title = '', text = '' } = {}) {
  if (canShareFiles(file.type) && /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent)) {
    try {
      await navigator.share({ files: [file], title, text });
      return true;
    } catch (e) {
      if (e.name === 'AbortError') return false;
    }
  }
  downloadFile(file, file.name);
  return true;
}

// ---------- Toast ----------
let toastTimer;

/** Message avec un bouton d'action (ex. « Annuler »), visible quelques secondes. */
export function toastAction(msg, label, onAction, ms = 5000) {
  const el = document.getElementById('toast');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'toast-action';
  btn.textContent = label;
  btn.addEventListener('click', () => { el.classList.remove('show', 'with-action'); clearTimeout(toastTimer); onAction(); });
  el.replaceChildren(document.createTextNode(msg), btn);
  el.classList.add('show', 'with-action');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show', 'with-action'), ms);
}

export function toast(msg, ms = 2600) {
  const el = document.getElementById('toast');
  el.classList.remove('with-action');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// ---------- Modales ----------
export function openOverlay(content, { onClose, kind = 'sheet' } = {}) {
  const overlay = h('div', { class: `overlay overlay-${kind}` });
  const panel = h('div', { class: `panel panel-${kind}`, role: 'dialog', 'aria-modal': 'true' }, content);
  overlay.append(panel);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), 180);
    onClose && onClose();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
  return { close, panel };
}

/** Menu d'actions (feuille du bas sur mobile). */
export function actionSheet(title, actions, { onCancel } = {}) {
  let ctl;
  let chosen = false;
  const list = actions.map((a) =>
    h('button', {
      class: 'sheet-action' + (a.danger ? ' danger' : ''),
      type: 'button',
      onclick: () => { chosen = true; ctl.close(); a.onClick(); },
    }, a.icon ? icon(a.icon) : null, a.label));
  ctl = openOverlay([
    title ? h('div', { class: 'sheet-title' }, title) : null,
    ...list,
    h('button', { class: 'sheet-action cancel', type: 'button', onclick: () => ctl.close() }, 'Annuler'),
  ], { onClose: () => { if (!chosen && onCancel) onCancel(); } });
}

export function confirmDialog(message, { okLabel = 'Confirmer', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const ctl = openOverlay([
      h('p', { class: 'dialog-msg' }, message),
      h('div', { class: 'dialog-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => { finish(false); ctl.close(); } }, 'Annuler'),
        h('button', { class: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'), type: 'button', onclick: () => { finish(true); ctl.close(); } }, okLabel)),
    ], { kind: 'dialog', onClose: () => finish(false) });
  });
}

export function promptDialog(title, { value = '', placeholder = '', okLabel = 'OK', suggestions = [] } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const input = h('input', { class: 'input', type: 'text', value, placeholder, enterkeyhint: 'done' });
    const submit = () => {
      const v = input.value.trim();
      if (!v) { input.focus(); return; }
      finish(v);
      ctl.close();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    const chips = suggestions.length
      ? h('div', { class: 'chips chips-suggest' }, suggestions.map((s) =>
        h('button', { class: 'chip', type: 'button', onclick: () => { input.value = s; submit(); } }, s)))
      : null;
    const ctl = openOverlay([
      h('div', { class: 'sheet-title' }, title),
      h('div', { class: 'dialog-body' }, input, chips),
      h('div', { class: 'dialog-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => { finish(null); ctl.close(); } }, 'Annuler'),
        h('button', { class: 'btn btn-primary', type: 'button', onclick: submit }, okLabel)),
    ], { kind: 'dialog', onClose: () => finish(null) });
    setTimeout(() => { if (!suggestions.length || value) input.focus(); }, 60);
  });
}

/** Ouvre le sélecteur de fichiers quelconques. */
export function pickFiles({ accept = '*/*', multiple = false } = {}) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, multiple, style: { display: 'none' } });
    input.addEventListener('change', () => { resolve(Array.from(input.files || [])); input.remove(); });
    document.body.append(input);
    input.click();
  });
}

/** Ouvre le sélecteur de fichiers (galerie ou appareil photo). */
export function pickImages({ camera = false } = {}) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept: 'image/*', multiple: !camera, style: { display: 'none' } });
    if (camera) input.setAttribute('capture', 'environment');
    input.addEventListener('change', () => {
      resolve(Array.from(input.files || []));
      input.remove();
    });
    document.body.append(input);
    input.click();
  });
}
