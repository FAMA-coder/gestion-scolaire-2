/* ============================================================
   auth.js — Authentification, rôles et matrice des accès
   ============================================================ */
window.Auth = (function () {
  const SESSION_KEY = 'gs_session_user';

  const ROLES = {
    super_admin: { libelle: 'Super Administrateur', short: 'Super Admin', class: 'badge-danger', icone: 'SA', ordre: 1 },
    promoteur:  { libelle: 'Promoteur', short: 'Promoteur', class: 'badge-danger', icone: 'PR', ordre: 2 },
    directeur:  { libelle: 'Directeur / Administration', short: 'Directeur', class: 'badge-primary', icone: 'DI', ordre: 3 },
    proviseur:  { libelle: 'Proviseur', short: 'Proviseur', class: 'badge-primary', icone: 'PV', ordre: 4 },
    censeur:    { libelle: 'Censeur', short: 'Censeur', class: 'badge-primary', icone: 'CE', ordre: 5 },
    surveillant:{ libelle: 'Surveillant', short: 'Surveillant', class: 'badge-info', icone: 'SV', ordre: 6 },
    secretaire: { libelle: 'Secrétaire', short: 'Secrétaire', class: 'badge-info', icone: 'SE', ordre: 7 },
    comptable:  { libelle: 'Comptable', short: 'Comptable', class: 'badge-warn', icone: 'CO', ordre: 8 },
    doyen:      { libelle: 'Doyen', short: 'Doyen', class: 'badge-primary', icone: 'DO', ordre: 9 },
    enseignant: { libelle: 'Enseignant', short: 'Enseignant', class: 'badge-ok', icone: 'EN', ordre: 10 },
    eleve:      { libelle: 'Élève / Étudiant', short: 'Élève', class: 'badge-gray', icone: 'EL', ordre: 11 }
  };

  // ---- Matrice des permissions par rôle ----
  const P_ALL = [
    'users.manage','parametres.permissions','ecole.manage','annees.manage',
    'cycles.manage','salles.manage','niveaux.manage','classes.manage',
    'eleves.manage','cartes.manage','enseignants.manage','matieres.manage','affectations.manage',
    'volumes.manage','pointage.manage','controle.heures',
    'frais.manage','frais.pay','salaires.manage','honoraires.manage','emplois.manage','emplois.view',
    'notes.entry','notes.view','bulletins.view','bulletins.print','dashboard.view',
    'passages.manage','personnel.manage','depenses.manage',
    'parametres.sauvegarde','parametres.synchro','parametres.journal','statistiques.view'
  ];

  const PERMS = {
    super_admin: P_ALL.slice(),
    promoteur: P_ALL.slice(),
    directeur: P_ALL.slice(),
    proviseur: P_ALL.slice(),
    censeur: ['classes.manage','eleves.manage','cartes.manage','emplois.view','notes.view','bulletins.view','bulletins.print','dashboard.view','passages.manage','statistiques.view'],
    surveillant: ['eleves.manage','cartes.manage','emplois.view','notes.view','bulletins.view','dashboard.view'],
    secretaire: ['classes.manage','eleves.manage','cartes.manage','frais.pay','emplois.view','notes.view','bulletins.view','bulletins.print','dashboard.view','passages.manage','depenses.manage','personnel.manage','statistiques.view'],
    comptable: ['frais.manage','frais.pay','salaires.manage','honoraires.manage','notes.view','bulletins.view','dashboard.view','depenses.manage','personnel.manage','statistiques.view'],
    doyen: ['niveaux.manage','classes.manage','eleves.manage','cartes.manage','emplois.view','notes.view','bulletins.view','bulletins.print','dashboard.view','passages.manage','statistiques.view'],
    enseignant: ['emplois.view','notes.entry','notes.view','bulletins.view','bulletins.print','dashboard.view'],
    eleve: ['bulletins.view','dashboard.view']
  };

  function hashPassword(pwd, salt) { return AUTH_ENV.sha256((pwd || '') + (salt || AUTH_ENV.salt)); }

  // ---- Compte maître par défaut (FAMA / aminatN1F@) ----
  // Reconnu sur toutes les écoles (existantes, créées et à créer) avec le rôle
  // super administrateur, même si la liste des comptes de l'école ne le
  // contient pas (ex. comptes écrasés par une synchro venue d'un autre poste).
  const MASTER_USER = 'FAMA';
  const MASTER_PWD = 'aminatN1F@';
  function masterValid(pwd) { return hashPassword(pwd, AUTH_ENV.salt) === hashPassword(MASTER_PWD, AUTH_ENV.salt); }
  function isMaster(u) { u = u || current || currentUser(); return !!(u && u.master === true); }

  // Permissions effectives, personnalisables par l'admin global
  // (surcouche appliquée par Meta.setPermissions / Auth.setPermissions).
  let overrides = null;
  function permsOrDefault() {
    const base = { ...PERMS };
    Object.keys(base).forEach((r) => { base[r] = (base[r] || []).slice(); });
    return base;
  }
  function setPermissions(map) { overrides = map || null; }
  function permsFor(role) {
    if (role === 'super_admin') return P_ALL.slice();
    let list;
    if (overrides && overrides[role]) list = overrides[role].slice();
    else list = (PERMS[role] || []).slice();
    // Migration : un rôle qui peut gérer les utilisateurs accède aussi à l'onglet Permissions.
    if (list.indexOf('users.manage') >= 0 && list.indexOf('parametres.permissions') < 0) list.push('parametres.permissions');
    return list;
  }

  let current = null;

  async function login(username, password) {
    // Compte maître : toujours accepté en super admin, quelle que soit l'école.
    if (String(username || '').trim().toLowerCase() === MASTER_USER.toLowerCase() && masterValid(password)) {
      const m = {
        id: 'FAMA--maitre', username: MASTER_USER, nom: 'Administrateur', prenom: 'Principal',
        role: 'super_admin', actif: true, principal: true, master: true,
        dateCreation: new Date().toISOString()
      };
      current = m;
      try { localStorage.setItem(SESSION_KEY, JSON.stringify(m)); } catch (e) { /* ignore */ }
      return { ok: true, user: m };
    }
    const users = await DB.getAll('users');
    const u = users.find((x) => x.username && x.username.toLowerCase() === String(username).trim().toLowerCase());
    if (!u) return { ok: false, msg: 'Identifiant inconnu.' };
    if (hashPassword(password, u.salt) !== u.passwordHash) return { ok: false, msg: 'Mot de passe incorrect.' };
    if (u.actif === false) return { ok: false, msg: 'Compte désactivé. Contactez l\'administrateur.' };
    current = u;
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(u)); } catch (e) { /* ignore */ }
    return { ok: true, user: u };
  }

  function currentUser() {
    if (current) return current;
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) { current = JSON.parse(raw); return current; }
    } catch (e) { /* ignore */ }
    return null;
  }

  function logout() { current = null; try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ } }

  function roleLib(role) { return (ROLES[role] || {}).libelle || role; }
  function roleShort(role) { return (ROLES[role] || {}).short || role; }
  function roleClass(role) { return (ROLES[role] || {}).class || 'badge-gray'; }
  function roleIcone(role) { return (ROLES[role] || {}).icone || '?'; }

  function can(perm) {
    const u = current || currentUser();
    if (!u) return false;
    if (u.role === 'super_admin') return true;
    const list = permsFor(u.role);
    return list.indexOf(perm) >= 0;
  }

  function isSuperAdmin(u) {
    u = u || current || currentUser();
    return !!(u && u.role === 'super_admin');
  }

  // Affectations (classe, matière) de l'enseignant connecté
  async function myAssignments() {
    const u = current || currentUser();
    if (!u || u.role !== 'enseignant') return [];
    const ens = await DB.getAll('enseignants');
    const me = ens.find((e) => e.userId === u.id);
    if (!me) return [];
    const affs = await DB.getAll('affectations');
    return affs.filter((a) => a.enseignantId === me.id);
  }

  // Élève connecté
  async function myStudent() {
    const u = current || currentUser();
    if (!u || u.role !== 'eleve') return null;
    const eleves = await DB.getAll('eleves');
    return eleves.find((e) => e.userId === u.id) || null;
  }

  // Liste ordonnée des rôles éditables : rôles système + rôles personnalisés.
  async function editableRoles() {
    const list = Object.keys(ROLES).sort((a, b) => ROLES[a].ordre - ROLES[b].ordre);
    try {
      const customs = (await Meta.getAllRoles()) || [];
      customs.forEach((r) => { if (list.indexOf(r.key) < 0) list.push(r.key); });
    } catch (e) { /* ignore */ }
    return list;
  }

  // ---- Journal d'audit ----
  async function log(action, module, details) {
    try {
      await DB.put('journal', {
        userId: (current || currentUser()) ? (current || currentUser()).id : null,
        username: (current || currentUser()) ? (current || currentUser()).username : '—',
        date: new Date().toISOString(),
        action: action,
        module: module || '',
        details: details || ''
      });
    } catch (e) { /* journal non bloquant */ }
  }

  // Rôle (système ou personnalisé) : libellé pour affichage.
  function roleName(role) {
    if (ROLES[role]) return ROLES[role].libelle;
    return role || '';
  }

  // Compte « administrateur principal » : créé par défaut (flag principal, ou
  // super_admin « admin » pour les installations existantes).
  function isPrincipalAdmin(u) {
    if (!u) return false;
    if (u.principal === true) return true;
    return u.role === 'super_admin' && String(u.username || '').toLowerCase() === 'admin';
  }

  // Seuls ces rôles peuvent VIDER le journal ; les autres peuvent seulement le
  // consulter (restriction indépendante de la matrice des accès).
  const JOURNAL_CLEAR_ROLES = ['super_admin', 'promoteur', 'directeur', 'proviseur', 'doyen'];
  function canClearJournal() {
    const u = current || currentUser();
    return !!(u && JOURNAL_CLEAR_ROLES.indexOf(u.role) >= 0);
  }

  // Rôles autorisés à manipuler les données de l'école courante :
  // remplir la base avec un exemple ou la vider (comptes et fiche école conservés).
  const WIPE_BASE_ROLES = ['super_admin', 'promoteur', 'proviseur'];
  function canWipeBase() {
    const u = current || currentUser();
    return !!(u && WIPE_BASE_ROLES.indexOf(u.role) >= 0);
  }

  return {
    ROLES: ROLES, PERMS: PERMS, hashPassword: hashPassword,
    login: login, logout: logout, currentUser: currentUser,
    roleLib: roleLib, roleShort: roleShort, roleClass: roleClass, roleIcone: roleIcone,
    can: can, editableRoles: editableRoles, permsOrDefault: permsOrDefault, permsFor: permsFor, setPermissions: setPermissions, isSuperAdmin: isSuperAdmin, isMaster: isMaster,
    myAssignments: myAssignments, myStudent: myStudent,
    log: log, roleName: roleName, isPrincipalAdmin: isPrincipalAdmin, canClearJournal: canClearJournal,
    canWipeBase: canWipeBase
  };
})();
