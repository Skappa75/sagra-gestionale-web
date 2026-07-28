// ===================================================================
// MAPPA TAVOLI — componente JS condiviso (file "master")
// ===================================================================
// Disegna la griglia grafica della sala (stessa identica grafica per
// Caposala e Supporto Camerieri, e per qualunque futuro modulo che ne
// abbia bisogno). Va incluso con <script src="mappa-tavoli-render.js">
// DOPO mappa-tavoli.css e PRIMA dello script della pagina che lo usa.
//
// Cosa vive qui (deciso in UN SOLO posto):
//  - la disposizione fisica della sala: ordine delle file, verso di
//    numerazione dei tavoli di ciascuna
//  - l'aspetto grafico di ogni singolo tavolo (numero, coperti, comande)
//
// Cosa NON vive qui (resta nella pagina chiamante):
//  - cosa succede quando si clicca su un tavolo: ogni pagina passa la
//    propria funzione onClickTavolo(tavoloId, infoTavolo)
//
// Il numero di tavoli per fila e quali sono soppressi (es. vie di
// sicurezza) NON sono hard-coded qui: arrivano dal risultato di
// GET /api/mappa-tavoli (che già esclude i tavoli con attivo = 0).
// Cambiare la pianta della sala si fa lato database (tabella tavoli),
// non toccando questo file.

// Ordine delle file, una sotto l'altra: 1,2,3,4 e poi, di seguito, 5,6,7,8.
const ORDINE_FILE_MAPPA = [1, 2, 3, 4, 5, 6, 7, 8];

// Verso di numerazione dei tavoli all'interno di ciascuna fila: per le
// file 1-4 il tavolo 1 sta a destra e il 7 a sinistra (ordine decrescente
// da sinistra a destra); per le file 5-8 è il contrario, tavolo 1 a
// sinistra e 7 a destra (ordine crescente).
const FILE_ORDINE_CRESCENTE_MAPPA = new Set([5, 6, 7, 8]);

// Slot fissi per fila: 7 posizioni sempre presenti. Se un numero manca
// (tavolo soppresso, es. via di sicurezza) resta un riquadro invisibile
// al suo posto invece di far scorrere gli altri tavoli per chiudere il
// vuoto — la mappa deve continuare a rappresentare lo spazio fisico reale.
const NUMERI_TAVOLO_ATTESI_MAPPA = [1, 2, 3, 4, 5, 6, 7];

function escapeHtmlMappa(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function renderTavoloMappa(t, idUltimoClic) {
  const comandeHtml = (t.comande || []).map(c => {
    const classi = [c.chiusa ? 'chiusa' : ''].filter(Boolean).join(' ');
    return `<div class="${classi}">#${escapeHtmlMappa(c.numero_comanda)} ${escapeHtmlMappa(c.cameriere_nome || '—')}</div>`;
  }).join('');
  const segnalazioniHtml = (t.segnalazioni || []).map(s => `<div>📣 ${escapeHtmlMappa(s.motivo)}</div>`).join('');
  const classeClic = idUltimoClic === t.id ? ' appena-cliccato' : '';

  return `
    <div class="tavolo ${t.stato}${classeClic}" data-id="${t.id}" data-fila="${t.fila}">
      <div class="num-tavolo" title="Clicca per avvisare i camerieri: nuovi commensali a questo tavolo">Tav. ${t.numero_tavolo}</div>
      <div class="coperti">${t.coperti_attivi > 0 ? t.coperti_attivi : ''}</div>
      <div class="comande">${comandeHtml}${segnalazioniHtml}</div>
    </div>`;
}

// Un "segmento" = i 7 tavoli di UNA fila, ordinati secondo il verso della
// fila (crescente o decrescente), con l'etichetta Fx a entrambi gli
// estremi (dopo il tavolo 7 e prima del tavolo 1, qualunque sia il verso).
function renderSegmentoFila(fila, perFila, ordineCrescente, idUltimoClic) {
  const tavoliFila = perFila[fila] || [];
  const numeriOrdinati = [...NUMERI_TAVOLO_ATTESI_MAPPA].sort((a, b) => ordineCrescente ? a - b : b - a);
  const boxHtml = numeriOrdinati.map(numero => {
    const t = tavoliFila.find(x => x.numero_tavolo === numero);
    return t ? renderTavoloMappa(t, idUltimoClic) : '<div class="tavolo tavolo-vuoto" aria-hidden="true"></div>';
  }).join('');
  const etichetta = `<span class="fila-label">Fila ${fila}</span>`;
  return `${etichetta}<div class="tavoli-fila">${boxHtml}</div>${etichetta}`;
}

/**
 * Disegna la mappa sala dentro containerEl.
 * @param {HTMLElement} containerEl - elemento contenitore (es. #sala)
 * @param {Array} mappaTavoliAttuale - risultato di GET /api/mappa-tavoli
 * @param {Function} onClickTavolo - callback(tavoloId) eseguita al click sul tavolo (fuori dal numero)
 * @param {number|null} idUltimoClic - id del tavolo da evidenziare (opzionale)
 * @param {Function|null} onClickNumeroTavolo - callback(tavoloId) eseguita al click sul
 *        numero del tavolo ("Tav. N"): fa partire l'alert "nuovi commensali" su quel
 *        tavolo (lampeggiante, come farebbe il Caposala), indipendentemente dall'azione
 *        normale del resto del box. Se omessa, il click sul numero si comporta come il
 *        resto del box (chiama onClickTavolo).
 */
function disegnaMappaSala(containerEl, mappaTavoliAttuale, onClickTavolo, idUltimoClic = null, onClickNumeroTavolo = null) {
  const perFila = {};
  (mappaTavoliAttuale || []).forEach(t => {
    if (!perFila[t.fila]) perFila[t.fila] = [];
    perFila[t.fila].push(t);
  });

  const righeHtml = ORDINE_FILE_MAPPA.map(fila => {
    const ordineCrescente = FILE_ORDINE_CRESCENTE_MAPPA.has(fila);
    const segmento = renderSegmentoFila(fila, perFila, ordineCrescente, idUltimoClic);
    // Fila 5 apre il secondo gruppo di file (5-8), subito dopo la 4: un
    // margine in più e una riga tratteggiata segnano il passaggio.
    const classeSeparatore = fila === 5 ? ' nuovo-gruppo-file' : '';
    return `<div class="fila-riga-singola${classeSeparatore}">${segmento}</div>`;
  }).join('');

  containerEl.innerHTML = righeHtml;

  containerEl.querySelectorAll('.tavolo:not(.tavolo-vuoto)').forEach(el => {
    el.addEventListener('click', (e) => {
      if (onClickNumeroTavolo && e.target.closest('.num-tavolo')) {
        e.stopPropagation();
        onClickNumeroTavolo(parseInt(el.dataset.id, 10));
        return;
      }
      onClickTavolo(parseInt(el.dataset.id, 10));
    });
  });
}
