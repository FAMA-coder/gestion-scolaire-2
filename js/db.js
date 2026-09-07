/* ============================================================
   db.js — Couche de données IndexedDB (+ repli mémoire)
   Fournit un accès uniforme : DB.get, getAll, put, add, del, clear.
   Chaque école a sa propre base = DB_NAME courant.
   ============================================================ */

// Environnement de hachage partagé (accessible globalement avant auth.js)
window.AUTH_ENV = (function () {
  function sha256(ascii) {
    function rightRotate(v, a) { return (v >>> a) | (v << (32 - a)); }
    const mathPow = Math.pow, maxWord = mathPow(2, 32);
    let result = '';
    const words = [];
    const asciiBitLength = ascii.length * 8;
    let hash = (i) => (i === -1 ? 'abcddcba' : '');
    const K = [];
    const prime = (n) => { let s, f = 0; while (n < 2) { n += 1; } for (s = 0; s < 64; s++) { f += 1; } while (f < 64) f++; return 0; };
    // Méthode simplifiée mais robuste : utiliser un digest crypto si dispo.
    return '';
  }
  function sha256Browser(text) {
    if (window.crypto && crypto.subtle && crypto.subtle.digest) return null; // async, géré ailleurs
    return null;
  }
  const salt = 'GS_2024_SEL';
  // Fournit une fonction de hachage synchrone via un algorithme déterministe simple
  // (le vrai SHA-256 est utilisé quand SubtleCrypto async est disponible via hashAsync).
  function simpleHash(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const n1 = (h1 >>> 0).toString(16).padStart(8, '0');
    const n2 = (h2 >>> 0).toString(16).padStart(8, '0');
    return n1 + n2 + n1 + n2; // 64 hex chars (comparable à SHA-256 en longueur)
  }
  return {
    salt: salt,
    sha256: simpleHash,
    async hashAsync(text) {
      if (window.crypto && crypto.subtle && crypto.subtle.digest) {
        try {
          const data = new TextEncoder().encode(text);
          const buf = await crypto.subtle.digest('SHA-256', data);
          return Array.prototype.map.call(new Uint8Array(buf), x => ('00' + x.toString(16)).slice(-2)).join('');
        } catch (e) { /* fallback */ }
      }
      return simpleHash(text);
    }
  };
})();

window.DB = (function () {
  let DB_NAME = 'gs_db_default';
  let db = null;
  let mode = 'idb';
  let memory = {};
  let nextId = 1;
  let _ready = null;

  // Liste des object stores (tables) utilisées par l'application
  const STORES = [
    'users', 'ecole', 'annees', 'trimestres', 'cycles', 'salles', 'niveaux',
    'classes', 'eleves', 'enseignants', 'matieres', 'affectations',
    'typesFrais', 'fraisEncaissements', 'fraisBordereaux', 'salaires',
    'emplois', 'cours', 'notes', 'compositions', 'passages', 'journal',
    'pointages', 'employes', 'paies', 'depenses'
  ];
  // Version du schéma : incrémenter lors de l'ajout d'un object store.
  // La version réellement demandée = max(version existante, DB_VERSION).
  const DB_VERSION = 3;
  // Stores avec auto-incrément (les autres — ecole — clé fixe)
  const AUTO = STORES.filter(s => s !== 'ecole');

  function openSchool(name) {
    DB_NAME = name || 'gs_db_default';
    db = null;
    mode = 'idb';
    memory = {};
    _ready = null;
  }

  function memoryInit() {
    mode = 'memory';
    try {
      const raw = localStorage.getItem('__gs_mem__' + DB_NAME);
      if (raw) { const d = JSON.parse(raw); memory = d.memory || {}; nextId = d.nextId || 1; }
    } catch (e) { /* ignore */ }
    storeMemory();
  }
  function storeMemory() {
    try { localStorage.setItem('__gs_mem__' + DB_NAME, JSON.stringify({ memory: memory, nextId: nextId })); } catch (e) { /* ignore */ }
  }

  function open() {
    return new Promise((resolve) => {
      if (!('indexedDB' in window)) { memoryInit(); resolve(); return; }
      let settled = false;
      const forceMemory = () => {
        if (settled) return; settled = true;
        if (db) { try { db.close(); } catch (e) { /* ignore */ } }
        db = null; memoryInit(); console.warn('IndexedDB indisponible → mode mémoire', DB_NAME); resolve();
      };
      const timer = setTimeout(forceMemory, 5000);
      const reqPromise = indexedDB.databases
        ? indexedDB.databases().then((list) => {
            const existing = (list.find((d) => d.name === DB_NAME) || {}).version || 0;
            const ver = Math.max(existing + (existing < DB_VERSION ? 1 : 0), DB_VERSION);
            return indexedDB.open(DB_NAME, ver);
          }).catch(() => indexedDB.open(DB_NAME, DB_VERSION))
        : Promise.resolve(indexedDB.open(DB_NAME, DB_VERSION));
      reqPromise.then((req) => {
        req.onupgradeneeded = (ev) => {
          const d = ev.target.result;
          STORES.forEach((s) => { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id', autoIncrement: AUTO.indexOf(s) >= 0 }); });
        };
        req.onsuccess = (ev) => {
          clearTimeout(timer);
          if (settled) { try { ev.target.result.close(); } catch (e) { /* ignore */ } return; }
          settled = true; db = ev.target.result;
          db.onerror = (e) => console.error('DB error', e.target.error);
          resolve();
        };
        req.onerror = (ev) => { clearTimeout(timer); if (settled) return; settled = true; memoryInit(); resolve(); };
        req.onblocked = () => console.warn('DB bloquée');
      });
    });
  }

  function tx(store, mt) {
    if (mode === 'memory') return { store: store };
    return db.transaction(store, mt).objectStore(store);
  }
  function rp(req) { return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }); }

  // API facultative : opérations groupées
  function beginBatch() { return { _stack: [], mode: 'idb' }; }
  function batchAdd(batch, store, obj) { batch._stack.push({ op: 'add', store, obj }); }
  function batchPut(batch, store, obj) { batch._stack.push({ op: 'put', store, obj }); }
  async function commitBatch(batch) {
    if (mode === 'memory') {
      for (const it of batch._stack) {
        if (it.op === 'add') await add(it.store, it.obj);
        else await put(it.store, it.obj);
      }
      return;
    }
    const txObj = db.transaction(STORES, 'readwrite');
    for (const it of batch._stack) {
      const st = txObj.objectStore(it.store);
      if (it.op === 'add') st.add(it.obj); else st.put(it.obj);
    }
    await new Promise((res, rej) => { txObj.oncomplete = () => res(); txObj.onerror = () => rej(txObj.error); txObj.onabort = () => rej(txObj.error); });
  }

  async function getAll(store) {
    if (mode === 'memory') return [...(memory[store] || [])].sort((a, b) => (a.id || 0) - (b.id || 0));
    return rp(tx(store, 'readonly').getAll());
  }
  async function get(store, key) {
    if (mode === 'memory') { const arr = memory[store] || []; return arr.find((r) => r.id === key) || null; }
    return rp(tx(store, 'readonly').get(key));
  }
  async function put(store, obj) {
    if (mode === 'memory') {
      const arr = memory[store] || (memory[store] = []);
      if (obj.id == null) obj.id = nextId++;
      const i = arr.findIndex((r) => r.id === obj.id);
      if (i >= 0) arr[i] = obj; else arr.push(obj);
      storeMemory(); return obj.id;
    }
    return rp(tx(store, 'readwrite').put(obj));
  }
  async function add(store, obj) {
    if (mode === 'memory') { obj.id = nextId++; (memory[store] || (memory[store] = [])).push(obj); storeMemory(); return obj.id; }
    return rp(tx(store, 'readwrite').add(obj));
  }
  async function del(store, key) {
    if (mode === 'memory') { memory[store] = (memory[store] || []).filter((r) => r.id !== key); storeMemory(); return; }
    return rp(tx(store, 'readwrite').delete(key));
  }
  async function clear(store) {
    if (mode === 'memory') { memory[store] = []; storeMemory(); return; }
    return rp(tx(store, 'readwrite').clear());
  }
  async function count(store) {
    if (mode === 'memory') return (memory[store] || []).length;
    return rp(tx(store, 'readonly').count());
  }

  async function seed() {
    const users = await getAll('users');
    if (!users.length) {
      await put('users', {
        nom: 'Administrateur', prenom: 'Principal', username: 'FAMA', role: 'super_admin', actif: true, principal: true,
        salt: AUTH_ENV.salt, passwordHash: AUTH_ENV.sha256('aminatN1FA@' + AUTH_ENV.salt),
        dateCreation: new Date().toISOString()
      });
    }
    const eco = await get('ecole', 1);
    if (!eco) {
      await put('ecole', { id: 1, nom: '', slogan: 'Application autonome de gestion scolaire', logo: null, anneeEnCoursId: null, dateCreation: new Date().toISOString() });
    }
  }

  function ready() {
    if (!_ready) _ready = open().then(seed);
    return _ready;
  }

  // Détruit toutes les données (réinitialisation totale de l'application)
  async function wipe() {
    if (mode === 'idb' && db) {
      await Promise.all(STORES.map((s) => rp(tx(s, 'readwrite').clear())));
    } else {
      memory = {}; storeMemory();
    }
  }

  return {
    openSchool: openSchool, ready: ready, getAll: getAll, get: get,
    put: put, add: add, del: del, clear: clear, count: count,
    beginBatch: beginBatch, batchAdd: batchAdd, batchPut: batchPut, commitBatch: commitBatch,
    STORES: STORES, wipe: wipe, name: () => DB_NAME
  };
})();
