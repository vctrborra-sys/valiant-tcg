"""Valiant TCG: administração local e publicação automática no GitHub Pages.
Não hospede este app no Pages nem habilite acesso público à porta local.
"""
from __future__ import annotations
import base64
from datetime import datetime, timezone
import getpass
import json
import logging
import os
from pathlib import Path
import re
import secrets
import sqlite3
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import uuid4

from flask import Flask, abort, jsonify, redirect, render_template, request, session
from werkzeug.security import check_password_hash, generate_password_hash

from nomes_pt import suggest_names as query_portuguese_names

BASE = Path(__file__).resolve().parent
DATA = BASE / 'dados'
DATA.mkdir(exist_ok=True)
DB_PATH = Path(os.environ.get('VALIANT_DB', str(DATA / 'valiant.sqlite3')))
KEY_PATH = DATA / '.chave-sessao'
REPO = 'vctrborra-sys/valiant-tcg'
BRANCH = 'main'
GITHUB_FILE = 'assets/catalogo.js'
KEYRING_SERVICE = 'ValiantTCG-Windows'
KEYRING_NAME = 'github-token'
RARITIES = {
    'Pokémon': ['Comum','Incomum','Rara','Rara Dupla','Ultra Rara','Ilustração Rara','Ilustração Rara Especial','Rara Hiper','ACE SPEC'],
    'Magic': ['Comum','Incomum','Rara','Mítica','SLD']
}
CONDITIONS = ['NM', 'SP', 'MP', 'HP', 'D']
FIELDS = ['id','game','name','set','rarity','condition','language','price','quantity','published','demo','image',
          'tcgdexId','tcgdexLanguage','scryfall','scryfallId','scryfallSet','scryfallNumber','scryfallLanguage','description']
LOGGER = logging.getLogger('valiant')
PUBLISH_LOCK = threading.Lock()
WAKE = threading.Event()
FAILED = {}


def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


class ManagedConnection(sqlite3.Connection):
    def __exit__(self, exc_type, exc_value, traceback):
        try:
            return super().__exit__(exc_type, exc_value, traceback)
        finally:
            self.close()


def db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=10, factory=ManagedConnection)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys=ON')
    conn.execute('PRAGMA busy_timeout=10000')
    return conn


def initialize_db():
    with db() as c:
        c.executescript('''
          CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL COLLATE NOCASE UNIQUE,
            pw_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('proprietario','editor')),
            created_at TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS cards (
            id TEXT PRIMARY KEY,
            data_json TEXT NOT NULL,
            author_id INTEGER REFERENCES users(id),
            editor_id INTEGER REFERENCES users(id),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS audit (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            card_id TEXT,
            card_name TEXT NOT NULL,
            user_id INTEGER NOT NULL REFERENCES users(id),
            action TEXT NOT NULL,
            before_json TEXT,
            after_json TEXT,
            timestamp TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        ''')
        c.execute("INSERT OR IGNORE INTO metadata VALUES ('revision','0')")
        c.execute("INSERT OR IGNORE INTO metadata VALUES ('dirty','0')")
        c.execute("INSERT OR IGNORE INTO metadata VALUES ('last_publish','')")
        c.execute("INSERT OR IGNORE INTO metadata VALUES ('last_error','')")


def secret_key():
    if KEY_PATH.exists():
        return KEY_PATH.read_bytes()
    secret = secrets.token_bytes(48)
    with KEY_PATH.open('xb') as f:
        f.write(secret)
    return secret

app = Flask(__name__, template_folder=str(BASE / 'templates'))
app.secret_key = secret_key()
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE='Strict',
    SESSION_COOKIE_SECURE=False,  # Apenas HTTP em 127.0.0.1; não expor na Internet
    PERMANENT_SESSION_LIFETIME=60 * 60 * 8,
    MAX_CONTENT_LENGTH=100 * 1024,
)
initialize_db()


def current_user(c):
    user_id = session.get('user_id')
    if not user_id:
        return None
    return c.execute('SELECT id,username,role FROM users WHERE id=?', (user_id,)).fetchone()


def require_user(c):
    u = current_user(c)
    if not u:
        abort(401)
    return u


def require_owner(c):
    u = require_user(c)
    if u['role'] != 'proprietario':
        abort(403)
    return u


@app.before_request
def check_csrf():
    if 'csrf' not in session:
        session['csrf'] = secrets.token_urlsafe(32)
    if request.method in ('POST','PUT','PATCH','DELETE'):
        sent = request.headers.get('X-CSRF-Token','')
        if not secrets.compare_digest(sent, session['csrf']):
            abort(403, 'Token de proteção inválido. Atualize a página.')


@app.after_request
def secure_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Referrer-Policy'] = 'no-referrer'
    response.headers['Cache-Control'] = 'no-store'
    response.headers['Content-Security-Policy'] = (
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
        "img-src 'self' https: data:; connect-src 'self' https://api.tcgdex.net "
        "https://api.scryfall.com; form-action 'self'; frame-ancestors 'none'"
    )
    return response


@app.errorhandler(401)
@app.errorhandler(403)
@app.errorhandler(404)
@app.errorhandler(400)
def api_errors(e):
    if request.path.startswith('/api/'):
        return jsonify(error=e.description), e.code
    return f'Erro {e.code}: {e.description}', e.code


@app.route('/')
def home():
    return render_template('admin.html', csrf=session['csrf'])


@app.get('/api/session')
def session_info():
    with db() as c:
        user = current_user(c)
        count = c.execute('SELECT COUNT(*) AS n FROM users').fetchone()['n']
        return jsonify(user=dict(user) if user else None, initialized=count>0)


@app.post('/api/login')
def login():
    payload = request.get_json(silent=True) or {}
    username = str(payload.get('username','')).strip()
    password = str(payload.get('password',''))
    key = (username.casefold(), request.remote_addr)
    attempts, until = FAILED.get(key,(0,0))
    if until > time.time():
        return jsonify(error='Muitas tentativas. Aguarde 15 minutos.'), 429
    with db() as c:
        u = c.execute('SELECT * FROM users WHERE username=?', (username,)).fetchone()
        if not u or not check_password_hash(u['pw_hash'], password):
            attempts += 1
            FAILED[key] = (attempts, time.time()+900 if attempts>=5 else 0)
            return jsonify(error='Usuário ou senha incorretos.'), 401
        FAILED.pop(key,None)
        session.clear()
        session['user_id'] = u['id']
        session['csrf'] = secrets.token_urlsafe(32)
        session.permanent = True
        return jsonify(user={'username':u['username'], 'role':u['role']},csrf=session['csrf'])


@app.post('/api/logout')
def logout():
    session.clear()
    return jsonify(ok=True)


@app.get('/api/search/nomes-pt')
def search_portuguese_names():
    with db() as c:
        require_user(c)
    query=str(request.args.get('q',''))[:90]
    if len(query.strip())<2:
        return jsonify(items=[],status='idle')
    return jsonify(query_portuguese_names(DATA, query))


@app.get('/api/cards')
def list_cards():
    with db() as c:
        require_user(c)
        rows = c.execute('''SELECT cards.*, u.username AS author, e.username AS editor
            FROM cards LEFT JOIN users u ON u.id=cards.author_id
            LEFT JOIN users e ON e.id=cards.editor_id ORDER BY cards.updated_at DESC''').fetchall()
        return jsonify(items=[{**json.loads(r['data_json']), 'author':r['author'], 'editor':r['editor'],
            'createdAt':r['created_at'],'updatedAt':r['updated_at']} for r in rows])


def normalize_card(data, card_id):
    if not isinstance(data,dict):
        abort(400, 'Dados inválidos.')
    game = data.get('game')
    if game not in RARITIES:
        abort(400,'Jogo inválido.')
    def st(k,n=500):
        return str(data.get(k,'') or '').strip()[:n]
    name = st('name',120)
    if not name:
        abort(400, 'Informe o nome da carta.')
    rarity = st('rarity',80)
    if rarity == 'Ultra Raras' and game=='Pokémon': rarity='Ultra Rara'
    if rarity not in RARITIES[game]:
        abort(400, 'Raridade inválida.')
    condition = st('condition',10)
    if condition not in CONDITIONS:
        abort(400,'Conservação inválida.')
    try:
        price = round(float(data.get('price',0)), 2)
        qty_raw = data.get('quantity',0)
        qty = int(qty_raw)
        if isinstance(qty_raw,float) and qty != qty_raw: raise ValueError()
    except (TypeError, ValueError, OverflowError):
        abort(400,'Preço ou quantidade inválidos.')
    if not 0 <= price <= 100_000_000 or not 0 <= qty <= 1_000_000:
        abort(400, 'Preço ou quantidade fora do limite.')
    language = st('language',60)
    if not language:
        abort(400, 'Informe o idioma real da carta (ex.: Português, Inglês ou Japonês).')
    image = st('image',800)
    if image and not (image.startswith('https://') or re.fullmatch(r'assets/[\w.\-/%]+',image)):
        abort(400, 'A imagem deve usar HTTPS ou uma imagem local válida.')
    obj = {k:st(k, 1200 if k=='description' else 140) for k in (
        'tcgdexId','tcgdexLanguage','scryfall','scryfallId','scryfallSet','scryfallNumber','scryfallLanguage','description')}
    return {
        'id':card_id, 'game':game,'name':name,'set':st('set',140),'rarity':rarity,
        'condition':condition,'language':language,'price':price,'quantity':qty,
        'published':data.get('published') is not False,'demo':False, 'image':image, **obj
    }


def audit(c, card_id, name, uid, action, before=None, after=None):
    c.execute('INSERT INTO audit (card_id,card_name,user_id,action,before_json,after_json,timestamp) VALUES (?,?,?,?,?,?,?)',(
        card_id,name,uid,action,json.dumps(before,ensure_ascii=False) if before else None,
        json.dumps(after,ensure_ascii=False) if after else None,now()))


def dirty(c):
    c.execute("UPDATE metadata SET value='1' WHERE key='dirty'")
    c.execute("UPDATE metadata SET value=CAST(value AS INTEGER)+1 WHERE key='revision'")


@app.post('/api/cards')
def add_card():
    data=request.get_json(silent=True) or {}
    with db() as c:
        u = require_user(c)
        cid='v-'+str(uuid4())
        card=normalize_card(data,cid)
        stamp=now()
        c.execute('INSERT INTO cards VALUES (?,?,?,?,?,?)',(cid,json.dumps(card,ensure_ascii=False),u['id'],u['id'],stamp,stamp))
        audit(c,cid,card['name'],u['id'],'cadastro',None,card)
        dirty(c)
    WAKE.set()
    return jsonify(item=card),201


@app.put('/api/cards/<cid>')
def edit_card(cid):
    data=request.get_json(silent=True) or {}
    with db() as c:
        u=require_user(c)
        row=c.execute('SELECT * FROM cards WHERE id=?',(cid,)).fetchone()
        if not row: abort(404,'Carta não encontrada.')
        before=json.loads(row['data_json'])
        card=normalize_card(data,cid)
        c.execute('UPDATE cards SET data_json=?,editor_id=?,updated_at=? WHERE id=?',
                  (json.dumps(card,ensure_ascii=False),u['id'],now(),cid))
        audit(c,cid,card['name'],u['id'],'edição',before,card)
        dirty(c)
    WAKE.set()
    return jsonify(item=card)


@app.delete('/api/cards/<cid>')
def delete_card(cid):
    with db() as c:
        u=require_user(c)
        row=c.execute('SELECT data_json FROM cards WHERE id=?',(cid,)).fetchone()
        if not row: abort(404,'Carta não encontrada.')
        before=json.loads(row['data_json'])
        audit(c,cid,before['name'],u['id'],'exclusão',before,None)
        c.execute('DELETE FROM cards WHERE id=?',(cid,))
        dirty(c)
    WAKE.set()
    return jsonify(ok=True)


@app.get('/api/history')
def history():
    with db() as c:
        require_user(c)
        rows=c.execute('''SELECT a.id,a.card_id,a.card_name,a.action,a.before_json,a.after_json,a.timestamp,
                          u.username AS username FROM audit a JOIN users u ON u.id=a.user_id
                          ORDER BY a.id DESC LIMIT 1000''').fetchall()
        return jsonify(items=[{**{k:r[k] for k in ('id','card_id','card_name','action','timestamp','username')},
                               'before':json.loads(r['before_json']) if r['before_json'] else None,
                               'after':json.loads(r['after_json']) if r['after_json'] else None} for r in rows])


@app.get('/api/users')
def list_users():
    with db() as c:
        require_user(c)
        return jsonify(items=[dict(x) for x in c.execute('SELECT id,username,role,created_at FROM users ORDER BY id')])


@app.post('/api/users')
def add_user():
    data=request.get_json(silent=True) or {}
    username=str(data.get('username','')).strip()
    password=str(data.get('password',''))
    role=data.get('role','editor')
    if not re.fullmatch(r'[A-Za-z0-9_.-]{3,32}',username): abort(400,'Usuário: 3 a 32 caracteres (letras, números, _ . -).')
    if len(password)<12: abort(400,'Use senha de no mínimo 12 caracteres.')
    if role not in ('editor','proprietario'): abort(400,'Perfil inválido.')
    with db() as c:
        require_owner(c)
        try:
            c.execute('INSERT INTO users (username,pw_hash,role,created_at) VALUES (?,?,?,?)',
                      (username,generate_password_hash(password,method='scrypt'),role,now()))
        except sqlite3.IntegrityError:
            abort(400,'Nome de usuário já utilizado.')
    return jsonify(ok=True),201


@app.post('/api/password')
def change_password():
    payload=request.get_json(silent=True) or {}
    new=str(payload.get('newPassword',''))
    if len(new)<12: abort(400,'A nova senha precisa de no mínimo 12 caracteres.')
    with db() as c:
        u=require_user(c)
        old=c.execute('SELECT pw_hash FROM users WHERE id=?',(u['id'],)).fetchone()['pw_hash']
        if not check_password_hash(old,str(payload.get('oldPassword',''))):
            abort(403,'Senha atual incorreta.')
        c.execute('UPDATE users SET pw_hash=? WHERE id=?',(generate_password_hash(new,method='scrypt'),u['id']))
    return jsonify(ok=True)


@app.get('/api/status')
def status():
    with db() as c:
        require_user(c)
        meta=dict(c.execute('SELECT key,value FROM metadata').fetchall())
        return jsonify(dirty=meta.get('dirty')=='1',lastPublish=meta.get('last_publish',''),
                       lastError=meta.get('last_error',''),repo=REPO,hasToken=bool(get_token()))


def get_token():
    try:
        import keyring
        return keyring.get_password(KEYRING_SERVICE,KEYRING_NAME)
    except Exception:
        return None


def catalog_payload():
    with db() as c:
        rows=c.execute('SELECT data_json FROM cards ORDER BY created_at, id').fetchall()
        items=[json.loads(row['data_json']) for row in rows]
    return {'version':1,'updatedAt':now(),'items':[c for c in items if c['published']]}


def published_js(payload):
    content=json.dumps(payload,ensure_ascii=False,indent=2)
    # Evita término prematuro de tag <script> em integrações futuras.
    return '/* Catálogo Valiant TCG gerado pelo Windows */\nwindow.VALIANT_CATALOG = '+content.replace('<','\\u003c')+';\n'


def github_request(method,url,token,payload=None):
    headers={'Authorization':f'Bearer {token}','Accept':'application/vnd.github+json',
             'X-GitHub-Api-Version':'2022-11-28','User-Agent':'ValiantTCG-Windows'}
    content=None
    if payload is not None:
        content=json.dumps(payload).encode('utf-8')
        headers['Content-Type']='application/json'
    req=Request(url,data=content,headers=headers,method=method)
    with urlopen(req,timeout=20) as resp:
        return json.loads(resp.read().decode('utf-8'))


def publish_now():
    if not PUBLISH_LOCK.acquire(blocking=False):
        return False, 'Publicação já em andamento.'
    try:
        token=get_token()
        if not token:
            return False,'Configure o token do GitHub no Gerenciador de Credenciais do Windows.'
        # URL FIXA: o usuário não consegue redirecionar o token para servidores externos.
        url=f'https://api.github.com/repos/{REPO}/contents/{GITHUB_FILE}'
        current=github_request('GET',url+'?ref='+BRANCH,token)
        with db() as c:
            revision=c.execute("SELECT value FROM metadata WHERE key='revision'").fetchone()['value']
        payload=catalog_payload()
        text=published_js(payload)
        data={'message':'Atualizar catálogo do Valiant TCG (Windows)',
              'content':base64.b64encode(text.encode('utf-8')).decode('ascii'),
              'sha':current['sha'],'branch':BRANCH}
        github_request('PUT',url,token,data)
        with db() as c:
            # Não limpar mudanças que tenham chegado enquanto a rede publicava.
            c.execute("UPDATE metadata SET value='0' WHERE key='dirty' AND (SELECT value FROM metadata WHERE key='revision')=?",(revision,))
            c.execute("UPDATE metadata SET value=? WHERE key='last_publish'",(now(),))
            c.execute("UPDATE metadata SET value='' WHERE key='last_error'")
        return True,'Catálogo enviado ao GitHub. Aguarde a publicação do Pages.'
    except (HTTPError,URLError,TimeoutError,KeyError,ValueError) as exc:
        # Nunca incluir o token ou corpo completo de resposta em logs.
        error=('HTTP '+str(exc.code) if isinstance(exc,HTTPError) else type(exc).__name__)
        with db() as c:
            c.execute("UPDATE metadata SET value=? WHERE key='last_error'",(error,))
        LOGGER.warning('Publicação falhou: %s',error)
        return False,'Falha no GitHub: '+error+' (verifique token, rede e permissões).'
    finally:
        PUBLISH_LOCK.release()


@app.post('/api/publish')
def publish():
    with db() as c:require_user(c)
    ok,message=publish_now()
    return jsonify(ok=ok,message=message),200 if ok else 503


def backup_db():
    backups=DATA/'backups'
    backups.mkdir(exist_ok=True)
    dst=backups/('valiant-'+datetime.now().strftime('%Y-%m-%d')+'.sqlite3')
    if not dst.exists():
        from contextlib import closing
        with db() as source, closing(sqlite3.connect(dst)) as target:
            source.backup(target)


def worker():
    while True:
        WAKE.wait(timeout=60)
        WAKE.clear()
        # Agrupa uma sequência rápida de alterações para evitar vários commits.
        time.sleep(2)
        WAKE.clear()
        try:
            backup_db()
            with db() as c:
                pending=c.execute("SELECT value FROM metadata WHERE key='dirty'").fetchone()['value']=='1'
            if pending and get_token():
                publish_now()
        except Exception:
            LOGGER.exception('Erro no serviço de sincronização')


def seed_from_catalog(user_id):
    """Importa uma única vez o catálogo inicial, mantendo o autor Borra."""
    source=(DATA/'catalogo-inicial.js').read_text(encoding='utf-8')
    value=source.split('window.VALIANT_CATALOG = ',1)[1].rsplit(';',1)[0]
    items=json.loads(value)['items']
    with db() as c:
        for obj in items:
            cid=obj['id']
            obj['published']=True
            stamp=now()
            c.execute('INSERT OR IGNORE INTO cards VALUES (?,?,?,?,?,?)',
                      (cid,json.dumps(obj,ensure_ascii=False),user_id,user_id,stamp,stamp))
            audit(c,cid,obj['name'],user_id,'importação inicial',None,obj)
        # Catálogo publicado já inclui as quatro cartas, então não publicar automaticamente na primeira instalação.
    return len(items)


def initial_setup():
    initialize_db()
    with db() as c:
        if c.execute('SELECT COUNT(*) FROM users').fetchone()[0] != 0:
            print('Já existe um administrador. Não é permitido reinicializar usuários.');return
    print('CONFIGURAÇÃO INICIAL — Valiant TCG')
    print('Primeiro usuário: Borra')
    password=getpass.getpass('Crie/digite a senha do usuário Borra (mín. 12 caracteres): ')
    again=getpass.getpass('Confirme a senha: ')
    if password != again or len(password)<12:
        print('Senhas diferentes ou muito curtas. Nenhuma conta criada.');return
    with db() as c:
        cur=c.execute('INSERT INTO users (username,pw_hash,role,created_at) VALUES (?,?,?,?)',
                      ('Borra',generate_password_hash(password,method='scrypt'),'proprietario',now()))
        uid=cur.lastrowid
    total=seed_from_catalog(uid)
    print(f'Usuário Borra criado. {total} cartas importadas com autoria Borra. Senha armazenada somente como hash.')



def reset_borra_password():
    """Recuperação local da conta proprietária no PC que armazena o SQLite.

    Nunca expor esta operação por rota HTTP, nem aceitar senha por argumento.
    """
    initialize_db()
    with db() as c:
        owner = c.execute(
            "SELECT id FROM users WHERE username=? AND role='proprietario'", ('Borra',)
        ).fetchone()
    if not owner:
        print('A conta Borra ainda não foi criada. Execute INSTALAR_WINDOWS.bat.')
        return
    print('REDEFINIR SENHA LOCAL — Borra')
    print('Este procedimento exige acesso ao computador administrativo.')
    print('Seu catálogo, usuários e histórico serão preservados.')
    password = getpass.getpass('Nova senha (mín. 12 caracteres): ')
    confirm = getpass.getpass('Repita a nova senha: ')
    if not password or password != confirm or len(password) < 12:
        print('Senhas diferentes ou muito curtas. Nenhuma alteração efetuada.')
        return
    with db() as c:
        c.execute('UPDATE users SET pw_hash=? WHERE id=?',
                  (generate_password_hash(password, method='scrypt'), owner['id']))
    print('Senha de Borra redefinida. Agora abra INICIAR_PAINEL.bat.')


def validate_github_token(token):
    """Confirma autenticação e leitura do catálogo sem modificar o GitHub.

    Por segurança, nunca devolve o token, corpo da API nem cabeçalhos.
    A permissão de escrita é verificada apenas na publicação efetiva.
    """
    if not token:
        return False, 'Nenhum token está configurado.'
    try:
        user=github_request('GET','https://api.github.com/user',token)
        if not user.get('login'):
            return False,'GitHub não confirmou o usuário do token.'
        catalog_url=f'https://api.github.com/repos/{REPO}/contents/{GITHUB_FILE}?ref={BRANCH}'
        catalog=github_request('GET',catalog_url,token)
        if not catalog.get('sha'):
            return False,'O GitHub não confirmou acesso ao arquivo do catálogo.'
        return True,('Token autenticado para '+user['login']+
                     '. Acesso de leitura ao catálogo confirmado. '+
                     'A permissão Contents: Read and write será confirmada ao publicar.')
    except HTTPError as exc:
        if exc.code == 401:
            return False,('HTTP 401: o GitHub recusou o token. Confira se o código '+
                          'foi copiado integralmente, se não expirou nem foi revogado. '+
                          'Use um novo token, se necessário.')
        if exc.code == 403:
            return False,('HTTP 403: o token foi recusado por restrição ou permissão. '+
                          'Confira o proprietário e o acesso ao repositório.')
        if exc.code == 404:
            return False,('HTTP 404: repositório ou catálogo inacessível para esse token. '+
                          'Selecione vctrborra-sys/valiant-tcg em Only select repositories.')
        return False,'GitHub respondeu com HTTP '+str(exc.code)+'.'
    except (URLError, TimeoutError):
        return False,'Não foi possível alcançar a API do GitHub. Confira a conexão de internet.'
    except (KeyError, ValueError):
        return False,'Resposta inesperada do GitHub. Nenhum token foi alterado.'


def configure_github():
    print('VALIANT TCG — CONFIGURAR TOKEN DO GITHUB')
    print('Repositório: vctrborra-sys/valiant-tcg')
    print('Permissão necessária: Contents (Read and write).')
    print('Execute este arquivo normalmente, com o mesmo usuário do Windows que abre o painel.')
    token=getpass.getpass('Cole o token GitHub (entrada oculta): ').strip()
    if not token:
        print('Nenhum token informado. Credencial anterior mantida.');return
    print('Verificando o token no GitHub, sem mostrar o código...')
    ok,message=validate_github_token(token)
    print(message)
    if not ok:
        print('O token NÃO foi salvo; corrija-o e execute novamente CONFIGURAR_GITHUB.bat.')
        return
    import keyring
    keyring.set_password(KEYRING_SERVICE,KEYRING_NAME,token)
    print('Token salvo com segurança no Gerenciador de Credenciais do Windows.')
    print('Agora clique em Publicar agora no GitHub no painel.')


def check_github():
    print('VALIANT TCG — TESTE DE AUTENTICAÇÃO GITHUB')
    token=get_token()
    if not token:
        print('Nenhum token encontrado para esta conta do Windows.')
        print('Execute CONFIGURAR_GITHUB.bat sem usar Executar como administrador.')
        return
    ok,message=validate_github_token(token)
    print(message)
    if not ok:
        print('Execute CONFIGURAR_GITHUB.bat para substituir a credencial com erro.')
    else:
        print('Se a publicação ainda falhar com HTTP 403, confira Contents: Read and write.')


def main():
    import sys
    logging.basicConfig(level=logging.INFO)
    if len(sys.argv)>1 and sys.argv[1]=='setup':
        initial_setup();return
    if len(sys.argv)>1 and sys.argv[1]=='reset-borra':
        reset_borra_password();return
    if len(sys.argv)>1 and sys.argv[1]=='github':
        configure_github();return
    if len(sys.argv)>1 and sys.argv[1]=='github-check':
        check_github();return
    if len(sys.argv)>1 and sys.argv[1]=='backup':
        backup_db();print('Backup salvo em dados/backups');return
    if len(sys.argv)>1 and sys.argv[1]=='start':
        from waitress import serve
        threading.Thread(target=worker,daemon=True).start()
        LOGGER.info('Painel disponível SOMENTE em http://127.0.0.1:8765')
        serve(app,host='127.0.0.1',port=8765,threads=4)
        return
    print('Comandos: python app.py setup | reset-borra | github | start | backup')

if __name__=='__main__':main()