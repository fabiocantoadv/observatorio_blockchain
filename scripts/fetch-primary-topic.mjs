// Acrescenta a coluna `primary_topic` ao CSV do OpenAlex, consultando a API do OpenAlex
// (campo primary_topic.display_name de cada obra, em lotes de 50 IDs).
// Obras que não forem encontradas na API (mescladas/removidas) ficam com o valor vazio.
//
// Uso: node scripts/fetch-primary-topic.mjs [caminho-do-csv]   (precisa de acesso a api.openalex.org)
// Depois, rode `npm run build:data` para levar a coluna ao banco (publicacoes.topico_principal).
import { readFile, writeFile, copyFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const csvPath = process.argv[2] || join(root, 'openalex_consolidado_2026_set.csv')
const MAILTO = process.env.OPENALEX_MAILTO || ''

function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else q = false } else field += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows
}
const cell = (v) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

const rows = parseCsv(await readFile(csvPath, 'utf8'))
const header = rows[0]
const idCol = header.indexOf('id')
let topicCol = header.indexOf('primary_topic')
if (topicCol < 0) { header.push('primary_topic'); topicCol = header.length - 1 }

const ids = [...new Set(rows.slice(1).map((r) => (r[idCol] || '').split('/').pop()).filter((id) => /^W\d+$/.test(id)))]
const topics = new Map()
for (let i = 0; i < ids.length; i += 50) {
  const batch = ids.slice(i, i + 50)
  const url = `https://api.openalex.org/works?filter=openalex:${batch.join('|')}&select=id,primary_topic&per_page=50${MAILTO ? `&mailto=${MAILTO}` : ''}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`OpenAlex respondeu ${res.status} no lote ${i / 50 + 1}`)
  for (const w of (await res.json()).results) topics.set(w.id.split('/').pop(), w.primary_topic?.display_name || '')
  process.stdout.write(`\r  ${Math.min(i + 50, ids.length)}/${ids.length}`)
}

for (const r of rows.slice(1)) {
  while (r.length < header.length) r.push('')
  r[topicCol] = topics.get((r[idCol] || '').split('/').pop()) || ''
}
const backup = csvPath.replace(/\.csv$/, '.antes_primary_topic.csv')
if (!existsSync(backup)) await copyFile(csvPath, backup)
await writeFile(csvPath, rows.map((r) => r.map(cell).join(',')).join('\n') + '\n')
console.log(`\nprimary_topic preenchido em ${[...topics.values()].filter(Boolean).length} de ${rows.length - 1} registros.`)
