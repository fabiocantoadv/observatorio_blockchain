# Observatório Blockchain — Produção Científica

Dashboard em React e Vega-Lite da produção científica brasileira sobre blockchain.

## Rodar localmente

```bash
npm install
npm run dev
```

Build de produção:

```bash
npm run build
```

Para testar o build com as rotas `/api` (que o `vite dev` não executa):

```bash
npm run build
npm run serve   # http://localhost:3000
```

## Dados

Os gráficos usam dados de três bases públicas: OpenAlex (artigos, capítulos e livros), OASISbr/IBICT (teses, dissertações e TCCs) e patentes (Google Patents, INPI, IBICT).

Tudo fica em `src/data/observatorio.sql`, um banco SQLite com as tabelas:

- `publicacoes`, `keywords_publicacao`, `patentes` — dados dos gráficos
- `metadados` — configuração do painel (`profile`, `source`)
- `usuarios` — login do admin (senha em hash scrypt)

Apesar da extensão `.sql`, o arquivo é um banco SQLite binário. Abra com qualquer cliente SQLite:

```bash
sqlite3 src/data/observatorio.sql "SELECT tipo, COUNT(*) FROM publicacoes GROUP BY tipo;"
```

### Reconstruir a partir dos CSVs

Os CSVs de origem não são versionados. Para reimportar do zero, coloque os três arquivos na raiz e rode `npm run build:data`:

- `openalex_consolidado_2026_set.csv`
- `oasisbr_consolidado_2026_set.csv`
- `patentes_blockchain_GooglePatents_INPI_IBICT_fulldata_set_2026.csv`

## Rotas da API

- `GET /api/data` — agregados do painel principal (tipos, anos, palavras-chave, patentes).
- `GET /api/insights?tipo=&ano=` — agregados replicados do painel Kibana (organizações, afiliações, autores, países, idioma, 50 palavras-chave), filtrados por tipo e ano.
- `GET /api/publicacoes?tipo=&ano=&q=&page=&size=` — listagem paginada com busca; `&format=csv` exporta o recorte.

## Banco em produção (Turso)

A camada de dados (`api/lib/db.mjs`) usa o cliente libSQL:

- **Local:** sem variáveis de ambiente, lê o arquivo `src/data/observatorio.sql`.
- **Produção:** conecta no Turso quando `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN` estão definidas. Leitura e escrita persistem.

Configuração:

```bash
turso db create observatorioblockchain
turso db show observatorioblockchain --url     # TURSO_DATABASE_URL
turso db tokens create observatorioblockchain  # TURSO_AUTH_TOKEN
```

Popular o Turso com os dados locais:

```bash
TURSO_DATABASE_URL="libsql://...turso.io" TURSO_AUTH_TOKEN="..." node scripts/push-to-turso.mjs
```

Na Vercel, cadastre `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN` em Settings → Environment Variables (Production) e faça o redeploy.

## Administração

O menu **Administração** permite editar os dados do painel. O login é validado contra a tabela `usuarios`; ao publicar, a edição é gravada no banco (tabela `metadados`, chave `snapshot_override`).

Criar ou atualizar o usuário admin:

```bash
SEED_ADMIN_USERNAME=admin SEED_ADMIN_PASSWORD="sua-senha" node scripts/migrate-usuarios.mjs
```

Alternativamente, o login aceita `ADMIN_USERNAME`/`ADMIN_PASSWORD` do ambiente.

## Atribuição

Fonte: [Produção Científica — Observatório Nacional de Blockchain](https://observatorioblockchain.org.br/producao-cientifica/). Uso livre com a devida atribuição.
