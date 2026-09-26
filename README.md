# Observatório Nacional de Blockchain — Produção Científica

Painel da produção científica e das patentes brasileiras sobre blockchain, feito em React com gráficos Vega/Vega-Lite e dados em SQLite (local) ou Turso (produção).

## O painel

A barra de filtros tem duas abas, cada uma com seus filtros e o total do recorte:

- **Publicações** (filtros: tipo documental e ano de publicação)
  - Tipos de documentos (rosca) e Publicações por ano (colunas, ordem cronológica ou crescente)
  - Organizações (top 20) e Países dos autores (top 10)
  - Tabelas de Afiliações e de Autores (com ORCID), com busca, ordenação e exportação CSV
  - Idioma, Rede de pesquisadores (link para o VOSviewer) e treemap das 50 palavras-chave mais utilizadas
  - Treemap de Tópicos (tópico principal do OpenAlex), em largura total
  - Listagem das publicações, com busca, paginação e exportação CSV
- **Patentes** (filtros: país do titular e ano de depósito)
  - Depósitos por ano e por país do titular
  - Principais titulares (top 10) e tabela de titulares
  - Listagem das patentes, com resumo expansível e exportação CSV

Os gráficos das seções de detalhe seguem de fato os filtros (são calculados no servidor a cada recorte).

## Rodar localmente

```bash
npm install --omit=dev
npm run build
npm run serve        # http://localhost:3000
```

O `npm run dev` (Vite) sobe só a interface: as rotas `/api` não rodam nele e o painel abre vazio. Use `build` + `serve` para ver os dados.

`npm install` completo (com as dependências de desenvolvimento) só é necessário para `npm run build:data`, `scripts/migrate-usuarios.mjs` e `scripts/push-to-turso.mjs`, que usam o `better-sqlite3`.

## Dados

### Fontes (CSVs na raiz, versionados)

| Arquivo | Fonte | Registros |
|---|---|---|
| `openalex_consolidado_2026_set.csv` | OpenAlex — artigos, capítulos e livros | 2.119 |
| `oasisbr_consolidado_2026_set.csv` | OASISbr/IBICT — teses, dissertações e TCCs | 1.326 |
| `patentes_blockchain_GooglePatents_INPI_IBICT_fulldata_set_2026.csv` | Google Patents, INPI e IBICT | 236 |

Consolidação de setembro/2026. Outros CSVs na raiz (cópias de segurança, exportações) são ignorados pelo git.

### Banco (`src/data/observatorio.sql`)

Apesar da extensão `.sql`, é um banco SQLite binário, gerado a partir dos CSVs:

| Tabela | Conteúdo |
|---|---|
| `publicacoes` | OpenAlex + OASISbr: título, tipo, ano, DOI, autores, instituições, países, citações, idioma e `topico_principal` |
| `keywords_publicacao` | palavras-chave do OASISbr, uma linha por termo, com tema (Tecnologia, Economia etc.) |
| `autores_orcid` | nome do autor → ORCID (2.646 autores do OpenAlex) |
| `patentes` | nº do pedido, título, titular, país do titular, data de depósito e resumo |
| `metadados` | configuração do painel (`profile`, `source` e edições feitas na Administração) |
| `usuarios` | login da Administração (senha em hash scrypt) |

```bash
sqlite3 src/data/observatorio.sql "SELECT tipo, COUNT(*) FROM publicacoes GROUP BY tipo;"
```

### Cobertura de cada campo

- **Palavras-chave e idioma:** só OASISbr (o CSV do OpenAlex não traz esses campos).
- **Países dos autores, ORCID e tópicos:** só OpenAlex (no OASISbr o país é fixado como BR na importação).
- **Afiliações:** OpenAlex (afiliação dos autores) e OASISbr (instituição de defesa).

### Scripts

| Comando | O que faz |
|---|---|
| `npm run build:data` | Reconstrói o banco a partir dos três CSVs (preserva `metadados` e `usuarios`) |
| `npm run import:orcid` | Recria só a tabela `autores_orcid` a partir do CSV do OpenAlex |
| `npm run fetch:topics` | Recoleta na API do OpenAlex o `primary_topic` de cada obra e grava a coluna no CSV (guarda uma cópia `*.antes_primary_topic.csv`); rode `build:data` em seguida |
| `node scripts/migrate-usuarios.mjs` | Cria ou atualiza o usuário da Administração (`SEED_ADMIN_USERNAME`, `SEED_ADMIN_PASSWORD`) |
| `node scripts/push-to-turso.mjs` | Copia todas as tabelas do banco local para o Turso |

Detalhes:

- **ORCID:** lido das colunas `authorships_author_display_name` e `authorships_author_orcid` do CSV do OpenAlex. Quando o mesmo nome aparece com ORCIDs diferentes, fica o mais frequente; em caso de empate, o autor fica sem ORCID.
- **Tópico principal:** campo `primary_topic.display_name` da API do OpenAlex, consultado pelos IDs das obras. Obras sem ID do OpenAlex ou não encontradas na API ficam sem tópico.

## Rotas da API

| Rota | Retorno |
|---|---|
| `GET /api/data` | agregados básicos (tipos de documento, publicações por ano, palavras-chave, patentes) e configuração |
| `GET /api/insights?tipo=&ano=` | organizações, afiliações, autores (com ORCID), países, idiomas, 50 palavras-chave e tópicos do recorte |
| `GET /api/publicacoes?tipo=&ano=&q=&page=&size=` | listagem paginada com busca; `&format=csv` exporta o recorte |
| `GET /api/patentes?view=insights&ano=&pais=` | agregados da aba Patentes; sem `view`, listagem paginada (`q`, `page`, `size`, `format=csv`) |
| `POST /api/auth`, `POST /api/data` | login e gravação das edições da Administração |

Na Vercel, cada arquivo em `api/` vira uma função serverless; localmente, `scripts/serve-local.mjs` expõe as mesmas rotas.

## Estrutura

```
api/                 rotas da API (Vercel) e camada de dados (api/lib)
scripts/             importação dos CSVs, ORCID, tópicos, Turso e servidor local
src/App.jsx          layout, cabeçalho, abas e filtros
src/components/      DetailSections (publicações), PatentSections, DataTable, VegaChart, Administração
src/assets/          logo e imagem ilustrativa da rede
src/data/            banco SQLite
```

## Produção (Vercel + Turso)

A camada de dados (`api/lib/db.mjs`) usa o cliente libSQL:

- **Local:** sem variáveis de ambiente, lê `src/data/observatorio.sql`.
- **Produção:** conecta no Turso quando `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN` estão definidas (Vercel → Settings → Environment Variables).

Configuração inicial do Turso:

```bash
turso db create observatorioblockchain
turso db show observatorioblockchain --url     # TURSO_DATABASE_URL
turso db tokens create observatorioblockchain  # TURSO_AUTH_TOKEN
```

### Publicar uma atualização

1. Junte a `homol` na `main` (pull request no GitHub). A Vercel publica o código automaticamente.
2. Atualize os dados no Turso — o `git push` não altera o banco de produção:

   ```bash
   npm install
   TURSO_DATABASE_URL="libsql://...turso.io" TURSO_AUTH_TOKEN="..." node scripts/push-to-turso.mjs
   ```

3. Confira as abas, os filtros, a coluna ORCID e o login da Administração no site publicado.

> **Atenção:** o `push-to-turso.mjs` apaga e recria **todas** as tabelas no Turso, inclusive `usuarios` e `metadados`. A senha da Administração em produção passa a ser a do banco local, e edições feitas pela Administração em produção são perdidas. Antes de enviar, defina uma senha própria com `node scripts/migrate-usuarios.mjs` (não use a senha padrão).

## Administração

O menu **Administração** permite editar os dados do painel. O login é validado contra a tabela `usuarios` (ou contra `ADMIN_USERNAME`/`ADMIN_PASSWORD` do ambiente); ao publicar, a edição é gravada na tabela `metadados` (chave `snapshot_override`).

## Atribuição

Fonte: [Produção Científica — Observatório Nacional de Blockchain](https://observatorioblockchain.org.br/producao-cientifica/). Uso livre com a devida atribuição.
