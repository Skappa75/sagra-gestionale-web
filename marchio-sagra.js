// ==========================================================
// public/marchio-sagra.js
// Etichetta dinamica dell'edizione corrente della sagra (es. "31° Sagra
// degli Strozzapreti"), al posto del testo fisso scritto a mano in ogni
// pagina — che nel tempo era anche finito disallineato ("degli" in alcuni
// punti, "di" in altri). Letta da GET /api/edizione-corrente (pubblico,
// nessuna password: non è un dato sensibile).
//
// Uso:
//  1) Includi <script src="marchio-sagra.js"></script> in ogni pagina che
//     mostra il marchio: aggiorna da solo ogni <span class="nome-sagra">.
//  2) Se la pagina genera anche un documento di stampa in una finestra
//     separata (es. cassa.js, report.js) e non può aspettare il fetch in
//     quel momento, legga l'etichetta in anticipo con:
//       const etichetta = await window.nomeSagra();
//     Il risultato viene già tenuto in cache: chiamarla più volte non
//     ripete la richiesta di rete.
// ==========================================================

(function () {
  let cache = null;

  window.nomeSagra = async function () {
    if (cache) return cache;
    try {
      const risposta = await fetch('/api/edizione-corrente');
      const dati = await risposta.json();
      cache = dati.etichetta || 'Sagra degli Strozzapreti';
    } catch (e) {
      cache = 'Sagra degli Strozzapreti';
    }
    return cache;
  };

  async function aggiornaSpan() {
    const etichetta = await window.nomeSagra();
    document.querySelectorAll('.nome-sagra').forEach((el) => {
      el.textContent = etichetta;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', aggiornaSpan);
  } else {
    aggiornaSpan();
  }

  // ------------------------------------------------------------
  // Registrazione del service worker a OGNI caricamento pagina (non solo
  // quando si attivano le notifiche): è il requisito che fa passare il
  // sito da "Aggiungi a schermata Home" (shortcut, che MIUI/Xiaomi spesso
  // non lancia) a "Installa app" vera (WebAPK) nel menu di Chrome Android.
  // Solo in contesto sicuro (HTTPS): in HTTP il browser la rifiuterebbe.
  // La registrazione è idempotente e con scope "/" copre tutto il sito.
  // ------------------------------------------------------------
  if (window.isSecureContext && 'serviceWorker' in navigator) {
    // Percorso relativo: funziona sia dalla radice del server locale sia da
    // una sottocartella di GitHub Pages (vedi nota in notifiche-push.js).
    navigator.serviceWorker.register('sw.js').catch(() => { /* non bloccante */ });
  }
})();
