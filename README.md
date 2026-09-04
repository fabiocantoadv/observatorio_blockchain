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

O recorte exibido está em [`src/data/productionSnapshot.js`](src/data/productionSnapshot.js) e identifica a origem pública: [Produção Científica — Observatório Nacional de Blockchain](https://observatorioblockchain.org.br/producao-cientifica/). O próprio Observatório informa que os dados podem ser baixados e usados livremente com a devida atribuição.

O painel original é publicado no Kibana. Como ele não disponibiliza uma API aberta consumível diretamente pelo navegador, o projeto usa um recorte versionado dos valores visíveis no painel. Para atualizar a visualização, exporte a nova base do Kibana e substitua os arrays desse arquivo, mantendo a atribuição à fonte.
