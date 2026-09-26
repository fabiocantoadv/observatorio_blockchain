// Preenche a tabela `autores_orcid` com o ORCID dos autores dos registros do OpenAlex.
// Consulta a API do OpenAlex pelos IDs das obras já presentes em `publicacoes` (fonte openalex),
// em lotes de 50, e associa nome do autor → ORCID (o mais frequente; empates são descartados).
//
// Uso: node scripts/fetch-orcid.mjs   (precisa de acesso a api.openalex.org)
import { createClient } from '@libsql/client'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dbPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'observatorio.sql')
const db = createClient({ url: `file:${dbPath}` })
const MAILTO = process.env.OPENALEX_MAILTO || ''

const rs = await db.execute("SELECT external_id FROM publicacoes WHERE fonte = 'openalex' AND external_id LIKE '%openalex.org/W%'")
const ids = rs.rows.map((r) => String(r.external_id).split('/').pop())
console.log(`Obras do OpenAlex no banco: ${ids.length}`)

const counts = new Map() // nome -> Map(orcid -> n)
let found = 0
for (let i = 0; i < ids.length; i += 50) {
  const batch = ids.slice(i, i + 50)
  const url = `https://api.openalex.org/works?filter=openalex:${batch.join('|')}&select=id,authorships&per_page=50${MAILTO ? `&mailto=${MAILTO}` : ''}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`OpenAlex respondeu ${res.status} no lote ${i / 50 + 1}`)
  const { results } = await res.json()
  found += results.length
  for (const work of results) {
    for (const a of work.authorships || []) {
      const name = a.author?.display_name
      const orcid = a.author?.orcid
      if (!name || !orcid) continue
      if (!counts.has(name)) counts.set(name, new Map())
      const c = counts.get(name)
      c.set(orcid, (c.get(orcid) || 0) + 1)
    }
  }
  process.stdout.write(`\r  ${Math.min(i + 50, ids.length)}/${ids.length}`)
}
console.log(`\nObras encontradas na API: ${found}`)

const rows = []
for (const [name, c] of counts) {
  const ranked = [...c.entries()].sort((x, y) => y[1] - x[1])
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) continue
  rows.push([name, ranked[0][0].replace('https://orcid.org/', '')])
}

await db.execute('DROP TABLE IF EXISTS autores_orcid')
await db.execute('CREATE TABLE autores_orcid (autor TEXT PRIMARY KEY, orcid TEXT NOT NULL)')
for (let i = 0; i < rows.length; i += 500) {
  await db.batch(rows.slice(i, i + 500).map(([autor, orcid]) => ({ sql: 'INSERT INTO autores_orcid (autor, orcid) VALUES (?, ?)', args: [autor, orcid] })), 'write')
}
console.log(`autores_orcid: ${rows.length} autores com ORCID`)
