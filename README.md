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

## Painel administrativo no Vercel

O menu **Administração** permite incluir, editar, remover, importar e exportar os dados do painel. Em produção, ele salva o conteúdo em um único arquivo `banco_de_dados.json` no Vercel Blob; o dashboard público passa a carregá-lo automaticamente, sem exigir novo deploy.

Antes de publicar, no projeto do Vercel:

1. Em **Storage**, crie um armazenamento **Vercel Blob privado** e conecte-o ao projeto. Isso cria a variável `BLOB_READ_WRITE_TOKEN`.
2. Em **Settings → Environment Variables**, crie `ADMIN_USERNAME` e `ADMIN_PASSWORD` com credenciais longas e exclusivas.
3. Faça o deploy. Na primeira publicação via painel, o arquivo JSON é criado no Blob.

Enquanto essas variáveis não estiverem configuradas, o site continua usando o JSON incluído no repositório como fonte de leitura. A senha nunca é enviada para o navegador como configuração: ela é verificada somente pela função `/api/data`.

O painel original é publicado no Kibana. Como ele não disponibiliza uma API aberta consumível diretamente pelo navegador, o projeto usa um recorte versionado dos valores visíveis no painel. Para atualizar a visualização, exporte a nova base do Kibana e substitua os arrays desse arquivo, mantendo a atribuição à fonte.
