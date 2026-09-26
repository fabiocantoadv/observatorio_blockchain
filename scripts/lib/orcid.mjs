// ORCID dos autores a partir do CSV do OpenAlex (colunas authorships_author_display_name
// e authorships_author_orcid). Há dois formatos no arquivo:
//   - repr de lista Python, posicional: ['Ana', 'Beto'] / ['https://orcid.org/…', None]
//   - texto separado por "|": só é posicional quando as duas listas têm o mesmo tamanho
//     (quando algum autor não tem ORCID, o valor dele é omitido e não dá para alinhar).
// Resultado: nome → ORCID mais frequente; nomes com empate entre ORCIDs são descartados.

function parsePyList(text) {
  const out = []
  const re = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|None/g
  let m
  while ((m = re.exec(text))) out.push(m[0] === 'None' ? null : (m[1] ?? m[2]).replace(/\\(.)/g, '$1'))
  return out
}

function splitField(value) {
  const text = String(value || '').trim()
  if (!text) return []
  return text.startsWith('[') ? parsePyList(text) : text.split('|')
}

const normalizeName = (name) => String(name).replace(/\s+/g, ' ').trim()

export function orcidPairsFromOpenalexRow(row) {
  const names = splitField(row.authorships_author_display_name)
  const orcids = splitField(row.authorships_author_orcid)
  if (!names.length || names.length !== orcids.length) return []
  const pairs = []
  names.forEach((name, i) => {
    const orcid = orcids[i] && String(orcids[i]).trim().replace('https://orcid.org/', '')
    if (name && orcid && /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(orcid)) pairs.push([normalizeName(name), orcid])
  })
  return pairs
}

export function buildOrcidTable(openalexRows) {
  const counts = new Map()
  for (const row of openalexRows) {
    for (const [name, orcid] of orcidPairsFromOpenalexRow(row)) {
      if (!counts.has(name)) counts.set(name, new Map())
      const c = counts.get(name)
      c.set(orcid, (c.get(orcid) || 0) + 1)
    }
  }
  const rows = []
  for (const [name, c] of counts) {
    const ranked = [...c.entries()].sort((a, b) => b[1] - a[1])
    if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) continue
    rows.push([name, ranked[0][0]])
  }
  return rows
}
