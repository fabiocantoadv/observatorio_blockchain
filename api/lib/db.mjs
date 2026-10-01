import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { verifyPassword } from './password.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const localFile = join(here, '..', '..', 'src', 'data', 'observatorio.sql')

let clientPromise = null
export async function db() {
  if (clientPromise) return clientPromise
  const url = process.env.TURSO_DATABASE_URL
  clientPromise = (async () => {
    if (url) {
      const { createClient } = await import('@libsql/client/web')
      return createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
    }
    const { createClient } = await import('@libsql/client')
    return createClient({ url: `file:${localFile.replace(/\\/g, '/')}` })
  })()
  return clientPromise
}

export const TYPE_STYLE = [
  ['Artigo', '#0a0a8c'],
  ['TCC', '#00f0dc'],
  ['Dissertação', '#001eff'],
  ['Tese', '#ffff00'],
  ['Capítulo de livro', '#6678ff'],
  ['Livro', '#00a99d'],
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
