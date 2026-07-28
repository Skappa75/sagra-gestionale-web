let menuData = [];

// ----------------------------------------------------------
// Accesso: sblocco automatico se già loggato come Cassa in questo browser
// (stessa identità 'sagra_identita' usata da cassa.html), altrimenti serve
// la password di una Cassa o dell'Admin (POST /api/auth/verifica-accesso-menu).
// ----------------------------------------------------------
function leggiIdentita() {
  try {
    return JSON.parse(localStorage.getItem('sagra_identita'));
  } catch (e) {
    return null;
  }
}

function sbloccaGestioneMenu() {
  document.getElementById('box-gate').classList.add('nascosto');
  document.getElementById('gestione-menu').classList.remove('nascosto');
  carica();
}

async function verificaAccesso() {
  const identita = leggiIdentita();
  if (identita && identita.ruolo === 'cassa') {
    sbloccaGestioneMenu();
    return;
  }

  document.getElementById('btn-entra-gate').addEventListener('click', tentaSblocco);
  document.getElementById('input-password-gate').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') tentaSblocco();
  });
}

async function tentaSblocco() {
  const password = document.getElementById('input-password-gate').value;
  const errore = document.getElementById('errore-gate');
  errore.textContent = '';

  const risposta = await fetch('/api/auth/verifica-accesso-menu', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });

  if (!risposta.ok) {
    errore.textContent = 'Password errata.';
    return;
  }

  sbloccaGestioneMenu();
}

async function carica() {
  const res = await fetch('/api/menu/tutte');
  menuData = await res.json();
  render();
}

function render() {
  const cont = document.getElementById('gestione-menu');
  cont.innerHTML = '';
  menuData.forEach(cat => {
    const sezione = document.createElement('section');
    sezione.innerHTML = `<h2>${cat.nome}</h2>`;

    const tabella = document.createElement('table');
    tabella.innerHTML = `<tr><th>Nome</th><th>Prezzo (€)</th><th>Monitorata</th><th>Segnalabile esaurimento</th><th>Attiva</th><th>Ordine</th><th></th></tr>`;
    cat.voci.forEach((v, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input type="text" value="${v.nome}" data-campo="nome" data-id="${v.id}"></td>
        <td><input type="number" step="0.10" value="${v.prezzo}" data-campo="prezzo" data-id="${v.id}"></td>
        <td><input type="checkbox" ${v.monitorata ? 'checked' : ''} data-campo="monitorata" data-id="${v.id}"></td>
        <td><input type="checkbox" ${v.tracciabile_esaurimento ? 'checked' : ''} data-campo="tracciabile_esaurimento" data-id="${v.id}" title="Compare nel pannello 'Piatto in Esaurimento' di Supporto Camerieri/Cucina/Griglieria"></td>
        <td><input type="checkbox" ${v.attiva ? 'checked' : ''} data-campo="attiva" data-id="${v.id}"></td>
        <td>
          <button data-sposta="su" data-id="${v.id}" ${idx === 0 ? 'disabled' : ''}>↑</button>
          <button data-sposta="giu" data-id="${v.id}" ${idx === cat.voci.length - 1 ? 'disabled' : ''}>↓</button>
        </td>
        <td><button class="btn-elimina" data-elimina="${v.id}">Elimina</button></td>
      `;
      tabella.appendChild(tr);
    });
    sezione.appendChild(tabella);

    const formNuova = document.createElement('form');
    formNuova.className = 'form-nuova-voce';
    formNuova.innerHTML = `
      <input type="text" placeholder="Nome nuova pietanza" required data-nuova="nome">
      <input type="number" step="0.10" placeholder="Prezzo" required data-nuova="prezzo">
      <label><input type="checkbox" checked data-nuova="monitorata"> Monitorata</label>
      <label><input type="checkbox" data-nuova="tracciabile_esaurimento"> Segnalabile esaurimento</label>
      <button type="submit">Aggiungi</button>`;
    formNuova.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nome = formNuova.querySelector('[data-nuova="nome"]').value;
      const prezzo = parseFloat(formNuova.querySelector('[data-nuova="prezzo"]').value);
      const monitorata = formNuova.querySelector('[data-nuova="monitorata"]').checked;
      const tracciabile_esaurimento = formNuova.querySelector('[data-nuova="tracciabile_esaurimento"]').checked;
      await fetch('/api/menu/voci', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoria_id: cat.id, nome, prezzo, monitorata, tracciabile_esaurimento })
      });
      carica();
    });
    sezione.appendChild(formNuova);
    cont.appendChild(sezione);
  });

  // eventi modifica campi esistenti
  cont.querySelectorAll('input[data-campo]').forEach(input => {
    input.addEventListener('change', async (e) => {
      const id = e.target.dataset.id;
      const campo = e.target.dataset.campo;
      const valore = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      const body = {}; body[campo] = valore;
      await fetch(`/api/menu/voci/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    });
  });

  // eventi sposta su/giù
  cont.querySelectorAll('[data-sposta]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await fetch(`/api/menu/voci/${btn.dataset.id}/sposta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direzione: btn.dataset.sposta })
      });
      carica();
    });
  });

  // eventi eliminazione
  cont.querySelectorAll('[data-elimina]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.elimina;
      const nomeVoce = btn.closest('tr').querySelector('[data-campo="nome"]').value;
      if (!confirm(`Eliminare definitivamente "${nomeVoce}"? L'operazione non si può annullare.`)) return;

      const res = await fetch(`/api/menu/voci/${id}`, { method: 'DELETE' });
      const dati = await res.json();
      if (dati.errore) {
        alert(dati.errore);
        return;
      }
      carica();
    });
  });
}

// ==========================================================
// Stampa menu (20/7/2026): due formati, entrambi in bianco e nero, con
// header logo Pro Loco + etichetta edizione corrente ("N° Sagra degli
// Strozzapreti", già pronta da window.nomeSagra() — vedi marchio-sagra.js).
// Solo voci con attiva=1: una voce disattivata non deve comparire sui menu
// esposti né su quelli di pre-comanda.
// ==========================================================

function escapeHtml(testo) {
  const div = document.createElement('div');
  div.textContent = testo;
  return div.innerHTML;
}

function categorieAttivePerStampa() {
  return menuData
    .map(cat => ({ nome: cat.nome, voci: cat.voci.filter(v => v.attiva) }))
    .filter(cat => cat.voci.length > 0);
}

// ---------- Menù "espositivo": A4 verticale, una copia a pagina intera,
// nome a sinistra / prezzo a destra, pensato per essere affisso in grande
// su un piedistallo. ----------
async function stampaMenuEspositivo() {
  const categorie = categorieAttivePerStampa();
  if (categorie.length === 0) { alert('Nessuna voce di menu attiva da stampare.'); return; }
  const etichetta = await window.nomeSagra();

  const corpoHtml = categorie.map(cat => `
    <div class="blocco-categoria">
      <h2>${escapeHtml(cat.nome)}</h2>
      ${cat.voci.map(v => `
        <div class="riga-voce-espositivo">
          <span class="nome">${escapeHtml(v.nome)}</span>
          <span class="prezzo">€ ${v.prezzo.toFixed(2)}</span>
        </div>
      `).join('')}
    </div>
  `).join('');

  const finestra = window.open('', '_blank');
  finestra.document.write(`
    <html>
    <head>
      <title>Menù espositivo</title>
      <style>
        @page { size: A4 portrait; margin: 15mm; }
        body { margin: 0; font-family: Arial, sans-serif; color: #000; }
        .header-stampa { display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 10mm; }
        .header-stampa img { height: 70px; }
        .titolo-stampa { font-size: 20px; font-weight: bold; }
        .titolo-menu { text-align: center; font-size: 34px; margin: 0 0 12mm; letter-spacing: 2px; }
        .blocco-categoria { margin-bottom: 9mm; page-break-inside: avoid; }
        .blocco-categoria h2 { font-size: 24px; border-bottom: 2px solid #000; padding-bottom: 4px; margin: 0 0 6px; }
        .riga-voce-espositivo { display: flex; justify-content: space-between; align-items: baseline; font-size: 20px; padding: 5px 0; }
        .riga-voce-espositivo .nome { text-align: left; }
        .riga-voce-espositivo .prezzo { text-align: right; font-weight: bold; white-space: nowrap; margin-left: 12px; }
      </style>
    </head>
    <body onload="window.print()">
      <div class="header-stampa">
        <img src="${new URL('img/logo-proloco.png', document.baseURI).href}" onerror="this.style.display='none'">
        <div class="titolo-stampa">${escapeHtml(etichetta)}</div>
      </div>
      <h1 class="titolo-menu">Menù</h1>
      ${corpoHtml}
    </body>
    </html>
  `);
  finestra.document.close();
}

// ---------- Menù "pre-comanda": A4 VERTICALE, due colonne UGUALI affiancate
// separate da una riga tratteggiata: tagliando il foglio a metà in
// verticale si ottengono due moduli distinti da consegnare ai clienti.
// Griglia in stile foglio Excel (celle bordate): descrizione, prezzo e una
// cella vuota dove il cliente scrive a penna la quantità desiderata, da
// presentare poi in Cassa. Header e margini ridotti al minimo.
//
// 20/7/2026 — RISCRITTO dopo due tentativi falliti con un calcolo statico
// in mm (calcolaDensitaPrecomanda): la stima a priori dello spazio
// disponibile si è rivelata inaffidabile in pratica (Skappa ha confermato
// che alcune voci restavano tagliate fuori dalla stampa), probabilmente per
// scarti tra la stima teorica e la resa reale del browser (metriche del
// font, "line-height" in mm arrotondato, ecc.). Invece di indovinare,
// adesso si MISURA davvero: lo script scritto nella finestra di stampa
// confronta l'altezza reale del contenuto (scrollHeight) con l'altezza
// reale disponibile (clientHeight, fissata dal CSS a piena pagina) e
// riduce gradualmente una scala condivisa (font+riga) finché il contenuto
// non entra per intero, PRIMA di aprire il dialogo di stampa. Nessun
// "overflow:hidden": se anche al minimo leggibile qualcosa non entrasse
// (menu enormemente più lungo di quello attuale), il foglio prosegue su una
// pagina in più invece di tagliare in silenzio delle voci — perdere una
// voce di menu dalla stampa è un rischio inaccettabile per un business,
// una pagina in più stampata per errore è solo una scomodità visibile.
async function stampaMenuPrecomanda() {
  const categorie = categorieAttivePerStampa();
  if (categorie.length === 0) { alert('Nessuna voce di menu attiva da stampare.'); return; }
  const etichetta = await window.nomeSagra();

  const corpoTabella = categorie.map((cat, idxCat) => `
    ${cat.voci.map((v, idxVoce) => `
      <tr class="${idxVoce === 0 && idxCat > 0 ? 'inizio-categoria' : ''}"><td>${escapeHtml(v.nome)}</td><td>€ ${v.prezzo.toFixed(2)}</td><td></td></tr>
    `).join('')}
  `).join('');

  const colonnaHtml = `
    <div class="colonna-precomanda">
      <div class="header-stampa">
        <img src="${new URL('img/logo-proloco.png', document.baseURI).href}" onerror="this.style.display='none'">
        <div class="titolo-stampa">${escapeHtml(etichetta)}</div>
      </div>
      <table class="tabella-precomanda">
        <thead><tr><th>Descrizione</th><th>Prezzo</th><th>Q.tà</th></tr></thead>
        <tbody>${corpoTabella}</tbody>
      </table>
      <div class="nota-precomanda">Compila a penna e presenta questo foglio in Cassa</div>
    </div>
  `;

  const finestra = window.open('', '_blank');
  finestra.document.write(`
    <html>
    <head>
      <title>Menù pre-comanda</title>
      <style>
        @page { size: A4 portrait; margin: 4mm; }
        html { --scala: 1; }
        body { margin: 0; font-family: Arial, sans-serif; color: #000; }
        .foglio-precomanda { display: flex; flex-direction: row; width: 100%; height: 289mm; }
        .colonna-precomanda { width: 50%; height: 100%; box-sizing: border-box; padding: 2mm 3mm; border-right: 1px dashed #000; display: flex; flex-direction: column; }
        .colonna-precomanda:last-child { border-right: none; }
        .header-stampa { display: flex; align-items: center; gap: 6px; margin-bottom: 2mm; }
        .header-stampa img { height: calc(var(--scala) * 34px); }
        .titolo-stampa { font-size: calc(var(--scala) * 14.3px); font-weight: bold; }

        /* table-layout:fixed + nome pietanza forzato su una riga sola
           (nowrap/ellipsis): un nome davvero troppo lungo viene troncato
           con "…" invece di andare a capo — indispensabile perché la
           misurazione sotto assume una riga di testo per voce.
           Basi ingrandite di 1,3x (20/7/2026, su richiesta di Skappa: erano
           11pt/8mm/1.8mm, ora 14.3pt/10.4mm/2.34mm) — lo script di
           adattamento automatico riduce comunque --scala se a piena
           dimensione il contenuto non entrasse più in una colonna. */
        table.tabella-precomanda { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: calc(var(--scala) * 14.3pt); }
        table.tabella-precomanda th, table.tabella-precomanda td {
          border: 1px solid #000;
          padding: calc(var(--scala) * 2.34mm) 2mm;
          line-height: calc(var(--scala) * 10.4mm);
          text-align: left;
        }
        table.tabella-precomanda th { background: #eee; }
        /* Riga di intestazione colonne ("Descrizione"/"Prezzo"/"Q.tà") più
           bassa delle righe voce (20/7/2026, su richiesta di Skappa): non
           serve che sia alta quanto una riga vera e propria, è solo
           un'etichetta. Scala comunque con --scala per restare coerente se
           lo script la riduce ulteriormente. */
        table.tabella-precomanda thead th {
          padding: calc(var(--scala) * 1mm) 2mm;
          line-height: calc(var(--scala) * 4.5mm);
          font-size: calc(var(--scala) * 10pt);
        }
        table.tabella-precomanda th:nth-child(1), table.tabella-precomanda td:nth-child(1) {
          width: 67%;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        table.tabella-precomanda th:nth-child(2), table.tabella-precomanda td:nth-child(2) { width: 18%; text-align: right; white-space: nowrap; }
        table.tabella-precomanda th:nth-child(3), table.tabella-precomanda td:nth-child(3) { width: 15%; }
        /* Al posto di una riga di testo per ogni categoria (coperti,
           bevande, primi, ...), un bordo superiore più marcato separa
           visivamente un gruppo dal successivo, senza consumare una riga
           intera di spazio. */
        tr.inizio-categoria td { border-top: 3px solid #000; }
        .nota-precomanda { font-size: calc(var(--scala) * 10.4px); text-align: center; padding-top: 1mm; }
      </style>
    </head>
    <body>
      <div class="foglio-precomanda">
        ${colonnaHtml}
        ${colonnaHtml}
      </div>
      <script>
        // Riduce --scala finché il contenuto reale (scrollHeight) non entra
        // nell'altezza reale disponibile (clientHeight, fissata a piena
        // pagina dal CSS sopra). Le due colonne sono identiche: basta
        // misurarne e adattarne una, la seconda segue con la stessa --scala
        // (variabile su :root, condivisa da tutta la pagina).
        (function adattaEStampa() {
          var colonna = document.querySelector('.colonna-precomanda');
          var root = document.documentElement;
          var scala = 1;
          var SCALA_MINIMA = 0.35; // pavimento di leggibilità (circa 3.9pt)
          var PASSO = 0.03;
          var tentativi = 0;
          function trabocca() {
            return colonna.scrollHeight > colonna.clientHeight + 1; // +1px di tolleranza arrotondamento
          }
          while (trabocca() && scala > SCALA_MINIMA && tentativi < 60) {
            scala = Math.max(SCALA_MINIMA, scala - PASSO);
            root.style.setProperty('--scala', scala.toFixed(3));
            tentativi++;
          }
          window.print();
        })();
      </script>
    </body>
    </html>
  `);
  finestra.document.close();
}

verificaAccesso();
