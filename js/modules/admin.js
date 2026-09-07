/* ============================================================
   admin.js — Administration : personnel (contrats, salaires,
   primes) et dépenses / charges de l'établissement
   ============================================================ */

// Couverture du contrat : toutes les couches du préscolaire à l'universitaire
const ADM_COUVERTURES = ['Préscolaire', 'Primaire', 'Collège', 'Lycée', 'Supérieur', 'Toutes les couches'];
const ADM_CONTRATS = ['CDI', 'CDD', 'Stagiaire', 'Vacataire', 'Journalier'];
const ADM_STATUTS = [
  { id: 'actif', libelle: 'Actif' },
  { id: 'conge', libelle: 'En congé' },
  { id: 'suspendu', libelle: 'Suspendu' },
  { id: 'demission', libelle: 'Démissionnaire' }
];
const ADM_BADGE_STATUT = {
  actif: 'badge-ok', conge: 'badge-info', suspendu: 'badge-warn', demission: 'badge-gray'
};
const ADM_DEP_CAT = [
  'Électricité & eau', 'Internet & téléphone', 'Fournitures & matériel',
  'Transport & carburant', 'Réparations & maintenance', 'Loyer',
  'Salaires & primes', 'Impôts & taxes', 'Événements & cérémonies',
  'Sécurité', 'Divers'
];

// Prélèvements salariaux (% du salaire brut) applicables au personnel
// administratif d'un établissement scolaire.
const ADM_PREL_DEFAUTS = { insp: 5, amo: 3, patronale: 10, autres: 0 };
const ADM_PREL_LIB = [
  { key: 'insp', libelle: 'INSP / Retraite' },
  { key: 'amo', libelle: 'AMO (Assurance maladie)' },
  { key: 'autres', libelle: 'Autres prélèvements' }
];

function admPersNom(e) { return e ? ((e.nom || '') + ' ' + (e.prenom || '')).trim() : '—'; }

function admPrimes(p) { return p || {}; }
function admBrut(e) {
  const base = Number(e.salaireBase) || 0;
  const p = admPrimes(e.primes);
  return base + (Number(p.transport) || 0) + (Number(p.logement) || 0) +
    (Number(p.responsabilite) || 0) + (Number(p.autres) || 0);
}
function admPrelevPcts(e) {
  const p = e.prelevements || {};
  return {
    insp: Number(p.insp) >= 0 ? Number(p.insp) : ADM_PREL_DEFAUTS.insp,
    amo: Number(p.amo) >= 0 ? Number(p.amo) : ADM_PREL_DEFAUTS.amo,
    autres: Number(p.autres) >= 0 ? Number(p.autres) : ADM_PREL_DEFAUTS.autres,
    patronale: Number(p.patronale) >= 0 ? Number(p.patronale) : ADM_PREL_DEFAUTS.patronale
  };
}
function admPrelevSal(e) {
  const b = admBrut(e);
  const pct = admPrelevPcts(e);
  return Math.round(b * (pct.insp + pct.amo + pct.autres) / 100);
}
function admPartonale(e) {
  const b = admBrut(e);
  return Math.round(b * admPrelevPcts(e).patronale / 100);
}
function admNet(e) { return admBrut(e) - admPrelevSal(e); }
function admStatutLib(s) { return (ADM_STATUTS.find((x) => x.id === s) || {}).libelle || s || '—'; }

function modePaiementOptions(cur) {
  const modes = (window.PAIEMENT && window.PAIEMENT.modes) || ['Espèces', 'Chèque', 'Virement bancaire', 'Mobile Money'];
  return UI.options(modes.map((m) => ({ id: m, libelle: m })), cur || 'Espèces', null);
}

// ---------------------------------------------------------------------------
// Personnel & contrats d'embauche
// ---------------------------------------------------------------------------
App.register('personnel', {
  title: 'Personnel',
  navLabel: 'Personnel (contrats)',
  icon: 'P',
  group: 'Administration',
  perm: 'personnel.manage',

  render: async function (root) {
    root.innerHTML =
      '<div class="bar"><div class="bar-head"><div class="card-title">Gestion du personnel & contrats d\u2019embauche</div>' +
      '<div class="toolbar" id="ad-tools"></div></div></div>' +
      '<div class="grid" id="ad-cards" style="margin-bottom:16px"></div>' +
      '<div class="bar"><div class="table-wrap" id="ad-list"></div></div>';

    const listEl = root.querySelector('#ad-list');
    const cardsEl = root.querySelector('#ad-cards');
    const toolsEl = root.querySelector('#ad-tools');
    let filters = { couv: '', stat: '' };

    function toolBars() {
      toolsEl.innerHTML =
        '<label>Couverture</label><select id="ad-couv" style="width:auto">' +
          UI.options(ADM_COUVERTURES.map((c) => ({ id: c, libelle: c })), filters.couv || '', 'Toutes couvertures') + '</select>' +
        '<label>Statut</label><select id="ad-stat" style="width:auto">' +
          UI.options(ADM_STATUTS.map((s) => ({ id: s.id, libelle: s.libelle })), filters.stat || '', 'Tous statuts') + '</select>' +
        '<button class="btn btn-primary" id="ad-add">+ Nouvel employé</button>' +
        '<button class="btn btn-outline" id="ad-print">Imprimer l\u2019état</button>';
    }

    function render(d) {
      const employes = d.employes.slice().sort((a, b) => (b.dateCreation || '').localeCompare(a.dateCreation || ''));
      const filtres = employes.filter((e) =>
        (!filters.couv || e.couverture === filters.couv) &&
        (!filters.stat || e.statut === filters.stat));
      const actifs = filtres.filter((e) => e.statut === 'actif' || e.statut === 'conge');
      const cdiN = filtres.filter((e) => e.typeContrat === 'CDI').length;
      const masse = actifs.reduce((s, e) => s + admBrut(e), 0);

      cardsEl.innerHTML =
        '<div class="card-ph"><b>' + filtres.length + '</b><span>employés</span></div>' +
        '<div class="card-ph"><b>' + actifs.length + '</b><span>en poste</span></div>' +
        '<div class="card-ph"><b>' + cdiN + '</b><span>en CDI</span></div>' +
        '<div class="card-ph"><b>' + UI.money(masse) + '</b><span>masse salariale / mois</span></div>';

      const rows = filtres.map((e) => '<tr>' +
        '<td class="num">' + UI.esc(e.matricule || '—') + '</td>' +
        '<td><strong>' + UI.esc(admPersNom(e)) + '</strong></td>' +
        '<td>' + UI.esc(e.poste || '—') + '</td>' +
        '<td>' + UI.esc(e.couverture || '—') + '</td>' +
        '<td><span class="badge badge-info">' + UI.esc(e.typeContrat || '—') + '</span></td>' +
        '<td class="num">' + UI.money(admBrut(e)) + '</td>' +
        '<td class="num"><b>' + UI.money(admNet(e)) + '</b></td>' +
        '<td><span class="badge ' + (ADM_BADGE_STATUT[e.statut] || 'badge-gray') + '">' + UI.esc(admStatutLib(e.statut)) + '</span></td>' +
        '<td class="actions-cell">' +
          '<button class="btn btn-sm btn-outline" data-contrat="' + e.id + '">Contrat</button>' +
          '<button class="btn btn-sm btn-outline" data-paie="' + e.id + '">Paie</button>' +
          '<button class="btn btn-sm btn-outline" data-edit="' + e.id + '">Modifier</button>' +
          '<button class="btn btn-sm btn-danger" data-del="' + e.id + '">Suppr.</button>' +
        '</td></tr>').join('');

      listEl.innerHTML = UI.table(
        ['Matricule', 'Employé', 'Poste / Fonction', 'Couverture', 'Contrat', 'Salaire brut', 'Net à payer', 'Statut', 'Actions'],
        rows || UI.empty(9, 'Aucun employé pour ce filtre'));

      listEl.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () =>
        formPersonnel(d.employes.find((x) => x.id === Number(b.dataset.edit)), refresh));
      listEl.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => {
        const e = d.employes.find((x) => x.id === Number(b.dataset.del));
        UI.confirm('Supprimer « ' + admPersNom(e) + ' » et toutes ses paies ?', async () => {
          await DB.del('employes', e.id);
          const paies = d.paies.filter((p) => p.employeId === e.id);
          for (const p of paies) await DB.del('paies', p.id);
          UI.closeModal(); UI.toast('Employé supprimé.', 'ok');
          refresh();
        }, { title: 'Supprimer un employé' });
      });
      listEl.querySelectorAll('[data-contrat]').forEach((b) => b.onclick = () => {
        const e = d.employes.find((x) => x.id === Number(b.dataset.contrat));
        if (e) printContrat(e);
      });
      listEl.querySelectorAll('[data-paie]').forEach((b) => b.onclick = () => {
        const e = d.employes.find((x) => x.id === Number(b.dataset.paie));
        if (e) openPaieModal(e, refresh);
      });
    }

    function bindTools() {
      toolsEl.querySelector('#ad-couv').addEventListener('change', (ev) => { filters.couv = ev.target.value; refresh(); });
      toolsEl.querySelector('#ad-stat').addEventListener('change', (ev) => { filters.stat = ev.target.value; refresh(); });
      toolsEl.querySelector('#ad-add').onclick = () => formPersonnel(null, refresh);
      toolsEl.querySelector('#ad-print').onclick = () => printEtatEmployes();
    }

    async function refresh() {
      const d = { employes: await DB.getAll('employes'), paies: await DB.getAll('paies') };
      toolBars();
      bindTools();
      render(d);
    }

    refresh();
  }
});

/* Modale de saisie / modification d'un employé (contrat d'embauche) */
async function formPersonnel(e, afterSave) {
  e = e || {};
  const isNew = !e.id;
  const p = admPrimes(e.primes);
  let customs = [];
  try { customs = (await Meta.getAllRoles()) || []; } catch (err) { customs = []; }
  const roleSel = (sel) => '<option value="">— Rôle —</option>' +
    Object.keys(Auth.ROLES).filter((r) => r !== 'super_admin')
      .sort((a, b) => Auth.ROLES[a].ordre - Auth.ROLES[b].ordre)
      .map((r) => '<option value="' + r + '"' + (sel === r ? ' selected' : '') + '>' + UI.esc(Auth.ROLES[r].libelle) + '</option>').join('') +
    customs.map((c) => '<option value="' + c.key + '"' + (sel === c.key ? ' selected' : '') + '>' + UI.esc(c.nom) + '</option>').join('');
  const m = UI.prompt(isNew ? 'Nouvel employé (contrat d\u2019embauche)' : 'Modifier l\u2019employé', `
    <div class="row">
      <div class="field"><label>Nom *</label><input id="ad-nom" value="${UI.esc(e.nom || '')}" required></div>
      <div class="field"><label>Prénom</label><input id="ad-prenom" value="${UI.esc(e.prenom || '')}"></div>
    </div>
    <div class="row">
      <div class="field"><label>Sexe</label><select id="ad-sexe">${UI.options([{ id: 'M', libelle: 'Masculin' }, { id: 'F', libelle: 'Féminin' }], e.sexe || '', '—')}</select></div>
      <div class="field"><label>Date d\u2019embauche</label><input id="ad-date" type="date" value="${UI.esc(e.dateEmbauche || UI.today())}"></div>
    </div>
    <div class="row">
      <div class="field"><label>Poste / Fonction *</label><input id="ad-poste" value="${UI.esc(e.poste || '')}" placeholder="Ex : Secrétaire, Bursar, Aide-jardinier…" required></div>
      <div class="field"><label>Matricule</label><input id="ad-mat" value="${UI.esc(e.matricule || '')}" placeholder="Automatique si vide"></div>
    </div>
    <div class="row">
      <div class="field"><label>Couverture d\u2019affectation *</label><select id="ad-couv">${UI.options(ADM_COUVERTURES.map((c) => ({ id: c, libelle: c })), e.couverture || '', null)}</select></div>
      <div class="field"><label>Type de contrat *</label><select id="ad-contrat">${UI.options(ADM_CONTRATS.map((c) => ({ id: c, libelle: c })), e.typeContrat || 'CDI', null)}</select></div>
    </div>
    <div class="row">
      <div class="field"><label>Téléphone</label><input id="ad-tel" value="${UI.esc(e.telephone || '')}"></div>
      <div class="field"><label>Email</label><input id="ad-mail" type="email" value="${UI.esc(e.email || '')}"></div>
    </div>
    <div class="row">
      <div class="field"><label>Salaire de base (FCFA)</label><input id="ad-base" type="number" min="0" step="any" value="${Number(e.salaireBase) > 0 ? e.salaireBase : ''}"></div>
      <div class="field"><label>Prime de transport</label><input id="ad-p-tr" type="number" min="0" step="any" value="${Number(p.transport) > 0 ? p.transport : ''}"></div>
    </div>
    <div class="row">
      <div class="field"><label>Prime de logement</label><input id="ad-p-lo" type="number" min="0" step="any" value="${Number(p.logement) > 0 ? p.logement : ''}"></div>
      <div class="field"><label>Prime de responsabilité</label><input id="ad-p-re" type="number" min="0" step="any" value="${Number(p.responsabilite) > 0 ? p.responsabilite : ''}"></div>
    </div>
    <div class="field"><label>Autres primes</label><input id="ad-p-au" type="number" min="0" step="any" value="${Number(p.autres) > 0 ? p.autres : ''}"></div>
    <div class="card-title" style="margin:12px 0 6px;font-size:14px">Prélèvements (&#37; du salaire brut)</div>
    <div class="row">
      <div class="field"><label>INSP / Retraite</label><input id="ad-pr-insp" type="number" min="0" step="any" value="${UI.esc(admPrelevPcts(e).insp)}"></div>
      <div class="field"><label>AMO (Assurance maladie)</label><input id="ad-pr-amo" type="number" min="0" step="any" value="${UI.esc(admPrelevPcts(e).amo)}"></div>
    </div>
    <div class="row">
      <div class="field"><label>Part patronale</label><input id="ad-pr-pa" type="number" min="0" step="any" value="${UI.esc(admPrelevPcts(e).patronale)}"></div>
      <div class="field"><label>Autres prélèvements</label><input id="ad-pr-au" type="number" min="0" step="any" value="${UI.esc(admPrelevPcts(e).autres)}"></div>
    </div>
    <div class="field"><label>Statut</label><select id="ad-stat">${UI.options(ADM_STATUTS.map((s) => ({ id: s.id, libelle: s.libelle })), e.statut || 'actif', null)}</select></div>
    ${isNew ? `
    <div class="card-title" style="margin:12px 0 6px;font-size:14px">Compte utilisateur</div>
    <div class="field"><label><input type="checkbox" id="ad-acc"> Créer un compte utilisateur au nom de cet employé ?</label></div>
    <div id="ad-acc-box" class="hidden">
      <div class="row">
        <div class="field"><label>Identifiant *</label><input id="ad-acc-user" placeholder="Ex : nom.prenom"></div>
        <div class="field"><label>Rôle *</label><select id="ad-acc-role">${roleSel('')}</select></div>
      </div>
      <div class="row">
        <div class="field"><label>Mot de passe *</label><input id="ad-acc-pwd" type="password"></div>
        <div class="field"><label>Confirmation *</label><input id="ad-acc-pwd2" type="password"></div>
      </div>
    </div>` : ''}
  `, async (body) => {
    const nom = body.querySelector('#ad-nom').value.trim();
    const poste = body.querySelector('#ad-poste').value.trim();
    if (!nom || !poste) { UI.toast('Nom et poste requis.', 'err'); return false; }
    const createAccount = isNew && body.querySelector('#ad-acc') && body.querySelector('#ad-acc').checked;
    const accUser = createAccount ? body.querySelector('#ad-acc-user').value.trim() : '';
    const accRole = createAccount ? body.querySelector('#ad-acc-role').value : '';
    const accPwd = createAccount ? body.querySelector('#ad-acc-pwd').value : '';
    const accPwd2 = createAccount ? body.querySelector('#ad-acc-pwd2').value : '';
    if (createAccount) {
      if (!accUser || !accRole) { UI.toast('Renseignez l\u2019identifiant et le rôle du compte.', 'err'); return false; }
      if (!accPwd || accPwd.length < 4) { UI.toast('Le mot de passe doit contenir au moins 4 caractères.', 'err'); return false; }
      if (accPwd !== accPwd2) { UI.toast('Les mots de passe ne correspondent pas.', 'err'); return false; }
      const all = await DB.getAll('users');
      if (all.some((x) => String(x.username).toLowerCase() === accUser.toLowerCase())) { UI.toast('Cet identifiant existe déjà.', 'err'); return false; }
    }
    const obj = {
      nom: nom, prenom: body.querySelector('#ad-prenom').value.trim(),
      sexe: body.querySelector('#ad-sexe').value, telephone: body.querySelector('#ad-tel').value.trim(),
      email: body.querySelector('#ad-mail').value.trim(), dateEmbauche: body.querySelector('#ad-date').value,
      poste: poste, matricule: body.querySelector('#ad-mat').value.trim(),
      couverture: body.querySelector('#ad-couv').value || 'Toutes les couches',
      typeContrat: body.querySelector('#ad-contrat').value, statut: body.querySelector('#ad-stat').value,
      salaireBase: Number(body.querySelector('#ad-base').value) > 0 ? Number(body.querySelector('#ad-base').value) : 0,
      primes: {
        transport: Number(body.querySelector('#ad-p-tr').value) > 0 ? Number(body.querySelector('#ad-p-tr').value) : 0,
        logement: Number(body.querySelector('#ad-p-lo').value) > 0 ? Number(body.querySelector('#ad-p-lo').value) : 0,
        responsabilite: Number(body.querySelector('#ad-p-re').value) > 0 ? Number(body.querySelector('#ad-p-re').value) : 0,
        autres: Number(body.querySelector('#ad-p-au').value) > 0 ? Number(body.querySelector('#ad-p-au').value) : 0
      },
      prelevements: {
        insp: Number(body.querySelector('#ad-pr-insp').value) >= 0 ? Number(body.querySelector('#ad-pr-insp').value) : ADM_PREL_DEFAUTS.insp,
        amo: Number(body.querySelector('#ad-pr-amo').value) >= 0 ? Number(body.querySelector('#ad-pr-amo').value) : ADM_PREL_DEFAUTS.amo,
        patronale: Number(body.querySelector('#ad-pr-pa').value) >= 0 ? Number(body.querySelector('#ad-pr-pa').value) : ADM_PREL_DEFAUTS.patronale,
        autres: Number(body.querySelector('#ad-pr-au').value) >= 0 ? Number(body.querySelector('#ad-pr-au').value) : ADM_PREL_DEFAUTS.autres
      }
    };
    let empId = null;
    if (isNew) {
      obj.matricule = obj.matricule || ('EMP' + String(Date.now()).slice(-6));
      obj.dateCreation = UI.nowIso();
      empId = await DB.add('employes', obj);
    } else {
      Object.keys(obj).forEach((k) => { e[k] = obj[k]; });
      empId = e.id;
      await DB.put('employes', e);
    }
    if (createAccount) {
      const user = {
        nom: obj.nom, prenom: obj.prenom, username: accUser, role: accRole, actif: true,
        salt: AUTH_ENV.salt, passwordHash: AUTH_ENV.sha256(accPwd + AUTH_ENV.salt),
        dateCreation: UI.nowIso()
      };
      const uid = await DB.add('users', user);
      const savedEmp = await DB.get('employes', empId);
      savedEmp.userId = uid;
      await DB.put('employes', savedEmp);
      await Auth.log('Création', 'personnel', 'Compte ' + accUser + ' pour ' + admPersNom(obj));
    }
    UI.closeModal();
    UI.toast(isNew ? 'Employé enregistré.' : 'Employé modifié.', 'ok');
    await Auth.log(isNew ? 'Création' : 'Modification', 'personnel', admPersNom(obj));
    afterSave();
    return true;
  }, { size: 'modal modal-lg' });

  if (isNew) {
    const accCb = m.modal.querySelector('#ad-acc');
    const accBox = m.modal.querySelector('#ad-acc-box');
    if (accCb && accBox) {
      accCb.addEventListener('change', () => {
        accBox.classList.toggle('hidden', !accCb.checked);
        const uEl = m.modal.querySelector('#ad-acc-user');
        if (accCb.checked && uEl && !uEl.value) {
          const g = (id) => String(m.modal.querySelector(id) ? m.modal.querySelector(id).value || '' : '').trim();
          const nom = g('#ad-nom').toLowerCase().replace(/\s+/g, '.');
          uEl.value = nom || 'utilisateur';
        }
      });
    }
  }
}

/* Fiche du contrat d'embauche (imprimable) */
function printContrat(e) {
  DB.get('ecole', 1).then((eco) => {
    const primes = admPrimes(e.primes);
    const rows =
      '<tr><td><b>Employé :</b> ' + UI.esc(admPersNom(e)) + '</td></tr>' +
      (e.matricule ? '<tr><td><b>Matricule :</b> ' + UI.esc(e.matricule) + '</td></tr>' : '') +
      '<tr><td><b>Poste / Fonction :</b> ' + UI.esc(e.poste || '—') + '</td></tr>' +
      '<tr><td><b>Couverture d\u2019affectation :</b> ' + UI.esc(e.couverture || '—') + '</td></tr>' +
      '<tr><td><b>Type de contrat :</b> ' + UI.esc(e.typeContrat || '—') + '</td></tr>' +
      '<tr><td><b>Date d\u2019embauche :</b> ' + UI.dateFr(e.dateEmbauche) + '</td></tr>' +
      (e.telephone ? '<tr><td><b>Téléphone :</b> ' + UI.esc(e.telephone) + '</td></tr>' : '') +
      (e.email ? '<tr><td><b>Email :</b> ' + UI.esc(e.email) + '</td></tr>' : '') +
      '<tr><td><b>Statut :</b> ' + UI.esc(admStatutLib(e.statut)) + '</td></tr>';
    const items =
      '<tr><td>Salaire de base</td><td style="text-align:right">' + UI.money(e.salaireBase) + '</td></tr>' +
      (Number(primes.transport) > 0 ? '<tr><td>Prime de transport</td><td style="text-align:right">' + UI.money(primes.transport) + '</td></tr>' : '') +
      (Number(primes.logement) > 0 ? '<tr><td>Prime de logement</td><td style="text-align:right">' + UI.money(primes.logement) + '</td></tr>' : '') +
      (Number(primes.responsabilite) > 0 ? '<tr><td>Prime de responsabilité</td><td style="text-align:right">' + UI.money(primes.responsabilite) + '</td></tr>' : '') +
      (Number(primes.autres) > 0 ? '<tr><td>Autres primes</td><td style="text-align:right">' + UI.money(primes.autres) + '</td></tr>' : '') +
      '<tr><td><b>Salaire brut mensuel</b></td><td style="text-align:right"><b>' + UI.money(admBrut(e)) + '</b></td></tr>' +
      '<tr><td>Prélèvement INSP / Retraite (' + admPrelevPcts(e).insp + '&#37;)</td><td style="text-align:right">' + UI.money(Math.round(admBrut(e) * admPrelevPcts(e).insp / 100)) + '</td></tr>' +
      '<tr><td>Prélèvement AMO — Assurance maladie (' + admPrelevPcts(e).amo + '&#37;)</td><td style="text-align:right">' + UI.money(Math.round(admBrut(e) * admPrelevPcts(e).amo / 100)) + '</td></tr>' +
      (admPrelevPcts(e).autres > 0 ? '<tr><td>Autres prélèvements (' + admPrelevPcts(e).autres + '&#37;)</td><td style="text-align:right">' + UI.money(Math.round(admBrut(e) * admPrelevPcts(e).autres / 100)) + '</td></tr>' : '') +
      (admPrelevPcts(e).patronale > 0 ? '<tr><td>Part patronale (' + admPrelevPcts(e).patronale + '&#37;) — coût employeur</td><td style="text-align:right">' + UI.money(admPartonale(e)) + '</td></tr>' : '') +
      '<tr><td><b>Salaire net à payer</b></td><td style="text-align:right"><b>' + UI.money(admNet(e)) + '</b></td></tr>';
    const html = UI.letterhead(eco, { title: 'CONTRAT D\u2019EMBAUCHE' }, {}) +
      '<p>L\u2019établissement <b>' + UI.esc(eco.nom || '') + '</b>, employeur, engage l\u2019employé ci-dessous :<br>' +
      'Le présent contrat couvre les couches de l\u2019enseignement <b>du préscolaire à l\u2019universitaire</b> selon la couverture d\u2019affectation définie.</p>' +
      '<table style="width:100%;margin-top:8px">' + rows + '</table>' +
      '<div style="margin-top:14px;border-top:2px solid #000;padding-top:8px"><b>Rémunération mensuelle et prélèvements</b></div>' +
      '<table style="width:100%;margin-top:6px"><tbody>' + items + '</tbody></table>' +
      '<div style="margin-top:24px;border-top:1px solid #000;padding-top:10px"><b>Signatures</b></div>' +
      '<table style="width:100%;margin-top:16px">' +
        '<tr><td style="text-align:center"><b>Le Promoteur</b><br><br><br>______________________</td>' +
        '<td style="text-align:center"><b>L\u2019Inspecteur du Travail</b><br><br><br>______________________</td>' +
        '<td style="text-align:center"><b>Le Médecin</b><br><br><br>______________________</td></tr>' +
      '</table>' +
      '<div style="margin-top:20px;display:flex;justify-content:space-between">' +
        '<div>Fait à <b>' + UI.esc(eco.ville || '______') + '</b>, le ' + UI.dateFr(UI.today()) + '</div>' +
        '<div>Signature de l\u2019employé : ______________________</div></div>';
    UI.print(html, 'Contrat d\u2019embauche');
  });
}

function printEtatEmployes() {
  Promise.all([DB.get('ecole', 1), DB.getAll('employes')]).then(([eco, employes]) => {
    const rows = employes.map((e) => '<tr><td>' + UI.esc(e.matricule || '—') + '</td>' +
      '<td>' + UI.esc(admPersNom(e)) + '</td>' +
      '<td>' + UI.esc(e.poste || '—') + '</td>' +
      '<td>' + UI.esc(e.couverture || '—') + '</td>' +
      '<td>' + UI.esc(e.typeContrat || '—') + '</td>' +
      '<td class="num">' + UI.money(admBrut(e)) + '</td>' +
      '<td class="num">' + UI.money(admPrelevSal(e)) + '</td>' +
      '<td class="num"><b>' + UI.money(admNet(e)) + '</b></td>' +
      '<td>' + UI.esc(admStatutLib(e.statut)) + '</td></tr>').join('');
    const total = employes.reduce((s, e) => s + admBrut(e), 0);
    const totalNet = employes.reduce((s, e) => s + admNet(e), 0);
    UI.print(UI.letterhead(eco, { title: 'État du personnel' }, {}) +
      UI.table(['Matricule', 'Employé', 'Poste', 'Couverture', 'Contrat', 'Salaire brut', 'Prélèvements', 'Net à payer', 'Statut'], rows || UI.empty(9)) +
      '<p><b>Masse salariale brute mensuelle : ' + UI.money(total) + '</b> — <b>Net à payer : ' + UI.money(totalNet) + '</b></p>', 'État du personnel');
  });
}

/* ---------------- Paie d'un employé (salaires & primes) ---------------- */
function openPaieModal(emp, refresh) {
  const m = UI.modal('', '', { title: 'Paie de ' + admPersNom(emp), size: 'modal modal-lg' });
  const body = m.modal.querySelector('.modal-body');
  const now = new Date();

  function statutSel(p) {
    return '<select class="ap-stat" data-id="' + p.id + '" style="width:auto;padding:2px 4px">' +
      UI.options([{ id: 'attente', libelle: 'En attente' }, { id: 'paye', libelle: 'Payé' }], p.statut === 'paye' ? 'paye' : 'attente', null) + '</select>';
  }

  async function render() {
    const paiements = await DB.getAll('paies');
    const mine = paiements.filter((p) => p.employeId === emp.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const paye = mine.filter((p) => p.statut === 'paye').reduce((s, p) => s + Number(p.montant || 0), 0);
    body.innerHTML =
      '<p class="hint">Salaire brut : <b>' + UI.money(admBrut(emp)) + '</b> · Prélèvements salarié : <b>' + UI.money(admPrelevSal(emp)) + '</b> · Part patronale : <b>' + UI.money(admPartonale(emp)) + '</b> · ' +
      '<b>Net à payer : ' + UI.money(admNet(emp)) + '</b></p>' +
      '<div class="bar" style="margin-bottom:10px">' +
        '<div class="card-sub">Total payé : <b>' + UI.money(paye) + '</b></div>' +
        '<button class="btn btn-primary" id="ap-add" style="margin-left:auto">+ Verser un salaire</button>' +
      '</div>' +
      '<div class="table-wrap" id="ap-list"></div>';
    const rows = mine.map((p) => '<tr>' +
      '<td>' + UI.esc(p.mois + '/' + p.annee) + '</td>' +
      '<td class="num">' + UI.money(p.montant) + '</td>' +
      '<td>' + UI.dateFr(p.date) + '</td>' +
      '<td>' + statutSel(p) + '</td>' +
      '<td class="actions-cell"><button class="btn btn-sm btn-danger" data-pdel="' + p.id + '">Suppr.</button></td></tr>').join('');
    body.querySelector('#ap-list').innerHTML = UI.table(['Période', 'Montant', 'Date', 'Statut', 'Actions'], rows || UI.empty(5, 'Aucun versement'));
    body.querySelector('#ap-add').onclick = () => {
      UI.prompt('Verser un salaire à ' + admPersNom(emp), `
        <div class="row-3">
          <div class="field"><label>Mois *</label><input id="ap-mois" type="number" min="1" max="12" value="${now.getMonth() + 1}" required></div>
          <div class="field"><label>Année *</label><input id="ap-annee" type="number" value="${now.getFullYear()}" required></div>
          <div class="field"><label>Montant *</label><input id="ap-mt" type="number" min="0" value="${admNet(emp)}" required></div>
        </div>
        <div class="field"><label>Date</label><input id="ap-date" type="date" value="${UI.today()}"></div>
        <div class="field"><label>Statut</label><select id="ap-st">${UI.options([{ id: 'paye', libelle: 'Payé' }, { id: 'attente', libelle: 'En attente' }], 'paye', null)}</select></div>
      `, async (b) => {
        const mois = Number(b.querySelector('#ap-mois').value);
        const annee = Number(b.querySelector('#ap-annee').value);
        const mt = Number(b.querySelector('#ap-mt').value);
        if (!mois || !annee || !(mt >= 0)) { UI.toast('Renseignez mois, année et montant.', 'err'); return false; }
        await DB.add('paies', {
          employeId: emp.id, mois: mois, annee: annee, montant: mt,
          date: b.querySelector('#ap-date').value, statut: b.querySelector('#ap-st').value, dateCreation: UI.nowIso()
        });
        UI.closeModal(); UI.toast('Salaire enregistré.', 'ok');
        await Auth.log('Création', 'paie', admPersNom(emp) + ' ' + mois + '/' + annee);
        render();
        return true;
      }, { size: 'modal modal-sm' });
    };
    body.querySelectorAll('.ap-stat').forEach((sel) => sel.onchange = async () => {
      const p = mine.find((x) => x.id === Number(sel.dataset.id));
      if (!p) return;
      p.statut = sel.value;
      await DB.put('paies', p);
      UI.toast('Statut mis à jour.', 'ok');
      render();
    });
    body.querySelectorAll('[data-pdel]').forEach((b) => b.onclick = () => {
      const p = mine.find((x) => x.id === Number(b.dataset.pdel));
      if (!p) return;
      UI.confirm('Supprimer ce versement ?', async () => {
        await DB.del('paies', p.id);
        UI.closeModal();
        render();
        if (refresh) refresh();
      }, { title: 'Supprimer' });
    });
  }
  render();
}

// ---------------------------------------------------------------------------
// Dépenses & autres charges de l'établissement
// ---------------------------------------------------------------------------
App.register('depenses', {
  title: 'Dépenses',
  navLabel: 'Dépenses & charges',
  icon: 'D',
  group: 'Administration',
  perm: 'depenses.manage',

  render: async function (root) {
    root.innerHTML =
      '<div class="bar"><div class="bar-head"><div class="card-title">Dépenses & autres charges de l\u2019établissement</div>' +
      '<div class="toolbar" id="dp-tools"></div></div></div>' +
      '<div class="grid" id="dp-cards" style="margin-bottom:16px"></div>' +
      '<div class="bar"><div class="table-wrap" id="dp-list"></div></div>';

    const listEl = root.querySelector('#dp-list');
    const cardsEl = root.querySelector('#dp-cards');
    const toolsEl = root.querySelector('#dp-tools');
    let filters = { cat: '', from: '', to: '' };

    function inRange(x) {
      const d = String(x.date || '');
      if (filters.from && d < filters.from) return false;
      if (filters.to && d > filters.to) return false;
      return true;
    }

    function toolBars() {
      toolsEl.innerHTML =
        '<label>Catégorie</label><select id="dp-cat" style="width:auto">' +
          UI.options(ADM_DEP_CAT.map((c) => ({ id: c, libelle: c })), filters.cat || '', 'Toutes catégories') + '</select>' +
        '<label>Du</label><input type="date" id="dp-from" value="' + UI.esc(filters.from || '') + '">' +
        '<label>Au</label><input type="date" id="dp-to" value="' + UI.esc(filters.to || '') + '">' +
        '<button class="btn btn-primary" id="dp-add">+ Nouvelle dépense</button>' +
        '<button class="btn btn-outline" id="dp-csv">CSV</button>' +
        '<button class="btn btn-outline" id="dp-print">Imprimer</button>';
    }

    async function render() {
      const depenses = await DB.getAll('depenses');
      const filtres = depenses.filter((x) =>
        (!filters.cat || x.categorie === filters.cat) && inRange(x));
      filtres.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      const total = filtres.reduce((s, x) => s + Number(x.montant || 0), 0);
      const count = filtres.length;
      const moy = count ? total / count : 0;
      const parCat = {};
      filtres.forEach((x) => { parCat[x.categorie] = (parCat[x.categorie] || 0) + Number(x.montant || 0); });
      const topCat = Object.keys(parCat).sort((a, b) => parCat[b] - parCat[a])[0] || '—';

      cardsEl.innerHTML =
        '<div class="card-ph"><b>' + UI.money(total) + '</b><span>' + count + ' dépense(s)</span></div>' +
        '<div class="card-ph"><b>' + UI.money(moy) + '</b><span>moyenne / dépense</span></div>' +
        '<div class="card-ph"><b>' + UI.esc(topCat) + '</b><span>1re catégorie</span></div>';

      const rows = filtres.map((x) => '<tr>' +
        '<td>' + UI.dateFr(x.date) + '</td>' +
        '<td><strong>' + UI.esc(x.libelle) + '</strong></td>' +
        '<td><span class="badge badge-info">' + UI.esc(x.categorie) + '</span></td>' +
        '<td>' + UI.esc(x.beneficiaire || '—') + '</td>' +
        '<td>' + UI.esc(x.mode || 'Espèces') + '</td>' +
        '<td class="num">' + UI.money(x.montant) + '</td>' +
        '<td class="actions-cell">' +
          '<button class="btn btn-sm btn-outline" data-edit="' + x.id + '">Modifier</button>' +
          '<button class="btn btn-sm btn-danger" data-del="' + x.id + '">Suppr.</button>' +
        '</td></tr>').join('');

      listEl.innerHTML = UI.table(
        ['Date', 'Libellé', 'Catégorie', 'Bénéficiaire', 'Mode', 'Montant', 'Actions'],
        rows || UI.empty(7, 'Aucune dépense pour ce filtre'));

      listEl.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => formDepense(depenses.find((x) => x.id === Number(b.dataset.edit)), render));
      listEl.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => {
        const x = depenses.find((y) => y.id === Number(b.dataset.del));
        if (!x) return;
        UI.confirm('Supprimer la dépense « ' + x.libelle + ' » ?', async () => {
          await DB.del('depenses', x.id);
          await Auth.log('Suppression', 'depenses', x.libelle);
          UI.closeModal(); UI.toast('Dépense supprimée.', 'ok');
          render();
        }, { title: 'Supprimer' });
      });
    }

    function bindTools() {
      toolsEl.querySelector('#dp-cat').addEventListener('change', (ev) => { filters.cat = ev.target.value; render(); });
      toolsEl.querySelector('#dp-from').addEventListener('change', (ev) => { filters.from = ev.target.value; render(); });
      toolsEl.querySelector('#dp-to').addEventListener('change', (ev) => { filters.to = ev.target.value; render(); });
      toolsEl.querySelector('#dp-add').onclick = () => formDepense(null, render);
      toolsEl.querySelector('#dp-csv').onclick = () => exportDepenses();
      toolsEl.querySelector('#dp-print').onclick = () => printDepenses(filters);
    }

    toolBars();
    bindTools();
    render();
  }
});

function formDepense(x, refresh) {
  x = x || {};
  const isNew = !x.id;
  UI.prompt(isNew ? 'Nouvelle dépense' : 'Modifier la dépense', `
    <div class="field"><label>Libellé *</label><input id="dp-lib" value="${UI.esc(x.libelle || '')}" required placeholder="Ex : Facture d\u2019électricité"></div>
    <div class="row">
      <div class="field"><label>Catégorie *</label><select id="dp-cat">${UI.options(ADM_DEP_CAT.map((c) => ({ id: c, libelle: c })), x.categorie || '', null)}</select></div>
      <div class="field"><label>Montant *</label><input id="dp-mt" type="number" min="0" step="any" value="${Number(x.montant) > 0 ? x.montant : ''}" required></div>
    </div>
    <div class="row">
      <div class="field"><label>Date</label><input id="dp-date" type="date" value="${UI.esc(x.date || UI.today())}"></div>
      <div class="field"><label>Mode de paiement</label><select id="dp-mode">${modePaiementOptions(x.mode)}</select></div>
    </div>
    <div class="field"><label>Bénéficiaire / Fournisseur</label><input id="dp-ben" value="${UI.esc(x.beneficiaire || '')}"></div>
    <div class="field"><label>Note</label><input id="dp-note" value="${UI.esc(x.note || '')}"></div>
  `, async (body) => {
    const libelle = body.querySelector('#dp-lib').value.trim();
    const mt = Number(body.querySelector('#dp-mt').value);
    if (!libelle || !(mt >= 0)) { UI.toast('Libellé et montant requis.', 'err'); return false; }
    const obj = {
      libelle: libelle, categorie: body.querySelector('#dp-cat').value,
      montant: mt, date: body.querySelector('#dp-date').value,
      mode: body.querySelector('#dp-mode').value, beneficiaire: body.querySelector('#dp-ben').value.trim(),
      note: body.querySelector('#dp-note').value.trim()
    };
    if (isNew) {
      obj.dateCreation = UI.nowIso();
      await DB.add('depenses', obj);
    } else {
      Object.keys(obj).forEach((k) => { x[k] = obj[k]; });
      await DB.put('depenses', x);
    }
    UI.closeModal();
    UI.toast(isNew ? 'Dépense enregistrée.' : 'Dépense modifiée.', 'ok');
    await Auth.log(isNew ? 'Création' : 'Modification', 'depenses', libelle);
    refresh();
    return true;
  });
}

function exportDepenses() {
  DB.getAll('depenses').then((list) => {
    const rows = list.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((x) => [
      x.date, x.libelle, x.categorie, x.beneficiaire || '', x.mode || 'Espèces',
      String(x.montant == null ? '' : String(x.montant).replace('.', ','))
    ]);
    Store.downloadCSV(['Date', 'Libellé', 'Catégorie', 'Bénéficiaire', 'Mode', 'Montant'], rows, 'depenses.csv');
  });
}

function printDepenses(filters) {
  Promise.all([DB.get('ecole', 1), DB.getAll('depenses')]).then(([eco, list]) => {
    const filtres = list.filter((x) => {
      const d = String(x.date || '');
      return (!filters.cat || x.categorie === filters.cat) &&
        (!filters.from || d >= filters.from) && (!filters.to || d <= filters.to);
    });
    filtres.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const rows = filtres.map((x) => '<tr><td>' + UI.dateFr(x.date) + '</td>' +
      '<td>' + UI.esc(x.libelle) + '</td>' +
      '<td>' + UI.esc(x.categorie) + '</td>' +
      '<td class="num">' + UI.money(x.montant) + '</td>' +
      '<td>' + UI.esc(x.mode || 'Espèces') + '</td></tr>').join('');
    const total = filtres.reduce((s, x) => s + Number(x.montant || 0), 0);
    UI.print(UI.letterhead(eco, { title: 'Dépenses & charges' }, {}) +
      '<p class="muted">Période : ' + UI.esc((filters.from || filters.to) ? 'du ' + (filters.from || '…') + ' au ' + (filters.to || '…') : 'depuis le début') + '</p>' +
      UI.table(['Date', 'Libellé', 'Catégorie', 'Montant', 'Mode'], rows || UI.empty(5)) +
      '<p><b>Total : ' + UI.money(total) + '</b></p>', 'Dépenses & charges');
  });
}