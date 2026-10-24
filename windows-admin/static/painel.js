'use strict';
const $=id=>document.getElementById(id);
let csrf=document.querySelector('meta[name="csrf-token"]').content;
let signed=null, cards=[], history=[], users=[], editId=null, extras={};
const rarities={Pokémon:['Comum','Incomum','Rara','Rara Dupla','Ultra Rara','Ilustração Rara','Ilustração Rara Especial','Rara Hiper','ACE SPEC'],Magic:['Comum','Incomum','Rara','Mítica','SLD']};
const allGames=['Pokémon','Magic'];
const rarityOptionValue=(game,rarity)=>`${game}::${rarity}`;
const money=n=>(Number(n)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const msg=t=>{$('message').textContent=t;};
async function api(path,method='GET',data){const opts={method,credentials:'same-origin',headers:{'X-CSRF-Token':csrf}};if(data!==undefined){opts.headers['Content-Type']='application/json';opts.body=JSON.stringify(data);}const res=await fetch('/api/'+path,opts);let x=await res.json().catch(()=>({error:'Resposta inválida.'}));if(!res.ok)throw Error(x.error||'Falha na requisição.');return x;}
function labelFor(c){return [c.name,c.set].filter(Boolean).join(' · ');}
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function setLogin(u){signed=u;$('login-screen').hidden=!!u;$('dashboard').hidden=!u;$('logout').hidden=!u;$('account-name').textContent=u?`${u.username} · ${u.role}`:'';$('user-create').hidden=!!u&&u.role!=='proprietario';}
async function start(){try{const s=await api('session');setLogin(s.user);$('install-hint').hidden=s.initialized;if(s.user)await refresh();}catch(e){msg(e.message);}}
$('login-form').addEventListener('submit',async e=>{e.preventDefault();try{const x=await api('login','POST',{username:$('login-user').value,password:$('login-pass').value});csrf=x.csrf;setLogin(x.user);$('login-pass').value='';await refresh();}catch(err){alert(err.message);}});
$('logout').addEventListener('click',async()=>{await api('logout','POST');location.reload();});
async function refresh(){try{const [a,b,c,d]=await Promise.all([api('cards'),api('history'),api('users'),api('status')]);cards=a.items;history=b.items;users=c.items;renderCards();renderHistory();renderUsers();renderStatus(d);}catch(e){msg(e.message);}}
function renderStatus(d){$('sync-state').textContent=!d.hasToken?'Token GitHub não configurado':d.dirty?'Alterações aguardando publicação':'Catálogo local sincronizado';$('sync-info').textContent=d.lastError?'Falha: '+d.lastError:(d.lastPublish?'Último envio: '+new Date(d.lastPublish).toLocaleString('pt-BR'):'Sem envio realizado nesta instalação');}
$('publish-now').addEventListener('click',async()=>{let btn=$('publish-now');btn.disabled=true;try{const r=await api('publish','POST');msg(r.message);await refresh();}catch(e){msg(e.message);}finally{btn.disabled=false;}});
for(const button of document.querySelectorAll('[data-tab]')){button.addEventListener('click',()=>{for(const b of document.querySelectorAll('[data-tab]'))b.classList.toggle('active',b===button);for(const id of ['collection','history','users','settings'])$('tab-'+id).hidden=button.dataset.tab!==id;msg('');});}
$('filter-name').addEventListener('input',renderCards);$('filter-game').addEventListener('change',renderCards);
function renderCards(){const tbody=$('cards-body');tbody.replaceChildren();const q=$('filter-name').value.toLowerCase(),g=$('filter-game').value;const filtered=cards.filter(c=>(!g||c.game===g)&&(c.name+' '+c.set).toLowerCase().includes(q));$('cards-count').textContent=cards.length+' registros';for(const c of filtered){const tr=el('tr');const td0=el('td');const wrap=el('div',undefined,'namecell');const img=el('img');img.className='thumb';img.alt='';if(c.image)img.src=c.image;wrap.append(img);const group=el('div');group.append(el('strong',c.name),el('small',c.set));wrap.append(group);td0.append(wrap);tr.append(td0);for(const val of [c.game,c.condition,money(c.price),String(c.quantity),c.author||'—',c.published?'Sim':'Não'])tr.append(el('td',val));const controls=el('td');const act=el('div',undefined,'actions');const edit=el('button','Editar','secondary');edit.addEventListener('click',()=>openForm(c));const del=el('button','Excluir','subtle danger');del.addEventListener('click',()=>removeCard(c));act.append(edit,del);controls.append(act);tr.append(controls);tbody.append(tr);}if(!filtered.length){const tr=el('tr');const td=el('td','Nenhuma carta encontrada.');td.colSpan=8;tr.append(td);tbody.append(tr);}}
function updateRarities(chosenGame,chosenRarity){const select=$('card-rarity');select.replaceChildren();for(const game of allGames){const group=document.createElement('optgroup');group.label=game;for(const rarity of rarities[game]){const opt=el('option',rarity);opt.value=rarityOptionValue(game,rarity);group.append(opt);}select.append(group);}const fallbackGame=chosenGame||$('card-game').value||'Pokémon';const fallbackRarity=chosenRarity||rarities[fallbackGame][0];select.value=rarityOptionValue(fallbackGame,fallbackRarity);syncGameFromRarity();}
function syncGameFromRarity(){const value=$('card-rarity').value||'';const [game]=value.split('::');if(game)$('card-game').value=game;}
$('card-rarity').addEventListener('change',syncGameFromRarity);
$('new-card').addEventListener('click',()=>openForm());
function openForm(card=null){editId=card?.id||null;extras=card?Object.fromEntries(['tcgdexId','tcgdexLanguage','scryfall','scryfallId','scryfallSet','scryfallNumber','scryfallLanguage'].map(k=>[k,card[k]||''])):{};$('dialog-title').textContent=card?'Editar carta':'Cadastrar carta';$('card-game').value=card?.game||'Pokémon';updateRarities(card?.game||'Pokémon',card?.rarity||'Comum');for(const [k,v] of Object.entries({name:card?.name||'',set:card?.set||'',condition:card?.condition||'NM',price:card?.price??0,quantity:card?.quantity??1,image:card?.image||'',description:card?.description||'',language:card?.language||''}))$('card-'+k).value=v;$('card-published').checked=card?.published!==false;$('api-search').value='';$('magic-set-code').value='';$('api-results').replaceChildren();$('search-status').textContent='';$('more-prints').hidden=true;activatePrintSearch(card?.game||'Pokémon',false);++printSearchVersion;$('card-dialog').showModal();}
for(const b of ['cancel-x','cancel-form'])$(b).addEventListener('click',()=>$('card-dialog').close());
$('card-form').addEventListener('submit',async e=>{e.preventDefault();syncGameFromRarity();const rarityValue=$('card-rarity').value||'';const [game,rarity]=rarityValue.split('::');const obj={...extras,game:game||$('card-game').value||'Pokémon',name:$('card-name').value,set:$('card-set').value,rarity:rarity||$('card-rarity').selectedOptions[0]?.textContent||'Comum',condition:$('card-condition').value,price:Number($('card-price').value),quantity:Number($('card-quantity').value),image:$('card-image').value,description:$('card-description').value,language:$('card-language').value.trim(),published:$('card-published').checked};try{await api(editId?'cards/'+encodeURIComponent(editId):'cards',editId?'PUT':'POST',obj);$('card-dialog').close();msg('Carta salva! Sincronização automática em andamento.');await refresh();}catch(err){alert(err.message);}});
async function removeCard(c){if(!confirm('Excluir '+labelFor(c)+'? A exclusão será registrada no histórico.'))return;try{await api('cards/'+encodeURIComponent(c.id),'DELETE');msg('Carta excluída.');await refresh();}catch(e){alert(e.message);}}
function changes(a,b){if(!a)return 'Cadastro inicial';if(!b)return 'Exclusão';const labels={name:'Nome',set:'Edição',rarity:'Raridade',price:'Preço',quantity:'Quantidade',condition:'Conservação',language:'Idioma',published:'Visibilidade',image:'Imagem',description:'Descrição',game:'Jogo'};return Object.keys(labels).filter(k=>JSON.stringify(a[k])!==JSON.stringify(b[k])).map(k=>labels[k]+': '+String(a[k]??'')+' → '+String(b[k]??'')).join(' • ')||'Registro salvo sem alteração de valores';}
function renderHistory(){const target=$('audit-list');target.replaceChildren();for(const row of history){const div=el('div',undefined,'entry');div.append(el('strong',row.username+' — '+row.action+' — '+row.card_name));div.append(el('small',new Date(row.timestamp).toLocaleString('pt-BR')));div.append(el('div',changes(row.before,row.after),'diff'));target.append(div);}if(!history.length)target.append(el('p','Nenhuma alteração registrada.'));}
function renderUsers(){const target=$('users-list');target.replaceChildren();for(const u of users){const box=el('div',undefined,'userbox');box.append(el('strong',u.username),el('small',u.role==='proprietario'?'Proprietário':'Editor'),el('small','Criado em '+new Date(u.created_at).toLocaleDateString('pt-BR')));target.append(box);}}
$('user-form').addEventListener('submit',async e=>{e.preventDefault();try{await api('users','POST',{username:$('new-username').value,password:$('new-userpass').value,role:$('new-role').value});$('user-form').reset();msg('Usuário criado.');await refresh();}catch(err){alert(err.message);}});
$('password-form').addEventListener('submit',async e=>{e.preventDefault();try{await api('password','POST',{oldPassword:$('old-password').value,newPassword:$('new-password').value});$('password-form').reset();msg('Senha atualizada.');}catch(err){alert(err.message);}});

function rarityFromTCGdex(value){
  const known={'Common':'Comum','Uncommon':'Incomum','Rare':'Rara','Rare Holo':'Rara','Double Rare':'Rara Dupla','Ultra Rare':'Ultra Rara','Illustration Rare':'Ilustração Rara','Special Illustration Rare':'Ilustração Rara Especial','Hyper Rare':'Rara Hiper','ACE SPEC Rare':'ACE SPEC'};
  return known[value]||value||'Rara';
}
function rarityFromScryfall(card){
  if(card.set==='sld')return 'SLD';
  return ({common:'Comum',uncommon:'Incomum',rare:'Rara',mythic:'Mítica'})[card.rarity]||'Rara';
}
const languageLabels={en:'Inglês',pt:'Português',es:'Espanhol',ja:'Japonês',fr:'Francês',de:'Alemão',it:'Italiano'};
let printSearchGame='Pokémon',printSearchVersion=0,previewTimer=null,availablePrints=[],shownPrints=0,pokemonSetsPromise=null;
const visiblePrintsBatch=36;
const normalizedName=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
function searchWordTokens(value){return normalizedName(value).trim().split(/\s+/).filter(Boolean);}
function fitsQuery(name, query){
  const normalized=normalizedName(name);
  return searchWordTokens(query).every(word=>normalized.includes(word));
}
function getSearchFragment(value){
  return searchWordTokens(value).filter(x=>x.length>=2).sort((a,b)=>b.length-a.length)[0]||value.trim();
}
function activatePrintSearch(game,clear=true){
  printSearchGame=game;
  ++printSearchVersion;
  if(previewTimer!==null){clearTimeout(previewTimer);previewTimer=null;}
  for(const tab of document.querySelectorAll('[data-search-game]')){
    const selected=tab.dataset.searchGame===game;
    tab.classList.toggle('active',selected);
    tab.setAttribute('aria-selected',String(selected));
  }
  $('magic-set-field').hidden=game!=='Magic';
  $('magic-lang-field').hidden=game!=='Magic';
  $('api-search-btn').textContent=game==='Magic'?'⌕ Buscar Magic':'⌕ Buscar Pokémon';
  $('api-search').placeholder=game==='Magic'?'Ex.: Mikaeus, the Unhallowed':'Ex.: Pikachu, Zoroark...';
  $('search-tip').textContent=game==='Magic'
    ?'Veja as artes e edições de cada impressão. O código da coleção e o idioma acima filtram as impressões da busca; confira o idioma físico da sua carta no cadastro.'
    :'Veja as cartas e edições de Pokémon TCG, com suas imagens. Clique na impressão que corresponde à sua carta.';
  if(clear)$('api-search').value='';
  availablePrints=[];shownPrints=0;
  $('api-results').replaceChildren();$('search-status').textContent='';
  $('more-prints').hidden=true;
}
document.querySelectorAll('[data-search-game]').forEach(tab=>{
  tab.addEventListener('click',()=>{activatePrintSearch(tab.dataset.searchGame);$('api-search').focus();});
});
async function pokemonSetNames(){
  if(!pokemonSetsPromise){
    pokemonSetsPromise=fetch('https://api.tcgdex.net/v2/pt/sets')
      .then(r=>r.ok?r.json():[]).then(sets=>new Map((Array.isArray(sets)?sets:[]).map(s=>[s.id,s.name])))
      .catch(()=>new Map());
  }
  return pokemonSetsPromise;
}
async function getPokemonPrints(query,preview,version){
  const fragment=getSearchFragment(query);
  const setNames=await pokemonSetNames();
  // Mescla os idiomas para mostrar impressões que ainda não foram localizadas.
  // Uma impressão encontrada em português substitui a equivalente em inglês.
  const byId=new Map();
  for(const lang of ['en','pt']){
    let page=1;
    while(page <= (preview?1:20)){
      const params=new URLSearchParams({'name':'like:'+fragment,'pagination:page':String(page),'pagination:itemsPerPage':'160'});
      const response=await fetch('https://api.tcgdex.net/v2/'+lang+'/cards?'+params.toString());
      if(!response.ok){
        if(lang==='en')continue;
        if(!byId.size)throw Error('TCGdex não conseguiu carregar as impressões.');
        break;
      }
      const batch=await response.json();
      if(version!==printSearchVersion)return [];
      if(!Array.isArray(batch))break;
      for(const card of batch){
        if(card.id&&fitsQuery(card.name,query))byId.set(card.id,{...card,tcgdexLanguage:lang});
      }
      if(batch.length<160)break;
      page++;
    }
  }
  return [...byId.values()].map(card=>{
    const code=card.id?.split('-')[0]||'';
    const number=card.localId||card.id?.slice(code.length+1)||'';
    return {
      game:'Pokémon',name:card.name,edition:(setNames.get(code)||code),number,
      set:[setNames.get(code)||code,number].filter(Boolean).join(' · '),
      image:card.image?card.image+'/high.webp':'',
      tcgdexId:card.id,tcgdexLanguage:card.tcgdexLanguage,rarity:'Rara',
      printLang:card.tcgdexLanguage,printKey:'poke:'+card.id
    };
  }).sort((a,b)=>a.edition.localeCompare(b.edition,'pt-BR')||a.number.localeCompare(b.number,'pt-BR',{numeric:true}));
}
async function getLocalizedMagicName(query){
  try {
    const data=await api('search/nomes-pt?q='+encodeURIComponent(query));
    if(data.status==='pronto'&&Array.isArray(data.items)&&data.items.length){
      const exact=data.items.find(x=>normalizedName(x.localizedName)===normalizedName(query));
      return (exact||data.items[0]).name||query;
    }
  }catch(_){}
  return query;
}
async function getMagicPrints(query,preview,version){
  const code=$('magic-set-code').value.trim().toLocaleLowerCase('en-US');
  const lang=$('magic-print-lang').value;
  const canonical=await getLocalizedMagicName(query);
  const terms=searchWordTokens(canonical);
  const searchParts=terms.map(term=>'name:"'+term.replace(/["\\]/g,'')+'"');
  if(code)searchParts.push('set:'+code.replace(/[^a-z0-9]/g,''));
  searchParts.push('lang:'+lang);
  const params=new URLSearchParams({q:searchParts.join(' '),unique:'prints',order:'released',dir:'desc',include_multilingual:'true',include_variations:'true'});
  let url='https://api.scryfall.com/cards/search?'+params.toString();
  const prints=[];
  let page=0;
  while(url&&page<(preview?1:25)){
    const response=await fetch(url);
    if(version!==printSearchVersion)return [];
    if(!response.ok){
      if(response.status===404)break;
      throw Error('Scryfall não conseguiu carregar as edições.');
    }
    const data=await response.json();
    prints.push(...(data.data||[]));
    url=data.has_more?data.next_page:null;
    page++;
    if(url)await new Promise(resolve=>setTimeout(resolve,90));
  }
  const mapped=prints.map(card=>({
    game:'Magic',name:card.printed_name||card.name,canonicalName:card.name,
    edition:card.set_name||card.set,number:card.collector_number||'',
    set:[card.set_name||card.set,card.collector_number].filter(Boolean).join(' · '),
    image:card.image_uris?.normal||card.card_faces?.[0]?.image_uris?.normal||'',
    rarity:rarityFromScryfall(card),printLang:card.lang||lang,
    scryfallId:card.id,scryfallSet:card.set,scryfallNumber:card.collector_number,
    scryfallLanguage:card.lang,printKey:'magic:'+card.id
  }));
  return mapped;
}
function printResultCard(card){
  const button=el('button',undefined,'print-card');
  button.type='button';
  button.title='Selecionar '+card.name+' · '+card.set;
  if(card.image){
    const image=el('img');image.src=card.image;image.loading='lazy';image.alt='Imagem da impressão '+card.name;
    button.append(image);
  }else button.append(el('div','Imagem indisponível','print-placeholder'));
  button.append(el('strong',card.name),el('small',card.edition));
  button.append(el('small','#'+card.number+' · '+(languageLabels[card.printLang]||card.printLang||'')));
  button.append(el('small','+ Cadastrar esta impressão','print-card-action'));
  button.addEventListener('click',()=>choosePrint(card));
  return button;
}
function appendPrintCards(){
  const target=$('api-results');
  const finish=Math.min(shownPrints+visiblePrintsBatch,availablePrints.length);
  for(let i=shownPrints;i<finish;i++)target.append(printResultCard(availablePrints[i]));
  shownPrints=finish;
  $('more-prints').hidden=shownPrints>=availablePrints.length;
  $('more-prints').textContent='Mostrar mais impressões ('+(availablePrints.length-shownPrints)+' restantes)';
}
$('more-prints').addEventListener('click',appendPrintCards);
async function choosePrint(card){
  ++printSearchVersion;
  if(previewTimer!==null)clearTimeout(previewTimer);
  $('card-game').value=card.game;
  updateRarities(card.game,card.rarity);
  $('card-name').value=card.name;
  $('card-set').value=card.set;
  $('card-image').value=card.image||'';
  // Metadados da API não substituem o idioma físico informado pelo administrador.
  extras={...extras,
    tcgdexId:card.game==='Pokémon'?(card.tcgdexId||''):'',
    tcgdexLanguage:card.game==='Pokémon'?(card.tcgdexLanguage||''):'',
    scryfall:card.game==='Magic'?(card.canonicalName||card.name):'',
    scryfallId:card.game==='Magic'?(card.scryfallId||''):'',
    scryfallSet:card.game==='Magic'?(card.scryfallSet||''):'',
    scryfallNumber:card.game==='Magic'?(card.scryfallNumber||''):'',
    scryfallLanguage:card.game==='Magic'?(card.scryfallLanguage||''):''
  };
  if(card.game==='Pokémon'&&card.tcgdexId){
    try{
      const lang=card.tcgdexLanguage||'pt';
      const response=await fetch('https://api.tcgdex.net/v2/'+lang+'/cards/'+encodeURIComponent(card.tcgdexId));
      if(response.ok){
        const d=await response.json();
        $('card-set').value=[d.set?.name||card.edition,d.localId||card.number].filter(Boolean).join(' · ');
        const rarity=rarityFromTCGdex(d.rarity);
        if(rarities.Pokémon.includes(rarity))updateRarities('Pokémon',rarity);
        if(d.image)$('card-image').value=d.image+'/high.webp';
      }
    }catch(_){}
  }
  $('search-status').textContent='Impressão selecionada: '+card.name+' — '+card.set+'. Confira idioma, preço e conservação antes de salvar.';
  $('card-name').focus();
}
async function runPrintSearch(preview=false){
  if(previewTimer!==null){clearTimeout(previewTimer);previewTimer=null;}
  const query=$('api-search').value.trim();
  if(query.length<2){
    if(!preview)$('search-status').textContent='Digite pelo menos 2 letras para pesquisar.';
    return;
  }
  const version=++printSearchVersion;
  const game=printSearchGame;
  const status=$('search-status');
  status.textContent='Buscando '+(game==='Magic'?'impressões no Scryfall...':'impressões na TCGdex...');
  $('api-search-btn').disabled=true;
  try{
    const result=game==='Magic'?await getMagicPrints(query,preview,version):await getPokemonPrints(query,preview,version);
    if(version!==printSearchVersion||!$('card-dialog').open)return;
    availablePrints=result;
    shownPrints=0;
    $('api-results').replaceChildren();
    if(!result.length)status.textContent='Nenhuma impressão encontrada. Experimente outro nome ou idioma.';
    else{
      status.textContent=result.length+' '+(result.length===1?'impressão encontrada':'impressões encontradas')+(preview?' · Prévia automática; clique em Buscar para ver mais.':'')+'. Clique na arte e edição desejadas.';
      appendPrintCards();
    }
  }catch(err){
    if(version===printSearchVersion)status.textContent=err.message+' Você ainda pode cadastrar manualmente.';
  }finally{
    if(version===printSearchVersion)$('api-search-btn').disabled=false;
  }
}
function schedulePrintPreview(){
  if(previewTimer!==null)clearTimeout(previewTimer);
  ++printSearchVersion;
  $('api-search-btn').disabled=false;
  if($('api-search').value.trim().length<3){
    availablePrints=[];$('api-results').replaceChildren();$('more-prints').hidden=true;$('search-status').textContent='';return;
  }
  previewTimer=setTimeout(()=>runPrintSearch(true),650);
}
$('api-search').addEventListener('input',schedulePrintPreview);
$('magic-set-code').addEventListener('input',schedulePrintPreview);
$('magic-print-lang').addEventListener('change',()=>runPrintSearch(true));
$('api-search').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();runPrintSearch(false);}});
$('api-search-btn').addEventListener('click',()=>runPrintSearch(false));
setInterval(()=>{if(signed)api('status').then(renderStatus).catch(()=>{});},30000);
start();