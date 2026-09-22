// Shared read-only access to the SQLite database that backs the dashboard.
// The observatorio.sql file is a SQLite binary generated at build time by
// scripts/build-database.mjs from the source CSVs and shipped with the deploy.
//
// observatorio.sql is the single source of truth: chart aggregations come from
// the publicacoes/keywords_publicacao/patentes tables, and profile/source come
// from the metadados key/value table. Admin edits (when configured) are layered
// on top via Vercel Blob in api/data.js.

import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

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

function readMeta(db, key, fallback) {
  try {
    const row = db.prepare('SELECT valor FROM metadados WHERE chave = ?').get(key)
    return row ? { ...fallback, ...JSON.parse(row.valor) } : fallback
  } catch {
    return fallback
  }
}

// Builds the dashboard snapshot straight from the SQLite database.
// Returns null when the database file is not present (e.g. an environment
// where the native module is unavailable); the client handles that gracefully.
export function buildSnapshotFromDatabase() {
  if (cached) return cached
  if (!existsSync(dbPath)) return null

  const db = new Database(dbPath, { readonly: true, fileMustExist: true })

  try {
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

    cached = {
      profile: readMeta(db, 'profile', DEFAULT_PROFILE),
      source: readMeta(db, 'source', DEFAULT_SOURCE),
      documentTypes,
      publicationsByYear,
      keywords,
      patents,
    }
    return cached
  } finally {
    db.close()
  }
}
