import { useEffect, useMemo, useState } from 'react'
import { VegaChart } from './components/VegaChart'
import { AdminPanel } from './components/AdminPanel'
import { AdminLoginModal } from './components/AdminLoginModal'
import { ProfileModal } from './components/ProfileModal'
import initialData from './data/banco_de_dados.json'

const defaultProfile = { name: 'Administrador', initials: 'AD', photo: '' }

function normalizeData(snapshot) {
  return { ...snapshot, profile: { ...defaultProfile, ...snapshot.profile } }
}

function compact(value) {
  return new Intl.NumberFormat('pt-BR').format(value)
}

function MetricCard({ label, value, detail, accent = 'mint' }) {
  return <article className={`metric-card ${accent}`}>
    <span>{label}</span>
    <strong>{value}</strong>
    <small>{detail}</small>
  </article>
}

function NavIcon({ name }) {
  const icons = {
    overview: '⌘', trend: '↗', library: '▤', info: 'i', admin: '⚙'
  }
  return <span className="nav-icon" aria-hidden="true">{icons[name]}</span>
}

export default function App() {
  const [data, setData] = useState(() => normalizeData(initialData))
  const [databaseVersion, setDatabaseVersion] = useState(null)
  const [storageState, setStorageState] = useState('seed')
  const [selectedType, setSelectedType] = useState('Todos')
  const [selectedYear, setSelectedYear] = useState('Todos')
  const [activePage, setActivePage] = useState('Visão geral')
  const [adminCredentials, setAdminCredentials] = useState(null)
  const [loginOpen, setLoginOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const { documentTypes, keywords, publicationsByYear, source } = data
  const totalDocuments = documentTypes.reduce((sum, item) => sum + item.count, 0)
  const palette = documentTypes.map((item) => item.color)

  useEffect(() => {
    let active = true
    fetch('/api/data')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Fonte de dados indisponível.')))
      .then((payload) => {
        if (!active || !payload.data) return
        setData(normalizeData(payload.data))
        setDatabaseVersion(payload.etag || null)
        setStorageState(payload.storage || 'seed')
      })
      .catch(() => {})
    return () => { active = false }
  }, [])

  async function authenticateAdmin(credentials) {
    const response = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || 'Não foi possível autenticar.')
    setAdminCredentials(credentials)
    setLoginOpen(false)
    navigate('Administração')
  }

  async function saveData(nextData) {
    if (!adminCredentials) throw new Error('Sua sessão expirou. Entre novamente.')
    const authorization = `Basic ${btoa(`${adminCredentials.username}:${adminCredentials.password}`)}`
    const response = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authorization },
      body: JSON.stringify({ data: nextData, etag: databaseVersion })
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || 'Não foi possível publicar as alterações.')
    setData(normalizeData(payload.data))
    setDatabaseVersion(payload.etag || null)
    setStorageState(payload.storage || 'blob')
  }

  const filteredTypes = selectedType === 'Todos'
    ? documentTypes
    : documentTypes.filter((item) => item.type === selectedType)
  const selectedCount = filteredTypes.reduce((sum, item) => sum + item.count, 0)
  const filteredYears = selectedYear === 'Todos'
    ? publicationsByYear
    : publicationsByYear.filter((item) => item.year === Number(selectedYear))
  const totalInSeries = publicationsByYear.reduce((sum, item) => sum + item.documents, 0)
  const peak = publicationsByYear.reduce((current, item) => item.documents > current.documents ? item : current)
  const filteredKeywordData = selectedType === 'Todos' ? keywords : keywords.map((item) => ({
    ...item,
    documents: Math.max(1, Math.round(item.documents * (selectedCount / totalDocuments)))
  }))

  const donutValues = useMemo(() => filteredTypes.map((item) => ({
    ...item,
    share: item.count / totalDocuments,
  })), [filteredTypes])

  const donutSpec = useMemo(() => ({
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    background: 'transparent',
    width: 300,
    height: 245,
    data: { values: donutValues },
    mark: { type: 'arc', innerRadius: 72, stroke: '#161f2d', strokeWidth: 2 },
    encoding: {
      theta: { field: 'count', type: 'quantitative' },
      color: { field: 'type', type: 'nominal', scale: { domain: documentTypes.map((d) => d.type), range: palette }, legend: null },
      tooltip: [
        { field: 'type', title: 'Tipo' },
        { field: 'count', title: 'Documentos', format: ',' },
        { field: 'share', title: '% do total', format: '.1%' }
      ]
    },
    view: { stroke: null }
  }), [donutValues])

  const trendSpec = useMemo(() => ({
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    background: 'transparent',
    width: 'container',
    height: 245,
    data: { values: filteredYears },
    layer: [
      {
        mark: { type: 'area', interpolate: 'monotone', color: '#4dd4bd', opacity: 0.16 },
        encoding: {
          x: { field: 'year', type: 'ordinal', axis: { title: null, labelColor: '#66758a', labelAngle: 0, labelPadding: 10, domain: false, tickColor: '#ccd7e2' } },
          y: { field: 'documents', type: 'quantitative', axis: { title: null, labelColor: '#66758a', gridColor: '#e0e8ef', domain: false, tickColor: 'transparent' }, scale: { zero: true } }
        }
      },
      {
        mark: { type: 'line', interpolate: 'monotone', color: '#159d8b', strokeWidth: 3, point: { filled: true, fill: '#ffffff', stroke: '#159d8b', size: 60, strokeWidth: 2 } },
        encoding: {
          x: { field: 'year', type: 'ordinal' },
          y: { field: 'documents', type: 'quantitative' },
          tooltip: [{ field: 'year', title: 'Ano' }, { field: 'documents', title: 'Documentos' }]
        }
      }
    ],
    config: { axis: { labelFont: 'Inter', titleFont: 'Inter' }, view: { stroke: null } }
  }), [filteredYears])

  const keywordSpec = useMemo(() => ({
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    background: 'transparent',
    width: 'container',
    height: 275,
    data: { values: filteredKeywordData },
    mark: { type: 'bar', cornerRadiusEnd: 6, height: 18 },
    encoding: {
      y: { field: 'keyword', type: 'nominal', sort: '-x', axis: { title: null, labelColor: '#526278', labelLimit: 155, labelPadding: 9, domain: false, ticks: false } },
      x: { field: 'documents', type: 'quantitative', axis: { title: null, labelColor: '#66758a', gridColor: '#e0e8ef', domain: false, ticks: false } },
      color: { field: 'group', type: 'nominal', scale: { domain: ['Tecnologia', 'Aplicações', 'Dados', 'Governança', 'Economia'], range: ['#4dd4bd', '#7e8cff', '#f2c66d', '#f279aa', '#a879e9'] }, legend: null },
      tooltip: [{ field: 'keyword', title: 'Palavra-chave' }, { field: 'documents', title: 'Documentos' }, { field: 'group', title: 'Tema' }]
    },
    config: { axis: { labelFont: 'Inter' }, view: { stroke: null } }
  }), [filteredKeywordData])

  const typeRows = filteredTypes.map((item) => ({
    ...item,
    percent: `${((item.count / totalDocuments) * 100).toFixed(1).replace('.', ',')}%`
  }))

  function clearFilters() {
    setSelectedType('Todos')
    setSelectedYear('Todos')
  }

  function navigate(page) {
    setActivePage(page)
    requestAnimationFrame(() => document.getElementById('dashboard-content')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  function selectPage(page) {
    if (page === 'Administração' && !adminCredentials) {
      setLoginOpen(true)
      return
    }
    navigate(page)
  }

  function logout() {
    setAdminCredentials(null)
    setProfileOpen(false)
    navigate('Visão geral')
  }

  function openProfile() {
    if (!adminCredentials) {
      setLoginOpen(true)
      return
    }
    setProfileOpen(true)
  }

  async function saveProfile(profile) {
    await saveData({ ...data, profile })
  }

  return <main className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#inicio" aria-label="Observatório Blockchain">
        <span className="brand-mark"><i></i><i></i><i></i></span>
        <span>observatório<br/><b>blockchain</b></span>
      </a>
      <nav aria-label="Navegação do dashboard">
        {[
          ['Visão geral', 'overview'], ['Evolução', 'trend'], ['Publicações', 'library'], ['Sobre os dados', 'info'], ['Administração', 'admin']
        ].map(([label, icon]) => <button key={label} className={activePage === label ? 'active' : ''} onClick={() => selectPage(label)}>
          <NavIcon name={icon}/><span>{label}</span>
        </button>)}
      </nav>
      <div className="sidebar-footer">
        <span className="pulse"></span> Dados públicos
        <small>Fonte: ONB / IBICT</small>
      </div>
    </aside>

    <section className={`dashboard view-${activePage.toLowerCase().replaceAll(' ', '-')}`} id="inicio">
      <header className="topbar">
        <div>
          <p className="eyebrow">INDICADORES · PRODUÇÃO CIENTÍFICA</p>
          <h1>{activePage}</h1>
        </div>
        <div className="topbar-actions">
          <a href={source.dashboardUrl} target="_blank" rel="noreferrer">Abrir no Kibana <span>↗</span></a>
          <button className="avatar" aria-label={adminCredentials ? 'Editar perfil' : 'Entrar na administração'} title={adminCredentials ? 'Editar perfil' : 'Entrar na administração'} onClick={openProfile}>{data.profile.photo ? <img src={data.profile.photo} alt="" /> : data.profile.initials}</button>
        </div>
      </header>

      {activePage !== 'Administração' && <section className="filters" aria-label="Filtros">
        <div className="filter-label"><span>⌕</span><b>Explorar dados</b></div>
        <label>Tipo documental
          <select value={selectedType} onChange={(event) => setSelectedType(event.target.value)}>
            <option>Todos</option>
            {documentTypes.map((item) => <option key={item.type}>{item.type}</option>)}
          </select>
        </label>
        <label>Ano de publicação
          <select value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)}>
            <option>Todos</option>
            {publicationsByYear.map((item) => <option key={item.year}>{item.year}</option>)}
          </select>
        </label>
        {(selectedType !== 'Todos' || selectedYear !== 'Todos') && <button className="clear-filter" onClick={clearFilters}>Limpar filtros</button>}
      </section>}

      {activePage !== 'Sobre os dados' && activePage !== 'Administração' && <section className="metrics" aria-label="Resumo">
        <MetricCard label="Documentos mapeados" value={compact(selectedCount)} detail={selectedType === 'Todos' ? 'Base consolidada' : `Seleção: ${selectedType}`} />
        <MetricCard label="Pico de produção" value={compact(peak.documents)} detail={`${peak.year} · documentos publicados`} accent="blue" />
        <MetricCard label="Palavra-chave líder" value="Smart contract" detail="81 arquivos indexados" accent="gold" />
        <MetricCard label="Período coberto" value={`${publicationsByYear[0].year}—${publicationsByYear.at(-1).year}`} detail={`${compact(totalInSeries)} documentos na série`} accent="pink" />
      </section>}

      {activePage === 'Administração' && adminCredentials ? <AdminPanel data={data} onSave={saveData} onLogout={logout} storageState={storageState} /> : activePage !== 'Sobre os dados' ? <div id="dashboard-content">
      <section className="main-grid">
        <article className="panel composition-panel">
          <div className="panel-heading"><div><p className="section-label">DISTRIBUIÇÃO</p><h2>Composição documental</h2></div><span className="data-chip">{selectedType === 'Todos' ? 'Todos os tipos' : selectedType}</span></div>
          <div className="donut-layout">
            <div className="donut-wrap"><VegaChart spec={donutSpec}/><div className="donut-total"><strong>{compact(selectedCount)}</strong><span>documentos</span></div></div>
            <ul className="legend-list">
              {typeRows.map((item) => <li key={item.type}><span style={{ background: item.color }}></span><div><b>{item.type}</b><small>{compact(item.count)} · {item.percent}</small></div></li>)}
            </ul>
          </div>
        </article>
        <article className="panel trend-panel">
          <div className="panel-heading"><div><p className="section-label">TENDÊNCIA</p><h2>Evolução anual</h2></div><span className="trend-change">↗ crescimento</span></div>
          <VegaChart spec={trendSpec}/>
          <p className="panel-note">Publicações por ano, conforme o recorte disponível no painel.</p>
        </article>
      </section>

      <section className="lower-grid">
        <article className="panel keywords-panel">
          <div className="panel-heading"><div><p className="section-label">ASSUNTOS</p><h2>Palavras-chave em destaque</h2></div><button className="more" aria-label="Mais opções">•••</button></div>
          <VegaChart spec={keywordSpec}/>
        </article>
        <article className="panel insight-panel">
          <p className="section-label">LEITURA RÁPIDA</p>
          <h2>Produção científica em blockchain</h2>
          <p className="insight-copy">Artigos concentram a maior parte da base, enquanto a produção anual ganha escala a partir de 2018.</p>
          <div className="insight-stat"><span>56,9%</span><p>dos registros são artigos científicos.</p></div>
          <a href={source.url} target="_blank" rel="noreferrer">Ver metodologia e fonte <span>→</span></a>
        </article>
      </section></div> : <section className="about-panel" id="dashboard-content">
        <p className="section-label">TRANSPARÊNCIA</p>
        <h2>Sobre os dados</h2>
        <p>Esta visualização apresenta a produção científica sobre blockchain publicada no painel do Observatório Nacional de Blockchain.</p>
        <div className="about-grid">
          <div><span>Fonte pública</span><b>Observatório Nacional de Blockchain</b></div>
          <div><span>Visualização original</span><b>Painel público no Kibana</b></div>
          <div><span>Atualização</span><b>Recorte versionado do painel</b></div>
        </div>
        <a href={source.url} target="_blank" rel="noreferrer">Acessar a página de origem <span>↗</span></a>
      </section>}

      <footer>
        <span>{source.snapshot}</span>
        <span>{source.description}</span>
      </footer>
    </section>
    {loginOpen && <AdminLoginModal onClose={() => setLoginOpen(false)} onAuthenticate={authenticateAdmin} />}
    {profileOpen && <ProfileModal profile={data.profile} onClose={() => setProfileOpen(false)} onSave={saveProfile} />}
  </main>
}
