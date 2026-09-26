import { useEffect, useMemo, useState } from 'react'
import { VegaChart } from './components/VegaChart'
import { AdminPanel } from './components/AdminPanel'
import { AdminLoginModal } from './components/AdminLoginModal'
import { ProfileModal } from './components/ProfileModal'
import { DetailSections } from './components/DetailSections'
import { PatentSections } from './components/PatentSections'

const DATA_TABS = ['Publicações', 'Patentes']

const defaultProfile = { name: 'Administrador', initials: 'AD', photo: '' }

const emptyData = {
  profile: defaultProfile,
  source: { name: '', url: '#', dashboardUrl: '#', description: '', snapshot: '' },
  documentTypes: [],
  publicationsByYear: [],
  keywords: [],
  patents: null,
}

function normalizeData(snapshot) {
  return { ...snapshot, profile: { ...defaultProfile, ...snapshot.profile } }
}

function compact(value) {
  return new Intl.NumberFormat('pt-BR').format(value)
}

function FilterTotal({ label, value, detail }) {
  return <div className="filter-total" aria-live="polite">
    <span>{label}</span>
    <strong>{value}</strong>
    {detail && <small>{detail}</small>}
  </div>
}

function NavIcon({ name }) {
  const icons = {
    overview: '⌘', trend: '↗', library: '▤', info: 'i', admin: '⚙'
  }
  return <span className="nav-icon" aria-hidden="true">{icons[name]}</span>
}

export default function App() {
  const [data, setData] = useState(emptyData)
  const [databaseVersion, setDatabaseVersion] = useState(null)
  const [storageState, setStorageState] = useState('seed')
  const [selectedType, setSelectedType] = useState('Todos')
  const [selectedYear, setSelectedYear] = useState('Todos')
  const [activeTab, setActiveTab] = useState('Publicações')
  const [yearSort, setYearSort] = useState('cronologica')
  const [pubSummary, setPubSummary] = useState(null)
  const [patentSummary, setPatentSummary] = useState(null)
  const [patentYear, setPatentYear] = useState('Todos')
  const [patentCountry, setPatentCountry] = useState('Todos')
  const [patentOptions, setPatentOptions] = useState({ years: [], countries: [] })
  const [activePage, setActivePage] = useState('Visão geral')
  const [adminCredentials, setAdminCredentials] = useState(null)
  const [loginOpen, setLoginOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const { documentTypes, keywords, publicationsByYear, source } = data
  const totalDocuments = documentTypes.reduce((sum, item) => sum + item.count, 0)
  const palette = documentTypes.map((item) => item.color)

  useEffect(() => {
    let active = true
    fetch('/api/patentes?view=insights')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Patentes indisponíveis.')))
      .then((payload) => { if (active) setPatentOptions(payload.options) })
      .catch(() => {})
    return () => { active = false }
  }, [])

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
    mark: { type: 'arc', innerRadius: 72, stroke: '#ffffff', strokeWidth: 2 },
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
    height: 260,
    data: { values: filteredYears },
    encoding: {
      x: {
        field: 'year', type: 'ordinal',
        sort: yearSort === 'crescente' ? { field: 'documents', order: 'ascending' } : { field: 'year', order: 'ascending' },
        axis: { title: null, labelColor: '#5c6390', labelAngle: 0, labelPadding: 8, labelOverlap: true, domain: false, ticks: false }
      },
      y: { field: 'documents', type: 'quantitative', axis: { title: null, labelColor: '#5c6390', gridColor: '#e4e6f3', domain: false, ticks: false, tickCount: 6 }, scale: { zero: true } },
      tooltip: [{ field: 'year', title: 'Ano' }, { field: 'documents', title: 'Documentos', format: ',' }]
    },
    layer: [
      { mark: { type: 'bar', color: '#001eff', cornerRadiusEnd: 4, width: { band: 0.72 } } },
      { mark: { type: 'text', dy: -7, color: '#0a0a8c', fontSize: 10, fontWeight: 700, font: 'Manrope, Arial, sans-serif' }, encoding: { text: { field: 'documents', type: 'quantitative', format: ',' } } }
    ],
    config: { axis: { labelFont: 'Manrope, Arial, sans-serif' }, view: { stroke: null } }
  }), [filteredYears, yearSort])


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
    <header className="site-header">
      <div className="site-header-inner">
        <a className="brand" href="#inicio" aria-label="Observatório Blockchain — voltar à visão geral" onClick={(event) => { event.preventDefault(); navigate('Visão geral') }}>
          <span className="brand-mark"><i></i><i></i><i></i></span>
          <span>observatório<br/><b>blockchain</b></span>
        </a>
        <nav aria-label="Navegação do dashboard">
          {[
            ['Sobre os dados', 'info'], ['Administração', 'admin']
          ].map(([label, icon]) => <button key={label} className={activePage === label ? 'active' : ''} aria-current={activePage === label ? 'page' : undefined} onClick={() => selectPage(label)}>
            <NavIcon name={icon}/><span>{label}</span>
          </button>)}
        </nav>
        <div className="header-actions">
          <span className="data-status" title="Fonte: ONB / IBICT"><span className="pulse"></span>Dados públicos<small>ONB / IBICT</small></span>
          <button className="avatar" aria-label={adminCredentials ? 'Editar perfil' : 'Entrar na administração'} title={adminCredentials ? 'Editar perfil' : 'Entrar na administração'} onClick={openProfile}>{data.profile.photo ? <img src={data.profile.photo} alt="" /> : data.profile.initials}</button>
        </div>
      </div>
    </header>


    <section className={`dashboard view-${activePage.toLowerCase().replaceAll(' ', '-')}`} id="inicio">
      <h1 className="visually-hidden">Observatório Blockchain — {activePage}</h1>

      {activePage === 'Visão geral' && <section className="filters" aria-label="Filtros">
        <div className="data-tabs" role="tablist" aria-label="Base de dados">
          {DATA_TABS.map((tab) => <button key={tab} role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{tab}</button>)}
        </div>
        {activeTab === 'Publicações'
          ? <FilterTotal label="Total de publicações" value={compact(pubSummary ? pubSummary.total : selectedCount)} detail={selectedType === 'Todos' && selectedYear === 'Todos' ? 'Base consolidada' : 'No recorte filtrado'} />
          : <FilterTotal label="Total de patentes" value={patentSummary ? compact(patentSummary.total) : '—'} detail={patentSummary ? `${compact(patentSummary.applications)} números de pedido distintos` : ''} />}
        {activeTab === 'Publicações' ? <>
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
        </> : <>
          <label>País do titular
            <select value={patentCountry} onChange={(event) => setPatentCountry(event.target.value)}>
              <option>Todos</option>
              {patentOptions.countries.map((country) => <option key={country}>{country}</option>)}
            </select>
          </label>
          <label>Ano de depósito
            <select value={patentYear} onChange={(event) => setPatentYear(event.target.value)}>
              <option>Todos</option>
              {patentOptions.years.map((year) => <option key={year}>{year}</option>)}
            </select>
          </label>
          {(patentCountry !== 'Todos' || patentYear !== 'Todos') && <button className="clear-filter" onClick={() => { setPatentCountry('Todos'); setPatentYear('Todos') }}>Limpar filtros</button>}
        </>}
      </section>}

      {activePage === 'Administração' && adminCredentials ? <AdminPanel data={data} onSave={saveData} onLogout={logout} storageState={storageState} /> : activePage !== 'Sobre os dados' ? activeTab === 'Patentes' ? <div id="dashboard-content"><PatentSections ano={patentYear} pais={patentCountry} onSummary={setPatentSummary} /></div> : <div id="dashboard-content">
      <section className="main-grid">
        <article className="panel composition-panel">
          <div className="panel-heading"><div><p className="section-label">DISTRIBUIÇÃO</p><h2>Tipos de documentos</h2></div><span className="data-chip">{selectedType === 'Todos' ? 'Todos os tipos' : selectedType}</span></div>
          <div className="donut-layout">
            <div className="donut-wrap"><VegaChart spec={donutSpec}/><div className="donut-total"><strong>{compact(selectedCount)}</strong><span>documentos</span></div></div>
            <ul className="legend-list">
              {typeRows.map((item) => <li key={item.type}><span style={{ background: item.color }}></span><div><b>{item.type}</b><small>{compact(item.count)} · {item.percent}</small></div></li>)}
            </ul>
          </div>
        </article>
        <article className="panel trend-panel">
          <div className="panel-heading"><div><p className="section-label">TENDÊNCIA</p><h2>Publicações por ano</h2></div>
            <div className="sort-toggle" role="group" aria-label="Ordenação das colunas">
              {[['cronologica', 'Cronológica'], ['crescente', 'Crescente']].map(([value, label]) => <button key={value} className={yearSort === value ? 'active' : ''} aria-pressed={yearSort === value} onClick={() => setYearSort(value)}>{label}</button>)}
            </div>
          </div>
          <VegaChart spec={trendSpec}/>
          <p className="panel-note">Número de publicações por ano de publicação. {yearSort === 'crescente' ? 'Colunas ordenadas do menor para o maior valor.' : 'Colunas em ordem cronológica.'}</p>
        </article>
      </section>


      <DetailSections selectedType={selectedType} selectedYear={selectedYear} onSummary={setPubSummary} /></div> : <section className="about-panel" id="dashboard-content">
        <p className="section-label">TRANSPARÊNCIA</p>
        <h2>Sobre os dados</h2>
        <p>Esta visualização consolida a produção científica e as patentes sobre blockchain a partir de três bases públicas: OpenAlex, OASISbr (IBICT) e uma base de patentes de Google Patents, INPI e IBICT. Os dados são ingeridos dos arquivos CSV para um banco SQLite, que alimenta os gráficos.</p>
        <div className="about-grid">
          <div><span>Publicações internacionais</span><b>OpenAlex</b></div>
          <div><span>Teses, dissertações e TCCs</span><b>OASISbr · IBICT</b></div>
          <div><span>Patentes</span><b>Google Patents · INPI · IBICT</b></div>
        </div>
        <a href={source.url} target="_blank" rel="noreferrer">Acessar a página de origem <span>↗</span></a>
      </section>}

    </section>
    {loginOpen && <AdminLoginModal onClose={() => setLoginOpen(false)} onAuthenticate={authenticateAdmin} />}
    {profileOpen && <ProfileModal profile={data.profile} onClose={() => setProfileOpen(false)} onSave={saveProfile} />}
  </main>
}
