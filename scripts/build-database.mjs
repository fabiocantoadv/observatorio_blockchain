import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseCsvFile } from './lib/csv.mjs'
import { hashPassword } from './lib/password.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = join(root, 'src', 'data')
const dbPath = join(dataDir, 'observatorio.sql')

const files = {
  openalex: join(root, 'openalex_consolidado_2026_set.csv'),
  oasisbr: join(root, 'oasisbr_consolidado_2026_set.csv'),
  patentes: join(root, 'patentes_blockchain_GooglePatents_INPI_IBICT_fulldata_set_2026.csv'),
}

const TYPE_LABEL = {
  article: 'Artigo',
  '': 'Artigo',
  'book-chapter': 'Capítulo de livro',
  book: 'Livro',
  masterThesis: 'Dissertação',
  bachelorThesis: 'TCC',
  doctoralThesis: 'Tese',
}

const KEYWORD_GROUPS = [
  ['Tecnologia', '#001eff', ['smart contract', 'contratos inteligentes', 'ethereum', 'hyperledger', 'distributed ledger', 'consenso', 'consensus', 'immutability', 'imutabilidade', 'solidity', 'nft', 'iot', 'internet das coisas', 'technology', 'tecnologia', 'blockchain technology']],
  ['Aplicações', '#00f0dc', ['supply chain', 'cadeia de suprimentos', 'traceability', 'rastreabilidade', 'saúde', 'health', 'logística', 'votação', 'identidade', 'educação']],
  ['Dados', '#ffff00', ['data sharing', 'dados', 'segurança', 'security', 'privacidade', 'privacy', 'base de dados', 'databases']],
  ['Governança', '#6678ff', ['governança', 'governance', 'regulação', 'regulação', 'regulation', 'direito', 'lgpd', 'compliance', 'política']],
  ['Economia', '#0a0a8c', ['bitcoin', 'criptomoeda', 'criptomoedas', 'cryptocurrency', 'cryptocurrencies', 'criptoativos', 'tokenização', 'token', 'moeda', 'economia', 'finanças', 'defi', 'tributação']],
]

function classifyKeyword(kw) {
  const low = kw.toLowerCase()
  for (const [group, , terms] of KEYWORD_GROUPS) {
    if (terms.some((t) => low.includes(t))) return group
  }
  return 'Tecnologia'
}

function cleanYear(value) {
  const match = String(value || '').match(/\d{4}/)
  if (!match) return null
  const year = Number(match[0])
  if (year < 2000 || year > 2026) return null
  return year
}

const KEYWORD_STOPLIST = new Set([
  'blockchain', 'blockchains', 'blockchains (base de dados)', 'blockchains (databases)',
  'não informado pela instituição', 'nao informado pela instituicao', 'tecnologia blockchain',
])

async function main() {
  const missing = Object.entries(files).filter(([, path]) => !existsSync(path))
  if (missing.length) {
    console.error('CSVs de origem não encontrados na raiz do projeto:')
    for (const [name, path] of missing) console.error(`  - ${name}: ${path}`)
    console.error('\nO banco observatorio.sql já contém os dados. Este script só é')
    console.error('necessário para reimportar do zero — recoloque os CSVs para usá-lo.')
    process.exit(1)
  }

  console.log('Lendo CSVs e construindo o banco SQLite…')

  const previousMeta = {}
  let previousUsers = []
  if (existsSync(dbPath)) {
    try {
      const old = new Database(dbPath, { readonly: true })
      const rows = old.prepare('SELECT chave, valor FROM metadados').all()
      for (const r of rows) previousMeta[r.chave] = JSON.parse(r.valor)
      old.close()
    } catch { /* sem tabela metadados */ }
    try {
      const old = new Database(dbPath, { readonly: true })
      previousUsers = old.prepare('SELECT username, senha_hash FROM usuarios').all()
      old.close()
    } catch { /* sem tabela usuarios */ }
  }

  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  db.exec(`
    DROP TABLE IF EXISTS keywords_publicacao;
    DROP TABLE IF EXISTS publicacoes;
    DROP TABLE IF EXISTS patentes;
    DROP TABLE IF EXISTS metadados;
    DROP TABLE IF EXISTS usuarios;

    CREATE TABLE metadados (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    );

    CREATE TABLE usuarios (
      username TEXT PRIMARY KEY,
      senha_hash TEXT NOT NULL
    );

    CREATE TABLE publicacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fonte TEXT NOT NULL,
      external_id TEXT,
      titulo TEXT,
      tipo_original TEXT,
      tipo TEXT,
      ano INTEGER,
      doi TEXT,
      autores TEXT,
      instituicoes TEXT,
      paises TEXT,
      citacoes INTEGER,
      idioma TEXT
    );

    CREATE TABLE keywords_publicacao (
      publicacao_id INTEGER,
      keyword TEXT,
      grupo TEXT,
      FOREIGN KEY (publicacao_id) REFERENCES publicacoes(id)
    );

    CREATE TABLE patentes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero_pedido TEXT,
      titulo TEXT,
      titular TEXT,
      pais_titular TEXT,
      data_deposito TEXT,
      ano INTEGER,
      resumo TEXT
    );

    CREATE INDEX idx_pub_tipo ON publicacoes(tipo);
    CREATE INDEX idx_pub_ano ON publicacoes(ano);
    CREATE INDEX idx_kw ON keywords_publicacao(keyword);
  `)

  const insertPub = db.prepare(`
    INSERT INTO publicacoes (fonte, external_id, titulo, tipo_original, tipo, ano, doi, autores, instituicoes, paises, citacoes, idioma)
    VALUES (@fonte, @external_id, @titulo, @tipo_original, @tipo, @ano, @doi, @autores, @instituicoes, @paises, @citacoes, @idioma)
  `)
  const insertKw = db.prepare(`INSERT INTO keywords_publicacao (publicacao_id, keyword, grupo) VALUES (?, ?, ?)`)
  const insertPat = db.prepare(`
    INSERT INTO patentes (numero_pedido, titulo, titular, pais_titular, data_deposito, ano, resumo)
    VALUES (@numero_pedido, @titulo, @titular, @pais_titular, @data_deposito, @ano, @resumo)
  `)

  const openalexRows = []
  await parseCsvFile(files.openalex, (o) => openalexRows.push(o))
  const oasisbrRows = []
  await parseCsvFile(files.oasisbr, (o) => oasisbrRows.push(o))
  const patentRows = []
  await parseCsvFile(files.patentes, (o) => patentRows.push(o))

  const ingestOpenalex = db.transaction((rows) => {
    for (const o of rows) {
      const tipoOriginal = (o.type || '').trim()
      const tipo = TYPE_LABEL[tipoOriginal] ?? 'Artigo'
      insertPub.run({
        fonte: 'openalex',
        external_id: (o.id || '').trim() || null,
        titulo: (o.title || o.display_name || '').trim() || null,
        tipo_original: tipoOriginal || null,
        tipo,
        ano: cleanYear(o.publication_year || o.publication_date),
        doi: (o.doi || '').trim() || null,
        autores: (o.authorships_author_display_name || '').trim() || null,
        instituicoes: (o.inst_display_names || '').trim() || null,
        paises: (o.authorships_countries || '').trim() || null,
        citacoes: Number.parseInt(o.cited_by_count, 10) || 0,
        idioma: null,
      })
    }
  })

  const ingestOasisbr = db.transaction((rows) => {
    for (const o of rows) {
      const tipoOriginal = (o.tipo_de_documento || '').trim()
      const tipo = TYPE_LABEL[tipoOriginal] ?? 'Artigo'
      const info = insertPub.run({
        fonte: 'oasisbr',
        external_id: (o.id_no_oasisbr || '').trim() || null,
        titulo: (o.titulo_do_documento || '').trim() || null,
        tipo_original: tipoOriginal || null,
        tipo,
        ano: cleanYear(o.ano_de_publicacao),
        doi: (o.doi_do_documento || '').trim() || null,
        autores: (o.todos_os_autores || '').trim() || null,
        instituicoes: (o.titulo_da_instituicao_fonte || '').trim() || null,
        paises: 'BR',
        citacoes: 0,
        idioma: (o.idioma || '').trim() || null,
      })
      const pubId = info.lastInsertRowid
      const seen = new Set()
      for (const raw of (o.palavras_chave || '').split('||')) {
        const kw = raw.trim()
        if (!kw || kw.length > 40 || kw.includes('::')) continue
        const low = kw.toLowerCase()
        if (KEYWORD_STOPLIST.has(low) || seen.has(low)) continue
        seen.add(low)
        insertKw.run(pubId, kw, classifyKeyword(kw))
      }
    }
  })

  const ingestPatentes = db.transaction((rows) => {
    for (const o of rows) {
      const data = (o['Data de depósito'] || '').trim()
      insertPat.run({
        numero_pedido: (o['Nº do pedido'] || '').trim() || null,
        titulo: (o['Título'] || '').trim() || null,
        titular: (o['Titular'] || '').trim() || null,
        pais_titular: (o['País de sede do titular'] || '').trim() || null,
        data_deposito: data || null,
        ano: cleanYear(data),
        resumo: (o['Resumo'] || '').trim() || null,
      })
    }
  })

  ingestOpenalex(openalexRows)
  ingestOasisbr(oasisbrRows)
  ingestPatentes(patentRows)

  console.log(`  publicações openalex: ${openalexRows.length}`)
  console.log(`  publicações oasisbr:  ${oasisbrRows.length}`)
  console.log(`  patentes:             ${patentRows.length}`)

  const insertMeta = db.prepare(`INSERT INTO metadados (chave, valor) VALUES (?, ?)`)
  insertMeta.run('profile', JSON.stringify(previousMeta.profile || {
    name: 'Administrador', initials: 'AD', photo: '',
  }))
  insertMeta.run('source', JSON.stringify(previousMeta.source || {
    name: 'Observatório Nacional de Blockchain',
    url: 'https://observatorioblockchain.org.br/producao-cientifica/',
    dashboardUrl: 'https://rnpdash.ibict.br/app/dashboards#/view/525cbbc6-3318-4abc-bfc5-d816ba6271e9?embed=true',
    description: 'Dados públicos consolidados de OpenAlex, OASISbr e patentes (Google Patents/INPI/IBICT).',
    snapshot: 'Consolidação de setembro/2026 a partir das bases OpenAlex, OASISbr e de patentes.',
  }))

  const insertUser = db.prepare(`INSERT INTO usuarios (username, senha_hash) VALUES (?, ?)`)
  if (previousUsers.length) {
    for (const u of previousUsers) insertUser.run(u.username, u.senha_hash)
  } else {
    const seedUser = process.env.SEED_ADMIN_USERNAME || 'admin'
    const seedPass = process.env.SEED_ADMIN_PASSWORD || 'Dados@2026'
    insertUser.run(seedUser, hashPassword(seedPass))
    console.log(`  usuário admin semeado: ${seedUser}`)
  }

  const documentTypes = db.prepare(`SELECT tipo, COUNT(*) AS count FROM publicacoes GROUP BY tipo ORDER BY count DESC`).all()
  const yearCount = db.prepare(`SELECT COUNT(DISTINCT ano) AS n FROM publicacoes WHERE ano IS NOT NULL`).get().n
  const totalPatents = db.prepare(`SELECT COUNT(*) AS n FROM patentes`).get().n

  db.close()

  console.log('\nGravado em observatorio.sql:')
  console.log('  tipos:', documentTypes.map((d) => `${d.tipo}=${d.count}`).join(', '))
  console.log('  anos:', yearCount)
  console.log('  patentes:', totalPatents)
  console.log('\nConcluído.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
