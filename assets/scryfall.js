/* Valiant TCG — integração Scryfall (Magic: The Gathering)
   https://scryfall.com/docs/api/cards/search
   Consulta por demanda; o cadastro não usa preços de mercado nem importa estoque automaticamente.
*/
(function () {
  'use strict';
  const BASE = 'https://api.scryfall.com/cards/search';
  const PER_VIEW = 24;
  const $ = id => document.getElementById(id);
  const escape = window.ValiantCatalog.safeText;
  const form = $('scryfallForm');
  const resultsEl = $('scryfallResults');
  const status = $('scryfallStatus');
  const pagination = $('scryfallPagination');
  const searchButton = $('scryfallSearchBtn');
  const back = $('scryfallPrev');
  const next = $('scryfallNext');
  let apiPages = []; // A Scryfall retorna até 175 impressões por página.
  let pageIndex = 0;
  let offset = 0;
  let queryToken = 0;
  let busy = false;
  let total = 0;
  let lastRequestAt = 0;

  function setStatus(message, warning = false) {
    status.textContent = message;
    status.classList.toggle('tcgdex-warning', warning);
  }
  function cardImage(card, size = 'small') {
    const uris = card?.image_uris || card?.card_faces?.find(face => face?.image_uris)?.image_uris || {};
    const src = uris[size] || uris.normal || uris.small || '';
    // URLs externas jamais são interpoladas livremente no HTML.
    return /^https:\/\/(?:cards\.scryfall\.io|c1\.scryfall\.com)\/[a-z0-9_./?=&%-]+$/i.test(src) ? src : '';
  }
  function setBusy(active) {
    busy = active;
    searchButton.disabled = active;
    back.disabled = active || (pageIndex === 0 && offset === 0);
    next.disabled = active;
  }
  function reset() {
    apiPages = [];
    pageIndex = 0;
    offset = 0;
    total = 0;
    resultsEl.replaceChildren();
    pagination.hidden = true;
  }
  function calculatePosition() {
    return apiPages.slice(0, pageIndex).reduce((sum, p) => sum + p.data.length, 0) + offset;
  }
  function render() {
    const current = apiPages[pageIndex];
    if (!current) { pagination.hidden = true; resultsEl.replaceChildren(); return; }
    const subset = current.data.slice(offset, offset + PER_VIEW);
    resultsEl.innerHTML = subset.map((card, i) => {
      const title = escape(String(card.printed_name || card.name || 'Sem nome').slice(0, 120));
      const set = escape(String(card.set_name || 'Edição não informada').slice(0, 100));
      const number = escape(String(card.collector_number || '').slice(0, 30));
      const edition = escape(String(card.set || '').toUpperCase().slice(0, 6));
      const art = cardImage(card);
      return `<button type="button" class="tcgdex-result" data-scryfall-index="${offset + i}" aria-label="Cadastrar ${title}, edição ${edition}, número ${number}">
        ${art ? `<img loading="lazy" src="${escape(art)}" alt="Carta ${title}">` : '<span style="height:182px;display:grid;place-items:center;color:#ffe0a2;font-size:13px">Sem imagem</span>'}
        <span class="result-text"><strong>${title}</strong><small>${set} (${edition}) · #${number}</small><small>Idioma: ${escape(card.lang || 'en').toUpperCase()} · ${escape(String(card.rarity||'').slice(0,20))}</small><span class="result-add">+ Cadastrar esta impressão</span></span>
      </button>`;
    }).join('');
    resultsEl.querySelectorAll('img').forEach(img => img.addEventListener('error', () => {img.style.visibility = 'hidden';}, {once:true}));
    const currentPosition = calculatePosition();
    const hasNext = offset + PER_VIEW < current.data.length || current.hasMore || pageIndex + 1 < apiPages.length;
    const hasPrevious = pageIndex !== 0 || offset > 0;
    pagination.hidden = !hasNext && !hasPrevious;
    back.disabled = busy || !hasPrevious;
    next.disabled = busy || !hasNext;
    $('scryfallPage').textContent = 'Resultados ' + (currentPosition + 1) + '–' + (currentPosition + subset.length) + (total ? ' de ' + total : '');
    setStatus(`${subset.length} impressões nesta página. Clique na arte e edição desejadas para cadastrar a carta. Preço, conservação e estoque não são importados.`);
  }
  async function fetchPage(url) {
    // Respeita intervalo mínimo entre solicitações para não sobrecarregar o serviço.
    const elapsed = Date.now() - lastRequestAt;
    if (elapsed < 120) await new Promise(resolve => setTimeout(resolve, 120 - elapsed));
    lastRequestAt = Date.now();
    const response = await fetch(url, { headers: {Accept: 'application/json'} });
    if (response.status === 404) return {data: [], hasMore:false, nextPage:'', total:0};
    if (response.status === 429) throw new Error('Limite de consultas atingido. Tente novamente em instantes.');
    if (!response.ok) throw new Error('Scryfall retornou HTTP ' + response.status);
    const data = await response.json();
    if (!Array.isArray(data.data)) throw new Error('A resposta da API não contém uma lista de cartas.');
    // Nunca seguimos next_page para domínios externos.
    const nextPage = typeof data.next_page === 'string' && data.next_page.startsWith(BASE + '?') ? data.next_page : '';
    return {
      data: data.data.filter(card => card && typeof card.name === 'string' && typeof card.id === 'string'),
      hasMore: Boolean(data.has_more && nextPage),
      nextPage,
      total: Number.isInteger(data.total_cards) ? data.total_cards : 0
    };
  }
  function buildSearchUrl() {
    const raw = $('scryfallQuery').value.trim();
    if (raw.length < 2) throw new Error('Informe pelo menos duas letras do nome.');
    // Busca simples pelo nome, evitando que caracteres especiais injetem operadores da sintaxe Scryfall.
    const name = raw.replace(/["\\\n\r]/g,' ').replace(/\s+/g,' ').trim();
    if (name.length < 2) throw new Error('Informe um nome válido.');
    const set = $('scryfallSet').value.trim().toLowerCase();
    if (set && !/^[a-z0-9]{2,6}$/.test(set)) throw new Error('Informe um código de edição válido (2–6 caracteres).');
    const lang = $('scryfallLang').value;
    const parts = [`name:"${name}"`, 'game:paper'];
    if (set) parts.push('set:' + set);
    if (lang !== 'all') parts.push('lang:' + lang);
    const params = new URLSearchParams({q:parts.join(' '), unique:'prints', order:'released', dir:'desc'});
    if (lang !== 'en') params.set('include_multilingual','true');
    return BASE + '?' + params.toString();
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    let url;
    try {url = buildSearchUrl();}
    catch (error) {setStatus(error.message, true);return;}
    const token = ++queryToken;
    reset();
    setBusy(true);
    setStatus('Consultando impressões no Scryfall…');
    try {
      const page = await fetchPage(url);
      if (token !== queryToken) return;
      total = page.total;
      if (!page.data.length) {setStatus('Nenhuma impressão encontrada. Revise o nome, a edição ou o idioma.');return;}
      apiPages.push(page);
      render();
    } catch(error) {
      if(token !== queryToken) return;
      setStatus('Não foi possível consultar o Scryfall. Verifique a conexão. ' + error.message, true);
    } finally { setBusy(false); if(apiPages.length)render(); }
  });
  $('scryfallNext').addEventListener('click', async () => {
    if (busy || !apiPages.length) return;
    const current = apiPages[pageIndex];
    if (offset + PER_VIEW < current.data.length) {offset += PER_VIEW; render(); return;}
    if (pageIndex + 1 < apiPages.length) {pageIndex++;offset=0;render();return;}
    if (!current.hasMore) return;
    setBusy(true);
    setStatus('Carregando mais edições…');
    try {
      const page = await fetchPage(current.nextPage);
      if (!page.data.length) {current.hasMore=false; setStatus('Não foram encontradas outras impressões.');return;}
      apiPages.push(page); pageIndex++;offset=0;render();
    } catch(error){setStatus('Falha ao carregar outras impressões: '+error.message,true);}
    finally{setBusy(false);}
  });
  $('scryfallPrev').addEventListener('click', () => {
    if (busy || !apiPages.length) return;
    if (offset >= PER_VIEW) offset -= PER_VIEW;
    else if (pageIndex > 0) {pageIndex--;offset=Math.floor((apiPages[pageIndex].data.length - 1)/PER_VIEW)*PER_VIEW;}
    render();
  });
  resultsEl.addEventListener('click', event => {
    const button = event.target.closest('button[data-scryfall-index]');
    if (!button || !apiPages[pageIndex]) return;
    const card = apiPages[pageIndex].data[Number(button.dataset.scryfallIndex)];
    if (!card) return;
    const rarity = window.ValiantCatalog.rarityFromScryfall(card.rarity,card.set);
    const title = String(card.printed_name || card.name).slice(0,120);
    const setLabel = `${card.set_name || 'Edição desconhecida'} (${String(card.set||'').toUpperCase()}) · ${card.collector_number || '?'}`.slice(0,140);
    window.ValiantAdmin.prefillMagic({
      name:title,
      set:setLabel,
      rarity,
      image:cardImage(card,'normal'),
      scryfallId:String(card.id||'').slice(0,60),
      scryfallSet:String(card.set||'').slice(0,12),
      scryfallNumber:String(card.collector_number||'').slice(0,30),
      scryfallLanguage:String(card.lang||'en').slice(0,12),
      description:''
    });
    setStatus(`“${title}” — ${setLabel} selecionada. ${rarity ? 'Raridade sugerida: '+rarity+'. ' : 'Raridade não reconhecida; selecione manualmente. '}Preencha conservação, preço e quantidade, ative a publicação se desejar, e salve.`);
  });
})();
