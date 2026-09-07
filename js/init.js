/* ============================================================
   init.js — Registre final des écrans & documentation des rôles
   ============================================================ */
App.register('aide', {
  title: 'Aide & Rôles',
  navLabel: 'Aide',
  icon: '?',
  group: 'Système',
  perm: 'dashboard.view',
  render: function (root) {
    const perms = [
      ['Super Administrateur', 'Accès complet (utilisateurs, école, pédagogie, finances, salaires, personnel, dépenses…). Seul rôle habilité à modifier les informations de l\u2019établissement.', 'badge-danger'],
      ['Promoteur', 'Propriétaire de l\u2019école : accès complet à la gestion (utilisateurs, pédagogie, finances, salaires, personnel, dépenses, notes, bulletins) ; informations de l\u2019établissement en lecture seule.', 'badge-danger'],
      ['Directeur / Administration', 'Même périmètre complet que le promoteur, avec les informations de l\u2019établissement en lecture seule.', 'badge-primary'],
      ['Proviseur', 'Chef d\u2019établissement du secondaire : accès complet à la gestion pédagogique et administrative.', 'badge-primary'],
      ['Censeur', 'Vie scolaire, élèves, notes, bulletins et passages.', 'badge-primary'],
      ['Surveillant', 'Consultation des élèves, emplois du temps, notes et bulletins.', 'badge-info'],
      ['Secrétaire', 'Classes, élèves, encaissement des frais, personnel & dépenses, consultation notes et bulletins.', 'badge-info'],
      ['Comptable', 'Frais scolaires, salaires & honoraires, personnel, dépenses, consultation notes et bulletins.', 'badge-warn'],
      ['Doyen', 'Niveaux et classes, élèves, notes, bulletins et passages.', 'badge-primary'],
      ['Enseignant', 'Son emploi du temps, saisie des notes de ses matières/classes, consultation des bulletins.', 'badge-ok'],
      ['Élève / Étudiant', 'Consulte ses propres bulletins et résultats.', 'badge-gray']
    ];
    const features = [
      '<b>Pointage des heures de cours</b> : chaque séance planifiée peut être pointée effectuée ou non (motif), et les <b>honoraires mensuels</b> sont générés automatiquement depuis le pointage, sur la base du <b>taux horaire</b> renseigné dans la fiche de l\u2019enseignant.',
      '<b>Suivi des honoraires</b> : les versements sont suivis par statut (<b>payé / en attente</b>), modifiable à tout moment.',
      '<b>Contrôle des heures</b> : 4 vérifications automatiques — <b>volumes affectés vs emploi du temps</b> ; <b>charge hebdomadaire vs capacité</b> de l\u2019enseignant ; <b>heures pointées vs programme</b> sur une période ; <b>détail par date</b> (séances sans pointage, pointages hors programme). La <b>capacité hebdomadaire</b> se règle dans la fiche enseignant (défaut 24 h).',
      '<b>Personnel de l\u2019administration</b> : contrats d\u2019embauche couvrant toutes les couches d\u2019enseignement (du préscolaire à l\u2019universitaire), salaires & primes, <b>prélèvements</b> (INSP/retraite, AMO, part patronale), <b>salaire net à payer</b>, versements mensuels (paies) avec statut, impression du contrat et de l\u2019état du personnel.',
      '<b>Compte utilisateur à la création d\u2019un employé</b> : possibilité de créer directement un identifiant avec mot de passe, pour le rôle de votre choix (hors Super Administrateur).',
      '<b>Dépenses & charges</b> : suivi des dépenses de l\u2019établissement par catégorie et par période, avec export <b>CSV</b> et impression.',
      '<b>Informations de l\u2019établissement</b> (École, Paramètres → Établissement) : consultables par tous, <b>modifiables uniquement par le Super Administrateur</b>.',
      '<b>Application de bureau</b> : le bouton « Quitter » de l\u2019écran de connexion ferme proprement l\u2019application.'
    ];
    const rules = [
      'Un enseignant peut dispenser <b>plusieurs matières</b> (via les affectations enseignant ↔ matière ↔ classe).',
      'À partir du cycle <b>Fondamental 1</b> et au-delà : une classe n\'a <b>pas d\'enseignant principal</b> (option activée par cycle).',
      'Formulaire du bulletin (colonnes dans l\'ordre) : <b>matières</b> · <b>moyenne de classe /20</b> · <b>moyenne de composition /40</b> · <b>moyenne matière</b> · <b>coefficients</b> · <b>moyenne matière × coefficient</b> · <b>appréciation</b>.',
      '<b>Moyenne matière = (moyenne de classe + moyenne de composition) ÷ 3</b> (note sur 20).',
      '<b>Moyenne coefficientée</b> = moyenne matière × coefficient de la matière.',
      '<b>Moyenne générale</b> = somme (moyenne coefficientée) ÷ somme des coefficients, avec <b>mention</b>.',
      'Classement des élèves par <b>moyenne générale</b> : le <b>rang</b> (avec ex-æquos partagés) est affiché sur la liste des résultats et sur chaque bulletin.',
      '<b>Passages</b> : promouvoir / changer de classe des élèves (fin d\'année, redoublement) avec historique des passages.',
      '<b>Import / Export</b> de la liste des élèves d\'une classe : fichiers <b>Excel (.xls / .csv)</b> et <b>PDF</b> (impression).',
      'Impression des <b>bulletins d\'une classe entière</b> en une seule opération.'
    ];
    root.innerHTML =
      '<div class="bar"><div class="card-title">Rôles & niveaux d\'accès</div>' +
      '<p class="card-sub">Le menu et les actions se limitent automatiquement selon le rôle de chaque utilisateur. Des rôles personnalisés peuvent être définis par l\'admin global et apparaissent au même rang que les rôles existants.</p></div>' +
      '<div class="bar"><div class="card-title">Fonctionnalités</div>' +
      '<ul style="margin-left:18px;line-height:1.9">' +
      features.map((f) => '<li>' + f + '</li>').join('') +
      '</ul></div>' +
      '<div class="bar"><div class="card-title">Règles applicatives</div>' +
      '<ul style="margin-left:18px;line-height:1.9">' +
      rules.map((r) => '<li>' + r + '</li>').join('') +
      '</ul></div>' +
      '<div class="bar"><div class="card-title">Tableau des rôles</div>' +
      '<div class="table-wrap"><table class="tbl"><thead><tr><th>Rôle</th><th>Niveau d\'accès</th></tr></thead><tbody>' +
      perms.map((p) => '<tr><td><span class="badge ' + p[2] + '">' + UI.esc(p[0]) + '</span></td><td>' + UI.esc(p[1]) + '</td></tr>').join('') +
      '</tbody></table></div></div>';
  }
});