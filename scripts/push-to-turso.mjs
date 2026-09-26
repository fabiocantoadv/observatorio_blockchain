import Database from 'better-sqlite3'
import { createClient } from '@libsql/client'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const url = process.env.TURSO_DATABASE_URL
const authToken = process.env.TURSO_AUTH_TOKEN
if (!url) {
  console.error('Defina TURSO_DATABASE_URL (e TURSO_AUTH_TOKEN) antes de rodar.')
  process.exit(1)
}

const localPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'observatorio.sql')
const local = new Database(localPath, { readonly: true, fileMustExist: true })
const remote = createClient({ url, authToken })

const schema = {
  metadados: `CREATE TABLE metadados (chave TEXT PRIMARY KEY, valor TEXT NOT NULL)`,
  usuarios: `CREATE TABLE usuarios (username TEXT PRIMARY KEY, senha_hash TEXT NOT NULL)`,
  publicacoes: `CREATE TABLE publicacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, fonte TEXT NOT NULL, external_id TEXT, titulo TEXT,
    tipo_original TEXT, tipo TEXT, ano INTEGER, doi TEXT, autores TEXT, instituicoes TEXT,
    paises TEXT, citacoes INTEGER, idioma TEXT)`,
  keywords_publicacao: `CREATE TABLE keywords_publicacao (publicacao_id INTEGER, keyword TEXT, grupo TEXT)`,
  patentes: `CREATE TABLE patentes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, numero_pedido TEXT, titulo TEXT, titular TEXT,
    pais_titular TEXT, data_deposito TEXT, ano INTEGER, resumo TEXT)`,
  autores_orcid: `CREATE TABLE autores_orcid (autor TEXT PRIMARY KEY, orcid TEXT NOT NULL)`,
}

const order = ['metadados', 'usuarios', 'publicacoes', 'keywords_publicacao', 'patentes', 'autores_orcid']

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

for (const table of order) {
  const cols = local.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name)
  const rows = local.prepare(`SELECT * FROM ${table}`).all()

  await remote.execute(`DROP TABLE IF EXISTS ${table}`)
  await remote.execute(schema[table])

  if (!rows.length) {
    console.log(`${table}: 0 linhas`)
    continue
  }

  const placeholders = `(${cols.map(() => '?').join(', ')})`
  const insertSql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES ${placeholders}`

  for (const batch of chunk(rows, 500)) {
    const stmts = batch.map((r) => ({ sql: insertSql, args: cols.map((c) => r[c]) }))
    await remote.batch(stmts, 'write')
  }
  console.log(`${table}: ${rows.length} linhas`)
}

local.close()
console.log('\nPush para o Turso concluído.')
