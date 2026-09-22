// Shared access to the SQLite database that backs the dashboard.
// The observatorio.sql file is a SQLite binary generated at build time by
// scripts/build-database.mjs from the source CSVs.
//
// observatorio.sql is the single source of truth:
//   - chart aggregations come from publicacoes/keywords_publicacao/patentes
//   - profile/source live in the metadados key/value table
//   - admin users live in the usuarios table (scrypt-hashed passwords)
//   - admin edits are persisted back into metadados as a "snapshot_override"
//
// Note (POC): writing to the .sql only persists where the filesystem is
// writable (e.g. running locally). On serverless the file is read-only.

import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { verifyPassword } from '../../scripts/lib/password.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const dbPath = join(here, '..', '..', 'src', 'data', 'observatorio.sql')

// Presentation palette for the document-type donut (colours are not stored in
// the database, only the counts are).
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

function openRead() {
  return new Database(dbPath, { readonly: true, fileMustExist: true })
}

function readMeta(db, key, fallback) {
  try {
    const row = db.prepare('SELECT valor FROM metadados WHERE chave = ?').get(key)
    return row ? JSON.parse(row.valor) : fallback
  } catch {
    return fallback
  }
}

// Recomputes the aggregated snapshot from the base tables.
function computeSnapshot(db) {
  const typeMap = new Map(
    db.prepare('SELECT tipo, COUNT(*) AS count FROM publicacoes GROUP BY tipo').all().map((r) => [r.tipo, r.count])
  )
  const documentTypes = TYPE_STYLE
    .map(([type, color]) => ({ type, count: typeMap.get(type) || 0, color }))
    .filter((d) => d.count > 0)

  const publicationsByYear = db.prepare(
    'SELECT ano AS year, COUNT(*) AS documents FROM publicacoes WHERE ano IS NOT NULL GROUP BY ano ORDER BY ano'
  ).all()

  const keywords = db.prepare(
    `SELECT keyword, grupo AS "group", COUNT(*) AS documents
     FROM keywords_publicacao GROUP BY LOWER(keyword) ORDER BY documents DESC LIMIT 10`
  ).all()

  const patents = {
    total: db.prepare('SELECT COUNT(*) AS n FROM patentes').get().n,
    byCountry: db.prepare(
      'SELECT pais_titular AS country, COUNT(*) AS count FROM patentes WHERE pais_titular IS NOT NULL GROUP BY pais_titular ORDER BY count DESC LIMIT 10'
    ).all(),
  }

  return {
    profile: { ...DEFAULT_PROFILE, ...readMeta(db, 'profile', {}) },
    source: { ...DEFAULT_SOURCE, ...readMeta(db, 'source', {}) },
    documentTypes,
    publicationsByYear,
    keywords,
    patents,
  }
}

// Builds the dashboard snapshot from the database. If an admin has published
// edits, the stored override is returned; otherwise it is computed live from
// the base tables. Returns null when the database file is absent.
export function buildSnapshotFromDatabase() {
  if (cached) return cached
  if (!existsSync(dbPath)) return null

  const db = openRead()
  try {
    const override = readMeta(db, 'snapshot_override', null)
    cached = override || computeSnapshot(db)
    return cached
  } finally {
    db.close()
  }
}

// Verifies admin credentials against the usuarios table.
export function verifyUser(username, password) {
  if (!existsSync(dbPath)) return false
  const db = openRead()
  try {
    const row = db.prepare('SELECT senha_hash FROM usuarios WHERE username = ?').get(username)
    return row ? verifyPassword(password, row.senha_hash) : false
  } catch {
    return false
  } finally {
    db.close()
  }
}

// Persists an admin-edited snapshot back into the database (metadados table).
// Stores profile/source separately and the full snapshot as an override so the
// dashboard reflects the edits. Throws if the file is not writable.
export function saveSnapshotToDatabase(data) {
  const db = new Database(dbPath, { fileMustExist: true })
  try {
    const upsert = db.prepare(
      'INSERT INTO metadados (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor'
    )
    const tx = db.transaction(() => {
      if (data.profile) upsert.run('profile', JSON.stringify(data.profile))
      if (data.source) upsert.run('source', JSON.stringify(data.source))
      upsert.run('snapshot_override', JSON.stringify(data))
    })
    tx()
    cached = data
    return data
  } finally {
    db.close()
  }
}

// Clears the in-memory cache (used after writes from a different path).
export function invalidateCache() {
  cached = null
}
