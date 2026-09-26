import { db } from './db.mjs'

// Patentes (tabela `patentes`): agregados e listagem, com filtros de ano de depósito,
// país do titular e busca textual. A base é pequena (centenas de linhas), então é
// carregada uma vez e filtrada em memória.

let patentsPromise = null

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

async function loadPatents() {
  if (patentsPromise) return patentsPromise
  patentsPromise = (async () => {
    const rs = await (await db()).execute(
      'SELECT numero_pedido, titulo, titular, pais_titular, data_deposito, ano, resumo FROM patentes'
    )
    return rs.rows.map((r) => ({
      numero: r.numero_pedido ? String(r.numero_pedido) : '',
      titulo: r.titulo ? String(r.titulo).trim() : '',
      titular: r.titular ? String(r.titular).replace(/\s+/g, ' ').trim() : 'Não informado',
      pais: r.pais_titular ? String(r.pais_titular).trim() : 'Não informado',
      data: r.data_deposito ? String(r.data_deposito) : '',
      ano: r.ano == null ? null : Number(r.ano),
      resumo: r.resumo ? String(r.resumo).replace(/\s+/g, ' ').trim() : '',
    }))
  })()
  return patentsPromise
}

export async function filterPatents({ ano, pais, q } = {}) {
  const all = await loadPatents()
  const year = ano && ano !== 'Todos' ? Number(ano) : null
  const country = pais && pais !== 'Todos' ? pais : null
  const needle = q ? normalizeText(q.trim()) : ''
  return all.filter((p) => (!year || p.ano === year)
    && (!country || p.pais === country)
    && (!needle || normalizeText(`${p.numero} ${p.titulo} ${p.titular} ${p.resumo}`).includes(needle)))
}

function countBy(list, key) {
  const counts = new Map()
  for (const item of list) counts.set(item[key], (counts.get(item[key]) || 0) + 1)
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || String(a.name).localeCompare(String(b.name), 'pt-BR'))
}

export async function buildPatentInsights(filters) {
  const all = await loadPatents()
  const list = await filterPatents(filters)
  const byYear = countBy(list.filter((p) => p.ano), 'ano').map(({ name, count }) => ({ year: Number(name), count })).sort((a, b) => a.year - b.year)
  const years = byYear.map((y) => y.year)
  return {
    total: list.length,
    applications: new Set(list.map((p) => p.numero).filter(Boolean)).size,
    brazil: list.filter((p) => p.pais === 'Brasil').length,
    period: years.length ? [years[0], years.at(-1)] : null,
    byYear,
    byCountry: countBy(list, 'pais').map(({ name, count }) => ({ country: name, count })),
    byHolder: countBy(list, 'titular').map(({ name, count }) => ({ holder: name, count })),
    // Opções dos filtros sempre sobre a base completa.
    options: {
      years: [...new Set(all.map((p) => p.ano).filter(Boolean))].sort((a, b) => a - b),
      countries: countBy(all, 'pais').map((c) => c.name),
    },
  }
}

export async function listPatents(filters, { page = 1, size = 10 } = {}) {
  const list = await filterPatents(filters)
  const sorted = [...list].sort((a, b) => b.data.localeCompare(a.data) || a.titulo.localeCompare(b.titulo, 'pt-BR'))
  const pageSize = Math.min(Math.max(Number(size) || 10, 1), 100)
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const current = Math.min(Math.max(Number(page) || 1, 1), pages)
  return {
    total: sorted.length,
    page: current,
    pages,
    items: sorted.slice((current - 1) * pageSize, current * pageSize),
    all: () => sorted,
  }
}
