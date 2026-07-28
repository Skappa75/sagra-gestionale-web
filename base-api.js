// ==========================================================
// public/base-api.js
// Indirizzamento delle chiamate API quando il frontend NON e' servito dal
// server della sagra (28/7/2026).
//
// PERCHE' ESISTE
// Il gestionale puo' essere aperto in due modi, entrambi validi:
//   1. dal server in rete locale: https://<dominio>/login.html
//      -> e' la via storica, quella usata per le correzioni al volo
//   2. dall'app installata sul telefono, i cui file statici stanno su
//      GitHub Pages: https://<utente>.github.io/<repo>/login.html
//      -> serve perche' Chrome crea l'icona-app "vera" solo per siti
//         raggiungibili da Internet (vedi istruzioni-installazione-app.md)
//
// Nel caso 2 le pagine arrivano da GitHub ma i DATI devono continuare ad
// arrivare dal server in rete locale: nessuna comanda passa mai da
// Internet. Le 113 chiamate sparse nel codice usano indirizzi relativi
// tipo fetch('/api/comande'), che da GitHub punterebbero a github.io.
//
// Invece di modificare 113 punti (con il rischio di dimenticarne uno),
// questo script avvolge window.fetch una volta sola: se la pagina non e'
// servita dal server della sagra, ogni indirizzo che inizia per /api
// viene riscritto sul dominio del server. Quando invece il gestionale e'
// aperto dalla LAN, lo script non fa assolutamente nulla: comportamento
// identico a prima, nessun rischio di regressione.
//
// DEVE essere incluso PRIMA di ogni altro script che faccia fetch.
// ==========================================================

(function () {
  'use strict';

  // Dominio del server della sagra. Va tenuto allineato al campo
  // "Dominio pubblico" del pannello Admin e al certificato in certs/.
  // Se un domani cambia, si modifica QUI e si ripubblica su GitHub.
  const SERVER_SAGRA = 'https://sagra-strozzapreti.duckdns.org';

  const hostServer = new URL(SERVER_SAGRA).hostname;

  // Caso 1: la pagina arriva gia' dal server della sagra (dominio o IP
  // locale). Niente da fare: le chiamate relative funzionano da sole.
  const servitoDalServer =
    location.hostname === hostServer ||
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1' ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(location.hostname); // aperto via IP LAN

  window.SAGRA_SERVER = SERVER_SAGRA;
  window.SAGRA_MODALITA_ESTERNA = !servitoDalServer;

  if (servitoDalServer) return;

  const fetchOriginale = window.fetch.bind(window);

  // Avviso visibile quando il server non risponde. Senza, un errore di rete
  // resta invisibile: le pagine mostrano "Carico..." all'infinito oppure,
  // peggio, messaggi fuorvianti come "nessuna serata aperta" (che nasce dal
  // ripiego su un valore nullo). In sala serve capire subito che il problema
  // e' il collegamento, non il gestionale.
  let avvisoMostrato = false;
  function mostraAvvisoServerIrraggiungibile() {
    if (avvisoMostrato) return;
    avvisoMostrato = true;
    const barra = document.createElement('div');
    barra.style.cssText =
      'position:fixed; top:0; left:0; right:0; z-index:99999; background:#a02020;' +
      'color:white; padding:10px 14px; font-family:Arial,sans-serif; font-size:14px;' +
      'text-align:center; box-shadow:0 2px 8px rgba(0,0,0,0.3);';
    barra.innerHTML =
      '⚠️ Server della sagra non raggiungibile. ' +
      'Controlla di essere collegato al WiFi della sagra, poi ' +
      '<button style="margin-left:6px; padding:4px 10px; border:none; border-radius:4px; cursor:pointer;" ' +
      'onclick="location.reload()">riprova</button>';
    if (document.body) document.body.appendChild(barra);
    else document.addEventListener('DOMContentLoaded', () => document.body.appendChild(barra));
  }

  window.fetch = function (risorsa, opzioni) {
    const versoIlServer = typeof risorsa === 'string' && risorsa.indexOf('/api') === 0;
    if (versoIlServer) {
      risorsa = SERVER_SAGRA + risorsa;
      // 'omit': non servono cookie di sessione (l'autenticazione del
      // progetto viaggia nel corpo/query delle richieste) ed evita che il
      // browser rifiuti la chiamata cross-origin per via delle credenziali.
      opzioni = Object.assign({ credentials: 'omit' }, opzioni || {});
    }
    const richiesta = fetchOriginale(risorsa, opzioni);
    if (!versoIlServer) return richiesta;

    return richiesta.catch((errore) => {
      // Qui si finisce per problemi di RETE (server spento, WiFi sbagliato,
      // CORS rifiutato, blocco Private Network Access): non per risposte di
      // errore del server, che arrivano regolarmente con il loro codice.
      console.error('[base-api] Chiamata fallita:', risorsa, errore);
      mostraAvvisoServerIrraggiungibile();
      throw errore;
    });
  };

  console.log('[base-api] Modalita' + "'" + ' esterna: le chiamate API vanno a ' + SERVER_SAGRA);
})();
