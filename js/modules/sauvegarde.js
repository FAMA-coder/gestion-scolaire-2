/* ============================================================
   sauvegarde.js — Sauvegarde / Restauration (écran)
   Permet d'exporter toutes les données dans un fichier JSON
   (stockage sur la partition disque hébergeant l'application)
   et de les restaurer depuis un tel fichier.
   ============================================================ */
App.register('sauvegarde', {
  title: 'Sauvegarde & Restauration',
  navLabel: 'Sauvegarde',
  icon: 'B',
  group: 'Système',
  perm: 'ecole.manage',
  hidden: true,
  render: function (root) {
    root.innerHTML = '<div class="bar"><div class="card-title">Sauvegarde des données sur disque</div>' +
      '<p class="card-sub">Exportez l\'ensemble des données (écoles, comptes, notes, élèves, finances…) dans un fichier JSON à conserver à côté de l\'application, puis réimportez-le pour restaurer.</p></div>' +
      '<div class="bar">' +
        '<div class="card" style="padding:16px;display:flex;flex-direction:column;gap:14px">' +
          '<div><button class="btn btn-ok" id="sv-export">💾 Exporter la sauvegarde (.json)</button>' +
          '<p class="hint">Télécharge un fichier JSON contenant toutes les données. Conservez-le sur le disque qui héberge l\'application.</p></div>' +
          '<div style="border-top:1px solid var(--border,#e5e7eb);padding-top:14px"><button class="btn btn-primary" id="sv-import">📥 Restaurer depuis un fichier</button>' +
          '<p class="hint">Restaure toutes les données depuis un fichier de sauvegarde. <b>Attention :</b> remplace les données actuelles.</p></div>' +
        '</div>' +
      '</div>';
    root.querySelector('#sv-export').onclick = async () => {
      try {
        const data = await Store.saveToDisk();
        UI.toast('Sauvegarde exportée (' + (data.schools || []).length + ' école(s)).', 'ok');
      } catch (e) {
        UI.toast('Erreur d\'export : ' + e.message, 'err');
      }
    };
    root.querySelector('#sv-import').onclick = () => {
      UI.prompt('Restaurer une sauvegarde', `
        <p style="margin-bottom:10px">Choisissez le fichier de sauvegarde <b>.json</b> généré par l'export.</p>
        <div class="field"><label>Fichier *</label><input type="file" id="sv-file" accept="application/json,.json" required></div>
        <p class="hint" style="margin-top:8px">La restauration <b>remplacera</b> l'ensemble des données actuelles (écoles, comptes, notes, etc.).</p>
      `, async (body) => {
        const input = body.querySelector('#sv-file');
        const file = input && input.files && input.files[0];
        if (!file) { UI.toast('Choisissez un fichier de sauvegarde.', 'err'); return false; }
        UI.closeModal();
        UI.confirm('Remplacer TOUTES les données actuelles par cette sauvegarde ? Cette action est irréversible.', async () => {
          try {
            const data = await Store.restoreFromFile(file);
            UI.toast('Restauration terminée (' + (data.schools || []).length + ' école(s)).', 'ok');
          } catch (e) {
            UI.toast('Erreur de restauration : ' + e.message, 'err');
          }
        }, { title: 'Confirmer la restauration' });
        return true;
      }, { size: 'modal modal-sm' });
    };
  }
});
