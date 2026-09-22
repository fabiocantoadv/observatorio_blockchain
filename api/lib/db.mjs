// Async data layer backed by libSQL (@libsql/client).
//
// Connection target:
//   - Turso (production/serverless): set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN
//   - Local file (fallback): file:<repo>/src/data/observatorio.sql
//
// This single async layer works both in serverless (Turso over HTTP) and
// locally against the SQLite file, replacing the native better-sqlite3 module
// that fails to run on Vercel.
//
// Tables: publicacoes, keywords_publicacao, patentes, metadados, usuarios.

import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { verifyPassword } from './password.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const localFile = join(here, '..', '..', 'src', 'data', 'observatorio.sql')

let clientPromise = null
async function db() {
  if (clientPromise) return clientPromise
  const url = process.env.TURSO_DATABASE_URL
  clientPromise = (async () => {
    if (url) {
      // Serverless/edge: the /web entry talks to Turso over HTTP with no native
      // dependencies (safe to bundle on Vercel).
      const { createClient } = await import('@libsql/client/web')
      return createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
    }
    // Local: the default entry supports the file: URL scheme.
    const { createClient } = await import('@libsql/client')
    return createClient({ url: `file:${localFile.replace(/\\/g, '/')}` })
  })()
  return clientPromise
}

const TYPE_STYLE = [
  ['Artigo', '#4dd4bd'],
  ['TCC', '#7e8cff'],
  ['Dissertação', '#a879e9'],
  ['Tese', '#f2c66d'],
  ['Capítulo de livro', '#f279aa'],
  ['Livro', '#dc6c61'],
]

const DEFAULT_PROFILE = { name: 'Administrador', initials: 'AD', photo: '' }
const DEFAULT_SOURCE = {
  name: 'Observatório Nacional de Blockchain',
  url: 'https://observatorioblockchain.org.br/producao-cientifica/',
  dashboardUrl: 'https://rnpdash.ibict.br/app/dashboards#/view/525cbbc6-3318-4abc-bfc5-d816ba6271e9?embed=true',
  description: 'Dados públicos consolidados de OpenAlex, OASISbr e patentes (Google Patents/INPI/IBICT).',
  snapshot: 'Consolidação de setembro/2026 a partir das bases OpenAlex, OASISbr e de patentes.',
}

let cached = null

async function readMeta(key, fallback) {
  try {
    const rs = await (await db()).execute({ sql: 'SELECT valor FROM metadados WHERE chave = ?', args: [key] })
    return rs.rows.length ? JSON.parse(rs.rows[0].valor) : fallback
  } catch {
    return fallback
  }
}

async function computeSnapshot() {
  const conn = await db()
  const typeRs = await conn.execute('SELECT tipo, COUNT(*) AS count FROM publicacoes GROUP BY tipo')
  const typeMap = new Map(typeRs.rows.map((r) => [r.tipo, Number(r.count)]))
  const documentTypes = TYPE_STYLE
    .map(([type, color]) => ({ type, count: typeMap.get(type) || 0, color }))
    .filter((d) => d.count > 0)

  const yearRs = await conn.execute(
    'SELECT ano AS year, COUNT(*) AS documents FROM publicacoes WHERE ano IS NOT NULL GROUP BY ano ORDER BY ano'
  )
  const publicationsByYear = yearRs.rows.map((r) => ({ year: Number(r.year), documents: Number(r.documents) }))

  const kwRs = await conn.execute(
    `SELECT keyword, grupo AS "group", COUNT(*) AS documents
     FROM keywords_publicacao GROUP BY LOWER(keyword) ORDER BY documents DESC LIMIT 10`
  )
  const keywords = kwRs.rows.map((r) => ({ keyword: r.keyword, group: r.group, documents: Number(r.documents) }))

  const totalRs = await conn.execute('SELECT COUNT(*) AS n FROM patentes')
  const countryRs = await conn.execute(
    'SELECT pais_titular AS country, COUNT(*) AS count FROM patentes WHERE pais_titular IS NOT NULL GROUP BY pais_titular ORDER BY count DESC LIMIT 10'
  )
  const patents = {
    total: Number(totalRs.rows[0].n),
    byCountry: countryRs.rows.map((r) => ({ country: r.country, count: Number(r.count) })),
  }

  return {
    profile: { ...DEFAULT_PROFILE, ...(await readMeta('profile', {})) },
    source: { ...DEFAULT_SOURCE, ...(await readMeta('source', {})) },
    documentTypes,
    publicationsByYear,
    keywords,
    patents,
  }
}

// Returns the dashboard snapshot. Admin-published edits (snapshot_override)
// take precedence; otherwise it is computed live from the base tables.
export async function buildSnapshot() {
  if (cached) return cached
  const override = await readMeta('snapshot_override', null)
  cached = override || (await computeSnapshot())
  return cached
}

export async function verifyUser(username, password) {
  if (!username || !password) return false
  try {
    const rs = await (await db()).execute({ sql: 'SELECT senha_hash FROM usuarios WHERE username = ?', args: [username] })
    return rs.rows.length ? verifyPassword(password, rs.rows[0].senha_hash) : false
  } catch {
    return false
  }
}

// Persists an admin-edited snapshot back into the database (metadados table).
export async function saveSnapshot(data) {
  const upsert = (chave, valor) => ({
    sql: 'INSERT INTO metadados (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor',
    args: [chave, valor],
  })
  const stmts = []
  if (data.profile) stmts.push(upsert('profile', JSON.stringify(data.profile)))
  if (data.source) stmts.push(upsert('source', JSON.stringify(data.source)))
  stmts.push(upsert('snapshot_override', JSON.stringify(data)))
  await (await db()).batch(stmts, 'write')
  cached = data
  return data
}

export function invalidateCache() {
  cached = null
}
