import { useEffect, useMemo, useRef, useState } from 'react'
import { VegaChart } from './VegaChart'
import { DataTable, Pager } from './DataTable'
import networkIllustration from '../assets/rede-coautoria-ilustrativa.svg'

// Seções da aba Publicações, calculadas a partir do banco via /api/insights e /api/publicacoes.
// Filtros cruzados: clicar num tipo, ano, instituição, autor, país, idioma, palavra-chave ou tópico
// filtra o painel inteiro (onFilter). Cada gráfico mostra o próprio valor escolhido em destaque.

// Treemap de palavras-chave: rampa sequencial suave, do cinza claro (menos ocorrências)
// ao verde escuro (mais ocorrências).
const FREQ_RAMP = ['#eef0f2', '#d3d9d7', '#adc6b8', '#7aad90', '#448c68', '#1f6b4a']
const FREQ_DARK_FROM = 0.7 // a partir desta posição na rampa o texto passa a branco
// Treemaps de tópicos e palavras-chave: rampa do cinza-azulado claro a um azul intermediário.
const TOPIC_RAMP = ['#eef0f5', '#d5dcf0', '#b3c0ea', '#8a9fe3', '#5f7bdb', '#3a5bd3']
const TOPIC_DARK_FROM = 0.78

// Mapa de coautoria publicado no painel Kibana (VOSviewer).
const NETWORK_URL = 'https://app.vosviewer.com/?json=https%3A%2F%2Fdrive.google.com%2Fuc%3Fid%3D1ETJSDQR_xOOfvf1A4gHdX5zCqQ55Za1a'

const LANGUAGE_LABELS = { por: 'Português', eng: 'Inglês', spa: 'Espanhol', ita: 'Italiano', fra: 'Francês', deu: 'Alemão', na: 'Não informado' }
const LANGUAGE_COLORS = { por: '#001eff', eng: '#00f0dc', spa: '#ffff00', ita: '#6678ff', fra: '#0a0a8c', deu: '#00a99d', na: '#cfd3ea' }

// Mesma altura para os dois gráficos de barras lado a lado.
const BAR_ROW_HEIGHT = 440
const TREEMAP_HEIGHT = 560
const TOPICS_SHOWN = 60
const KEYWORD_TOOLTIP = [['Tema', 'group']]

const AXIS_LABEL = '#3b4175'
const AXIS_MUTED = '#5c6390'
const GRID = '#e4e6f3'

const fmt = (value) => new Intl.NumberFormat('pt-BR').format(value)
const pct = (value) => `${(value * 100).toFixed(1).replace('.', ',')}%`

let regionNames
function countryName(code) {
  try {
    regionNames ||= new Intl.DisplayNames(['pt-BR'], { type: 'region' })
    return regionNames.of(code) || code
  } catch {
    return code
  }
}

function query(params) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value && value !== 'Todos') search.set(key, value)
  const text = search.toString()
  return text ? `?${text}` : ''
}

function useContainerSize() {
  const ref = useRef(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    if (!ref.current) return undefined
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.floor(entry.contentRect.width)
      const height = Math.floor(entry.contentRect.height)
      setSize((s) => (s.width === width && s.height === height ? s : { width, height }))
    })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  return [ref, size]
}

function FrequencyLegend({ ramp = FREQ_RAMP }) {
  return <div className="freq-legend" aria-hidden="true">
    <span>Menos ocorrências</span>
    <i style={{ background: `linear-gradient(90deg, ${ramp.join(', ')})` }}></i>
    <span>Mais ocorrências</span>
  </div>
}
function Panel({ label, title, chip, note, className = '', onClear, children }) {
  return <article className={`panel ${className}`}>
    <div className="panel-heading"><div><h2>{title}</h2></div>{(chip || onClear) && <div className="panel-actions">{onClear && <button type="button" className="chart-clear" onClick={onClear} title="Remover o filtro deste gráfico">× Limpar filtro</button>}{chip && <span className="data-chip">{chip}</span>}</div>}</div>
    {children}
    {note && <p className="panel-note">{note}</p>}
  </article>
}

function Empty({ children = 'Sem dados para o recorte selecionado.' }) {
  return <p className="empty-state">{children}</p>
}

const DIM_OPACITY = 0.3

function horizontalBar(values, { field, label, color, height, tooltipTitle, shareField, selected, selectField }) {
  const key = selectField || label
  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    background: 'transparent',
    width: 'container',
    height,
    data: { values },
    mark: { type: 'bar', cornerRadiusEnd: 5, height: { band: 0.72 }, color, cursor: 'pointer' },
    encoding: {
      opacity: selected ? { condition: { test: `lower(datum[${JSON.stringify(key)}]) === ${JSON.stringify(String(selected).toLowerCase())}`, value: 1 }, value: DIM_OPACITY } : { value: 1 },
      y: { field: label, type: 'nominal', sort: '-x', axis: { title: null, labelColor: AXIS_LABEL, labelLimit: 260, labelPadding: 9, domain: false, ticks: false } },
      x: { field, type: 'quantitative', axis: { title: null, labelColor: AXIS_MUTED, gridColor: GRID, domain: false, ticks: false, tickCount: 6 } },
      tooltip: [{ field: label, title: tooltipTitle }, { field, title: 'Documentos', format: ',' }, ...(shareField ? [{ field: shareField, title: '% dos documentos', format: '.1%' }] : [])],
    },
    config: { axis: { labelFont: 'Manrope, Arial, sans-serif' }, view: { stroke: null } },
  }
}

// Treemap genérico por frequência. items: [{ label, documents, ...campos extras }].
// tooltipFields: [[título, campo]] exibidos além do rótulo e da contagem; shareTitle: rótulo do percentual.
const NO_FIELDS = []
function FrequencyTreemap({ items: keywords, labelTitle, tooltipFields = NO_FIELDS, shareTitle, ramp = FREQ_RAMP, darkFrom = FREQ_DARK_FROM, selected = '', onSelect }) {
  const sel = String(selected || '').toLowerCase()
  // O treemap ocupa toda a altura do contêiner (definida pelo CSS de .treemap-wrap).
  const [ref, { width, height: boxHeight }] = useContainerSize()
  const height = boxHeight || TREEMAP_HEIGHT // a altura mínima vem do CSS (.treemap-wrap)
  const total = keywords.reduce((sum, k) => sum + k.documents, 0)
  const counts = keywords.map((k) => k.documents)
  const lo = Math.min(...counts)
  const hi = Math.max(...counts, lo + 1)
  const spec = useMemo(() => width && height ? ({
    $schema: 'https://vega.github.io/schema/vega/v6.json',
    width,
    height,
    padding: 0,
    autosize: 'none',
    data: [
      {
        name: 'tree',
        values: [{ id: 'root' }, ...keywords.map((k, i) => ({ id: `k${i}`, parent: 'root', ...k, share: k.documents / (k.shareBase || total) }))],
        transform: [
          { type: 'stratify', key: 'id', parentKey: 'parent' },
          { type: 'treemap', field: 'documents', sort: { field: 'value', order: 'descending' }, round: true, method: 'squarify', ratio: 1.4, paddingInner: 2, size: [{ signal: 'width' }, { signal: 'height' }] },
        ],
      },
      { name: 'leaves', source: 'tree', transform: [{ type: 'filter', expr: 'datum.parent' }] },
    ],
    scales: [
      // Escala logarítmica: poucas palavras concentram muitas ocorrências (ex.: Bitcoin).
      { name: 'fill', type: 'log', domain: [lo, hi], range: ramp, interpolate: 'rgb', clamp: true },
      { name: 'pos', type: 'log', domain: [lo, hi], range: [0, 1], clamp: true },
    ],
    marks: [
      {
        type: 'rect', from: { data: 'leaves' },
        encode: {
          enter: {
            x: { field: 'x0' }, y: { field: 'y0' }, x2: { field: 'x1' }, y2: { field: 'y1' },
            fill: { scale: 'fill', field: 'documents' }, cornerRadius: { value: 4 }, cursor: { value: onSelect ? 'pointer' : 'default' },
            stroke: { signal: sel ? `lower(datum.label) === ${JSON.stringify(sel)} ? '#0a0a8c' : '#ffffff'` : "'#ffffff'" },
            strokeWidth: { signal: sel ? `lower(datum.label) === ${JSON.stringify(sel)} ? 3 : 2` : '2' },
            tooltip: { signal: `{${[`'${labelTitle}': datum.label`, "'Documentos': datum.documents", ...tooltipFields.map(([t, f]) => `'${t}': datum.${f}`), `'${shareTitle}': format(datum.share, '.1%')`].join(', ')}}` },
          },
          hover: { fillOpacity: { value: 0.8 } },
          update: { fillOpacity: { signal: sel ? `lower(datum.label) === ${JSON.stringify(sel)} ? 1 : ${DIM_OPACITY + 0.2}` : '1' } },
        },
      },
      {
        type: 'text', from: { data: 'leaves' }, interactive: false,
        encode: {
          enter: {
            x: { signal: 'datum.x0 + 7' }, y: { signal: 'datum.y0 + 17' },
            text: { field: 'label' }, fill: { signal: `scale('pos', datum.documents) > ${darkFrom} ? '#ffffff' : '#1f2a33'` },
            font: { value: 'Manrope, Arial, sans-serif' }, fontSize: { value: 12 }, fontWeight: { value: 700 },
            limit: { signal: 'datum.x1 - datum.x0 - 12' },
            opacity: { signal: '(datum.x1 - datum.x0) > 46 && (datum.y1 - datum.y0) > 24 ? 1 : 0' },
          },
        },
      },
      {
        type: 'text', from: { data: 'leaves' }, interactive: false,
        encode: {
          enter: {
            x: { signal: 'datum.x0 + 7' }, y: { signal: 'datum.y0 + 32' },
            text: { signal: "format(datum.share, '.1%')" }, fill: { signal: `scale('pos', datum.documents) > ${darkFrom} ? '#ffffff' : '#1f2a33'` },
            font: { value: 'Manrope, Arial, sans-serif' }, fontSize: { value: 11 },
            opacity: { signal: '(datum.x1 - datum.x0) > 46 && (datum.y1 - datum.y0) > 42 ? 0.85 : 0' },
          },
        },
      },
    ],
  }) : null, [keywords, width, height, total, lo, hi, labelTitle, shareTitle, tooltipFields, ramp, darkFrom, sel, Boolean(onSelect)])
  return <div ref={ref} className="treemap-wrap"><div className="treemap-canvas">{spec && keywords.length ? <VegaChart spec={spec} onClick={onSelect ? (d) => d.label && onSelect(d.label) : undefined} /> : null}</div></div>
}

function PublicationsTable({ filters }) {
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
    fetch(`/api/publicacoes${query({ ...filters, q: debounced, page, size: 10 })}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((payload) => { if (active) setResult(payload) })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [filterKey, debounced, page])

  const csvUrl = `/api/publicacoes${query({ ...filters, q: debounced, format: 'csv' })}`

  return <div className="data-table-wrap">
    <div className="table-toolbar">
      <label className="table-search"><span aria-hidden="true">⌕</span>
        <input type="search" value={search} placeholder="Buscar por título, autor ou afiliação…" aria-label="Buscar publicações" onChange={(e) => setSearch(e.target.value)} />
      </label>
      <small>{loading ? 'Carregando…' : `${fmt(result.total)} publicações`}</small>
    </div>
    <div className="table-scroll">
      <table className="data-table publications">
        <thead><tr><th className="num">#</th><th>Título</th><th>Tipo</th><th className="num">Ano</th><th>Autores</th><th>ID</th></tr></thead>
        <tbody>
          {result.items.length ? result.items.map((item, index) => <tr key={`${result.page}-${index}`}>
            <td className="num muted">{(result.page - 1) * 10 + index + 1}</td>
            <td className="title-cell">{item.identificador?.url || item.doi ? <a href={item.identificador?.url || item.doi} target="_blank" rel="noreferrer">{item.titulo || '—'}</a> : (item.titulo || '—')}</td>
            <td><span className="type-pill">{item.tipo}</span></td>
            <td className="num">{item.ano ?? '—'}</td>
            <td><div className="clamp">{item.autores.join(', ') || '—'}</div></td>
            <td className="id-cell">{item.identificador
              ? <a className="pub-id" href={item.identificador.url} target="_blank" rel="noreferrer" title={`Abrir pelo ${item.identificador.type}`}><span className={`id-badge ${item.identificador.type === 'DOI' ? 'doi' : 'hdl'}`}>{item.identificador.type === 'DOI' ? 'DOI' : 'HDL'}</span><span className="id-value">{item.identificador.value}</span></a>
              : <span className="muted">—</span>}</td>
          </tr>) : <tr><td colSpan={6} className="muted">{loading ? 'Carregando…' : 'Nenhuma publicação encontrada.'}</td></tr>}
        </tbody>
      </table>
    </div>
    <div className="table-footer">
      <a className="export-button" href={csvUrl}>Exportar CSV ↓</a>
      <Pager page={result.page} pages={result.pages} onPage={setPage} />
    </div>
  </div>
}

const LIGHT_FILLS = new Set(['#ffff00', '#00f0dc'])

export function DetailSections({ filters, onFilter, onSummary }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [yearSort, setYearSort] = useState('cronologica')
  const [typeChart, setTypeChart] = useState('rosca')
  const [typeValues, setTypeValues] = useState(false)
  const filterKey = JSON.stringify(filters)
  const sel = (key) => (filters[key] && filters[key] !== 'Todos' ? String(filters[key]) : '')

  useEffect(() => {
    let active = true
    setError('')
    fetch(`/api/insights${query(filters)}`)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error('Não foi possível carregar os indicadores detalhados.')))
      .then((payload) => { if (active) { setData(payload); onSummary?.({ total: payload.total }) } })
      .catch((e) => { if (active) setError(e.message) })
    return () => { active = false }
  }, [filterKey])

  const specs = useMemo(() => {
    if (!data) return null
    const orgs = data.institutions.slice(0, 20)
    const countries = data.countries.map((c) => ({ ...c, country: countryName(c.code) }))
    const langTotal = data.languages.reduce((sum, l) => sum + l.documents, 0)
    const languages = data.languages.map((l) => ({ ...l, language: LANGUAGE_LABELS[l.code] || l.code.toUpperCase(), share: l.documents / langTotal }))
    const typeTotal = data.byType.reduce((sum, t) => sum + t.count, 0)
    const types = data.byType.map((t, idx) => ({ ...t, idx, share: t.count / typeTotal, label: fmt(t.count), ringLabel: t.count / typeTotal >= 0.04 ? fmt(t.count) : '', labelColor: LIGHT_FILLS.has(t.color) ? '#0a0a8c' : '#ffffff' }))
    const selType = sel('tipo')
    const selYear = sel('ano')
    const selLang = sel('idioma')
    const highlight = (field, value) => value
      ? { condition: { test: `datum[${JSON.stringify(field)}] == ${JSON.stringify(value)}`, value: 1 }, value: DIM_OPACITY }
      : { value: 1 }
    return {
      types: typeChart === 'colunas' ? {
        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
        background: 'transparent', width: 'container', height: 260,
        data: { values: types },
        encoding: {
          x: { field: 'type', type: 'nominal', sort: [...types].sort((a, b) => b.count - a.count).map((t) => t.type), axis: { title: null, labelColor: AXIS_MUTED, labelAngle: 0, labelPadding: 8, labelLimit: 90, domain: false, ticks: false } },
          y: { field: 'count', type: 'quantitative', axis: { title: null, labelColor: AXIS_MUTED, gridColor: GRID, domain: false, ticks: false, tickCount: 6, labelExpr: "replace(datum.label, ',', '.')" }, scale: { zero: true } },
          opacity: highlight('type', selType),
          tooltip: [{ field: 'type', title: 'Tipo' }, { field: 'count', title: 'Documentos', format: ',' }, { field: 'share', title: '% do total', format: '.1%' }],
        },
        layer: [
          { mark: { type: 'bar', cornerRadiusEnd: 4, width: { band: 0.66 }, stroke: '#0a0a8c', strokeOpacity: 0.15, cursor: 'pointer' }, encoding: { color: { field: 'type', type: 'nominal', scale: { domain: types.map((t) => t.type), range: types.map((t) => t.color) }, legend: null } } },
          ...(typeValues ? [{ mark: { type: 'text', dy: -7, color: '#0a0a8c', fontSize: 11, fontWeight: 700, font: 'Manrope, Arial, sans-serif', cursor: 'pointer' }, encoding: { text: { field: 'label' } } }] : []),
        ],
        config: { axis: { labelFont: 'Manrope, Arial, sans-serif', labelFontSize: 11 }, view: { stroke: null } },
      } : {
        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
        background: 'transparent', width: 300, height: 245,
        data: { values: types },
        encoding: {
          theta: { field: 'count', type: 'quantitative', stack: true },
          order: { field: 'idx', type: 'quantitative' },
          opacity: highlight('type', selType),
          tooltip: [{ field: 'type', title: 'Tipo' }, { field: 'count', title: 'Documentos', format: ',' }, { field: 'share', title: '% do total', format: '.1%' }],
        },
        layer: [
          { mark: { type: 'arc', innerRadius: 72, stroke: '#ffffff', strokeWidth: 2, cursor: 'pointer' }, encoding: { color: { field: 'type', type: 'nominal', scale: { domain: types.map((t) => t.type), range: types.map((t) => t.color) }, legend: null } } },
          // Valores dentro do anel; fatias muito finas (menos de 4%) ficam só na legenda.
          ...(typeValues ? [{ mark: { type: 'text', radius: 97, fontSize: 11, fontWeight: 800, font: 'Manrope, Arial, sans-serif', cursor: 'pointer' }, encoding: { text: { field: 'ringLabel' }, color: { field: 'labelColor', type: 'nominal', scale: null } } }] : []),
        ],
        view: { stroke: null },
      },
      typeRows: types,
      years: {
        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
        background: 'transparent', width: 'container', height: 260,
        data: { values: data.byYear },
        encoding: {
          x: {
            field: 'year', type: 'ordinal',
            sort: yearSort === 'crescente' ? { field: 'documents', order: 'ascending' } : { field: 'year', order: 'ascending' },
            axis: { title: null, labelColor: AXIS_MUTED, labelAngle: 0, labelPadding: 8, labelOverlap: true, domain: false, ticks: false },
          },
          y: { field: 'documents', type: 'quantitative', axis: { title: null, labelColor: AXIS_MUTED, gridColor: GRID, domain: false, ticks: false, tickCount: 6 }, scale: { zero: true } },
          opacity: highlight('year', selYear ? Number(selYear) : ''),
          tooltip: [{ field: 'year', title: 'Ano' }, { field: 'documents', title: 'Documentos', format: ',' }],
        },
        layer: [
          { mark: { type: 'bar', color: '#001eff', cornerRadiusEnd: 4, width: { band: 0.72 }, cursor: 'pointer' } },
          { mark: { type: 'text', dy: -7, color: '#0a0a8c', fontSize: 10, fontWeight: 700, font: 'Manrope, Arial, sans-serif', cursor: 'pointer' }, encoding: { text: { field: 'documents', type: 'quantitative', format: ',' } } },
        ],
        config: { axis: { labelFont: 'Manrope, Arial, sans-serif' }, view: { stroke: null } },
      },
      orgs: horizontalBar(orgs, { field: 'documents', label: 'name', color: '#001eff', height: BAR_ROW_HEIGHT, tooltipTitle: 'Instituição', selected: sel('instituicao') }),
      countries: horizontalBar(countries, { field: 'documents', label: 'country', color: '#0a0a8c', height: BAR_ROW_HEIGHT, tooltipTitle: 'País', shareField: 'share', selected: sel('pais'), selectField: 'code' }),
      languages: {
        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
        background: 'transparent', width: 220, height: 220,
        data: { values: languages },
        mark: { type: 'arc', innerRadius: 58, stroke: '#ffffff', strokeWidth: 2, cursor: 'pointer' },
        encoding: {
          theta: { field: 'documents', type: 'quantitative' },
          opacity: highlight('code', selLang),
          color: { field: 'language', type: 'nominal', scale: { domain: languages.map((l) => l.language), range: languages.map((l) => LANGUAGE_COLORS[l.code] || '#8c90b8') }, legend: null },
          tooltip: [{ field: 'language', title: 'Idioma' }, { field: 'documents', title: 'Documentos', format: ',' }, { field: 'share', title: '% do total', format: '.1%' }],
        },
        view: { stroke: null },
      },
      languageRows: languages,
    }
  }, [data, yearSort, typeChart, typeValues])

  if (error) return <p className="panel-note detail-error">{error}</p>
  if (!data || !specs) return <p className="panel-note detail-loading">Carregando indicadores detalhados…</p>

  const keywordItems = data.keywords.map((k) => ({ label: k.keyword, documents: k.documents, group: k.group }))
  const topicTotal = data.topics.reduce((sum, t) => sum + t.documents, 0)
  const selTopic = sel('topico')
  const shownTopics = data.topics.slice(0, TOPICS_SHOWN)
  // O tópico escolhido sempre aparece, mesmo fora dos mais frequentes.
  if (selTopic && !shownTopics.some((t) => t.topic === selTopic)) shownTopics.push(...data.topics.filter((t) => t.topic === selTopic))
  const topicItems = shownTopics.map((t) => ({ label: t.topic, documents: t.documents, shareBase: topicTotal }))

  // Layout em pares de altura parecida (barras com barras, tabela com tabela) e
  // cartões esticados na mesma linha, para não sobrar espaço em branco.
  const pick = (key) => (value) => onFilter?.(key, value)
  // Clicar de novo no valor ativo remove o filtro daquele gráfico.
  const clear = (key) => (sel(key) ? () => onFilter?.(key, sel(key)) : undefined)
  const selType = sel('tipo')

  return <div className="detail-sections">
    <section className="main-grid">
      <article className="panel composition-panel">
        <div className="panel-heading"><div><h2>Tipos de documentos</h2></div>
          <div className="panel-actions">
            {selType && <button type="button" className="chart-clear" onClick={clear('tipo')} title="Remover o filtro deste gráfico">× Limpar filtro</button>}
            <label className="chart-check"><input type="checkbox" checked={typeValues} onChange={(e) => setTypeValues(e.target.checked)} /> Mostrar valores</label>
            <div className="sort-toggle" role="group" aria-label="Modelo do gráfico">
              {[['rosca', 'Rosca'], ['colunas', 'Colunas']].map(([value, label]) => <button key={value} className={typeChart === value ? 'active' : ''} aria-pressed={typeChart === value} onClick={() => setTypeChart(value)}>{label}</button>)}
            </div>
          </div>
        </div>
        {typeChart === 'colunas'
          ? <div className="type-columns"><VegaChart spec={specs.types} onClick={(d) => d.type && pick('tipo')(d.type)} /><p className="panel-note">Clique numa coluna para filtrar o painel pelo tipo.</p></div>
          : <div className="donut-layout">
          <div className="donut-wrap"><VegaChart spec={specs.types} onClick={(d) => d.type && pick('tipo')(d.type)} /><div className="donut-total"><strong>{fmt(data.total)}</strong><span>documentos</span></div></div>
          <ul className="legend-list">
            {specs.typeRows.map((item) => <li key={item.type} className={selType && selType !== item.type ? 'dimmed' : ''}>
              <button type="button" className="legend-filter" aria-pressed={selType === item.type} onClick={() => pick('tipo')(item.type)} title="Filtrar o painel por este tipo">
                <span style={{ background: item.color }}></span><div><b>{item.type}</b><small>{fmt(item.count)} · {pct(item.share)}</small></div>
              </button>
            </li>)}
          </ul>
        </div>}
      </article>
      <article className="panel trend-panel">
        <div className="panel-heading"><div><h2>Publicações por ano</h2></div>
          <div className="panel-actions">{sel('ano') && <button type="button" className="chart-clear" onClick={clear('ano')} title="Remover o filtro deste gráfico">× Limpar filtro</button>}
          <div className="sort-toggle" role="group" aria-label="Ordenação das colunas">
            {[['cronologica', 'Cronológica'], ['crescente', 'Crescente']].map(([value, label]) => <button key={value} className={yearSort === value ? 'active' : ''} aria-pressed={yearSort === value} onClick={() => setYearSort(value)}>{label}</button>)}
          </div>
          </div>
        </div>
        <VegaChart spec={specs.years} onClick={(d) => d.year && pick('ano')(String(d.year))} />
        <p className="panel-note">Número de publicações por ano de publicação. {yearSort === 'crescente' ? 'Colunas ordenadas do menor para o maior valor.' : 'Colunas em ordem cronológica.'} Clique numa coluna para filtrar o painel pelo ano.</p>
      </article>
    </section>

    <section className="detail-grid">
      <Panel title="Organizações" chip="Top 20" onClear={clear('instituicao')} note={`Afiliação informada em ${fmt(data.coverage.institutions)} documentos. Cada documento conta uma vez por instituição. Clique numa barra para filtrar o painel.`}>
        {data.institutions.length ? <VegaChart spec={specs.orgs} onClick={(d) => d.name && pick('instituicao')(d.name)} /> : <Empty />}
      </Panel>
      <Panel title="Países dos autores" chip="Top 10" onClear={clear('pais')} note={`Com base nos ${fmt(data.coverage.countries)} documentos do OpenAlex com país informado; um documento conta para cada país dos seus autores.`}>
        {data.countries.length ? <VegaChart spec={specs.countries} onClick={(d) => d.code && pick('pais')(d.code)} /> : <Empty>Nenhum documento do OpenAlex neste recorte (o OASISbr não informa o país dos autores).</Empty>}
      </Panel>
    </section>

    <section className="detail-grid">
      <Panel title="Afiliações" onClear={clear('instituicao')} chip={`${fmt(data.institutions.length)} instituições`}>
        <DataTable columns={[{ key: 'name', label: 'Afiliação' }, { key: 'documents', label: 'Documentos', align: 'right' }]} rows={data.institutions} exportName="afiliacoes.csv" onRowClick={(row) => pick('instituicao')(row.name)} rowKey="name" selectedKey={sel('instituicao')} />
      </Panel>
      <Panel title="Autores" onClear={clear('autor')} chip={`${fmt(data.authors.length)} autores`} note={`ORCID de ${fmt(data.authorsWithOrcid || 0)} autores, conforme os dados do OpenAlex (o OASISbr não traz ORCID). Nomes como aparecem nas fontes: o OASISbr usa “Sobrenome, Nome” e o OpenAlex “Nome Sobrenome”.`}>
        <DataTable
          columns={[
            { key: 'name', label: 'Autor' },
            { key: 'orcid', label: 'ORCID', render: (row) => row.orcid ? <a className="orcid-link" href={`https://orcid.org/${row.orcid}`} target="_blank" rel="noreferrer" title={`Perfil ORCID de ${row.name}`}><span className="orcid-badge" aria-hidden="true">iD</span>{row.orcid}</a> : <span className="muted">—</span> },
            { key: 'documents', label: 'Documentos', align: 'right' },
          ]}
          rows={data.authors}
          searchKeys={['name', 'orcid']}
          exportName="autores.csv"
          onRowClick={(row) => pick('autor')(row.name)}
          rowKey="name"
          selectedKey={sel('autor')}
        />
      </Panel>
    </section>

    <section className="detail-grid narrow-left">
      <div className="panel-stack">
        <Panel title="Idioma" onClear={clear('idioma')} note={`Idioma informado em ${fmt(data.coverage.languages)} documentos (OASISbr). O OpenAlex não traz esse campo na base atual.`}>
          <div className="language-layout">
            <VegaChart spec={specs.languages} onClick={(d) => d.code && pick('idioma')(d.code)} />
            <ul className="legend-list">
              {specs.languageRows.map((l) => <li key={l.code} className={sel('idioma') && sel('idioma') !== l.code ? 'dimmed' : ''}>
                <button type="button" className="legend-filter" aria-pressed={sel('idioma') === l.code} onClick={() => pick('idioma')(l.code)} title="Filtrar o painel por este idioma">
                  <span style={{ background: LANGUAGE_COLORS[l.code] || '#8c90b8' }}></span><div><b>{l.language}</b><small>{fmt(l.documents)} · {pct(l.share)}</small></div>
                </button>
              </li>)}
            </ul>
          </div>
        </Panel>
        <article className="panel network-panel">
          <h2>Rede de pesquisadores</h2>
          <a className="network-preview" href={NETWORK_URL} target="_blank" rel="noreferrer" aria-label="Abrir a rede de coautoria no VOSviewer">
            <img src={networkIllustration} alt="Ilustração de uma rede de coautoria, com pesquisadores como nós coloridos por grupo e ligados por linhas" />
            <span className="network-tag">Imagem ilustrativa</span>
          </a>
          <a className="network-link" href={NETWORK_URL} target="_blank" rel="noreferrer">Abrir a rede <span>↗</span></a>
        </article>
      </div>
      <Panel className="treemap-panel" title="Palavras-chave (50 mais utilizadas)" onClear={clear('palavra')} note={`Palavras-chave do OASISbr (${fmt(data.coverage.keywords)} documentos com palavras-chave). Percentuais sobre o total das 50 mais frequentes.`}>
        <FrequencyLegend ramp={TOPIC_RAMP} />
        {data.keywords.length ? <FrequencyTreemap items={keywordItems} labelTitle="Palavra-chave" tooltipFields={KEYWORD_TOOLTIP} shareTitle="% do top 50" ramp={TOPIC_RAMP} darkFrom={TOPIC_DARK_FROM} selected={sel('palavra')} onSelect={pick('palavra')} /> : <Empty>Nenhuma palavra-chave neste recorte (só o OASISbr traz palavras-chave).</Empty>}
      </Panel>
    </section>

    <Panel className="full-width topics-panel" title="Tópicos" onClear={clear('topico')} chip={data.topics.length > TOPICS_SHOWN ? `${TOPICS_SHOWN} de ${fmt(data.topics.length)} tópicos` : `${fmt(data.topics.length)} tópicos`} note={`Tópico principal (primary topic) atribuído pelo OpenAlex a ${fmt(data.coverage.topics)} documentos. Percentuais sobre os documentos com tópico; o OASISbr não traz esse campo.`}>
      <FrequencyLegend ramp={TOPIC_RAMP} />
      {data.topics.length
        ? <FrequencyTreemap items={topicItems} labelTitle="Tópico" shareTitle="% dos documentos com tópico" ramp={TOPIC_RAMP} darkFrom={TOPIC_DARK_FROM} selected={sel('topico')} onSelect={pick('topico')} />
        : <Empty>Nenhum documento do OpenAlex com tópico neste recorte.</Empty>}
    </Panel>

    <Panel className="full-width" title="Listagem das publicações">
      <PublicationsTable filters={filters} />
    </Panel>
  </div>
}
