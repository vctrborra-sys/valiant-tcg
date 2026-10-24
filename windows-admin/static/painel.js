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
function updateRarities(chosenGame,chosenRarity) {
  const select=$('card-rarity');select.replaceChildren();
  for (const game of allGames) {
    const group=document.createElement('optgroup');group.label=game;
    for (const rarity of rarities[game]) {
      const opt=el('option',rarity);opt.value=rarityOptionValue(game,rarity);group.append(opt);
    }
    select.append(group);
  }
  const chosen=chosenGame||$('card-game').value||'Pokémon';
  select.value=rarityOptionValue(chosen,chosenRarity||rarities[chosen]?.[0]||'Comum');
  syncGameFromRarity();
}
function syncGameFromRarity(){
  const game=($('card-rarity').value||'').split('::')[0];
  if(game)$('card-game').value=game;
}
$('card-rarity').addEventListener('change',syncGameFromRarity);
$('new-card').addEventListener('click',()=>openForm());
function openForm(card=null){editId=card?.id||null;extras=card?Object.fromEntries(['tcgdexId','tcgdexLanguage','scryfall','scryfallId','scryfallSet','scryfallNumber','scryfallLanguage'].map(k=>[k,card[k]||''])):{};$('dialog-title').textContent=card?'Editar carta':'Cadastrar carta';$('card-game').value=card?.game||'Pokémon';updateRarities(card?.game||'Pokémon',card?.rarity||'Comum');for(const [k,v] of Object.entries({name:card?.name||'',set:card?.set||'',condition:card?.condition||'NM',price:card?.price??0,quantity:card?.quantity??1,image:card?.image||'',description:card?.description||'',language:card?.language||''}))$('card-'+k).value=v;$('card-published').checked=card?.published!==false;$('api-search').value='';cancelPendingSuggestions();$('api-results').replaceChildren();$('card-dialog').showModal();}
for(const b of ['cancel-x','cancel-form'])$(b).addEventListener('click',()=>$('card-dialog').close());
$('card-form').addEventListener('submit',async e=>{e.preventDefault();syncGameFromRarity();const [game,rarity]=($('card-rarity').value||'').split('::');const obj={...extras,game:game||$('card-game').value||'Pokémon',name:$('card-name').value,set:$('card-set').value,rarity:rarity||'Comum',condition:$('card-condition').value,price:Number($('card-price').value),quantity:Number($('card-quantity').value),image:$('card-image').value,description:$('card-description').value,language:$('card-language').value.trim(),published:$('card-published').checked};try{await api(editId?'cards/'+encodeURIComponent(editId):'cards',editId?'PUT':'POST',obj);$('card-dialog').close();msg('Carta salva! Sincronização automática em andamento.');await refresh();}catch(err){alert(err.message);}});
async function removeCard(c){if(!confirm('Excluir '+labelFor(c)+'? A exclusão será registrada no histórico.'))return;try{await api('cards/'+encodeURIComponent(c.id),'DELETE');msg('Carta excluída.');await refresh();}catch(e){alert(e.message);}}
function changes(a,b){if(!a)return 'Cadastro inicial';if(!b)return 'Exclusão';const labels={name:'Nome',set:'Edição',rarity:'Raridade',price:'Preço',quantity:'Quantidade',condition:'Conservação',language:'Idioma',published:'Visibilidade',image:'Imagem',description:'Descrição',game:'Jogo'};return Object.keys(labels).filter(k=>JSON.stringify(a[k])!==JSON.stringify(b[k])).map(k=>labels[k]+': '+String(a[k]??'')+' → '+String(b[k]??'')).join(' • ')||'Registro salvo sem alteração de valores';}
function renderHistory(){const target=$('audit-list');target.replaceChildren();for(const row of history){const div=el('div',undefined,'entry');div.append(el('strong',row.username+' — '+row.action+' — '+row.card_name));div.append(el('small',new Date(row.timestamp).toLocaleString('pt-BR')));div.append(el('div',changes(row.before,row.after),'diff'));target.append(div);}if(!history.length)target.append(el('p','Nenhuma alteração registrada.'));}
function renderUsers(){const target=$('users-list');target.replaceChildren();for(const u of users){const box=el('div',undefined,'userbox');box.append(el('strong',u.username),el('small',u.role==='proprietario'?'Proprietário':'Editor'),el('small','Criado em '+new Date(u.created_at).toLocaleDateString('pt-BR')));target.append(box);}}
$('user-form').addEventListener('submit',async e=>{e.preventDefault();try{await api('users','POST',{username:$('new-username').value,password:$('new-userpass').value,role:$('new-role').value});$('user-form').reset();msg('Usuário criado.');await refresh();}catch(err){alert(err.message);}});
$('password-form').addEventListener('submit',async e=>{e.preventDefault();try{await api('password','POST',{oldPassword:$('old-password').value,newPassword:$('new-password').value});$('password-form').reset();msg('Senha atualizada.');}catch(err){alert(err.message);}});
function rarityFromTCGdex(x){const m={'Common':'Comum','Uncommon':'Incomum','Rare':'Rara','Rare Holo':'Rara','Double Rare':'Rara Dupla','Ultra Rare':'Ultra Rara','Illustration Rare':'Ilustração Rara','Special Illustration Rare':'Ilustração Rara Especial','Hyper Rare':'Rara Hiper','ACE SPEC Rare':'ACE SPEC'};return m[x]||x||'Rara';}
async function searchPokemon(q) {
  const res=await fetch('https://api.tcgdex.net/v2/pt/cards?name='+encodeURIComponent(q));
  if(!res.ok)throw Error('Falha ao pesquisar Pokémon no TCGdex.');
  const items=await res.json();
  return items.slice(0,12).map(c=>({game:'Pokémon',name:c.name,set:c.id||'',image:c.image?c.image+'/high.webp':'',rarity:'Rara',tcgdexId:c.id,tcgdexLanguage:'pt'}));
}
async function searchMagic(q) {
  let res=await fetch('https://api.scryfall.com/cards/search?q='+encodeURIComponent('!"'+q+'"')+'&unique=prints&order=released&dir=desc');
  if(!res.ok)res=await fetch('https://api.scryfall.com/cards/search?q='+encodeURIComponent(q)+'&unique=prints');
  if(!res.ok)throw Error('Falha ao pesquisar Magic no Scryfall.');
  const data=await res.json();
  return (data.data||[]).slice(0,12).map(c=>({
    game:'Magic',name:c.name,set:(c.set_name||c.set)+' · '+(c.collector_number||''),
    image:c.image_uris?.normal||c.card_faces?.[0]?.image_uris?.normal||'',
    rarity:c.set==='sld'?'SLD':({common:'Comum',uncommon:'Incomum',rare:'Rara',mythic:'Mítica'}[c.rarity]||'Rara'),
    scryfallId:c.id,scryfallSet:c.set,scryfallNumber:c.collector_number,scryfallLanguage:c.lang
  }));
}
async function searchAllGames(q) {
  const results=await Promise.allSettled([searchPokemon(q),searchMagic(q)]);
  const found=[];
  const failures=[];
  for(const result of results) {
    if(result.status==='fulfilled')found.push(...result.value);
    else failures.push(result.reason.message);
  }
  if(!found.length)throw Error(failures.join(' / ')||'Nenhum resultado encontrado.');
  found.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'pt-BR',{sensitivity:'base'}));
  return found;
}
// Sugestões enquanto digita, com espera curta para evitar pesquisas a cada tecla.
let searchDebounce=null;
let searchRequest=0;
function cancelPendingSuggestions() {
  if(searchDebounce!==null)clearTimeout(searchDebounce);
  searchDebounce=null;
  searchRequest++;
}
function renderUnifiedResults(found) {
  const target=$('api-results');
  target.replaceChildren();
  for(const c of found) {
    const btn=el('button',undefined,'result-card');
    btn.type='button';
    btn.title='Selecionar '+c.name+' ('+c.game+')';
    if(c.image) {
      const img=el('img');img.src=c.image;img.alt='';img.loading='lazy';btn.append(img);
    }
    btn.append(el('strong',c.name),el('small',c.game+' · '+c.set));
    btn.addEventListener('click',async()=>{
      cancelPendingSuggestions();
      $('card-game').value=c.game;
      updateRarities(c.game,c.rarity);
      $('card-name').value=c.name;
      $('card-set').value=c.set;
      $('card-image').value=c.image||'';
      extras={...extras,...Object.fromEntries(Object.entries(c).filter(([k])=>['tcgdexId','tcgdexLanguage','scryfallId','scryfallSet','scryfallNumber','scryfallLanguage'].includes(k)))};
      // O idioma físico da carta continua a ser preenchido manualmente.
      if(c.game==='Pokémon'&&c.tcgdexId) {
        try {
          const response=await fetch('https://api.tcgdex.net/v2/pt/cards/'+encodeURIComponent(c.tcgdexId));
          if(response.ok) {
            const d=await response.json();
            $('card-name').value=d.name||c.name;
            $('card-set').value=[d.set?.name||'',d.localId||''].filter(Boolean).join(' · ')||c.set;
            const normalized=rarityFromTCGdex(d.rarity);
            if(rarities.Pokémon.includes(normalized))updateRarities('Pokémon',normalized);
            if(d.image)$('card-image').value=d.image+'/high.webp';
          }
        }catch(err){/* Mantém os dados já escolhidos. */}
      }
    });
    target.append(btn);
  }
}
async function performSearch(query,requestId) {
  const target=$('api-results');
  target.replaceChildren(el('span','Buscando sugestões de Pokémon e Magic...','search-feedback'));
  try {
    const found=await searchAllGames(query);
    if(requestId!==searchRequest||!$('card-dialog').open||$('api-search').value.trim()!==query)return;
    renderUnifiedResults(found);
  }catch(err) {
    if(requestId!==searchRequest||!$('card-dialog').open)return;
    target.replaceChildren(el('span',err.message+' Você também pode cadastrar manualmente.','search-feedback'));
  }
}
function scheduleSearchSuggestions() {
  cancelPendingSuggestions();
  const query=$('api-search').value.trim();
  if(query.length<3) {
    $('api-results').replaceChildren();
    return;
  }
  const id=searchRequest;
  searchDebounce=setTimeout(()=>{searchDebounce=null;performSearch(query,id);},650);
}
$('api-search').addEventListener('input',scheduleSearchSuggestions);
$('api-search').addEventListener('keydown',e=>{
  if(e.key==='Enter'){e.preventDefault();$('api-search-btn').click();}
});
$('api-search-btn').addEventListener('click',()=>{
  cancelPendingSuggestions();
  const query=$('api-search').value.trim();
  if(query.length<2){alert('Informe pelo menos duas letras.');return;}
  performSearch(query,searchRequest);
});
document.querySelectorAll('[data-search-suggestion]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    $('api-search').value=btn.dataset.searchSuggestion;
    $('api-search-btn').click();
  });
});
setInterval(()=>{if(signed)api('status').then(renderStatus).catch(()=>{});},30000);
start();
