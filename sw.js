/* ============================================================
   sw.js — Service Worker (Gestion Scolaire)
   Stratégie : cache-first pour les ressources statiques (shell)
   + réseau en secours ; les données restent dans IndexedDB.
   ============================================================ */
const VERSION = 'gestionscolaire-v19';
const PRECACHE = [
  './index.html',
  './sample_data.js',
  './manifest.webmanifest',
  'css/styles.css',
  'js/db.js',
  'js/auth.js',
  'js/ui.js',
  'js/meta.js',
  'js/storage.js',
  'js/firebase-config.js',
  'js/sync.js',
  'js/lan.js',
  'js/bridge.js',
  'js/excel.js',
  'js/pdf.js',
  'js/app.js',
  'js/init.js',
  'js/modules/core.js',
  'js/modules/scolarite.js',
  'js/modules/cartes.js',
  'js/modules/enseignants.js',
  'js/modules/finances.js',
  'js/modules/admin.js',
  'js/modules/emplois.js',
  'js/modules/cours.js',
  'js/modules/eval.js',
  'js/modules/bulletins.js',
  'js/modules/dashboard.js',
  'js/modules/passages.js',
  'js/modules/sauvegarde.js',
  'js/modules/statistiques.js',
  'js/modules/parametres.js',
  'js/install.js',
  'js/desktop.js',
  'js/license.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png'
];

// Installation : précharger le "shell" de l'application
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

// Activation : nettoyer les anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Interception : cache d'abord, puis réseau
self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Ne pas intercepter les requêtes non GET
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Ne jamais intercepter les appels de navigation vers d'autres origines
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((resp) => {
        // Mettre en cache les réponses valides du même domaine (sauf navigation index)
        if (resp && resp.status === 200 && resp.type === 'basic') {
          const copy = resp.clone();
          caches.open(VERSION).then((cache) => cache.put(req, copy));
        }
        return resp;
      }).catch(() => {
        // Hors ligne : pour une navigation, renvoyer le shell
        if (req.mode === 'navigate') return caches.match('./index.html');
        return undefined;
      });
    })
  );
});