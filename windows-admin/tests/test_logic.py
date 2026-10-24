"""Self-contained unit tests for database and publisher logic, even without pip in this sandbox.
Not a substitute for installing and testing Flask/Waitress on Windows.
"""
import hashlib, importlib.util, json, os, pathlib, sys, tempfile, types, unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]

class FlaskStub:
    def __init__(self,*args,**kwargs):
        self.config={}
        self.secret_key=None
    def route(self,*a,**k): return lambda f:f
    get=post=put=delete=route
    def before_request(self,f): return f
    def after_request(self,f): return f
    def errorhandler(self,*a,**k):return lambda f:f

flask=types.ModuleType('flask')
flask.Flask=FlaskStub
flask.abort=lambda code,msg='': (_ for _ in ()).throw(ValueError(str(code)+':'+msg))
flask.jsonify=lambda **kw:kw
flask.redirect=lambda *x:x
flask.render_template=lambda *x,**kw:kw
flask.request=types.SimpleNamespace(get_json=lambda **kw:{},remote_addr='127.0.0.1')
flask.session={}
werkzeug=types.ModuleType('werkzeug')
security=types.ModuleType('werkzeug.security')
security.generate_password_hash=lambda pw,method='scrypt': 'mock:'+hashlib.sha256(pw.encode()).hexdigest()
security.check_password_hash=lambda h,pw: h==security.generate_password_hash(pw)
sys.modules['flask']=flask
sys.modules['werkzeug']=werkzeug
sys.modules['werkzeug.security']=security
work=tempfile.TemporaryDirectory()
os.environ['VALIANT_DB']=str(pathlib.Path(work.name)/'test.sqlite3')
spec=importlib.util.spec_from_file_location('valiant_app',ROOT/'app.py')
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class Logic(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with mod.db() as conn:
            user=conn.execute('INSERT INTO users (username,pw_hash,role,created_at) VALUES (?,?,?,?)',('Borra','hash','proprietario',mod.now())).lastrowid
        cls.uid=user
        mod.seed_from_catalog(user)
        flask.session['user_id']=user

    def test_import_preserves_cards_and_author(self):
        with mod.db() as c:
            rows=c.execute('SELECT author_id,data_json FROM cards').fetchall()
        self.assertEqual(len(rows),4)
        self.assertTrue(all(r['author_id']==self.uid for r in rows))
        self.assertTrue(all(json.loads(r['data_json'])['published'] for r in rows))

    def test_default_and_rarity_validation(self):
        sample={'game':'Pokémon','name':'Pikachu','rarity':'Ultra Raras','condition':'NM','language':'Português','price':10,'quantity':2}
        x=mod.normalize_card(sample,'p1')
        self.assertEqual(x['rarity'],'Ultra Rara')
        self.assertTrue(x['published'])
        self.assertEqual(x['description'],'')
        self.assertEqual(x['language'],'Português')
        self.assertRaises(ValueError,mod.normalize_card,{**sample,'language':''},'x')
        self.assertRaises(ValueError,mod.normalize_card,{**sample,'rarity':'SLD'},'x')
        self.assertRaises(ValueError,mod.normalize_card,{**sample,'price':-1},'x')
        self.assertRaises(ValueError,mod.normalize_card,{**sample,'image':'http://evil.local'},'x')

    def test_create_audit_and_edit_any_user(self):
        with mod.db() as c:
            editor=c.execute('INSERT INTO users (username,pw_hash,role,created_at) VALUES (?,?,?,?)',('EditorUm','hash','editor',mod.now())).lastrowid
        card={'game':'Magic','name':'Sol Ring','rarity':'SLD','condition':'SP','language':'Inglês','price':37,'quantity':1}
        flask.request.get_json=lambda **kwargs:card
        flask.session['user_id']=editor
        result,code=mod.add_card()
        self.assertEqual(code,201)
        cid=result['item']['id']
        card={**card,'quantity':9,'language':'Japonês'}
        flask.session['user_id']=self.uid
        x=mod.edit_card(cid)
        self.assertEqual(x['item']['quantity'],9)
        self.assertEqual(x['item']['language'],'Japonês')
        with mod.db() as c:
            entry=c.execute('SELECT author_id,editor_id FROM cards WHERE id=?',(cid,)).fetchone()
            log=c.execute('SELECT COUNT(*) FROM audit WHERE card_id=?',(cid,)).fetchone()[0]
        self.assertEqual(entry['author_id'],editor)
        self.assertEqual(entry['editor_id'],self.uid)
        self.assertEqual(log,2)
        flask.session['user_id']=editor
        mod.delete_card(cid)
        with mod.db() as c:
            log=c.execute('SELECT action FROM audit WHERE card_id=? ORDER BY id',(cid,)).fetchall()
        self.assertEqual([r['action'] for r in log],['cadastro','edição','exclusão'])

    def test_catalog_serialization_and_github_payload(self):
        payload=mod.catalog_payload()
        self.assertEqual(len(payload['items']),4)
        js=mod.published_js(payload)
        self.assertTrue(js.startswith('/* Catálogo'))
        document=json.loads(js.split('window.VALIANT_CATALOG = ',1)[1].rsplit(';',1)[0])
        self.assertEqual(len(document['items']),4)
        self.assertTrue(all(c['published'] for c in document['items']))

    def test_revision_not_lost_during_network_sync(self):
        with mod.db() as c:mod.dirty(c)
        class DummyCredential: pass
        calls=[]
        old_token=mod.get_token
        old_request=mod.github_request
        mod.get_token=lambda:'FAKE_TOKEN_ONLY_IN_TEST'
        def fake_http(method,url,token,payload=None):
            self.assertEqual(token,'FAKE_TOKEN_ONLY_IN_TEST')
            calls.append(method)
            if method=='GET':return {'sha':'fake_sha'}
            if method=='PUT':
                with mod.db() as c:mod.dirty(c)  # another change arrives mid-publish
                return {'ok':True}
            return {}
        mod.github_request=fake_http
        try:
            ok,msg=mod.publish_now()
            self.assertTrue(ok)
            with mod.db() as c:
                dirty=c.execute("SELECT value FROM metadata WHERE key='dirty'").fetchone()['value']
            self.assertEqual(dirty,'1')
            self.assertEqual(calls,['GET','PUT'])
        finally:
            mod.get_token=old_token;mod.github_request=old_request

if __name__=='__main__': unittest.main()
