// ==========================================================
// public/notifiche-push.js
// Attivazione delle notifiche push lato telefono (22/7/2026).
//
// Uso: includere <script src="notifiche-push.js"></script> nella pagina e
// chiamare, dopo il login/accreditamento:
//
//   attivaNotifichePush({ ruolo: 'cameriere', cameriereId: 5, bottone: el })
//
// - Se la pagina NON è in HTTPS (o il browser non supporta le push), il
//   bottone viene nascosto e non succede nulla: il gestionale continua a
//   funzionare con gli alert a pagina aperta (polling + suono + Wake Lock).
// - Se le push sono supportate, il bottone mostra lo stato e al tocco
//   chiede il permesso, registra il service worker e invia l'iscrizione
//   al server (POST /api/push/iscrivi).
//
// Su iPhone le push web funzionano SOLO se la pagina è stata aggiunta
// alla schermata Home (limite di Apple, non aggirabile): il bottone in
// Safari "normale" mostra un avviso che lo spiega.
// ==========================================================

(function () {
  'use strict';

  function pushSupportate() {
    return window.isSecureContext
      && 'serviceWorker' in navigator
      && 'PushManager' in window
      && 'Notification' in window;
  }

  // Conversione chiave VAPID base64url -> Uint8Array (formato richiesto da subscribe)
  function base64UrlAUint8Array(base64Url) {
    const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
    const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
    const grezzo = atob(base64);
    const out = new Uint8Array(grezzo.length);
    for (let i = 0; i < grezzo.length; i++) out[i] = grezzo.charCodeAt(i);
    return out;
  }

  async function iscrivi(ruolo, cameriereId) {
    // Percorso RELATIVO: il gestionale puo' essere servito dalla radice del
    // server locale oppure da una sottocartella di GitHub Pages (es.
    // /sagra-gestionale/). Con '/sw.js' la registrazione fallirebbe nel
    // secondo caso; cosi' funziona in entrambi.
    const registrazione = await navigator.serviceWorker.register('sw.js');
    await navigator.serviceWorker.ready;

    const rispostaChiave = await fetch('/api/push/vapid-public-key');
    const { chiave } = await rispostaChiave.json();

    const subscription = await registrazione.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlAUint8Array(chiave),
    });

    const risposta = await fetch('/api/push/iscrivi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription, ruolo, cameriere_id: cameriereId || null }),
    });
    if (!risposta.ok) throw new Error('Il server ha rifiutato l\'iscrizione.');
  }

  // API pubblica -----------------------------------------------------
  window.attivaNotifichePush = function ({ ruolo, cameriereId, bottone }) {
    if (!bottone) return;

    if (!pushSupportate()) {
      // HTTP puro o browser vecchio: niente push, si nasconde il bottone.
      bottone.classList.add('nascosto');
      bottone.style.display = 'none';
      return;
    }

    // iPhone fuori dalla PWA: push impossibili finché non aggiunge a Home.
    const iOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const inPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

    function aggiornaEtichetta() {
      if (Notification.permission === 'granted') {
        bottone.textContent = '🔔 Notifiche attive';
        bottone.disabled = true;
      } else if (Notification.permission === 'denied') {
        bottone.textContent = '🔕 Notifiche bloccate (sbloccale dalle impostazioni del browser)';
        bottone.disabled = true;
      } else {
        bottone.textContent = '🔔 Attiva notifiche';
        bottone.disabled = false;
      }
    }

    // Se il permesso è già stato dato in passato, rinnova l'iscrizione in
    // silenzio (endpoint FCM possono cambiare) senza aspettare un tocco.
    if (Notification.permission === 'granted') {
      iscrivi(ruolo, cameriereId).catch((e) => console.log('Push: rinnovo iscrizione fallito:', e.message));
    }
    aggiornaEtichetta();

    bottone.addEventListener('click', async () => {
      if (iOS && !inPWA) {
        alert('Su iPhone le notifiche funzionano solo dopo aver aggiunto il gestionale alla schermata Home:\n\nCondividi → Aggiungi a Home, poi riapri da lì e ripremi questo pulsante.');
        return;
      }
      try {
        const permesso = await Notification.requestPermission();
        if (permesso !== 'granted') { aggiornaEtichetta(); return; }
        await iscrivi(ruolo, cameriereId);
        aggiornaEtichetta();
      } catch (e) {
        alert('Attivazione notifiche fallita: ' + e.message);
      }
    });
  };
})();
