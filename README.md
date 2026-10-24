# Valiant TCG

**Site:** https://vctrborra-sys.github.io/valiant-tcg/

A vitrine pública é hospedada pelo GitHub Pages e usa `index.html` e `assets/catalogo.js`. O catálogo mantém filtros de jogo, raridade, nome, faixa de preço, ordenação alfabética e paginação de 12 cartas.

## Painel Windows 10/11

O código completo do painel local fica em [windows-admin](windows-admin/), incluindo o instalador, banco SQLite, login, histórico, TCGdex/Scryfall e integração de publicação via GitHub.

**Instalação em outra pasta:**

1. Clique em **Code → Download ZIP** neste repositório; extraia e mova **windows-admin** para um local fixo (ex.: `C:\Valiant-TCG`).
2. Instale o Python 3.11 ou posterior, se necessário.
3. Execute `INSTALAR_WINDOWS.bat` e crie uma senha nova para o administrador Borra.
4. Execute `CONFIGURAR_GITHUB.bat` para guardar, no Gerenciador de Credenciais do Windows, um token *fine-grained* limitado a este repositório com `Contents: Read and write`.
5. Execute `INICIAR_PAINEL.bat` e acesse http://127.0.0.1:8765/ .

O início automático está no arquivo `ATIVAR_INICIO_AUTOMATICO.bat`, corrigido para funcionar sem PowerShell.

**Recuperação:** `windows-admin/dados/catalogo-inicial.js` contém as quatro cartas que estavam publicadas em 23/10/2026. Elas serão importadas na primeira instalação. Um banco SQLite antigo, se existir em backup, pode restaurar usuários e histórico localmente. Dados não publicados no GitHub e sem backup não podem ser recuperados.

**Segurança:** o repositório é público. Nunca envie `valiant.sqlite3`, senhas, tokens, `.chave-sessao` ou a pasta `dados/backups` ao GitHub.

Consulte o guia [windows-admin/LEIA-ME.md](windows-admin/LEIA-ME.md).
