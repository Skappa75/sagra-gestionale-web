// ==========================================================
// auth-check.js
// Includi questo script in cima a OGNI pagina di ruolo
// (cassa.html, caposala.html, supporto-camerieri.html, cucina.html, griglieria.html, camerieri.html)
// con: <script src="auth-check.js" data-ruolo-atteso="cassa"></script>
//
// Cosa fa:
//  - Se non c'è nessuna identità salvata → rimanda a login.html
//  - Se l'identità salvata è di un ruolo diverso da quello atteso → rimanda a login.html
//  - Espone window.identitaSagra con i dati dell'utente corrente
//
// NB: il pulsante "Cambia utente/ruolo" NON viene più iniettato qui (rimosso
// il 20/7/2026 perché duplicava, sovrapponendosi in alto a destra, il link
// manuale già presente nell'header di ogni pagina, es. class="link-esci" in
// cassa.html). Ogni pagina definisce il proprio pulsante di uscita nel
// markup dell'header, secondo lo standard di linee-guida-stile.md.
// ==========================================================

(function () {
  const CHIAVE_STORAGE = 'sagra_identita';
  const scriptTag = document.currentScript;
  const ruoloAtteso = scriptTag.getAttribute('data-ruolo-atteso');

  const salvata = localStorage.getItem(CHIAVE_STORAGE);
  let identita = null;

  if (salvata) {
    try {
      identita = JSON.parse(salvata);
    } catch (e) {
      identita = null;
    }
  }

  if (!identita || (ruoloAtteso && identita.ruolo !== ruoloAtteso)) {
    window.location.href = 'login.html';
    return;
  }

  window.identitaSagra = identita;
})();
