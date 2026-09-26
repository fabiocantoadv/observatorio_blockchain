// Recria a tabela `autores_orcid` a partir do CSV do OpenAlex, sem reconstruir o banco inteiro.
// Uso: npm run import:orcid   (o arquivo openalex_consolidado_2026_set.csv deve estar na raiz)
import { createClient } from '@libsql/client'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseCsvFile } from './lib/csv.mjs'
import { buildOrcidTable } from './lib/orcid.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const csvPath = process.argv[2] || join(root, 'openalex_consolidado_2026_set.csv')
const dbPath = process.argv[3] || join(root, 'src', 'data', 'observatorio.sql')
if (!existsSync(csvPath)) {
  console.error(`CSV do OpenAlex não encontrado: ${csvPath}`)
  process.exit(1)
}

const rows = []
await parseCsvFile(csvPath, (o) => rows.push(o))
const table = buildOrcidTable(rows)

const db = createClient({ url: `file:${dbPath}` })
await db.execute('DROP TABLE IF EXISTS autores_orcid')
await db.execute('CREATE TABLE autores_orcid (autor TEXT PRIMARY KEY, orcid TEXT NOT NULL)')
for (let i = 0; i < table.length; i += 500) {
  await db.batch(table.slice(i, i + 500).map(([autor, orcid]) => ({ sql: 'INSERT INTO autores_orcid (autor, orcid) VALUES (?, ?)', args: [autor, orcid] })), 'write')
}
console.log(`Registros do OpenAlex lidos: ${rows.length}`)
console.log(`autores_orcid: ${table.length} autores com ORCID`)
