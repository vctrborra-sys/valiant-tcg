/* Pesquisa TCGdex: consulta sob demanda à API pública (sem copiar o banco inteiro).
   Documentação: https://tcgdex.dev/rest/cards | https://tcgdex.dev/assets
*/
(function () {
  'use strict';
  const API = 'https://api.tcgdex.net/v2';
  const PER_PAGE = 24;
  const $ = id => document.getElementById(id);
  const esc = window.ValiantCatalog.safeText;
  const resultsEl = $('tcgdexResults');
  const status = $('tcgdexStatus');
  const btn = $('tcgdexSearchBtn');
  const pagination = $('tcgdexPagination');
  let page = 1;
  let rows = [];
  let currentLang = 'pt';
  let searchToken = 0;
  let busy = false;

  function imageUrl(base, quality = 'low') {
    if (typeof base !== 'string') return '';
    // Asset URLs from official TCGdex service only; never use arbitrary response URLs as markup.
    if (!/^https:\/\/assets\.tcgdex\.net\/[a-z]{2}\/[a-z0-9/_.-]+$/i.test(base)) return '';
    return base + '/' + quality + '.webp';
  }
  function setStatus(msg, error = false) {
    status.textContent = msg;
    status.classList.toggle('tcgdex-warning', error);
  }
  function resetResults() {
    rows = [];
    resultsEl.replaceChildren();
    pagination.hidden = true;
  }
  async function fetchApi(url, signal) {
    const response = await fetch(url, {signal, headers:{'Accept':'application/json'}});
    if (!response.ok) throw new Error('O TCGdex retornou HTTP ' + response.status);
    return response.json();
  }
  function renderResults(items) {
    // Build untrusted API fields safely; images are limited to known TCGdex host.
    resultsEl.innerHTML = items.map((card, index) => {
      const name = esc(String(card.name || 'Sem nome').slice(0,120));
      const id = esc(String(card.id || '').slice(0,90));
      const img = imageUrl(card.image);
      return `<button type="button" class="tcgdex-result" data-result-index="${index}" aria-label="Selecionar ${name}, código ${id}">
        ${img?`<img src="${esc(img)}" alt="Carta ${name}" loading="lazy">`:'<span style="height:182px;display:grid;place-items:center;color:#ffe0a2;font-size:13px">Sem imagem</span>'}
        <span class="result-text"><strong>${name}</strong><small>${id} · nº ${esc(card.localId||'?')}</small><span class="result-add">+ Adicionar ao estoque</span></span>
      </button>`;
    }).join('');
    // Broken artwork must not stop selection.
    resultsEl.querySelectorAll('img').forEach(img => img.addEventListener('error', () => {img.style.visibility='hidden';}, {once:true}));
  }
  async function search() {
    const q = $('tcgdexQuery').value.trim();
    if (q.length < 2) {setStatus('Informe pelo menos duas letras para pesquisar.', true);return;}
    if (busy) return;
    busy = true;
    btn.disabled = true;
    resetResults();
    setStatus(`Procurando “${q}” no TCGdex…`);
    const token = ++searchToken;
    try {
      const preferred = $('tcgdexLang').value;
      let lang = preferred;
      let list;
      let fallback = false;
      try {
        const u = `${API}/${lang}/cards?name=${encodeURIComponent(q)}&pagination:page=${page}&pagination:itemsPerPage=${PER_PAGE}`;
        list = await fetchApi(u);
      } catch (e) {
        if (preferred !== 'pt') throw e;
        lang = 'en';
        fallback = true;
        const u = `${API}/en/cards?name=${encodeURIComponent(q)}&pagination:page=${page}&pagination:itemsPerPage=${PER_PAGE}`;
        list = await fetchApi(u);
      }
      if (!Array.isArray(list)) throw new Error('Resposta inesperada da API.');
      if (!list.length && lang === 'pt') {
        lang = 'en';
        fallback = true;
        const u = `${API}/en/cards?name=${encodeURIComponent(q)}&pagination:page=${page}&pagination:itemsPerPage=${PER_PAGE}`;
        list = await fetchApi(u);
        if (!Array.isArray(list)) throw new Error('Resposta inesperada da API.');
      }
      if (token !== searchToken) return;
      currentLang=lang;
      rows = list.filter(x=>x && typeof x.id==='string' && typeof x.name==='string');
      renderResults(rows);
      const maybeMore = list.length === PER_PAGE;
      pagination.hidden = page === 1 && !maybeMore;
      $('tcgdexPage').textContent = 'Página ' + page;
      $('tcgdexPrev').disabled=page===1;
      $('tcgdexNext').disabled=!maybeMore;
      setStatus(rows.length?`${rows.length} resultados na página ${page} (${lang==='pt'?'português':'inglês'})${fallback?' · idioma alternativo usado':''}. Selecione a imagem/edição desejada para cadastrar.`:'Nenhuma carta encontrada nesta pesquisa. Tente outra grafia ou mude para inglês.');
    } catch(err) {
      resetResults();
      setStatus('Não foi possível consultar o TCGdex. Verifique sua conexão com a internet e tente novamente. '+(err.message||''),true);
    } finally {
      busy=false;
      btn.disabled=false;
    }
  }
  $('tcgdexForm').addEventListener('submit',ev=>{ev.preventDefault();page=1;search();});
  $('tcgdexPrev').addEventListener('click',()=>{if(page>1&&!busy){page--;search();}});
  $('tcgdexNext').addEventListener('click',()=>{if(!busy){page++;search();}});
  $('tcgdexLang').addEventListener('change',()=>{page=1;resetResults();setStatus('Idioma alterado. Clique em “Buscar cartas” para atualizar os resultados.');});

  resultsEl.addEventListener('click',async ev=>{
    const button = ev.target.closest('button[data-result-index]');
    if (!button) return;
    const selected = rows[Number(button.dataset.resultIndex)];
    if(!selected) return;
    const token = ++searchToken;
    button.disabled = true;
    setStatus(`Carregando dados de “${selected.name}” (${selected.id})…`);
    let card=selected;
    try {
      const detailed = await fetchApi(`${API}/${currentLang}/cards/${encodeURIComponent(selected.id)}`);
      if (detailed && typeof detailed === 'object' && detailed.id === selected.id) card = {...selected, ...detailed};
    } catch (err) {
      // A seleção funciona com nome, ID e arte resumidos mesmo quando o detalhe falha.
      setStatus('Não foi possível obter todos os detalhes; você pode completar os campos manualmente.',true);
    } finally {button.disabled = false;}
    if (token !== searchToken) return;
    const setName = typeof card.set?.name === 'string' ? card.set.name : '';
    const number = card.localId || selected.localId || '';
    const setLabel = setName ? setName+(number?' · '+number:'') : (card.id||selected.id);
    const image = imageUrl(card.image || selected.image, 'high');
    const rarity = window.ValiantCatalog.rarityFromTCGdex(card.rarity);
    window.ValiantAdmin.prefillPokemon({
      tcgdexId:selected.id,tcgdexLanguage:currentLang,
      name:String(card.name || selected.name).slice(0,120),
      set:setLabel.slice(0,140),rarity:rarity.slice(0,40),
      image,
      description:''
    });
    setStatus(`“${selected.name}” selecionada. ${rarity?'Raridade sugerida: '+rarity+'. ':'Raridade não reconhecida: selecione-a manualmente. '}Preencha conservação, preço e quantidade e clique em Salvar carta.`);
  });
})();
