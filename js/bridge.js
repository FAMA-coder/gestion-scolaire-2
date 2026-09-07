/* ============================================================
   bridge.js — Sauvegarde automatique vers un dossier du disque.
   Utilise l'API File System Access (window.showDirectoryPicker),
   supportée par les navigateurs Chromium (Chrome, Edge) et donc
   par WebView2. Affiche le sélecteur de dossier natif et permet
   d'écrire les fichiers .json directement dans le dossier choisi.
   En navigateur sans cette API, on bascule en téléchargement.
   ============================================================ */
window.GSBridge = (function () {

  // Le handle du dossier choisi est conservé en mémoire (il ne peut pas
  // être sérialisé en localStorage / IndexedDB).
  let dirHandle = null;

  function supports() {
    return !!(window.showDirectoryPicker);
  }

  async function selectFolder() {
    if (!supports()) throw new Error('Le choix de dossier nécessite Chrome ou Edge.');
    const dir = await window.showDirectoryPicker();
    if (dir && dir.requestPermission) {
      const perm = await dir.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') throw new Error("Permission d'écriture refusée pour ce dossier.");
    }
    dirHandle = dir;
    return dir.name || 'Dossier choisi';
  }

  async function saveFile(filename, content) {
    if (!dirHandle) throw new Error('Aucun dossier choisi. Utilisez « Parcourir… » d\'abord.');
    const fh = await dirHandle.getFileHandle(filename, { create: true });
    const w = await fh.createWritable();
    await w.write(content);
    await w.close();
    return dirHandle.name + '\\' + filename;
  }

  function currentLocation() {
    return dirHandle ? dirHandle.name : null;
  }

  // Détection de l'environnement WebView2 (application bureau) : l'objet
  // window.chrome.webview est injecté par le composant WebView2.
  function isDesktop() {
    return !!(window.chrome && window.chrome.webview && typeof window.chrome.webview.postMessage === 'function');
  }

  // Ferme proprement l'application bureau (http:// + window.close() étant bloqués).
  function quit() {
    if (!isDesktop()) return false;
    try {
      window.chrome.webview.postMessage({ cmd: 'quit' });
      return true;
    } catch (e) { return false; }
  }

  return {
    available: supports(),
    ping: async function () { return 'pong'; },
    selectFolder: selectFolder,
    saveFile: saveFile,
    currentLocation: currentLocation,
    isDesktop: isDesktop,
    quit: quit
  };
})();
