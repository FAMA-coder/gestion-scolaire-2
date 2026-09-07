/* ============================================================
   firebase-config.js — Synchronisation multi-appareils (Firebase
   Realtime Database, REST).

   ⚡ IMPORTANT — à faire (une seule fois) dans la console Firebase :
   1) https://console.firebase.google.com → projet « my-gestion-scolaire2 »
   2) Build → Realtime Database → « Créer une base de données »
   3) Région : « sélectionner la région par défaut (europe-west1) »
      ou une région proche de vos utilisateurs.
   4) Mode de démarrage : « Mode test » (accès lecture/écriture).
   5) Onglet « Règles » → coller et PUBLIER :
        { "rules": { ".read": true, ".write": true } }
   La synchro démarre automatiquement dès que la base existe.
   Si la console vous attribue une autre URL que l'URL par défaut
   (ex. …-default-rtdb.europe-west1.firebaseio.com), remplacez ici
   databaseURL puis redéployez.

   ⚠ Règles ouvertes = données lisibles publiquement. Le dossier
   syncFolder rend l'accès difficile à deviner mais n'est PAS une
   sécurité. Conseil : activer ensuite l'authentification Firebase +
   règles « auth != null ».
   ============================================================ */
window.FIREBASE_CONFIG = {
  enabled: true,
  apiKey: "AIzaSyAznF1yGF-4t1yQhXSkcX6KRXgbbwSS18A",
  authDomain: "my-gestion-scolaire2.firebaseapp.com",
  databaseURL: "https://my-gestion-scolaire2-default-rtdb.firebaseio.com",
  projectId: "my-gestion-scolaire2",
  storageBucket: "my-gestion-scolaire2.firebasestorage.app",
  messagingSenderId: "940458935226",
  appId: "1:940458935226:web:8cc9911deedeaa015f9383",
  measurementId: "G-P0Y4W4JV4E",
  /* Dossier racine partagé par tous vos appareils. Ne PAS le changer
     après mise en service : les appareils « oublieraient » la base. */
  syncFolder: "gs2_816cb79f24"
};