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

## Dados e atribuição

O recorte inicial exibido está em [`src/data/banco_de_dados.json`](src/data/banco_de_dados.json) e identifica a origem pública: [Produção Científica — Observatório Nacional de Blockchain](https://observatorioblockchain.org.br/producao-cientifica/). O próprio Observatório informa que os dados podem ser baixados e usados livremente com a devida atribuição.

## Painel administrativo no Vercel

O menu **Administração** permite incluir, editar, remover, importar e exportar os dados do painel. Em produção, ele salva o conteúdo em um único arquivo `banco_de_dados.json` no Vercel Blob; o dashboard público passa a carregá-lo automaticamente, sem exigir novo deploy.

Antes de publicar, no projeto do Vercel:

1. Em **Storage**, crie um armazenamento **Vercel Blob privado** e conecte-o ao projeto. Isso cria a variável `BLOB_READ_WRITE_TOKEN`.
2. Em **Settings → Environment Variables**, crie `ADMIN_USERNAME` e `ADMIN_PASSWORD` com credenciais longas e exclusivas.
3. Faça o deploy. Na primeira publicação via painel, o arquivo JSON é criado no Blob.

Enquanto essas variáveis não estiverem configuradas, o site continua usando o JSON incluído no repositório como fonte de leitura. A senha nunca é enviada para o navegador como configuração: ela é verificada somente pela função `/api/data`.

O painel original é publicado no Kibana. Como ele não disponibiliza uma API aberta consumível diretamente pelo navegador, o projeto usa um recorte versionado dos valores visíveis no painel. Para atualizar a visualização, exporte a nova base do Kibana e substitua os arrays desse arquivo, mantendo a atribuição à fonte.
