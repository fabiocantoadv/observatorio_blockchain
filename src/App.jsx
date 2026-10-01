import { useEffect, useState } from 'react'
import { AdminPanel } from './components/AdminPanel'
import { AdminLoginModal } from './components/AdminLoginModal'
import { ProfileModal } from './components/ProfileModal'
import { DetailSections } from './components/DetailSections'
import { PatentSections } from './components/PatentSections'
import logoObservatorio from './assets/logo-observatorio-blockchain.png'

const DATA_TABS = ['Publicações', 'Patentes']

// Filtros cruzados: os gráficos e tabelas acrescentam critérios ao clicar (ver DetailSections e PatentSections).
const EMPTY_PUB_FILTERS = { tipo: 'Todos', ano: 'Todos', instituicao: '', autor: '', pais: '', idioma: '', palavra: '', topico: '' }
const EMPTY_PATENT_FILTERS = { ano: 'Todos', pais: 'Todos', titular: '' }
const PUB_FILTER_LABELS = { tipo: 'Tipo', ano: 'Ano', instituicao: 'Instituição', autor: 'Autor', pais: 'País', idioma: 'Idioma', palavra: 'Palavra-chave', topico: 'Tópico' }
const PATENT_FILTER_LABELS = { ano: 'Ano de depósito', pais: 'País do titular', titular: 'Titular' }
const LANGUAGE_NAMES = { por: 'Português', eng: 'Inglês', spa: 'Espanhol', ita: 'Italiano', fra: 'Francês', deu: 'Alemão', na: 'Não informado' }

let regionNames
function countryName(code) {
  try {
    regionNames ||= new Intl.DisplayNames(['pt-BR'], { type: 'region' })
    return regionNames.of(code) || code
  } catch {
    return code
  }
}

const isActive = (value) => Boolean(value) && value !== 'Todos'

function describeFilter(key, value) {
  if (key === 'pais' && /^[A-Z]{2}$/.test(value)) return countryName(value)
  if (key === 'idioma') return LANGUAGE_NAMES[value] || value
  return value
}

function FilterChips({ filters, labels, onRemove, onClear }) {
  const active = Object.entries(filters).filter(([, value]) => isActive(value))
  if (!active.length) return null
  return <div className="filter-chips" aria-label="Filtros aplicados">
    <span className="filter-chips-label">Filtrando por</span>
    {active.map(([key, value]) => <button key={key} type="button" className="filter-chip" onClick={() => onRemove(key)} title="Remover este filtro">
      <small>{labels[key]}</small>{describeFilter(key, value)}<span aria-hidden="true">×</span>
    </button>)}
    {active.length > 1 && <button type="button" className="clear-filter" onClick={onClear}>Limpar todos</button>}
  </div>
}

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
  const [pubFilters, setPubFilters] = useState(EMPTY_PUB_FILTERS)
  const [activeTab, setActiveTab] = useState('Publicações')
  const [pubSummary, setPubSummary] = useState(null)
  const [patentSummary, setPatentSummary] = useState(null)
  const [patentFilters, setPatentFilters] = useState(EMPTY_PATENT_FILTERS)
  const [patentOptions, setPatentOptions] = useState({ years: [], countries: [] })
  const [activePage, setActivePage] = useState('Visão geral')
  const [adminCredentials, setAdminCredentials] = useState(null)
  const [loginOpen, setLoginOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const { documentTypes, publicationsByYear, source } = data
  const totalDocuments = documentTypes.reduce((sum, item) => sum + item.count, 0)
  const pubFiltered = Object.values(pubFilters).some(isActive)
  const patentFiltered = Object.values(patentFilters).some(isActive)

  // Clicar de novo no mesmo valor remove o filtro.
  const toggleFilter = (setter, empty) => (key, value) => setter((current) => ({
    ...current,
    [key]: String(current[key]).toLowerCase() === String(value).toLowerCase() ? empty[key] : String(value),
  }))
  const togglePubFilter = toggleFilter(setPubFilters, EMPTY_PUB_FILTERS)
  const togglePatentFilter = toggleFilter(setPatentFilters, EMPTY_PATENT_FILTERS)
  const setPubFilter = (key, value) => setPubFilters((current) => ({ ...current, [key]: value }))
  const setPatentFilter = (key, value) => setPatentFilters((current) => ({ ...current, [key]: value }))

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
        <a className="brand" href="#inicio" aria-label="Observatório Nacional de Blockchain — voltar à visão geral" onClick={(event) => { event.preventDefault(); navigate('Visão geral') }}>
          <img src={logoObservatorio} alt="Observatório Nacional de Blockchain" />
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
          ? <FilterTotal label="Total de publicações" value={compact(pubSummary ? pubSummary.total : totalDocuments)} detail={pubFiltered ? 'No recorte filtrado' : 'Base consolidada'} />
          : <FilterTotal label="Total de patentes" value={patentSummary ? compact(patentSummary.total) : '—'} detail={patentSummary ? `${compact(patentSummary.applications)} números de pedido distintos` : ''} />}
        {activeTab === 'Publicações' ? <>
          <label>Tipo documental
            <select value={pubFilters.tipo} onChange={(event) => setPubFilter('tipo', event.target.value)}>
              <option>Todos</option>
              {documentTypes.map((item) => <option key={item.type}>{item.type}</option>)}
            </select>
          </label>
          <label>Ano de publicação
            <select value={pubFilters.ano} onChange={(event) => setPubFilter('ano', event.target.value)}>
              <option>Todos</option>
              {publicationsByYear.map((item) => <option key={item.year}>{item.year}</option>)}
              {isActive(pubFilters.ano) && !publicationsByYear.some((item) => String(item.year) === pubFilters.ano) && <option>{pubFilters.ano}</option>}
            </select>
          </label>
          <FilterChips filters={pubFilters} labels={PUB_FILTER_LABELS} onRemove={(key) => setPubFilter(key, EMPTY_PUB_FILTERS[key])} onClear={() => setPubFilters(EMPTY_PUB_FILTERS)} />
        </> : <>
          <label>País do titular
            <select value={patentFilters.pais} onChange={(event) => setPatentFilter('pais', event.target.value)}>
              <option>Todos</option>
              {patentOptions.countries.map((country) => <option key={country}>{country}</option>)}
            </select>
          </label>
          <label>Ano de depósito
            <select value={patentFilters.ano} onChange={(event) => setPatentFilter('ano', event.target.value)}>
              <option>Todos</option>
              {patentOptions.years.map((year) => <option key={year}>{year}</option>)}
            </select>
          </label>
          <FilterChips filters={patentFilters} labels={PATENT_FILTER_LABELS} onRemove={(key) => setPatentFilter(key, EMPTY_PATENT_FILTERS[key])} onClear={() => setPatentFilters(EMPTY_PATENT_FILTERS)} />
        </>}
      </section>}

      {activePage === 'Administração' && adminCredentials ? <AdminPanel data={data} onSave={saveData} onLogout={logout} storageState={storageState} /> : activePage !== 'Sobre os dados' ? activeTab === 'Patentes' ? <div id="dashboard-content"><PatentSections filters={patentFilters} onFilter={togglePatentFilter} onSummary={setPatentSummary} /></div> : <div id="dashboard-content">
      <DetailSections filters={pubFilters} onFilter={togglePubFilter} onSummary={setPubSummary} /></div> : <section className="about-panel" id="dashboard-content">
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
