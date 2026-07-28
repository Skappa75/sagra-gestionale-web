// ==========================================================
// public/sw.js — Service worker (notifiche push + cache dell'app).
//
// DEVE stare nella stessa cartella delle pagine: lo "scope" di un service
// worker copre solo la cartella in cui vive e le sue sottocartelle.
//
// Fa tre cose:
//   1. push: mostra la notifica ricevuta dal server (routes/push.js)
//   2. click sulla notifica: riporta in primo piano la pagina gia' aperta,
//      o ne apre una nuova
//   3. cache dell'app: conserva le pagine e i file di grafica, cosi'
//      l'app si apre anche senza Internet
//
// PERCHE' LA CACHE (aggiunta il 28/7/2026)
// I file statici possono essere pubblicati su GitHub Pages, per permettere
// a Chrome di creare l'icona-app "vera" sul telefono (necessaria perche' il
// cameriere possa rientrare se chiude il browser). Ma al campo della sagra
// Internet non c'e': senza cache, l'app aperta dall'icona non riuscirebbe a
// scaricare le pagine da GitHub e non partirebbe. Con la cache, le pagine
// arrivano dalla memoria del telefono e i DATI dal server in rete locale.
//
// REGOLA FONDAMENTALE: si mette in cache SOLO la grafica (HTML/CSS/JS/
// icone). Le chiamate ai dati (/api/...) non vengono MAI messe in cache:
// comande e stato dei tavoli devono essere sempre quelli veri del momento.
// Essendo dirette a un altro dominio (il server della sagra), passano da
// qui senza essere nemmeno esaminate.
// ==========================================================

// Cambiare questo numero a ogni pubblicazione forza i telefoni a scaricare
// la versione nuova invece di riusare quella vecchia in cache.
const VERSIONE_CACHE = 'sagra-v1';

// File che compongono l'app. Percorsi RELATIVI: funzionano sia servendo
// dalla radice del server locale, sia da una sottocartella di GitHub Pages.
const FILE_DA_CONSERVARE = [
  './',
  './login.html',
  './camerieri.html',
  './caposala.html',
  './supporto-camerieri.html',
  './cassa.html',
  './cucina.html',
  './griglieria.html',
  './menu.html',
  './report.html',
  './admin.html',
  './stile-comune.css',
  './mappa-tavoli.css',
  './cucina.css',
  './griglieria.css',
  './base-api.js',
  './auth-check.js',
  './marchio-sagra.js',
  './mappa-tavoli-render.js',
  './mantieni-schermo.js',
  './notifiche-push.js',
  './disponibilita-modal.js',
  './cassa.js',
  './menu.js',
  './report.js',
  './admin.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './img/logo-proloco.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(VERSIONE_CACHE).then((cache) =>
      // addAll fallisce tutto se anche un solo file manca: qui si aggiunge
      // file per file, cosi' un'assenza isolata non impedisce
      // l'installazione dell'intera app.
      Promise.all(FILE_DA_CONSERVARE.map((file) =>
        cache.add(file).catch(() => console.log('[sw] non conservato: ' + file))
      ))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nomi) => Promise.all(
        nomi.filter((n) => n !== VERSIONE_CACHE).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evento) => {
  const richiesta = evento.request;

  // Solo le richieste GET verso la stessa origine sono candidate alla
  // cache. Tutto il resto (chiamate /api al server della sagra, POST,
  // richieste ad altri domini) prosegue senza che il service worker
  // intervenga in alcun modo.
  if (richiesta.method !== 'GET') return;
  if (new URL(richiesta.url).origin !== self.location.origin) return;
  if (richiesta.url.indexOf('/api/') !== -1) return;

  // Strategia: prima la rete, con la cache come rete di sicurezza.
  // Cosi' finche' c'e' collegamento si vede sempre la versione aggiornata
  // (importante per le correzioni), e quando manca si parte comunque.
  evento.respondWith(
    fetch(richiesta)
      .then((risposta) => {
        if (risposta && risposta.status === 200) {
          const copia = risposta.clone();
          caches.open(VERSIONE_CACHE).then((cache) => cache.put(richiesta, copia));
        }
        return risposta;
      })
      .catch(() => caches.match(richiesta).then((salvata) =>
        salvata || caches.match('./login.html')
      ))
  );
});

self.addEventListener('push', (evento) => {
  let dati = { titolo: 'Sagra', corpo: 'Nuovo avviso dal gestionale.' };
  try {
    if (evento.data) dati = evento.data.json();
  } catch (e) { /* payload non JSON: si usa il default */ }

  evento.waitUntil(
    self.registration.showNotification(dati.titolo || 'Sagra', {
      body: dati.corpo || '',
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      vibrate: [200, 80, 200, 80, 300],
      tag: 'sagra-alert',      // le notifiche si sostituiscono invece di accumularsi
      renotify: true,          // ...ma ri-suonano a ogni sostituzione
    })
  );
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((finestre) => {
      // Se una pagina del gestionale e' gia' aperta, portala in primo piano
      for (const finestra of finestre) {
        if ('focus' in finestra) return finestra.focus();
      }
      // Altrimenti apri la pagina camerieri (la piu' probabile per chi riceve push)
      return self.clients.openWindow('./camerieri.html');
    })
  );
});
