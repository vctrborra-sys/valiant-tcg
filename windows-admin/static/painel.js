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
function openForm(card=null){editId=card?.id||null;extras=card?Object.fromEntries(['tcgdexId','tcgdexLanguage','scryfall','scryfallId','scryfallSet','scryfallNumber','scryfallLanguage'].map(k=>[k,card[k]||''])):{};$('dialog-title').textContent=card?'Editar carta':'Cadastrar carta';$('card-game').value=card?.game||'Pokémon';updateRarities(card?.game||'Pokémon',card?.rarity||'Comum');for(const [k,v] of Object.entries({name:card?.name||'',set:card?.set||'',condition:card?.condition||'NM',price:card?.price??0,quantity:card?.quantity??1,image:card?.image||'',description:card?.description||'',language:card?.language||''}))$('card-'+k).value=v;$('card-published').checked=card?.published!==false;$('api-search').value='';++suggestVersion;$('api-results').replaceChildren();$('card-dialog').showModal();}
for(const b of ['cancel-x','cancel-form'])$(b).addEventListener('click',()=>$('card-dialog').close());
$('card-form').addEventListener('submit',async e=>{e.preventDefault();syncGameFromRarity();const rarityValue=$('card-rarity').value||'';const [game,rarity]=rarityValue.split('::');const obj={...extras,game:game||$('card-game').value||'Pokémon',name:$('card-name').value,set:$('card-set').value,rarity:rarity||$('card-rarity').selectedOptions[0]?.textContent||'Comum',condition:$('card-condition').value,price:Number($('card-price').value),quantity:Number($('card-quantity').value),image:$('card-image').value,description:$('card-description').value,language:$('card-language').value.trim(),published:$('card-published').checked};try{await api(editId?'cards/'+encodeURIComponent(editId):'cards',editId?'PUT':'POST',obj);$('card-dialog').close();msg('Carta salva! Sincronização automática em andamento.');await refresh();}catch(err){alert(err.message);}});
async function removeCard(c){if(!confirm('Excluir '+labelFor(c)+'? A exclusão será registrada no histórico.'))return;try{await api('cards/'+encodeURIComponent(c.id),'DELETE');msg('Carta excluída.');await refresh();}catch(e){alert(e.message);}}
function changes(a,b){if(!a)return 'Cadastro inicial';if(!b)return 'Exclusão';const labels={name:'Nome',set:'Edição',rarity:'Raridade',price:'Preço',quantity:'Quantidade',condition:'Conservação',language:'Idioma',published:'Visibilidade',image:'Imagem',description:'Descrição',game:'Jogo'};return Object.keys(labels).filter(k=>JSON.stringify(a[k])!==JSON.stringify(b[k])).map(k=>labels[k]+': '+String(a[k]??'')+' → '+String(b[k]??'')).join(' • ')||'Registro salvo sem alteração de valores';}
function renderHistory(){const target=$('audit-list');target.replaceChildren();for(const row of history){const div=el('div',undefined,'entry');div.append(el('strong',row.username+' — '+row.action+' — '+row.card_name));div.append(el('small',new Date(row.timestamp).toLocaleString('pt-BR')));div.append(el('div',changes(row.before,row.after),'diff'));target.append(div);}if(!history.length)target.append(el('p','Nenhuma alteração registrada.'));}
function renderUsers(){const target=$('users-list');target.replaceChildren();for(const u of users){const box=el('div',undefined,'userbox');box.append(el('strong',u.username),el('small',u.role==='proprietario'?'Proprietário':'Editor'),el('small','Criado em '+new Date(u.created_at).toLocaleDateString('pt-BR')));target.append(box);}}
$('user-form').addEventListener('submit',async e=>{e.preventDefault();try{await api('users','POST',{username:$('new-username').value,password:$('new-userpass').value,role:$('new-role').value});$('user-form').reset();msg('Usuário criado.');await refresh();}catch(err){alert(err.message);}});
$('password-form').addEventListener('submit',async e=>{e.preventDefault();try{await api('password','POST',{oldPassword:$('old-password').value,newPassword:$('new-password').value});$('password-form').reset();msg('Senha atualizada.');}catch(err){alert(err.message);}});
function rarityFromTCGdex(x){const m={'Common':'Comum','Uncommon':'Incomum','Rare':'Rara','Rare Holo':'Rara','Double Rare':'Rara Dupla','Ultra Rare':'Ultra Rara','Illustration Rare':'Ilustração Rara','Special Illustration Rare':'Ilustração Rara Especial','Hyper Rare':'Rara Hiper','ACE SPEC Rare':'ACE SPEC'};return m[x]||x||'Rara';}

// Sugestões REAIS enquanto digita: qualquer palavra do nome, em qualquer ordem,
// com/sem acentos, inclusive nomes oficiais em português quando disponíveis.
const searchCache=new Map();
let suggestTimer=null, suggestVersion=0, lastSuggestions=[];
const foldName=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/[‘’'´`]/g,'').trim();
const searchTerms=value=>foldName(value).split(/\s+/).filter(Boolean);
function matchByWords(name,alias,query){
  const terms=searchTerms(query), haystack=foldName(name+' '+(alias||''));
  return terms.every(term=>haystack.includes(term));
}
function nameScore(card,query){
  const q=foldName(query), title=foldName(card.localizedName||card.name), english=foldName(card.name);
  if(title===q)return 0;
  if(title.startsWith(q))return 1;
  if(title.split(/\s+/).some(w=>w.startsWith(q)))return 2;
  if(english===q)return 3;
  if(english.startsWith(q))return 4;
  if(english.split(/\s+/).some(w=>w.startsWith(q)))return 5;
  return 6;
}
function searchFragment(q){
  // A palavra mais longa da consulta localiza nomes mesmo quando a busca começa
  // pela segunda palavra, como "Ring" para "Sol Ring".
  return searchTerms(q).filter(t=>t.length>=2).sort((a,b)=>b.length-a.length)[0]||q.trim();
}
function cachedSearch(cacheKey,action){
  if(searchCache.has(cacheKey))return searchCache.get(cacheKey);
  const pending=Promise.resolve().then(action).catch(error=>{searchCache.delete(cacheKey);throw error;});
  searchCache.set(cacheKey,pending);
  if(searchCache.size>75)searchCache.delete(searchCache.keys().next().value);
  return pending;
}
async function searchPokemonLocale(query,lang){
  const fragment=searchFragment(query);
  if(fragment.length<2)return [];
  const url=`https://api.tcgdex.net/v2/${lang}/cards?name=${encodeURIComponent('like:'+fragment)}&pagination:itemsPerPage=150`;
  const items=await cachedSearch('poke:'+lang+':'+fragment,async()=>{
    const res=await fetch(url);
    if(!res.ok)throw Error('TCGdex indisponível ('+lang+').');
    return res.json();
  });
  return (Array.isArray(items)?items:[])
    .filter(c=>matchByWords(c.name,'',query))
    .slice(0,18)
    .map(c=>({game:'Pokémon',name:c.name,set:c.id||'',image:c.image?c.image+'/high.webp':'',rarity:'Rara',tcgdexId:c.id,tcgdexLanguage:lang,source:'TCGdex'}));
}
async function searchMagicEnglish(query){
  const fragment=searchFragment(query);
  if(fragment.length<2)return [];
  const names=await cachedSearch('magic:'+fragment,async()=>{
    const res=await fetch('https://api.scryfall.com/cards/autocomplete?q='+encodeURIComponent(fragment));
    if(!res.ok)throw Error('Scryfall indisponível.');
    const payload=await res.json();
    return payload.data||[];
  });
  return names.filter(name=>matchByWords(name,'',query)).slice(0,20)
    .map(name=>({game:'Magic',name,set:'Edições disponíveis após selecionar',image:'',rarity:'Rara',source:'Scryfall'}));
}
async function searchMagicPortuguese(query){
  const data=await api('search/nomes-pt?q='+encodeURIComponent(query));
  return {status:data.status,items:(data.items||[]).filter(x=>matchByWords(x.name,x.localizedName,query))};
}
function mergeSuggestions(query,groups){
  const all=groups.flat(),unique=new Map();
  for(const c of all){
    const key=c.game==='Pokémon'?'poke:'+c.tcgdexId:'magic:'+foldName(c.name);
    const previous=unique.get(key);
    if(!previous || (c.localizedName && !previous.localizedName) ||
       (c.game==='Pokémon'&&c.tcgdexLanguage==='pt'&&previous.tcgdexLanguage!=='pt'))unique.set(key,c);
  }
  return [...unique.values()]
    .filter(c=>matchByWords(c.name,c.localizedName,query))
    .sort((a,b)=>nameScore(a,query)-nameScore(b,query)||
      (a.localizedName||a.name).localeCompare((b.localizedName||b.name),'pt-BR',{sensitivity:'base'}))
    .slice(0,26);
}
function refreshSuggestionAria(){
  $('api-search').setAttribute('aria-expanded',String(lastSuggestions.length>0));
}
function showSuggestions(cards,message=''){
  const target=$('api-results');target.replaceChildren();lastSuggestions=cards;
  refreshSuggestionAria();
  if(message)target.append(el('span',message,'search-feedback'));
  for(const c of cards){
    const btn=el('button',undefined,'result-card');btn.type='button';
    btn.title='Selecionar '+(c.localizedName||c.name);
    if(c.image){const img=el('img');img.src=c.image;img.alt='';img.loading='lazy';btn.append(img);}
    const label=c.localizedName||c.name;
    btn.append(el('strong',label),el('small',c.game+(c.localizedName&&foldName(c.localizedName)!==foldName(c.name)?' · '+c.name:'')));
    if(c.set&&c.game==='Pokémon')btn.append(el('small',c.set));
    btn.addEventListener('click',()=>selectSuggestion(c));
    target.append(btn);
  }
}
async function selectSuggestion(c){
  // Descarta respostas antigas. Selecionar uma sugestão não define o idioma da carta física.
  ++suggestVersion;
  if(suggestTimer!==null)clearTimeout(suggestTimer);
  $('card-game').value=c.game;
  updateRarities(c.game,rarities[c.game].includes(c.rarity)?c.rarity:'Rara');
  $('card-name').value=c.localizedName||c.name;
  $('card-set').value=c.set||'';
  $('card-image').value=c.image||'';
  extras={...extras,...Object.fromEntries(Object.entries(c).filter(([k])=>['tcgdexId','tcgdexLanguage','scryfallId','scryfallSet','scryfallNumber','scryfallLanguage'].includes(k)))};
  if(c.game==='Magic'){
    extras.scryfall=c.name; // Nome canônico para consultas futuras.
    try {
      const result=await fetch('https://api.scryfall.com/cards/named?exact='+encodeURIComponent(c.name));
      if(result.ok){
        const data=await result.json();
        $('card-set').value=(data.set_name||data.set||'')+' · '+(data.collector_number||'');
        $('card-image').value=data.image_uris?.normal||data.card_faces?.[0]?.image_uris?.normal||'';
        const rarity=data.set==='sld'?'SLD':({common:'Comum',uncommon:'Incomum',rare:'Rara',mythic:'Mítica'}[data.rarity]||'Rara');
        updateRarities('Magic',rarity);
        extras.scryfallId=data.id||'';extras.scryfallSet=data.set||'';
        extras.scryfallNumber=data.collector_number||'';extras.scryfallLanguage=data.lang||'';
      }
    }catch(_) { /* Dados já escolhidos permanecem editáveis. */ }
  }else if(c.tcgdexId){
    try {
      // Usa o nome localizado oficial do TCGdex quando a mesma carta existe em PT.
      let result=await fetch('https://api.tcgdex.net/v2/pt/cards/'+encodeURIComponent(c.tcgdexId));
      if(!result.ok)result=await fetch('https://api.tcgdex.net/v2/'+(c.tcgdexLanguage||'en')+'/cards/'+encodeURIComponent(c.tcgdexId));
      if(result.ok){
        const d=await result.json();
        $('card-name').value=d.name||c.name;
        $('card-set').value=[d.set?.name||'',d.localId||''].filter(Boolean).join(' · ')||c.set;
        const rarity=rarityFromTCGdex(d.rarity);
        updateRarities('Pokémon',rarities.Pokémon.includes(rarity)?rarity:'Rara');
        if(d.image)$('card-image').value=d.image+'/high.webp';
      }
    }catch(_){ /* Manter os campos escolhidos. */ }
  }
  showSuggestions([],'Carta selecionada. Confira edição, idioma e conservação antes de salvar.');
}
async function searchAllGames(query,version){
  const tasks=[searchPokemonLocale(query,'pt'),searchPokemonLocale(query,'en'),searchMagicEnglish(query),searchMagicPortuguese(query)];
  const results=await Promise.allSettled(tasks);
  if(version!==suggestVersion||!$('card-dialog').open||$('api-search').value.trim()!==query)return;
  const groups=[];const errors=[];let translationStatus='';
  results.forEach((result,index)=>{
    if(result.status==='fulfilled'){
      if(index===3){translationStatus=result.value.status;groups.push(result.value.items);}
      else groups.push(result.value);
    }else errors.push(result.reason.message);
  });
  const cards=mergeSuggestions(query,groups);
  const notice=translationStatus==='preparando'?'Preparando nomes de Magic em português pela primeira vez; as sugestões em inglês e Pokémon já funcionam.':
    (!cards.length?'Nenhuma carta encontrada. Experimente outra palavra do nome.':'');
  showSuggestions(cards,notice||(!cards.length&&errors.length?errors[0]:'') );
  if(translationStatus==='preparando'){
    setTimeout(async()=>{
      if(version!==suggestVersion||!$('card-dialog').open||$('api-search').value.trim()!==query)return;
      try {
        const pt=await searchMagicPortuguese(query);
        if(pt.status==='pronto'){
          showSuggestions(mergeSuggestions(query,[cards,pt.items]));
        }else if(pt.status==='preparando'){
          // Nova consulta sem repetir chamadas às APIs externas.
          const timerVersion=suggestVersion;
          setTimeout(async()=>{
            if(timerVersion!==suggestVersion||!$('card-dialog').open)return;
            try{const fresh=await searchMagicPortuguese(query);if(timerVersion===suggestVersion&&fresh.status==='pronto')showSuggestions(mergeSuggestions(query,[cards,fresh.items]));}catch(_){}
          },5500);
        }
      }catch(_){}
    },5500);
  }
}
function queueSuggestions(immediate=false){
  if(suggestTimer!==null){clearTimeout(suggestTimer);suggestTimer=null;}
  const version=++suggestVersion;
  const query=$('api-search').value.trim();
  if(query.length<2){showSuggestions([]);return;}
  if(immediate){searchAllGames(query,version);return;}
  suggestTimer=setTimeout(()=>{
    suggestTimer=null;
    if(version!==suggestVersion)return;
    showSuggestions([],'Buscando sugestões...');
    searchAllGames(query,version);
  },480);
}
$('api-search').addEventListener('input',()=>queueSuggestions());
$('api-search').addEventListener('keydown',event=>{
  if(event.key==='Escape'){++suggestVersion;showSuggestions([]);return;}
  if(event.key==='ArrowDown'){
    const first=$('api-results').querySelector('button');
    if(first){event.preventDefault();first.focus();}
  }
  if(event.key==='Enter'){event.preventDefault();queueSuggestions(true);}
});
$('api-results').addEventListener('keydown',event=>{
  const buttons=[...$('api-results').querySelectorAll('button')];
  const index=buttons.indexOf(document.activeElement);
  if(event.key==='ArrowDown'&&index>=0){event.preventDefault();buttons[Math.min(index+1,buttons.length-1)]?.focus();}
  if(event.key==='ArrowUp'&&index>=0){event.preventDefault();if(index===0)$('api-search').focus();else buttons[index-1]?.focus();}
});
$('api-search-btn').addEventListener('click',()=>queueSuggestions(true));
setInterval(()=>{if(signed)api('status').then(renderStatus).catch(()=>{});},30000);
start();