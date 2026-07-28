// ==========================================================
// public/admin.js
// Pannello Admin: Edizioni, Serate, Tavoli, Gruppi di tavoli, Codici accesso.
// Tutte le sezioni condividono la stessa password (in memoria, mai salvata
// in localStorage) inserita una sola volta all'ingresso — stesso pattern
// già usato da report.js.
// ==========================================================

const API_ADMIN = '/api/admin';
const API_AUTH = '/api/auth';

let password = null;
let cacheTavoli = [];     // tutti i tavoli (per checklist gruppi e tabella tavoli)
let cacheEdizioni = [];   // tutte le edizioni (per select "nuova serata")

function escapeHtml(testo) {
  const div = document.createElement('div');
  div.textContent = testo == null ? '' : String(testo);
  return div.innerHTML;
}

function formattaData(ts) {
  if (!ts) return '—';
  const [data, ora] = ts.split(' ');
  const [aa, mm, gg] = data.split('-');
  return `${gg}/${mm}/${aa}${ora ? ' ' + ora.slice(0, 5) : ''}`;
}

function mostraMsg(idEl, testo, ok) {
  const el = document.getElementById(idEl);
  el.textContent = testo;
  el.className = 'stato-msg ' + (ok ? 'ok' : 'errore');
  if (ok) setTimeout(() => { el.textContent = ''; }, 2500);
}

// ----------------------------------------------------------
// Accesso
// ----------------------------------------------------------
async function accediAdmin() {
  const pw = document.getElementById('input-password-gate').value;
  const errore = document.getElementById('errore-gate');
  errore.textContent = '';

  const risposta = await fetch(`${API_AUTH}/admin/postazioni`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pw }),
  });

  if (!risposta.ok) {
    errore.textContent = 'Password errata.';
    return;
  }

  password = pw;
  const postazioni = await risposta.json();

  document.getElementById('box-gate').classList.add('nascosto');
  document.getElementById('area-admin').classList.remove('nascosto');

  // Default comodo per il campo data della nuova serata: oggi.
  document.getElementById('nuova-serata-data').value = new Date().toISOString().split('T')[0];

  renderCodici(postazioni);
  await caricaEdizioni();
  await caricaTavoli(); // popola cacheTavoli prima dei gruppi (serve per le etichette)
  await caricaGruppi();
  await caricaSerate();
  await caricaImpostazioni();
  await caricaImpostazioniNotifiche();
}

document.getElementById('btn-entra-gate').addEventListener('click', accediAdmin);
document.getElementById('input-password-gate').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') accediAdmin();
});

// ----------------------------------------------------------
// Tab
// ----------------------------------------------------------
document.querySelectorAll('.btn-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('attiva'));
    document.querySelectorAll('section.sezione-admin').forEach(s => s.classList.add('nascosto'));
    btn.classList.add('attiva');
    document.getElementById('tab-' + btn.dataset.tab).classList.remove('nascosto');
  });
});

// ----------------------------------------------------------
// EDIZIONI
// ----------------------------------------------------------
async function caricaEdizioni() {
  const risposta = await fetch(`${API_ADMIN}/edizioni?password=${encodeURIComponent(password)}`);
  cacheEdizioni = await risposta.json();
  renderEdizioni();
  renderSelectEdizioneSerata();
}

function renderEdizioni() {
  const corpo = document.getElementById('corpo-edizioni');
  if (cacheEdizioni.length === 0) {
    corpo.innerHTML = '<tr><td colspan="6">Nessuna edizione creata ancora. La sagra funziona comunque: senza edizione, le serate mantengono la vecchia numerazione continua.</td></tr>';
    return;
  }
  corpo.innerHTML = cacheEdizioni.map(e => `
    <tr>
      <td>${e.numero_edizione}</td>
      <td>${escapeHtml(e.etichetta)}</td>
      <td><span class="badge ${e.stato}">${e.stato}</span></td>
      <td>${formattaData(e.creato_il)}</td>
      <td>${formattaData(e.chiusa_il)}</td>
      <td>${e.stato === 'aperta' ? `<button class="btn-azione pericolo" data-chiudi-edizione="${e.id}">Chiudi edizione</button>` : ''}</td>
    </tr>
  `).join('');

  corpo.querySelectorAll('[data-chiudi-edizione]').forEach(btn => {
    btn.addEventListener('click', () => chiudiEdizione(btn.dataset.chiudiEdizione));
  });
}

async function chiudiEdizione(id) {
  if (!confirm('Chiudere questa edizione? Potrai comunque ricrearne una nuova in seguito.')) return;
  const risposta = await fetch(`${API_ADMIN}/edizioni/${id}/chiudi`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const dati = await risposta.json();
  if (!risposta.ok) { alert('Errore: ' + dati.errore); return; }
  await caricaEdizioni();
}

document.getElementById('btn-crea-edizione').addEventListener('click', async () => {
  const numero = document.getElementById('nuova-ed-numero').value;
  const etichetta = document.getElementById('nuova-ed-etichetta').value;
  if (!numero) { mostraMsg('msg-edizioni', 'Inserisci un numero.', false); return; }

  const risposta = await fetch(`${API_ADMIN}/edizioni`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, numero_edizione: Number(numero), etichetta }),
  });
  const dati = await risposta.json();
  if (!risposta.ok) { mostraMsg('msg-edizioni', dati.errore, false); return; }

  document.getElementById('nuova-ed-numero').value = '';
  document.getElementById('nuova-ed-etichetta').value = '';
  mostraMsg('msg-edizioni', `Creata: ${dati.etichetta}`, true);
  await caricaEdizioni();
});

// ----------------------------------------------------------
// SERATE
// ----------------------------------------------------------
let cacheSerate = [];

async function caricaSerate() {
  const risposta = await fetch(`${API_ADMIN}/serate?password=${encodeURIComponent(password)}`);
  cacheSerate = await risposta.json();
  renderSerate();
}

function renderSerate() {
  const corpo = document.getElementById('corpo-serate');
  if (cacheSerate.length === 0) {
    corpo.innerHTML = '<tr><td colspan="6">Nessuna serata ancora creata.</td></tr>';
    return;
  }
  corpo.innerHTML = cacheSerate.map(s => `
    <tr data-riga-serata="${s.id}">
      <td>
        <input type="number" min="1" style="width:60px" value="${s.numero_serata}" data-campo-numero>
      </td>
      <td>${s.etichetta_edizione ? escapeHtml(s.etichetta_edizione) : '<em>nessuna</em>'}</td>
      <td>
        <input type="date" value="${s.data}" data-campo-data>
      </td>
      <td><span class="badge ${s.stato}">${s.stato}</span></td>
      <td>${formattaData(s.chiusa_il)}</td>
      <td>
        <button class="btn-azione secondario" data-salva-serata="${s.id}">Salva N./data</button>
        ${s.stato === 'aperta'
          ? `<button class="btn-azione pericolo" data-chiudi-serata="${s.id}">Chiudi</button>`
          : `<button class="btn-azione secondario" data-riapri-serata="${s.id}">Riapri</button>
             <button class="btn-azione pericolo" data-elimina-serata="${s.id}">Elimina</button>`}
        <span class="stato-msg" id="msg-serata-${s.id}"></span>
      </td>
    </tr>
  `).join('');

  corpo.querySelectorAll('[data-chiudi-serata]').forEach(btn => {
    btn.addEventListener('click', () => chiudiSerata(btn.dataset.chiudiSerata));
  });
  corpo.querySelectorAll('[data-riapri-serata]').forEach(btn => {
    btn.addEventListener('click', () => riapriSerata(btn.dataset.riapriSerata));
  });
  corpo.querySelectorAll('[data-salva-serata]').forEach(btn => {
    btn.addEventListener('click', () => salvaSerata(btn.dataset.salvaSerata));
  });
  corpo.querySelectorAll('[data-elimina-serata]').forEach(btn => {
    btn.addEventListener('click', () => eliminaSerata(btn.dataset.eliminaSerata));
  });
}

async function salvaSerata(id) {
  const riga = document.querySelector(`tr[data-riga-serata="${id}"]`);
  const nuovaData = riga.querySelector('[data-campo-data]').value;
  const nuovoNumero = riga.querySelector('[data-campo-numero]').value;
  const msgId = `msg-serata-${id}`;
  if (!nuovaData) { mostraMsg(msgId, 'Data non valida.', false); return; }
  if (!nuovoNumero || Number(nuovoNumero) < 1) { mostraMsg(msgId, 'Numero serata non valido.', false); return; }

  const risposta = await fetch(`${API_ADMIN}/serate/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, data: nuovaData, numero_serata: nuovoNumero }),
  });
  const dati = await risposta.json();
  if (!risposta.ok) { mostraMsg(msgId, dati.errore, false); return; }
  mostraMsg(msgId, '✓ salvata', true);
  await caricaSerate();
}

async function eliminaSerata(id) {
  const serata = cacheSerate.find(s => String(s.id) === String(id));
  const conferma = confirm(
    `ATTENZIONE — operazione IRREVERSIBILE.\n\n` +
    `Stai per eliminare la serata ${serata ? serata.numero_serata : id} e TUTTE le comande, righe e code collegate.\n\n` +
    `Hai già esportato/salvato il report di questa serata in PDF o Excel dalla pagina Report?\n` +
    `Se non l'hai fatto, annulla ora e fallo prima.\n\n` +
    `Procedere comunque con l'eliminazione definitiva?`
  );
  if (!conferma) return;

  const risposta = await fetch(`${API_ADMIN}/serate/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const dati = await risposta.json();
  if (!risposta.ok) { alert('Errore: ' + dati.errore); return; }
  await caricaSerate();
}

function renderSelectEdizioneSerata() {
  const select = document.getElementById('nuova-serata-edizione');
  select.innerHTML = '<option value="">— nessuna (numerazione libera) —</option>' +
    cacheEdizioni.map(e => `<option value="${e.id}" ${e.stato === 'aperta' ? 'selected' : ''}>${escapeHtml(e.etichetta)} (${e.stato})</option>`).join('');
}

async function chiudiSerata(id) {
  if (!confirm('Chiudere questa serata?')) return;
  const risposta = await fetch(`${API_ADMIN}/serate/${id}/chiudi`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const dati = await risposta.json();
  if (!risposta.ok) { alert('Errore: ' + dati.errore); return; }
  await caricaSerate();
}

async function riapriSerata(id) {
  const risposta = await fetch(`${API_ADMIN}/serate/${id}/riapri`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const dati = await risposta.json();
  if (!risposta.ok) { alert('Errore: ' + dati.errore); return; }
  await caricaSerate();
}

document.getElementById('btn-apri-serata').addEventListener('click', async () => {
  const edizioneId = document.getElementById('nuova-serata-edizione').value || null;
  const data = document.getElementById('nuova-serata-data').value || null;
  const risposta = await fetch(`${API_ADMIN}/serate/apri`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, edizione_id: edizioneId, data }),
  });
  const dati = await risposta.json();
  if (!risposta.ok) { mostraMsg('msg-serate', dati.errore, false); return; }
  mostraMsg('msg-serate', `Serata ${dati.numero_serata} aperta.`, true);
  await caricaSerate();
});

// ----------------------------------------------------------
// TAVOLI E GRUPPI — mappa grafica (stile Caposala: griglia per fila),
// ma con logica di modifica invece di stato live. Click su un tavolo =
// modifica (capienza/attivo/visibile). Shift+click = selezione multipla
// per creare un nuovo gruppo. I tavoli già raggruppati assumono la
// tonalità del loro gruppo. Click sul gruppo (mappa o lista) = modifica/
// elimina.
// ----------------------------------------------------------
let cacheGruppi = [];
let selezionati = new Set();       // id tavoli selezionati con Shift+click (per un NUOVO gruppo)
let mappaGruppoPerTavolo = {};     // { tavolo_id: gruppoObj }
let tavoloModalId = null;          // tavolo attualmente apparso nel modal
let gruppoModalId = null;          // gruppo attualmente apparso nel modal

const PALETTE_GRUPPI = ['#d9e8f5', '#f3d9f0', '#fde2cf', '#f5e6a8', '#d9ecd2', '#e3d9f0'];

function etichettaTavolo(t) {
  return `F${t.fila}-T${t.numero_tavolo}`;
}

function coloreGruppo(gruppoId) {
  const indice = cacheGruppi.findIndex(g => g.id === gruppoId);
  return PALETTE_GRUPPI[indice % PALETTE_GRUPPI.length] || '#eeece5';
}

async function caricaTavoli() {
  const risposta = await fetch(`${API_ADMIN}/tavoli?password=${encodeURIComponent(password)}`);
  cacheTavoli = await risposta.json();
  ricalcolaMappaGruppi();
  disegnaMappaAdmin();
}

async function caricaGruppi() {
  const risposta = await fetch(`${API_ADMIN}/gruppi-tavoli?password=${encodeURIComponent(password)}`);
  cacheGruppi = await risposta.json();
  ricalcolaMappaGruppi();
  disegnaMappaAdmin();
  renderListaGruppi();
}

function ricalcolaMappaGruppi() {
  mappaGruppoPerTavolo = {};
  cacheGruppi.forEach(g => {
    (g.tavoli || []).forEach(t => { mappaGruppoPerTavolo[t.id] = g; });
  });
}

// ---------- Disegno mappa ----------
// Stessa identica disposizione fisica della mappa Caposala: righe = file
// nell'ordine ORDINE_FILE_MAPPA, verso di numerazione per fila secondo
// FILE_ORDINE_CRESCENTE_MAPPA, 7 slot fissi per fila (NUMERI_TAVOLO_ATTESI_MAPPA,
// con riquadro invisibile "tavolo-vuoto" dove manca un numero) ed etichetta
// "Fila N" a entrambi gli estremi — tutte costanti globali già definite in
// mappa-tavoli-render.js (incluso in admin.html), qui SOLO riusate, non
// duplicate né modificate. Il contenuto della tessera e il click, invece,
// sono specifici dell'Admin (modifica, non stato live).
function renderTavoloAdmin(t) {
  const gruppo = mappaGruppoPerTavolo[t.id];
  const classi = [
    'tavolo', 'bianco',
    !t.attivo ? 'non-attivo-admin' : '',
    !t.visibile ? 'non-visibile-admin' : '',
    selezionati.has(t.id) ? 'appena-cliccato' : '',
  ].filter(Boolean).join(' ');
  const stileSfondo = gruppo ? ` style="background:${coloreGruppo(gruppo.id)};"` : '';
  const titolo = gruppo ? `Gruppo: ${escapeHtml(gruppo.nome)}` : '';

  return `
    <div class="${classi}" data-id="${t.id}"${stileSfondo} title="${titolo}">
      <div class="num-tavolo">Tav. ${t.numero_tavolo}</div>
      <div class="coperti" style="font-size:1rem;">${t.capienza}<span style="font-size:0.6rem;"> posti</span></div>
      <div class="comande">${!t.attivo ? 'non attivo' : (!t.visibile ? 'nascosto' : '')}</div>
    </div>`;
}

function renderSegmentoFilaAdmin(fila, perFila, ordineCrescente) {
  const tavoliFila = perFila[fila] || [];
  // Numeri "fuori griglia" (es. numero_tavolo 8+ creato apposta da Admin):
  // mostrati comunque, aggiunti in coda oltre i 7 slot fissi.
  const numeriExtra = tavoliFila
    .map(t => t.numero_tavolo)
    .filter(n => !NUMERI_TAVOLO_ATTESI_MAPPA.includes(n))
    .sort((a, b) => a - b);
  const numeriOrdinati = [...NUMERI_TAVOLO_ATTESI_MAPPA].sort((a, b) => ordineCrescente ? a - b : b - a);
  const tuttiINumeri = [...numeriOrdinati, ...numeriExtra];

  const boxHtml = tuttiINumeri.map(numero => {
    const t = tavoliFila.find(x => x.numero_tavolo === numero);
    return t ? renderTavoloAdmin(t) : '<div class="tavolo tavolo-vuoto" aria-hidden="true"></div>';
  }).join('');
  const etichetta = `<span class="fila-label">Fila ${fila}</span>`;
  return `${etichetta}<div class="tavoli-fila">${boxHtml}</div>${etichetta}`;
}

function disegnaMappaAdmin() {
  const cont = document.getElementById('sala');
  if (!cont) return;

  const perFila = {};
  cacheTavoli.forEach(t => {
    if (!perFila[t.fila]) perFila[t.fila] = [];
    perFila[t.fila].push(t);
  });

  if (cacheTavoli.length === 0) {
    cont.innerHTML = '<p class="nota-piccola">Nessun tavolo ancora creato.</p>';
    return;
  }

  // File extra oltre le 8 previste (create da Admin fuori dalla pianta
  // originale): aggiunte in coda, senza il trattamento a 2 colonne del
  // paesaggio che riguarda solo le file 1-8 (vedi mappa-tavoli.css).
  const fileExtra = Object.keys(perFila)
    .map(Number)
    .filter(f => !ORDINE_FILE_MAPPA.includes(f))
    .sort((a, b) => a - b);
  const tutteLeFile = [...ORDINE_FILE_MAPPA, ...fileExtra];

  cont.innerHTML = tutteLeFile.map(fila => {
    const ordineCrescente = FILE_ORDINE_CRESCENTE_MAPPA.has(fila);
    const segmento = renderSegmentoFilaAdmin(fila, perFila, ordineCrescente);
    const classeSeparatore = fila === 5 ? ' nuovo-gruppo-file' : '';
    return `<div class="fila-riga-singola${classeSeparatore}">${segmento}</div>`;
  }).join('');

  cont.querySelectorAll('.tavolo:not(.tavolo-vuoto)').forEach(el => {
    el.addEventListener('click', (e) => {
      const id = Number(el.dataset.id);
      if (e.shiftKey) {
        toggleSelezione(id);
        return;
      }
      // Click normale su un tavolo già in un gruppo: richiama subito il
      // gruppo da modificare (nessun passaggio intermedio dal modal del
      // singolo tavolo, come richiesto).
      const gruppo = mappaGruppoPerTavolo[id];
      if (gruppo) {
        apriModalGruppo(gruppo.id);
      } else {
        apriModalTavolo(id);
      }
    });
  });
}

// ---------- Selezione multipla (Shift+click) per nuovo gruppo ----------
function toggleSelezione(id) {
  if (selezionati.has(id)) selezionati.delete(id); else selezionati.add(id);
  disegnaMappaAdmin();
  renderBarraSelezione();
}

// Nome automatico del gruppo dedotto da file e tavoli selezionati — non
// va più chiesto a Skappa. Caso comune (un tavolo per fila, stesso numero
// in tutte, es. l'ultimo posto di ogni fila): "Fila 6-7-8 unite". Caso
// singola fila con più tavoli: "Fila 3, tavoli 1-2 uniti". Caso generico:
// elenco per fila. Resta comunque rinominabile dopo dal modal di modifica.
function formattaListaNumeri(numeri) {
  const ordinati = [...numeri].sort((a, b) => a - b);
  let consecutivi = ordinati.length > 1;
  for (let i = 1; i < ordinati.length; i++) {
    if (ordinati[i] !== ordinati[i - 1] + 1) { consecutivi = false; break; }
  }
  if (consecutivi) return `${ordinati[0]}-${ordinati[ordinati.length - 1]}`;
  return ordinati.join(',');
}

function nomeAutomaticoGruppo(idsSelezionati) {
  const tavoli = idsSelezionati.map(id => cacheTavoli.find(t => t.id === id)).filter(Boolean);
  if (tavoli.length === 0) return 'Gruppo';

  const perFila = {};
  tavoli.forEach(t => {
    if (!perFila[t.fila]) perFila[t.fila] = [];
    perFila[t.fila].push(t.numero_tavolo);
  });
  const file = Object.keys(perFila).map(Number).sort((a, b) => a - b);

  const unTavoloPerFila = file.every(f => perFila[f].length === 1);
  const stessoNumeroOvunque = unTavoloPerFila && new Set(file.map(f => perFila[f][0])).size === 1;

  if (file.length > 1 && stessoNumeroOvunque) {
    return `Fila ${file.join('-')} unite`;
  }
  if (file.length === 1) {
    return `Fila ${file[0]}, tavoli ${formattaListaNumeri(perFila[file[0]])} uniti`;
  }
  return file.map(f => `Fila ${f} (tav. ${formattaListaNumeri(perFila[f])})`).join(' + ');
}

function renderBarraSelezione() {
  const barra = document.getElementById('barra-selezione');
  if (selezionati.size === 0) {
    barra.classList.add('nascosto');
    return;
  }
  barra.classList.remove('nascosto');
  document.getElementById('conteggio-selezione').textContent = `${selezionati.size} tavoli selezionati`;
  const anteprima = document.getElementById('anteprima-nome-gruppo');
  anteprima.textContent = selezionati.size >= 2
    ? `→ "${nomeAutomaticoGruppo(Array.from(selezionati))}"`
    : '(seleziona almeno 2 tavoli)';
}

document.getElementById('btn-annulla-selezione').addEventListener('click', () => {
  selezionati.clear();
  disegnaMappaAdmin();
  renderBarraSelezione();
});

document.getElementById('btn-crea-gruppo-barra').addEventListener('click', async () => {
  if (selezionati.size < 2) { alert('Seleziona almeno 2 tavoli (Shift+click).'); return; }
  const idsSelezionati = Array.from(selezionati);
  const nome = nomeAutomaticoGruppo(idsSelezionati);

  const risposta = await fetch(`${API_ADMIN}/gruppi-tavoli`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, nome, tavolo_ids: idsSelezionati }),
  });
  const dati = await risposta.json();
  if (!risposta.ok) { alert('Errore: ' + dati.errore); return; }

  selezionati.clear();
  renderBarraSelezione();
  await caricaGruppi();
});

// ---------- Lista testuale dei gruppi (sotto la mappa) ----------
function renderListaGruppi() {
  const cont = document.getElementById('lista-gruppi');
  if (cacheGruppi.length === 0) {
    cont.innerHTML = '<p class="nota-piccola">Nessun gruppo ancora creato. Seleziona più tavoli sulla mappa con Shift+click per crearne uno.</p>';
    return;
  }
  cont.innerHTML = cacheGruppi.map(g => `
    <div class="riga-gruppo-lista" style="background:${coloreGruppo(g.id)}; cursor:pointer;" data-apri-gruppo="${g.id}">
      <div>
        <strong>${escapeHtml(g.nome)}</strong> — capienza totale ${g.capienza_totale}<br>
        <span class="nota-piccola" style="margin:0;">${g.tavoli.map(etichettaTavolo).join(', ')}</span>
      </div>
      <div>✏️</div>
    </div>
  `).join('');

  cont.querySelectorAll('[data-apri-gruppo]').forEach(el => {
    el.addEventListener('click', () => apriModalGruppo(Number(el.dataset.apriGruppo)));
  });
}

// ---------- Modal: modifica singolo tavolo ----------
// Chiamata solo per tavoli SENZA gruppo: un tavolo già raggruppato apre
// invece direttamente il modal del gruppo (vedi click handler sopra).
function apriModalTavolo(id) {
  const t = cacheTavoli.find(x => x.id === id);
  if (!t) return;
  tavoloModalId = id;

  document.getElementById('titolo-modal-tavolo').textContent = `Tavolo ${etichettaTavolo(t)}`;
  document.getElementById('modal-tav-capienza').value = t.capienza;
  document.getElementById('modal-tav-attivo').checked = !!t.attivo;
  document.getElementById('modal-tav-visibile').checked = !!t.visibile;
  document.getElementById('msg-modal-tavolo').textContent = '';

  document.getElementById('modal-tavolo').classList.remove('nascosto');
}

function chiudiModalTavolo() {
  document.getElementById('modal-tavolo').classList.add('nascosto');
  tavoloModalId = null;
}

document.getElementById('btn-chiudi-modal-tavolo').addEventListener('click', chiudiModalTavolo);

document.getElementById('btn-salva-modal-tavolo').addEventListener('click', async () => {
  if (tavoloModalId == null) return;
  const corpo = {
    password,
    capienza: Number(document.getElementById('modal-tav-capienza').value),
    attivo: document.getElementById('modal-tav-attivo').checked,
    visibile: document.getElementById('modal-tav-visibile').checked,
  };

  const risposta = await fetch(`${API_ADMIN}/tavoli/${tavoloModalId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const dati = await risposta.json();
  if (!risposta.ok) { mostraMsg('msg-modal-tavolo', dati.errore, false); return; }

  mostraMsg('msg-modal-tavolo', '✓ salvato', true);
  await caricaTavoli();
  await caricaGruppi(); // la capienza può cambiare il totale di un eventuale gruppo
  setTimeout(chiudiModalTavolo, 600);
});

// ---------- Modal: modifica/eliminazione gruppo ----------
function apriModalGruppo(id) {
  const g = cacheGruppi.find(x => x.id === id);
  if (!g) return;
  gruppoModalId = id;

  document.getElementById('modal-gruppo-nome').value = g.nome;
  document.getElementById('msg-modal-gruppo').textContent = '';

  const membriIds = new Set(g.tavoli.map(t => t.id));
  const checklist = document.getElementById('modal-gruppo-checklist');
  const tavoliAttivi = cacheTavoli.filter(t => t.attivo);
  checklist.innerHTML = tavoliAttivi.map(t => `
    <label><input type="checkbox" value="${t.id}" ${membriIds.has(t.id) ? 'checked' : ''}> ${etichettaTavolo(t)}</label>
  `).join('');

  document.getElementById('modal-gruppo').classList.remove('nascosto');
}

function chiudiModalGruppo() {
  document.getElementById('modal-gruppo').classList.add('nascosto');
  gruppoModalId = null;
}

document.getElementById('btn-chiudi-modal-gruppo').addEventListener('click', chiudiModalGruppo);

document.getElementById('btn-salva-modal-gruppo').addEventListener('click', async () => {
  if (gruppoModalId == null) return;
  const nome = document.getElementById('modal-gruppo-nome').value.trim();
  const idsSelezionati = Array.from(
    document.querySelectorAll('#modal-gruppo-checklist input:checked')
  ).map(c => Number(c.value));

  if (!nome) { mostraMsg('msg-modal-gruppo', 'Inserisci un nome.', false); return; }
  if (idsSelezionati.length < 2) { mostraMsg('msg-modal-gruppo', 'Seleziona almeno 2 tavoli.', false); return; }

  const risposta = await fetch(`${API_ADMIN}/gruppi-tavoli/${gruppoModalId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, nome, tavolo_ids: idsSelezionati }),
  });
  const dati = await risposta.json();
  if (!risposta.ok) { mostraMsg('msg-modal-gruppo', dati.errore, false); return; }

  mostraMsg('msg-modal-gruppo', '✓ salvato', true);
  await caricaGruppi();
  setTimeout(chiudiModalGruppo, 600);
});

document.getElementById('btn-elimina-modal-gruppo').addEventListener('click', async () => {
  if (gruppoModalId == null) return;
  if (!confirm('Eliminare questo gruppo? I tavoli non vengono toccati, solo l\'unione.')) return;

  const risposta = await fetch(`${API_ADMIN}/gruppi-tavoli/${gruppoModalId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const dati = await risposta.json();
  if (!risposta.ok) { mostraMsg('msg-modal-gruppo', dati.errore, false); return; }

  await caricaGruppi();
  chiudiModalGruppo();
});

// ---------- Nuovo tavolo ----------
document.getElementById('btn-crea-tavolo').addEventListener('click', async () => {
  const fila = document.getElementById('nuovo-tav-fila').value;
  const numero = document.getElementById('nuovo-tav-numero').value;
  const capienza = document.getElementById('nuovo-tav-capienza').value;
  if (!fila || !numero || !capienza) { mostraMsg('msg-tavoli', 'Compila fila, numero e capienza.', false); return; }

  const risposta = await fetch(`${API_ADMIN}/tavoli`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, fila: Number(fila), numero_tavolo: Number(numero), capienza: Number(capienza) }),
  });
  const dati = await risposta.json();
  if (!risposta.ok) { mostraMsg('msg-tavoli', dati.errore, false); return; }

  document.getElementById('nuovo-tav-fila').value = '';
  document.getElementById('nuovo-tav-numero').value = '';
  document.getElementById('nuovo-tav-capienza').value = '10';
  mostraMsg('msg-tavoli', '✓ tavolo creato', true);
  await caricaTavoli();
});

// ----------------------------------------------------------
// CODICI ACCESSO (riusa /api/auth/admin/postazioni, già esistente)
// ----------------------------------------------------------
function renderCodici(postazioni) {
  const corpo = document.getElementById('corpo-codici');
  corpo.innerHTML = postazioni.map(p => `
    <tr>
      <td>${escapeHtml(p.nome_istanza)}</td>
      <td><input class="codice" type="text" value="${escapeHtml(p.codice)}" data-id="${p.id}"></td>
      <td><button class="btn-azione" data-salva-codice="${p.id}">Salva</button> <span class="stato-msg" id="msg-codice-${p.id}"></span></td>
    </tr>
  `).join('');

  corpo.querySelectorAll('[data-salva-codice]').forEach(btn => {
    btn.addEventListener('click', () => salvaCodice(btn.dataset.salvaCodice));
  });
}

async function salvaCodice(id) {
  const input = document.querySelector(`input.codice[data-id="${id}"]`);
  const codice = input.value.trim();

  // Campo vuoto: nessuna richiesta, nessuna azione (non forzare Skappa a
  // compilarlo se non vuole cambiarlo ora).
  if (!codice) return;

  const risposta = await fetch(`${API_AUTH}/admin/postazioni/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, codice }),
  });

  const msgId = `msg-codice-${id}`;
  if (risposta.ok) {
    mostraMsg(msgId, '✓ salvato', true);
  } else {
    mostraMsg(msgId, '✗ errore', false);
  }
}

// ----------------------------------------------------------
// IMPOSTAZIONI (20/7/2026) — per ora solo "minuti_comande_recenti":
// finestra di tempo, in minuti, oltre la quale una comanda non presa in
// carico sparisce dalle tendine "Comanda extra"/"Comanda cartacea". 0 =
// nessun limite (comodo in fase di sviluppo/test per non perdere di vista
// le comande "in piedi" più vecchie).
// ----------------------------------------------------------
async function caricaImpostazioni() {
  const risposta = await fetch('/api/impostazioni/minuti-comande-recenti');
  const dati = await risposta.json();
  document.getElementById('input-minuti-comande-recenti').value = dati.minuti;
}

document.getElementById('btn-salva-minuti-comande-recenti').addEventListener('click', async () => {
  const input = document.getElementById('input-minuti-comande-recenti');
  const testo = input.value.trim();
  // Campo vuoto = stessa cosa di "0" (illimitato): capita facilmente se si
  // seleziona tutto e si cancella invece di scrivere la cifra 0 a mano.
  const minuti = testo === '' ? 0 : parseInt(testo, 10);
  if (!Number.isFinite(minuti) || minuti < 0) {
    mostraMsg('msg-impostazioni', '✗ inserisci un numero intero >= 0 (0 = illimitato)', false);
    return;
  }
  const risposta = await fetch(`${API_ADMIN}/impostazioni/minuti-comande-recenti`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, minuti }),
  });
  if (risposta.ok) {
    input.value = minuti; // riallinea il campo al valore davvero salvato
    mostraMsg('msg-impostazioni', '✓ salvato', true);
  } else {
    const dati = await risposta.json().catch(() => ({}));
    mostraMsg('msg-impostazioni', '✗ ' + (dati.errore || 'errore'), false);
  }
});

// ----------------------------------------------------------
// NOTIFICHE PUSH E RETE (dominio DuckDNS + topic ntfy + prova)
// Vedi routes/push.js. Caricate insieme alle altre impostazioni.
// ----------------------------------------------------------
async function caricaImpostazioniNotifiche() {
  const risposta = await fetch(`/api/push/stato?password=${encodeURIComponent(password)}`);
  if (!risposta.ok) return;
  const dati = await risposta.json();
  document.getElementById('input-dominio-pubblico').value = dati.dominio_pubblico || '';
  document.getElementById('input-ntfy-topic').value = dati.ntfy_topic || '';
  document.getElementById('input-origine-esterna').value = dati.origine_app_esterna || '';
  const totale = dati.iscritti.reduce((somma, r) => somma + r.n, 0);
  const dettaglio = dati.iscritti.map(r => `${r.ruolo}: ${r.n}`).join(', ');
  document.getElementById('stato-push-riga').textContent =
    totale > 0 ? `Iscritti push: ${totale} (${dettaglio})` : 'Iscritti push: nessuno (i telefoni si iscrivono col pulsante 🔔 nelle pagine Camerieri e Supporto Camerieri, solo via HTTPS).';
}

document.getElementById('btn-salva-notifiche').addEventListener('click', async () => {
  const risposta = await fetch('/api/admin/impostazioni/notifiche', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      password,
      dominio_pubblico: document.getElementById('input-dominio-pubblico').value,
      ntfy_topic: document.getElementById('input-ntfy-topic').value,
      origine_app_esterna: document.getElementById('input-origine-esterna').value,
    }),
  });
  const dati = await risposta.json().catch(() => ({}));
  if (!risposta.ok) { mostraMsg('msg-notifiche', '✗ ' + (dati.errore || 'errore'), false); return; }
  document.getElementById('input-dominio-pubblico').value = dati.dominio_pubblico;
  document.getElementById('input-origine-esterna').value = dati.origine_app_esterna || '';
  mostraMsg('msg-notifiche', '✓ salvato', true);
});

document.getElementById('btn-prova-push').addEventListener('click', async () => {
  const risposta = await fetch('/api/push/prova', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const dati = await risposta.json().catch(() => ({}));
  if (!risposta.ok) { mostraMsg('msg-notifiche', '✗ ' + (dati.errore || 'errore'), false); return; }
  mostraMsg('msg-notifiche', `✓ prova inviata a ${dati.iscritti} iscritti (+ ntfy se configurato)`, true);
});
