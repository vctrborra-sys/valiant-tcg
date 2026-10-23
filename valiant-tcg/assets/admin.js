(function () {
  'use strict';
  const store=window.ValiantCatalog;
  let cards=store.get().items;
  let editingId=null;
  const $=id=>document.getElementById(id);
  const esc=store.safeText;
  const money=store.money;
  const rows=$('rows');
  const dlg=$('editor');
  const form=$('cardForm');
  let toastTimer;
  function setRarityOptions(game, selected=''){
    const control=$('cardRarity');
    control.replaceChildren(new Option('Selecione a raridade',''),...store.RARITIES[game].map(value=>new Option(value,value)));
    // Preserva a raridade importada de um backup antigo sem incluí-la nas novas opções.
    if(selected && selected!=='Não informada' && !store.RARITIES[game].includes(selected)){
      control.add(new Option(selected+' (registro antigo)',selected));
    }
    control.value=selected==='Não informada'?'':selected;
  }
  $('cardGame').addEventListener('change',()=>{
    const selected=$('cardRarity').value;
    const game=$('cardGame').value;
    setRarityOptions(game,store.RARITIES[game].includes(selected)?selected:'');
  });

  function notify(msg){const el=$('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),4500);}
  function id(){return 'v-'+(typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2));}
  function persist(message){
    try {cards=store.save(cards).items;render();notify(message || 'Alterações salvas neste navegador. Exporte para publicar.');return true;}
    catch {notify('Não foi possível salvar. Verifique permissões de armazenamento do navegador.');return false;}
  }
  function displayStatus(c){return c.demo?'<span class="status demo">Ilustrativo</span>':!c.published?'<span class="status draft">Oculto</span>':c.quantity===0?'<span class="status draft">Esgotado</span>':'<span class="status">Publicado</span>';}
  function render(){
    const q=$('filterSearch').value.toLocaleLowerCase('pt-BR').trim();
    const game=$('filterGame').value;
    const cond=$('filterCondition').value;
    const visible=cards.filter(c=>(game==='all'||c.game===game)&&(cond==='all'||c.condition===cond)&&((c.name+' '+c.set+' '+c.rarity).toLocaleLowerCase('pt-BR').includes(q)));
    rows.innerHTML=visible.length?visible.map(c=>{
      const img=store.url(c.image)||'assets/foto-valiant.png';
      return `<tr><td><div class="item-name"><img class="thumb" src="${esc(img)}" loading="lazy" alt=""><div><strong>${esc(c.name)}</strong><small>${esc(c.set)}</small></div></div></td><td>${c.game==='Magic'?'Magic':'Pokémon'}</td><td>${c.condition?`<span class="condition">${esc(c.condition)}</span>`:'—'}</td><td><b>${c.demo?'—':esc(money(c.price))}</b></td><td>${c.demo?'—':c.quantity}</td><td>${displayStatus(c)}</td><td><div class="row-actions"><button type="button" data-action="edit" data-id="${esc(c.id)}">Editar</button><button type="button" data-action="duplicate" data-id="${esc(c.id)}">Duplicar</button><button type="button" class="delete" data-action="delete" data-id="${esc(c.id)}">Excluir</button></div></td></tr>`;
    }).join(''):'<tr><td colspan="7"><div class="empty">Nenhuma carta encontrada. Use “Nova carta” para adicionar um item.</div></td></tr>';
    rows.querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{img.src='assets/foto-valiant.png';},{once:true}));
    $('rowCount').textContent=`${visible.length} de ${cards.length} registros`;
    $('statTotal').textContent=cards.length;
    $('statActive').textContent=cards.filter(c=>!c.demo&&c.published&&c.quantity>0).length;
    $('statQty').textContent=cards.filter(c=>!c.demo).reduce((sum,c)=>sum+c.quantity,0).toLocaleString('pt-BR');
    $('statValue').textContent=money(cards.filter(c=>!c.demo).reduce((sum,c)=>sum+c.quantity*(c.price||0),0));
  }
  function edit(item, preset){
    item = item || preset || null;
    form.reset();
    $('formError').textContent='';
    editingId=item?.id||null;
    form.dataset.tcgdexId=item?.tcgdexId||'';
    form.dataset.tcgdexLanguage=item?.tcgdexLanguage||'';
    form.dataset.scryfallId=item?.scryfallId||'';
    form.dataset.scryfallSet=item?.scryfallSet||'';
    form.dataset.scryfallNumber=item?.scryfallNumber||'';
    form.dataset.scryfallLanguage=item?.scryfallLanguage||'';
    $('editorTitle').textContent=editingId?'Editar carta':'Cadastrar nova carta';
    $('cardGame').value=item?.game||'Pokémon';
    $('cardName').value=item?.name||'';
    $('cardSet').value=item?.set||'';
    setRarityOptions($('cardGame').value,item?.rarity||'');
    $('cardCondition').value=item?.condition||'';
    $('cardPrice').value=item?.price ?? '';
    $('cardQty').value=item?.quantity ?? 1;
    $('cardImage').value=item?.image||'';
    $('cardDesc').value=item?.description||'';
    $('cardPublished').checked=item?.published!==false;
    $('cardDemo').checked=item?.demo===true;
    dlg.showModal();
    $('cardName').focus();
  }
  function close(){dlg.close();editingId=null;}
  function saveForm(ev){
    ev.preventDefault();
    const demo=$('cardDemo').checked;
    const rawPrice=$('cardPrice').value.trim();
    const price=rawPrice===''?null:Number(rawPrice);
    const qty=Number($('cardQty').value);
    const name=$('cardName').value.trim();
    const condition=$('cardCondition').value;
    const image=$('cardImage').value.trim();
    let error='';
    if(!name)error='Informe o nome da carta.';
    else if($('cardRarity').value && !store.RARITIES[$('cardGame').value].includes($('cardRarity').value) && $('cardRarity').value !== (cards.find(c=>c.id===editingId)?.rarity||''))error='Escolha uma raridade válida para o jogo selecionado.';
    else if(!demo&&!store.CONDITIONS.includes(condition))error='Selecione a conservação: NM, SP, MP, HP ou D.';
    else if(price!==null&&(!Number.isFinite(price)||price<0))error='Informe um preço válido, a partir de R$ 0,00.';
    else if(!Number.isInteger(qty)||qty<0||qty>999999)error='A quantidade deve ser um número inteiro de 0 a 999999.';
    else if(image&&!store.url(image))error='A imagem precisa ser uma URL HTTPS (ou caminho assets/...).';
    if(error){$('formError').textContent=error;return;}
    const existing=cards.find(x=>x.id===editingId);
    const raw={
      id:editingId||id(), game:$('cardGame').value,name,
      set:$('cardSet').value,rarity:$('cardRarity').value||'Não informada',
      condition,price,quantity:qty,published:$('cardPublished').checked,demo,
      image,description:$('cardDesc').value,
      tcgdexId:$('cardGame').value==='Pokémon'?form.dataset.tcgdexId:'',
      tcgdexLanguage:$('cardGame').value==='Pokémon'?form.dataset.tcgdexLanguage:'',
      scryfall:!image&&$('cardGame').value==='Magic'?name:'',
      scryfallId:$('cardGame').value==='Magic'?form.dataset.scryfallId:'',
      scryfallSet:$('cardGame').value==='Magic'?form.dataset.scryfallSet:'',
      scryfallNumber:$('cardGame').value==='Magic'?form.dataset.scryfallNumber:'',
      scryfallLanguage:$('cardGame').value==='Magic'?form.dataset.scryfallLanguage:''
    };
    const normalized=store.normalize(raw);
    if(!normalized){$('formError').textContent='Confira o nome da carta.';return;}
    if(existing)cards=cards.map(c=>c.id===editingId?normalized:c);
    else cards.unshift(normalized);
    if(persist('Carta salva. Para atualizar a vitrine pública, exporte o catálogo.'))close();
  }
  rows.addEventListener('click',ev=>{
    const button=ev.target.closest('button[data-action]');
    if(!button)return;
    const item=cards.find(c=>c.id===button.dataset.id);if(!item)return;
    switch(button.dataset.action){
      case 'edit':edit(item);break;
      case 'duplicate':edit({...item,id:null,condition:'',price:null,quantity:0,demo:false,published:false});break;
      case 'delete':if(confirm(`Excluir “${item.name}” (${item.condition||'sem estado'}) do catálogo local?`)){cards=cards.filter(c=>c.id!==item.id);persist('Registro excluído do catálogo local.');}break;
    }
  });
  ['filterSearch','filterGame','filterCondition'].forEach(x=>$(x).addEventListener('input',render));
  $('addTop').addEventListener('click',()=>edit(null));
  $('closeEditor').addEventListener('click',close);
  $('cancelEditor').addEventListener('click',close);
  form.addEventListener('submit',saveForm);
  function download(name,content,mime){
    const blob=new Blob([content],{type:mime});
    const href=URL.createObjectURL(blob);
    const link=document.createElement('a');link.href=href;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(href),6000);
  }
  function packaged(){return {version:1,updatedAt:new Date().toISOString(),items:store.normalizeCatalog({items:cards}).items};}
  $('exportBtn').addEventListener('click',()=>{
    const doc=packaged();
    // Use JS data file so the public site works without a web server, too.
    const serialized=JSON.stringify(doc,null,2).replace(/</g,'\\u003c');
    download('catalogo.js','/* Catálogo Valiant TCG exportado do painel */\nwindow.VALIANT_CATALOG = '+serialized+';\n','text/javascript;charset=utf-8');
    notify('catalogo.js exportado. Substitua assets/catalogo.js no site para publicar.');
  });
  $('backupBtn').addEventListener('click',()=>{download('valiant-tcg-backup.json',JSON.stringify(packaged(),null,2),'application/json;charset=utf-8');notify('Backup JSON baixado. Guarde uma cópia segura.');});
  $('importBtn').addEventListener('click',()=>$('importInput').click());
  $('importInput').addEventListener('change',async ev=>{
    const file=ev.target.files?.[0];if(!file)return;
    try{
      if(file.size>8*1024*1024)throw Error('O arquivo é muito grande (limite: 8 MB).');
      const raw=JSON.parse(await file.text());
      if(!raw||(!Array.isArray(raw)&&!Array.isArray(raw.items)))throw Error('Formato inválido: esperado um catálogo com lista "items".');
      const catalog=store.normalizeCatalog(raw);
      if(raw.items?.length&&catalog.items.length===0)throw Error('Nenhum registro válido encontrado.');
      if(!confirm(`Importar ${catalog.items.length} registro(s)? Isso substituirá seus dados locais atuais.`))return;
      cards=catalog.items;persist('Backup JSON importado com sucesso. Exporte para publicar.');
    }catch(err){notify('Falha na importação: '+err.message);}finally{ev.target.value='';}
  });
  $('resetBtn').addEventListener('click',()=>{
    if(!confirm('Descartar as edições locais e voltar ao catálogo do arquivo assets/catalogo.js? Essa ação não pode ser desfeita.'))return;
    try{store.clear();cards=store.bundled().items;render();notify('Catálogo local restaurado para a versão publicada.');}
    catch{notify('Não foi possível limpar os dados locais.');}
  });
  // O seletor TCGdex usa este método para abrir o cadastro já preenchido.
  window.ValiantAdmin = Object.freeze({
    prefillPokemon(data){edit(null,{...data,game:'Pokémon',condition:'',price:null,quantity:0,published:false,demo:false});},
    prefillMagic(data){edit(null,{...data,game:'Magic',condition:'',price:null,quantity:0,published:false,demo:false,description:''});}
  });
  window.addEventListener('storage',ev=>{if(ev.key===store.KEY){cards=store.get().items;render();}});
  render();
})();
