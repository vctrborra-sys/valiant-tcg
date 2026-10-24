# Valiant TCG — instalação limpa no Windows 10/11

## 1. Escolha onde guardar

Extraia o ZIP inteiro e mova a pasta `Windows` para um lugar fixo, por exemplo `C:\Valiant-TCG`. **Faça isso antes de instalar.** Não execute arquivos direto de dentro do ZIP.

## 2. Instale

Instale Python 3.11 ou superior em https://www.python.org/downloads/windows/ (marque `Add Python to PATH`, se aparecer).

Dentro da pasta `Windows`, clique duas vezes em **`INSTALAR_WINDOWS.bat`**. Esse arquivo configura o ambiente, instala as dependências e pede uma nova senha para o primeiro usuário `Borra`. A senha fica armazenada apenas como hash no banco local. Ao digitar ela não aparece na tela.

## 3. GitHub para publicação automática

Execute **`CONFIGURAR_GITHUB.bat`**, informando um token fine-grained limitado ao repositório `vctrborra-sys/valiant-tcg` e à permissão `Contents: Read and write`. Não compartilhe esse token nem salve em arquivos de texto. Se a credencial antiga do Windows continuar no Gerenciador de Credenciais, talvez você não precise recriar o token.

## 4. Abra o painel

Clique duas vezes em **`INICIAR_PAINEL.bat`**, entre com Borra no endereço `http://127.0.0.1:8765/`. Deixe a janela do programa aberta enquanto quiser sincronizar. Para iniciar automaticamente ao entrar no Windows, execute **`ATIVAR_INICIO_AUTOMATICO.bat`**.

## 5. Dados e recuperação

O banco de dados do painel fica em `Windows\dados\valiant.sqlite3`. **Nunca apague `dados`**: lá ficam cartas, usuários e histórico. Use `FAZER_BACKUP.bat` e guarde backups fora dessa pasta (um pendrive, por exemplo). 

Se você apagou a instalação anterior, restaure `dados\valiant.sqlite3` ou um backup `.sqlite3` anterior antes de rodar a instalação. Caso não haja backup, o novo sistema importará as **4 cartas que estavam publicadas no GitHub** em 23/10/2026, com autoria inicial atribuída a Borra. Não dá para recuperar do GitHub senhas, outros usuários e alterações não publicadas.

Após restaurar banco anterior, `REDEFINIR_SENHA_BORRA.bat` recupera a senha localmente quando necessário. Não publique o banco no GitHub, especialmente porque o repositório é público.

## 6. O que contém

`app.py`: aplicação local; `templates/admin.html` e `static/*`: interface; `dados/catalogo-inicial.js`: 4 cartas recuperadas; `tests/test_logic.py`: verificações; arquivos `.bat`: instalar, iniciar, backup, senha, credencial e inicialização. 

O idioma da carta é informado no cadastro/edição; a busca do painel mantém o formato simples. O site público continua no GitHub Pages. A pasta `Site` do ZIP é apenas uma cópia local de segurança, não é preciso enviá-la ao repositório para começar a operar.
