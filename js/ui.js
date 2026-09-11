/* ============================================================
   ui.js — Helpers d'interface : modales, toasts, tables, formulaires
   ============================================================ */
window.UI = (function () {
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function avatar(nom, prenom) {
    const n = (nom || '?').trim()[0] || '?';
    const p = (prenom || '').trim()[0] || '';
    return (n + p).toUpperCase() || '?';
  }
  function money(n) {
    const v = Number(n || 0);
    const p = window.PAIEMENT || {};
    const d = p.decimales == null ? 0 : p.decimales;
    const dev = p.devise || 'FCFA';
    return v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' ' + dev;
  }
  function dec(n, d) {
    const v = Number(n || 0);
    return v.toFixed(d == null ? 2 : d).replace('.', ',');
  }
  function today() { return new Date().toISOString().slice(0, 10); }
  function dateFr(iso) {
    if (!iso) return '–';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('fr-FR');
  }
  function nowIso() { return new Date().toISOString(); }

  // ---- Toasts ----
  function toast(msg, type) {
    const root = document.getElementById('toast-root');
    if (!root) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (type || 'info');
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 2600);
    setTimeout(() => el.remove(), 3000);
  }

  // ---- Modale générique ----
  function modal(bodyHtml, footHtml, opts) {
    opts = opts || {};
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
      '<div class="modal ' + (opts.size || '') + '">' +
        '<div class="modal-head"><h3>' + esc(opts.title || '') + '</h3>' +
          '<button class="modal-close" data-close>×</button></div>' +
        '<div class="modal-body">' + (bodyHtml || '') + '</div>' +
        (!footHtml ? '' : '<div class="modal-foot">' + footHtml + '</div>') +
      '</div>';
    const modalEl = overlay.firstChild;
    function close() { overlay.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    overlay.querySelector('[data-close]').onclick = close;
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);
    document.getElementById('modal-root').appendChild(overlay);
    return { overlay: overlay, modal: modalEl, close: close };
  }

  function closeModal() {
    const roots = document.getElementById('modal-root');
    if (roots) roots.innerHTML = '';
  }

  // Boîte de dialogue avec boutons. onSubmit(body, close) → retourne keep-open si false
  function prompt(title, bodyHtml, onSubmit, opts) {
    opts = opts || {};
    const foot =
      '<button class="btn btn-ghost" data-cancel>Annuler</button>' +
      '<button class="btn btn-primary" data-ok>' + esc(opts.okLabel || 'Enregistrer') + '</button>';
    const m = modal('<form data-form>' + bodyHtml + '</form>', foot, { title: title, size: opts.size });
    const form = m.modal.querySelector('[data-form]');
    const okBtn = m.modal.querySelector('[data-ok]');
    const cancelBtn = m.modal.querySelector('[data-cancel]');
    cancelBtn.onclick = () => m.close();
    form.addEventListener('submit', (e) => e.preventDefault());
    okBtn.onclick = async () => {
      const res = await onSubmit(form, m.close);
      if (res === false) return; // garder ouvert
    };
    const first = form.querySelector('input,select,textarea');
    if (first) setTimeout(() => first.focus(), 30);
    return m;
  }

  function confirm(message, onYes, opts) {
    opts = opts || {};
    const foot =
      '<button class="btn btn-ghost" data-no>Annuler</button>' +
      '<button class="btn btn-danger" data-yes>' + esc(opts.yesLabel || 'Oui, supprimer') + '</button>';
    const m = modal('<p>' + esc(message) + '</p>', foot, { title: opts.title || 'Confirmation', size: 'modal modal-sm' });
    m.modal.querySelector('[data-no]').onclick = () => m.close();
    m.modal.querySelector('[data-yes]').onclick = async () => { m.close(); await onYes(); };
    return m;
  }

  // ---- Sélecteur ----
  function options(list, current, emptyOption) {
    let html = emptyOption ? '<option value="">' + esc(emptyOption) + '</option>' : '';
    for (const it of list) {
      const val = it.value != null ? it.value : it.id;
      const label = it.label != null ? it.label : (it.nom || (it.libelle || ''));
      html += '<option value="' + esc(val) + '"' + (String(val) === String(current) ? ' selected' : '') + '>' + esc(label) + '</option>';
    }
    return html;
  }

  // Tableau avec en-têtes + lignes (html déjà sécurisé par l'appelant)
  function table(headers, rowsHtml, extraClass) {
    return '<div class="table-wrap"><table class="tbl ' + (extraClass || '') + '">' +
      '<thead><tr>' + headers.map((h) => '<th>' + esc(h) + '</th>').join('') + '</tr></thead>' +
      '<tbody>' + (rowsHtml || '<tr><td colspan="' + headers.length + '"><div class="empty">Aucune donnée</div></td></tr>') + '</tbody></table></div>';
  }

  function empty(colspan, msg) {
    return '<tr><td colspan="' + colspan + '"><div class="empty">' + esc(msg || 'Aucune donnée') + '</div></td></tr>';
  }

  function readVal(sel) {
    const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
    if (!el) return null;
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'number') return el.value === '' ? null : Number(el.value);
    return el.value;
  }

  function setVal(sel, val) {
    const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!val;
    else el.value = (val == null ? '' : val);
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  // En-tête d'établissement (logo + identité) pour les documents à imprimer.
  // eco : fiche 'ecole' ; config : { title, subtitle } ; opts : { compact }
  function letterhead(eco, config, opts) {
    eco = eco || {};
    config = config || {};
    opts = opts || {};
    const nom = eco.nom || 'Établissement';
    const identity = [eco.adresse, eco.tel ? 'Tél : ' + eco.tel : '', eco.email].filter(Boolean).join(' · ');
    const compact = opts.compact;
    let head = '<div class="bulletin-head">' +
      '<div class="bulletin-logo">' + (eco.logo ? '<img src="' + eco.logo + '" alt="logo">' : '<b>' + esc((nom[0] || 'GS')) + '</b>') + '</div>' +
      '<div class="bulletin-title"><h2>' + esc(nom) + '</h2>' +
      (eco.slogan ? '<h4>' + esc(eco.slogan) + '</h4>' : '') +
      (identity ? '<div class="bulletin-sub">' + esc(identity) + '</div>' : '') +
      (config.title ? '<h3>' + esc(config.title) + '</h3>' : '') +
      (config.subtitle ? '<div><b>' + esc(config.subtitle.label || '') + ' :</b> ' + esc(config.subtitle.value || '') + '</div>' : '') +
      '</div></div>';
    if (compact) return head;
    return '<div class="page-bulletin-doc">' + head +
      (config.extra ? config.extra : '') + '</div>';
  }

  // Imprime un fragment HTML (rendu dans la zone d'impression masquée)
  function print(fragment, title) {
    const pr = document.getElementById('print-root');
    if (!pr) return;
    pr.innerHTML = '<div class="bulletin-wrap">' + fragment + '</div>';
    const oldTitle = document.title;
    if (title) document.title = title;
    if (window.Desktop && Desktop.isDesktop()) {
      // Application bureau : le composant WebView2 ouvre le dialogue d'impression.
      Desktop.showPrint().catch(() => { /* ignore */ });
      setTimeout(() => { document.title = oldTitle; pr.innerHTML = ''; }, 2500);
      return;
    }
    window.print();
    document.title = oldTitle;
    setTimeout(() => { pr.innerHTML = ''; }, 200);
  }

  return {
    esc: esc, avatar: avatar, money: money, dec: dec, today: today, dateFr: dateFr, nowIso: nowIso,
    toast: toast, modal: modal, closeModal: closeModal, prompt: prompt, confirm: confirm,
    options: options, table: table, empty: empty,     readVal: readVal, setVal: setVal, fileToDataUrl: fileToDataUrl,
    print: print, letterhead: letterhead
  };
})();
