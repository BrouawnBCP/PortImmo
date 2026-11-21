// Stockage local (IndexedDB).
// Magasins : biens, photos, events (journal), docs (documents), acquereurs, meta (réglages).
//
// Les fichiers (photos, documents, logo) sont stockés en données brutes (ArrayBuffer + type)
// et NON en Blob : Safari sur iPhone perd parfois les Blob enregistrés dans IndexedDB.
// En mémoire, l'application manipule des Blob (photo.blob, photo.thumb, doc.blob).

const DB_NAME = 'portimmo';
// v2 : magasin « meta » · v3 : « events », « docs », « acquereurs »
const DB_VERSION = 3;

let dbPromise;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const ensure = (name, index) => {
        if (db.objectStoreNames.contains(name)) return;
        const s = db.createObjectStore(name, { keyPath: name === 'meta' ? 'key' : 'id' });
        if (index) s.createIndex(index, index);
      };
      ensure('biens');
      ensure('photos', 'bienId');
      ensure('meta');
      ensure('events', 'bienId');
      ensure('docs', 'bienId');
      ensure('acquereurs');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function reqP(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(stores, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let result;
    Promise.resolve(fn(t)).then((r) => { result = r; }, reject);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const getAll = (store) => run(store, 'readonly', (t) => reqP(t.objectStore(store).getAll()));
const getOne = (store, id) => run(store, 'readonly', (t) => reqP(t.objectStore(store).get(id)));
const getByBien = (store, bienId) => run(store, 'readonly', (t) => reqP(t.objectStore(store).index('bienId').getAll(bienId)));
const putOne = (store, rec) => run(store, 'readwrite', (t) => { t.objectStore(store).put(rec); return rec; });
const delOne = (store, id) => run(store, 'readwrite', (t) => { t.objectStore(store).delete(id); });

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// ---------- Conversion fichiers <-> données brutes ----------

async function packFile(obj, field, dataKey, typeKey) {
  const blob = obj[field];
  delete obj[field];
  if (blob) { obj[dataKey] = await blob.arrayBuffer(); obj[typeKey] = blob.type || 'application/octet-stream'; }
}

function unpackFile(obj, field, dataKey, typeKey) {
  if (obj[dataKey]) obj[field] = new Blob([obj[dataKey]], { type: obj[typeKey] });
  else if (!obj[field]) obj[field] = null; // obj[field] déjà présent : ancien format (Blob)
  delete obj[dataKey];
  delete obj[typeKey];
  return obj;
}

// ---------- Biens ----------

export const listBiens = () => getAll('biens');
export const getBien = (id) => getOne('biens', id);

export function saveBien(bien) {
  const now = new Date().toISOString();
  const b = { ...bien, updatedAt: now };
  if (!b.id) b.id = uid();
  if (!b.createdAt) b.createdAt = now;
  if (!Array.isArray(b.pieces)) b.pieces = [];
  return putOne('biens', b);
}

/** Enregistre sans changer la date de modification (ex. coordonnées GPS calculées). */
export const putBienSilently = (bien) => putOne('biens', bien);

export function deleteBien(id) {
  return run(['biens', 'photos', 'events', 'docs'], 'readwrite', async (t) => {
    t.objectStore('biens').delete(id);
    for (const store of ['photos', 'events', 'docs']) {
      const s = t.objectStore(store);
      const keys = await reqP(s.index('bienId').getAllKeys(id));
      keys.forEach((k) => s.delete(k));
    }
  });
}

// ---------- Photos ----------

async function photoToRecord(photo) {
  const rec = { ...photo };
  await packFile(rec, 'blob', 'data', 'type');
  await packFile(rec, 'thumb', 'thumbData', 'thumbType');
  return rec;
}

function photoFromRecord(rec) {
  if (!rec) return rec;
  const p = { ...rec };
  unpackFile(p, 'blob', 'data', 'type');
  unpackFile(p, 'thumb', 'thumbData', 'thumbType');
  return p;
}

/** Ordre d'affichage : champ « order » s'il existe, sinon date d'ajout. */
const photoRank = (p) => (typeof p.order === 'number' ? p.order : Date.parse(p.createdAt) || 0);

export async function listPhotos(bienId) {
  const list = (await getByBien('photos', bienId)).map(photoFromRecord);
  return list.sort((a, b) => photoRank(a) - photoRank(b));
}

export async function getPhoto(id) {
  return photoFromRecord(await getOne('photos', id));
}

export async function putPhoto(photo) {
  const rec = await photoToRecord(photo); // conversion AVANT d'ouvrir la transaction
  await putOne('photos', rec);
  return photo;
}

/** Enregistre un nouvel ordre pour une liste de photos (seul le champ « order » change). */
export function reorderPhotos(photoIds) {
  return run('photos', 'readwrite', async (t) => {
    const s = t.objectStore('photos');
    for (let i = 0; i < photoIds.length; i++) {
      const rec = await reqP(s.get(photoIds[i]));
      if (rec) { rec.order = i; s.put(rec); }
    }
  });
}

export const deletePhoto = (id) => delOne('photos', id);

export function deletePhotosOfPiece(bienId, pieceId) {
  return run('photos', 'readwrite', async (t) => {
    const s = t.objectStore('photos');
    const all = await reqP(s.index('bienId').getAll(bienId));
    all.filter((p) => p.pieceId === pieceId).forEach((p) => s.delete(p.id));
  });
}

/** Miniature de couverture d'un bien (photo principale ou première photo). */
export async function getCoverThumb(bien) {
  if (bien.coverPhotoId) {
    const p = await getPhoto(bien.coverPhotoId);
    if (p) return p.thumb || p.blob;
  }
  const photos = await listPhotos(bien.id);
  if (!photos.length) return null;
  for (const piece of bien.pieces || []) {
    const p = photos.find((ph) => ph.pieceId === piece.id);
    if (p) return p.thumb || p.blob;
  }
  return photos[0].thumb || photos[0].blob;
}

export function countPhotos(bienId) {
  return run('photos', 'readonly', (t) => reqP(t.objectStore('photos').index('bienId').count(bienId)));
}

// ---------- Journal du bien (visites, offres, prix, notes…) ----------

export async function listEvents(bienId) {
  const list = bienId ? await getByBien('events', bienId) : await getAll('events');
  return list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

export function saveEvent(ev) {
  const e = { ...ev };
  if (!e.id) e.id = uid();
  if (!e.createdAt) e.createdAt = new Date().toISOString();
  if (!e.date) e.date = e.createdAt;
  return putOne('events', e);
}

export const deleteEvent = (id) => delOne('events', id);

// ---------- Documents ----------

export async function listDocs(bienId) {
  const list = (await getByBien('docs', bienId)).map((r) => unpackFile({ ...r }, 'blob', 'data', 'type'));
  return list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export async function saveDoc(doc) {
  const rec = { ...doc };
  if (!rec.id) rec.id = uid();
  if (!rec.createdAt) rec.createdAt = new Date().toISOString();
  await packFile(rec, 'blob', 'data', 'type');
  await putOne('docs', rec);
  return rec;
}

export const deleteDoc = (id) => delOne('docs', id);

// ---------- Acquéreurs ----------

export const listAcquereurs = () => getAll('acquereurs');
export const getAcquereur = (id) => getOne('acquereurs', id);

export function saveAcquereur(acq) {
  const now = new Date().toISOString();
  const a = { ...acq, updatedAt: now };
  if (!a.id) a.id = uid();
  if (!a.createdAt) a.createdAt = now;
  return putOne('acquereurs', a);
}

export const deleteAcquereur = (id) => delOne('acquereurs', id);

// ---------- Réglages ----------

export async function getMeta(key, fallback = null) {
  const row = await getOne('meta', key);
  return row && row.value != null ? row.value : fallback;
}

export const setMeta = (key, value) => putOne('meta', { key, value });

/** Logo de l'agence (Blob ou null). */
export async function getLogo() {
  const row = await getOne('meta', 'logo');
  return row && row.data ? new Blob([row.data], { type: row.type }) : null;
}

export async function setLogo(blob) {
  if (!blob) return delOne('meta', 'logo');
  return putOne('meta', { key: 'logo', data: await blob.arrayBuffer(), type: blob.type });
}

// ---------- Sauvegarde / restauration ----------

function bufToDataUrl(buf, type) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(new Blob([buf], { type }));
  });
}

/** data:...;base64,xxx -> { data: ArrayBuffer, type } (sans fetch, fiable sur iPhone). */
function dataUrlToBuffer(url) {
  const [head, b64] = url.split(',');
  const type = (head.match(/^data:([^;]+)/) || [])[1] || 'application/octet-stream';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { data: bytes.buffer, type };
}

// Champs fichiers de chaque magasin : [champ dans la sauvegarde, champ données, champ type]
const FILE_FIELDS = {
  photos: [['blob', 'data', 'type'], ['thumb', 'thumbData', 'thumbType']],
  docs: [['blob', 'data', 'type']],
};

async function recordsToExport(store) {
  const out = [];
  for (const rec of await getAll(store)) {
    const r = { ...rec };
    for (const [field, dataKey, typeKey] of FILE_FIELDS[store]) {
      if (r[dataKey]) r[field] = await bufToDataUrl(r[dataKey], r[typeKey]);
      else if (r[field] instanceof Blob) r[field] = await bufToDataUrl(await r[field].arrayBuffer(), r[field].type);
      else r[field] = null;
      delete r[dataKey];
      delete r[typeKey];
    }
    out.push(r);
  }
  return out;
}

function recordsFromImport(store, list) {
  return (list || []).map((item) => {
    const r = { ...item };
    for (const [field, dataKey, typeKey] of FILE_FIELDS[store]) {
      const url = r[field];
      delete r[field];
      if (typeof url === 'string' && url.startsWith('data:')) {
        const b = dataUrlToBuffer(url);
        r[dataKey] = b.data;
        r[typeKey] = b.type;
      }
    }
    return r;
  });
}

export async function exportAll() {
  const logoRow = await getOne('meta', 'logo');
  return {
    app: 'portimmo',
    format: 2,
    exportedAt: new Date().toISOString(),
    agence: await getMeta('agence'),
    logo: logoRow && logoRow.data ? await bufToDataUrl(logoRow.data, logoRow.type) : null,
    biens: await listBiens(),
    photos: await recordsToExport('photos'),
    events: await getAll('events'),
    docs: await recordsToExport('docs'),
    acquereurs: await listAcquereurs(),
  };
}

export async function importAll(data) {
  if (!data || data.app !== 'portimmo') throw new Error('Fichier de sauvegarde invalide');
  const photos = recordsFromImport('photos', data.photos);
  const docs = recordsFromImport('docs', data.docs);
  await run(['biens', 'photos', 'events', 'docs', 'acquereurs'], 'readwrite', (t) => {
    (data.biens || []).forEach((b) => t.objectStore('biens').put(b));
    photos.forEach((p) => t.objectStore('photos').put(p));
    (data.events || []).forEach((e) => t.objectStore('events').put(e));
    docs.forEach((d) => t.objectStore('docs').put(d));
    (data.acquereurs || []).forEach((a) => t.objectStore('acquereurs').put(a));
  });
  // Les réglages de l'appareil ne sont pas écrasés s'ils existent déjà.
  if (data.agence && !(await getMeta('agence'))) await setMeta('agence', data.agence);
  if (data.logo && !(await getLogo())) {
    const b = dataUrlToBuffer(data.logo);
    await putOne('meta', { key: 'logo', data: b.data, type: b.type });
  }
  return {
    biens: (data.biens || []).length,
    photos: photos.length,
    acquereurs: (data.acquereurs || []).length,
  };
}
