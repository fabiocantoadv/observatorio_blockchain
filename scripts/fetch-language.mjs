// Acrescenta a coluna `language` ao CSV do OpenAlex, consultando a API do OpenAlex
// (campo language de cada obra, código ISO 639-1 como "en" ou "pt", em lotes de 50 IDs).
// Obras sem idioma na API, ou não encontradas (mescladas/removidas), ficam com o valor vazio.
//
// Uso: node scripts/fetch-language.mjs [caminho-do-csv]   (precisa de acesso a api.openalex.org)
// Depois, rode `npm run build:data` para levar a coluna ao banco (publicacoes.idioma).
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseCsvText, csvCell } from './lib/csv-text.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const csvPath = process.argv[2] || join(root, 'openalex_consolidado_2026_set.csv')
const MAILTO = process.env.OPENALEX_MAILTO || ''

const rows = parseCsvText(await readFile(csvPath, 'utf8'))
const header = rows[0]
const idCol = header.indexOf('id')
let langCol = header.indexOf('language')
if (langCol < 0) { header.push('language'); langCol = header.length - 1 }

const ids = [...new Set(rows.slice(1).map((r) => (r[idCol] || '').split('/').pop()).filter((id) => /^W\d+$/.test(id)))]
const languages = new Map()
for (let i = 0; i < ids.length; i += 50) {
  const batch = ids.slice(i, i + 50)
  const url = `https://api.openalex.org/works?filter=openalex:${batch.join('|')}&select=id,language&per_page=50${MAILTO ? `&mailto=${MAILTO}` : ''}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`OpenAlex respondeu ${res.status} no lote ${i / 50 + 1}`)
  for (const w of (await res.json()).results) languages.set(w.id.split('/').pop(), w.language || '')
  process.stdout.write(`\r  ${Math.min(i + 50, ids.length)}/${ids.length}`)
}

for (const r of rows.slice(1)) {
  while (r.length < header.length) r.push('')
  r[langCol] = languages.get((r[idCol] || '').split('/').pop()) || ''
}
await writeFile(csvPath, rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n')
console.log(`\nlanguage preenchido em ${[...languages.values()].filter(Boolean).length} de ${rows.length - 1} registros.`)
