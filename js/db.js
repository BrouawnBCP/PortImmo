// Stockage local (IndexedDB) : biens + photos.
// Les photos sont stockées en Blob (fichier compressé) + miniature.

const DB_NAME = 'portimmo';
const DB_VERSION = 2; // v2 : ajout du magasin « meta » (réglages : coordonnées de l'agence…)

let dbPromise;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('biens')) {
        db.createObjectStore('biens', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('photos')) {
        const s = db.createObjectStore('photos', { keyPath: 'id' });
        s.createIndex('bienId', 'bienId');
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
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

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// ---------- Biens ----------

export function listBiens() {
  return run('biens', 'readonly', (t) => reqP(t.objectStore('biens').getAll()));
}

export function getBien(id) {
  return run('biens', 'readonly', (t) => reqP(t.objectStore('biens').get(id)));
}

export function saveBien(bien) {
  const now = new Date().toISOString();
  const b = { ...bien, updatedAt: now };
  if (!b.id) b.id = uid();
  if (!b.createdAt) b.createdAt = now;
  if (!Array.isArray(b.pieces)) b.pieces = [];
  return run('biens', 'readwrite', (t) => { t.objectStore('biens').put(b); return b; });
}

export function deleteBien(id) {
  return run(['biens', 'photos'], 'readwrite', async (t) => {
    t.objectStore('biens').delete(id);
    const photos = t.objectStore('photos');
    const keys = await reqP(photos.index('bienId').getAllKeys(id));
    keys.forEach((k) => photos.delete(k));
  });
}

// ---------- Photos ----------
// Les images sont stockées en données brutes (ArrayBuffer + type) et NON en Blob :
// Safari sur iPhone perd parfois les Blob enregistrés dans IndexedDB (photos illisibles).
// En mémoire, l'application manipule toujours photo.blob / photo.thumb (Blob).

async function toRecord(photo) {
  const { blob, thumb, ...rest } = photo;
  const rec = { ...rest };
  if (blob) { rec.data = await blob.arrayBuffer(); rec.type = blob.type || 'image/jpeg'; }
  if (thumb) { rec.thumbData = await thumb.arrayBuffer(); rec.thumbType = thumb.type || 'image/jpeg'; }
  return rec;
}

function fromRecord(rec) {
  if (!rec) return rec;
  const { data, type, thumbData, thumbType, ...rest } = rec;
  const p = { ...rest };
  p.blob = data ? new Blob([data], { type }) : (rec.blob || null);       // rec.blob : ancien format
  p.thumb = thumbData ? new Blob([thumbData], { type: thumbType }) : (rec.thumb || null);
  return p;
}

export async function listPhotos(bienId) {
  const list = await run('photos', 'readonly', (t) =>
    reqP(t.objectStore('photos').index('bienId').getAll(bienId)));
  return list.map(fromRecord).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

export async function getPhoto(id) {
  return fromRecord(await run('photos', 'readonly', (t) => reqP(t.objectStore('photos').get(id))));
}

export async function putPhoto(photo) {
  const rec = await toRecord(photo); // conversion AVANT d'ouvrir la transaction
  await run('photos', 'readwrite', (t) => { t.objectStore('photos').put(rec); });
  return photo;
}

export function deletePhoto(id) {
  return run('photos', 'readwrite', (t) => { t.objectStore('photos').delete(id); });
}

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
  // Respecte l'ordre des pièces : première photo de la première pièce.
  for (const piece of bien.pieces || []) {
    const p = photos.find((ph) => ph.pieceId === piece.id);
    if (p) return p.thumb || p.blob;
  }
  return photos[0].thumb || photos[0].blob;
}

export function countPhotos(bienId) {
  return run('photos', 'readonly', (t) =>
    reqP(t.objectStore('photos').index('bienId').count(bienId)));
}

// ---------- Réglages ----------

export async function getMeta(key, fallback = null) {
  const row = await run('meta', 'readonly', (t) => reqP(t.objectStore('meta').get(key)));
  return row ? row.value : fallback;
}

export function setMeta(key, value) {
  return run('meta', 'readwrite', (t) => { t.objectStore('meta').put({ key, value }); });
}

// ---------- Sauvegarde / restauration ----------

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** data:image/...;base64,xxx -> { data: ArrayBuffer, type } (sans fetch, fiable sur iPhone). */
function dataUrlToBuffer(url) {
  const [head, b64] = url.split(',');
  const type = (head.match(/^data:([^;]+)/) || [])[1] || 'image/jpeg';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { data: bytes.buffer, type };
}

export async function exportAll() {
  const biens = await listBiens();
  const photosRaw = (await run('photos', 'readonly', (t) => reqP(t.objectStore('photos').getAll()))).map(fromRecord);
  const photos = [];
  for (const p of photosRaw) {
    photos.push({
      ...p,
      blob: p.blob ? await blobToDataUrl(p.blob) : null,
      thumb: p.thumb ? await blobToDataUrl(p.thumb) : null,
    });
  }
  const agence = await getMeta('agence');
  return { app: 'portimmo', format: 1, exportedAt: new Date().toISOString(), agence, biens, photos };
}

export async function importAll(data) {
  if (!data || data.app !== 'portimmo') throw new Error('Fichier de sauvegarde invalide');
  const photos = [];
  for (const p of data.photos || []) {
    const { blob, thumb, ...rest } = p;
    const rec = { ...rest };
    if (blob) { const b = dataUrlToBuffer(blob); rec.data = b.data; rec.type = b.type; }
    if (thumb) { const t = dataUrlToBuffer(thumb); rec.thumbData = t.data; rec.thumbType = t.type; }
    photos.push(rec);
  }
  await run(['biens', 'photos'], 'readwrite', (t) => {
    const sb = t.objectStore('biens');
    const sp = t.objectStore('photos');
    (data.biens || []).forEach((b) => sb.put(b));
    photos.forEach((p) => sp.put(p));
  });
  if (data.agence && !(await getMeta('agence'))) await setMeta('agence', data.agence);
  return { biens: (data.biens || []).length, photos: photos.length };
}
