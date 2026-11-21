import { h, fill, icon, blobUrl, fmtPrice, fmtNum, fmtDate, toast, actionSheet, confirmDialog, promptDialog, pickImages } from '../ui.js';
import { listAcquereurs, getBien, saveBien, deleteBien, listPhotos, putPhoto, deletePhoto, deletePhotosOfPiece, reorderPhotos, saveEvent, uid } from '../db.js';
import { SECTIONS, PIECES_SUGGEREES } from '../config.js';
import { processImage, rotateImage, cropImage } from '../images.js';
import { setTopbar, isCurrent } from '../app.js';
import { statutInfo } from './list.js';
import { openLightbox } from './lightbox.js';
import { openCropper } from './cropper.js';
import { renderJournal } from './journal.js';
import { renderDocs } from './docs.js';
import { renderAcquereursPourBien, vendeurCard } from './contacts.js';
import { formDialog } from '../dialogs.js';
import { formatValue, isEmpty } from '../format.js';
import { openShareMenu } from './share.js';

/** Nom unique : « Chambre » -> « Chambre 2 » si besoin. */
function uniqueName(name, pieces) {
  const names = new Set(pieces.map((p) => p.nom.toLowerCase()));
  if (!names.has(name.toLowerCase())) return name;
  let i = 2;
  while (names.has(`${name} ${i}`.toLowerCase())) i++;
  return `${name} ${i}`;
}

const photoRank = (p) => (typeof p.order === 'number' ? p.order : Date.parse(p.createdAt) || 0);

export async function renderDetail(view, id, token) {
  let bien = await getBien(id);
  if (!bien) { toast('Bien introuvable'); location.hash = '#/biens'; return; }
  let photos = await listPhotos(id);
  let contacts = await listAcquereurs();
  if (!isCurrent(token)) return;

  const topbar = () => setTopbar({
    title: bien.titre || 'Bien',
    back: '#/biens',
    actions: [
      { icon: 'share', label: 'Partager', onClick: () => openShareMenu(bien) },
      { icon: 'edit', label: 'Modifier', onClick: () => { location.hash = `#/bien/${encodeURIComponent(id)}/modifier`; } },
      { icon: 'more', label: 'Plus d’actions', onClick: moreActions },
    ],
  });
  topbar();

  const hero = h('div', { class: 'hero' });
  const headWrap = h('div');
  const journalSection = h('section', { class: 'section' });
  const photosSection = h('section', { class: 'section' });
  const docsSection = h('section', { class: 'section' });
  const acqSection = h('section', { class: 'section' });
  const infoWrap = h('div');
  view.append(hero, h('div', { class: 'detail' }, headWrap, journalSection, acqSection, photosSection, docsSection, infoWrap));

  const ctx = {
    getBien: () => bien,
    persist: async (b) => { bien = await saveBien(b); return bien; },
    refresh: refreshAll,
    addPhotos: () => choosePieceThenPhotos(),
    addDocument: () => docs.add(),
    onChange: () => journal.refresh(),
  };

  fill(headWrap, header());
  renderHero();
  renderPhotos();
  fill(infoWrap, infoSections());
  const journal = await renderJournal(journalSection, ctx);
  const docs = await renderDocs(docsSection, ctx);
  renderAcquereursPourBien(acqSection, bien);

  async function refreshAll() {
    bien = await getBien(id);
    contacts = await listAcquereurs();
    topbar();
    fill(headWrap, header());
    renderHero();
    renderPhotos();
    fill(infoWrap, infoSections());
    await journal.refresh();
    renderAcquereursPourBien(acqSection, bien);
  }

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
      facts.length ? h('div', { class: 'facts facts-lg' }, facts.map((f) => h('span', { class: 'fact' }, f))) : null,
      h('div', { class: 'head-actions' },
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => openShareMenu(bien) }, icon('share'), 'Partager l’annonce'),
        h('a', { class: 'btn', href: `#/simulateur/${encodeURIComponent(bien.id)}` }, icon('calculator'), 'Simuler')));
  }

  // ---------- Photo principale ----------
  function piecePhotos(pieceId) {
    return photos.filter((p) => p.pieceId === pieceId);
  }

  function orderedPhotos() {
    return bien.pieces.flatMap((piece) => piecePhotos(piece.id));
  }

  function coverPhoto() {
    return photos.find((p) => p.id === bien.coverPhotoId) || orderedPhotos()[0] || null;
  }

  function renderHero() {
    const cover = coverPhoto();
    if (cover) {
      const all = orderedPhotos();
      hero.classList.remove('hero-empty');
      fill(hero,
        h('img', { src: blobUrl(cover.blob), alt: '', onclick: () => openViewer(all, all.indexOf(cover)) }),
        h('span', { class: 'photo-count' }, icon('camera'), String(photos.length)));
    } else {
      hero.classList.add('hero-empty');
      fill(hero, h('button', { class: 'hero-add', type: 'button', onclick: () => choosePieceThenPhotos() },
        icon('camera', 'icon-xl'), h('span', null, 'Ajouter des photos')));
    }
  }

  // ---------- Pièces & photos ----------
  function renderPhotos() {
    const total = bien.pieces.reduce((s, p) => s + (Number(p.surface) || 0), 0);
    const roundTotal = Math.round(total * 100) / 100;
    const diff = total && Math.abs(roundTotal - (Number(bien.surfaceHabitable) || 0)) > 0.009;

    fill(photosSection,
      h('div', { class: 'section-head' },
        h('h3', null, 'Pièces & photos'),
        h('button', { class: 'btn btn-sm', type: 'button', onclick: addPiece }, icon('plus'), 'Pièce')),
      total ? h('div', { class: 'pieces-total' },
        h('span', null, 'Total des pièces : ', h('strong', null, `${fmtNum(roundTotal)} m²`)),
        diff ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: async () => {
          if (!(await confirmDialog(`Utiliser ${fmtNum(roundTotal)} m² comme surface habitable ?`, { okLabel: 'Oui' }))) return;
          bien.surfaceHabitable = roundTotal;
          await persist();
          fill(headWrap, header());
          renderPhotos();
          fill(infoWrap, infoSections());
        } }, 'Reporter en surface habitable') : null) : null,
      bien.pieces.length ? null : h('div', { class: 'pieces-empty' },
        h('p', { class: 'muted' }, 'Créez une pièce ou un emplacement, puis ajoutez-y vos photos, sa surface et vos remarques.'),
        h('div', { class: 'chips' }, ['Façade', 'Séjour', 'Cuisine', 'Chambre', 'Salle de bain', 'Jardin'].map((n) =>
          h('button', { class: 'chip', type: 'button', onclick: () => createPiece(n) }, icon('plus'), n)))),
      bien.pieces.map((piece, idx) => {
        const pPhotos = piecePhotos(piece.id);
        return h('div', { class: 'piece' },
          h('div', { class: 'piece-head' },
            h('button', { class: 'piece-name', type: 'button', onclick: () => editPiece(piece) },
              piece.nom,
              piece.surface ? h('span', { class: 'piece-surface' }, `${fmtNum(piece.surface)} m²`) : null,
              h('span', { class: 'muted small' }, ` · ${pPhotos.length} photo${pPhotos.length > 1 ? 's' : ''}`)),
            h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Options de la pièce', onclick: () => pieceMenu(piece, idx) }, icon('more'))),
          piece.remarques ? h('p', { class: 'piece-notes' }, piece.remarques) : null,
          h('div', { class: 'thumbs' },
            pPhotos.map((p, i) => h('button', {
              class: 'thumb' + (p.id === bien.coverPhotoId ? ' is-cover' : ''), type: 'button',
              onclick: () => openViewer(pPhotos, i),
            }, h('img', { src: blobUrl(p.thumb || p.blob), alt: piece.nom, loading: 'lazy' }),
            p.id === bien.coverPhotoId ? h('span', { class: 'cover-flag' }, icon('star')) : null)),
            h('button', { class: 'thumb thumb-add', type: 'button', onclick: () => addPhotos(piece) },
              icon('camera'), h('span', null, 'Ajouter'))));
      }));
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
    return createPiece(nom);
  }

  /** Depuis le journal ou la photo vide : choisir la pièce puis ajouter les photos. */
  async function choosePieceThenPhotos() {
    if (!bien.pieces.length) {
      const piece = await addPiece();
      if (piece) addPhotos(piece);
      return;
    }
    actionSheet('Dans quelle pièce ?', [
      ...bien.pieces.map((p) => ({ label: p.nom, onClick: () => addPhotos(p) })),
      { icon: 'plus', label: 'Nouvelle pièce…', onClick: async () => { const p = await addPiece(); if (p) addPhotos(p); } },
    ]);
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
    if (ok) await saveEvent({ type: 'photo', bienId: bien.id, count: ok, pieceNom: piece.nom });
    await persist(); // met à jour la date de modification
    toast(ok === files.length ? `${ok} photo${ok > 1 ? 's' : ''} ajoutée${ok > 1 ? 's' : ''}` : `${ok}/${files.length} photos ajoutées (certaines illisibles)`);
    renderHero();
    renderPhotos();
    journal.refresh();
  }

  async function editPiece(piece) {
    const v = await formDialog(piece.nom, [
      { key: 'nom', label: 'Nom', required: true },
      { key: 'surface', label: 'Surface', type: 'number', unit: 'm²' },
      { key: 'remarques', label: 'Remarques', type: 'textarea', placeholder: 'Ex : parquet chêne, double exposition, placard 2,11 m²…' },
    ], piece);
    if (!v) return;
    piece.nom = v.nom === piece.nom ? piece.nom : uniqueName(v.nom, bien.pieces.filter((p) => p !== piece));
    piece.surface = v.surface;
    piece.remarques = v.remarques;
    await persist();
    renderPhotos();
  }

  function pieceMenu(piece, idx) {
    const actions = [
      { icon: 'camera', label: 'Ajouter des photos', onClick: () => addPhotos(piece) },
      { icon: 'rename', label: 'Nom, surface et remarques', onClick: () => editPiece(piece) },
    ];
    if (idx > 0) actions.push({ icon: 'up', label: 'Monter', onClick: () => movePiece(idx, -1) });
    if (idx < bien.pieces.length - 1) actions.push({ icon: 'down', label: 'Descendre', onClick: () => movePiece(idx, 1) });
    actions.push({ icon: 'trash', label: 'Supprimer la pièce', danger: true, onClick: () => removePiece(piece) });
    actionSheet(piece.nom, actions);
  }

  async function movePiece(idx, dir) {
    const [p] = bien.pieces.splice(idx, 1);
    bien.pieces.splice(idx + dir, 0, p);
    await persist();
    renderHero();
    renderPhotos();
  }

  async function removePiece(piece) {
    const n = piecePhotos(piece.id).length;
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
  function replacePhoto(np) {
    photos = photos.map((x) => (x.id === np.id ? np : x));
    renderHero();
    renderPhotos();
  }

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
      onRotate: async (p, clockwise = true) => {
        toast('Rotation…', 0);
        const np = { ...p, ...(await rotateImage(p.blob, clockwise)) };
        await putPhoto(np);
        replacePhoto(np);
        toast('Photo pivotée');
        return np;
      },
      onCrop: async (p) => {
        const rect = await openCropper(p.blob);
        if (!rect) return null;
        toast('Recadrage…', 0);
        const np = { ...p, ...(await cropImage(p.blob, rect)) };
        await putPhoto(np);
        replacePhoto(np);
        toast('Photo recadrée');
        return np;
      },
      onShift: async (p, dir) => {
        const list2 = piecePhotos(p.pieceId);
        const i = list2.findIndex((x) => x.id === p.id);
        const j = i + dir;
        if (j < 0 || j >= list2.length) return null;
        [list2[i], list2[j]] = [list2[j], list2[i]];
        await reorderPhotos(list2.map((x) => x.id));
        list2.forEach((x, k) => { x.order = k; });
        photos.sort((a, b) => photoRank(a) - photoRank(b));
        renderHero();
        renderPhotos();
        return list2;
      },
      onMove: (p) => {
        const others = bien.pieces.filter((x) => x.id !== p.pieceId);
        if (!others.length) { toast('Créez d’abord une autre pièce'); return Promise.resolve(false); }
        return new Promise((resolve) => {
          actionSheet('Déplacer vers…', others.map((piece) => ({
            label: piece.nom,
            onClick: async () => {
              p.pieceId = piece.id;
              delete p.order;
              await putPhoto(p);
              await persist();
              toast(`Photo déplacée vers « ${piece.nom} »`);
              renderHero();
              renderPhotos();
              resolve(true);
            },
          })), { onCancel: () => resolve(false) });
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
      const isVendeurSection = s.id === 'proprietaire';
      if (!rows.length && !isVendeurSection) continue;
      const body = h('div', { class: 'info-grid' });
      if (isVendeurSection) {
        const card = vendeurCard(bien, contacts);
        body.append(h('div', { class: 'info full' }, card || h('p', { class: 'muted small', style: { margin: 0 } },
          'Aucun vendeur lié. ',
          h('a', { href: `#/bien/${encodeURIComponent(id)}/modifier` }, 'Choisir ou créer le vendeur'))));
      }
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
      { icon: 'share', label: 'Partager l’annonce', onClick: () => openShareMenu(bien) },
      { icon: 'calculator', label: 'Simulation (honoraires, notaire, crédit)', onClick: () => { location.hash = `#/simulateur/${encodeURIComponent(bien.id)}`; } },
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
    const ok = await confirmDialog(`Supprimer définitivement « ${bien.titre || 'ce bien'} », ses photos, documents et son historique ?`, { okLabel: 'Supprimer', danger: true });
    if (!ok) return;
    await deleteBien(bien.id);
    toast('Bien supprimé');
    location.hash = '#/biens';
  }
}
