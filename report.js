// ==========================================================
// public/report.js
// Modulo Report & Bilanci.
//
// Due modalità di accesso (vedi routes/report.js):
//  - Cassa: sblocco automatico (identità 'sagra_identita' in localStorage
//    con ruolo 'cassa'), vede solo il riepilogo della serata attiva.
//  - Chiunque altro (o Cassa che vuole di più): password admin, sblocca
//    anche cumulativo sagra e storico comande con filtri.
//
// Nessuna scrittura: questa pagina fa solo GET verso /api/report/*.
// ==========================================================

const API = '/api/report';

let password = null;          // valorizzata solo dopo sblocco admin
let modalitaCassa = false;
let elencoSerate = [];        // popolato solo in modalità admin
let ultimoRiepilogo = null;   // cache per la stampa
let serataCorrenteMeta = null; // { numero_serata, data, stato } della serata mostrata
let ultimoCumulativo = null;
let nomeSagraCorrente = 'Sagra degli Strozzapreti'; // aggiornata in init() da marchio-sagra.js

function leggiIdentita() {
  try {
    return JSON.parse(localStorage.getItem('sagra_identita'));
  } catch (e) {
    return null;
  }
}

function escapeHtml(testo) {
  const div = document.createElement('div');
  div.textContent = testo == null ? '' : String(testo);
  return div.innerHTML;
}

function formattaEuro(valore) {
  return '€ ' + Number(valore || 0).toFixed(2);
}

function formattaMinuti(minuti) {
  if (minuti == null) return '—';
  return Math.round(minuti) + ' min';
}

function formattaData(ts) {
  if (!ts) return '—';
  const [data, ora] = ts.split(' ');
  const [aa, mm, gg] = data.split('-');
  return `${gg}/${mm}${ora ? ' ' + ora.slice(0, 5) : ''}`;
}

// ----------------------------------------------------------
// Avvio
// ----------------------------------------------------------
async function init() {
  nomeSagraCorrente = await window.nomeSagra();
  const identita = leggiIdentita();

  if (identita && identita.ruolo === 'cassa') {
    modalitaCassa = true;
    document.getElementById('box-gate').classList.add('nascosto');
    document.getElementById('area-report').classList.remove('nascosto');
    document.getElementById('sezione-cumulativo').classList.add('nascosto');
    document.getElementById('sezione-storico').classList.add('nascosto');
    document.getElementById('btn-sblocca-admin').classList.remove('nascosto');
    await caricaSerataAttiva();
  }

  document.getElementById('btn-entra-gate').addEventListener('click', accediAdmin);
  document.getElementById('input-password-gate').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') accediAdmin();
  });
  document.getElementById('btn-sblocca-admin').addEventListener('click', () => {
    document.getElementById('box-gate').classList.remove('nascosto');
    document.getElementById('box-gate').scrollIntoView({ behavior: 'smooth' });
  });
  document.getElementById('select-serata').addEventListener('change', (e) => {
    if (e.target.value) caricaRiepilogoSerataId(e.target.value);
  });
  document.getElementById('btn-cerca-storico').addEventListener('click', cercaStorico);
  document.getElementById('btn-stampa-serata').addEventListener('click', stampaRiepilogoSerata);
  document.getElementById('btn-stampa-cumulativo').addEventListener('click', stampaCumulativo);
  document.getElementById('btn-esporta-serata-excel').addEventListener('click', () => esportaSerata('excel'));
  document.getElementById('btn-esporta-serata-pdf').addEventListener('click', () => esportaSerata('pdf'));
  document.getElementById('btn-esporta-cumulativo-excel').addEventListener('click', () => esportaCumulativo('excel'));
  document.getElementById('btn-esporta-cumulativo-pdf').addEventListener('click', () => esportaCumulativo('pdf'));
}

// ----------------------------------------------------------
// Modalità Cassa: solo serata attiva, nessuna password
// ----------------------------------------------------------
async function caricaSerataAttiva() {
  document.getElementById('etichetta-serata-fissa').textContent = 'Caricamento...';
  const risposta = await fetch(`${API}/serata-attiva`);

  if (!risposta.ok) {
    document.getElementById('etichetta-serata-fissa').textContent = 'Nessuna serata aperta al momento.';
    return;
  }

  const dati = await risposta.json();
  serataCorrenteMeta = dati.serata;
  document.getElementById('etichetta-serata-fissa').textContent =
    `Serata attiva: ${dati.serata.numero_serata} (${dati.serata.data})`;
  renderRiepilogo(dati.riepilogo);
}

// ----------------------------------------------------------
// Sblocco Admin: password + elenco serate + cumulativo + storico
// ----------------------------------------------------------
async function accediAdmin() {
  const inputPass = document.getElementById('input-password-gate').value;
  const errore = document.getElementById('errore-gate');
  errore.textContent = '';

  const risposta = await fetch(`${API}/serate?password=${encodeURIComponent(inputPass)}`);
  if (!risposta.ok) {
    errore.textContent = 'Password errata.';
    return;
  }

  elencoSerate = await risposta.json();
  password = inputPass;
  modalitaCassa = false;

  document.getElementById('box-gate').classList.add('nascosto');
  document.getElementById('area-report').classList.remove('nascosto');
  document.getElementById('sezione-cumulativo').classList.remove('nascosto');
  document.getElementById('sezione-storico').classList.remove('nascosto');
  document.getElementById('btn-sblocca-admin').classList.add('nascosto');
  document.getElementById('etichetta-serata-fissa').classList.add('nascosto');
  document.getElementById('etichetta-select-serata').classList.remove('nascosto');
  // Export su file: richiedono la password admin (scrivono su disco in
  // reports/), quindi compaiono solo dopo lo sblocco, non in modalità Cassa.
  document.getElementById('btn-esporta-serata-excel').classList.remove('nascosto');
  document.getElementById('btn-esporta-serata-pdf').classList.remove('nascosto');

  const select = document.getElementById('select-serata');
  select.classList.remove('nascosto');
  select.innerHTML = elencoSerate.map(s =>
    `<option value="${s.id}">Serata ${s.numero_serata} — ${escapeHtml(s.data)} (${s.stato})</option>`
  ).join('');

  const filtroSerata = document.getElementById('filtro-serata');
  filtroSerata.innerHTML = '<option value="">Tutte le serate</option>' + elencoSerate.map(s =>
    `<option value="${s.id}">Serata ${s.numero_serata}</option>`
  ).join('');

  const serataAperta = elencoSerate.find(s => s.stato === 'aperta');
  const daSelezionare = serataAperta || elencoSerate[elencoSerate.length - 1];
  if (daSelezionare) {
    select.value = daSelezionare.id;
    await caricaRiepilogoSerataId(daSelezionare.id);
  }

  await caricaCumulativo();
  await cercaStorico();
}

async function caricaRiepilogoSerataId(id) {
  const risposta = await fetch(`${API}/serata/${id}?password=${encodeURIComponent(password)}`);
  if (!risposta.ok) return;
  const dati = await risposta.json();
  serataCorrenteMeta = dati.serata;
  renderRiepilogo(dati.riepilogo);
}

// ----------------------------------------------------------
// Rendering riepilogo serata (comune Cassa/Admin)
// ----------------------------------------------------------
function renderRiepilogo(riepilogo) {
  ultimoRiepilogo = riepilogo;

  document.getElementById('kpi-totale').textContent = formattaEuro(riepilogo.totale_incasso);
  document.getElementById('kpi-comande').textContent = riepilogo.numero_comande;
  document.getElementById('kpi-carta').textContent = riepilogo.numero_comande_carta;
  document.getElementById('kpi-tempo').textContent = formattaMinuti(riepilogo.tempo_medio_servizio_minuti);

  document.getElementById('corpo-categoria').innerHTML = riepilogo.vendite_per_categoria.map(r => `
    <tr><td>${escapeHtml(r.categoria)}</td><td class="numero">${r.quantita}</td><td class="numero">${formattaEuro(r.incasso)}</td></tr>
  `).join('') || '<tr><td colspan="3">Nessuna vendita registrata.</td></tr>';

  document.getElementById('corpo-voce').innerHTML = riepilogo.vendite_per_voce.map(r => `
    <tr><td>${escapeHtml(r.voce)}</td><td>${escapeHtml(r.categoria)}</td><td class="numero">${r.quantita}</td><td class="numero">${formattaEuro(r.incasso)}</td></tr>
  `).join('') || '<tr><td colspan="4">Nessuna vendita registrata.</td></tr>';
}

// ----------------------------------------------------------
// Cumulativo sagra (solo Admin)
// ----------------------------------------------------------
async function caricaCumulativo() {
  const risposta = await fetch(`${API}/cumulativo?password=${encodeURIComponent(password)}`);
  if (!risposta.ok) return;
  const dati = await risposta.json();
  ultimoCumulativo = dati;

  document.getElementById('kpi-cum-totale').textContent = formattaEuro(dati.totale_incasso);
  document.getElementById('kpi-cum-comande').textContent = dati.numero_comande;
  document.getElementById('kpi-cum-carta').textContent = dati.numero_comande_carta;
  document.getElementById('kpi-cum-tempo').textContent = formattaMinuti(dati.tempo_medio_servizio_minuti);

  document.getElementById('corpo-per-serata').innerHTML = dati.per_serata.map(s => `
    <tr><td>${s.numero_serata}</td><td>${escapeHtml(s.data)}</td><td>${escapeHtml(s.stato)}</td><td class="numero">${s.numero_comande}</td><td class="numero">${formattaEuro(s.totale_incasso)}</td></tr>
  `).join('');
}

// ----------------------------------------------------------
// Storico comande con filtri (solo Admin)
// ----------------------------------------------------------
async function cercaStorico() {
  const parametri = new URLSearchParams();
  parametri.set('password', password || '');

  const serataId = document.getElementById('filtro-serata').value;
  const numero = document.getElementById('filtro-numero').value.trim();
  const cameriere = document.getElementById('filtro-cameriere').value.trim();
  const tavolo = document.getElementById('filtro-tavolo').value.trim();
  const stato = document.getElementById('filtro-stato').value;

  if (serataId) parametri.set('serata_id', serataId);
  if (numero) parametri.set('numero', numero);
  if (cameriere) parametri.set('cameriere', cameriere);
  if (tavolo) parametri.set('tavolo', tavolo);
  if (stato) parametri.set('stato', stato);

  const risposta = await fetch(`${API}/comande?${parametri.toString()}`);
  if (!risposta.ok) return;
  const righe = await risposta.json();

  document.getElementById('corpo-storico').innerHTML = righe.map(r => {
    const tavoloTxt = r.gruppo_nome
      ? escapeHtml(r.gruppo_nome)
      : (r.fila ? `Fila ${r.fila} - Tav. ${r.numero_tavolo}` : '—');
    const statoTxt = r.flag_carta
      ? '<span class="badge-carta">Carta</span>'
      : (r.chiusa_il ? 'Chiusa' : 'Aperta');

    return `<tr>
      <td>${escapeHtml(r.numero_comanda)}</td>
      <td>${r.numero_serata}</td>
      <td>${tavoloTxt}</td>
      <td>${escapeHtml(r.cameriere_nome || '—')}</td>
      <td>${statoTxt}</td>
      <td class="numero">${formattaEuro(r.totale)}</td>
      <td>${formattaData(r.timestamp_creazione)}</td>
      <td>${formattaData(r.chiusa_il)}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="8">Nessuna comanda trovata con questi filtri.</td></tr>';
}

// ----------------------------------------------------------
// Stampa A4 (stessa tecnica di cassa.js: finestra dedicata + window.print())
// ----------------------------------------------------------
function apriStampa(titolo, corpoHtml) {
  const finestra = window.open('', '_blank');
  finestra.document.write(`
    <html>
    <head>
      <title>${escapeHtml(titolo)}</title>
      <style>
        @page { size: A4 portrait; margin: 15mm; }
        body { margin: 0; font-family: Arial, sans-serif; color: #222; }
        .header-logo { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
        .header-logo img { height: 50px; }
        .titolo-sagra { font-size: 16px; font-weight: bold; }
        h1 { font-size: 20px; margin: 4px 0 2px; }
        .sottotitolo { font-size: 13px; color: #555; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
        th, td { padding: 5px 8px; border-bottom: 1px solid #ccc; font-size: 13px; text-align: left; }
        td.numero, th.numero { text-align: right; }
        th { background: #f0efe9; }
        .kpi-riga-stampa { display: flex; gap: 14px; margin-bottom: 16px; }
        .kpi-box { border: 1px solid #ccc; border-radius: 6px; padding: 8px 12px; flex: 1; }
        .kpi-box .v { font-size: 18px; font-weight: bold; }
        .kpi-box .l { font-size: 11px; color: #555; }
      </style>
    </head>
    <body onload="window.print()">
      <div class="header-logo">
        <img src="${new URL('img/logo-proloco.png', document.baseURI).href}" onerror="this.style.display='none'">
        <div class="titolo-sagra">${escapeHtml(nomeSagraCorrente)}</div>
      </div>
      ${corpoHtml}
    </body>
    </html>
  `);
  finestra.document.close();
}

function stampaRiepilogoSerata() {
  if (!ultimoRiepilogo) return;
  const r = ultimoRiepilogo;
  const meta = serataCorrenteMeta
    ? `Serata ${serataCorrenteMeta.numero_serata} — ${serataCorrenteMeta.data}`
    : 'Serata';

  const corpo = `
    <h1>Riepilogo di serata</h1>
    <div class="sottotitolo">${escapeHtml(meta)} — stampato il ${new Date().toLocaleString('it-IT')}</div>
    <div class="kpi-riga-stampa">
      <div class="kpi-box"><div class="v">${formattaEuro(r.totale_incasso)}</div><div class="l">Totale incassato</div></div>
      <div class="kpi-box"><div class="v">${r.numero_comande}</div><div class="l">Comande</div></div>
      <div class="kpi-box"><div class="v">${r.numero_comande_carta}</div><div class="l">Comande a carta</div></div>
      <div class="kpi-box"><div class="v">${formattaMinuti(r.tempo_medio_servizio_minuti)}</div><div class="l">Tempo medio servizio</div></div>
    </div>
    <h2>Vendite per categoria</h2>
    <table>
      <thead><tr><th>Categoria</th><th class="numero">Quantità</th><th class="numero">Incasso</th></tr></thead>
      <tbody>
        ${r.vendite_per_categoria.map(c => `<tr><td>${escapeHtml(c.categoria)}</td><td class="numero">${c.quantita}</td><td class="numero">${formattaEuro(c.incasso)}</td></tr>`).join('')}
      </tbody>
    </table>
    <h2>Vendite per voce di menu</h2>
    <table>
      <thead><tr><th>Voce</th><th>Categoria</th><th class="numero">Quantità</th><th class="numero">Incasso</th></tr></thead>
      <tbody>
        ${r.vendite_per_voce.map(v => `<tr><td>${escapeHtml(v.voce)}</td><td>${escapeHtml(v.categoria)}</td><td class="numero">${v.quantita}</td><td class="numero">${formattaEuro(v.incasso)}</td></tr>`).join('')}
      </tbody>
    </table>
  `;
  apriStampa(`Riepilogo ${meta}`, corpo);
}

function stampaCumulativo() {
  if (!ultimoCumulativo) return;
  const d = ultimoCumulativo;

  const corpo = `
    <h1>Riepilogo cumulativo — intera sagra</h1>
    <div class="sottotitolo">Stampato il ${new Date().toLocaleString('it-IT')}</div>
    <div class="kpi-riga-stampa">
      <div class="kpi-box"><div class="v">${formattaEuro(d.totale_incasso)}</div><div class="l">Totale incassato</div></div>
      <div class="kpi-box"><div class="v">${d.numero_comande}</div><div class="l">Comande</div></div>
      <div class="kpi-box"><div class="v">${d.numero_comande_carta}</div><div class="l">Comande a carta</div></div>
      <div class="kpi-box"><div class="v">${formattaMinuti(d.tempo_medio_servizio_minuti)}</div><div class="l">Tempo medio servizio</div></div>
    </div>
    <h2>Confronto serata per serata</h2>
    <table>
      <thead><tr><th>Serata</th><th>Data</th><th>Stato</th><th class="numero">Comande</th><th class="numero">Incasso</th></tr></thead>
      <tbody>
        ${d.per_serata.map(s => `<tr><td>${s.numero_serata}</td><td>${escapeHtml(s.data)}</td><td>${escapeHtml(s.stato)}</td><td class="numero">${s.numero_comande}</td><td class="numero">${formattaEuro(s.totale_incasso)}</td></tr>`).join('')}
      </tbody>
    </table>
    <h2>Vendite per categoria (intera sagra)</h2>
    <table>
      <thead><tr><th>Categoria</th><th class="numero">Quantità</th><th class="numero">Incasso</th></tr></thead>
      <tbody>
        ${d.vendite_per_categoria.map(c => `<tr><td>${escapeHtml(c.categoria)}</td><td class="numero">${c.quantita}</td><td class="numero">${formattaEuro(c.incasso)}</td></tr>`).join('')}
      </tbody>
    </table>
  `;
  apriStampa('Riepilogo cumulativo sagra', corpo);
}

// ----------------------------------------------------------
// Export su file (Excel/PDF): il server genera il file, lo salva in
// reports/<edizione>/ e lo invia in risposta alla stessa richiesta — il
// browser lo scarica come un download qualunque, apertura in una nuova
// scheda per non perdere lo stato della pagina corrente.
// ----------------------------------------------------------
function esportaSerata(formato) {
  if (!serataCorrenteMeta || !serataCorrenteMeta.id) { alert('Nessuna serata selezionata.'); return; }
  const url = `${API}/serata/${serataCorrenteMeta.id}/${formato}?password=${encodeURIComponent(password || '')}`;
  window.open(url, '_blank');
}

function esportaCumulativo(formato) {
  const url = `${API}/cumulativo/${formato}?password=${encodeURIComponent(password || '')}`;
  window.open(url, '_blank');
}

init();
