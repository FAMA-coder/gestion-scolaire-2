/* ============================================================
   finances.js — Frais scolaires, Encaissements, Salaires
   ============================================================ */

/* ---------------- Helpers partagés (frais) ---------------- */
window.Frais = (function () {
  // Montant dû pour un type de frais selon le niveau de la classe de l'élève.
  // Cas social : seul les frais sélectionnés (fraisTypesIds) sont dus, sinon rien.
  // Sinon (legacy) on retombe sur montant/cycleId, puis montants par classe.
  function montantPour(tf, classeId, niveauId, eleve) {
    if (!tf) return null;
    if (eleve && eleve.dispenseFrais === true) return 0; // élève dispensé : ne doit rien payer
    if (eleve && eleve.typeEleve === 'cas_social') {
      const ids = eleve.fraisTypesIds || [];
      if (!ids.length) return 0;
      if (ids.indexOf(tf.id) < 0) return 0;
    }
    if (tf.montants && tf.montants.length) {
      let m = niveauId ? tf.montants.find(x => Number(x.niveauId) === Number(niveauId)) : null;
      if (!m) m = tf.montants.find(x => Number(x.classeId) === Number(classeId));
      return m ? Number(m.montant) : null;
    }
    return Number(tf.montant || 0);
  }
  function estApplicable(tf, classeId) {
    const m = montantPour(tf, classeId);
    return m != null && m > 0;
  }
  // Statut selon dû et payé
  function statut(due, paid) {
    if (!(due > 0)) return 'na';
    if (paid >= due) return 'soldé';
    if (paid > 0) return 'partiel';
    return 'impayé';
  }
  return { montantPour: montantPour, estApplicable: estApplicable, statut: statut };
})();

/* ---------------- FRAIS SCOLAIRES ---------------- */
App.register('frais', {
  title: 'Frais scolaires',
  navLabel: 'Frais scolaires',
  icon: 'F',
  group: 'Finance',
  perm: 'frais.manage',
  render: async function (root) {
    const tabs = [['types', 'Types de frais'], ['suivi', 'Suivi des paiements'], ['recus', 'Reçus']];
    root.innerHTML = '<div class="tabbar">' + tabs.map((t, i) => '<button class="tab' + (i === 0 ? ' active' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>').join('') + '</div>' +
      '<div id="frag-types"></div><div id="frag-suivi" class="hidden"></div><div id="frag-recus" class="hidden"></div>';
    root.querySelectorAll('.tab').forEach((t) => t.onclick = () => {
      root.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      ['types', 'suivi', 'recus'].forEach((k) => root.querySelector('#frag-' + k).classList.toggle('hidden', k !== t.dataset.tab));
    });
    renderTypes();
    renderSuivi();
    renderRecus();

    async function renderTypes() {
      const el = root.querySelector('#frag-types');
      const typesFrais = await DB.getAll('typesFrais');
      const niveaux = await DB.getAll('niveaux');
      el.innerHTML = '<div class="bar"><div class="bar-head"><div class="card-title">Types de frais</div>' +
        '<button class="btn btn-primary" id="tf-add">+ Type de frais</button></div></div>' +
        '<div class="bar"><div class="table-wrap" id="tf-list"></div></div>';
      const listEl = el.querySelector('#tf-list');
      const rows = typesFrais.map((t) => {
        const mont = perNiveauLabel(t, niveaux);
        return '<tr><td><strong>' + UI.esc(t.libelle) + '</strong></td>' +
          '<td>' + mont + '</td>' +
          '<td>' + UI.esc(t.periodicite || 'Fixe') + '</td>' +
          '<td class="actions-cell">' +
            '<button class="btn btn-sm btn-outline" data-edit="' + t.id + '">Modifier</button>' +
            '<button class="btn btn-sm btn-danger" data-del="' + t.id + '">Suppr.</button>' +
          '</td></tr>';
      }).join('');
      listEl.innerHTML = UI.table(['Type', 'Montants par niveau', 'Périodicité', 'Actions'], rows || UI.empty(4));
      listEl.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => formType(typesFrais.find(x => x.id === Number(b.dataset.edit))));
      listEl.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => {
        const t = typesFrais.find(x => x.id === Number(b.dataset.del));
        UI.confirm('Supprimer le type « ' + t.libelle + ' » ?', async () => { await DB.del('typesFrais', t.id); renderTypes(); renderSuivi(); }, { title: 'Supprimer' });
      });
      el.querySelector('#tf-add').onclick = () => formType();
    }
    function perNiveauLabel(t, niveaux) {
      const mts = (t.montants || []);
      if (mts.length) {
        return mts.map(m => {
          const nv = niveaux.find(n => n.id === Number(m.niveauId));
          return '<span class="badge badge-primary" style="margin:2px">' + UI.esc(nv ? nv.libelle : 'Niveau ?') + ' : ' + UI.money(m.montant) + '</span>';
        }).join(' ');
      }
      return '<span class="badge badge-gray">' + UI.money(t.montant || 0) + '</span>';
    }
    function formType(t) {
      t = t || {};
      const montants = (t.montants || []).slice();
      const classesRef = [];
      async function open() {
        const niveaux = await DB.getAll('niveaux');
        const niveauOpts = UI.options(niveaux.map(n => ({ id: n.id, libelle: n.libelle })), '', 'Choisir un niveau…');
        const perOpts = UI.options([{ id: 'Fixe', libelle: 'Fixe (une fois)' }, { id: 'Par trimestre', libelle: 'Par trimestre' }, { id: 'Par mois', libelle: 'Par mois' }, { id: 'Annuel', libelle: 'Annuel' }], t.periodicite || 'Fixe', null);
        UI.prompt(t.id ? 'Modifier le type de frais' : 'Nouveau type de frais (montant par niveau)', `
          <div class="field"><label>Libellé *</label><input id="tf-lib" value="${UI.esc(t.libelle || '')}" required placeholder="Ex : Scolarité annuelle"></div>
          <div class="field"><label>Périodicité</label><select id="tf-per">${perOpts}</select></div>
          <div class="card-sub" style="margin-top:6px">Montant par niveau (obligatoire pour chaque niveau concerné)</div>
          <div class="row">
            <div class="field"><select id="tf-cls">${niveauOpts}</select></div>
            <div class="field"><input id="tf-mt" type="number" min="0" placeholder="Montant"></div>
            <div class="field" style="display:flex;align-items:flex-end"><button type="button" class="btn btn-outline" id="tf-addrow">+ Ajouter</button></div>
          </div>
          <div id="tf-montants"></div>
        `, async (body) => {
          const lib = body.querySelector('#tf-lib').value.trim();
          if (!lib) { UI.toast('Libellé requis.', 'err'); return false; }
          const obj = { libelle: lib, periodicite: body.querySelector('#tf-per').value, montants: montants, dateCreation: t.dateCreation || UI.nowIso() };
          if (t.id) { obj.id = t.id; await DB.put('typesFrais', obj); } else await DB.add('typesFrais', obj);
          UI.closeModal(); UI.toast('Type enregistré.', 'ok'); renderTypes(); renderSuivi();
          return true;
        }, { title: (t.id ? 'Modifier' : 'Créer') + ' un type de frais' });
        const box = document.querySelector('.modal-overlay');
        const listEl = box ? box.querySelector('#tf-montants') : null;
        const clsSel = box ? box.querySelector('#tf-cls') : null;
        const mtSel = box ? box.querySelector('#tf-mt') : null;
        const niveauxAll = await DB.getAll('niveaux');
        const renderRows = () => {
          if (!listEl) return;
          listEl.innerHTML = montants.length ? montants.map((m, i) => {
            const nv = m.niveauId ? niveauxAll.find(n => n.id === Number(m.niveauId)) : null;
            return '<div class="notice" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><span>' + UI.esc(nv ? nv.libelle : 'Niveau ?') + ' : <b>' + UI.money(m.montant) + '</b></span>' +
              '<button type="button" class="btn btn-sm btn-danger" data-mdel="' + i + '">×</button></div>';
          }).join('') : '<div class="empty">Aucun montant défini</div>';
          if (listEl) listEl.querySelectorAll('[data-mdel]').forEach((b) => b.onclick = () => { montants.splice(Number(b.dataset.mdel), 1); renderRows(); });
        };
        if (box) {
          const addBtn = box.querySelector('#tf-addrow');
          if (addBtn) addBtn.onclick = () => {
            const nid = Number(clsSel.value);
            const mt = Number(mtSel.value);
            if (!nid || !(mt >= 0)) { UI.toast('Choisissez un niveau et un montant.', 'err'); return; }
            const idx = montants.findIndex(x => Number(x.niveauId) === nid);
            if (idx >= 0) montants[idx].montant = mt; else montants.push({ niveauId: nid, montant: mt });
            clsSel.value = ''; mtSel.value = '';
            renderRows();
          };
          renderRows();
        }
      }
      open();
    }

    async function renderSuivi() {
      const el = root.querySelector('#frag-suivi');
      const typesFrais = await DB.getAll('typesFrais');
      const eleves = await DB.getAll('eleves');
      const classes = await DB.getAll('classes');
      const enc = await DB.getAll('fraisEncaissements');
      const paidMap = {};
      enc.forEach(x => {
        const k = x.eleveId + '_' + x.typeFraisId;
        if (!paidMap[k]) paidMap[k] = { paid: 0, list: [] };
        paidMap[k].paid += Number(x.montant || 0);
        paidMap[k].list.push(x);
      });
      el.innerHTML = '<div class="bar"><div class="bar-head"><div class="card-title">Suivi des paiements (soldes par élève)</div>' +
        '<button class="btn btn-primary" id="en-add">+ Encaisser une tranche</button></div></div>' +
        '<div class="bar"><div class="row" style="gap:10px">' +
        '<div class="field"><label>Filtrer par classe</label><select id="suivi-cls">' + UI.options(classes.map(c => ({ id: c.id, libelle: Data.classeLabel(c) })), '', 'Toutes les classes') + '</select></div>' +
        '<div class="field"><label>Rechercher un élève</label><input id="suivi-q" placeholder="Nom…"></div>' +
        '</div><div class="table-wrap" id="suivi-list"></div></div>';
      const listEl = el.querySelector('#suivi-list');
      const renderRows = () => {
        const clsF = Number(el.querySelector('#suivi-cls').value) || null;
        const q = (el.querySelector('#suivi-q').value || '').trim().toLowerCase();
        const rows = [];
        const totals = { due: 0, paid: 0, reste: 0 };
        let dispenses = 0;
        eleves.slice().sort((a, b) => (a.nom || '').localeCompare(b.nom || '')).forEach((ev) => {
          const cl = classes.find(c => c.id === ev.classeId);
          if (clsF && Number(cl && cl.id) !== clsF) return;
          if (q && !String((ev.nom || '') + ' ' + (ev.prenom || '') + ' ' + (ev.matricule || '')).toLowerCase().includes(q)) return;
          const dispense = ev.dispenseFrais === true;
          typesFrais.forEach((tf) => {
            const g = paidMap[ev.id + '_' + tf.id] || { paid: 0, list: [] };
            const paid = g.paid;
            if (dispense) {
              dispenses++;
              rows.push('<tr>' +
                '<td><strong>' + UI.esc(Data.personneNom(ev)) + '</strong><div class="muted">' + UI.esc(cl ? Data.classeLabel(cl) : '—') + '</div></td>' +
                '<td>' + UI.esc(tf.libelle) + '</td>' +
                '<td class="num">—</td>' +
                '<td class="num">' + UI.money(paid) + '</td>' +
                '<td class="num">—</td>' +
                '<td><span class="badge badge-gray">Dispensé</span></td>' +
                '<td class="actions-cell">' +
                  '<button class="btn btn-sm btn-outline" data-ndisp="' + ev.id + '">Réactiver le paiement</button>' +
                  (g.list.length ? '<button class="btn btn-sm btn-ghost" data-hist="' + ev.id + '_' + tf.id + '">Historique</button>' : '') +
                '</td></tr>');
              return;
            }
            const due = Frais.montantPour(tf, ev.classeId, cl && cl.niveauId, ev);
            if (!(due > 0)) return;
            const reste = Math.max(0, due - paid);
            const st = Frais.statut(due, paid);
            const badge = st === 'soldé' ? 'badge-ok' : (st === 'partiel' ? 'badge-warn' : 'badge-danger');
            totals.due += due; totals.paid += paid; totals.reste += reste;
            rows.push('<tr>' +
              '<td><strong>' + UI.esc(Data.personneNom(ev)) + '</strong><div class="muted">' + UI.esc(cl ? Data.classeLabel(cl) : '—') + '</div></td>' +
              '<td>' + UI.esc(tf.libelle) + '</td>' +
              '<td class="num">' + UI.money(due) + '</td>' +
              '<td class="num">' + UI.money(paid) + '</td>' +
              '<td class="num"><b>' + (reste > 0 ? UI.money(reste) : '—') + '</b></td>' +
              '<td><span class="badge ' + badge + '">' + statusTxt(st) + '</span></td>' +
              '<td class="actions-cell"><button class="btn btn-sm btn-outline" data-tranche="' + ev.id + '_' + tf.id + '">Encaisser</button>' +
              '<button class="btn btn-sm btn-outline" data-disp="' + ev.id + '" title="Dispenser cet élève de ce frais">Dispenser</button>' +
              (g.list.length ? '<button class="btn btn-sm btn-ghost" data-hist="' + ev.id + '_' + tf.id + '">Historique</button>' : '') +
              '</td></tr>');
          });
        });
        listEl.innerHTML = '<div class="card-sub" style="margin-bottom:8px">Total dû : <b>' + UI.money(totals.due) + '</b> · Encaissé : <b>' + UI.money(totals.paid) + '</b> · Reste à payer : <b>' + UI.money(totals.reste) + '</b>' +
          (dispenses ? ' · <span class="badge badge-gray">' + dispenses + ' ligne(s) dispensée(s)</span>' : '') + '</div>' +
          UI.table(['Élève', 'Type de frais', 'Dû', 'Payé', 'Solde', 'Statut', 'Actions'], rows.join('') || UI.empty(7));
        listEl.querySelectorAll('[data-tranche]').forEach((b) => b.onclick = () => payerTranche(b.dataset.tranche, paidMap));
        listEl.querySelectorAll('[data-hist]').forEach((b) => b.onclick = () => histModal(b.dataset.hist, paidMap));
        listEl.querySelectorAll('[data-disp]').forEach((b) => b.onclick = async () => {
          const ev = eleves.find((x) => x.id === Number(b.dataset.disp));
          if (!ev) return;
          ev.dispenseFrais = true;
          await DB.put('eleves', ev);
          await Auth.log('Modification', 'frais', 'Dispense des frais — ' + Data.personneNom(ev));
          UI.toast(Data.personneNom(ev) + ' dispensé(e) des frais.', 'ok');
          renderSuivi();
        });
        listEl.querySelectorAll('[data-ndisp]').forEach((b) => b.onclick = async () => {
          const ev = eleves.find((x) => x.id === Number(b.dataset.ndisp));
          if (!ev) return;
          delete ev.dispenseFrais;
          await DB.put('eleves', ev);
          await Auth.log('Modification', 'frais', 'Réactivation du paiement — ' + Data.personneNom(ev));
          UI.toast('Paiement réactivé pour ' + Data.personneNom(ev) + '.', 'ok');
          renderSuivi();
        });
      };
      el.querySelector('#suivi-cls').onchange = renderRows;
      el.querySelector('#suivi-q').addEventListener('input', renderRows);
      renderRows();
      el.querySelector('#en-add').onclick = () => payerTranche(null, paidMap);
    }

    function statusTxt(st) {
      if (st === 'soldé') return 'Soldé';
      if (st === 'partiel') return 'Partiel';
      if (st === 'impayé') return 'Impayé';
      return '—';
    }

    async function payerTranche(key, paidMap) {
      const [eleves, typesFrais, classes] = await Promise.all([DB.getAll('eleves'), DB.getAll('typesFrais'), DB.getAll('classes')]);
      const preE = key ? Number(key.split('_')[0]) : '';
      const preT = key ? Number(key.split('_')[1]) : '';
      let preselected = key || '';
      const payModes = (window.PAIEMENT && window.PAIEMENT.modes && window.PAIEMENT.modes.length) ? window.PAIEMENT.modes : ['Espèces', 'Chèque', 'Virement bancaire', 'Mobile Money'];
      UI.prompt('Encaisser un frais (paiement par tranches)', `
        <div class="field"><label>Élève *</label><select id="enc-eleve">${UI.options(eleves.map(e => ({ id: e.id, libelle: Data.personneNom(e) })), preE, 'Choisir…')}</select></div>
        <div class="row">
          <div class="field"><label>Type de frais *</label><select id="enc-type">${UI.options(typesFrais.map(t => ({ id: t.id, libelle: t.libelle })), preT, 'Choisir…')}</select></div>
          <div class="field"><label>Montant de la tranche *</label><input id="enc-mt" type="number" min="0" required></div>
        </div>
        <div id="enc-info" class="notice"></div>
        <div class="row">
          <div class="field"><label>Date</label><input id="enc-date" type="date" value="${UI.today()}"></div>
          <div class="field"><label>Mode</label><select id="enc-mode">${UI.options(payModes.map(m => ({ id: m, libelle: m })), payModes[0] || 'Espèces', null)}</select></div>
        </div>
        <div class="field"><label>Note</label><input id="enc-note"></div>
      `, async (body) => {
        const evId = Number(body.querySelector('#enc-eleve').value);
        const tfId = Number(body.querySelector('#enc-type').value);
        const mt = Number(body.querySelector('#enc-mt').value);
        if (!evId || !tfId || !(mt >= 0)) { UI.toast('Renseignez élève, type et montant.', 'err'); return false; }
        const ev = eleves.find(e => e.id === evId);
        const tf = typesFrais.find(t => t.id === tfId);
        const due = Frais.montantPour(tf, ev && ev.classeId, ev && (classes.find(c => c.id === ev.classeId) || {}).niveauId, ev);
        if (!(due > 0)) {
          if (ev && ev.typeEleve === 'cas_social') UI.toast('Aucun frais sélectionné pour cet élève (cas social).', 'err');
          else UI.toast('Aucun montant défini pour le niveau de la classe de cet élève.', 'err');
          return false;
        }
        const g = (paidMap && paidMap[evId + '_' + tfId]) || { paid: 0 };
        const reste = Math.max(0, due - g.paid);
        if (mt > reste) {
          UI.toast('Le montant (' + UI.money(mt) + ') dépasse le solde restant (' + UI.money(reste) + ').', 'err');
          return false;
        }
        await DB.add('fraisEncaissements', { eleveId: evId, typeFraisId: tfId, montant: mt, date: body.querySelector('#enc-date').value, mode: body.querySelector('#enc-mode').value, note: body.querySelector('#enc-note').value.trim(), dateCreation: UI.nowIso() });
        UI.closeModal(); UI.toast('Tranche encaissée.', 'ok'); renderSuivi(); renderRecus();
        return true;
      });
      const box = document.querySelector('.modal-overlay');
      if (box) {
        const eSel = box.querySelector('#enc-eleve');
        const tSel = box.querySelector('#enc-type');
        const info = box.querySelector('#enc-info');
        const updateInfo = () => {
          const ev = eleves.find(e => e.id === Number(eSel.value));
          const tf = typesFrais.find(t => t.id === Number(tSel.value));
          const due = Frais.montantPour(tf, ev && ev.classeId, ev && (classes.find(c => c.id === ev.classeId) || {}).niveauId, ev);
          if (ev && tf && due > 0) {
            const g = (paidMap && paidMap[ev.id + '_' + tf.id]) || { paid: 0 };
            const reste = Math.max(0, due - g.paid);
            info.innerHTML = 'Dû : <b>' + UI.money(due) + '</b> · Déjà payé : <b>' + UI.money(g.paid) + '</b> · Solde restant : <b>' + UI.money(reste) + '</b>';
          } else if (ev && tf) {
            info.innerHTML = '<span class="muted">Aucun montant défini pour le niveau de la classe ' + UI.esc(classes.find(c => c.id === ev.classeId) ? Data.classeLabel(classes.find(c => c.id === ev.classeId)) : '') + '.</span>';
          } else {
            info.innerHTML = 'Sélectionnez l\'élève et le type de frais.';
          }
        };
        if (eSel && tSel && info) { eSel.onchange = updateInfo; tSel.onchange = updateInfo; updateInfo(); }
      }
    }

    async function histModal(key, paidMap) {
      const [eleves, typesFrais] = await Promise.all([DB.getAll('eleves'), DB.getAll('typesFrais')]);
      const evId = Number(key.split('_')[0]);
      const tfId = Number(key.split('_')[1]);
      const g = (paidMap && paidMap[key]) || { paid: 0, list: [] };
      const ev = eleves.find(e => e.id === evId);
      const tf = typesFrais.find(t => t.id === tfId);
      const rows = g.list.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((x) =>
        '<tr><td>' + UI.dateFr(x.date) + '</td><td class="num">' + UI.money(x.montant) + '</td><td>' + UI.esc(x.mode || 'Espèces') + '</td><td>' + UI.esc(x.note || '') + '</td><td><button class="btn btn-sm btn-danger" data-del="' + x.id + '">Suppr.</button></td></tr>'
      ).join('');
      UI.modal(
        '<div class="card-title">Historique — ' + UI.esc(Data.personneNom(ev)) + ' · ' + UI.esc(tf ? tf.libelle : '') + '</div>' +
        '<div class="card-sub">Total payé : <b>' + UI.money(g.paid) + '</b></div>' +
        UI.table(['Date', 'Montant', 'Mode', 'Note', ''], rows || UI.empty(5)),
        '<button class="btn btn-ghost" data-close>Fermer</button>',
        { title: 'Historique des tranches', size: 'modal' }
      );
      const mRoot = document.querySelector('.modal-overlay');
      if (mRoot) {
        mRoot.querySelector('[data-close]').onclick = () => UI.closeModal();
        mRoot.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
          await DB.del('fraisEncaissements', Number(b.dataset.del));
          UI.closeModal(); renderSuivi(); renderRecus();
        });
      }
    }

    async function renderRecus() {
      const el = root.querySelector('#frag-recus');
      const typesFrais = await DB.getAll('typesFrais');
      const eleves = await DB.getAll('eleves');
      const enc = await DB.getAll('fraisEncaissements');
      const classes = await DB.getAll('classes');
      el.innerHTML = '<div class="bar"><div class="card-title">Reçus de paiement</div>' +
        '<p class="card-sub">Historique des paiements et impression d\'un reçu.</p></div>' +
        '<div class="bar"><div class="table-wrap" id="rec-list"></div></div>';
      const listEl = el.querySelector('#rec-list');
      const rows = enc.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((x, i) => {
        const ev = eleves.find(e => e.id === x.eleveId);
        const cl = ev ? classes.find(c => c.id === ev.classeId) : null;
        const tf = typesFrais.find(t => t.id === x.typeFraisId);
        return '<tr><td>R' + String(1000 + i + 1) + '</td>' +
          '<td>' + UI.esc(ev ? Data.personneNom(ev) : '—') + '</td>' +
          '<td>' + UI.esc(cl ? Data.classeLabel(cl) : '—') + '</td>' +
          '<td>' + UI.esc(tf ? tf.libelle : '—') + '</td>' +
          '<td class="num">' + UI.money(x.montant) + '</td>' +
          '<td>' + UI.dateFr(x.date) + '</td>' +
          '<td class="actions-cell"><button class="btn btn-sm btn-outline" data-print="' + x.id + '">Imprimer reçu</button></td></tr>';
      }).join('');
      listEl.innerHTML = UI.table(['N°', 'Élève', 'Classe', 'Motif', 'Montant', 'Date', 'Action'], rows || UI.empty(7));
      listEl.querySelectorAll('[data-print]').forEach((b) => b.onclick = () => {
        const x = enc.find(v => v.id === Number(b.dataset.print));
        printRecu(x);
      });
    }
  }
});

/* ---------------- SALAIRES ---------------- */
App.register('salaires', {
  title: 'Salaires',
  navLabel: 'Salaires',
  icon: 'S',
  group: 'Finance',
  perm: 'salaires.manage',
  render: async function (root) {
    root.innerHTML = '<div class="bar"><div class="bar-head"><div class="card-title">Gestion des salaires</div>' +
      '<div class="toolbar"><button class="btn btn-primary" id="sa-add">+ Verser un salaire</button></div></div></div>' +
      '<div class="bar"><div class="table-wrap" id="sa-list"></div></div>';
    const listEl = root.querySelector('#sa-list');
    renderList();
    async function renderList() {
      const salaires = await DB.getAll('salaires');
      const enseignants = await DB.getAll('enseignants');
      const payes = salaires.filter((x) => x.statut === 'paye');
      const total = payes.reduce((s, x) => s + Number(x.montant || 0), 0);
      const rows = salaires.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((s) => {
        const en = enseignants.find(e => e.id === s.enseignantId);
        const statutSel = '<select class="sa-status" data-id="' + s.id + '" style="width:auto;padding:2px 4px">' +
          UI.options([{ id: 'attente', libelle: 'En attente' }, { id: 'paye', libelle: 'Payé' }], s.statut === 'paye' ? 'paye' : 'attente', null) + '</select>';
        return '<tr><td><strong>' + UI.esc(en ? Data.personneNom(en) : '(supprimé)') + '</strong></td>' +
          '<td>' + UI.esc(s.mois && s.annee ? (s.mois + '/' + s.annee) : '–') + '</td>' +
          '<td class="num">' + UI.money(s.montant) + '</td>' +
          '<td>' + UI.dateFr(s.date) + '</td>' +
          '<td>' + statutSel + '</td>' +
          '<td class="actions-cell">' +
            '<button class="btn btn-sm btn-outline" data-print="' + s.id + '">Fiche</button>' +
            '<button class="btn btn-sm btn-danger" data-del="' + s.id + '">Suppr.</button>' +
          '</td></tr>';
      }).join('');
      listEl.innerHTML = '<div class="card-sub" style="margin-bottom:10px">Total payé : <b>' + UI.money(total) + '</b></div>' +
        (rows ? UI.table(['Enseignant', 'Période', 'Montant', 'Date', 'Statut', 'Actions'], rows) : '<div class="empty">Aucun salaire enregistré</div>');
      listEl.querySelectorAll('.sa-status').forEach((sel) => sel.onchange = async () => {
        const s = salaires.find(x => x.id === Number(sel.dataset.id));
        if (!s) return;
        s.statut = sel.value;
        await DB.put('salaires', s);
        UI.toast('Statut mis à jour : ' + (s.statut === 'paye' ? 'Payé' : 'En attente') + '.', 'ok');
        renderList();
      });
      listEl.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => {
        const s = salaires.find(x => x.id === Number(b.dataset.del));
        UI.confirm('Supprimer ce versement ?', async () => { await DB.del('salaires', s.id); renderList(); }, { title: 'Supprimer' });
      });
      listEl.querySelectorAll('[data-print]').forEach((b) => b.onclick = () => {
        const s = salaires.find(x => x.id === Number(b.dataset.print));
        const en = enseignants.find(e => e.id === s.enseignantId);
        printSalaire(s, en);
      });
    }
    async function formSalaire() {
      const enseignants = await DB.getAll('enseignants');
      const now = new Date();
      UI.prompt('Verser un salaire', `
        <div class="field"><label>Enseignant *</label><select id="sal-ens">${UI.options(enseignants.map(e => ({ id: e.id, libelle: Data.personneNom(e) })), '', 'Choisir…')}</select></div>
        <div class="row-3">
          <div class="field"><label>Mois *</label><input id="sal-mois" type="number" min="1" max="12" value="${now.getMonth() + 1}" required></div>
          <div class="field"><label>Année *</label><input id="sal-annee" type="number" value="${now.getFullYear()}" required></div>
          <div class="field"><label>Montant *</label><input id="sal-mt" type="number" min="0" required></div>
        </div>
        <div class="row">
          <div class="field"><label>Date de paiement</label><input id="sal-date" type="date" value="${UI.today()}"></div>
          <div class="field"><label>Statut</label><select id="sal-statut">${UI.options([{id:'paye',libelle:'Payé'},{id:'attente',libelle:'En attente'}], 'paye', null)}</select></div>
        </div>
        <div class="field"><label>Note</label><input id="sal-note"></div>
      `, async (body) => {
        const ensId = Number(body.querySelector('#sal-ens').value);
        const mois = Number(body.querySelector('#sal-mois').value);
        const annee = Number(body.querySelector('#sal-annee').value);
        const mt = Number(body.querySelector('#sal-mt').value);
        if (!ensId || !mois || !annee || !(mt >= 0)) { UI.toast('Renseignez tous les champs.', 'err'); return false; }
        await DB.add('salaires', {
          enseignantId: ensId, mois, annee, montant: mt,
          date: body.querySelector('#sal-date').value,
          statut: body.querySelector('#sal-statut').value,
          note: body.querySelector('#sal-note').value.trim(), dateCreation: UI.nowIso()
        });
        UI.closeModal(); UI.toast('Salaire enregistré.', 'ok'); renderList();
        return true;
      });
    }
    root.querySelector('#sa-add').onclick = formSalaire;
  }
});

/* ---------------- Impression reçu de frais ---------------- */
function printRecu(x) {
  const eco = null, eleves = null;
  Promise.all([DB.get('ecole', 1), DB.getAll('eleves'), DB.getAll('typesFrais'), DB.getAll('classes')]).then(([eco, eleves, typesFrais, classes]) => {
    const ev = eleves.find(e => e.id === x.eleveId);
    const tf = typesFrais.find(t => t.id === x.typeFraisId);
    const cl = ev ? classes.find(c => c.id === ev.classeId) : null;
    const n = x.numero || ('R' + new Date(x.date || Date.now()).getTime());
    const html = '<div class="page-bulletin" style="width:90mm;margin:0 auto;font-size:12px">' +
      UI.letterhead(eco, {}, { compact: true }) +
      '<div style="text-align:center;border-top:2px solid #000;margin-top:6px;padding-top:6px"><b>REÇU DE PAIEMENT</b><div>N° ' + UI.esc(n) + '</div></div>' +
      '<table style="width:100%;margin-top:8px">' +
      '<tr><td><b>Reçu de :</b> ' + UI.esc(ev ? Data.personneNom(ev) : '') + '</td></tr>' +
      (cl ? '<tr><td><b>Classe :</b> ' + UI.esc(Data.classeLabel(cl)) + '</td></tr>' : '') +
      '<tr><td><b>Motif :</b> ' + UI.esc(tf ? tf.libelle : '') + '</td></tr>' +
      '<tr><td><b>Date :</b> ' + UI.dateFr(x.date) + '</td></tr>' +
      '</table>' +
      '<div style="margin-top:10px;border-top:1px solid #000;padding-top:6px;display:flex;justify-content:space-between"><b>Montant :</b><b>' + UI.money(x.montant) + '</b></div>' +
      '<div style="margin-top:6px">Mode : ' + UI.esc(x.mode || 'Espèces') + (x.note ? ' · ' + UI.esc(x.note) : '') + '</div>' +
      '</div>';
    UI.print(html, 'Reçu de paiement');
  });
}
/* ---------------- Impression fiche de salaire ---------------- */
function printSalaire(s, en) {
  DB.get('ecole', 1).then((eco) => {
    const html = '<div class="page-bulletin" style="width:100mm;margin:0 auto;font-size:12px">' +
      UI.letterhead(eco, {}, { compact: true }) +
      '<div style="text-align:center;border-top:2px solid #000;margin-top:6px;padding-top:6px"><b>FICHE DE SALAIRE</b></div>' +
      '<table style="width:100%;margin-top:10px">' +
      '<tr><td><b>Enseignant :</b> ' + UI.esc(en ? Data.personneNom(en) : '') + '</td></tr>' +
      '<tr><td><b>Période :</b> ' + UI.esc(s.mois + '/' + s.annee) + '</td></tr>' +
      '<tr><td><b>Date :</b> ' + UI.dateFr(s.date) + '</td></tr>' +
      (s.note ? '<tr><td><b>Note :</b> ' + UI.esc(s.note) + '</td></tr>' : '') +
      '</table>' +
      '<div style="margin-top:14px;border-top:1px solid #000;padding-top:8px;display:flex;justify-content:space-between"><b>Salaire net :</b><b>' + UI.money(s.montant) + '</b></div>' +
      '<div style="margin-top:4px;text-align:right;color:#666">Statut : ' + (s.statut === 'paye' ? 'Payé' : 'En attente') + '</div>' +
      '</div>';
    UI.print(html, 'Fiche de salaire');
  });
}
