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

O menu **Administração** permite incluir, editar e remover os dados exibidos. O login é validado contra a tabela `usuarios` do banco, com senhas protegidas por hash **scrypt** (nunca em texto puro). Ao publicar, a edição é gravada de volta no banco (tabela `metadados`, como `snapshot_override`) — no arquivo local ou no Turso, conforme o ambiente.

### Banco de dados (libSQL / Turso)

A camada de dados (`api/lib/db.mjs`) usa o cliente **libSQL** (`@libsql/client`), que funciona tanto localmente quanto em serverless:

- **Local:** sem variáveis de ambiente, conecta no arquivo `src/data/observatorio.sql` (via `file:`). As edições persistem no arquivo.
- **Produção (Vercel):** conecta num banco **Turso** quando `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN` estão configuradas. Leitura **e escrita** persistem, e o painel de administração grava as edições diretamente no Turso.

### Configurar o Turso

1. Instale o CLI e faça login: veja [docs.turso.tech](https://docs.turso.tech). Depois crie um banco:

   ```bash
   turso db create observatorioblockchain
   turso db show observatorioblockchain --url        # -> TURSO_DATABASE_URL (libsql://...)
   turso db tokens create observatorioblockchain     # -> TURSO_AUTH_TOKEN
   ```

2. Popule o Turso com os dados do `observatorio.sql` local:

   ```bash
   TURSO_DATABASE_URL="libsql://...turso.io" TURSO_AUTH_TOKEN="..." node scripts/push-to-turso.mjs
   ```

3. Na Vercel, em **Settings → Environment Variables**, cadastre `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN` (ambiente Production). Faça o redeploy.

### Credenciais de admin

O usuário admin fica na tabela `usuarios` (senha em hash **scrypt**, nunca em texto puro). Para criar/atualizar antes de fazer o push para o Turso:

```bash
SEED_ADMIN_USERNAME=admin SEED_ADMIN_PASSWORD="sua-senha" node scripts/migrate-usuarios.mjs
```

Como alternativa (fallback), o login também aceita `ADMIN_USERNAME`/`ADMIN_PASSWORD` do ambiente.

> Aviso de segurança: por ser uma POC, o `observatorio.sql` versionado contém o hash do usuário admin. Não reutilize senhas reais e troque a senha antes de qualquer uso além de demonstração.
