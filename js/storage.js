/* ============================================================
   storage.js — Sauvegarde / Restauration des données sur disque
   Exporte et importe TOUTES les données de l'application
   (écoles + comptes globaux + données de chaque école) dans un
   fichier JSON téléchargeable, stockable à côté de l'application
   sur la partition disque qui l'héberge.
   ============================================================ */
window.Store = (function () {
  const META_DB = 'gs_meta';
  const VERSION = 1;

  // Object stores (tables) d'une école (toutes les données applicatives).
  const SCHOOL_STORES = [
    'users', 'ecole', 'annees', 'trimestres', 'cycles', 'salles', 'niveaux',
    'classes', 'eleves', 'enseignants', 'matieres', 'affectations',
    'typesFrais', 'fraisEncaissements', 'fraisBordereaux', 'salaires',
    'emplois', 'cours', 'notes', 'compositions', 'passages', 'journal',
    'pointages', 'employes', 'paies', 'depenses'
  ];
  const SCHOOL_AUTO = SCHOOL_STORES.filter((s) => s !== 'ecole');

  // ---- Low-level accès brute IndexedDB (sans toucher au DB courant) ----
  function openRaw(name, stores, auto) {
    return new Promise((resolve) => {
      if (!window.indexedDB) { resolve(null); return; }
      const req = indexedDB.open(name, 1);
      const done = (v) => { if (!settled) { settled = true; resolve(v); } };
      let settled = false;
      req.onupgradeneeded = (ev) => {
        const d = ev.target.result;
        stores.forEach((s) => { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id', autoIncrement: auto.indexOf(s) >= 0 }); });
      };
      req.onsuccess = () => done(req.result);
      req.onerror = () => done(null);
      req.onblocked = () => { /* attendre */ };
      setTimeout(() => done(null), 2500);
    });
  }
  function dbReq(req) { return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }); }
  function storeAll(db, store) { return dbReq(db.transaction(store, 'readonly').objectStore(store).getAll()); }
  function storeWriteAll(db, store, rows) {
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    os.clear();
    for (const r of rows || []) os.put(r);
    return new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
  }

  // ---- Repli mémoire (mêmes clés localStorage que le mode mémoire) ----
  function memRead(dbName) {
    const key = '__gs_mem__' + (dbName || 'gs_db_default');
    try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw).memory || {}) : {}; } catch (e) { return {}; }
  }
  function memWrite(dbName, mem, nextId) {
    const key = '__gs_mem__' + (dbName || 'gs_db_default');
    try { localStorage.setItem(key, JSON.stringify({ memory: mem, nextId: nextId || 1 })); } catch (e) { /* ignore */ }
  }
  function memNext(dbName) {
    let d = { nextId: 1 };
    try { const raw = localStorage.getItem('__gs_mem__' + (dbName || 'gs_db_default')); if (raw) d = JSON.parse(raw); } catch (e) { /* ignore */ }
    return d.nextId || 1;
  }

  // Lit toutes les tables d'une école (IndexedDB ou mémoire).
  async function readSchoolData(dbName) {
    dbName = dbName || 'gs_db_default';
    const out = {};
    const db = await openRaw(dbName, SCHOOL_STORES, SCHOOL_AUTO);
    if (!db) {
      const mem = memRead(dbName);
      SCHOOL_STORES.forEach((s) => { out[s] = (mem[s] || []).slice().sort((a, b) => (a.id || 0) - (b.id || 0)); });
      return out;
    }
    try {
      for (const s of SCHOOL_STORES) out[s] = (await storeAll(db, s)) || [];
    } catch (e) {
      // repli mémoire sur erreur partielle
      const mem = memRead(dbName);
      SCHOOL_STORES.forEach((s) => { if (out[s] === undefined) out[s] = (mem[s] || []); });
    } finally {
      try { db.close(); } catch (e) { /* ignore */ }
    }
    return out;
  }

  // Écrit toutes les tables d'une école (remplace le contenu).
  async function writeSchoolData(dbName, stores) {
    dbName = dbName || 'gs_db_default';
    // Normalise les valeurs : RTDB convertit les tableaux vides en objet {}.
    const norm = {};
    for (const s of SCHOOL_STORES) {
      const rows = stores[s];
      norm[s] = Array.isArray(rows) ? rows : [];
    }
    const db = await openRaw(dbName, SCHOOL_STORES, SCHOOL_AUTO);
    if (!db) {
      const mem = memRead(dbName);
      let next = memNext(dbName);
      SCHOOL_STORES.forEach((s) => {
        const rows = norm[s];
        mem[s] = rows;
        for (const r of rows) if ((r.id || 0) >= next) next = (r.id || 0) + 1;
      });
      memWrite(dbName, mem, next);
      return;
    }
    try {
      for (const s of SCHOOL_STORES) await storeWriteAll(db, s, norm[s]);
    } finally {
      try { db.close(); } catch (e) { /* ignore */ }
    }
  }

  // ---- Accès à la base méta (écoles + tenants) ----
  async function readMetaData() {
    const db = await openRaw(META_DB, ['schools', 'tenants'], ['schools', 'tenants']);
    if (!db) {
      const mem = memRead(META_DB);
      return { schools: mem.schools || [], tenants: mem.tenants || [] };
    }
    try {
      return {
        schools: (await storeAll(db, 'schools')) || [],
        tenants: (await storeAll(db, 'tenants')) || []
      };
    } finally {
      try { db.close(); } catch (e) { /* ignore */ }
    }
  }
  async function writeMetaData(data) {
    const db = await openRaw(META_DB, ['schools', 'tenants'], ['schools', 'tenants']);
    if (!db) {
      const mem = memRead(META_DB);
      mem.schools = data.schools || [];
      const next = memNext(META_DB);
      let max = next;
      (data.schools || []).forEach((s) => { if ((s.id || 0) >= max) max = (s.id || 0) + 1; });
      (data.tenants || []).forEach((t) => { if ((t.id || 0) >= max) max = (t.id || 0) + 1; });
      mem.tenants = data.tenants || [];
      memWrite(META_DB, mem, max);
      return;
    }
    try {
      await storeWriteAll(db, 'schools', data.schools || []);
      await storeWriteAll(db, 'tenants', data.tenants || []);
    } finally {
      try { db.close(); } catch (e) { /* ignore */ }
    }
  }

  // ---- EXPORT : construit la sauvegarde complète ----
  async function exportData() {
    const meta = await readMetaData();
    const schools = [];
    for (const s of meta.schools || []) {
      const dbName = (s && s.db) || 'gs_db_default';
      const stores = await readSchoolData(dbName);
      schools.push({ db: dbName, nom: s ? s.nom : '', stores: stores });
    }
    return {
      application: 'Gestion Scolaire',
      version: VERSION,
      date: new Date().toISOString(),
      meta: { schools: meta.schools || [], tenants: meta.tenants || [] },
      schools: schools
    };
  }

  // Télécharge un JSON (fonctionne en file:// et http)
  function downloadJSON(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'gestion-scolaire-sauvegarde.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }

  // Télécharge un CSV (séparateur ';' compatible Excel, encodage UTF-8 BOM)
  function downloadCSV(headers, rows, filename) {
    function esc(v) {
      const s = String(v == null ? '' : v).replace(/"/g, '""');
      return /[";\n]/.test(s) ? '"' + s + '"' : s;
    }
    const lines = [headers.map(esc).join(';')]
      .concat((rows || []).map((r) => r.map(esc).join(';')));
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'export.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }

  // Lis un fichier JSON choisi (input file) → objet parsé
  function readFile(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => { try { resolve(JSON.parse(r.result)); } catch (e) { reject(new Error('Fichier JSON invalide.')); } };
      r.onerror = () => reject(new Error('Impossible de lire le fichier.'));
      r.readAsText(file);
    });
  }

  // ---- IMPORT : restaure la sauvegarde complète ----
  // Remplace TOUTES les données (écoles + comptes globaux + données par école).
  async function importData(obj) {
    if (!obj || obj.application !== 'Gestion Scolaire') throw new Error('Ce n\'est pas un fichier de sauvegarde Gestion Scolaire valide.');
    if (obj.version !== VERSION) throw new Error('Version de sauvegarde incompatible.');
    const meta = obj.meta || { schools: [], tenants: [] };
    await writeMetaData({ schools: meta.schools || [], tenants: meta.tenants || [] });
    for (const sch of obj.schools || []) {
      await writeSchoolData(sch.db || 'gs_db_default', sch.stores || {});
    }
    return { schools: (meta.schools || []).length };
  }

  async function saveToDisk() {
    await DB.ready();
    const data = await exportData();
    downloadJSON(data, 'gestion-scolaire-sauvegarde-' + new Date().toISOString().slice(0, 10) + '.json');
    return data;
  }

  async function restoreFromFile(file) {
    await DB.ready();
    const data = await readFile(file);
    await importData(data);
    return data;
  }

  // Assure qu'une école existe dans le méta pointant vers la base courante.
  async function ensureSchoolForDb(dbName) {
    dbName = dbName || 'gs_db_default';
    const meta = await readMetaData();
    const list = meta.schools || [];
    let school = list.find((s) => s.db === dbName);
    if (!school) {
      let max = 0;
      list.forEach((s) => { if ((s.id || 0) > max) max = s.id; });
      school = { id: max + 1, nom: 'École (base ' + dbName + ')', db: dbName, dateCreation: new Date().toISOString() };
      list.push(school);
      await writeMetaData({ schools: list, tenants: meta.tenants || [] });
    }
    return school;
  }

  return {
    SCHOOL_STORES: SCHOOL_STORES,
    exportData: exportData, importData: importData,
    saveToDisk: saveToDisk, restoreFromFile: restoreFromFile,
    readFile: readFile, downloadJSON: downloadJSON, downloadCSV: downloadCSV,
    ensureSchoolForDb: ensureSchoolForDb
  };
})();
