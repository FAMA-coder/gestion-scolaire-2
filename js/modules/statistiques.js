/* ============================================================
   statistiques.js — Statistiques & Analyses détaillées
   Structures · Scolaires · Pédagogiques · Financières ·
   Administratives · Fréquences (avec interprétations et
   propositions de solutions)
   ============================================================ */
App.register('statistiques', {
  title: 'Statistiques',
  navLabel: 'Statistiques',
  icon: 'Σ',
  group: 'Général',
  perm: 'statistiques.view',

  async render(root) {
    try { const tt = document.getElementById('topbar-title'); if (tt) tt.textContent = 'Statistiques & Analyses'; } catch (e) { /* ignore */ }

    const [d, pointages, employes, paies, depenses, typesFrais, enc,
      salaires, journal, users] = await Promise.all([
        Data.common(),
        DB.getAll('pointages'),
        DB.getAll('employes'),
        DB.getAll('paies'),
        DB.getAll('depenses'),
        DB.getAll('typesFrais'),
        DB.getAll('fraisEncaissements'),
        DB.getAll('salaires'),
        DB.getAll('journal'),
        DB.getAll('users')
      ]);
    const { cycles, salles, niveaux, classes, matieres, enseignants, affectations,
      eleves, annees, trimestres, cours, notes } = d;

    // ---- Helpers locaux ----
    const eff = eleves.length;
    const pct = (p, t) => (t > 0 ? (Math.round((p / t) * 1000) / 10).toString().replace('.', ',') + ' %' : '—');
    const hFmt = (v) => (Number(v) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' h';
    const pctFmt = (v) => (Math.round(v * 1000) / 10).toString().replace('.', ',') + ' %';
    const lvlBadge = (l) => l === 'ok' ? 'badge-ok' : (l === 'warn' ? 'badge-warn' : 'badge-danger');
    const lvlTxt = (l) => l === 'ok' ? 'Satisfaisant' : (l === 'warn' ? 'À surveiller' : 'Critique');
    const classeOf = (e) => classes.find((c) => c.id === e.classeId);
    const nvOf = (cl) => (cl ? niveaux.find((n) => n.id === cl.niveauId) : null);
    const cycleOfClasse = (cl) => { const n = nvOf(cl); return n ? n.cycleId : null; };
    const barH = (label, value, total, color) => {
      const w = total > 0 ? Math.max(6, Math.round((value / total) * 150)) : 6;
      return '<div class="col"><div class="fill" style="height:' + w + 'px;background:' + color + '"></div><b>' + value + '</b><span>' + UI.esc(label) + '</span></div>';
    };

    // ---- Cumuls de base ----
    const totalEnc = enc.reduce((s, x) => s + Number(x.montant || 0), 0);
    const totalDep = depenses.reduce((s, x) => s + Number(x.montant || 0), 0);
    const totalPaies = paies.filter((p) => p.statut === 'paye').reduce((s, x) => s + Number(x.montant || 0), 0);
    const totalSal = salaires.filter((s) => s.statut === 'paye').reduce((x, v) => x + Number(v.montant || 0), 0);
    const totalPrevH = affectations.reduce((s, a) => s + Number(a.volumeH || 0), 0);
    const totalDoH = pointages.filter((p) => p.effectue === true).reduce((s, p) => s + Number(p.duree || 0), 0);
    const payeurs = new Set(enc.map((x) => x.eleveId));

    // ---- Frais : prévu / encaissé par type ----
    const fraisParType = typesFrais.map((tf) => {
      let att = 0;
      eleves.forEach((e) => {
        const cl = classeOf(e);
        const mt = Frais.montantPour(tf, e.classeId, cl && cl.niveauId, e);
        if (mt && mt > 0) att += mt;
      });
      const paid = enc.filter((x) => x.typeFraisId === tf.id).reduce((s, x) => s + Number(x.montant || 0), 0);
      return { tf: tf, att: att, paid: paid, rec: att > 0 ? (paid / att) * 100 : null };
    });
    const attTotal = fraisParType.reduce((s, x) => s + x.att, 0);
    const tauxRecouv = attTotal > 0 ? (totalEnc / attTotal) * 100 : null;

    // ---- Moyennes indicatives par élève puis par classe ----
    const moyEleve = {};
    notes.forEach((n) => {
      const vals = [Number(n.devoir1), Number(n.devoir2), Number(n.composition)]
        .filter((v) => isFinite(v) && v > 0);
      if (!vals.length) return;
      (moyEleve[n.eleveId] = moyEleve[n.eleveId] || []).push(vals.reduce((s, v) => s + v, 0) / vals.length);
    });
    const renVO = (e) => moyEleve[e.id] && moyEleve[e.id].length
      ? moyEleve[e.id].reduce((s, v) => s + v, 0) / moyEleve[e.id].length : null;
    const moyClasse = classes.map((cl) => {
      const arr = eleves.filter((e) => e.classeId === cl.id).map(renVO).filter((v) => v != null);
      const moy = arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
      const sous10 = arr.filter((v) => v < 10).length;
      return { cl: cl, effectif: eleves.filter((e) => e.classeId === cl.id).length, notes: arr.length, moy: moy, sous10: sous10 };
    });

    // ---- Personnel administratif ----
    const admActifs = employes.filter((e) => e.statut === 'actif' || e.statut === 'conge');
    const masseSal = admActifs.reduce((s, e) => s + (typeof admBrut === 'function' ? admBrut(e) : (Number(e.salaireBase) || 0)), 0);

    // ---- Répartitions ----
    const byNiveau = niveaux.map((n) => {
      const clsIds = classes.filter((c) => c.niveauId === n.id).map((c) => c.id);
      const el = eleves.filter((e) => clsIds.indexOf(e.classeId) >= 0);
      return { n: n, count: el.length, boys: el.filter((e) => e.sexe === 'M').length, girls: el.filter((e) => e.sexe === 'F').length };
    }).filter((x) => x.count > 0);
    const byCycle = cycles.map((c) => ({ c: c, count: eleves.filter((e) => { const cl = classeOf(e); return cl && cycleOfClasse(cl) === c.id; }).length }));
    const statutsEleves = [
      { k: 'Étatique', v: eleves.filter((e) => e.typeEleve === 'etatique').length },
      { k: 'Privé', v: eleves.filter((e) => e.typeEleve === 'prive').length },
      { k: 'Cas social', v: eleves.filter((e) => e.typeEleve === 'cas_social').length },
      { k: 'Non précisé', v: eleves.filter((e) => !e.typeEleve).length }
    ];
    const dispenses = eleves.filter((e) => e.dispenseFrais === true).length;
    const usersParRole = users.reduce((acc, u) => { const r = u.role || '?'; acc[r] = (acc[r] || 0) + 1; return acc; }, {});
    const affectationSansPointage = affectations.filter((a) =>
      !pointages.some((p) => p.enseignantId === a.enseignantId && p.matiereId === a.matiereId && p.classeId === a.classeId));
    const elevesSansNotes = eleves.filter((e) => !moyEleve[e.id] || !moyEleve[e.id].length).length;

    // ---- Fréquences : distribution des classes par tranche d'effectif ----
    const tranches = [
      { t: '0 à 9', v: 0 }, { t: '10 à 19', v: 0 }, { t: '20 à 29', v: 0 },
      { t: '30 à 39', v: 0 }, { t: '40 à 49', v: 0 }, { t: '50 et plus', v: 0 }
    ];
    classes.forEach((cl) => {
      const n = eleves.filter((e) => e.classeId === cl.id).length;
      if (n < 10) tranches[0].v++;
      else if (n < 20) tranches[1].v++;
      else if (n < 30) tranches[2].v++;
      else if (n < 40) tranches[3].v++;
      else if (n < 50) tranches[4].v++;
      else tranches[5].v++;
    });
    // ---- Indicateurs, interprétations et propositions ----
    const notés = moyClasse.reduce((s, x) => s + x.notes, 0);
    const sous10 = moyClasse.reduce((s, x) => s + x.sous10, 0);
    const charge = classes.length ? eff / classes.length : 0;
    const tauxReal = totalPrevH > 0 ? (totalDoH / totalPrevH) * 100 : null;
    const couvPts = affectations.length ? ((affectations.length - affectationSansPointage.length) / affectations.length) * 100 : null;
    const tauxNotes = eff ? (elevesSansNotes / eff) * 100 : null;
    const solde = totalEnc + totalPaies + totalSal - totalDep;

    const indicateurs = [];
    indicateurs.push({
      titre: 'Charge moyenne par classe',
      valeur: pctFmt(charge) + ' par classe',
      lvl: charge >= 45 ? 'bad' : (charge >= 30 ? 'warn' : 'ok'),
      interp: charge >= 45 ? 'Des classes très chargées (plus de 45 élèves) dégradent l\'encadrement et les conditions d\'enseignement.'
        : (charge >= 30 ? 'La charge par classe approche la limite confortable : le suivi individuel risque de diminuer.'
          : 'La charge moyenne par classe reste confortable pour un encadrement de qualité.'),
      sol: charge >= 30 ? 'Rééquilibrer les effectifs entre divisions existantes et, si nécessaire, ouvrir une nouvelle division ou une classe supplémentaire.'
        : 'Maintenir l\'équilibre actuel en surveillant l\'évolution des admissions.'
    });
    indicateurs.push({
      titre: 'Taux de recouvrement des frais scolaires',
      valeur: tauxRecouv == null ? 'aucun frais défini' : pctFmt(tauxRecouv),
      lvl: tauxRecouv == null ? 'warn' : (tauxRecouv < 50 ? 'bad' : (tauxRecouv < 80 ? 'warn' : 'ok')),
      interp: tauxRecouv == null ? 'Aucun type de frais n\'est encore configuré : le suivi financier ne peut pas s\'appliquer.'
        : (tauxRecouv < 50 ? 'Moins de la moitié des frais prévus est encaissée : la trésorerie de l\'établissement est menacée.'
          : (tauxRecouv < 80 ? 'Une part notable des frais reste en attente de paiement.'
            : 'Le recouvrement des frais est sain et sécurise le budget.')),
      sol: (tauxRecouv != null && tauxRecouv < 80) ? 'Relancer par classe les familles débitrices, envoyer des rappels écrits, proposer un échelonnement des paiements et prioriser les débiteurs via le suivi des paiements.'
        : 'Poursuivre le suivi régulier dans le module Frais scolaires.'
    });
    indicateurs.push({
      titre: 'Réalisation des volumes horaires (pointage)',
      valeur: totalPrevH > 0 ? pctFmt(tauxReal) + ' (' + hFmt(totalDoH) + ' / ' + hFmt(totalPrevH) + ')' : 'aucune séance suivie',
      lvl: tauxReal == null ? 'warn' : (tauxReal < 70 ? 'bad' : (tauxReal < 90 ? 'warn' : 'ok')),
      interp: tauxReal == null ? 'Le pointage n\'a pas encore été utilisé : impossible d\'évaluer l\'effectivité des cours.'
        : (tauxReal < 70 ? 'Moins de 70 % des heures prévues sont effectivement réalisées : les programmes risquent de ne pas être bouclés.'
          : (tauxReal < 90 ? 'Une partie des heures prévues n\'est pas réalisée, ce qui retarde la progression pédagogique.'
            : 'Les cours sont réalisés conformément aux volumes horaires programmés.')),
      sol: 'Utiliser le module « Contrôle des heures » pour identifier les absences répétées, réorganiser l\'emploi du temps et prévoir des remplaçants afin de garantir la continuité pédagogique.'
    });
    indicateurs.push({
      titre: 'Niveau des résultats (moyenne inférieure à 10/20)',
      valeur: notés ? pct(sous10, notés) + ' des notes sous la moyenne' : 'aucune note saisie',
      lvl: !notés ? 'warn' : ((sous10 / notés) > 0.3 ? 'bad' : ((sous10 / notés) > 0.2 ? 'warn' : 'ok')),
      interp: !notés ? 'Aucune évaluation n\'est encore saisie : les résultats ne peuvent pas être analysés.'
        : ((sous10 / notés) > 0.3 ? 'Plus d\'un tiers des élèves se situe sous la moyenne : les acquis fondamentaux sont fragiles.'
          : ((sous10 / notés) > 0.2 ? 'Une part significative des élèves reste sous la moyenne, à accompagner en priorité.'
            : 'Les résultats globaux sont satisfaisants, la majorité des élèves atteignant la moyenne.')),
      sol: (notés && sous10 > 0) ? 'Mettre en place des séances de soutien ciblées, des cours de renforcement dans les matières concernées et des programmes de rattrapage avant chaque composition.'
        : 'Maintenir la dynamique et valoriser les bons résultats.'
    });
    indicateurs.push({
      titre: 'Suivi du pointage des enseignants',
      valeur: couvPts == null ? 'aucune affectation' : pctFmt(couvPts) + ' des affectations suivies',
      lvl: couvPts == null ? 'warn' : (couvPts < 50 ? 'bad' : (couvPts < 80 ? 'warn' : 'ok')),
      interp: couvPts == null ? 'Aucune affectation n\'est enregistrée : le volume horaire ne peut pas être suivi.'
        : (couvPts < 50 ? 'La majorité des affectations n\'a jamais été pointée : le contrôle des heures est insuffisant.'
          : (couvPts < 80 ? 'Un nombre non négligeable d\'affectations n\'a jamais été pointé.'
            : 'Les heures de cours sont correctement suivies par le pointage.')),
      sol: 'Instaurer un pointage systématique quotidien des séances et rapprocher chaque mois les pointages du contrôle des volumes horaires pour détecter les dérives.'
    });
    indicateurs.push({
      titre: 'Rétention des élèves (élèves sans aucune note saisie)',
      valeur: eff ? pctFmt(tauxNotes) + ' des élèves sans note' : 'aucun élève',
      lvl: !eff ? 'ok' : (tauxNotes > 40 ? 'bad' : (tauxNotes > 20 ? 'warn' : 'ok')),
      interp: !eff ? 'Aucun élève enregistré.'
        : (tauxNotes > 40 ? 'Une forte proportion d\'élèves n\'a encore aucune évaluation saisie : risque d\'abandon ou de saisie incomplète.'
          : (tauxNotes > 20 ? 'Une partie des élèves n\'a encore aucune note : la saisie est incomplète.'
            : 'La quasi-totalité des élèves a au moins une évaluation saisie.')),
      sol: 'Vérifier périodiquement la saisie des notes par classe, fixer des échéanciers de devoirs et contrôler les classes où de nombreux élèves restent sans évaluation.'
    });
    indicateurs.push({
      titre: 'Équilibre financier (cumul suivi)',
      valeur: UI.money(solde),
      lvl: solde < 0 ? 'bad' : 'ok',
      interp: solde < 0 ? 'Les dépenses et rémunérations enregistrées dépassent les encaissements suivis : la période présente un déficit de trésorerie.'
        : 'Les encaissements suivis couvrent les dépenses et rémunérations enregistrées (les masses salariales étant estimées au mois).',
      sol: solde < 0 ? 'Réviser les dépenses courantes, prioriser le recouvrement des frais, négocier les charges fixes et suivre mensuellement la trésorerie.'
        : 'Garantir la trésorerie en maintenant le rythme de recouvrement et en maîtrisant les charges.'
    });

    // ---- Composants HTML ----
    const indHtml = indicateurs.map((i) =>
      '<div class="bar"><div class="bar-head"><div class="card-title">' + UI.esc(i.titre) +
        ' <span class="badge ' + lvlBadge(i.lvl) + '">' + lvlTxt(i.lvl) + '</span></div></div>' +
      '<div class="stat-label"><b>Valeur :</b> ' + UI.esc(i.valeur) + '</div>' +
      '<div class="stat-label" style="margin-top:6px"><b>Interprétation :</b> ' + UI.esc(i.interp) + '</div>' +
      '<div class="stat-label" style="margin-top:6px"><b>Proposition :</b> <span class="card-sub">' + UI.esc(i.sol) + '</span></div></div>'
    ).join('');

    const cycleBar = byCycle.map((x) => barH(UI.esc(x.c.libelle), x.count, eff, '#2563eb')).join('') || '<div class="empty">Aucun élève</div>';
    const sexBar = eff ? barH('Garçons', eleves.filter((e) => e.sexe === 'M').length, eff, '#2563eb') +
      barH('Filles', eleves.filter((e) => e.sexe === 'F').length, eff, '#db2777') +
      barH('Non précisé', eleves.length - eleves.filter((e) => e.sexe === 'M').length - eleves.filter((e) => e.sexe === 'F').length, eff, '#94a3b8') : '';

    const html =
      '<div class="grid" style="margin-bottom:16px">' +
        '<div class="stat-card"><div class="stat-icon" style="background:#2563eb">E</div>' +
          '<div class="stat-label">Élèves</div><div class="stat-value">' + eff + '</div></div>' +
        '<div class="stat-card"><div class="stat-icon" style="background:#0891b2">P</div>' +
          '<div class="stat-label">Sous la moyenne (&lt;10)</div><div class="stat-value">' + sous10 + '</div></div>' +
        '<div class="stat-card"><div class="stat-icon" style="background:#16a34a">F</div>' +
          '<div class="stat-label">Taux de recouvrement</div><div class="stat-value">' + (tauxRecouv == null ? '—' : pctFmt(tauxRecouv)) + '</div></div>' +
        '<div class="stat-card"><div class="stat-icon" style="background:#d97706">Σ</div>' +
          '<div class="stat-label">Réalisation des heures</div><div class="stat-value">' + (tauxReal == null ? '—' : pctFmt(tauxReal)) + '</div></div>' +
      '</div>' +

      '<div class="bar"><div class="card-title">1 · Structures de l\'établissement</div>' +
        '<div class="stat-label card-sub" style="margin:-4px 0 8px">Infrastructures et paramétrage système enregistrés.</div>' +
        '<div class="table-wrap">' + UI.table(['Rubrique', 'Total'], [
          ['Cycles pédagogiques', cycles.length],
          ['Niveaux', niveaux.length],
          ['Classes / divisions', classes.length],
          ['Salles de classe', salles.length],
          ['Matières enseignées', matieres.length],
          ['Années scolaires', annees.length],
          ['Trimestres configurés', trimestres.length]
        ].map((r) => '<tr><td>' + UI.esc(r[0]) + '</td><td class="num"><b>' + r[1] + '</b></td></tr>').join('')) + '</div></div>' +

      '<div class="bar"><div class="card-title">2 · Effectifs scolaires</div>' +
        '<div class="chart-bar">' + cycleBar + '</div>' +
        '<div class="card-title" style="margin-top:14px;font-size:14px">Répartition par sexe</div>' +
        '<div class="chart-bar">' + sexBar + '</div>' +
        '<div class="card-title" style="margin-top:14px;font-size:14px">Répartition par niveau</div>' +
        '<div class="table-wrap">' + UI.table(['Niveau', 'Effectif', 'Garçons', 'Filles'],
          byNiveau.map((x) => '<tr><td>' + UI.esc(x.n.libelle) + '</td><td class="num"><b>' + x.count + '</b></td><td class="num">' + x.boys + '</td><td class="num">' + x.girls + '</td></tr>').join('') ||
          UI.empty(4)) + '</div>' +
        '<div class="card-title" style="margin-top:14px;font-size:14px">Statut des élèves</div>' +
        '<div class="table-wrap">' + UI.table(['Statut', 'Effectif'],
          statutsEleves.map((x) => '<tr><td>' + UI.esc(x.k) + '</td><td class="num">' + x.v + '</td></tr>').join('')) +
          '</div>' + 
        (dispenses ? '<div class="stat-label" style="margin-top:8px"><span class="badge badge-gray">' + dispenses + ' élève(s) dispensé(s) des frais</span></div>' : '') +
      '</div>' +

      '<div class="bar"><div class="card-title">3 · Données pédagogiques</div>' +
        '<div class="table-wrap">' + UI.table(['Classe', 'Effectif', 'Élèves notés', 'Moyenne indicative', 'Sous la moyenne'],
          moyClasse.map((x) => '<tr><td>' + UI.esc(Data.classeLabel(x.cl)) + '</td><td class="num">' + x.effectif + '</td><td class="num">' + x.notes + '</td><td class="num"><b>' +
            (x.moy == null ? '—' : (x.moy.toFixed(2).replace('.', ',') + ' / 20')) + '</b></td><td class="num">' + x.sous10 + '</td></tr>').join('') || UI.empty(5)) +
          '</div>' +
        '<div class="stat-label" style="margin-top:8px">Affectations : <b>' + affectations.length + '</b> · Volume horaire programmé : <b>' + hFmt(totalPrevH) + '</b> · Heures effectuées : <b>' + hFmt(totalDoH) + '</b> · Pointages enregistrés : <b>' + pointages.length + '</b>' +
          '<br><span class="card-sub">La moyenne indicative est calculée à partir des notes de devoirs et de composition déjà saisies.</span></div>' +
      '</div>' +

      '<div class="bar"><div class="card-title">4 · Données financières</div>' +
        '<div class="table-wrap">' + UI.table(['Type de frais', 'Attendu', 'Encaissé', 'Taux'],
          fraisParType.map((x) => '<tr><td>' + UI.esc(x.tf.libelle) + '</td><td class="num">' + UI.money(x.att) + '</td><td class="num">' + UI.money(x.paid) + '</td><td class="num"><b>' +
            (x.rec == null ? '—' : pctFmt(x.rec)) + '</b></td></tr>').join('') || UI.empty(4)) +
          '</div>' +
        '<div class="stat-label" style="margin-top:8px">Total attendu : <b>' + UI.money(attTotal) + '</b> · Encaissé : <b>' + UI.money(totalEnc) + '</b> · Reste à recouvrer : <b>' + UI.money(Math.max(0, attTotal - totalEnc)) + '</b></div>' +
        '<div class="stat-label" style="margin-top:6px">Personnel administratif : <b>' + admActifs.length + ' actif(s)</b> · Masse salariale mensuelle estimée : <b>' + UI.money(masseSal) + '</b> · Paies versées : <b>' + UI.money(totalPaies) + '</b></div>' +
        '<div class="stat-label">Honoraires enseignants versés : <b>' + UI.money(totalSal) + '</b> · Dépenses & charges : <b>' + UI.money(totalDep) + '</b> · Solde suivi : <b>' + UI.money(solde) + '</b></div>' +
      '</div>' +

      '<div class="bar"><div class="card-title">5 · Données administratives</div>' +
        '<div class="table-wrap">' + UI.table(['Rôle', 'Comptes'],
          Object.keys(usersParRole).sort().map((r) => '<tr><td>' + UI.esc(Auth.roleLib(r)) + '</td><td class="num">' + usersParRole[r] + '</td></tr>').join('') || UI.empty(2)) +
          '</div>' +
        '<div class="stat-label" style="margin-top:8px">Journal d\'audit : <b>' + journal.length + ' entrée(s)</b> · Élèves ayant payé au moins une fois : <b>' + payeurs.size + '</b> / ' + eff + ' · Enseignants enregistrés : <b>' + enseignants.length + '</b>' +
          '<br><span class="card-sub">Les 5 dernières actions enregistrées :</span></div>' +
        '<div class="table-wrap">' + UI.table(['Date', 'Action', 'Objet'],
          journal.slice(-5).reverse().map((j) => '<tr><td>' + UI.dateFr(j.date || j.dateCreation) + '</td><td>' + UI.esc(j.action || '') + '</td><td>' + UI.esc(j.detail || '') + '</td></tr>').join('') || UI.empty(3)) +
          '</div>' +
      '</div>' +

      '<div class="bar"><div class="card-title">6 · Fréquences — distribution par classe</div>' +
        '<div class="stat-label" style="margin:-4px 0 8px"><span class="card-sub">Répartition des classes selon l\'effectif, pour repérer les tranches surchargées ou sous-utilisées.</span></div>' +
        '<div class="chart-bar">' + tranches.map((t) => barH(t.t, t.v, classes.length, '#0891b2')).join('') + '</div>' +
      '</div>' +

      '<div class="card-title" style="margin-bottom:10px">Interprétations & propositions de solutions</div>' + indHtml;

    root.innerHTML = html;
  }
});