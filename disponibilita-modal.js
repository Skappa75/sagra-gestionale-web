// public/disponibilita-modal.js
// Componente condiviso "Piatto in Esaurimento" (20/7/2026): pulsante+modal
// usato da Supporto Camerieri, Cucina e Griglieria per segnalare a Cassa la
// quantità residua stimata delle pietanze abilitate in Gestione Menu
// (flag "tracciabile_esaurimento"). Mettere 0 = pietanza esaurita.
//
// Ogni pagina ospitante deve solo:
//  1. Includere questo script + avere già incluso stile-comune.css
//  2. Aprire il modal chiamando: apriModalDisponibilita({ serataId, ruolo, focusVoceId })
//     - serataId: id della serata aperta (null/assente = avviso e nessuna apertura)
//     - ruolo: etichetta testuale per tracciare chi ha aggiornato (es. "Griglieria")
//     - focusVoceId (opzionale, 20/7/2026): id della singola pietanza da
//       evidenziare e mettere a fuoco all'apertura — usato quando si tocca
//       direttamente una cella già in vista (es. riga "Residuo cassa" di
//       Cucina/Griglieria) invece del pulsante generico in testata.
//
// Il modal riusa le classi .modal-overlay / .modal-contenuto già definite in
// stile-comune.css (stesso componente riutilizzabile della Cassa).

(function () {
  let modalCreato = false;
  let contestoCorrente = null;

  function creaModalSeServe() {
    if (modalCreato) return;
    const div = document.createElement('div');
    div.id = 'modal-disponibilita';
    div.className = 'modal-overlay';
    div.style.display = 'none';
    div.innerHTML = `
      <div class="modal-contenuto" style="max-width:700px;">
        <h2>🍽️ Piatto in esaurimento</h2>
        <p style="font-size:14px; color:var(--colore-grigio); margin-top:-8px;">
          Inserisci la quantità stimata ancora disponibile per le pietanze sotto controllo.
          Metti 0 per segnare "esaurito". Il valore compare in Cassa quando scende a 5 o meno.
        </p>
        <div id="lista-disponibilita-voci">Caricamento...</div>
        <button id="btn-chiudi-disponibilita" class="btn-secondario" style="margin-top:15px;">Chiudi</button>
      </div>
    `;
    document.body.appendChild(div);
    document.getElementById('btn-chiudi-disponibilita').addEventListener('click', () => {
      div.style.display = 'none';
    });
    modalCreato = true;
  }

  async function caricaEDisegna(portaFocus) {
    const cont = document.getElementById('lista-disponibilita-voci');
    cont.innerHTML = 'Caricamento...';
    let categorie, disponibilita;
    try {
      const [vociRes, dispRes] = await Promise.all([
        fetch('/api/disponibilita/voci-tracciabili'),
        fetch(`/api/disponibilita?serata_id=${contestoCorrente.serataId}`)
      ]);
      categorie = await vociRes.json();
      disponibilita = await dispRes.json();
    } catch (err) {
      cont.innerHTML = '<p>Errore di caricamento. Riprova.</p>';
      return;
    }

    const mappa = {};
    disponibilita.forEach(d => { mappa[d.voce_menu_id] = d; });

    const categorieConVoci = categorie.filter(c => c.voci.length > 0);
    if (categorieConVoci.length === 0) {
      cont.innerHTML = '<p>Nessuna pietanza abilitata alla segnalazione esaurimento. Attivale da Gestione Menu (Cassa → "Segnalabile esaurimento").</p>';
      return;
    }

    cont.innerHTML = categorieConVoci.map(cat => `
      <h3 style="color:var(--colore-verde-scuro); margin-bottom:6px;">${cat.nome}</h3>
      ${cat.voci.map(v => {
        const stato = mappa[v.id];
        const tracciata = stato && stato.quantita_residua != null;
        const valoreAttuale = tracciata ? stato.quantita_residua : '';
        const infoUltimo = (tracciata && stato.aggiornato_da)
          ? `<span style="font-size:12px; color:var(--colore-grigio); flex-basis:100%;">ultimo aggiornamento: ${stato.aggiornato_da}</span>`
          : '';
        return `
          <div id="riga-disponibilita-${v.id}" style="display:flex; align-items:center; flex-wrap:wrap; gap:10px; padding:8px 0; border-bottom:1px solid #e2ded4;">
            <span style="flex:2; font-size:18px; min-width:140px;">${v.nome}</span>
            <div class="stepper">
              <button type="button" data-decrementa="${v.id}" ${tracciata ? '' : 'disabled'} title="Un pezzo in meno">−</button>
              <input type="number" min="0" step="1" class="input-quantita" placeholder="q.tà" data-voce-id="${v.id}"
                value="${valoreAttuale}">
              <button type="button" data-incrementa="${v.id}" title="Un pezzo in più">+</button>
            </div>
            <button data-salva="${v.id}" class="btn-secondario" style="width:auto; margin:0; padding:8px 14px;">Salva</button>
            <button data-rimuovi="${v.id}" style="padding:8px 10px; cursor:pointer;" title="Non più monitorata stasera">✕</button>
            ${infoUltimo}
          </div>
        `;
      }).join('')}
    `).join('');

    cont.querySelectorAll('[data-salva]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.salva;
        const input = cont.querySelector(`input[data-voce-id="${id}"]`);
        const valore = parseInt(input.value);
        if (isNaN(valore) || valore < 0) { alert('Inserisci un numero valido (0 o superiore).'); return; }
        await fetch(`/api/disponibilita/${id}/imposta`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serata_id: contestoCorrente.serataId, quantita_residua: valore, aggiornato_da: contestoCorrente.ruolo })
        });
        caricaEDisegna();
      });
    });
    cont.querySelectorAll('[data-rimuovi]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.rimuovi;
        await fetch(`/api/disponibilita/${id}/rimuovi`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serata_id: contestoCorrente.serataId })
        });
        caricaEDisegna();
      });
    });
    // "+" / "−" (21/7/2026): correzione rapida senza dover digitare e
    // premere "Salva". Salvano subito, una unità alla volta.
    //  - "+" su una voce MAI tracciata stasera la inizializza a 1 (il primo
    //    tocco equivale a "ne è rimasto almeno uno"): da lì in poi si
    //    comporta come le altre, con "−" riabilitato al ricaricamento.
    //  - "−" resta disabilitato finché la voce non è tracciata: non ha
    //    senso togliere da un valore che non esiste ancora.
    //  - Riusa lo stesso endpoint /scala già usato dallo stepper di Cassa
    //    a ogni voce ordinata: non scende mai sotto zero.
    cont.querySelectorAll('[data-incrementa]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.incrementa;
        const input = cont.querySelector(`input[data-voce-id="${id}"]`);
        const nonAncoraTracciata = !input || input.value === '';
        if (nonAncoraTracciata) {
          await fetch(`/api/disponibilita/${id}/imposta`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ serata_id: contestoCorrente.serataId, quantita_residua: 1, aggiornato_da: contestoCorrente.ruolo })
          });
        } else {
          await fetch(`/api/disponibilita/${id}/scala`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ serata_id: contestoCorrente.serataId, variazione: -1, aggiornato_da: contestoCorrente.ruolo })
          });
        }
        caricaEDisegna();
      });
    });
    cont.querySelectorAll('[data-decrementa]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.decrementa;
        await fetch(`/api/disponibilita/${id}/scala`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serata_id: contestoCorrente.serataId, variazione: 1, aggiornato_da: contestoCorrente.ruolo })
        });
        caricaEDisegna();
      });
    });

    // Voce singola preselezionata (contesto.focusVoceId): scorre fino alla
    // riga, la evidenzia brevemente e — solo alla primissima apertura, non
    // ai ricaricamenti dopo un Salva/Rimuovi — porta il focus sull'input,
    // pronta per digitare subito la nuova quantità.
    if (contestoCorrente.focusVoceId) {
      evidenziaVoce(contestoCorrente.focusVoceId, portaFocus);
    }
  }

  function evidenziaVoce(voceId, portaFocus) {
    const riga = document.getElementById(`riga-disponibilita-${voceId}`);
    if (!riga) return;
    riga.scrollIntoView({ behavior: 'smooth', block: 'center' });
    riga.classList.add('riga-disponibilita-evidenziata');
    setTimeout(() => riga.classList.remove('riga-disponibilita-evidenziata'), 1600);
    if (portaFocus) {
      const input = riga.querySelector('input[data-voce-id]');
      if (input) { input.focus(); input.select(); }
    }
  }

  window.apriModalDisponibilita = function (contesto) {
    if (!contesto || !contesto.serataId) {
      alert('Nessuna serata aperta: impossibile segnalare la disponibilità.');
      return;
    }
    contestoCorrente = contesto;
    creaModalSeServe();
    document.getElementById('modal-disponibilita').style.display = 'flex';
    caricaEDisegna(true);
  };
})();
