import { h, icon, blobUrl, fmtPrice, fmtNum, fmtDate, toast, actionSheet, confirmDialog, promptDialog, pickImages } from '../ui.js';
import { getBien, saveBien, deleteBien, listPhotos, putPhoto, deletePhoto, deletePhotosOfPiece, uid } from '../db.js';
import { SECTIONS, PIECES_SUGGEREES } from '../config.js';
import { processImage } from '../images.js';
import { setTopbar, isCurrent } from '../app.js';
import { statutInfo } from './list.js';
import { openLightbox } from './lightbox.js';

const optLabel = (f, v) => {
  if (f.type !== 'select') return v;
  const o = f.options.find((x) => (typeof x === 'object' ? x.value : x) === v);
  return o ? (typeof o === 'object' ? o.label : o) : v;
};

function formatValue(f, v) {
  if (f.type === 'number') {
    if (f.unit === '€' || (f.unit || '').startsWith('€')) return fmtPrice(v) + (f.unit && f.unit !== '€' ? f.unit.slice(1) : '');
    return fmtNum(v) + (f.unit ? ' ' + f.unit : '');
  }
  if (f.type === 'date') return fmtDate(v);
  return optLabel(f, v);
}

const isEmpty = (v) => v == null || v === '' || (Array.isArray(v) && !v.length);

/** Nom unique : « Chambre » -> « Chambre 2 » si besoin. */
function uniqueName(name, pieces) {
  const names = new Set(pieces.map((p) => p.nom.toLowerCase()));
  if (!names.has(name.toLowerCase())) return name;
  let i = 2;
  while (names.has(`${name} ${i}`.toLowerCase())) i++;
  return `${name} ${i}`;
}

export async function renderDetail(view, id, token) {
  let bien = await getBien(id);
  if (!bien) { toast('Bien introuvable'); location.hash = '#/'; return; }
  let photos = await listPhotos(id);
  if (!isCurrent(token)) return;

  setTopbar({
    title: bien.titre || 'Bien',
    back: '#/',
    actions: [
      { icon: 'edit', label: 'Modifier', onClick: () => { location.hash = `#/bien/${encodeURIComponent(id)}/modifier`; } },
      { icon: 'more', label: 'Plus d’actions', onClick: moreActions },
    ],
  });

  const hero = h('div', { class: 'hero' });
  const photosSection = h('section', { class: 'section' });
  view.append(hero, h('div', { class: 'detail' }, header(), photosSection, infoSections()));

  renderHero();
  renderPhotos();

  // ---------- En-tête ----------
  function header() {
    const st = statutInfo(bien.statut);
    const lieu = [bien.adresse, [bien.codePostal, bien.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    const facts = [
      bien.surfaceHabitable ? [icon('surface'), `${fmtNum(bien.surfaceHabitable)} m²`] : null,
      bien.nbPieces ? [icon('grid'), `${bien.nbPieces} pièce${bien.nbPieces > 1 ? 's' : ''}`] : null,
      bien.nbChambres ? [icon('bed'), `${bien.nbChambres} chambre${bien.nbChambres > 1 ? 's' : ''}`] : null,
      bien.surfaceTerrain ? [icon('tree'), `Terrain ${fmtNum(bien.surfaceTerrain)} m²`] : null,
    ].filter(Boolean);
    return h('div', { class: 'detail-head' },
      h('div', { class: 'card-top' },
        h('span', { class: `badge badge-${st.color}` }, st.label),
        bien.transaction ? h('span', { class: 'badge badge-outline' }, bien.transaction) : null,
        bien.typeBien ? h('span', { class: 'badge badge-outline' }, bien.typeBien) : null,
        bien.reference ? h('span', { class: 'card-ref muted' }, 'Réf. ' + bien.reference) : null),
      h('h2', { class: 'detail-title' }, bien.titre || 'Sans titre'),
      bien.prix !== '' && bien.prix != null
        ? h('div', { class: 'detail-price' }, fmtPrice(bien.prix), bien.transaction === 'Location' ? h('small', null, ' /mois') : null)
        : null,
      lieu ? h('a', {
        class: 'detail-place', target: '_blank', rel: 'noopener',
        href: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(lieu),
      }, icon('pin'), lieu) : null,
      facts.length ? h('div', { class: 'facts facts-lg' }, facts.map((f) => h('span', { class: 'fact' }, f))) : null);
  }

  // ---------- Photo principale ----------
  function coverPhoto() {
    const byId = photos.find((p) => p.id === bien.coverPhotoId);
    if (byId) return byId;
    for (const piece of bien.pieces) {
      const p = photos.find((ph) => ph.pieceId === piece.id);
      if (p) return p;
    }
    return null;
  }

  function orderedPhotos() {
    return bien.pieces.flatMap((piece) => photos.filter((p) => p.pieceId === piece.id));
  }

  function renderHero() {
    hero.replaceChildren();
    const cover = coverPhoto();
    if (cover) {
      const all = orderedPhotos();
      hero.append(h('img', { src: blobUrl(cover.blob), alt: '', onclick: () => openViewer(all, all.indexOf(cover)) }),
        h('span', { class: 'photo-count' }, icon('camera'), String(photos.length)));
      hero.classList.remove('hero-empty');
    } else {
      hero.classList.add('hero-empty');
      hero.append(h('button', { class: 'hero-add', type: 'button', onclick: () => addPieceThenPhotos() },
        icon('camera', 'icon-xl'), h('span', null, 'Ajouter des photos')));
    }
  }

  // ---------- Photos par pièce ----------
  function renderPhotos() {
    photosSection.replaceChildren(
      h('div', { class: 'section-head' },
        h('h3', null, 'Photos par pièce'),
        h('button', { class: 'btn btn-sm', type: 'button', onclick: addPiece }, icon('plus'), 'Pièce')));

    if (!bien.pieces.length) {
      photosSection.append(h('div', { class: 'pieces-empty' },
        h('p', { class: 'muted' }, 'Créez une pièce ou un emplacement, puis ajoutez-y vos photos.'),
        h('div', { class: 'chips' }, ['Façade', 'Séjour', 'Cuisine', 'Chambre', 'Salle de bain', 'Jardin'].map((n) =>
          h('button', { class: 'chip', type: 'button', onclick: () => createPiece(n) }, icon('plus'), n)))));
      return;
    }

    bien.pieces.forEach((piece, idx) => {
      const pPhotos = photos.filter((p) => p.pieceId === piece.id);
      const thumbs = h('div', { class: 'thumbs' },
        pPhotos.map((p, i) => h('button', {
          class: 'thumb' + (p.id === bien.coverPhotoId ? ' is-cover' : ''), type: 'button',
          onclick: () => openViewer(pPhotos, i, piece),
        }, h('img', { src: blobUrl(p.thumb || p.blob), alt: piece.nom, loading: 'lazy' }),
        p.id === bien.coverPhotoId ? h('span', { class: 'cover-flag' }, icon('star')) : null)),
        h('button', { class: 'thumb thumb-add', type: 'button', onclick: () => addPhotos(piece) },
          icon('camera'), h('span', null, 'Ajouter')));

      photosSection.append(h('div', { class: 'piece' },
        h('div', { class: 'piece-head' },
          h('div', { class: 'piece-name' }, piece.nom, h('span', { class: 'muted small' }, ` · ${pPhotos.length} photo${pPhotos.length > 1 ? 's' : ''}`)),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Options de la pièce', onclick: () => pieceMenu(piece, idx) }, icon('more'))),
        thumbs));
    });
  }

  async function persist() {
    bien = await saveBien(bien);
  }

  async function createPiece(nom) {
    const piece = { id: uid(), nom: uniqueName(nom, bien.pieces) };
    bien.pieces.push(piece);
    await persist();
    renderPhotos();
    return piece;
  }

  async function addPiece() {
    const nom = await promptDialog('Nouvelle pièce / emplacement', {
      placeholder: 'Ex : Chambre parentale', okLabel: 'Créer', suggestions: PIECES_SUGGEREES,
    });
    if (!nom) return null;
    const piece = await createPiece(nom);
    return piece;
  }

  async function addPieceThenPhotos() {
    const piece = bien.pieces[0] || await addPiece();
    if (piece) addPhotos(piece);
  }

  function addPhotos(piece) {
    actionSheet(`Photos — ${piece.nom}`, [
      { icon: 'camera', label: 'Prendre une photo', onClick: () => pickImages({ camera: true }).then((f) => importFiles(f, piece)) },
      { icon: 'image', label: 'Choisir des photos', onClick: () => pickImages().then((f) => importFiles(f, piece)) },
    ]);
  }

  async function importFiles(files, piece) {
    if (!files.length) return;
    let ok = 0;
    for (let i = 0; i < files.length; i++) {
      toast(`Traitement de la photo ${i + 1}/${files.length}…`, 0);
      try {
        const img = await processImage(files[i]);
        const photo = { id: uid(), bienId: bien.id, pieceId: piece.id, createdAt: new Date().toISOString(), ...img };
        await putPhoto(photo);
        photos.push(photo);
        ok++;
      } catch (e) {
        console.error(e);
      }
    }
    await persist(); // met à jour la date de modification
    toast(ok === files.length ? `${ok} photo${ok > 1 ? 's' : ''} ajoutée${ok > 1 ? 's' : ''}` : `${ok}/${files.length} photos ajoutées (certaines illisibles)`);
    renderHero();
    renderPhotos();
  }

  function pieceMenu(piece, idx) {
    const actions = [
      { icon: 'camera', label: 'Ajouter des photos', onClick: () => addPhotos(piece) },
      { icon: 'rename', label: 'Renommer', onClick: () => renamePiece(piece) },
    ];
    if (idx > 0) actions.push({ icon: 'up', label: 'Monter', onClick: () => movePiece(idx, -1) });
    if (idx < bien.pieces.length - 1) actions.push({ icon: 'down', label: 'Descendre', onClick: () => movePiece(idx, 1) });
    actions.push({ icon: 'trash', label: 'Supprimer la pièce', danger: true, onClick: () => removePiece(piece) });
    actionSheet(piece.nom, actions);
  }

  async function renamePiece(piece) {
    const nom = await promptDialog('Renommer la pièce', { value: piece.nom, okLabel: 'Renommer' });
    if (!nom || nom === piece.nom) return;
    piece.nom = uniqueName(nom, bien.pieces.filter((p) => p !== piece));
    await persist();
    renderPhotos();
  }

  async function movePiece(idx, dir) {
    const [p] = bien.pieces.splice(idx, 1);
    bien.pieces.splice(idx + dir, 0, p);
    await persist();
    renderHero();
    renderPhotos();
  }

  async function removePiece(piece) {
    const n = photos.filter((p) => p.pieceId === piece.id).length;
    const ok = await confirmDialog(
      n ? `Supprimer « ${piece.nom} » et ses ${n} photo${n > 1 ? 's' : ''} ? Cette action est définitive.` : `Supprimer « ${piece.nom} » ?`,
      { okLabel: 'Supprimer', danger: true });
    if (!ok) return;
    await deletePhotosOfPiece(bien.id, piece.id);
    photos = photos.filter((p) => p.pieceId !== piece.id);
    bien.pieces = bien.pieces.filter((p) => p.id !== piece.id);
    if (bien.coverPhotoId && !photos.some((p) => p.id === bien.coverPhotoId)) bien.coverPhotoId = null;
    await persist();
    renderHero();
    renderPhotos();
  }

  // ---------- Visionneuse ----------
  function openViewer(list, index) {
    openLightbox({
      photos: list,
      index,
      pieceName: (p) => bien.pieces.find((x) => x.id === p.pieceId)?.nom || '',
      isCover: (p) => p.id === bien.coverPhotoId,
      onSetCover: async (p) => {
        bien.coverPhotoId = p.id;
        await persist();
        toast('Photo principale définie');
        renderHero();
        renderPhotos();
      },
      onMove: async (p) => {
        const others = bien.pieces.filter((x) => x.id !== p.pieceId);
        if (!others.length) { toast('Créez d’abord une autre pièce'); return false; }
        return new Promise((resolve) => {
          actionSheet('Déplacer vers…', others.map((piece) => ({
            label: piece.nom,
            onClick: async () => {
              p.pieceId = piece.id;
              await putPhoto(p);
              await persist();
              toast(`Photo déplacée vers « ${piece.nom} »`);
              renderHero();
              renderPhotos();
              resolve(true);
            },
          })));
        });
      },
      onDelete: async (p) => {
        const ok = await confirmDialog('Supprimer cette photo ? Cette action est définitive.', { okLabel: 'Supprimer', danger: true });
        if (!ok) return false;
        await deletePhoto(p.id);
        photos = photos.filter((x) => x.id !== p.id);
        if (bien.coverPhotoId === p.id) bien.coverPhotoId = null;
        await persist();
        renderHero();
        renderPhotos();
        return true;
      },
    });
  }

  // ---------- Informations ----------
  function infoSections() {
    const wrap = h('div');
    for (const s of SECTIONS) {
      const rows = s.fields.filter((f) => !isEmpty(bien[f.key]) && !['titre'].includes(f.key));
      if (!rows.length) continue;
      const body = h('div', { class: 'info-grid' });
      for (const f of rows) {
        const v = bien[f.key];
        if (f.type === 'chips') {
          body.append(h('div', { class: 'info full' }, h('div', { class: 'chips' }, v.map((x) => h('span', { class: 'chip chip-static' }, icon('check'), x)))));
        } else if (f.type === 'textarea') {
          body.append(h('div', { class: 'info full' }, h('div', { class: 'info-label' }, f.label), h('div', { class: 'info-text' }, v)));
        } else if (f.badge) {
          body.append(h('div', { class: 'info' }, h('div', { class: 'info-label' }, f.label),
            h('div', null, /^[A-G]$/.test(v) ? h('span', { class: `energy energy-${v}` }, v) : v)));
        } else if (f.type === 'tel') {
          body.append(h('div', { class: 'info' }, h('div', { class: 'info-label' }, f.label), h('a', { href: 'tel:' + v.replace(/\s/g, '') }, icon('phone'), v)));
        } else if (f.type === 'email') {
          body.append(h('div', { class: 'info' }, h('div', { class: 'info-label' }, f.label), h('a', { href: 'mailto:' + v }, icon('mail'), v)));
        } else {
          body.append(h('div', { class: 'info' + (f.full ? ' full' : '') }, h('div', { class: 'info-label' }, f.label), h('div', { class: 'info-value' }, formatValue(f, v))));
        }
      }
      wrap.append(h('section', { class: 'section' + (s.private ? ' section-private' : '') },
        h('div', { class: 'section-head' }, h('h3', null, s.title), s.private ? h('span', { class: 'badge badge-grey' }, 'Privé') : null),
        body));
    }
    const perso = (bien.champsPerso || []).filter((c) => c.label || c.value);
    if (perso.length) {
      wrap.append(h('section', { class: 'section' },
        h('div', { class: 'section-head' }, h('h3', null, 'Informations complémentaires')),
        h('div', { class: 'info-grid' }, perso.map((c) =>
          h('div', { class: 'info' }, h('div', { class: 'info-label' }, c.label), h('div', { class: 'info-value' }, c.value))))));
    }
    wrap.append(h('p', { class: 'muted small meta' }, `Créé le ${fmtDate(bien.createdAt)} · modifié le ${fmtDate(bien.updatedAt)}`));
    return wrap;
  }

  // ---------- Menu ⋮ ----------
  function moreActions() {
    actionSheet(bien.titre || 'Bien', [
      { icon: 'edit', label: 'Modifier les informations', onClick: () => { location.hash = `#/bien/${encodeURIComponent(id)}/modifier`; } },
      { icon: 'copy', label: 'Dupliquer (sans les photos)', onClick: duplicate },
      { icon: 'trash', label: 'Supprimer le bien', danger: true, onClick: remove },
    ]);
  }

  async function duplicate() {
    const copy = structuredClone(bien);
    delete copy.id; delete copy.createdAt; delete copy.coverPhotoId;
    copy.titre = (copy.titre || 'Bien') + ' (copie)';
    copy.pieces = copy.pieces.map((p) => ({ ...p, id: uid() }));
    const saved = await saveBien(copy);
    toast('Bien dupliqué');
    location.hash = `#/bien/${encodeURIComponent(saved.id)}`;
  }

  async function remove() {
    const ok = await confirmDialog(`Supprimer définitivement « ${bien.titre || 'ce bien'} » et toutes ses photos ?`, { okLabel: 'Supprimer', danger: true });
    if (!ok) return;
    await deleteBien(bien.id);
    toast('Bien supprimé');
    location.hash = '#/';
  }
}
