/* Afbeeldingen voor notities: opgeslagen als Blob in IndexedDB (niet als tekst in localStorage).
   Elke bijlage hoort bij één notitie (note_id). Validatie: alleen afbeeldingen, max. 15 MB invoer, grote foto's worden verkleind. */
(function () {
  'use strict';
  const A = window.AOS;
  const DB = 'angel-os-files', STORE = 'attachments';
  const MAX_INPUT_MB = 15, MAX_DIM = 2000;
  const TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB niet beschikbaar'));
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => { const s = r.result.createObjectStore(STORE, { keyPath: 'id' }); s.createIndex('note_id', 'note_id'); };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return dbp;
  }
  async function tx(mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction(STORE, mode); const s = t.objectStore(STORE);
      let out; Promise.resolve(fn(s)).then((v) => { out = v; });
      t.oncomplete = () => resolve(out); t.onerror = () => reject(t.error); t.onabort = () => reject(t.error);
    });
  }
  const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  function validate(file) {
    if (!file || file.type === 'image/svg+xml' || !(TYPES.includes(file.type) || /^image\//.test(file.type))) throw new Error(A.t('err.fileType'));
    if (file.size > MAX_INPUT_MB * 1048576) throw new Error(A.t('err.fileSize', { mb: MAX_INPUT_MB }));
  }
  // Verkleint grote afbeeldingen (behalve GIF, zodat animaties blijven werken)
  async function process(file) {
    validate(file);
    if (file.type === 'image/gif') return { blob: file, w: null, h: null };
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Afbeelding kon niet worden gelezen')); i.src = url; });
      let { naturalWidth: w, naturalHeight: h } = img;
      if (w <= MAX_DIM && h <= MAX_DIM && file.size < 1.5 * 1048576 && file.type !== 'image/heic') return { blob: file, w, h };
      const scale = Math.min(1, MAX_DIM / Math.max(w, h)); w = Math.round(w * scale); h = Math.round(h * scale);
      const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h);
      const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const blob = await new Promise((res) => c.toBlob(res, type, 0.85));
      return { blob: blob || file, w, h };
    } finally { URL.revokeObjectURL(url); }
  }
  async function add(file, noteId) {
    const p = await process(file);
    const rec = { id: A.uid(), note_id: noteId, blob: p.blob, type: p.blob.type, size: p.blob.size, w: p.w, h: p.h, name: file.name || 'afbeelding', created_at: new Date().toISOString() };
    await tx('readwrite', (s) => s.put(rec));
    return rec;
  }
  const get = (id) => tx('readonly', (s) => req(s.get(id)));
  const remove = (id) => tx('readwrite', (s) => s.delete(id));
  const byNote = (noteId) => tx('readonly', (s) => req(s.index('note_id').getAll(noteId)));
  const all = () => tx('readonly', (s) => req(s.getAll()));
  async function removeForNote(noteId) { const list = await byNote(noteId); await tx('readwrite', (s) => list.forEach((r) => s.delete(r.id))); return list.length; }
  const urlCache = new Map();
  async function objectUrl(id) {
    if (urlCache.has(id)) return urlCache.get(id);
    const r = await get(id); if (!r) return null;
    const u = URL.createObjectURL(r.blob); urlCache.set(id, u); return u;
  }
  async function toDataUrl(id) { const r = await get(id); if (!r) return null; return new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(r.blob); }); }
  async function stats() { try { const l = await all(); return { count: l.length, bytes: l.reduce((n, r) => n + (r.size || 0), 0) }; } catch (e) { return { count: 0, bytes: 0, error: e.message }; } }

  A.files = { add, get, remove, byNote, removeForNote, objectUrl, toDataUrl, stats, validate, MAX_INPUT_MB };
})();
