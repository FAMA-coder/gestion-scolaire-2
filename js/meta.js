/* ============================================================
   meta.js — Registre multi-écoles (tenant)
   Liste des écoles + comptes globaux + école/teneur courant.
   Base dédiée : gs_meta (IndexedDB + repli mémoire).
   ============================================================ */
window.Meta = (function () {
  const META_DB = 'gs_meta';
  const TENANT_KEY = 'gs_tenant';
  const SCHOOL_KEY = 'gs_school';

  let db = null;
  let memory = null;
  let mode = 'idb';
  let nextId = 1;
  let _ready = null;

  function memoryInit() {
    mode = 'memory';
    memory = { schools: [], tenants: [], permissions: [], roles: [] };
    try {
      const raw = localStorage.getItem(META_DB);
      if (raw) { const d = JSON.parse(raw); if (d.memory) memory = d.memory; if (d.nextId) nextId = d.nextId; }
    } catch (e) { /* ignore */ }
    if (!Array.isArray(memory.roles)) memory.roles = [];
    storeMemory();
  }
  function storeMemory() {
    try { localStorage.setItem(META_DB, JSON.stringify({ memory: memory, nextId: nextId })); } catch (e) { /* ignore */ }
  }

  function open() {
    return new Promise((resolve) => {
      if (!('indexedDB' in window)) { memoryInit(); resolve(); return; }
      let settled = false;
      const forceMemory = () => { if (settled) return; settled = true; if (db) { try { db.close(); } catch (e) {} } db = null; memoryInit(); resolve(); };
      const timer = setTimeout(forceMemory, 5000);
      const req = indexedDB.open(META_DB, 3);
      req.onupgradeneeded = (ev) => {
        const d = ev.target.result;
        if (!d.objectStoreNames.contains('schools')) d.createObjectStore('schools', { keyPath: 'id', autoIncrement: true });
        if (!d.objectStoreNames.contains('tenants')) d.createObjectStore('tenants', { keyPath: 'id', autoIncrement: true });
        if (!d.objectStoreNames.contains('permissions')) d.createObjectStore('permissions', { keyPath: 'key' });
        if (!d.objectStoreNames.contains('roles')) d.createObjectStore('roles', { keyPath: 'key' });
      };
      req.onsuccess = (ev) => {
        clearTimeout(timer);
        if (settled) { try { ev.target.result.close(); } catch (e) {} return; }
        settled = true; db = ev.target.result; resolve();
      };
      req.onerror = () => { clearTimeout(timer); if (settled) return; settled = true; memoryInit(); resolve(); };
    });
  }

  function tx(store, mt) { if (mode === 'memory') return null; return db.transaction(store, mt).objectStore(store); }
  function rp(req) { return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }); }

  // Notifie la synchronisation après une écriture méta / compte utilisateur.
  function notifySync() { try { if (window.Sync && Sync.changed) Sync.changed(); } catch (e) { /* ignore */ } }

  async function getAll(store) {
    if (mode === 'memory') return [...(memory[store] || [])].sort((a, b) => (a.id || 0) - (b.id || 0));
    return rp(tx(store, 'readonly').getAll());
  }
  async function put(store, obj) {
    if (mode === 'memory') {
      const arr = memory[store] || (memory[store] = []);
      if (obj.id == null) obj.id = nextId++;
      const i = arr.findIndex((r) => r.id === obj.id);
      if (i >= 0) arr[i] = obj; else arr.push(obj);
      storeMemory(); notifySync(); return obj.id;
    }
    return rp(tx(store, 'readwrite').put(obj)).then((id) => { notifySync(); return id; });
  }
  async function del(store, id) {
    if (mode === 'memory') { memory[store] = (memory[store] || []).filter((r) => r.id !== id); storeMemory(); notifySync(); return; }
    return rp(tx(store, 'readwrite').delete(id)).then(() => { notifySync(); });
  }

  async function seed() {
    const tenants = await getAll('tenants');
    if (!tenants.length) {
      await put('tenants', {
        username: 'FAMA', nom: 'Administrateur', prenom: 'Global', role: 'tenant_admin',
        salt: AUTH_ENV.salt, passwordHash: AUTH_ENV.sha256('aminatN1FA@' + AUTH_ENV.salt),
        dateCreation: new Date().toISOString()
      });
    }
    const schools = await getAll('schools');
    if (!schools.length) {
      await put('schools', { nom: 'Mon École', db: 'gs_db_1', dateCreation: new Date().toISOString() });
    }
  }

  function ready() { if (!_ready) _ready = open().then(seed); return _ready; }

  function currentTenant() {
    try { const raw = localStorage.getItem(TENANT_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function setTenant(t) { try { if (t) localStorage.setItem(TENANT_KEY, JSON.stringify(t)); else localStorage.removeItem(TENANT_KEY); } catch (e) {} }

  async function loginTenant(username, password) {
    const tenants = await getAll('tenants');
    const t = tenants.find((x) => x.username && x.username.toLowerCase() === String(username).trim().toLowerCase());
    if (!t) return { ok: false, msg: 'Compte global inconnu.' };
    if (AUTH_ENV.sha256(password + t.salt) !== t.passwordHash) return { ok: false, msg: 'Mot de passe incorrect.' };
    setTenant(t);
    return { ok: true, user: t };
  }
  function logoutTenant() { setTenant(null); }

  async function updateTenant(opts) {
    const t = currentTenant();
    if (!t) return { ok: false, msg: 'Aucun compte global connecté.' };
    const user = (await getAll('tenants')).find((x) => x.id === t.id);
    if (!user) return { ok: false, msg: 'Compte global introuvable.' };
    if (!opts.currentPassword) return { ok: false, msg: 'Saisissez votre mot de passe actuel.' };
    if (AUTH_ENV.sha256(opts.currentPassword + user.salt) !== user.passwordHash) return { ok: false, msg: 'Mot de passe actuel incorrect.' };
    const username = opts.username && opts.username.trim();
    if (username) {
      const others = (await getAll('tenants')).filter((x) => x.id !== user.id);
      if (others.some((x) => x.username.toLowerCase() === username.toLowerCase())) return { ok: false, msg: 'Email déjà utilisé.' };
      user.username = username;
    }
    if (opts.newPassword) user.passwordHash = AUTH_ENV.sha256(opts.newPassword + user.salt);
    await put('tenants', user);
    setTenant({ id: user.id, username: user.username, nom: user.nom, prenom: user.prenom, role: user.role, dateCreation: user.dateCreation });
    return { ok: true, user: user };
  }

  function currentSchoolId() { try { const v = localStorage.getItem(SCHOOL_KEY); return v ? Number(v) : null; } catch (e) { return null; } }
  function setCurrentSchool(id) { try { if (id == null) localStorage.removeItem(SCHOOL_KEY); else localStorage.setItem(SCHOOL_KEY, String(id)); } catch (e) {} }
  async function getSchool(id) { return (await getAll('schools')).find((s) => s.id === Number(id)) || null; }
  async function allSchools() { return getAll('schools'); }

  async function createSchool(nom) {
    const id = await put('schools', { nom: nom, db: 'gs_db_' + Date.now(), dateCreation: new Date().toISOString() });
    return getSchool(id);
  }
  async function renameSchool(id, nom) {
    const s = await getSchool(id);
    if (!s) return;
    s.nom = nom;
    await put('schools', s);
  }
  async function deleteSchool(id) {
    const s = await getSchool(id);
    if (!s) return;
    await del('schools', id);
    if (s.db && window.indexedDB) {
      try { indexedDB.deleteDatabase(s.db); } catch (e) { /* ignore */ }
    }
  }
  async function setSchoolBlocked(id, blocked) {
    const s = await getSchool(id);
    if (!s) return;
    s.bloque = !!blocked;
    await put('schools', s);
  }
  async function currentSchoolName() {
    const id = currentSchoolId();
    if (id == null) return '';
    const s = await getSchool(id);
    return s ? s.nom : '';
  }

  // ==== Gestion des comptes utilisateurs (mode admin global) ==========
  // Ouvre une base d'école de façon INDÉPENDANTE (sans toucher à DB courant)
  // et lit/écrit la table des utilisateurs (users). Chaque école = sa propre base.
  const SCHOOL_STORES = ['users', 'ecole', 'annees', 'trimestres', 'cycles', 'salles', 'niveaux',
    'classes', 'eleves', 'enseignants', 'matieres', 'affectations', 'typesFrais',
    'fraisEncaissements', 'fraisBordereaux', 'salaires', 'emplois', 'cours', 'notes', 'compositions',
    'passages', 'journal'];
  const SCHOOL_AUTO = SCHOOL_STORES.filter((s) => s !== 'ecole');

  function openSchoolDbRaw(name) {
    return new Promise((resolve) => {
      if (!window.indexedDB) { resolve(null); return; }
      const req = indexedDB.open(name, 1);
      const done = (v) => { if (!settled) { settled = true; resolve(v); } };
      let settled = false;
      req.onupgradeneeded = (ev) => {
        const d = ev.target.result;
        SCHOOL_STORES.forEach((s) => { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id', autoIncrement: SCHOOL_AUTO.indexOf(s) >= 0 }); });
      };
      req.onsuccess = () => done(req.result);
      req.onerror = () => done(null);
      req.onblocked = () => { /* attendre */ };
      setTimeout(() => done(null), 2500); // repli mémoire si IndexedDB indisponible/lent
    });
  }
  function dbReq(req) { return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }); }

  // ---- Repli mémoire (mêmes clés localStorage que DB en mode mémoire) ----
  function memStore(dbName) {
    const key = '__gs_mem__' + (dbName || 'gs_db_default');
    return {
      key: key,
      read() { try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw).memory || {}) : {}; } catch (e) { return {}; } },
      write(mem) { try { localStorage.setItem(key, JSON.stringify({ memory: mem, nextId: memNextId(dbName) })); } catch (e) { /* ignore */ } }
    };
  }
  function memUsers(dbName) {
    const st = memStore(dbName);
    const mem = st.read();
    return (mem.users || []).slice().sort((a, b) => (a.id || 0) - (b.id || 0));
  }
  function memSaveUsers(dbName, users) {
    const st = memStore(dbName);
    const mem = st.read();
    mem.users = users;
    st.write(mem);
  }
  function memNextId(dbName) {
    let d = { nextId: 1 };
    try { const raw = localStorage.getItem('__gs_mem__' + (dbName || 'gs_db_default')); if (raw) d = JSON.parse(raw); } catch (e) { /* ignore */ }
    return d.nextId || 1;
  }
  function memSetNextId(dbName, id) {
    const key = '__gs_mem__' + (dbName || 'gs_db_default');
    try { const raw = localStorage.getItem(key); const d = raw ? JSON.parse(raw) : { memory: {} }; d.nextId = id; localStorage.setItem(key, JSON.stringify(d)); } catch (e) { /* ignore */ }
  }

  async function readUsersRaw(dbName) {
    const d = await openSchoolDbRaw(dbName || 'gs_db_default');
    if (!d) return memUsers(dbName);
    try {
      const req = d.transaction('users', 'readonly').objectStore('users').getAll();
      const list = await dbReq(req);
      return list || [];
    } catch (e) {
      return memUsers(dbName);
    } finally {
      try { d.close(); } catch (e) { /* ignore */ }
    }
  }
  async function writeUserRaw(dbName, user) {
    dbName = dbName || 'gs_db_default';
    const d = await openSchoolDbRaw(dbName);
    if (!d) {
      // Repli mémoire
      const users = memUsers(dbName);
      if (user.id == null) { user.id = memNextId(dbName); memSetNextId(dbName, user.id + 1); users.push(user); }
      else { const i = users.findIndex((x) => x.id === user.id); if (i >= 0) users[i] = user; else users.push(user); }
      memSaveUsers(dbName, users);
      notifySync();
      return { ok: true, id: user.id };
    }
    try {
      const res = await dbReq(d.transaction('users', 'readwrite').objectStore('users').put(user));
      notifySync();
      return { ok: true, id: res };
    } catch (e) {
      return { ok: false, msg: 'Erreur d\'enregistrement : ' + e.message };
    } finally {
      try { d.close(); } catch (e) { /* ignore */ }
    }
  }
  async function deleteUserRaw(dbName, userId) {
    dbName = dbName || 'gs_db_default';
    const d = await openSchoolDbRaw(dbName);
    if (!d) {
      const users = memUsers(dbName).filter((x) => x.id !== userId);
      memSaveUsers(dbName, users);
      notifySync();
      return { ok: true };
    }
    try {
      await dbReq(d.transaction('users', 'readwrite').objectStore('users').delete(userId));
      notifySync();
      return { ok: true };
    } catch (e) {
      return { ok: false, msg: 'Erreur de suppression : ' + e.message };
    } finally {
      try { d.close(); } catch (e) { /* ignore */ }
    }
  }

  // Liste tous les comptes de TOUTES les écoles (avec le nom de l'école)
  async function listAllAccounts() {
    const schools = await getAll('schools');
    const accounts = [];
    for (const s of schools) {
      const users = await readUsersRaw(s.db || 'gs_db_default');
      users.forEach((u) => accounts.push({
        id: u.id, schoolId: s.id, schoolName: s.nom, db: s.db || 'gs_db_default',
        nom: u.nom, prenom: u.prenom, username: u.username, role: u.role,
        actif: u.actif !== false, dateCreation: u.dateCreation
      }));
    }
    return accounts;
  }

  function makeUser(school, u) {
    return {
      nom: u.nom, prenom: u.prenom, username: u.username, role: u.role, actif: u.actif !== false,
      salt: u.salt || AUTH_ENV.salt,
      passwordHash: u.passwordHash || AUTH_ENV.sha256((u.password || '') + (u.salt || AUTH_ENV.salt)),
      dateCreation: u.dateCreation || new Date().toISOString()
    };
  }

  async function createAccount(school, data) {
    if (data.role === 'super_admin') return { ok: false, msg: 'Seul le super administrateur peut créer un compte super administrateur.' };
    const dbName = school.db || 'gs_db_default';
    const users = await readUsersRaw(dbName);
    const un = String(data.username || '').trim().toLowerCase();
    if (!un) return { ok: false, msg: 'Identifiant requis.' };
    if (users.some((x) => x.username && x.username.toLowerCase() === un)) return { ok: false, msg: 'Cet identifiant existe déjà dans cette école.' };
    const user = makeUser(school, data);
    const res = await writeUserRaw(dbName, user);
    if (!res.ok) return res;
    user.id = res.id;
    return { ok: true, user: { id: user.id, schoolId: school.id, schoolName: school.nom, db: dbName, ...user } };
  }

  async function updateAccount(school, data) {
    const dbName = school.db || 'gs_db_default';
    const users = await readUsersRaw(dbName);
    const existing = users.find((x) => x.id === Number(data.id));
    if (!existing) return { ok: false, msg: 'Compte introuvable.' };
    if (data.role === 'super_admin' && existing.role !== 'super_admin') return { ok: false, msg: 'Seul le super administrateur peut attribuer le rôle super administrateur.' };
    const un = String(data.username || '').trim().toLowerCase();
    if (users.some((x) => x.id !== existing.id && x.username && x.username.toLowerCase() === un)) return { ok: false, msg: 'Cet identifiant existe déjà dans cette école.' };
    existing.nom = data.nom;
    existing.prenom = data.prenom;
    existing.username = data.username;
    existing.role = data.role;
    existing.actif = data.actif !== false;
    if (data.password) existing.passwordHash = AUTH_ENV.sha256(data.password + (existing.salt || AUTH_ENV.salt));
    const res = await writeUserRaw(dbName, existing);
    if (!res.ok) return res;
    return { ok: true, user: { id: existing.id, schoolId: school.id, schoolName: school.nom, db: dbName, ...existing } };
  }

  async function deleteAccount(school, userId) {
    const dbName = school.db || 'gs_db_default';
    return deleteUserRaw(dbName, userId);
  }

  // ==== Permissions par rôle (définies par l'admin global) ============
  // Stockées globalement (gs_meta) et partagées par toutes les écoles.
  const PERM_KEY = 'role_perms_v1';
  async function getPermissionsRaw() {
    if (mode === 'memory') return (memory.permissions || []).find((p) => p.key === PERM_KEY) || null;
    try {
      const req = tx('permissions', 'readonly').get(PERM_KEY);
      const row = await rp(req);
      return row || null;
    } catch (e) { return null; }
  }
  async function savePermissionsRaw(map) {
    if (mode === 'memory') {
      memory.permissions = (memory.permissions || []).filter((p) => p.key !== PERM_KEY);
      memory.permissions.push({ key: PERM_KEY, perms: map, dateModif: new Date().toISOString() });
      storeMemory();
      notifySync();
      return;
    }
    try {
      await rp(tx('permissions', 'readwrite').put({ key: PERM_KEY, perms: map, dateModif: new Date().toISOString() }));
      notifySync();
    }
    catch (e) { /* ignore */ }
  }

  // Retourne la matrice par rôle (fusion avec les valeurs par défaut de Auth).
  async function getPermissions() {
    const base = Auth.permsOrDefault();
    const row = await getPermissionsRaw();
    const out = {};
    Object.keys(base).forEach((r) => { out[r] = (row && row.perms && row.perms[r]) ? row.perms[r].slice() : base[r].slice(); });
    if (row && row.perms) {
      Object.keys(row.perms).forEach((r) => {
        if (!(r in out) && !Auth.ROLES[r]) { out[r] = row.perms[r].slice(); }
      });
    }
    return out;
  }

  // ==== Rôles personnalisés (stockés globalement dans 'roles') ============
  async function getAllRoles() {
    if (mode === 'memory') return (memory.roles || []).slice().sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));
    try { return (await rp(tx('roles', 'readonly').getAll()) || []).sort((a, b) => (a.nom || '').localeCompare(b.nom || '')); }
    catch (e) { return []; }
  }
  async function addCustomRole(nom) {
    nom = (nom || '').trim();
    if (!nom) return { ok: false, msg: 'Nom du rôle requis.' };
    const base = String(nom).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'role';
    const existing = await getAllRoles();
    const keys = new Set(existing.map((r) => r.key));
    if (Auth.ROLES[base]) keys.add(base);
    let key = base, i = 2;
    while (keys.has(key)) key = base + '_' + (i++);
    await put('roles', { key: key, nom: nom, dateCreation: new Date().toISOString() });
    return { ok: true, key: key, nom: nom };
  }
  async function deleteCustomRole(key) {
    if (Auth.ROLES[key]) return { ok: false, msg: 'Impossible de supprimer un rôle système.' };
    const roles = await getAllRoles();
    if (!roles.some((r) => r.key === key)) return { ok: false, msg: 'Rôle introuvable.' };
    const schools = await getAll('schools');
    for (const s of schools) {
      const users = await readUsersRaw(s.db || 'gs_db_default');
      if (users.some((u) => u.role === key)) {
        return { ok: false, msg: 'Ce rôle est utilisé par un compte d\'un établissement.' };
      }
    }
    await del('roles', key);
    // Purge le rôle de la matrice des permissions stockée.
    try {
      const row = await getPermissionsRaw();
      if (row && row.perms && row.perms[key]) {
        delete row.perms[key];
        await savePermissionsRaw(row.perms);
      }
    } catch (e) { /* ignore */ }
    return { ok: true };
  }
  async function renameCustomRole(key, nom) {
    nom = (nom || '').trim();
    if (!nom) return { ok: false, msg: 'Nom du rôle requis.' };
    const role = (await getAllRoles()).find((r) => r.key === key);
    if (!role) return { ok: false, msg: 'Rôle introuvable.' };
    role.nom = nom;
    await put('roles', role);
    return { ok: true };
  }

  return {
    ready: ready, allSchools: allSchools, getSchool: getSchool, dbNameFor: (s) => (s && s.db) || 'gs_db_default',
    createSchool: createSchool, renameSchool: renameSchool, deleteSchool: deleteSchool, setSchoolBlocked: setSchoolBlocked,
    loginTenant: loginTenant, logoutTenant: logoutTenant, currentTenant: currentTenant, updateTenant: updateTenant,
    currentSchoolId: currentSchoolId, setCurrentSchool: setCurrentSchool, currentSchoolName: currentSchoolName,
    listAllAccounts: listAllAccounts, createAccount: createAccount, updateAccount: updateAccount, deleteAccount: deleteAccount,
    getPermissions: getPermissions, savePermissions: savePermissionsRaw,
    getAllRoles: getAllRoles, addCustomRole: addCustomRole, deleteCustomRole: deleteCustomRole, renameCustomRole: renameCustomRole
  };
})();
