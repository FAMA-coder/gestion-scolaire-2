/* ============================================================
   passages.js — Gestion des passages, redoublements, exclusions
   et transferts des élèves/étudiants.
     • Onglet « Configurations » :
         - Ordre (croissant) des niveaux de chaque cycle : il
           détermine la classe directement supérieure (donc quelle
           classe est « au-dessus » de quelle classe).
         - Base de calcul de la moyenne annuelle par cycle :
           • Trimestres (Fondamental 2, Secondaire) : moyenne
             annuelle = moyenne des moyennes de chaque trimestre ;
           • Compositions (Fondamental 1) : moyenne des compositions
             (évaluations mensuelles) ;
           • Modules (Supérieur) : moyenne des moyennes par
             matière/module.
         - Seuils de passage / redoublement / exclusion de la
           moyenne annuelle pour chaque niveau de classe.
     • Onglet « Propositions » : trois listes générées
       automatiquement (selon les configurations) et présentées
       séparément — passages, redoublements, exclusions — pour
       approbation. Après approbation (confirmation des identifiants
       du responsable), les élèves/étudiants sont répartis dans leurs
       classes reçues pour l'année scolaire suivante (la classe cible
       est créée automatiquement si elle n'existe pas encore).
       Les élèves exclus peuvent être réintégrés depuis le bas de
       cet onglet.
     • Onglet « Historique » : tous les mouvements.
     • Onglet « Transferts » : changement de filière OU transfert
       vers une autre école (report du dossier dans la base de
       l'école de destination).
   ============================================================ */

App.register('passages', {
  title: 'Passages & Transferts',
  navLabel: 'Passages',
  icon: 'P',
  group: 'Scolarité',
  perm: 'passages.manage',

  render: async function (root) {
    const TABS = [
      ['config', 'Configurations'],
      ['propositions', 'Propositions'],
      ['historique', 'Historique'],
      ['transferts', 'Transferts']
    ];
    const d = await Data.common();

    // Motif standard : tous les fragments sont rendus à l'avance,
    // l'onglet actif est simplement affiché (class .hidden sur les autres).
    root.innerHTML = '<div class="tabbar">' + TABS.map((t, i) =>
      '<button class="tab' + (i === 0 ? ' active' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>').join('') + '</div>' +
      TABS.map((t, i) => '<div id="pg-frag-' + t[0] + '" class="' + (i === 0 ? '' : 'hidden') + '"></div>').join('');

    root.querySelectorAll('.tabbar .tab').forEach((b) => b.onclick = () => {
      root.querySelectorAll('.tabbar .tab').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      TABS.forEach((t) => root.querySelector('#pg-frag-' + t[0]).classList.toggle('hidden', t[0] !== b.dataset.tab));
    });

    // ---------- Configuration (persistée par école) ----------
    // { seuils : { niveauId -> {p, r, e} }  (seuils par niveau),
    //   ordre  : { cycleId -> [niveauId, ...] } (ordre croissant des niveaux d'un cycle),
    //   bases  : { cycleId -> 'trimestres' | 'compositions' | 'modules' } }
    const CFG_KEY = 'gs_pass_cfg_' + DB.name();
    const DEF_SEUILS = { p: 10, r: 7, e: 5 };
    function cfgLoad() {
      try {
        const raw = localStorage.getItem(CFG_KEY);
        if (raw) {
          const c = JSON.parse(raw);
          return { seuils: c.seuils || {}, ordre: c.ordre || {}, bases: c.bases || {} };
        }
      } catch (e) { /* ignore */ }
      return { seuils: {}, ordre: {}, bases: {} };
    }
    function cfgSave(cfg) { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { /* ignore */ } }

    // ---------- Helpers partagés ----------
    function clOf(cl) { return cl ? Data.classeLabel(cl) : '—'; }
    function seuilsNiv(nivId, cfg) { return Object.assign({}, DEF_SEUILS, cfg.seuils[nivId] || {}); }
    // Base de calcul de la moyenne annuelle pour un cycle.
    function baseCycle(cycle, cfg) {
      if (cycle && cfg.bases[cycle.id]) return cfg.bases[cycle.id];
      const nom = String((cycle && cycle.libelle) || '').toLowerCase();
      if (nom.indexOf('fondamental 1') >= 0 || nom.indexOf('préscolaire') >= 0 || nom.indexOf('maternel') >= 0) return 'compositions';
      if (nom.indexOf('sup') >= 0) return 'modules';
      return 'trimestres';
    }
    const BASE_LABEL = { trimestres: 'Trimestres', compositions: 'Compositions mensuelles', modules: 'Modules (matières)' };
    // Niveaux d'un cycle dans l'ordre croissant configuré (ou ordre de création).
    function niveauxDeCycle(cycleId, cfg) {
      const inCycle = d.niveaux.filter((n) => n.cycleId === Number(cycleId));
      const ord = cfg.ordre[cycleId];
      if (ord && ord.length) {
        return ord.map((id) => inCycle.find((n) => n.id === Number(id))).filter(Boolean);
      }
      return inCycle;
    }
    // Classe directement supérieure : première classe du niveau suivant
    // (même cycle, ordre croissant des niveaux). Renvoie { niveauId, classeId }
    // — classeId peut être null : la classe n'existe pas encore, elle sera
    // créée à l'exécution. null si le niveau courant est le dernier du cycle.
    function cibleNaturelle(cl, cfg) {
      if (!cl) return null;
      const niv = d.niveaux.find((n) => n.id === cl.niveauId);
      if (!niv) return null;
      const liste = niveauxDeCycle(niv.cycleId, cfg);
      const i = liste.findIndex((n) => n.id === cl.niveauId);
      if (i < 0 || i + 1 >= liste.length) return null;
      const next = liste[i + 1];
      const c = d.classes.find((x) => x.niveauId === next.id);
      return { niveauId: next.id, classeId: c ? c.id : null };
    }
    // Crée (si besoin) la première classe du niveau donné et renvoie son id.
    async function assurerClasse(niveauId) {
      const ex = d.classes.find((c) => c.niveauId === Number(niveauId));
      if (ex) return ex.id;
      const niv = d.niveaux.find((n) => n.id === Number(niveauId));
      const cl = { libelle: ((niv && niv.libelle) || 'Classe'), mention: '', dateCreation: UI.nowIso() };
      await DB.add('classes', cl);
      d.classes = await DB.getAll('classes');
      return cl.id;
    }

    // ---------- Moyenne annuelle ----------
    function moy(arr) { return Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 100) / 100; }
    function notesEleves(e) {
      const out = [];
      d.notes.forEach((n) => {
        if (n.eleveId !== e.id) return;
        if (n.valeur != null) {
          const v = Number(n.valeur);
          if (isFinite(v) && v > 0) out.push({ t: n.type === 'composition' ? 'composition' : 'classe', trimestreId: n.trimestreId, matiereId: n.matiereId, v: n.type === 'composition' ? v / 2 : v });
        } else {
          [n.devoir1, n.devoir2, n.composition].forEach((x, i) => {
            const y = Number(x);
            if (isFinite(y) && y > 0) out.push({ t: i === 2 ? 'composition' : 'classe', trimestreId: n.trimestreId, matiereId: n.matiereId, v: i === 2 ? y / 2 : y });
          });
        }
      });
      return out;
    }
    // Moyenne annuelle (/20) selon la base : trimestres, compositions ou modules. null si aucune note.
    function moyEleEvalue(e, base) {
      const notes = notesEleves(e);
      if (!notes.length) return null;
      if (base === 'compositions') {
        const comps = notes.filter((x) => x.t === 'composition');
        const src = comps.length ? comps : notes;
        return moy(src.map((x) => x.v));
      }
      if (base === 'modules') {
        const byMat = {};
        notes.forEach((x) => { (byMat[x.matiereId] = byMat[x.matiereId] || []).push(x.v); });
        return moy(Object.keys(byMat).map((k) => moy(byMat[k])));
      }
      const byTrim = {};
      notes.forEach((x) => { const k = x.trimestreId != null ? x.trimestreId : 'x'; (byTrim[k] = byTrim[k] || []).push(x.v); });
      return moy(Object.keys(byTrim).map((k) => moy(byTrim[k])));
    }
    // Décision selon la moyenne annuelle /20 : ≥ seuil passage → passer ;
    // < seuil exclusion → exclure ; entre les deux → redoubler.
    function decision(m, t) {
      if (m >= t.p) return 'passer';
      if (m < t.e) return 'exclure';
      return 'redoubler';
    }

    // ---------- Autres helpers ----------
    const TYPE_LABEL = { passage: 'Passage', redoublement: 'Redoublement', exclusion: 'Exclusion', reintegration: 'Réintégration', transfert: 'Transfert' };
    const TYPE_BADGE = { passage: 'badge-ok', redoublement: 'badge-warn', exclusion: 'badge-danger', reintegration: 'badge-ok', transfert: 'badge-info' };
    async function ecrireMouvement(m) {
      m.dateCreation = m.dateCreation || UI.nowIso();
      await DB.add('passages', m);
      try { await Auth.log('Mouvement d\'élève', 'passages', (TYPE_LABEL[m.type] || m.type || 'Mouvement') + (m.motif ? ' — ' + m.motif : '')); } catch (e) { /* ignore */ }
    }
    function elevesActifs() { return d.eleves.filter((e) => e.actif !== false); }
    function elevesDe(clId) { return elevesActifs().filter((e) => e.classeId === Number(clId)).sort((a, b) => (a.nom || '').localeCompare(b.nom || '')); }

    // Document imprimable : en-tête d'établissement + corps.
    async function docEnTete(body, titre, sousTitre) {
      const eco = await DB.get('ecole', 1);
      const sub = sousTitre || { label: 'Généré le', value: UI.dateFr(UI.today()) };
      return '<div class="page-bulletin" style="width:210mm;margin:0 auto">' +
        UI.letterhead(eco || { id: 1 }, { title: titre, subtitle: sub }, {}) +
        body + '</div>';
    }

    // ============ CONFIGURATIONS (paramétrage uniquement) ============
    function renderConfig(frag) {
      const cfg = cfgLoad();

      // ---- Section 1 : ordre des niveaux par cycle (croissant) ----
      const ordreHtml = d.cycles.map((cy) => {
        const liste = niveauxDeCycle(cy.id, cfg);
        if (!liste.length) return '';
        const rows = liste.map((n, idx) => {
          const up = idx > 0 ? '<button class="btn btn-xs btn-outline" data-up="' + n.id + '" title="Monter">▲</button>' : '<span class="btn btn-xs btn-outline disabled" style="opacity:.35">▲</span>';
          const dn = idx < liste.length - 1 ? '<button class="btn btn-xs btn-outline" data-dn="' + n.id + '" title="Descendre">▼</button>' : '<span class="btn btn-xs btn-outline disabled" style="opacity:.35">▼</span>';
          return '<tr><td style="width:90px">' + up + ' ' + dn + '</td>' +
            '<td><strong>' + UI.esc(n.libelle || '—') + '</strong></td>' +
            '<td>' + (idx + 1) + ' / ' + liste.length + '</td></tr>';
        }).join('');
        return '<div class="cycle-ordre"><div class="card-title" style="margin-top:6px">' + UI.esc(cy.libelle || 'Cycle') + '</div>' +
          '<div class="table-wrap">' + UI.table(['Ordre', 'Niveau', 'Position'], rows) + '</div></div>';
      }).join('');

      // ---- Section 2 : bases annuelles + seuils par niveau ----
      const baseRows = d.cycles.map((cy) => {
        const cur = baseCycle(cy, cfg);
        return '<div class="row" style="margin-bottom:4px"><div class="field" style="flex:0 0 260px"><label>Base de la moyenne annuelle — ' + UI.esc(cy.libelle || 'Cycle') + '</label>' +
          '<select data-base="' + cy.id + '">' +
          UI.options([{ id: 'trimestres', libelle: 'Trimestres (Fond. 2, Secondaire)' }, { id: 'compositions', libelle: 'Compositions mensuelles (Fond. 1)' }, { id: 'modules', libelle: 'Modules / matières (Supérieur)' }], cur, null) +
          '</select></div></div>';
      }).join('');
      const nivRows = d.niveaux.map((n) => {
        const cy = d.cycles.find((x) => x.id === n.cycleId);
        const t = seuilsNiv(n.id, cfg);
        return '<tr><td><strong>' + UI.esc(n.libelle || '—') + '</strong>' +
          (cy ? '<div class="muted">' + UI.esc(cy.libelle) + '</div>' : '') + '</td>' +
          '<td>' + UI.esc(BASE_LABEL[baseCycle(cy, cfg)] || '—') + '</td>' +
          '<td><input type="number" min="0" max="20" step="0.5" class="slug" data-p="' + n.id + '" value="' + Number(t.p) + '"></td>' +
          '<td><input type="number" min="0" max="20" step="0.5" class="slug" data-r="' + n.id + '" value="' + Number(t.r) + '"></td>' +
          '<td><input type="number" min="0" max="20" step="0.5" class="slug" data-e="' + n.id + '" value="' + Number(t.e) + '"></td></tr>';
      }).join('');

      frag.innerHTML =
        '<div class="card"><div class="card-title">Ordre croissant des niveaux par cycle</div>' +
        '<p class="card-sub">Définissez l\'ordre des niveaux de chaque cycle (du bas vers le haut). Cet ordre détermine la classe directement supérieure d\'un élève lors d\'un passage : le niveau suivant (dans l\'ordre) fournit la classe cible.</p>' +
        (ordreHtml || '<div class="notice">Aucun niveau créé pour le moment (créez d\'abord des cycles et des niveaux dans « Scolarité »).</div>') +
        '</div>' +
        '<div class="bar"><div class="card-title">Moyennes annuelles de passage, redoublement et exclusion</div>' +
        '<p class="card-sub">La moyenne annuelle est calculée — selon le cycle — sur : ' +
        '<b>trimestres</b> (moyenne des moyennes de chaque trimestre, Fondamental 2 / Secondaire), ' +
        '<b>compositions</b> (évaluations mensuelles, Fondamental 1) ou ' +
        '<b>modules</b> (moyenne des moyennes par matière/module, Supérieur).</p>' +
        '<p class="card-sub">Décision : moyenne <b>≥ seuil de passage</b> ⇒ passer ; moyenne <b>< seuil d\'exclusion</b> ⇒ exclure ; entre les deux ⇒ redoubler. Le seuil de redoublement est fixé pour information (il doit rester entre exclusion et passage).</p>' +
        '<div class="card-title" style="margin-top:10px">Base de calcul par cycle</div>' + baseRows +
        '<div class="table-wrap" id="pcf-niv"></div>' +
        '<div class="filter-bar" style="margin-top:12px">' +
          '<button class="btn btn-primary" id="pcf-save">Enregistrer les configurations</button>' +
          '<button class="btn btn-ghost" id="pcf-reset">Rétablir les valeurs par défaut</button>' +
        '</div></div>';

      frag.querySelector('#pcf-niv').innerHTML =
        UI.table(['Niveau', 'Base de calcul', 'Seuil passage (≥)', 'Seuil redoublement', 'Seuil exclusion (<)'],
          nivRows || UI.empty(5));

      // ---- boutons ordre ----
      frag.querySelectorAll('[data-up], [data-dn]').forEach((b) => b.onclick = () => {
        const nivId = Number(b.dataset.up || b.dataset.dn);
        const isUp = !!b.dataset.up;
        const niv = d.niveaux.find((n) => n.id === nivId);
        if (!niv) return;
        const cycleId = niv.cycleId;
        const current = niveauxDeCycle(cycleId, cfg);
        const idx = current.findIndex((n) => n.id === nivId);
        if (idx < 0) return;
        const swap = isUp ? idx - 1 : idx + 1;
        if (swap < 0 || swap >= current.length) return;
        const arr = current.slice();
        const tmp = arr[idx]; arr[idx] = arr[swap]; arr[swap] = tmp;
        cfg.ordre[cycleId] = arr.map((n) => n.id);
        cfgSave(cfg);
        renderConfig(frag);
      });

      // ---- enregistrement ----
      frag.querySelector('#pcf-save').onclick = () => {
        const newCfg = cfgLoad();
        d.cycles.forEach((cy) => {
          const sel = frag.querySelector('[data-base="' + cy.id + '"]');
          if (sel) newCfg.bases[cy.id] = sel.value;
        });
        let ok = true;
        d.niveaux.forEach((n) => {
          const pInp = frag.querySelector('[data-p="' + n.id + '"]');
          const rInp = frag.querySelector('[data-r="' + n.id + '"]');
          const eInp = frag.querySelector('[data-e="' + n.id + '"]');
          const p = Math.max(0, Math.min(20, Number(pInp && pInp.value) || DEF_SEUILS.p));
          const r = Math.max(0, Math.min(20, Number(rInp && rInp.value) || DEF_SEUILS.r));
          const e = Math.max(0, Math.min(20, Number(eInp && eInp.value) || DEF_SEUILS.e));
          if (!(e <= r && r <= p && e < p)) {
            UI.toast('Seuils invalides pour le niveau « ' + (n.libelle || n.id) + ' » : il faut exclusion ≤ redoublement ≤ passage (et exclusion < passage).', 'err');
            ok = false;
            return;
          }
          newCfg.seuils[n.id] = { p: p, r: r, e: e };
        });
        if (!ok) return;
        if (newCfg.ordre && !Object.keys(newCfg.ordre).length) delete newCfg.ordre;
        if (newCfg.bases && !Object.keys(newCfg.bases).length) delete newCfg.bases;
        cfgSave(newCfg);
        UI.toast('Configurations enregistrées.', 'ok');
        renderConfig(frag);
      };
      frag.querySelector('#pcf-reset').onclick = () => {
        cfgSave({ seuils: {}, ordre: {}, bases: {} });
        UI.toast('Configurations rétablies aux valeurs par défaut.', 'ok');
        renderConfig(frag);
      };
    }

    // ============ PROPOSITIONS (3 listes séparées + approbation) ============
    function plan(cfg) {
      const out = { passer: [], redoubler: [], exclure: [], finc: [], none: [] };
      elevesActifs().forEach((e) => {
        const cl = d.classes.find((c) => c.id === e.classeId);
        const niv = cl ? d.niveaux.find((x) => x.id === cl.niveauId) : null;
        const cy = niv ? d.cycles.find((x) => x.id === niv.cycleId) : null;
        const base = cy ? baseCycle(cy, cfg) : 'trimestres';
        const m = moyEleEvalue(e, base);
        if (m == null) { out.none.push({ e: e, m: null, cl: cl, base: base }); return; }
        const t = seuilsNiv(niv ? niv.id : null, cfg);
        const cat = decision(m, t);
        if (cat === 'passer') {
          const cible = cibleNaturelle(cl, cfg);
          if (!cible) { out.finc.push({ e: e, m: m, cl: cl, base: base, t: t }); return; }
          out.passer.push({ e: e, m: m, cl: cl, base: base, t: t, cibleClasse: cible.classeId, cibleNiveau: d.niveaux.find((n) => n.id === cible.niveauId) });
        } else if (cat === 'exclure') out.exclure.push({ e: e, m: m, cl: cl, base: base, t: t });
        else out.redoubler.push({ e: e, m: m, cl: cl, base: base, t: t });
      });
      Object.keys(out).forEach((k) => out[k].sort((a, b) => (a.cl && b.cl ? a.cl.id - b.cl.id : 0) || (a.e.nom || '').localeCompare(b.e.nom || '')));
      return out;
    }

    function renderPropositions(frag) {
      function formatMoy(m) { return m == null ? '—' : UI.esc(m.toFixed(2).replace('.', ',')) + ' / 20'; }
      const onClickBtn = (ev) => {
        if (!ev.target) return;
        if (ev.target.id === 'pgp-approve') { approuver(); return; }
        if (ev.target.id === 'pgp-print') { printListes(); return; }
        const b = ev.target.closest ? ev.target.closest('[data-all], [data-none], [data-printsec]') : null;
        if (!b) return;
        if (b.hasAttribute('data-printsec')) { printSec(b.getAttribute('data-printsec')); return; }
        const on = b.hasAttribute('data-all');
        const key = b.getAttribute('data-all') || b.getAttribute('data-none');
        frag.querySelectorAll('.pga-check[data-cat="' + key + '"]').forEach((x) => { x.checked = on; });
        recount();
      };
      const onChangeCheck = (ev) => { if (ev.target && ev.target.classList && ev.target.classList.contains('pga-check')) recount(); };
      function baseLab(it, cfg) {
        const cl = it.cl || null;
        const niv = cl ? d.niveaux.find((x) => x.id === cl.niveauId) : null;
        const cy = niv ? d.cycles.find((x) => x.id === niv.cycleId) : null;
        return UI.esc((niv ? niv.libelle : '—') + (cy ? ' · ' + BASE_LABEL[baseCycle(cy, cfg)] : ''));
      }
      // Une ligne cochable d'une des trois listes.
      function ligne(key, it, cfg) {
        let rule = '', cible = '';
        if (key === 'passer') {
          rule = '≥ ' + it.t.p + '/20';
          const cn = d.classes.find((c) => c.id === it.cibleClasse);
          cible = cn ? UI.esc(clOf(cn)) : (it.cibleNiveau ? UI.esc(it.cibleNiveau.libelle || '—') + ' <span class="muted">(classe à créer)</span>' : '—');
        } else if (key === 'redoubler') {
          rule = it.t.e + ' ≤ moyenne < ' + it.t.p;
          cible = UI.esc(clOf(it.cl)) + ' <span class="muted">(conservée)</span>';
        } else if (key === 'exclure') {
          rule = '< ' + it.t.e + '/20';
          cible = '—';
        }
        return '<tr>' +
          '<td><input type="checkbox" class="pga-check" data-cat="' + key + '" data-id="' + it.e.id + '" checked></td>' +
          '<td><strong>' + UI.esc(Data.personneNom(it.e)) + '</strong></td>' +
          '<td>' + UI.esc(it.e.matricule || '–') + '</td>' +
          '<td>' + UI.esc(clOf(it.cl)) + '</td>' +
          '<td>' + baseLab(it, cfg) + '</td>' +
          '<td>' + formatMoy(it.m) + '</td>' +
          '<td>' + UI.esc(rule) + '</td>' +
          '<td>' + cible + '</td></tr>';
      }
      function section(key, titre, badge, items, cfg, cols) {
        const rows = items.map((it) => ligne(key, it, cfg)).join('');
        return '<div class="bar"><div class="bar-head"><div class="card-title">' + titre +
          ' <span class="badge ' + badge + '">' + items.length + '</span></div>' +
          '<div>' +
            '<span class="hint" style="margin-right:8px">Sélection :</span>' +
            '<button class="btn btn-sm btn-outline" data-all="' + key + '">Tout cocher</button> ' +
            '<button class="btn btn-sm btn-ghost" data-none="' + key + '">Décocher</button> ' +
            '<button class="btn btn-sm btn-outline" data-printsec="' + key + '" title="Imprimer cette liste">Imprimer</button>' +
          '</div></div>' +
          '<div class="table-wrap">' + UI.table(['', 'Élève / Étudiant', 'Matricule', 'Classe actuelle', 'Niveau · Base', 'Moyenne annuelle', 'Règle', 'Classe reçue (année suivante)'], rows || UI.empty(cols)) + '</div></div>';
      }
      function nomsCaps(arr) {
        return arr.slice(0, 5).map((x) => Data.personneNom(x.e)).join(', ') + (arr.length > 5 ? ', …' : '');
      }

      // Ligne prête à imprimer (sans cases à cocher). cible texte pur.
      function lignePrint(it, key, cfg) {
        let rule = '', cible = '';
        if (key === 'passer') {
          rule = '≥ ' + it.t.p + '/20';
          const cn = d.classes.find((c) => c.id === it.cibleClasse);
          cible = cn ? clOf(cn) : (it.cibleNiveau ? it.cibleNiveau.libelle + ' (classe à créer)' : '—');
        } else if (key === 'redoubler') {
          rule = it.t.e + ' ≤ moyenne < ' + it.t.p;
          cible = clOf(it.cl) + ' (conservée)';
        } else if (key === 'exclure') {
          rule = '< ' + it.t.e + '/20';
          cible = '—';
        }
        return '<tr>' +
          '<td>' + UI.esc(Data.personneNom(it.e)) + '</td>' +
          '<td>' + UI.esc(it.e.matricule || '–') + '</td>' +
          '<td>' + UI.esc(clOf(it.cl)) + '</td>' +
          '<td>' + UI.esc(baseLab(it, cfg)) + '</td>' +
          '<td class="num">' + (it.m == null ? '—' : it.m.toFixed(2).replace('.', ',') + ' / 20') + '</td>' +
          '<td class="num">' + UI.esc(rule) + '</td>' +
          '<td>' + UI.esc(cible) + '</td></tr>';
      }
      const PPTITRES = { passer: 'Liste des passages proposés', redoubler: 'Liste des redoublements proposés', exclure: 'Liste des exclusions proposées' };
      const PPNOTES = {
        passer: 'Moyenne annuelle ≥ seuil de passage — répartition dans la classe reçue pour l\'année scolaire suivante.',
        redoubler: 'Moyenne annuelle entre le seuil d\'exclusion (<) et le seuil de passage — classe conservée pour l\'année scolaire suivante.',
        exclure: 'Moyenne annuelle sous le seuil d\'exclusion.'
      };
      async function printSec(key) {
        const cfg = cfgLoad();
        const p = plan(cfg);
        const titre = PPTITRES[key] || 'Liste';
        let body = '<h3 style="margin:0 0 6px">' + titre + '</h3>';
        const items = p[key];
        if (!items.length) body += '<p class="muted" style="margin:4px 0">Aucun élève concerné.</p>';
        else {
          body += '<p class="muted" style="margin:2px 0 8px">' + (PPNOTES[key] || '') + ' — ' + items.length + ' élève(s)/étudiant(s).</p>' +
            '<table class="tbl"><thead><tr><th>Élève / Étudiant</th><th>Matricule</th><th>Classe actuelle</th><th>Niveau · Base</th><th>Moyenne annuelle</th><th>Règle</th><th>Classe reçue</th></tr></thead><tbody>' +
            items.map((it) => lignePrint(it, key, cfg)).join('') + '</tbody></table>';
        }
        const html = await docEnTete(body, titre, { label: 'Généré le', value: UI.dateFr(UI.today()) });
        UI.print(html, titre);
      }
      async function printListes() {
        const cfg = cfgLoad();
        const p = plan(cfg);
        let body = '';
        ['passer', 'redoubler', 'exclure'].forEach((key) => {
          const items = p[key];
          body += '<h3 style="margin:10px 0 6px">' + (PPTITRES[key]) + '</h3>';
          if (!items.length) { body += '<p class="muted" style="margin:4px 0 10px">Aucun élève concerné.</p>'; return; }
          body += '<p class="muted" style="margin:2px 0 8px">' + PPNOTES[key] + ' — ' + items.length + ' élève(s)/étudiant(s).</p>' +
            '<table class="tbl" style="margin-bottom:14px"><thead><tr><th>Élève / Étudiant</th><th>Matricule</th><th>Classe actuelle</th><th>Niveau · Base</th><th>Moyenne annuelle</th><th>Règle</th><th>Classe reçue</th></tr></thead><tbody>' +
            items.map((it) => lignePrint(it, key, cfg)).join('') + '</tbody></table>';
        });
        if (p.finc.length) body += '<p class="muted">Fin de cycle (aucun niveau supérieur) — ' + nomsCaps(p.finc) + ' : à régulariser manuellement.</p>';
        if (p.none.length) body += '<p class="muted">Non évalués (aucune note) — ' + nomsCaps(p.none) + ' : à régulariser manuellement.</p>';
        body += '<div style="margin-top:36px;display:flex;justify-content:space-between;gap:40px">' +
          '<div style="flex:1;border-top:1px solid #999;padding-top:6px;text-align:center">Le responsable — signature</div>' +
          '<div style="flex:1;border-top:1px solid #999;padding-top:6px;text-align:center">Date</div></div>';
        const html = await docEnTete(body, 'Propositions de passages, redoublements et exclusions', { label: 'Généré le', value: UI.dateFr(UI.today()) });
        UI.print(html, 'Propositions de passages');
      }

      function renderListe() {
        const cfg = cfgLoad();
        const p = plan(cfg);
        frag.querySelector('#pgp-sec-passer').innerHTML = section('passer', 'Liste des passages', 'badge-ok', p.passer, cfg, 8);
        frag.querySelector('#pgp-sec-redoubler').innerHTML = section('redoubler', 'Liste des redoublements', 'badge-warn', p.redoubler, cfg, 8);
        frag.querySelector('#pgp-sec-exclure').innerHTML = section('exclure', 'Liste des exclusions', 'badge-danger', p.exclure, cfg, 8);
        let annexe = '';
        if (p.finc.length) annexe += '<div class="notice">Fin du cycle d\'études — aucun niveau supérieur dans le cycle (moyenne ≥ ' + p.finc[0].t.p + '/20) : ' + nomsCaps(p.finc) + '. Aucune action automatique.</div>';
        if (p.none.length) annexe += '<div class="notice">Non évalués — aucune note saisie pour la période : ' + nomsCaps(p.none) + '. Aucune action automatique.</div>';
        frag.querySelector('#pgp-annexe').innerHTML = annexe;
        recount();
      }

      function recapText(items) {
        const counts = { passer: 0, redoubler: 0, exclure: 0 };
        items.forEach((x) => { if (counts[x.cat] != null) counts[x.cat] += 1; });
        const parts = [];
        if (counts.passer) parts.push(counts.passer + ' passage(s) — répartis dans leurs classes reçues pour l\'année suivante');
        if (counts.redoubler) parts.push(counts.redoubler + ' redoublement(s)');
        if (counts.exclure) parts.push(counts.exclure + ' exclusion(s)');
        return parts.join(', ') || 'aucune opération';
      }

      const $appr = () => frag.querySelector('#pgp-approve');
      function recount() {
        const a = $appr();
        if (!a) return;
        const n = frag.querySelectorAll('.pga-check:checked').length;
        a.innerHTML = n ? 'Approuver et exécuter la sélection (' + n + ')' : 'Approuver et exécuter la sélection';
        a.disabled = !n;
      }

      async function approuver() {
        const chosen = [];
        frag.querySelectorAll('.pga-check:checked').forEach((cb) => {
          const e = d.eleves.find((x) => x.id === Number(cb.dataset.id));
          if (e) chosen.push({ e: e, cat: cb.dataset.cat });
        });
        if (!chosen.length) { UI.toast('Aucun élève sélectionné.', 'err'); return; }
        const recap = recapText(chosen);
        const ok = await approbationResponsable(recap + '.');
        if (!ok) return;
        try {
          let nPass = 0, nRed = 0, nExc = 0;
          const cfgX = cfgLoad();
          for (const item of chosen) {
            const e = item.e;
            if (item.cat === 'passer') {
              const cl = d.classes.find((c) => c.id === e.classeId);
              const cible = cibleNaturelle(cl, cfgX);
              if (!cible) continue;
              const cibleClasse = cible.classeId ? cible.classeId : await assurerClasse(cible.niveauId);
              const de = e.classeId;
              e.classeId = cibleClasse;
              e.datePassage = UI.nowIso();
              await DB.put('eleves', e);
              await ecrireMouvement({ eleveId: e.id, deClasseId: de, versClasseId: cibleClasse, anneeId: null, type: 'passage', motif: 'Réparti en ' + clOf(d.classes.find((c) => c.id === cibleClasse)) + ' pour l\'année scolaire suivante' });
              nPass += 1;
            } else if (item.cat === 'redoubler') {
              e.datePassage = null;
              await DB.put('eleves', e);
              await ecrireMouvement({ eleveId: e.id, deClasseId: e.classeId, versClasseId: e.classeId, anneeId: null, type: 'redoublement', motif: 'Conserve sa classe pour l\'année scolaire suivante' });
              nRed += 1;
            } else if (item.cat === 'exclure') {
              const motif = 'Exclusion automatique (moyenne annuelle sous le seuil)';
              e.actif = false;
              e.exclusion = { date: UI.nowIso(), motif: motif };
              await DB.put('eleves', e);
              await ecrireMouvement({ eleveId: e.id, deClasseId: e.classeId, versClasseId: null, anneeId: null, type: 'exclusion', motif: motif });
              nExc += 1;
            }
          }
          d.eleves = await DB.getAll('eleves');
          d.classes = await DB.getAll('classes');
          const done = [nPass ? nPass + ' passage(s)' : '', nRed ? nRed + ' redoublement(s)' : '', nExc ? nExc + ' exclusion(s)' : ''].filter(Boolean).join(', ');
          try { await Auth.log('Approbation passages', 'passages', 'Exécution approuvée : ' + (done || 'aucune opération effective') + '.'); } catch (e2) { /* ignore */ }
          UI.toast('Élèves répartis : ' + (done || 'aucune opération effective') + '.', 'ok');
          renderPropositions(frag);
        } catch (e3) { UI.toast('Erreur pendant l\'exécution : ' + e3.message, 'err'); }
      }
      if (frag._pgpHands) {
        frag.removeEventListener('click', frag._pgpHands.click);
        frag.removeEventListener('change', frag._pgpHands.change);
      }
      frag.addEventListener('click', onClickBtn);
      frag.addEventListener('change', onChangeCheck);
      frag._pgpHands = { click: onClickBtn, change: onChangeCheck };

      // ---- section réintégrations (élèves exclus) ----
      const excl = d.eleves.filter((e) => e.actif === false && e.exclusion);
      const exclRows = excl.map((e) => {
        const cl = d.classes.find((c) => c.id === e.classeId);
        const x = e.exclusion || {};
        return '<tr><td><strong>' + UI.esc(Data.personneNom(e)) + '</strong></td>' +
          '<td>' + UI.esc(e.matricule || '–') + '</td>' +
          '<td>' + UI.esc(clOf(cl)) + '</td>' +
          '<td>' + (x.date ? UI.dateFr(x.date.slice(0, 10)) : '') + '</td>' +
          '<td>' + UI.esc(x.motif || '–') + '</td>' +
          '<td class="actions-cell"><button class="btn btn-sm btn-ok" data-reint="' + e.id + '">Réintégrer</button></td></tr>';
      }).join('');

      frag.innerHTML =
        '<div class="card"><div class="bar-head" style="margin-bottom:8px"><div class="card-title">Génération des propositions (automatique)</div>' +
        '<button class="btn btn-outline" id="pgp-print">Imprimer les listes</button></div>' +
        '<p class="card-sub">Les listes ci-dessous sont générées automatiquement selon l\'ordre des niveaux, la base de calcul et les seuils définis dans l\'onglet « Configurations ». ' +
        'Cochez les élèves/étudiants que vous approuvez, puis cliquez sur « Approuver et exécuter la sélection » : après confirmation de vos identifiants, chacun est réparti dans sa classe reçue pour l\'année scolaire suivante (la classe cible est créée si elle n\'existe pas encore).</p>' +
        '<div id="pgp-sec-passer"></div>' +
        '<div id="pgp-sec-redoubler"></div>' +
        '<div id="pgp-sec-exclure"></div>' +
        '<div id="pgp-annexe"></div>' +
        '<div class="filter-bar" style="margin-top:12px">' +
          '<span class="hint">Sélection globale :</span>' +
          '<button class="btn btn-sm btn-outline" id="pgp-all">Tout cocher</button>' +
          '<button class="btn btn-sm btn-ghost" id="pgp-none">Décocher</button>' +
          '<span class="spacer"></span>' +
          '<button class="btn btn-primary" id="pgp-approve">Approuver et exécuter la sélection</button>' +
        '</div></div>' +
        '<div class="bar"><div class="card-title">Élèves / étudiants exclus et réintégrables (' + excl.length + ')</div>' +
        '<div class="table-wrap">' + UI.table(['Élève', 'Matricule', 'Dernière classe', 'Date', 'Motif', 'Actions'], exclRows || UI.empty(6)) + '</div></div>';

      frag.querySelectorAll('[data-reint]').forEach((b) => b.onclick = () => {
        const e = d.eleves.find((x) => x.id === Number(b.dataset.reint));
        UI.confirm('Réintégrer « ' + Data.personneNom(e) + ' » dans ' + UI.esc(clOf(d.classes.find((c) => c.id === e.classeId))) + ' ?', async () => {
          e.actif = true;
          const hist = e.exclusion;
          delete e.exclusion;
          await DB.put('eleves', e);
          await ecrireMouvement({ eleveId: e.id, deClasseId: null, versClasseId: e.classeId, anneeId: null, type: 'reintegration', motif: hist && hist.motif });
          UI.toast('Élève réintégré.', 'ok');
          d.eleves = await DB.getAll('eleves');
          renderPropositions(frag);
        }, { title: 'Réintégration' });
      });

      // Sélection globale (les boutons par section sont gérés par délégation).
      frag.querySelector('#pgp-all').onclick = () => { frag.querySelectorAll('.pga-check').forEach((x) => x.checked = true); recount(); };
      frag.querySelector('#pgp-none').onclick = () => { frag.querySelectorAll('.pga-check').forEach((x) => x.checked = false); recount(); };

      renderListe();
    }

    // Approbation : confirmation des identifiants du responsable (toujours requise).
    function approbationResponsable(recap) {
      const u = Auth.currentUser();
      if (!u) { UI.toast('Session expirée, reconnectez-vous.', 'err'); return Promise.resolve(false); }
      return new Promise((resolve) => {
        UI.prompt('Approbation du responsable', `
          <p class="hint">Opération sensible : ${UI.esc(recap)}</p>
          <div class="notice">Cette liste a été générée automatiquement selon les configurations (ordre des niveaux, base de calcul, seuils). Une fois confirmée, chaque élève/étudiant sera réparti dans sa classe reçue pour l'année scolaire suivante et l'opération sera consignée dans l'historique.</div>
          <p class="hint">Pour exécuter, confirmez vos identifiants (${UI.esc(Auth.roleName(u.role))}).</p>
          <div class="field"><label>Identifiant *</label><input id="wg-user" autocomplete="username"></div>
          <div class="field"><label>Mot de passe *</label><input id="wg-pass" type="password" autocomplete="current-password"></div>
        `, async (body) => {
          const un = (body.querySelector('#wg-user').value || '').trim();
          const pw = body.querySelector('#wg-pass').value || '';
          if (!un || !pw) { UI.toast('Identifiant et mot de passe requis.', 'err'); return false; }
          const users = (await DB.getAll('users')) || [];
          const match = users.find((x) => x.id === u.id && x.actif !== false && (x.username || '').toLowerCase() === un.toLowerCase());
          if (!match) { UI.toast('Identifiant incorrect.', 'err'); return false; }
          if (Auth.hashPassword(pw, match.salt) !== match.passwordHash) { UI.toast('Mot de passe incorrect.', 'err'); return false; }
          UI.closeModal();
          resolve(true);
          return true;
        }, { size: 'modal modal-sm' });
      });
    }

    // ============ HISTORIQUE ============
    async function renderHistorique(frag) {
      const passages = await DB.getAll('passages');
      frag.innerHTML = '<div class="filter-bar">' +
        '<div class="field"><label>Mouvement</label><select id="pgh-type"></select></div>' +
        '<div class="field"><label>Classe</label><select id="pgh-classe"></select></div>' +
        '<button class="btn btn-outline" id="pgh-print">Imprimer (par classe)</button>' +
        '</div><div id="pgh-list"></div>';
      const typeSel = frag.querySelector('#pgh-type');
      const classeSel = frag.querySelector('#pgh-classe');
      let selType = '';
      let selClasse = '';
      typeSel.innerHTML = UI.options([
        { id: '', libelle: 'Tous les mouvements' },
        { id: 'passage', libelle: 'Passages' },
        { id: 'redoublement', libelle: 'Redoublements' },
        { id: 'transfert', libelle: 'Transferts' },
        { id: 'exclusion', libelle: 'Exclusions' },
        { id: 'reintegration', libelle: 'Réintégrations' }
      ], selType, null);
      classeSel.innerHTML = UI.options(d.classes.map((c) => ({ id: c.id, libelle: clOf(c) })), '', 'Toutes les classes');
      typeSel.onchange = (e) => { selType = e.target.value; render(); };
      classeSel.onchange = (e) => { selClasse = e.target.value; render(); };
      frag.querySelector('#pgh-print').onclick = imprimerMouvements;
      function render() {
        const list = passages.filter((p) => (!selType || p.type === selType) &&
          (!selClasse || Number(p.deClasseId) === Number(selClasse) || Number(p.versClasseId) === Number(selClasse)))
          .slice().sort((a, b) => (a.dateCreation || '').localeCompare(b.dateCreation || '')).reverse();
        const rows = list.map((p) => {
          const ev = d.eleves.find((x) => x.id === p.eleveId);
          const dc = d.classes.find((c) => c.id === p.deClasseId);
          const vc = d.classes.find((c) => c.id === p.versClasseId);
          const detail = [];
          if (p.transfertType === 'filiere') detail.push('Changement de filière');
          if (p.transfertType === 'ecole_entree' || p.transfertType === 'ecole_sortie') detail.push(p.motif || 'Transfert entre écoles');
          if (p.type === 'exclusion') detail.push('Motif : ' + (p.motif || '—'));
          if (p.type === 'reintegration') detail.push(p.motif ? 'Après exclusion : ' + p.motif : '');
          return '<tr><td>' + (p.dateCreation ? UI.dateFr(p.dateCreation.slice(0, 10)) : '–') + '</td>' +
            '<td><strong>' + UI.esc(ev ? Data.personneNom(ev) : 'Élève supprimé') + '</strong></td>' +
            '<td><span class="badge ' + (TYPE_BADGE[p.type] || 'badge-gray') + '">' + (TYPE_LABEL[p.type] || p.type || '—') + '</span></td>' +
            '<td>' + UI.esc(dc ? clOf(dc) : '—') + '</td>' +
            '<td>' + UI.esc(vc ? clOf(vc) : '—') + '</td>' +
            '<td>' + UI.esc(detail.filter(Boolean).join(' · ')) + '</td></tr>';
        }).join('');
        frag.querySelector('#pgh-list').innerHTML = UI.table(['Date', 'Élève', 'Mouvement', 'De', 'Vers', 'Détail'], rows || UI.empty(6));
      }
      async function imprimerMouvements() {
        const sType = typeSel.value;
        const sClasse = classeSel.value;
        const list = passages.filter((p) => (!sType || p.type === sType) &&
          (!sClasse || Number(p.deClasseId) === Number(sClasse) || Number(p.versClasseId) === Number(sClasse)))
          .slice().sort((a, b) => (a.dateCreation || '').localeCompare(b.dateCreation || ''));
        const groupe = {};
        list.forEach((p) => { const k = p.deClasseId != null ? p.deClasseId : p.versClasseId; (groupe[k] = groupe[k] || []).push(p); });
        const clefs = Object.keys(groupe).map(Number);
        clefs.sort((a, b) => clOf(d.classes.find((c) => c.id === a)).localeCompare(clOf(d.classes.find((c) => c.id === b))));
        let body = '';
        if (!list.length) body = '<p class="muted">Aucun mouvement pour ces critères.</p>';
        else clefs.forEach((k) => {
          const cl = d.classes.find((c) => c.id === k);
          const rows = groupe[k].map((p) => {
            const ev = d.eleves.find((x) => x.id === p.eleveId);
            const dc = d.classes.find((c) => c.id === p.deClasseId);
            const vc = d.classes.find((c) => c.id === p.versClasseId);
            const detail = [];
            if (p.transfertType === 'filiere') detail.push('Changement de filière');
            if (p.transfertType === 'ecole_entree' || p.transfertType === 'ecole_sortie') detail.push(p.motif || 'Transfert entre écoles');
            if (p.type === 'exclusion') detail.push('Motif : ' + (p.motif || '—'));
            if (p.type === 'reintegration') detail.push(p.motif ? 'Après exclusion : ' + p.motif : '');
            return '<tr><td>' + (p.dateCreation ? UI.dateFr(p.dateCreation.slice(0, 10)) : '–') + '</td>' +
              '<td>' + UI.esc(ev ? Data.personneNom(ev) : 'Élève supprimé') + '</td>' +
              '<td>' + UI.esc(TYPE_LABEL[p.type] || p.type || '—') + '</td>' +
              '<td>' + UI.esc(dc ? clOf(dc) : '—') + '</td>' +
              '<td>' + UI.esc(vc ? clOf(vc) : '—') + '</td>' +
              '<td>' + UI.esc(detail.filter(Boolean).join(' · ')) + '</td></tr>';
          }).join('');
          body += '<h3 style="margin:0 0 6px">Classe ' + UI.esc(clOf(cl)) + ' — ' + groupe[k].length + ' mouvement(s)</h3>' +
            '<table class="tbl" style="margin-bottom:16px"><thead><tr><th>Date</th><th>Élève</th><th>Mouvement</th><th>De</th><th>Vers</th><th>Détail</th></tr></thead><tbody>' + rows + '</tbody></table>';
        });
        const html = await docEnTete(body, 'Registre des mouvements (passages, redoublements, exclusions, transferts)',
          { label: 'Critères', value: (sType ? (TYPE_LABEL[sType] || sType) : 'Tous les mouvements') + (sClasse ? ' · ' + clOf(d.classes.find((c) => c.id === Number(sClasse))) : '') });
        UI.print(html, 'Registre des mouvements');
      }
      render();
    }

    // ============ TRANSFERTS (filière / autre école) ============
    function renderTransferts(frag) {
      const notice = (html) => { frag.innerHTML = '<div class="notice">' + html + '</div>'; };
      let tabX = 'filiere';
      let selClasse = '';
      let destClasse = '';
      let destEcole = '';
      let destData = { classes: [], eleves: [] };
      async function loadEcoleClasses() {
        try {
          if (!destEcole) { destData = { classes: [], eleves: [] }; refreshEcole(); return; }
          const school = await Meta.getSchool(destEcole);
          destData.classes = school ? await Meta.readStoreRaw(Meta.dbNameFor(school), 'classes') : [];
          refreshEcole();
        } catch (e) { destData = { classes: [], eleves: [] }; refreshEcole(); }
      }
      function refreshEcole() {
        const classeEl = frag.querySelector('#pgt-classe');
        if (classeEl) classeEl.innerHTML = UI.options(d.classes.map((c) => ({ id: c.id, libelle: clOf(c) })), selClasse, 'Choisir…');
        const destEl = frag.querySelector('#pgt-dest-classe');
        const info = frag.querySelector('#pgt-dest-info');
        if (destEl) destEl.innerHTML = UI.options(destData.classes.map((c) => ({ id: c.id, libelle: clOf(c) })), destClasse, 'Choisir…');
        if (info) info.innerHTML = destData.classes.length ? '' :
          '<div class="notice">L\'école de destination ne contient encore aucune classe. Créez-y d\'abord des classes (via le panneau d\'administration des écoles).</div>';
      }

      // Imprime la liste des élèves concernés (sélection cochée sinon toute la classe).
      async function printListeTransfert(list, contexte) {
        const sel = list.filter((e) => { const cb = frag.querySelector('.pgt-check[data-id="' + e.id + '"]'); return cb && cb.checked; });
        const items = sel.length ? sel : list;
        const rows = items.map((e) => '<tr>' +
          '<td>' + UI.esc(Data.personneNom(e)) + '</td>' +
          '<td>' + UI.esc(e.matricule || '–') + '</td>' +
          '<td>' + UI.esc(clOf(d.classes.find((c) => c.id === e.classeId))) + '</td>' +
          '<td>' + UI.esc((d.classes.find((c) => c.id === e.classeId) || {}).mention || '—') + '</td></tr>').join('');
        const body = '<p class="muted" style="margin:0 0 8px">' + items.length + ' élève(s)' +
          (items.length !== list.length ? ' sélectionné(s) sur ' + list.length : '') + ' — ' + UI.esc(contexte) + '.</p>' +
          '<table class="tbl"><thead><tr><th>Élève / Étudiant</th><th>Matricule</th><th>Classe actuelle</th><th>Filière / Mention</th></tr></thead><tbody>' +
          (rows || '<tr><td colspan="4">Aucun élève.</td></tr>') + '</tbody></table>';
        const html = await docEnTete(body, 'Liste de transfert', { label: 'Généré le', value: UI.dateFr(UI.today()) });
        UI.print(html, 'Liste de transfert');
      }
      function printListeF(list) {
        const dest = d.classes.find((c) => c.id === destClasse);
        const fromCl = d.classes.find((c) => c.id === selClasse);
        printListeTransfert(list, 'Transfert de filière : ' + clOf(fromCl) + ' → ' + (dest ? clOf(dest) : 'destination à choisir'));
      }
      function printListeE(list) {
        const classeDst = destData.classes.find((c) => c.id === destClasse);
        printListeTransfert(list, 'Transfert vers l\'école de destination' + (classeDst ? ' (classe « ' + clOf(classeDst) + ' »)' : ''));
      }

      function renderFiliereUI() {
        try {
          frag.innerHTML =
            '<div class="filter-bar">' +
              '<div class="field"><label>Mode</label>' +
                '<select id="pgt-mode"><option value="filiere">Filière → Filière (même école)</option><option value="ecole">École → Autre école</option></select></div>' +
              '<div class="field"><label>Classe d\'origine</label><select id="pgt-classe"></select></div>' +
              '<div class="field"><label>Classe de destination (filière)</label><select id="pgt-dest-classe"></select></div>' +
            '</div>' +
            '<p class="hint" style="margin:8px 0">Un transfert de filière déplace un élève/étudiant vers une autre classe (éventuellement d\'une autre filière/mention ou d\'un autre cycle), tout en restant dans le même établissement.</p>' +
            '<div id="pgt-list"></div>';
          frag.querySelector('#pgt-mode').value = 'filiere';
          frag.querySelector('#pgt-mode').onchange = (e) => { tabX = e.target.value; if (tabX === 'ecole') renderEcoleUI(); else renderFiliereUI(); };
          frag.querySelector('#pgt-classe').innerHTML = UI.options(d.classes.map((c) => ({ id: c.id, libelle: clOf(c) })), selClasse, 'Choisir…');
          const setDest = () => {
            const opts = d.classes.filter((c) => c.id !== Number(selClasse)).map((c) => ({ id: c.id, libelle: clOf(c) }));
            frag.querySelector('#pgt-dest-classe').innerHTML = UI.options(opts, destClasse, 'Choisir…');
          };
          frag.querySelector('#pgt-classe').onchange = (e) => { selClasse = Number(e.target.value) || ''; setDest(); renderListeF(); };
          frag.querySelector('#pgt-dest-classe').onchange = (e) => { destClasse = Number(e.target.value) || ''; };
          setDest();
          renderListeF();
        } catch (e) { notice('Erreur d\'affichage : ' + UI.esc(String(e && e.message || e))); }
      }

      function renderEcoleUI() {
        try {
          frag.innerHTML =
            '<div class="filter-bar">' +
              '<div class="field"><label>Mode</label><select id="pgt-mode"><option value="filiere">Filière → Filière (même école)</option><option value="ecole">École → Autre école</option></select></div>' +
              '<div class="field"><label>Classe d\'origine</label><select id="pgt-classe"></select></div>' +
              '<div class="field"><label>École de destination</label><select id="pgt-ecole"></select></div>' +
              '<div class="field"><label>Classe d\'accueil</label><select id="pgt-dest-classe"></select></div>' +
            '</div>' +
            '<div id="pgt-dest-info"></div>' +
            '<p class="hint" style="margin:8px 0">Le dossier de chaque élève est reporté dans la base de l\'école de destination (classe d\'accueil choisie) puis retiré de cette école. Notes, frais et pointages restent dans l\'établissement d\'origine. L\'opération est consignée dans les deux historiques.</p>' +
            '<div id="pgt-list"></div>';
          frag.querySelector('#pgt-mode').value = 'ecole';
          frag.querySelector('#pgt-mode').onchange = (e) => { tabX = e.target.value; if (tabX === 'filiere') renderFiliereUI(); else renderEcoleUI(); };

          (async () => {
            try {
              let schools = ((await Meta.allSchools()) || []).filter((s) => s.id !== Meta.currentSchoolId());
              frag.querySelector('#pgt-ecole').innerHTML = UI.options(schools.map((s) => ({ id: s.id, libelle: s.nom })), destEcole, 'Choisir…');
              frag.querySelector('#pgt-classe').innerHTML = UI.options(d.classes.map((c) => ({ id: c.id, libelle: clOf(c) })), selClasse, 'Choisir…');
              if (!schools.length) {
                frag.querySelector('#pgt-ecole').innerHTML = '<option value="">—</option>';
                frag.querySelector('#pgt-dest-info').innerHTML = '<div class="notice">Aucune autre école dans la liste. Ajoutez-la depuis le panneau ADMIN (global) puis connectez-vous.</div>';
              }
              if (destEcole) await loadEcoleClasses();
              else refreshEcole();
            } catch (e) {
              try {
                frag.querySelector('#pgt-dest-info').innerHTML = '<div class="notice">Impossible de lire la liste des écoles : ' + UI.esc(String(e && e.message || e)) + '</div>';
              } catch (e2) { /* ignore */ }
            }
            frag.querySelector('#pgt-classe').onchange = (e) => { selClasse = Number(e.target.value) || ''; renderListeE(); };
            frag.querySelector('#pgt-ecole').onchange = (e) => { destEcole = Number(e.target.value) || ''; destClasse = ''; destData = { classes: [], eleves: [] }; loadEcoleClasses(); renderListeE(); };
            frag.querySelector('#pgt-dest-classe').onchange = (e) => { destClasse = Number(e.target.value) || ''; };
            renderListeE();
          })();
        } catch (e) { notice('Erreur d\'affichage : ' + UI.esc(String(e && e.message || e))); }
      }

      function renderListeF() {
        const list = elevesDe(selClasse);
        const dest = d.classes.find((c) => c.id === destClasse);
        const rows = list.map((e) => {
          const cl = d.classes.find((c) => c.id === e.classeId);
          return '<tr><td><input type="checkbox" class="pgt-check" data-id="' + e.id + '"></td>' +
            '<td><strong>' + UI.esc(Data.personneNom(e)) + '</strong></td>' +
            '<td>' + UI.esc(e.matricule || '–') + '</td>' +
            '<td>' + UI.esc(clOf(cl)) + '</td>' +
            '<td>' + UI.esc((cl && cl.mention) || '—') + '</td></tr>';
        }).join('');
        frag.querySelector('#pgt-list').innerHTML =
          '<div class="filter-bar" style="margin-bottom:10px"><b>' + list.length + ' élève(s)</b>' +
            '<button class="btn btn-sm btn-outline" id="pgt-all">Tout coch.</button>' +
            '<button class="btn btn-sm btn-ghost" id="pgt-none">Décocher</button>' +
            '<button class="btn btn-sm btn-outline" id="pgt-print">Imprimer cette liste</button>' +
            '<button class="btn btn-primary" id="pgt-go">Transférer la sélection' + (dest ? ' vers « ' + UI.esc(clOf(dest)) + ' »' : '') + '</button></div>' +
          UI.table(['', 'Élève', 'Matricule', 'Classe', 'Filière actuelle'], rows || UI.empty(5)) +
          (selClasse && selClasse === destClasse ? '<div class="notice-warn notice">Choisissez une classe de destination différente.</div>' : '');
        frag.querySelector('#pgt-all').onclick = () => frag.querySelectorAll('.pgt-check').forEach((x) => x.checked = true);
        frag.querySelector('#pgt-none').onclick = () => frag.querySelectorAll('.pgt-check').forEach((x) => x.checked = false);
        frag.querySelector('#pgt-print').onclick = () => printListeF(list);
        frag.querySelector('#pgt-go').onclick = () => {
          if (selClasse === destClasse) { UI.toast('La classe de destination doit différer.', 'err'); return; }
          if (!destClasse) { UI.toast('Choisissez la classe de destination.', 'err'); return; }
          const sel = list.filter((e) => { const cb = frag.querySelector('.pgt-check[data-id="' + e.id + '"]'); return cb && cb.checked; });
          if (!sel.length) { UI.toast('Aucun élève sélectionné.', 'err'); return; }
          const fromCl = d.classes.find((c) => c.id === selClasse);
          const fromFil = (fromCl && fromCl.mention) || '';
          const toFil = (dest && dest.mention) || '';
          UI.confirm('Transférer ' + sel.length + ' élève(s) de « ' + clOf(fromCl) + ' » vers « ' + clOf(dest) + ' » ?' +
            (fromFil && toFil && fromFil !== toFil ? '\nChangement de filière : ' + fromFil + ' → ' + toFil + '.' : ''),
            async () => {
              for (const e of sel) {
                const de = e.classeId;
                e.classeId = destClasse;
                e.datePassage = UI.nowIso();
                await DB.put('eleves', e);
                await ecrireMouvement({ eleveId: e.id, deClasseId: de, versClasseId: destClasse, anneeId: null, type: 'transfert', transfertType: 'filiere', motif: (fromFil && toFil && fromFil !== toFil) ? 'Changement de filière ' + fromFil + ' → ' + toFil : 'Changement de classe' });
              }
              UI.toast(sel.length + ' élève(s) transféré(s).', 'ok');
              d.eleves = await DB.getAll('eleves');
              App.go('passages');
            }, { title: 'Confirmer le transfert de filière' });
        };
      }

      function renderListeE() {
        const list = elevesDe(selClasse);
        const rows = list.map((e) => {
          const cl = d.classes.find((c) => c.id === e.classeId);
          return '<tr><td><input type="checkbox" class="pgt-check" data-id="' + e.id + '"></td>' +
            '<td><strong>' + UI.esc(Data.personneNom(e)) + '</strong></td>' +
            '<td>' + UI.esc(e.matricule || '–') + '</td>' +
            '<td>' + UI.esc(clOf(cl)) + '</td></tr>';
        }).join('');
        frag.querySelector('#pgt-list').innerHTML =
          '<div class="filter-bar" style="margin-bottom:10px"><b>' + list.length + ' élève(s) dans la classe d\'origine</b>' +
            '<button class="btn btn-sm btn-outline" id="pgt-all">Tout coch.</button>' +
            '<button class="btn btn-sm btn-ghost" id="pgt-none">Décocher</button>' +
            '<button class="btn btn-sm btn-outline" id="pgt-print">Imprimer cette liste</button>' +
            '<button class="btn btn-primary" id="pgt-go">Transférer vers l\'école de destination</button></div>' +
          UI.table(['', 'Élève', 'Matricule', 'Classe'], rows || UI.empty(4)) +
          (selClasse ? '' : '<div class="notice">Choisissez d\'abord une classe d\'origine.</div>');
        frag.querySelector('#pgt-all').onclick = () => frag.querySelectorAll('.pgt-check').forEach((x) => x.checked = true);
        frag.querySelector('#pgt-none').onclick = () => frag.querySelectorAll('.pgt-check').forEach((x) => x.checked = false);
        frag.querySelector('#pgt-print').onclick = () => printListeE(list);
        frag.querySelector('#pgt-go').onclick = async () => {
          if (!selClasse) { UI.toast('Choisissez la classe d\'origine.', 'err'); return; }
          if (!destEcole) { UI.toast('Choisissez l\'école de destination.', 'err'); return; }
          if (!destClasse) { UI.toast('Choisissez la classe d\'accueil dans l\'école de destination.', 'err'); return; }
          const sel = list.filter((e) => { const cb = frag.querySelector('.pgt-check[data-id="' + e.id + '"]'); return cb && cb.checked; });
          if (!sel.length) { UI.toast('Aucun élève sélectionné.', 'err'); return; }
          try {
            const schoolSrc = await Meta.getSchool(Meta.currentSchoolId());
            const schoolDst = await Meta.getSchool(destEcole);
            const classeDst = destData.classes.find((c) => c.id === destClasse);
            const destNom = (schoolDst && schoolDst.nom) || '?';
            UI.confirm('Transférer ' + sel.length + ' élève(s) vers l\'école « ' + destNom + ' » (classe « ' + clOf(classeDst) + ' ») ?\n\nLe dossier (identité) sera reporté et l\'élève retiré de cette école. L\'historique pédagogique et financier reste ici.', async () => {
              for (const e of sel) {
                const copie = Object.assign({}, e, {
                  id: undefined,
                  userId: null,
                  classeId: destClasse,
                  actif: true,
                  dateTransfert: UI.nowIso(),
                  transfertActuel: { versEcoleId: destEcole, versEcoleName: destNom, date: UI.nowIso(), classeId: destClasse }
                });
                delete copie.exclusion;
                const w = await Meta.writeStoreRaw(Meta.dbNameFor(schoolDst), 'eleves', copie);
                const newId = (w && w.ok) ? w.id : null;
                if (newId != null) {
                  await Meta.writeStoreRaw(Meta.dbNameFor(schoolDst), 'passages', {
                    eleveId: newId, deClasseId: null, versClasseId: destClasse, anneeId: null,
                    type: 'transfert', transfertType: 'ecole_entree',
                    motif: 'Entrée par transfert depuis ' + ((schoolSrc && schoolSrc.nom) || '?'), dateCreation: UI.nowIso()
                  });
                  await DB.del('eleves', e.id);
                } else {
                  UI.toast('Élève « ' + Data.personneNom(e) + ' » : impossible d\'inscrire (école de destination indisponible).', 'err');
                }
              }
              UI.toast(sel.length + ' élève(s) transféré(s).', 'ok');
              d.eleves = await DB.getAll('eleves');
              App.go('passages');
            }, { title: 'Confirmer le transfert vers une autre école' });
          } catch (e) { UI.toast('Erreur de transfert : ' + String(e && e.message || e), 'err'); }
        };
      }

      try {
        if (tabX === 'filiere') renderFiliereUI(); else renderEcoleUI();
      } catch (e) { notice('Erreur d\'affichage : ' + UI.esc(String(e && e.message || e))); }
    }

    // Rendu initial des quatre onglets (le motif masque/affiche gère la navigation).
    renderConfig(root.querySelector('#pg-frag-config'));
    renderPropositions(root.querySelector('#pg-frag-propositions'));
    renderHistorique(root.querySelector('#pg-frag-historique'));
    renderTransferts(root.querySelector('#pg-frag-transferts'));
  }
});