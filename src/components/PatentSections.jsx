import { useEffect, useMemo, useState } from 'react'
import { VegaChart } from './VegaChart'
import { DataTable, Pager } from './DataTable'

// Aba "Patentes": indicadores da tabela `patentes` via /api/patentes,
// com filtros cruzados: clicar num ano, país ou titular filtra a aba inteira (onFilter).

const AXIS_LABEL = '#3b4175'
const AXIS_MUTED = '#5c6390'
const GRID = '#e4e6f3'
const fmt = (value) => new Intl.NumberFormat('pt-BR').format(value)

function query(params) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value && value !== 'Todos') search.set(key, value)
  const text = search.toString()
  return text ? `?${text}` : ''
}

function Panel({ label, title, chip, note, children }) {
  return <article className="panel">
    <div className="panel-heading"><div><h2>{title}</h2></div>{chip && <span className="data-chip">{chip}</span>}</div>
    {children}
    {note && <p className="panel-note">{note}</p>}
  </article>
}

function Empty({ children = 'Nenhuma patente no recorte selecionado.' }) {
  return <p className="empty-state">{children}</p>
}

const DIM_OPACITY = 0.3
const selectedOpacity = (field, value) => (value
  ? { condition: { test: `lower(datum[${JSON.stringify(field)}]) === ${JSON.stringify(String(value).toLowerCase())}`, value: 1 }, value: DIM_OPACITY }
  : { value: 1 })

function horizontalBar(values, { label, color, height, title, selected }) {
  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    background: 'transparent',
    width: 'container',
    height,
    data: { values },
    mark: { type: 'bar', cornerRadiusEnd: 5, height: { band: 0.72 }, color, cursor: 'pointer' },
    encoding: {
      opacity: selectedOpacity(label, selected),
      y: { field: label, type: 'nominal', sort: '-x', axis: { title: null, labelColor: AXIS_LABEL, labelLimit: 300, labelPadding: 9, domain: false, ticks: false } },
      x: { field: 'count', type: 'quantitative', axis: { title: null, labelColor: AXIS_MUTED, gridColor: GRID, domain: false, ticks: false, tickCount: 6, format: 'd' } },
      tooltip: [{ field: label, title }, { field: 'count', title: 'Patentes' }],
    },
    config: { axis: { labelFont: 'Manrope, Arial, sans-serif' }, view: { stroke: null } },
  }
}

function PatentList({ filters }) {
  const filterKey = JSON.stringify(filters)
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState({ total: 0, page: 1, pages: 1, items: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])
  useEffect(() => setPage(1), [debounced, filterKey])

  useEffect(() => {
    let active = true
    setLoading(true)
    fetch(`/api/patentes${query({ ...filters, q: debounced, page, size: 10 })}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((payload) => { if (active) setResult(payload) })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [filterKey, debounced, page])

  return <div className="data-table-wrap">
    <div className="table-toolbar">
      <label className="table-search"><span aria-hidden="true">⌕</span>
        <input type="search" value={search} placeholder="Buscar por número, título, titular ou resumo…" aria-label="Buscar patentes" onChange={(e) => setSearch(e.target.value)} />
      </label>
      <small>{loading ? 'Carregando…' : `${fmt(result.total)} patentes`}</small>
    </div>
    <div className="table-scroll">
      <table className="data-table publications">
        <thead><tr><th className="num">#</th><th>Nº do pedido</th><th>Título</th><th>Titular</th><th>País do titular</th><th className="num">Depósito</th></tr></thead>
        <tbody>
          {result.items.length ? result.items.map((p, index) => <tr key={`${result.page}-${index}`}>
            <td className="num muted">{(result.page - 1) * 10 + index + 1}</td>
            <td className="mono">{p.numero || '—'}</td>
            <td className="title-cell">{p.resumo
              ? <details><summary>{p.titulo || '—'}</summary><p className="abstract">{p.resumo}</p></details>
              : (p.titulo || '—')}</td>
            <td><div className="clamp">{p.titular}</div></td>
            <td>{p.pais}</td>
            <td className="num">{p.data ? p.data.split('-').reverse().join('/') : '—'}</td>
          </tr>) : <tr><td colSpan={6} className="muted">{loading ? 'Carregando…' : 'Nenhuma patente encontrada.'}</td></tr>}
        </tbody>
      </table>
    </div>
    <div className="table-footer">
      <a className="export-button" href={`/api/patentes${query({ ...filters, q: debounced, format: 'csv' })}`}>Exportar CSV ↓</a>
      <Pager page={result.page} pages={result.pages} onPage={setPage} />
    </div>
  </div>
}

export function PatentSections({ filters, onFilter, onSummary }) {
  const filterKey = JSON.stringify(filters)
  const sel = (key) => (filters[key] && filters[key] !== 'Todos' ? String(filters[key]) : '')
  const pick = (key) => (value) => onFilter?.(key, value)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setError('')
    fetch(`/api/patentes${query({ view: 'insights', ...filters })}`)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error('Não foi possível carregar os dados de patentes.')))
      .then((payload) => { if (active) { setData(payload); onSummary?.({ total: payload.total, applications: payload.applications }) } })
      .catch((e) => { if (active) setError(e.message) })
    return () => { active = false }
  }, [filterKey])

  const specs = useMemo(() => {
    if (!data) return null
    const countries = data.byCountry.slice(0, 10)
    const holders = data.byHolder.slice(0, 10)
    // O titular escolhido sempre aparece no gráfico, mesmo fora dos 10 maiores.
    if (sel('titular') && !holders.some((h) => h.holder.toLowerCase() === sel('titular').toLowerCase())) holders.push(...data.byHolder.filter((h) => h.holder.toLowerCase() === sel('titular').toLowerCase()))
    return {
      years: {
        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
        background: 'transparent',
        width: 'container',
        height: 260,
        data: { values: data.byYear },
        layer: [
          { mark: { type: 'bar', color: '#001eff', cornerRadiusEnd: 4, width: { band: 0.7 }, cursor: 'pointer' } },
          { mark: { type: 'text', dy: -8, color: '#0a0a8c', fontWeight: 700, fontSize: 11, font: 'Manrope, Arial, sans-serif' }, encoding: { text: { field: 'count', type: 'quantitative' } } },
        ],
        encoding: {
          x: { field: 'year', type: 'ordinal', axis: { title: null, labelColor: AXIS_MUTED, labelAngle: 0, domain: false, ticks: false, labelPadding: 8 } },
          y: { field: 'count', type: 'quantitative', axis: { title: null, labelColor: AXIS_MUTED, gridColor: GRID, domain: false, ticks: false, tickCount: 5, format: 'd' } },
          opacity: sel('ano') ? { condition: { test: `datum.year == ${Number(sel('ano'))}`, value: 1 }, value: DIM_OPACITY } : { value: 1 },
          tooltip: [{ field: 'year', title: 'Ano de depósito' }, { field: 'count', title: 'Patentes' }],
        },
        config: { axis: { labelFont: 'Manrope, Arial, sans-serif' }, view: { stroke: null } },
      },
      countries: horizontalBar(countries, { label: 'country', color: '#0a0a8c', height: 260, title: 'País do titular', selected: sel('pais') }),
      holders: horizontalBar(holders, { label: 'holder', color: '#001eff', height: 360, title: 'Titular', selected: sel('titular') }),
    }
  }, [data])

  if (error) return <p className="panel-note detail-error">{error}</p>
  if (!data || !specs) return <p className="panel-note detail-loading">Carregando patentes…</p>

  const leadHolder = data.byHolder[0]

  return <div className="patent-sections">
    {data.total === 0 ? <Empty /> : <>
      <section className="detail-grid">
        <Panel label="TENDÊNCIA" title="Depósitos por ano" note="Ano da data de depósito. Pedidos ficam em sigilo por até 18 meses, por isso os anos mais recentes aparecem incompletos.">
          <VegaChart spec={specs.years} onClick={(d) => d.year && pick('ano')(String(d.year))} />
        </Panel>
        <Panel label="GEOGRAFIA" title="Depósitos por país do titular" chip={data.byCountry.length > 10 ? 'Top 10' : undefined}>
          <VegaChart spec={specs.countries} onClick={(d) => d.country && pick('pais')(d.country)} />
        </Panel>
      </section>

      <section className="detail-grid">
        <Panel label="TITULARES" title="Principais titulares" chip={data.byHolder.length > 10 ? 'Top 10' : undefined} note={leadHolder ? `Líder: ${leadHolder.holder} (${fmt(leadHolder.count)}). Nomes como aparecem na base; variações de grafia do mesmo titular não foram unificadas.` : undefined}>
          <VegaChart spec={specs.holders} onClick={(d) => d.holder && pick('titular')(d.holder)} />
        </Panel>
        <Panel label="TITULARES" title="Titulares" chip={`${fmt(data.byHolder.length)} titulares`}>
          <DataTable columns={[{ key: 'holder', label: 'Titular' }, { key: 'count', label: 'Patentes', align: 'right' }]} rows={data.byHolder} exportName="titulares.csv" onRowClick={(row) => pick('titular')(row.holder)} rowKey="holder" selectedKey={sel('titular')} />
        </Panel>
      </section>

      <Panel label="REGISTROS" title="Listagem das patentes" note="Clique no título para ver o resumo.">
        <PatentList filters={filters} />
      </Panel>
    </>}
  </div>
}
