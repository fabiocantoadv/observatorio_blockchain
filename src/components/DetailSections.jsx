import { useEffect, useMemo, useRef, useState } from 'react'
import { VegaChart } from './VegaChart'
import { DataTable, Pager } from './DataTable'
import networkIllustration from '../assets/rede-coautoria-ilustrativa.svg'

// Seções replicadas do painel Kibana "RNP - v4" (rnpdash.ibict.br), calculadas a partir
// do banco local via /api/insights e /api/publicacoes. Respeitam os filtros de tipo e ano.

// Treemap de palavras-chave: rampa sequencial suave, do cinza claro (menos ocorrências)
// ao verde escuro (mais ocorrências).
const FREQ_RAMP = ['#eef0f2', '#d3d9d7', '#adc6b8', '#7aad90', '#448c68', '#1f6b4a']
const FREQ_DARK_FROM = 0.7 // a partir desta posição na rampa o texto passa a branco

// Mapa de coautoria publicado no painel Kibana (VOSviewer).
const NETWORK_URL = 'https://app.vosviewer.com/?json=https%3A%2F%2Fdrive.google.com%2Fuc%3Fid%3D1ETJSDQR_xOOfvf1A4gHdX5zCqQ55Za1a'

const LANGUAGE_LABELS = { por: 'Português', eng: 'Inglês', spa: 'Espanhol', ita: 'Italiano', fra: 'Francês', deu: 'Alemão', na: 'Não informado' }
const LANGUAGE_COLORS = { por: '#001eff', eng: '#00f0dc', spa: '#ffff00', ita: '#6678ff', fra: '#0a0a8c', deu: '#00a99d', na: '#cfd3ea' }

// Mesma altura para os dois gráficos de barras lado a lado.
const BAR_ROW_HEIGHT = 440
const TREEMAP_HEIGHT = 560

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

function FrequencyLegend() {
  return <div className="freq-legend" aria-hidden="true">
    <span>Menos ocorrências</span>
    <i style={{ background: `linear-gradient(90deg, ${FREQ_RAMP.join(', ')})` }}></i>
    <span>Mais ocorrências</span>
  </div>
}
function Panel({ label, title, chip, note, className = '', children }) {
  return <article className={`panel ${className}`}>
    <div className="panel-heading"><div><h2>{title}</h2></div>{chip && <span className="data-chip">{chip}</span>}</div>
    {children}
    {note && <p className="panel-note">{note}</p>}
  </article>
}

function Empty({ children = 'Sem dados para o recorte selecionado.' }) {
  return <p className="empty-state">{children}</p>
}

function horizontalBar(values, { field, label, color, height, tooltipTitle, shareField }) {
  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    background: 'transparent',
    width: 'container',
    height,
    data: { values },
    mark: { type: 'bar', cornerRadiusEnd: 5, height: { band: 0.72 }, color },
    encoding: {
      y: { field: label, type: 'nominal', sort: '-x', axis: { title: null, labelColor: AXIS_LABEL, labelLimit: 260, labelPadding: 9, domain: false, ticks: false } },
      x: { field, type: 'quantitative', axis: { title: null, labelColor: AXIS_MUTED, gridColor: GRID, domain: false, ticks: false, tickCount: 6 } },
      tooltip: [{ field: label, title: tooltipTitle }, { field, title: 'Documentos', format: ',' }, ...(shareField ? [{ field: shareField, title: '% dos documentos', format: '.1%' }] : [])],
    },
    config: { axis: { labelFont: 'Manrope, Arial, sans-serif' }, view: { stroke: null } },
  }
}

function KeywordTreemap({ keywords }) {
  // O treemap ocupa toda a altura disponível no cartão (que estica para acompanhar a coluna ao lado).
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
        values: [{ id: 'root' }, ...keywords.map((k, i) => ({ id: `k${i}`, parent: 'root', ...k, share: k.documents / total }))],
        transform: [
          { type: 'stratify', key: 'id', parentKey: 'parent' },
          { type: 'treemap', field: 'documents', sort: { field: 'value', order: 'descending' }, round: true, method: 'squarify', ratio: 1.4, paddingInner: 2, size: [{ signal: 'width' }, { signal: 'height' }] },
        ],
      },
      { name: 'leaves', source: 'tree', transform: [{ type: 'filter', expr: 'datum.parent' }] },
    ],
    scales: [
      // Escala logarítmica: poucas palavras concentram muitas ocorrências (ex.: Bitcoin).
      { name: 'fill', type: 'log', domain: [lo, hi], range: FREQ_RAMP, interpolate: 'rgb', clamp: true },
      { name: 'pos', type: 'log', domain: [lo, hi], range: [0, 1], clamp: true },
    ],
    marks: [
      {
        type: 'rect', from: { data: 'leaves' },
        encode: {
          enter: {
            x: { field: 'x0' }, y: { field: 'y0' }, x2: { field: 'x1' }, y2: { field: 'y1' },
            fill: { scale: 'fill', field: 'documents' }, stroke: { value: '#ffffff' }, strokeWidth: { value: 2 }, cornerRadius: { value: 4 },
            tooltip: { signal: "{'Palavra-chave': datum.keyword, 'Documentos': datum.documents, 'Tema': datum.group, '% do top 50': format(datum.share, '.1%')}" },
          },
          hover: { fillOpacity: { value: 0.8 } },
          update: { fillOpacity: { value: 1 } },
        },
      },
      {
        type: 'text', from: { data: 'leaves' }, interactive: false,
        encode: {
          enter: {
            x: { signal: 'datum.x0 + 7' }, y: { signal: 'datum.y0 + 17' },
            text: { field: 'keyword' }, fill: { signal: `scale('pos', datum.documents) > ${FREQ_DARK_FROM} ? '#ffffff' : '#1f2a33'` },
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
            text: { signal: "format(datum.share, '.1%')" }, fill: { signal: `scale('pos', datum.documents) > ${FREQ_DARK_FROM} ? '#ffffff' : '#1f2a33'` },
            font: { value: 'Manrope, Arial, sans-serif' }, fontSize: { value: 11 },
            opacity: { signal: '(datum.x1 - datum.x0) > 46 && (datum.y1 - datum.y0) > 42 ? 0.85 : 0' },
          },
        },
      },
    ],
  }) : null, [keywords, width, height, total, lo, hi])
  return <div ref={ref} className="treemap-wrap"><div className="treemap-canvas">{spec && keywords.length ? <VegaChart spec={spec} /> : null}</div></div>
}

function PublicationsTable({ selectedType, selectedYear }) {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState({ total: 0, page: 1, pages: 1, items: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])
  useEffect(() => setPage(1), [debounced, selectedType, selectedYear])

  useEffect(() => {
    let active = true
    setLoading(true)
    fetch(`/api/publicacoes${query({ tipo: selectedType, ano: selectedYear, q: debounced, page, size: 10 })}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((payload) => { if (active) setResult(payload) })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [selectedType, selectedYear, debounced, page])

  const csvUrl = `/api/publicacoes${query({ tipo: selectedType, ano: selectedYear, q: debounced, format: 'csv' })}`

  return <div className="data-table-wrap">
    <div className="table-toolbar">
      <label className="table-search"><span aria-hidden="true">⌕</span>
        <input type="search" value={search} placeholder="Buscar por título, autor ou afiliação…" aria-label="Buscar publicações" onChange={(e) => setSearch(e.target.value)} />
      </label>
      <small>{loading ? 'Carregando…' : `${fmt(result.total)} publicações`}</small>
    </div>
    <div className="table-scroll">
      <table className="data-table publications">
        <thead><tr><th className="num">#</th><th>Título</th><th>Tipo</th><th className="num">Ano</th><th>Autores</th><th>Afiliações</th></tr></thead>
        <tbody>
          {result.items.length ? result.items.map((item, index) => <tr key={`${result.page}-${index}`}>
            <td className="num muted">{(result.page - 1) * 10 + index + 1}</td>
            <td className="title-cell">{item.doi ? <a href={item.doi} target="_blank" rel="noreferrer">{item.titulo || '—'}</a> : (item.titulo || '—')}</td>
            <td><span className="type-pill">{item.tipo}</span></td>
            <td className="num">{item.ano ?? '—'}</td>
            <td><div className="clamp">{item.autores.join(', ') || '—'}</div></td>
            <td><div className="clamp">{item.instituicoes.join(', ') || '—'}</div></td>
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

export function DetailSections({ selectedType, selectedYear, onSummary }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setError('')
    fetch(`/api/insights${query({ tipo: selectedType, ano: selectedYear })}`)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error('Não foi possível carregar os indicadores detalhados.')))
      .then((payload) => { if (active) { setData(payload); onSummary?.({ total: payload.total }) } })
      .catch((e) => { if (active) setError(e.message) })
    return () => { active = false }
  }, [selectedType, selectedYear])

  const specs = useMemo(() => {
    if (!data) return null
    const orgs = data.institutions.slice(0, 20)
    const countries = data.countries.map((c) => ({ ...c, country: countryName(c.code) }))
    const languages = data.languages.map((l) => ({ ...l, language: LANGUAGE_LABELS[l.code] || l.code.toUpperCase(), share: l.documents / data.total }))
    return {
      orgs: horizontalBar(orgs, { field: 'documents', label: 'name', color: '#001eff', height: BAR_ROW_HEIGHT, tooltipTitle: 'Instituição' }),
      countries: horizontalBar(countries, { field: 'documents', label: 'country', color: '#0a0a8c', height: BAR_ROW_HEIGHT, tooltipTitle: 'País', shareField: 'share' }),
      languages: {
        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
        background: 'transparent', width: 220, height: 220,
        data: { values: languages },
        mark: { type: 'arc', innerRadius: 58, stroke: '#ffffff', strokeWidth: 2 },
        encoding: {
          theta: { field: 'documents', type: 'quantitative' },
          color: { field: 'language', type: 'nominal', scale: { domain: languages.map((l) => l.language), range: languages.map((l) => LANGUAGE_COLORS[l.code] || '#8c90b8') }, legend: null },
          tooltip: [{ field: 'language', title: 'Idioma' }, { field: 'documents', title: 'Documentos', format: ',' }, { field: 'share', title: '% do total', format: '.1%' }],
        },
        view: { stroke: null },
      },
      languageRows: languages,
    }
  }, [data])

  if (error) return <p className="panel-note detail-error">{error}</p>
  if (!data || !specs) return <p className="panel-note detail-loading">Carregando indicadores detalhados…</p>

  // Layout em pares de altura parecida (barras com barras, tabela com tabela) e
  // cartões esticados na mesma linha, para não sobrar espaço em branco.
  return <div className="detail-sections">
    <section className="detail-grid">
      <Panel title="Organizações" chip="Top 20" note={`Afiliação informada em ${fmt(data.coverage.institutions)} de ${fmt(data.total)} documentos. Cada documento conta uma vez por instituição.`}>
        {data.institutions.length ? <VegaChart spec={specs.orgs} /> : <Empty />}
      </Panel>
      <Panel title="Países dos autores" chip="Top 10" note={`Com base nos ${fmt(data.coverage.countries)} documentos do OpenAlex com país informado; um documento conta para cada país dos seus autores.`}>
        {data.countries.length ? <VegaChart spec={specs.countries} /> : <Empty>Nenhum documento do OpenAlex neste recorte (o OASISbr não informa o país dos autores).</Empty>}
      </Panel>
    </section>

    <section className="detail-grid">
      <Panel title="Afiliações" chip={`${fmt(data.institutions.length)} instituições`}>
        <DataTable columns={[{ key: 'name', label: 'Afiliação' }, { key: 'documents', label: 'Documentos', align: 'right' }]} rows={data.institutions} exportName="afiliacoes.csv" />
      </Panel>
      <Panel title="Autores" chip={`${fmt(data.authors.length)} autores`} note={`ORCID de ${fmt(data.authorsWithOrcid || 0)} autores, conforme os dados do OpenAlex (o OASISbr não traz ORCID). Nomes como aparecem nas fontes: o OASISbr usa “Sobrenome, Nome” e o OpenAlex “Nome Sobrenome”.`}>
        <DataTable
          columns={[
            { key: 'name', label: 'Autor' },
            { key: 'orcid', label: 'ORCID', render: (row) => row.orcid ? <a className="orcid-link" href={`https://orcid.org/${row.orcid}`} target="_blank" rel="noreferrer" title={`Perfil ORCID de ${row.name}`}><span className="orcid-badge" aria-hidden="true">iD</span>{row.orcid}</a> : <span className="muted">—</span> },
            { key: 'documents', label: 'Documentos', align: 'right' },
          ]}
          rows={data.authors}
          searchKeys={['name', 'orcid']}
          exportName="autores.csv"
        />
      </Panel>
    </section>

    <section className="detail-grid narrow-left">
      <div className="panel-stack">
        <Panel title="Idioma" note={`Idioma informado em ${fmt(data.coverage.languages)} documentos (OASISbr). O OpenAlex não traz esse campo na base atual.`}>
          <div className="language-layout">
            <VegaChart spec={specs.languages} />
            <ul className="legend-list">
              {specs.languageRows.map((l) => <li key={l.code}><span style={{ background: LANGUAGE_COLORS[l.code] || '#8c90b8' }}></span><div><b>{l.language}</b><small>{fmt(l.documents)} · {pct(l.share)}</small></div></li>)}
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
      <Panel className="treemap-panel" title="Palavras-chave (50 mais utilizadas)" note={`Palavras-chave do OASISbr (${fmt(data.coverage.keywords)} documentos com palavras-chave). Percentuais sobre o total das 50 mais frequentes.`}>
        <FrequencyLegend />
        {data.keywords.length ? <KeywordTreemap keywords={data.keywords} /> : <Empty>Nenhuma palavra-chave neste recorte (só o OASISbr traz palavras-chave).</Empty>}
      </Panel>
    </section>

    <Panel className="full-width" title="Listagem das publicações">
      <PublicationsTable selectedType={selectedType} selectedYear={selectedYear} />
    </Panel>
  </div>
}
