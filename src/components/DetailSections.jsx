import { useEffect, useMemo, useRef, useState } from 'react'
import { VegaChart } from './VegaChart'
import { DataTable, Pager } from './DataTable'

// Seções replicadas do painel Kibana "RNP - v4" (rnpdash.ibict.br), calculadas a partir
// do banco local via /api/insights e /api/publicacoes. Respeitam os filtros de tipo e ano.

export const GROUP_COLORS = {
  Tecnologia: { fill: '#001eff', ink: '#ffffff' },
  Aplicações: { fill: '#00f0dc', ink: '#0a0a8c' },
  Dados: { fill: '#ffff00', ink: '#0a0a8c' },
  Governança: { fill: '#6678ff', ink: '#ffffff' },
  Economia: { fill: '#0a0a8c', ink: '#ffffff' },
}
const GROUPS = Object.keys(GROUP_COLORS)

// Mapa de coautoria publicado no painel Kibana (VOSviewer).
const NETWORK_URL = 'https://app.vosviewer.com/?json=https%3A%2F%2Fdrive.google.com%2Fuc%3Fid%3D1ETJSDQR_xOOfvf1A4gHdX5zCqQ55Za1a'

const LANGUAGE_LABELS = { por: 'Português', eng: 'Inglês', spa: 'Espanhol', ita: 'Italiano', fra: 'Francês', deu: 'Alemão', na: 'Não informado' }
const LANGUAGE_COLORS = { por: '#001eff', eng: '#00f0dc', spa: '#ffff00', ita: '#6678ff', fra: '#0a0a8c', deu: '#00a99d', na: '#cfd3ea' }

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

function useContainerWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!ref.current) return undefined
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

export function GroupLegend() {
  return <ul className="inline-legend" aria-label="Temas das palavras-chave">
    {GROUPS.map((g) => <li key={g}><span style={{ background: GROUP_COLORS[g].fill }}></span>{g}</li>)}
  </ul>
}

function Panel({ label, title, chip, note, className = '', children }) {
  return <article className={`panel ${className}`}>
    <div className="panel-heading"><div><p className="section-label">{label}</p><h2>{title}</h2></div>{chip && <span className="data-chip">{chip}</span>}</div>
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
  const [ref, width] = useContainerWidth()
  const total = keywords.reduce((sum, k) => sum + k.documents, 0)
  const spec = useMemo(() => width ? ({
    $schema: 'https://vega.github.io/schema/vega/v6.json',
    width,
    height: 420,
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
      { name: 'fill', type: 'ordinal', domain: GROUPS, range: GROUPS.map((g) => GROUP_COLORS[g].fill) },
      { name: 'ink', type: 'ordinal', domain: GROUPS, range: GROUPS.map((g) => GROUP_COLORS[g].ink) },
    ],
    marks: [
      {
        type: 'rect', from: { data: 'leaves' },
        encode: {
          enter: {
            x: { field: 'x0' }, y: { field: 'y0' }, x2: { field: 'x1' }, y2: { field: 'y1' },
            fill: { scale: 'fill', field: 'group' }, stroke: { value: '#ffffff' }, strokeWidth: { value: 1 }, cornerRadius: { value: 3 },
            tooltip: { signal: "{'Palavra-chave': datum.keyword, 'Documentos': datum.documents, 'Tema': datum.group, '% do top 50': format(datum.share, '.1%')}" },
          },
          hover: { fillOpacity: { value: 0.85 } },
          update: { fillOpacity: { value: 1 } },
        },
      },
      {
        type: 'text', from: { data: 'leaves' }, interactive: false,
        encode: {
          enter: {
            x: { signal: 'datum.x0 + 7' }, y: { signal: 'datum.y0 + 17' },
            text: { field: 'keyword' }, fill: { scale: 'ink', field: 'group' },
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
            text: { signal: "format(datum.share, '.1%')" }, fill: { scale: 'ink', field: 'group' },
            font: { value: 'Manrope, Arial, sans-serif' }, fontSize: { value: 11 },
            opacity: { signal: '(datum.x1 - datum.x0) > 46 && (datum.y1 - datum.y0) > 42 ? 0.85 : 0' },
          },
        },
      },
    ],
  }) : null, [keywords, width, total])
  return <div ref={ref} className="treemap-wrap">{spec && keywords.length ? <VegaChart spec={spec} /> : null}</div>
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

export function DetailSections({ selectedType, selectedYear }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setError('')
    fetch(`/api/insights${query({ tipo: selectedType, ano: selectedYear })}`)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error('Não foi possível carregar os indicadores detalhados.')))
      .then((payload) => { if (active) setData(payload) })
      .catch((e) => { if (active) setError(e.message) })
    return () => { active = false }
  }, [selectedType, selectedYear])

  const specs = useMemo(() => {
    if (!data) return null
    const orgs = data.institutions.slice(0, 20)
    const countries = data.countries.map((c) => ({ ...c, country: countryName(c.code) }))
    const languages = data.languages.map((l) => ({ ...l, language: LANGUAGE_LABELS[l.code] || l.code.toUpperCase(), share: l.documents / data.total }))
    return {
      orgs: horizontalBar(orgs, { field: 'documents', label: 'name', color: '#001eff', height: Math.max(120, orgs.length * 24), tooltipTitle: 'Instituição' }),
      countries: horizontalBar(countries, { field: 'documents', label: 'country', color: '#0a0a8c', height: Math.max(100, countries.length * 28), tooltipTitle: 'País', shareField: 'share' }),
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

  const topKeywords = data.keywords.slice(0, 5)

  return <div className="detail-sections">
    {topKeywords.length > 0 && <section className="kw-tiles" aria-label="Documentos por palavras-chave">
      {topKeywords.map((k) => <article key={k.keyword} className="kw-tile" style={{ '--tile-accent': GROUP_COLORS[k.group]?.fill || '#001eff' }}>
        <strong>{fmt(k.documents)}</strong>
        <span>{k.keyword}</span>
        <small>documentos · {k.group}</small>
      </article>)}
    </section>}

    <section className="detail-grid wide-left">
      <Panel label="INSTITUIÇÕES" title="Organizações" chip="Top 20" note={`Afiliação informada em ${fmt(data.coverage.institutions)} de ${fmt(data.total)} documentos. Cada documento conta uma vez por instituição.`}>
        {data.institutions.length ? <VegaChart spec={specs.orgs} /> : <Empty />}
      </Panel>
      <Panel label="INSTITUIÇÕES" title="Afiliações" chip={`${fmt(data.institutions.length)} instituições`}>
        <DataTable columns={[{ key: 'name', label: 'Afiliação' }, { key: 'documents', label: 'Documentos', align: 'right' }]} rows={data.institutions} exportName="afiliacoes.csv" />
      </Panel>
    </section>

    <section className="detail-grid">
      <Panel label="PESSOAS" title="Autores" chip={`${fmt(data.authors.length)} autores`} note="Nomes como aparecem nas fontes: o OASISbr usa “Sobrenome, Nome” e o OpenAlex “Nome Sobrenome”.">
        <DataTable columns={[{ key: 'name', label: 'Autor' }, { key: 'documents', label: 'Documentos', align: 'right' }]} rows={data.authors} exportName="autores.csv" />
      </Panel>
      <Panel label="GEOGRAFIA" title="Países dos autores" chip="Top 10" note={`Com base nos ${fmt(data.coverage.countries)} documentos do OpenAlex com país informado; um documento conta para cada país dos seus autores.`}>
        {data.countries.length ? <VegaChart spec={specs.countries} /> : <Empty>Nenhum documento do OpenAlex neste recorte (o OASISbr não informa o país dos autores).</Empty>}
      </Panel>
    </section>

    <section className="detail-grid narrow-left">
      <Panel label="IDIOMA" title="Idioma" note={`Idioma informado em ${fmt(data.coverage.languages)} documentos (OASISbr). O OpenAlex não traz esse campo na base atual.`}>
        <div className="language-layout">
          <VegaChart spec={specs.languages} />
          <ul className="legend-list">
            {specs.languageRows.map((l) => <li key={l.code}><span style={{ background: LANGUAGE_COLORS[l.code] || '#8c90b8' }}></span><div><b>{l.language}</b><small>{fmt(l.documents)} · {pct(l.share)}</small></div></li>)}
          </ul>
        </div>
      </Panel>
      <Panel label="ASSUNTOS" title="Palavras-chave (50 mais utilizadas)" note={`Palavras-chave do OASISbr (${fmt(data.coverage.keywords)} documentos com palavras-chave). Percentuais sobre o total das 50 mais frequentes.`}>
        <GroupLegend />
        {data.keywords.length ? <KeywordTreemap keywords={data.keywords} /> : <Empty>Nenhuma palavra-chave neste recorte (só o OASISbr traz palavras-chave).</Empty>}
      </Panel>
    </section>

    <section className="detail-grid narrow-left publications-row">
      <article className="panel network-panel">
        <p className="section-label">COLABORAÇÃO</p>
        <h2>Rede de pesquisadores</h2>
        <p className="panel-note">Mapa de coautoria no VOSviewer, o mesmo publicado no painel Kibana do observatório.</p>
        <a className="network-link" href={NETWORK_URL} target="_blank" rel="noreferrer">Abrir a rede <span>↗</span></a>
      </article>
      <Panel label="REGISTROS" title="Listagem das publicações">
        <PublicationsTable selectedType={selectedType} selectedYear={selectedYear} />
      </Panel>
    </section>
  </div>
}
