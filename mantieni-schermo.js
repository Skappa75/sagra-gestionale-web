// ==========================================================
// public/mantieni-schermo.js
// Impedisce lo standby dello schermo finché la pagina è aperta (22/7/2026).
//
// Perché esiste: gli alert sonori (nuovo tavolo, comanda in attesa) partono
// solo se la pagina è attiva. Il caso più frequente di alert perso non è
// "telefono spento" ma "schermo andato in standby da solo". Questo modulo
// lo elimina con due livelli:
//
//   1. Wake Lock API (navigator.wakeLock) — la via pulita. Su Chrome/Android
//      richiede però un contesto sicuro (HTTPS o localhost): con il server
//      in HTTP su IP di rete locale su alcuni browser non è disponibile.
//   2. Fallback "video invisibile": un <video> muto e inline che riproduce
//      lo stream di un canvas — un video in riproduzione impedisce lo
//      standby su tutti i browser mobili moderni, anche in HTTP.
//
// Entrambi partono al primo tocco/click sulla pagina (i browser richiedono
// un gesto utente per far partire un video), e il Wake Lock viene
// ri-acquisito automaticamente quando la pagina torna in primo piano.
//
// Uso: includere <script src="mantieni-schermo.js"></script> prima dello
// script principale della pagina. Nessuna configurazione: si attiva da solo.
// NON tiene acceso lo schermo se l'utente preme il tasto di blocco di
// proposito, né se il browser va in background: non è una veglia forzata,
// solo l'eliminazione dello standby automatico.
// ==========================================================

(function () {
  'use strict';

  let wakeLock = null;        // handle del Wake Lock, null se non attivo
  let videoFallback = null;   // <video> del fallback, creato una sola volta
  let giaAvviato = false;

  // ---- Livello 1: Wake Lock API ------------------------------------
  async function richiediWakeLock() {
    if (!('wakeLock' in navigator)) return false;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
      console.log('[mantieni-schermo] Wake Lock attivo.');
      return true;
    } catch (e) {
      // Tipico: contesto non sicuro (HTTP su IP LAN) o risparmio energetico.
      console.log('[mantieni-schermo] Wake Lock non disponibile:', e.message);
      return false;
    }
  }

  // ---- Livello 2: video invisibile da canvas -----------------------
  // Un canvas 2x2 ridisegnato una volta al secondo, trasformato in stream
  // video e riprodotto (muto, inline, invisibile). Il browser lo considera
  // "riproduzione multimediale in corso" e non manda lo schermo in standby.
  function avviaVideoFallback() {
    if (videoFallback) { videoFallback.play().catch(() => {}); return; }

    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 2;
    const ctx = canvas.getContext('2d');
    if (!canvas.captureStream) {
      console.log('[mantieni-schermo] captureStream non supportato: nessun fallback disponibile.');
      return;
    }

    // Ridisegno periodico: alcuni browser congelano gli stream "statici".
    setInterval(() => {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, 2, 2);
    }, 1000);

    videoFallback = document.createElement('video');
    videoFallback.muted = true;
    videoFallback.setAttribute('muted', '');       // ridondante ma necessario su alcuni Android
    videoFallback.setAttribute('playsinline', ''); // niente fullscreen automatico su iOS
    videoFallback.style.cssText = 'position:fixed; width:1px; height:1px; opacity:0; pointer-events:none;';
    videoFallback.srcObject = canvas.captureStream(1);
    document.body.appendChild(videoFallback);

    videoFallback.play()
      .then(() => console.log('[mantieni-schermo] Fallback video attivo.'))
      .catch((e) => console.log('[mantieni-schermo] Fallback video rifiutato:', e.message));
  }

  // ---- Avvio: al primo gesto utente ---------------------------------
  async function avvia() {
    if (giaAvviato) return;
    giaAvviato = true;
    const wakeLockOk = await richiediWakeLock();
    if (!wakeLockOk) avviaVideoFallback();
  }

  // Il Wake Lock viene rilasciato dal sistema quando la pagina va in
  // background: va richiesto di nuovo al ritorno in primo piano.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && giaAvviato && !wakeLock) {
      richiediWakeLock().then((ok) => { if (!ok) avviaVideoFallback(); });
    }
  });

  // Primo tocco/click in qualunque punto della pagina (once: si sgancia da solo).
  ['click', 'touchstart'].forEach((evento) => {
    document.addEventListener(evento, avvia, { once: true, passive: true });
  });
})();
