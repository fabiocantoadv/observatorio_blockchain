import { db, TYPE_STYLE } from './db.mjs'

// Agregados detalhados (instituições, autores, países, idiomas, palavras-chave)
// calculados a partir das tabelas `publicacoes` e `keywords_publicacao`.
// Os registros são carregados uma vez e filtrados em memória (≈4 mil linhas).

// Agregador de repositórios (RCAAP/Portugal): é a instituição-fonte do registro
// no OASISbr, não a afiliação dos autores, então é tratado como "não informado".
const NOT_AFFILIATIONS = new Set([
  'FCCN, serviços digitais da FCT – Fundação para a Ciência e a Tecnologia',
])

// Marcadores de ausência que aparecem nos CSVs de origem.
const MISSING = new Set(['n/a', 'na', 'none', 'null', '-', 'não informado', 'não informado pela instituição', 'nao informado pela instituicao'])

function isMissing(value) {
  return !value || MISSING.has(value.trim().toLowerCase())
}

// Alguns campos do OpenAlex vêm como repr de lista Python: ['A', "B's", ...]
function parsePyList(text) {
  const out = []
  const re = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g
  let m
  while ((m = re.exec(text))) out.push((m[1] ?? m[2]).replace(/\\(.)/g, '$1'))
  return out
}

const LANGUAGE_CODES = {
  por: 'por', pt: 'por', pt_br: 'por', 'pt-br': 'por', 'português': 'por', portugues: 'por',
  eng: 'eng', en: 'eng', spa: 'spa', es: 'spa', ita: 'ita', it: 'ita',
  fra: 'fra', fre: 'fra', fr: 'fra', deu: 'deu', ger: 'deu', de: 'deu',
}

function unique(list) {
  return [...new Set(list.filter(Boolean))]
}

// Sufixo de sigla entre parênteses: "Universidade Federal Fluminense (UFF)" → sem a sigla,
// para unir as grafias do OASISbr e do OpenAlex.
function normalizeInstitution(name) {
  const clean = name.replace(/\s+/g, ' ').trim()
  if (isMissing(clean) || NOT_AFFILIATIONS.has(clean)) return null
  return clean.replace(/\s*\((?=[^)]*[A-Z])[A-Za-zÀ-ú0-9.\-\/ ]{2,20}\)$/, '').trim()
}

function parseInstitutions(raw) {
  if (!raw) return []
  const text = String(raw).trim()
  const names = text.startsWith('[') ? parsePyList(text) : text.split('||')
  return unique(names.map(normalizeInstitution))
}

function parseAuthors(raw, fonte) {
  if (!raw) return []
  const text = String(raw).trim()
  const names = text.startsWith('[') ? parsePyList(text) : text.split(fonte === 'openalex' ? '|' : '||')
  return unique(names.map((a) => a.replace(/\s+/g, ' ').trim()).filter((a) => !isMissing(a) && !/^\d{4}(-\d{2}){0,2}$/.test(a)))
}

function parseCountries(raw, fonte) {
  // No OASISbr o país é fixado como BR na ingestão; só o OpenAlex traz o país real dos autores.
  if (!raw || fonte !== 'openalex') return []
  // Formatos encontrados: "BR|US" e "[['BR'], ['BR', 'US']]"
  return unique(String(raw).toUpperCase().match(/\b[A-Z]{2}\b/g) || [])
}

function parseLanguages(raw) {
  if (!raw) return []
  return unique(String(raw).split('||').map((l) => LANGUAGE_CODES[l.trim().toLowerCase()] || null))
}

// Termos genéricos do próprio recorte (e variantes com prefixo de idioma, como "[pt] BLOCKCHAIN").
const KEYWORD_STOPLIST = new Set(['blockchain', 'blockchains', 'blockchain technology', 'tecnologia blockchain', 'tecnologia de blockchain', 'block chain'])

function cleanKeyword(raw) {
  const keyword = String(raw).replace(/^\[[a-z]{2}(?:[_-][a-z]{2})?\]\s*/i, '').replace(/\s+/g, ' ').trim()
  if (!keyword || isMissing(keyword) || KEYWORD_STOPLIST.has(keyword.toLowerCase())) return null
  return keyword
}

let recordsPromise = null
// ORCID por nome de autor (tabela autores_orcid, criada a partir das colunas de ORCID do CSV
// do OpenAlex por scripts/build-database.mjs ou scripts/import-orcid.mjs). Chave: nome em minúsculas com espaços normalizados.
let orcidByName = new Map()

function authorKey(name) {
  return String(name).replace(/\s+/g, ' ').trim().toLowerCase()
}

async function loadRecords() {
  if (recordsPromise) return recordsPromise
  recordsPromise = (async () => {
    const conn = await db()
    const pubs = await conn.execute(
      'SELECT id, fonte, titulo, tipo, ano, doi, autores, instituicoes, paises, idioma, topico_principal FROM publicacoes'
    )
    const kws = await conn.execute('SELECT publicacao_id, keyword, grupo FROM keywords_publicacao')
    try {
      const orcids = await conn.execute('SELECT autor, orcid FROM autores_orcid')
      orcidByName = new Map(orcids.rows.map((r) => [authorKey(r.autor), String(r.orcid)]))
    } catch {
      orcidByName = new Map() // tabela ainda não criada
    }
    const kwByPub = new Map()
    for (const r of kws.rows) {
      const id = Number(r.publicacao_id)
      if (!kwByPub.has(id)) kwByPub.set(id, [])
      const keyword = cleanKeyword(r.keyword)
      if (keyword && !kwByPub.get(id).some((k) => k.keyword.toLowerCase() === keyword.toLowerCase())) {
        kwByPub.get(id).push({ keyword, group: String(r.grupo) })
      }
    }
    return pubs.rows.map((r) => {
      const id = Number(r.id)
      const fonte = String(r.fonte)
      return {
        id,
        fonte,
        titulo: r.titulo ? String(r.titulo) : '',
        tipo: r.tipo ? String(r.tipo) : '',
        ano: r.ano == null ? null : Number(r.ano),
        doi: r.doi ? String(r.doi) : '',
        authors: parseAuthors(r.autores, fonte),
        institutions: parseInstitutions(r.instituicoes),
        countries: parseCountries(r.paises, fonte),
        languages: parseLanguages(r.idioma),
        keywords: kwByPub.get(id) || [],
        topic: r.topico_principal ? String(r.topico_principal) : '',
      }
    })
  })()
  return recordsPromise
}

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// Filtros cruzados: cada clique no painel acrescenta um critério. Todos combinam por "E".
//   tipo, ano        → campos do documento
//   instituicao      → o documento tem essa afiliação
//   autor            → o documento tem esse autor
//   pais             → código ISO do país dos autores (OpenAlex)
//   idioma           → código (por, eng…) ou "na" para idioma não informado
//   palavra          → palavra-chave (OASISbr)
//   topico           → tópico principal (OpenAlex)
//   q                → busca textual (só na listagem)
export const FILTER_KEYS = ['tipo', 'ano', 'instituicao', 'autor', 'pais', 'idioma', 'palavra', 'topico']

const lower = (v) => String(v || '').toLowerCase()

function activeFilters(filters = {}) {
  const f = {}
  for (const key of [...FILTER_KEYS, 'q']) {
    const value = String(filters[key] ?? '').trim()
    if (value && value !== 'Todos') f[key] = value
  }
  return f
}

const TESTS = {
  tipo: (r, v) => r.tipo === v,
  ano: (r, v) => r.ano === Number(v),
  instituicao: (r, v) => r.institutions.some((x) => lower(x) === lower(v)),
  autor: (r, v) => r.authors.some((x) => lower(x) === lower(v)),
  pais: (r, v) => r.countries.includes(v.toUpperCase()),
  idioma: (r, v) => (v === 'na' ? r.languages.length === 0 : r.languages.includes(v)),
  palavra: (r, v) => r.keywords.some((k) => lower(k.keyword) === lower(v)),
  topico: (r, v) => r.topic === v,
  q: (r, v) => normalizeText(`${r.titulo} ${r.authors.join(' ')} ${r.institutions.join(' ')}`).includes(normalizeText(v)),
}

function matcher(filters, except) {
  const entries = Object.entries(filters).filter(([key]) => key !== except)
  return (r) => entries.every(([key, value]) => TESTS[key](r, value))
}

export function parseFilters(url) {
  const f = {}
  for (const key of [...FILTER_KEYS, 'q']) f[key] = url.searchParams.get(key) || ''
  return f
}

export async function filterRecords(filters = {}) {
  const records = await loadRecords()
  return records.filter(matcher(activeFilters(filters)))
}

function countBy(records, pick, limit) {
  const counts = new Map()
  const labels = new Map()
  for (const r of records) {
    for (const item of pick(r)) {
      const key = typeof item === 'string' ? item.toLowerCase() : item.key
      counts.set(key, (counts.get(key) || 0) + 1)
      if (!labels.has(key)) labels.set(key, typeof item === 'string' ? item : item)
    }
  }
  const rows = [...counts.entries()]
    .map(([key, documents]) => ({ label: labels.get(key), documents }))
    .sort((a, b) => b.documents - a.documents || String(a.label).localeCompare(String(b.label), 'pt-BR'))
  return limit ? rows.slice(0, limit) : rows
}

export async function buildInsights(rawFilters) {
  const all = await loadRecords()
  const filters = activeFilters(rawFilters)
  delete filters.q
  // Cada gráfico é calculado com todos os filtros, menos o da sua própria dimensão:
  // assim o valor escolhido aparece destacado ao lado das alternativas (e dá para trocar com um clique).
  const subset = (except) => all.filter(matcher(filters, except))
  const records = subset(null)

  const byTypeSet = subset('tipo')
  const typeCounts = new Map()
  for (const r of byTypeSet) typeCounts.set(r.tipo, (typeCounts.get(r.tipo) || 0) + 1)
  const byType = TYPE_STYLE.map(([type, color]) => ({ type, color, count: typeCounts.get(type) || 0 })).filter((t) => t.count > 0)

  const yearCounts = new Map()
  for (const r of subset('ano')) if (r.ano) yearCounts.set(r.ano, (yearCounts.get(r.ano) || 0) + 1)
  const byYear = [...yearCounts.entries()].map(([year, documents]) => ({ year, documents })).sort((a, b) => a.year - b.year)

  const instSet = subset('instituicao')
  const authorSet = subset('autor')
  const countrySet = subset('pais').filter((r) => r.countries.length)
  const langSet = subset('idioma')
  const langWith = langSet.filter((r) => r.languages.length)
  const kwSet = subset('palavra')
  const topicSet = subset('topico').filter((r) => r.topic)

  const authorRows = countBy(authorSet, (r) => r.authors)

  return {
    total: records.length,
    filters,
    coverage: {
      institutions: instSet.filter((r) => r.institutions.length).length,
      countries: countrySet.length,
      languages: langWith.length,
      keywords: kwSet.filter((r) => r.keywords.length).length,
      topics: topicSet.length,
    },
    byType,
    byYear,
    institutions: countBy(instSet, (r) => r.institutions).map(({ label, documents }) => ({ name: label, documents })),
    authors: authorRows.map(({ label, documents }) => ({ name: label, documents, orcid: orcidByName.get(authorKey(label)) || '' })),
    authorsWithOrcid: authorRows.filter(({ label }) => orcidByName.has(authorKey(label))).length,
    countries: countBy(countrySet, (r) => r.countries, 10).map(({ label, documents }) => ({ code: label, documents, share: documents / countrySet.length })),
    languages: [
      ...countBy(langWith, (r) => r.languages).map(({ label, documents }) => ({ code: label, documents })),
      ...(langSet.length - langWith.length ? [{ code: 'na', documents: langSet.length - langWith.length }] : []),
    ],
    keywords: countBy(kwSet, (r) => r.keywords.map((k) => ({ key: k.keyword.toLowerCase(), ...k })), 50)
      .map(({ label, documents }) => ({ keyword: label.keyword, group: label.group, documents })),
    // Tópico principal do OpenAlex (primary_topic): todos os tópicos, do mais ao menos frequente.
    topics: countBy(topicSet, (r) => [r.topic]).map(({ label, documents }) => ({ topic: label, documents })),
  }
}

export async function listPublications(filters, { page = 1, size = 10 } = {}) {
  const records = await filterRecords(filters)
  const sorted = [...records].sort((a, b) => (b.ano || 0) - (a.ano || 0) || a.titulo.localeCompare(b.titulo, 'pt-BR'))
  const pageSize = Math.min(Math.max(Number(size) || 10, 1), 100)
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const current = Math.min(Math.max(Number(page) || 1, 1), pages)
  const toItem = (r) => ({
    titulo: r.titulo, tipo: r.tipo, ano: r.ano, fonte: r.fonte,
    doi: r.doi.startsWith('https://doi.org/') ? r.doi : '',
    autores: r.authors, instituicoes: r.institutions,
  })
  return {
    total: sorted.length,
    page: current,
    pages,
    items: sorted.slice((current - 1) * pageSize, current * pageSize).map(toItem),
    all: () => sorted.map(toItem),
  }
}
