let menuData = [];
let categoriaAttiva = null;
let quantita = {};
let noteComanda = '';
let serataAttiva = null;

// comandaAttiva: null finché non esiste ancora un record nel database.
// creataInQuestaSessione: true se il record è stato aperto (in silenzio o no)
// durante l'inserimento corrente, quindi va eliminato se l'ordine viene
// annullato o svuotato; false se invece è una comanda storica caricata dal
// navigatore per essere modificata (in quel caso l'annullamento non elimina
// nulla, semplicemente non si applicano le modifiche).
let comandaAttiva = null;
let creataInQuestaSessione = false;
let creazioneInCorso = false;
let nomeSagraCorrente = 'Sagra degli Strozzapreti'; // aggiornata in init() da marchio-sagra.js

// ---------- Disponibilità/esaurimento pietanze (20/7/2026) ----------
// disponibilitaVoci: mappa voce_menu_id -> { quantita_residua, flag_esaurito_manuale, ... }
// Popolata dal pannello "Piatto in Esaurimento" di Supporto Camerieri/Cucina/
// Griglieria (quantita_residua) e dalla Cassa stessa (flag_esaurito_manuale,
// checkbox sulla riga). Vedi routes/disponibilita.js per la logica server.
let disponibilitaVoci = {};
const SOGLIA_DISPONIBILITA_BASSA = 5; // sotto (o pari a) questa soglia compare il badge in cassa
const INTERVALLO_POLLING_DISPONIBILITA_MS = 8000; // per vedere gli aggiornamenti di altre postazioni/reparti

async function init() {
  impostaEtichettaPostazione();
  nomeSagraCorrente = await window.nomeSagra();
  await caricaSerata();
  await caricaMenu();
  impostaCopertoDiDefault();
  vaiACategoriaCoperti();
  await caricaDisponibilita();
  renderVoci();
  renderRiepilogo();
  if (serataAttiva) await caricaListaComande();
  setInterval(caricaDisponibilita, INTERVALLO_POLLING_DISPONIBILITA_MS);
}

// Interroga lo stato disponibilità dell'intera serata e aggiorna i badge/
// checkbox già a schermo SENZA ricostruire le righe (evita di perdere il
// focus/cursore se il cassiere sta scrivendo in un campo quantità proprio
// mentre arriva il polling).
async function caricaDisponibilita() {
  if (!serataAttiva) return;
  try {
    const res = await fetch(`/api/disponibilita?serata_id=${serataAttiva.id}`);
    const righe = await res.json();
    disponibilitaVoci = {};
    righe.forEach(r => { disponibilitaVoci[r.voce_menu_id] = r; });
    aggiornaBadgeDisponibilita();
  } catch (err) {
    console.error('Errore caricamento disponibilità:', err);
  }
}

// Applica lo stato corrente (badge arancione/rosso, checkbox, riga ingrigita)
// a ogni riga-voce già disegnata a schermo, leggendo dalla cache locale
// disponibilitaVoci. Va richiamata sia dopo il polling sia subito dopo ogni
// renderVoci() (cambio categoria/filtro), per non mostrare badge "vecchi".
function aggiornaBadgeDisponibilita() {
  document.querySelectorAll('.riga-voce[data-riga-voce-id]').forEach(riga => {
    const id = riga.dataset.rigaVoceId;
    const stato = disponibilitaVoci[id];
    const badge = riga.querySelector('[data-badge-voce]');
    const checkbox = riga.querySelector('[data-esaurito-voce]');
    const btnPiu = riga.querySelector('[data-incrementa]');
    const inputQta = riga.querySelector('.input-quantita');

    const inEsaurimento = stato && stato.quantita_residua != null && stato.quantita_residua <= SOGLIA_DISPONIBILITA_BASSA;
    if (badge) {
      if (inEsaurimento) {
        badge.style.display = 'inline-block';
        badge.textContent = stato.quantita_residua > 0 ? stato.quantita_residua : 'Esaurito';
        badge.classList.toggle('esaurito', stato.quantita_residua <= 0);
      } else {
        badge.style.display = 'none';
      }
    }

    const flagManuale = !!(stato && stato.flag_esaurito_manuale);
    if (checkbox) checkbox.checked = flagManuale;
    riga.classList.toggle('riga-esaurita', flagManuale);
    if (btnPiu) btnPiu.disabled = flagManuale;
    if (inputQta) inputQta.readOnly = flagManuale;
  });
}

// Notifica al server la variazione di quantità ordinata per una voce
// tracciata (chiamata a ogni tocco dello stepper / modifica del campo
// quantità): +1 quando si aggiunge un'unità all'ordine (la disponibilità
// scala di 1), -1 quando la si toglie (la disponibilità torna su di 1). Se
// la voce non è tracciata stasera, il server non fa nulla (vedi
// routes/disponibilita.js). Aggiornamento ottimistico della cache locale
// per un feedback immediato, senza aspettare il prossimo polling.
function inviaVariazioneDisponibilita(voceId, variazione) {
  if (!serataAttiva || !variazione) return;
  const stato = disponibilitaVoci[voceId];
  if (stato && stato.quantita_residua != null) {
    stato.quantita_residua = Math.max(0, stato.quantita_residua - variazione);
    aggiornaBadgeDisponibilita();
  }
  fetch(`/api/disponibilita/${voceId}/scala`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serata_id: serataAttiva.id, variazione })
  }).catch(err => console.error('Errore invio variazione disponibilità:', err));
}

// Porta la vista sulla categoria "coperti" e la marca come attiva. Usata
// all'avvio e a ogni nuovo ordine (vedi iniziaNuovoOrdine) per evitare che
// il cassiere dimentichi di impostare i coperti: aprendo di default proprio
// quella categoria il primo tocco utile è già lì, senza dover cercarla.
function vaiACategoriaCoperti() {
  const catCoperti = trovaCategoriaCoperti();
  if (catCoperti) {
    categoriaAttiva = catCoperti.id;
    renderCategorie();
  }
}

// ---------- Etichetta postazione (Cassa 1 / Cassa 2 / Cassa 3 Volante) ----------
// Risolto (luglio 2026): auth-check.js (incluso ora in cassa.html) espone
// window.identitaSagra con il nome dell'istanza scelta al login (es. "Cassa 1",
// "Cassa 2", eventuale "Cassa 3 Volante" se aggiunta dall'admin), letto dalla
// tabella "postazioni". Non serve più alcuna mappa ipotetica di codici.
function impostaEtichettaPostazione() {
  const nomeIstanza = window.identitaSagra ? window.identitaSagra.nome_istanza : '';
  document.getElementById('etichetta-postazione').textContent = nomeIstanza || 'Cassa';
}

// "Esci" pulisce TUTTO il localStorage di questo browser (non solo una
// chiave ipotizzata), perché il modulo Autenticazione ha un meccanismo di
// riaggancio automatico che altrimenti riconoscerebbe ancora l'utente e lo
// rimanderebbe dritto alla pagina del ruolo precedente invece che al login.
document.getElementById('link-esci').addEventListener('click', (e) => {
  e.preventDefault();
  localStorage.clear();
  window.location.href = 'login.html';
});

// Il pulsante "Apri serata" (incremento alla cieca, nessuna possibilità di
// chiudere) è stato rimosso il 19/7/2026: apertura/chiusura serata è ora
// gestita solo dal Pannello Admin, che conosce anche l'edizione corrente.
async function caricaSerata() {
  const res = await fetch('/api/serata-attiva');
  serataAttiva = await res.json();
  const info = document.getElementById('serata-info');
  if (serataAttiva) {
    info.textContent = `Serata ${serataAttiva.numero_serata} — ${serataAttiva.data}`;
  } else {
    info.textContent = 'Nessuna serata aperta. Chiedi all\'Admin di aprirne una dal Pannello Admin.';
  }
}

async function caricaMenu() {
  const res = await fetch('/api/menu');
  menuData = await res.json();
  renderCategorie();
  if (menuData.length > 0) {
    categoriaAttiva = menuData[0].id;
  }
}

function renderCategorie() {
  const cont = document.getElementById('categorie');
  cont.innerHTML = '';
  menuData.forEach(cat => {
    const btn = document.createElement('button');
    btn.textContent = cat.nome;
    btn.className = 'btn-categoria' + (cat.id === categoriaAttiva ? ' attiva' : '');
    btn.onclick = () => {
      categoriaAttiva = cat.id;
      document.getElementById('filtro').value = '';
      renderCategorie();
      renderVoci();
    };
    cont.appendChild(btn);
  });
}

// Trova la categoria "coperti" (il conteggio commensali, non una vera pietanza)
function trovaCategoriaCoperti() {
  return menuData.find(c => c.nome.trim().toLowerCase() === 'coperti');
}

// I coperti partono sempre da 0 (richiesta esplicita): il cassiere li imposta
// lui stesso con lo stepper quando servono. Funzione lasciata come punto
// d'aggancio nel codice, ma non esegue più alcuna azione.
function impostaCopertoDiDefault() {
  // nessuna azione: i coperti restano a 0 finché non li si imposta manualmente
}

// Un ordine "vuoto" o con soli coperti non va mai salvato: questa funzione
// dice se tra le righe c'è almeno una pietanza reale (di qualunque categoria
// diversa da "coperti").
function haPietanzeOltreICoperti(righe) {
  const catCoperti = trovaCategoriaCoperti();
  if (!catCoperti) return righe.length > 0;
  return righe.some(r => !catCoperti.voci.some(v => v.id == r.voce_menu_id));
}

// Layout unico per ogni riga (coperti comprese): [-] [quantità] [+]  Nome ... Prezzo
function renderVoci(filtroTesto) {
  const cont = document.getElementById('voci-lista');
  cont.innerHTML = '';
  let voci = [];

  if (filtroTesto) {
    menuData.forEach(cat => voci.push(...cat.voci.filter(v => v.nome.toLowerCase().includes(filtroTesto.toLowerCase()))));
  } else {
    const categoriaCorrente = menuData.find(c => c.id === categoriaAttiva);
    voci = categoriaCorrente ? categoriaCorrente.voci : [];
  }

  voci.forEach(v => {
    const riga = document.createElement('div');
    riga.className = 'riga-voce';
    riga.dataset.rigaVoceId = v.id;
    riga.innerHTML = `
      <div class="stepper">
        <button type="button" data-decrementa="${v.id}">−</button>
        <input type="number" min="0" step="1" class="input-quantita" data-id="${v.id}" value="${quantita[v.id] || ''}" placeholder="0">
        <button type="button" data-incrementa="${v.id}">+</button>
      </div>
      <span class="nome-voce">${v.nome}</span>
      <span class="prezzo-voce">€ ${v.prezzo.toFixed(2)}</span>
      <span class="badge-disponibilita" data-badge-voce="${v.id}" style="display:none;"></span>
      <label class="flag-esaurito-manuale" title="Segna questa pietanza come esaurita per stasera">
        <input type="checkbox" data-esaurito-voce="${v.id}"> Esaurito
      </label>
    `;
    cont.appendChild(riga);
  });

  cont.querySelectorAll('.input-quantita').forEach(input => {
    // Seleziona subito la cifra presente al tocco/click, così scrivere il
    // nuovo numero la sovrascrive invece di doverla cancellare a mano.
    input.addEventListener('focus', (e) => e.target.select());
    input.addEventListener('input', (e) => {
      const id = e.target.dataset.id;
      const precedente = quantita[id] || 0;
      const val = parseInt(e.target.value) || 0;
      if (val > 0) quantita[id] = val; else delete quantita[id];
      inviaVariazioneDisponibilita(id, val - precedente);
      renderRiepilogo();
      gestisciSalvataggioSilenzioso();
    });
  });

  cont.querySelectorAll('[data-incrementa]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.incrementa;
      quantita[id] = (quantita[id] || 0) + 1;
      inviaVariazioneDisponibilita(id, 1);
      renderVoci(filtroTesto);
      renderRiepilogo();
      gestisciSalvataggioSilenzioso();
    });
  });
  cont.querySelectorAll('[data-decrementa]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.decrementa;
      const attuale = (quantita[id] || 0) - 1;
      if (attuale > 0) quantita[id] = attuale; else delete quantita[id];
      inviaVariazioneDisponibilita(id, -1);
      renderVoci(filtroTesto);
      renderRiepilogo();
      gestisciSalvataggioSilenzioso();
    });
  });

  cont.querySelectorAll('[data-esaurito-voce]').forEach(chk => {
    chk.addEventListener('change', async (e) => {
      const id = e.target.dataset.esauritoVoce;
      const valore = e.target.checked;
      if (!disponibilitaVoci[id]) disponibilitaVoci[id] = { quantita_residua: null, flag_esaurito_manuale: false };
      disponibilitaVoci[id].flag_esaurito_manuale = valore;
      aggiornaBadgeDisponibilita();
      if (!serataAttiva) return;
      try {
        await fetch(`/api/disponibilita/${id}/flag-esaurito`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serata_id: serataAttiva.id,
            valore,
            aggiornato_da: window.identitaSagra ? window.identitaSagra.nome_istanza : 'Cassa'
          })
        });
      } catch (err) {
        console.error('Errore invio flag esaurito:', err);
      }
    });
  });

  // Applica subito lo stato disponibilità già noto (cambio categoria/filtro:
  // niente da aspettare, i dati sono già in cache dall'ultimo polling).
  aggiornaBadgeDisponibilita();
}

document.getElementById('filtro').addEventListener('input', (e) => renderVoci(e.target.value));

function trovaVoce(id) {
  for (const cat of menuData) {
    const v = cat.voci.find(x => x.id == id);
    if (v) return v;
  }
  return null;
}

function renderRiepilogo() {
  const cont = document.getElementById('riepilogo-righe');
  cont.innerHTML = '';
  let totale = 0;

  const righe = Object.entries(quantita).map(([id, q]) => ({ voce_menu_id: parseInt(id), quantita: q }));
  const gruppi = raggruppaRighePerCategoria(righe);

  gruppi.forEach((g, idxGruppo) => {
    g.righe.forEach((r, i) => {
      const v = trovaVoce(r.voce_menu_id);
      const subtotale = v.prezzo * r.quantita;
      totale += subtotale;
      const riga = document.createElement('div');
      const finePariGruppo = (i === g.righe.length - 1) && idxGruppo < gruppi.length - 1;
      riga.className = 'riga-riepilogo' + (finePariGruppo ? ' fine-categoria-riepilogo' : '');
      riga.innerHTML = `<span class="riepilogo-quantita">${r.quantita}</span> x ${escapeHtml(v.nome)} — <span class="riepilogo-prezzo">€ ${subtotale.toFixed(2)}</span>`;
      cont.appendChild(riga);
    });
  });

  document.getElementById('totale').textContent = totale.toFixed(2);
}

// ---------- Campo note ----------

document.getElementById('note').addEventListener('input', (e) => {
  noteComanda = e.target.value;
});

// ---------- Assegnazione silenziosa del codice comanda ----------
// Non appena viene inserita la prima pietanza vera (coperti esclusi), la
// comanda viene creata subito nel database (senza stampare), così il codice
// compare in header da subito. Se poi si torna a zero pietanze vere e la
// comanda non era stata caricata dal navigatore ma creata proprio ora, la
// bozza viene eliminata in automatico per non lasciare comande vuote in giro.
async function gestisciSalvataggioSilenzioso() {
  if (!serataAttiva || creazioneInCorso) return;

  const righeAttuali = Object.entries(quantita).map(([id, q]) => ({ voce_menu_id: parseInt(id), quantita: q }));
  const cePietanzeVere = haPietanzeOltreICoperti(righeAttuali);

  if (!comandaAttiva && cePietanzeVere) {
    creazioneInCorso = true;
    try {
      const righeComplete = righeAttuali.map(r => ({ ...r, prezzo_unitario: trovaVoce(r.voce_menu_id).prezzo }));
      const res = await fetch('/api/comande', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serata_id: serataAttiva.id, righe: righeComplete, origine: 'cassa', note: noteComanda })
      });
      const dati = await res.json();
      if (!dati.errore) {
        comandaAttiva = { id: dati.comanda_id, numero_comanda: dati.numero_comanda };
        creataInQuestaSessione = true;
        document.getElementById('etichetta-comanda-header').textContent = `Comanda ${dati.numero_comanda}`;
        aggiornaControlliModifica();
      }
    } finally {
      creazioneInCorso = false;
    }
  } else if (comandaAttiva && creataInQuestaSessione && !cePietanzeVere) {
    await fetch(`/api/comande/${comandaAttiva.id}`, { method: 'DELETE' });
    comandaAttiva = null;
    creataInQuestaSessione = false;
    document.getElementById('etichetta-comanda-header').textContent = 'Nessuna comanda aperta';
    aggiornaControlliModifica();
  }
}

// ---------- Navigatore comande precedenti ----------

async function caricaListaComande() {
  if (!serataAttiva) return;
  const res = await fetch(`/api/comande?serata_id=${serataAttiva.id}`);
  const comande = await res.json();
  const select = document.getElementById('lista-comande');
  select.innerHTML = '<option value="">-- seleziona per modificare/ristampare --</option>';
  comande.forEach(c => {
    const giaSeduto = c.tavolo_id != null || c.gruppo_tavoli_id != null;
    const opt = document.createElement('option');
    opt.value = c.id;
    // Solo l'ora, non la data: le comande elencate sono tutte della serata
    // in corso, quindi la data e' sempre la stessa e ruberebbe spazio utile.
    // I coperti sono il dato che permette di riconoscere una comanda a colpo
    // d'occhio quando il cliente torna alla cassa; lo stato dice a che punto
    // e' il servizio (calcolato dal server, vedi routes/comande.js).
    const ora = (c.timestamp_creazione || '').split(' ')[1] || '';
    const coperti = c.coperti || 0;
    const stato = c.stato_servizio ? ` — ${c.stato_servizio.toUpperCase()}` : '';
    opt.textContent = `${c.numero_comanda} — ${coperti} cop. — ${ora.slice(0, 5)} — € ${c.totale.toFixed(2)}${stato}` +
      (giaSeduto ? ' (modifica riservata al Caposala)' : '');
    opt.disabled = giaSeduto;
    select.appendChild(opt);
  });
}

document.getElementById('lista-comande').addEventListener('change', async (e) => {
  const id = e.target.value;
  if (!id) return;
  const res = await fetch(`/api/comande/${id}`);
  const comanda = await res.json();

  if (comanda.tavolo_id != null || comanda.gruppo_tavoli_id != null) {
    alert('Questa comanda è già assegnata a un tavolo: la modifica spetta al Caposala.');
    e.target.value = '';
    return;
  }

  quantita = {};
  comanda.righe.forEach(r => { quantita[r.voce_menu_id] = r.quantita; });

  noteComanda = comanda.note || '';
  document.getElementById('note').value = noteComanda;

  comandaAttiva = { id: comanda.id, numero_comanda: comanda.numero_comanda };
  creataInQuestaSessione = false;
  document.getElementById('etichetta-comanda-header').textContent = `Comanda ${comanda.numero_comanda}`;
  aggiornaControlliModifica();

  renderVoci(document.getElementById('filtro').value);
  renderRiepilogo();
});

document.getElementById('btn-annulla-modifica').addEventListener('click', async () => {
  if (comandaAttiva && creataInQuestaSessione) {
    if (!confirm('Annullare questa comanda appena iniziata? Verrà eliminata.')) return;
    await fetch(`/api/comande/${comandaAttiva.id}`, { method: 'DELETE' });
    await caricaListaComande();
  }
  iniziaNuovoOrdine();
});

document.getElementById('btn-elimina-comanda').addEventListener('click', async () => {
  if (!comandaAttiva) return;
  if (!confirm(`Eliminare definitivamente la comanda ${comandaAttiva.numero_comanda}? L'operazione non si può annullare.`)) return;

  const res = await fetch(`/api/comande/${comandaAttiva.id}`, { method: 'DELETE' });
  const dati = await res.json();
  if (dati.errore) { alert('Errore: ' + dati.errore); return; }

  iniziaNuovoOrdine();
  await caricaListaComande();
});

function iniziaNuovoOrdine() {
  comandaAttiva = null;
  creataInQuestaSessione = false;
  quantita = {};
  noteComanda = '';
  document.getElementById('note').value = '';
  document.getElementById('lista-comande').value = '';
  document.getElementById('etichetta-comanda-header').textContent = 'Nessuna comanda aperta';
  document.getElementById('filtro').value = '';
  impostaCopertoDiDefault();
  vaiACategoriaCoperti();
  aggiornaControlliModifica();
  renderVoci();
  renderRiepilogo();
}

function aggiornaControlliModifica() {
  const btnAnnulla = document.getElementById('btn-annulla-modifica');
  const btnElimina = document.getElementById('btn-elimina-comanda');
  const btnConferma = document.getElementById('btn-conferma');
  if (comandaAttiva) {
    btnAnnulla.style.display = 'inline-block';
    btnAnnulla.textContent = creataInQuestaSessione ? 'Annulla (elimina bozza)' : 'Annulla modifica';
    btnElimina.style.display = 'inline-block';
    btnConferma.textContent = creataInQuestaSessione ? 'Salva e Stampa' : 'Salva modifiche e Ristampa';
  } else {
    btnAnnulla.style.display = 'none';
    btnElimina.style.display = 'none';
    btnConferma.textContent = 'Salva e Stampa';
  }
}

// ---------- Salva e Stampa (pulsante spostato in cima al riepilogo, 20/7/2026 — prima "Anteprima" era qui accanto, rimossa) ----------

async function salvaEStampa() {
  if (!serataAttiva) { alert('Devi prima aprire una serata.'); return; }
  const righe = Object.entries(quantita).map(([id, q]) => {
    const v = trovaVoce(id);
    return { voce_menu_id: parseInt(id), quantita: q, prezzo_unitario: v.prezzo };
  });

  if (!haPietanzeOltreICoperti(righe)) {
    alert('Aggiungi almeno una pietanza oltre ai coperti prima di salvare.');
    return;
  }

  let numeroComanda;

  if (comandaAttiva) {
    const res = await fetch(`/api/comande/${comandaAttiva.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ righe, note: noteComanda })
    });
    const dati = await res.json();
    if (dati.errore) { alert('Errore: ' + dati.errore); return; }
    numeroComanda = dati.numero_comanda;
  } else {
    const res = await fetch('/api/comande', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serata_id: serataAttiva.id, righe, origine: 'cassa', note: noteComanda })
    });
    const dati = await res.json();
    if (dati.errore) { alert('Errore: ' + dati.errore); return; }
    numeroComanda = dati.numero_comanda;
  }

  stampaComanda(numeroComanda, righe, noteComanda);

  iniziaNuovoOrdine();
  await caricaListaComande();
}

document.getElementById('btn-conferma').addEventListener('click', salvaEStampa);

// ---------- Nuova comanda (pulsante in header): salva SENZA stampare ----------
// Utile anche in futuro al Caposala per le comande generate in sala che non
// devono passare dalla stampante di cassa.

async function salvaSenzaStampare() {
  if (!serataAttiva) { alert('Devi prima aprire una serata.'); return; }
  const righe = Object.entries(quantita).map(([id, q]) => {
    const v = trovaVoce(id);
    return { voce_menu_id: parseInt(id), quantita: q, prezzo_unitario: v.prezzo };
  });

  if (!haPietanzeOltreICoperti(righe)) {
    // niente da salvare: se esiste già una bozza appena creata, la ripuliamo
    if (comandaAttiva && creataInQuestaSessione) {
      await fetch(`/api/comande/${comandaAttiva.id}`, { method: 'DELETE' });
    }
    iniziaNuovoOrdine();
    await caricaListaComande();
    return;
  }

  if (comandaAttiva) {
    await fetch(`/api/comande/${comandaAttiva.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ righe, note: noteComanda })
    });
  } else {
    await fetch('/api/comande', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serata_id: serataAttiva.id, righe, origine: 'cassa', note: noteComanda })
    });
  }

  iniziaNuovoOrdine();
  await caricaListaComande();
}

document.getElementById('btn-nuova-comanda-header').addEventListener('click', salvaSenzaStampare);

// ---------- Stampa (raggruppata per categoria, separatore marcato tra categorie) ----------

function raggruppaRighePerCategoria(righe) {
  const gruppi = [];
  menuData.forEach(cat => {
    const righeCategoria = righe.filter(r => cat.voci.some(v => v.id == r.voce_menu_id));
    if (righeCategoria.length > 0) {
      righeCategoria.sort((a, b) => {
        const va = cat.voci.find(v => v.id == a.voce_menu_id);
        const vb = cat.voci.find(v => v.id == b.voce_menu_id);
        return (va.ordine || 0) - (vb.ordine || 0);
      });
      gruppi.push({ categoria: cat.nome, righe: righeCategoria });
    }
  });
  return gruppi;
}

function costruisciTabellaHtml(righe) {
  const gruppi = raggruppaRighePerCategoria(righe);
  let html = '<table class="tabella-comanda">';
  gruppi.forEach((g, idxGruppo) => {
    g.righe.forEach((r, i) => {
      const v = trovaVoce(r.voce_menu_id);
      const ultimaRigaGruppo = (i === g.righe.length - 1);
      const classe = (ultimaRigaGruppo && idxGruppo < gruppi.length - 1) ? 'fine-categoria' : '';
      html += `<tr class="${classe}"><td>${r.quantita}</td><td>${v.nome}</td><td>€ ${(r.quantita * r.prezzo_unitario).toFixed(2)}</td></tr>`;
    });
  });
  html += '</table>';
  return html;
}

// Piccola funzione di sicurezza: evita che del testo scritto nelle note
// possa rompere la pagina di stampa (es. se contiene simboli < o >)
function escapeHtml(testo) {
  const div = document.createElement('div');
  div.textContent = testo;
  return div.innerHTML;
}

function stampaComanda(numeroComanda, righe, note) {
  const totale = righe.reduce((s, r) => s + r.quantita * r.prezzo_unitario, 0);
  const tabellaHtml = costruisciTabellaHtml(righe);
  const noteHtml = (note && note.trim())
    ? `<div class="nota-comanda"><strong>Note:</strong> ${escapeHtml(note)}</div>`
    : '';

  const finestra = window.open('', '_blank');
  finestra.document.write(`
    <html>
    <head>
      <title>Comanda ${numeroComanda}</title>
      <style>
        @page { size: A4 landscape; margin: 0; }
        body { margin: 0; font-family: Arial, sans-serif; }
        .foglio { display: flex; width: 297mm; height: 210mm; }
        .meta { width: 50%; height: 100%; box-sizing: border-box; padding: 10mm; border-right: 1px dashed #999; display: flex; flex-direction: column; }
        .meta:last-child { border-right: none; }
        .titolo-sagra { font-size: 18px; font-weight: bold; }

        /* Intestazione copia ospiti (20/7/2026, terza ridisegnata dopo
           prova di stampa): logo di nuovo in cima, sulla stessa riga del
           nome sagra ma con quest'ultimo giustificato a destra (prima era a
           sinistra, affiancato al box invece che al logo). Il box scende
           sotto, leggermente più basso di prima. */
        .riga-logo-titolo { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
        .riga-logo-titolo img { height: 60px; }
        .riga-logo-titolo .titolo-sagra { text-align: right; }

        /* Box "Copia per..." + codice comanda (20/7/2026, compattato):
           prima erano due elementi separati — un box bordato per la sola
           dicitura e, accanto, un numero enorme (34px) senza bordo — che
           insieme occupavano più altezza del necessario. Ora un unico box
           più basso. Lato ospiti è "stretto" (si stringe al contenuto),
           sotto la riga logo+titolo; lato cameriere (senza logo) resta da
           solo in cima, quindi può occupare la larghezza intera con
           .larga. */
        .box-copia {
          display: flex;
          align-items: center;
          gap: 12px;
          border: 2px solid #000;
          border-radius: 4px;
          padding: 3px 12px;
          margin: 6px 0;
        }
        .box-copia.larga { justify-content: space-between; }
        .box-copia .dicitura { font-size: 13px; font-weight: bold; white-space: nowrap; }
        .box-copia .numero-comanda { font-size: 22px; font-weight: bold; white-space: nowrap; }

        table.tabella-comanda { width: 100%; border-collapse: collapse; margin-top: 10px; }
        table.tabella-comanda td { padding: 6px 8px; border-bottom: 1px solid #ccc; font-size: 21px; }
        table.tabella-comanda tr.fine-categoria td { border-bottom: 3px solid #000; }
        .nota-comanda { margin-top: 10px; padding: 8px; border: 1px solid #999; font-size: 16px; }

        /* Riga finale SOLO copia ospiti (20/7/2026, ridisegnata dopo prova
           di stampa reale): Ecosagra e totale nella STESSA riga, immagine a
           sinistra e larga più della metà della colonna, totale a destra
           nello spazio restante — così non si "schiacciano" a vicenda come
           accadeva quando l'immagine era centrata sotto un totale a piena
           larghezza. Ancorata in fondo con margin-top:auto: resta sempre
           alla stessa altezza, indipendentemente da quanto è lunga la
           tabella sopra (niente più differenza di dimensione tra comande
           corte e lunghe). */
        .riga-fondo-ospiti {
          margin-top: auto;
          padding-top: 6mm;
          display: flex;
          align-items: flex-end;
          gap: 8mm;
        }
        .blocco-ecosagra { flex: 0 0 55%; }
        .blocco-ecosagra img { width: 100%; height: auto; display: block; }
        .totale-riga { flex: 1; font-weight: bold; font-size: 16px; text-align: right; }
      </style>
    </head>
    <body onload="window.print()">
      <div class="foglio">
        <div class="meta">
          <div class="riga-logo-titolo">
            <img src="${new URL('img/logo-proloco.png', document.baseURI).href}" onerror="this.style.display='none'">
            <div class="titolo-sagra">${escapeHtml(nomeSagraCorrente)}</div>
          </div>
          <div class="box-copia">
            <div class="dicitura">COPIA PER GLI OSPITI</div>
            <div class="numero-comanda">${numeroComanda}</div>
          </div>
          ${tabellaHtml}
          ${noteHtml}
          <div class="riga-fondo-ospiti">
            <div class="blocco-ecosagra">
              <img src="${new URL('img/ecosagra.jpg', document.baseURI).href}" alt="Differenzia i rifiuti a fine pasto" onerror="this.parentElement.style.display='none'">
            </div>
            <div class="totale-riga">Totale: € ${totale.toFixed(2)}</div>
          </div>
        </div>
        <div class="meta">
          <div class="box-copia larga">
            <div class="dicitura">COPIA PER IL CAMERIERE</div>
            <div class="numero-comanda">${numeroComanda}</div>
          </div>
          ${tabellaHtml}
          ${noteHtml}
        </div>
      </div>
    </body>
    </html>
  `);
  finestra.document.close();
}

// ---------- Coda di stampa remota (21/7/2026) ----------
// Il Caposala compila comande "volanti" dal cellulare (nessuna stampante
// collegata lì) e le accoda per la stampa. SOLO Cassa 1 esegue questo
// polling ed effettua davvero la stampa: è la postazione dove risiede il
// server e la stampante fisica (vedi routes/coda-stampa.js). Riusa la
// stessa identica funzione stampaComanda() di "Salva e Stampa" — stesso
// layout, stesso comportamento (si apre il dialogo di stampa del browser
// qui su Cassa 1, come già oggi). Se in futuro la stampante cambia
// postazione, aggiornare NOME_ISTANZA_STAMPANTE qui sotto.
const INTERVALLO_POLLING_STAMPA_MS = 5000;
const NOME_ISTANZA_STAMPANTE = 'Cassa 1';

function eCassaUnoStampante() {
  return !!(window.identitaSagra && window.identitaSagra.nome_istanza === NOME_ISTANZA_STAMPANTE);
}

async function controllaCodaStampa() {
  if (!eCassaUnoStampante()) return;
  try {
    const res = await fetch('/api/coda-stampa/prossima');
    const job = await res.json();
    if (!job) return;
    stampaComanda(job.numero_comanda, job.righe, job.note);
    await fetch(`/api/coda-stampa/${job.id}/stampata`, { method: 'POST' });
  } catch (err) {
    console.error('Errore controllo coda di stampa:', err);
  }
}

if (eCassaUnoStampante()) {
  controllaCodaStampa();
  setInterval(controllaCodaStampa, INTERVALLO_POLLING_STAMPA_MS);
}

init();
