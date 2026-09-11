/* ============================================================
   sample_data.js — Injecte un jeu de données d'exemple complet
   dans la base de l'école courante (DB singleton).
   Utilisation (dans la console ou un script) : SampleData.populate()
   ============================================================ */
window.SampleData = (function () {
  async function add(store, obj) {
    const id = await DB.add(store, obj);
    return id;
  }

  async function populate() {
    await DB.ready();
    const now = new Date().toISOString();
    const annee = new Date().getFullYear();

    // ---------- École ----------
    const eco = await DB.get('ecole', 1);
    await DB.put('ecole', Object.assign({}, eco || { id: 1 }, {
      nom: 'Collège & Lycée Les Savants',
      slogan: 'Savoir, Savoir-faire, Savoir-être',
      directeur: 'M. Jean-Baptiste KOFFI',
      anneeEnCoursId: null
    }));

    // ---------- Année scolaire + trimestres ----------
    const anneeId = await add('annees', {
      libelle: (annee) + '-' + (annee + 1),
      dateDebut: (annee) + '-09-01', dateFin: (annee + 1) + '-06-30',
      dateCreation: now
    });
    const t1 = await add('trimestres', { libelle: 'Trimestre 1', anneeId, dateCreation: now });
    const t2 = await add('trimestres', { libelle: 'Trimestre 2', anneeId, dateCreation: now });
    const t3 = await add('trimestres', { libelle: 'Trimestre 3', anneeId, dateCreation: now });

    let focus = await DB.get('ecole', 1);
    focus.anneeEnCoursId = anneeId;
    await DB.put('ecole', focus);

    // ---------- Cycles ----------
    const cyPresc = await add('cycles', { libelle: 'Préscolaire', description: 'Maternelle et petite enfance', enseignantPrincipal: true, dateCreation: now });
    const cyF1 = await add('cycles', { libelle: 'Fondamental 1', description: 'Classes de base (CE1–CM2)', enseignantPrincipal: true, dateCreation: now });
    const cyF2 = await add('cycles', { libelle: 'Fondamental 2', description: 'Collège (6ème–3ème)', enseignantPrincipal: false, dateCreation: now });
    const cySecond = await add('cycles', { libelle: 'Secondaire', description: 'Lycée (2nde–Terminale)', enseignantPrincipal: false, dateCreation: now });

    // ---------- Niveaux ----------
    const niveaux = {};
    niveaux['M1'] = await add('niveaux', { libelle: 'Moyenne Section', cycleId: cyPresc, dateCreation: now });
    niveaux['M2'] = await add('niveaux', { libelle: 'Grande Section', cycleId: cyPresc, dateCreation: now });
    niveaux['CE1'] = await add('niveaux', { libelle: 'CE1', cycleId: cyF1, dateCreation: now });
    niveaux['CE2'] = await add('niveaux', { libelle: 'CE2', cycleId: cyF1, dateCreation: now });
    niveaux['CM1'] = await add('niveaux', { libelle: 'CM1', cycleId: cyF1, dateCreation: now });
    niveaux['CM2'] = await add('niveaux', { libelle: 'CM2', cycleId: cyF1, dateCreation: now });
    niveaux['6eme'] = await add('niveaux', { libelle: '6ème', cycleId: cyF2, dateCreation: now });
    niveaux['5eme'] = await add('niveaux', { libelle: '5ème', cycleId: cyF2, dateCreation: now });
    niveaux['3eme'] = await add('niveaux', { libelle: '3ème', cycleId: cyF2, dateCreation: now });
    niveaux['2nde'] = await add('niveaux', { libelle: '2nde', cycleId: cySecond, dateCreation: now });
    niveaux['Tle'] = await add('niveaux', { libelle: 'Terminale', cycleId: cySecond, dateCreation: now });

    // ---------- Salles ----------
    const salles = {};
    salles['A1'] = await add('salles', { libelle: 'Salle A1', type: 'Classe', localisation: 'Bâtiment A – RdC', capacite: 40, dateCreation: now });
    salles['A2'] = await add('salles', { libelle: 'Salle A2', type: 'Classe', localisation: 'Bâtiment A – RdC', capacite: 40, dateCreation: now });
    salles['B1'] = await add('salles', { libelle: 'Salle B1', type: 'Classe', localisation: 'Bâtiment B – 1er étage', capacite: 45, dateCreation: now });
    salles['B2'] = await add('salles', { libelle: 'Salle B2', type: 'Classe', localisation: 'Bâtiment B – 1er étage', capacite: 45, dateCreation: now });
    salles['LABO'] = await add('salles', { libelle: 'Laboratoire', type: 'Laboratoire', localisation: 'Bâtiment C', capacite: 30, dateCreation: now });
    salles['INFO'] = await add('salles', { libelle: 'Salle Informatique', type: 'Informatique', localisation: 'Bâtiment C', capacite: 25, dateCreation: now });

    // ---------- Matières (par cycle) ----------
    const matiere = {};
    matiere['MS'] = await add('matieres', { libelle: 'Mathématiques', coefficient: 4, cycleId: cyF2, dateCreation: now });
    matiere['FR'] = await add('matieres', { libelle: 'Français', coefficient: 4, cycleId: cyF2, dateCreation: now });
    matiere['ANG'] = await add('matieres', { libelle: 'Anglais', coefficient: 3, cycleId: cyF2, dateCreation: now });
    matiere['PC'] = await add('matieres', { libelle: 'Physique-Chimie', coefficient: 3, cycleId: cyF2, dateCreation: now });
    matiere['SVT'] = await add('matieres', { libelle: 'SVT', coefficient: 2, cycleId: cyF2, dateCreation: now });
    matiere['HG'] = await add('matieres', { libelle: 'Histoire-Géographie', coefficient: 2, cycleId: cyF2, dateCreation: now });
    matiere['EPS'] = await add('matieres', { libelle: 'EPS', coefficient: 1, cycleId: cyF2, dateCreation: now });
    matiere['SPC'] = await add('matieres', { libelle: 'Langue & activités', coefficient: 2, cycleId: cyPresc, dateCreation: now });
    // Lycée (série scientifique)
    matiere['SPHYS'] = await add('matieres', { libelle: 'Mathématiques (S)', coefficient: 5, cycleId: cySecond, niveauId: niveaux['Tle'], dateCreation: now });
    matiere['SFS'] = await add('matieres', { libelle: 'Physique (S)', coefficient: 4, cycleId: cySecond, niveauId: niveaux['Tle'], dateCreation: now });

    // ---------- Enseignants + comptes ----------
    let ensCount = 0;
    async function mkEns2(nom, prenom, spec, taux, cap) {
      ensCount++;
      const userId = await add('users', {
        nom, prenom, username: nom.toLowerCase() + '.' + prenom.toLowerCase(), role: 'enseignant', actif: true,
        salt: AUTH_ENV.salt, passwordHash: AUTH_ENV.sha256('pass123' + AUTH_ENV.salt), dateCreation: now
      });
      const id = await add('enseignants', { nom, prenom, sexe: 'M', telephone: '+225 07 00 00 00', matricule: 'ENS' + String(ensCount).padStart(4, '0'), specialite: spec, tauxHoraire: taux || null, capaciteHebdo: cap || null, userId, dateCreation: now });
      return id;
    }
    const ensM = await mkEns2('Kouassi', 'Marc', 'Mathématiques', 2000, 24);
    const ensF = await mkEns2('Diarra', 'Fatou', 'Français', 1800, 22);
    const ensA = await mkEns2('N\'Guessan', 'Aline', 'Anglais', 1500, 24);
    const ensP = await mkEns2('Coulibaly', 'Paul', 'Physique-Chimie', 2000, 20);
    const ensS = await mkEns2('Bamba', 'Sita', 'SVT', 1500, 24);
    const ensH = await mkEns2('Toure', 'Hassan', 'Histoire-Géographie', 1600, 24);

    // ---------- Classes ----------
    const classes = {};
    classes['6A'] = await add('classes', { libelle: '6ème A', mention: '', niveauId: niveaux['6eme'], profPrincipalId: ensF, dateCreation: now });
    classes['6B'] = await add('classes', { libelle: '6ème B', mention: '', niveauId: niveaux['6eme'], profPrincipalId: ensM, dateCreation: now });
    classes['3A'] = await add('classes', { libelle: '3ème A', mention: 'Générale', niveauId: niveaux['3eme'], profPrincipalId: null, dateCreation: now });
    classes['TleS'] = await add('classes', { libelle: 'Terminale S', mention: 'Scientifique', niveauId: niveaux['Tle'], profPrincipalId: null, dateCreation: now });

    // ---------- Affectations (enseignant-matière-classe) ----------
    // Volumes (hebdo/mensuel/trimestriel) et durées de cours d'exemple.
    const V = (hebdo) => ({ hebdo: hebdo, mensuel: Math.round(hebdo * 4.33 * 100) / 100, trimestriel: Math.round(hebdo * 13 * 100) / 100 });
    async function aff(ens, mat, cl, volumes, durees) {
      return add('affectations', { enseignantId: ens, matiereId: mat, classeId: cl, volumes: volumes || null, durees: durees || null, dateCreation: now });
    }
    const affs = [];
    for (const clKey of ['6A', '6B']) {
      affs.push(await aff(ensM, matiere['MS'], classes[clKey], V(4), [1, 1.5]));
      affs.push(await aff(ensF, matiere['FR'], classes[clKey], V(4), [1]));
      affs.push(await aff(ensA, matiere['ANG'], classes[clKey], V(3), [1]));
      affs.push(await aff(ensP, matiere['PC'], classes[clKey], V(2.5), [1]));
      affs.push(await aff(ensS, matiere['SVT'], classes[clKey], V(2.5), [1]));
      affs.push(await aff(ensH, matiere['HG'], classes[clKey], V(2.5), [1, 1.5]));
    }
    for (const clKey of ['3A']) {
      affs.push(await aff(ensM, matiere['MS'], classes[clKey], V(4), [1, 1.5]));
      affs.push(await aff(ensF, matiere['FR'], classes[clKey], V(4), [1]));
      affs.push(await aff(ensP, matiere['PC'], classes[clKey], V(2.5), [1]));
      affs.push(await aff(ensS, matiere['SVT'], classes[clKey], V(2.5), [1]));
    }
    for (const clKey of ['TleS']) {
      affs.push(await aff(ensM, matiere['SPHYS'], classes[clKey], V(6), [1, 1.5]));
      affs.push(await aff(ensP, matiere['SFS'], classes[clKey], V(5), [1]));
    }

    // ---------- Élèves + comptes ----------
    const prenomsM = ['Yao', 'Kofi', 'Adama', 'Seydou', 'Moussa', 'Ibrahim', 'Aya', 'Awa', 'Mariam', 'Salif', 'Karim', 'Demba'];
    const prenomsF = ['Aïcha', 'Rokia', 'Fatoumata', 'Aminata', 'Kadiatou', 'Hadja', 'Mariama', 'Oumou', 'Fanta', 'Safiatou'];
    const nomsFam = ['Koné', 'Traoré', 'Soro', 'Bakayoko', 'Kouyaté', 'Dembélé', 'Sangaré', 'Diabaté', 'Cissé', 'Keita', 'Camara', 'Doumbia'];
    let matCount = 0;
    async function mkEleve(nom, prenom, sexe, classeId, dn, tuteur) {
      matCount++;
      const id = await add('eleves', {
        nom, prenom, sexe, classeId, matricule: 'MAT' + String(matCount).padStart(5, '0'),
        dateNaissance: dn, lieuNaissance: 'Abidjan',
        tuteur, telTuteur: '+225 07 00 00 01', userId: null, actif: true, dateCreation: now
      });
      return id;
    }
    const eleves6A = [];
    for (let i = 0; i < 6; i++) eleves6A.push(await mkEleve(nomsFam[i % nomsFam.length], prenomsM[i % prenomsM.length], 'M', classes['6A'], '2012-' + String(3 + (i % 8)).padStart(2, '0') + '-10', 'M. ' + nomsFam[i % nomsFam.length] + ' Père'));
    for (let i = 0; i < 4; i++) eleves6A.push(await mkEleve(nomsFam[(i + 2) % nomsFam.length], prenomsF[i % prenomsF.length], 'F', classes['6A'], '2013-05-1' + i, 'Mme ' + nomsFam[(i + 2) % nomsFam.length]));
    const eleves6B = [];
    for (let i = 0; i < 5; i++) eleves6B.push(await mkEleve(nomsFam[(i + 5) % nomsFam.length], prenomsM[(i + 4) % prenomsM.length], 'M', classes['6B'], '2012-07-1' + i, 'Tuteur ' + i));
    for (let i = 0; i < 3; i++) eleves6B.push(await mkEleve(nomsFam[(i + 1) % nomsFam.length], prenomsF[(i + 3) % prenomsF.length], 'F', classes['6B'], '2013-09-1' + i, 'Tuteur ' + i));
    const eleves3A = [];
    for (let i = 0; i < 4; i++) eleves3A.push(await mkEleve(nomsFam[(i + 8) % nomsFam.length], prenomsM[(i + 9) % prenomsM.length], 'M', classes['3A'], '2009-03-1' + i, 'Responsable ' + i));
    for (let i = 0; i < 2; i++) eleves3A.push(await mkEleve(nomsFam[(i + 6) % nomsFam.length], prenomsF[(i + 6) % prenomsF.length], 'F', classes['3A'], '2010-11-1' + i, 'Responsable ' + i));
    const elevesTle = [];
    for (let i = 0; i < 3; i++) elevesTle.push(await mkEleve(nomsFam[(i + 3) % nomsFam.length], prenomsM[(i + 2) % prenomsM.length], 'M', classes['TleS'], '2007-04-1' + i, 'Tuteur Tle'));
    elevesTle.push(await mkEleve('Keita', 'Assétou', 'F', classes['TleS'], '2008-01-15', 'Tonton Bamba'));

    // ---------- Emploi du temps (créneaux) ----------
    async function creneau(classeId, matiereId, enseignantId, salleId, jour, periode) {
      return add('emplois', { classeId, matiereId, enseignantId, salleId, jour, periode, dateCreation: now });
    }
    const matOf = (affKey) => matiere[affKey];
    // 6A : Lundi-Vendredi 2-3 créneaux
    await creneau(classes['6A'], matOf('MS'), ensM, salles['A1'], 0, 1);
    await creneau(classes['6A'], matOf('FR'), ensF, salles['A2'], 0, 2);
    await creneau(classes['6A'], matOf('MS'), ensM, salles['A1'], 1, 1);
    await creneau(classes['6A'], matOf('ANG'), ensA, salles['B1'], 1, 2);
    await creneau(classes['6A'], matOf('PC'), ensP, salles['LABO'], 2, 1);
    await creneau(classes['6A'], matOf('SVT'), ensS, salles['LABO'], 2, 2);
    await creneau(classes['6A'], matOf('HG'), ensH, salles['B2'], 3, 1);
    await creneau(classes['6A'], matOf('FR'), ensF, salles['A2'], 4, 1);
    await creneau(classes['TleS'], matOf('SPHYS'), ensM, salles['B1'], 0, 1);
    await creneau(classes['TleS'], matOf('SFS'), ensP, salles['LABO'], 0, 2);

    // ---------- Notes (devoir /20 + composition /40) pour trim 1 ----------
    function rand(min, max) { return Math.round((min + Math.random() * (max - min)) * 10) / 10; }
    const classeMats = {};
    for (const clKey of ['6A', '6B']) {
      classeMats[clKey] = [matiere['MS'], matiere['FR'], matiere['ANG'], matiere['PC'], matiere['SVT'], matiere['HG']];
    }
    classeMats['3A'] = [matiere['MS'], matiere['FR'], matiere['PC'], matiere['SVT']];
    classeMats['TleS'] = [matiere['SPHYS'], matiere['SFS']];
    const allClasses = { '6A': eleves6A, '6B': eleves6B, '3A': eleves3A, 'TleS': elevesTle };
    for (const clKey of Object.keys(allClasses)) {
      const mats = classeMats[clKey] || [];
      const cls = allClasses[clKey];
      for (const ev of cls) {
        for (const m of mats) {
          const valClasse = rand(6, 18);
          await add('notes', { eleveId: ev, matiereId: m, trimestreId: t1, type: 'classe', valeur: valClasse, dateCreation: now });
          const valCompo = rand(10, 36);
          await add('notes', { eleveId: ev, matiereId: m, trimestreId: t1, type: 'composition', valeur: valCompo, dateCreation: now });
        }
      }
    }

    // ---------- Types de frais (montant par classe) ----------
    const tfSco = await add('typesFrais', {
      libelle: 'Scolarité annuelle', periodicite: 'Annuel', dateCreation: now,
      montants: [
        { classeId: classes['6A'], montant: 60000 },
        { classeId: classes['6B'], montant: 60000 },
        { classeId: classes['3A'], montant: 50000 },
        { classeId: classes['TleS'], montant: 55000 }
      ]
    });
    const tfInsc = await add('typesFrais', {
      libelle: "Frais d'inscription", periodicite: 'Fixe', dateCreation: now,
      montants: [
        { classeId: classes['6A'], montant: 15000 },
        { classeId: classes['6B'], montant: 15000 },
        { classeId: classes['3A'], montant: 15000 },
        { classeId: classes['TleS'], montant: 15000 }
      ]
    });
    const tfCan = await add('typesFrais', {
      libelle: 'Cantine (mois)', periodicite: 'Par mois', dateCreation: now,
      montants: [
        { classeId: classes['6A'], montant: 8000 },
        { classeId: classes['6B'], montant: 8000 },
        { classeId: classes['3A'], montant: 8000 },
        { classeId: classes['TleS'], montant: 8000 }
      ]
    });

    // ---------- Encaissements (avec paiement par tranches) ----------
    const allPayeurs = eleves6A.concat(eleves6B, eleves3A, elevesTle);
    const encIds = [];
    let iEnc = 0;
    for (const ev of allPayeurs.slice(0, 14)) {
      iEnc++;
      if (iEnc % 3 === 0) await add('fraisEncaissements', { eleveId: ev, typeFraisId: tfInsc, montant: 15000, date: (annee) + '-10-0' + (iEnc % 7 + 1), mode: iEnc % 2 ? 'Espèces' : 'Mobile Money', note: '', dateCreation: now });
      // Scolarité payée en tranches : entier pour la plupart, moitié (partiel) pour certains,
      // rien (impayé) pour d'autres, afin d'illustrer les soldes.
      if (iEnc % 5 === 0) {
        // aucun paiement de scolarité (impayé)
      } else if (iEnc % 4 === 0) {
        await add('fraisEncaissements', { eleveId: ev, typeFraisId: tfSco, montant: 30000, date: (annee) + '-10-1' + (iEnc % 9), mode: iEnc % 2 ? 'Espèces' : 'Mobile Money', note: 'Scolarité (1re tranche)', dateCreation: now });
      } else {
        await add('fraisEncaissements', { eleveId: ev, typeFraisId: tfSco, montant: 60000, date: (annee) + '-10-1' + (iEnc % 9), mode: iEnc % 2 ? 'Espèces' : 'Mobile Money', note: 'Scolarité', dateCreation: now });
      }
      if (iEnc % 2 === 0) await add('fraisEncaissements', { eleveId: ev, typeFraisId: tfCan, montant: 8000, date: (annee) + '-11-0' + (iEnc % 7 + 1), mode: 'Espèces', note: 'Cantine', dateCreation: now });
    }

    // ---------- Salaires ----------
    await add('salaires', { enseignantId: ensM, mois: 10, annee, montant: 150000, date: (annee) + '-10-31', statut: 'paye', note: 'Salaire octobre', dateCreation: now });
    await add('salaires', { enseignantId: ensF, mois: 10, annee, montant: 145000, date: (annee) + '-10-31', statut: 'paye', note: 'Salaire octobre', dateCreation: now });
    await add('salaires', { enseignantId: ensP, mois: 10, annee, montant: 160000, date: (annee) + '-10-31', statut: 'paye', note: 'Salaire octobre', dateCreation: now });
    await add('salaires', { enseignantId: ensA, mois: 11, annee, montant: 130000, date: (annee) + '-11-30', statut: 'paye', note: 'Salaire novembre', dateCreation: now });

    // ---------- Pointage des heures de cours (mois courant) ----------
    const pd = new Date();
    const pmm = String(pd.getMonth() + 1).padStart(2, '0');
    const pyy = pd.getFullYear();
    const po = (enseignantId, matiereId, classeId, day, duree, effectue, motif) =>
      add('pointages', { enseignantId, matiereId, classeId, date: pyy + '-' + pmm + '-' + String(day).padStart(2, '0'), duree, effectue, motif: motif || '', dateCreation: now });
    await po(ensM, matiere['MS'], classes['6A'], 1, 1, true, '');
    await po(ensM, matiere['MS'], classes['6A'], 2, 1.5, true, '');
    await po(ensM, matiere['MS'], classes['6B'], 1, 1, true, '');
    await po(ensM, matiere['SPHYS'], classes['TleS'], 3, 1.5, false, 'Absence enseignant');
    await po(ensF, matiere['FR'], classes['6A'], 1, 1, true, '');
    await po(ensF, matiere['FR'], classes['6B'], 2, 1, true, '');
    await po(ensA, matiere['ANG'], classes['6A'], 2, 1, false, 'Grève');
    await po(ensA, matiere['ANG'], classes['6B'], 3, 1, true, '');
    await po(ensP, matiere['PC'], classes['6A'], 3, 1, true, '');
    await po(ensP, matiere['SFS'], classes['TleS'], 4, 1, true, '');
    await po(ensS, matiere['SVT'], classes['6A'], 4, 1, true, '');
    await po(ensH, matiere['HG'], classes['6A'], 4, 1.5, true, '');
    await po(ensH, matiere['HG'], classes['6B'], 5, 1.5, false, 'Jour férié');

    // ---------- Personnel (employés, contrats) ----------
    const empId = [];
    const mkEmp = async (nom, prenom, poste, couverture, typeContrat, salaireBase, primes, statut) => {
      const id = await add('employes', {
        nom, prenom, sexe: 'M', telephone: '+225 05 00 00 00', email: nom.toLowerCase() + '@ecole.ci',
        dateEmbauche: (annee - 2) + '-09-01', poste, couverture, typeContrat,
        matricule: 'EMP' + String(empId.length + 1).padStart(3, '0'), salaireBase, primes, statut,
        dateCreation: now
      });
      empId.push(id);
      return id;
    };
    const empSecr = await mkEmp('Konan', 'Awa', 'Secrétaire', 'Toutes les couches', 'CDI', 120000, { transport: 15000, logement: 0, responsabilite: 10000, autres: 0 }, 'actif');
    const empBur = await mkEmp('Yao', 'Christian', 'Bursar / Comptable', 'Toutes les couches', 'CDI', 150000, { transport: 10000, logement: 0, responsabilite: 15000, autres: 0 }, 'actif');
    const empGard = await mkEmp('Kouadio', 'Ernest', 'Gardien', 'Préscolaire', 'CDD', 60000, { transport: 5000, logement: 0, responsabilite: 0, autres: 0 }, 'actif');
    const empCui = await mkEmp('Bamba', 'Mariam', 'Cuisinière', 'Primaire', 'CDD', 70000, { transport: 5000, logement: 0, responsabilite: 0, autres: 0 }, 'conge');
    const empDir = await mkEmp('N\'Dri', 'Patrice', 'Directeur des études', 'Supérieur', 'CDI', 250000, { transport: 20000, logement: 50000, responsabilite: 30000, autres: 0 }, 'actif');

    // ---------- Paies du personnel ----------
    await add('paies', { employeId: empSecr, mois: 11, annee, montant: 145000, date: (annee) + '-11-30', statut: 'paye', dateCreation: now });
    await add('paies', { employeId: empBur, mois: 11, annee, montant: 175000, date: (annee) + '-11-30', statut: 'paye', dateCreation: now });
    await add('paies', { employeId: empGard, mois: 11, annee, montant: 65000, date: (annee) + '-11-30', statut: 'attente', dateCreation: now });
    await add('paies', { employeId: empDir, mois: 11, annee, montant: 350000, date: (annee) + '-11-30', statut: 'paye', dateCreation: now });

    // ---------- Dépenses & charges ----------
    await add('depenses', { libelle: 'Facture d\u2019électricité', categorie: 'Électricité & eau', montant: 45000, date: (annee) + '-10-05', mode: 'Espèces', beneficiaire: 'CI-Energie', note: 'Facture octobre', dateCreation: now });
    await add('depenses', { libelle: 'Internet fibre', categorie: 'Internet & téléphone', montant: 25000, date: (annee) + '-10-10', mode: 'Mobile Money', beneficiaire: 'Orange CI', note: 'Abonnement mensuel', dateCreation: now });
    await add('depenses', { libelle: 'Achat de craies & bics', categorie: 'Fournitures & matériel', montant: 30000, date: (annee) + '-10-12', mode: 'Espèces', beneficiaire: 'Papeterie du Collège', note: '', dateCreation: now });
    await add('depenses', { libelle: 'Carburant générateur', categorie: 'Transport & carburant', montant: 38000, date: (annee) + '-11-02', mode: 'Chèque', beneficiaire: 'Station Total', note: '', dateCreation: now });
    await add('depenses', { libelle: 'Réparation toiture', categorie: 'Réparations & maintenance', montant: 85000, date: (annee) + '-11-08', mode: 'Espèces', beneficiaire: 'Entreprise BTP+', note: '', dateCreation: now });
    await add('depenses', { libelle: 'Prime de rentrée (personnel)', categorie: 'Salaires & primes', montant: 120000, date: (annee) + '-11-15', mode: 'Espèces', beneficiaire: 'Personnel', note: '', dateCreation: now });

    // ---------- Cycles complémentaires : PRÉSCOLAIRE, PRIMAIRE, SUPÉRIEUR ----------
    const cySup = await add('cycles', { libelle: 'Supérieur', description: 'Licence universitaire (L1–L3)', enseignantPrincipal: false, dateCreation: now });
    const nivCM1 = niveaux['CM1'];
    const nivM2 = niveaux['M2'];
    const nivL1 = await add('niveaux', { libelle: 'Licence 1', cycleId: cySup, dateCreation: now });
    classes['CM1A'] = await add('classes', { libelle: 'CM1 A', mention: 'Générale', niveauId: nivCM1, profPrincipalId: null, dateCreation: now });
    classes['GSA'] = await add('classes', { libelle: 'Grande Section A', mention: '', niveauId: nivM2, profPrincipalId: null, dateCreation: now });
    classes['L1'] = await add('classes', { libelle: 'Licence 1 Info', mention: 'Informatique & Réseaux', niveauId: nivL1, profPrincipalId: null, dateCreation: now });

    // Matières (UE) du Supérieur
    matiere['ALGO'] = await add('matieres', { libelle: 'Algorithmique & Programmation', coefficient: 4, cycleId: cySup, dateCreation: now });
    matiere['BDD'] = await add('matieres', { libelle: 'Bases de données', coefficient: 3, cycleId: cySup, dateCreation: now });
    matiere['RES'] = await add('matieres', { libelle: 'Réseaux & Systèmes', coefficient: 3, cycleId: cySup, dateCreation: now });

    // Enseignant du Supérieur
    const ensY = await mkEns2('Kama', 'Idrissa', 'Informatique', 3500, 18);

    // Affectations des nouvelles classes
    await aff(ensF, matiere['FR'], classes['CM1A'], V(5), [1]);
    await aff(ensM, matiere['MS'], classes['CM1A'], V(4), [1]);
    await aff(ensA, matiere['ANG'], classes['CM1A'], V(3), [1]);
    await aff(ensF, matiere['SPC'], classes['GSA'], V(6), [1]);
    await aff(ensY, matiere['ALGO'], classes['L1'], V(4), [1.5]);
    await aff(ensY, matiere['BDD'], classes['L1'], V(3), [1.5]);
    await aff(ensY, matiere['RES'], classes['L1'], V(3), [1.5]);

    // Élèves des nouvelles classes
    const elevesCM1 = [];
    for (let i = 0; i < 5; i++) elevesCM1.push(await mkEleve(nomsFam[(i + 4) % nomsFam.length], prenomsM[(i + 6) % prenomsM.length], 'M', classes['CM1A'], '2013-0' + (1 + (i % 8)) + '-1' + i, 'Tuteur CM1'));
    for (let i = 0; i < 3; i++) elevesCM1.push(await mkEleve(nomsFam[(i + 9) % nomsFam.length], prenomsF[(i + 2) % prenomsF.length], 'F', classes['CM1A'], '2014-03-1' + i, 'Tuteur CM1'));
    const elevesGSA = [];
    for (let i = 0; i < 4; i++) elevesGSA.push(await mkEleve(nomsFam[(i + 7) % nomsFam.length], prenomsF[(i + 4) % prenomsF.length], 'F', classes['GSA'], '2018-03-1' + i, 'Tuteur GS'));
    const elevesL1 = [];
    for (let i = 0; i < 5; i++) elevesL1.push(await mkEleve(nomsFam[(i + 2) % nomsFam.length], prenomsM[(i + 5) % prenomsM.length], (i % 2 ? 'F' : 'M'), classes['L1'], '2005-05-1' + i, 'Tuteur L1'));

    // Emploi du temps des nouvelles classes
    await creneau(classes['CM1A'], matiere['FR'], ensF, salles['A2'], 0, 1);
    await creneau(classes['CM1A'], matiere['MS'], ensM, salles['A1'], 1, 1);
    await creneau(classes['CM1A'], matiere['ANG'], ensA, salles['B1'], 2, 1);
    await creneau(classes['GSA'], matiere['SPC'], ensF, salles['A1'], 0, 2);
    await creneau(classes['L1'], matiere['ALGO'], ensY, salles['INFO'], 1, 2);
    await creneau(classes['L1'], matiere['BDD'], ensY, salles['INFO'], 3, 1);
    await creneau(classes['L1'], matiere['RES'], ensY, salles['INFO'], 4, 1);

    // Notes (devoir /20 + composition /40) du trim 1 pour les nouvelles classes,
    // réparties sur le trimestre 2 afin d'illustrer les bulletins de plusieurs trimestres.
    const classeMats2 = {};
    classeMats2['CM1A'] = [matiere['FR'], matiere['MS'], matiere['ANG']];
    classeMats2['GSA'] = [matiere['SPC']];
    classeMats2['L1'] = [matiere['ALGO'], matiere['BDD'], matiere['RES']];
    const allClasses2 = { 'CM1A': elevesCM1, 'GSA': elevesGSA, 'L1': elevesL1 };
    for (const clKey of Object.keys(allClasses2)) {
      const mats = classeMats2[clKey] || [];
      const cls = allClasses2[clKey];
      for (const ev of cls) {
        for (const m of mats) {
          await add('notes', { eleveId: ev, matiereId: m, trimestreId: t2, type: 'classe', valeur: rand(6, 18), dateCreation: now });
          await add('notes', { eleveId: ev, matiereId: m, trimestreId: t2, type: 'composition', valeur: rand(10, 36), dateCreation: now });
        }
      }
    }

    // Frais étendus aux nouvelles classes
    for (const pair of [[tfSco, { 'CM1A': 45000, 'GSA': 30000, 'L1': 120000 }], [tfInsc, { 'CM1A': 10000, 'GSA': 8000, 'L1': 25000 }], [tfCan, { 'CM1A': 8000, 'GSA': 5000 }]]) {
      const tfObj = await DB.get('typesFrais', pair[0]);
      for (const clKey of Object.keys(pair[1])) tfObj.montants.push({ classeId: classes[clKey], montant: pair[1][clKey] });
      await DB.put('typesFrais', tfObj);
    }

    // Encaissements échantillons pour les nouvelles classes
    let iX = 0;
    for (const ev of elevesCM1.concat(elevesGSA, elevesL1.slice(0, 3))) {
      if (iX >= 8) break;
      iX++;
      const tfX = iX % 2 ? tfSco : tfInsc;
      const mtX = iX % 2 ? 45000 : 10000;
      await add('fraisEncaissements', { eleveId: ev, typeFraisId: tfX, montant: mtX, date: (annee) + '-11-1' + (iX % 9), mode: iX % 2 ? 'Espèces' : 'Mobile Money', note: 'Paiement (échantillon)', dateCreation: now });
    }

    // Élève dispensé des frais + élève cas social (seul les frais cochés lui sont dus)
    const dispEleve = eleves6A[0];
    if (dispEleve) {
      const d = await DB.get('eleves', dispEleve);
      d.dispenseFrais = true;
      await DB.put('eleves', d);
    }
    const socialEleve = eleves3A[1];
    if (socialEleve) {
      const s = await DB.get('eleves', socialEleve);
      s.typeEleve = 'cas_social';
      s.fraisTypesIds = [tfInsc];
      await DB.put('eleves', s);
    }

    return {
      anneeId, trimestres: { t1, t2, t3 }, cycles: { cyPresc, cyF1, cyF2, cySecond, cySup },
      niveaux, salles, matiere, enseignants: { ensM, ensF, ensA, ensP, ensS, ensH, ensY },
      classes, eleves: { eleves6A, eleves6B, eleves3A, elevesTle, elevesCM1, elevesGSA, elevesL1 },
      typesFrais: { tfSco, tfInsc, tfCan }, encIds
    };
  }

  // Efface la base de l'école courante puis charge le jeu de données d'exemple.
  async function resetAndPopulate() {
    const cur = DB.name();
    await DB.wipe();
    DB.openSchool(cur);
    await DB.ready();
    return populate();
  }

  return { populate: populate, resetAndPopulate: resetAndPopulate };
})();
