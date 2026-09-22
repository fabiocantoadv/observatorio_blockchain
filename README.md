# Observatório Blockchain — Produção Científica

Dashboard responsivo em React e Vega-Lite para explorar a produção científica brasileira sobre blockchain.

## Rodar localmente

```bash
npm install
npm run dev
```

Para criar a versão de produção:

```bash
npm run build
```

## Dados, banco SQLite e atribuição

Os gráficos são alimentados por dados reais de três bases públicas: OpenAlex (artigos, capítulos e livros), OASISbr/IBICT (teses, dissertações e TCCs) e uma base de patentes de Google Patents, INPI e IBICT.

Esses dados **já estão consolidados** dentro de `src/data/observatorio.sql`, que é a fonte única do painel. Os CSVs de origem **não são versionados** no repositório — eles só são necessários para reconstruir o banco do zero.

### Reconstruir o banco do zero (opcional)

Para reimportar tudo, coloque os três CSVs na raiz do projeto e rode:

```bash
npm run build:data
```

Arquivos esperados na raiz:

- `openalex_consolidado_2026_set.csv`
- `oasisbr_consolidado_2026_set.csv`
- `patentes_blockchain_GooglePatents_INPI_IBICT_fulldata_set_2026.csv`

O script gera `src/data/observatorio.sql`, a **fonte única de dados** do painel:

- Tabelas `publicacoes`, `keywords_publicacao` e `patentes` — os dados dos gráficos.
- Tabela `metadados` — configuração do painel (`profile` e `source`) em formato chave/valor JSON.

> O arquivo `observatorio.sql` é, apesar da extensão, um banco **SQLite binário**. Abra-o com qualquer cliente SQLite (DB Browser for SQLite, extensão SQLite do VS Code ou o utilitário `sqlite3`) para executar `SELECT`, `INSERT`, `UPDATE`, etc. Exemplos:
>
> ```bash
> sqlite3 src/data/observatorio.sql "SELECT tipo, COUNT(*) FROM publicacoes GROUP BY tipo;"
> sqlite3 src/data/observatorio.sql "SELECT * FROM patentes LIMIT 5;"
> ```

A função `/api/data` calcula as agregações e lê `profile`/`source` diretamente do SQLite (`api/lib/database.mjs`). Não há mais nenhum arquivo JSON de dados no repositório.

Fonte de referência: [Produção Científica — Observatório Nacional de Blockchain](https://observatorioblockchain.org.br/producao-cientifica/). Os dados podem ser baixados e usados livremente com a devida atribuição.

## Painel administrativo

O menu **Administração** permite incluir, editar e remover os dados exibidos. O login é feito contra a tabela `usuarios` do próprio banco (`observatorio.sql`), com senhas protegidas por hash **scrypt** (nunca em texto puro). Ao publicar, a edição é gravada de volta no banco (tabela `metadados`, como `snapshot_override`).

### Credenciais

O usuário padrão é semeado ao construir o banco. Para definir/alterar credenciais, use variáveis de ambiente ao rodar o script de migração ou de build:

```bash
# cria/atualiza o usuário admin no observatorio.sql
SEED_ADMIN_USERNAME=admin SEED_ADMIN_PASSWORD="sua-senha" node scripts/migrate-usuarios.mjs
```

Como alternativa (fallback), o login também aceita as variáveis `ADMIN_USERNAME`/`ADMIN_PASSWORD` do ambiente, caso a tabela `usuarios` não exista.

### Persistência e limitação em serverless

Rodando **localmente** (`npm run build` + `npm run serve`), as edições do painel são gravadas no `observatorio.sql` e persistem.

Em ambientes **serverless** (ex.: Vercel), o sistema de arquivos é somente-leitura: o login funciona, mas a gravação não persiste — a API responde `503` nesse caso. Para escrita persistente em produção seria necessário um banco gerenciado (ex.: Turso/libSQL). Este projeto é uma POC e prioriza o fluxo local.

> Aviso de segurança: por ser uma POC, o `observatorio.sql` (versionado) contém o hash do usuário admin. Não reutilize senhas reais aqui e troque a senha antes de qualquer uso além de demonstração.
