/* ============================================================
   dashboard.js — Tableau de bord des statistiques
   ============================================================ */
App.register('dashboard', {
  title: 'Tableau de bord',
  navLabel: 'Tableau de bord',
  icon: 'D',
  group: 'Général',
  perm: 'dashboard.view',
  render: async function (root) {
    const u = Auth.currentUser();
    root.innerHTML = '<div id="db-school" class="school-banner"></div><div class="grid" id="db-cards"></div><div id="db-charts"></div>';

    // --- En-tête école (données de l'école courante) ---
    const [cycles, salles, niveaux, classes, eleves, enseignants, matieres, users, enc, typesFrais, eco, annees] = await Promise.all([
      DB.getAll('cycles'), DB.getAll('salles'), DB.getAll('niveaux'), DB.getAll('classes'),
      DB.getAll('eleves'), DB.getAll('enseignants'), DB.getAll('matieres'), DB.getAll('users'),
      DB.getAll('fraisEncaissements'), DB.getAll('typesFrais'),
      DB.get('ecole', 1), DB.getAll('annees')
    ]);
    const anneeCourante = (annees || []).find(a => a.id === eco.anneeEnCoursId);
    const schoolEl = root.querySelector('#db-school');
    if (eco && (eco.nom || eco.slogan || eco.adresse || eco.directeur)) {
      if (schoolEl) schoolEl.innerHTML =
        '<div class="school-logo">' + (eco.logo ? '<img src="' + eco.logo + '" alt="logo">' : '<b>' + UI.esc((eco.nom || 'É').charAt(0)) + '</b>') + '</div>' +
        '<div class="school-info">' +
        '<h2>' + UI.esc(eco.nom || 'Établissement') + '</h2>' +
        (eco.slogan ? '<div class="school-slogan">' + UI.esc(eco.slogan) + '</div>' : '') +
        '<div class="school-meta">' +
        [eco.adresse, eco.tel ? 'Tél : ' + eco.tel : '', eco.email].filter(Boolean).join(' · ') +
        (eco.directeur ? ' · Directeur : ' + UI.esc(eco.directeur) : '') +
        (anneeCourante ? ' · Année scolaire : ' + UI.esc(anneeCourante.libelle) : '') +
        '</div></div>';
    } else {
      if (schoolEl) schoolEl.style.display = 'none';
    }
    const classesCount = classes.length;
    const eff = eleves.length;

    const cards = [
      { label: 'Élèves / Étudiants', value: eff, icon: 'E', color: '#2563eb' },
      { label: 'Enseignants', value: enseignants.length, icon: 'P', color: '#16a34a' },
      { label: 'Classes', value: classesCount, icon: 'K', color: '#d97706' },
      { label: 'Cycles', value: cycles.length, icon: 'C', color: '#7c3aed' },
      { label: 'Salles', value: salles.length, icon: 'S', color: '#0891b2' },
      { label: 'Matières', value: matieres.length, icon: 'M', color: '#db2777' }
    ];
    const totalEnc = enc.reduce((s, x) => s + Number(x.montant || 0), 0);

    const cardsEl = root.querySelector('#db-cards');
    cardsEl.innerHTML = cards.map((c, i) =>
      '<div class="stat-card"><div class="stat-icon" style="background:' + c.color + '">' + c.icon + '</div>' +
      '<div class="stat-label">' + UI.esc(c.label) + '</div><div class="stat-value">' + c.value + '</div></div>'
    ).join('') +
    '<div class="stat-card"><div class="stat-icon" style="background:#ca8a04">F</div>' +
    '<div class="stat-label">Frais encaissés</div><div class="stat-value">' + UI.money(totalEnc) + '</div></div>';

    // --- Graphiques ---
    const charts = root.querySelector('#db-charts');
    let html = '';

    // Répartition par cycle (élèves)
    const nvOf = (cl) => niveaux.find(n => n.id === cl.niveauId);
    const cycleOfClasse = (cl) => { const n = nvOf(cl); return n ? n.cycleId : null; };
    const byCycle = {};
    cycles.forEach((c) => { byCycle[c.id] = { name: c.libelle, count: 0 }; });
    classes.forEach((cl) => {
      const cid = cycleOfClasse(cl);
      if (cid != null && byCycle[cid]) byCycle[cid].count += eleves.filter(e => e.classeId === cl.id).length;
    });
    const cycleData = cycles.map(c => ({ label: c.libelle, value: eleves.filter(e => { const cl = classes.find(x => x.id === e.classeId); return cl && cycleOfClasse(cl) === c.id; }).length }));
    html += '<div class="bar"><div class="card-title">Élèves par cycle</div><div class="chart-bar">' +
      cycleData.map((d, i) => {
        const h = eff ? Math.max(6, Math.round((d.value / eff) * 150)) : 6;
        return '<div class="col"><div class="fill" style="height:' + h + 'px"></div><b>' + d.value + '</b><span>' + UI.esc(d.label) + '</span></div>';
      }).join('') + '</div></div>';

    // Répartition garçons / filles
    const boys = eleves.filter(e => e.sexe === 'M').length;
    const girls = eleves.filter(e => e.sexe === 'F').length;
    const other = eleves.length - boys - girls;
    html += '<div class="bar"><div class="card-title">Répartition par sexe</div><div class="chart-bar">' +
      bar('Garçons', boys, '#2563eb', eff) + bar('Filles', girls, '#db2777', eff) + bar('Non précisé', other, '#94a3b8', eff) +
      '</div></div>';

    // Taux de fréquentation des frais : élèves ayant payé au moins une fois
    const payeurs = new Set(enc.map(x => x.eleveId));
    const payeCnt = eleves.filter(e => payeurs.has(e.id)).length;
    // Soldes globaux : total dû (selon montants par classe), encaissé, reste
    let dueTotal = 0, resteTotal = 0;
    eleves.forEach((e) => {
      typesFrais.forEach((tf) => {
        const cl = classes.find(c => c.id === e.classeId);
        const due = Frais.montantPour(tf, e.classeId, cl && cl.niveauId, e);
        if (!(due > 0)) return;
        const paid = enc.filter(x => x.eleveId === e.id && x.typeFraisId === tf.id).reduce((s, x) => s + Number(x.montant || 0), 0);
        dueTotal += due; resteTotal += Math.max(0, due - paid);
      });
    });
    html += '<div class="bar"><div class="card-title">Frais scolaires</div>' +
      '<div class="stat-label">Élèves ayant payé au moins un frais : <b>' + payeCnt + ' / ' + eff + '</b></div>' +
      '<div class="stat-label">Types de frais définis : <b>' + typesFrais.length + '</b></div>' +
      '<div class="stat-label">Total dû : <b>' + UI.money(dueTotal) + '</b> · Encaissé : <b>' + UI.money(totalEnc) + '</b> · Reste à payer : <b>' + UI.money(resteTotal) + '</b></div></div>';

    // Côté élève : afficher ses propres frais et soldes
    if (u.role === 'eleve') {
      const me = eleves.find(e => e.userId === u.id);
      if (me) {
        const myCls = classes.find(c => c.id === me.classeId);
        const myRows = [];
        let myDue = 0, myPaid = 0;
        typesFrais.forEach((tf) => {
          const due = Frais.montantPour(tf, me.classeId, myCls && myCls.niveauId, me);
          if (!(due > 0)) return;
          const paid = enc.filter(x => x.eleveId === me.id && x.typeFraisId === tf.id).reduce((s, x) => s + Number(x.montant || 0), 0);
          const reste = Math.max(0, due - paid);
          const st = Frais.statut(due, paid);
          const badge = st === 'soldé' ? 'badge-ok' : (st === 'partiel' ? 'badge-warn' : 'badge-danger');
          const stTxt = st === 'soldé' ? 'Soldé' : (st === 'partiel' ? 'Partiel' : 'Impayé');
          myDue += due; myPaid += paid;
          myRows.push('<tr><td>' + UI.esc(tf.libelle) + '</td><td class="num">' + UI.money(due) + '</td><td class="num">' + UI.money(paid) + '</td><td class="num"><b>' + (reste > 0 ? UI.money(reste) : '—') + '</b></td><td><span class="badge ' + badge + '">' + stTxt + '</span></td></tr>');
        });
        html += '<div class="bar"><div class="card-title">Mes frais scolaires</div>' +
          (myRows.length
            ? UI.table(['Type', 'Dû', 'Payé', 'Solde', 'Statut'], myRows.join(''))
            : '<div class="notice">Aucun frais défini pour votre classe' + (myCls ? ' (' + Data.classeLabel(myCls) + ')' : '') + '.</div>') +
          (myRows.length ? '<div class="card-sub" style="margin-top:8px">Total dû : <b>' + UI.money(myDue) + '</b> · Payé : <b>' + UI.money(myPaid) + '</b> · Reste : <b>' + UI.money(Math.max(0, myDue - myPaid)) + '</b></div>' : '') +
          '</div>';
      }
    }

    // Accès rapide pour les rôles
    html += '<div class="bar"><div class="card-title">Votre rôle & accès</div><p>' +
      '<span class="badge ' + Auth.roleClass(u.role) + '">' + UI.esc(Auth.roleLib(u.role)) + '</span> — ' +
      (u.role === 'eleve' ? 'Vous consultez vos bulletins et résultats.' :
       u.role === 'enseignant' ? 'Vous saisissez les notes et consultez votre emploi du temps.' :
       'Vous avez accès à la gestion pédagogique et administrative de l\'établissement.') + '</p></div>';

    charts.innerHTML = html;

    function bar(label, val, color, total) {
      const h = total ? Math.max(6, Math.round((val / total) * 150)) : 6;
      return '<div class="col"><div class="fill" style="height:' + h + 'px;background:transparent;background:' + color + '"></div><b>' + val + '</b><span>' + label + '</span></div>';
    }
  }
});
