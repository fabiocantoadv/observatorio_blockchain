import { useEffect, useRef, useState } from 'react'

const keywordGroups = ['Tecnologia', 'Aplicações', 'Dados', 'Governança', 'Economia']

function isValidSnapshot(value) {
  const hasSource = value?.source && ['name', 'url', 'dashboardUrl', 'description', 'snapshot'].every((key) => typeof value.source[key] === 'string')
  return Boolean(hasSource)
    && ['documentTypes', 'publicationsByYear', 'keywords'].every((key) => Array.isArray(value[key]) && value[key].length > 0)
    && value.documentTypes.every((item) => typeof item.type === 'string' && Number.isFinite(item.count) && typeof item.color === 'string')
    && value.publicationsByYear.every((item) => Number.isInteger(item.year) && Number.isFinite(item.documents))
    && value.keywords.every((item) => typeof item.keyword === 'string' && typeof item.group === 'string' && Number.isFinite(item.documents))
}

function downloadJson(data) {
  const file = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'banco_de_dados.json'
  anchor.click()
  URL.revokeObjectURL(url)
}

export function AdminPanel({ data, onSave, storageState }) {
  const [draft, setDraft] = useState(data)
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const fileInput = useRef(null)

  useEffect(() => setDraft(data), [data])

  function updateSource(field, value) {
    setDraft((current) => ({ ...current, source: { ...current.source, [field]: value } }))
  }

  function updateItem(collection, index, field, value) {
    const numericFields = new Set(['count', 'year', 'documents'])
    setDraft((current) => ({
      ...current,
      [collection]: current[collection].map((item, itemIndex) => itemIndex === index
        ? { ...item, [field]: numericFields.has(field) ? Number(value) : value }
        : item)
    }))
  }

  function removeItem(collection, index) {
    setDraft((current) => ({ ...current, [collection]: current[collection].filter((_, itemIndex) => itemIndex !== index) }))
  }

  function addItem(collection) {
    const defaults = {
      documentTypes: { type: 'Novo tipo', count: 0, color: '#4dd4bd' },
      publicationsByYear: { year: new Date().getFullYear(), documents: 0 },
      keywords: { keyword: 'Nova palavra-chave', documents: 0, group: 'Tecnologia' }
    }
    setDraft((current) => ({ ...current, [collection]: [...current[collection], defaults[collection]] }))
  }

  async function handleSave(event) {
    event.preventDefault()
    if (!isValidSnapshot(draft)) {
      setMessage('Preencha todos os campos e mantenha ao menos um registro em cada seção.')
      return
    }
    if (!password) {
      setMessage('Informe a senha administrativa para publicar as alterações.')
      return
    }
    setSaving(true)
    setMessage('')
    try {
      await onSave(draft, password)
      setPassword('')
      setMessage('Alterações publicadas com sucesso.')
    } catch (error) {
      setMessage(error.message || 'Não foi possível publicar as alterações.')
    } finally {
      setSaving(false)
    }
  }

  function handleImport(event) {
    const [file] = event.target.files
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const imported = JSON.parse(String(reader.result))
        if (!isValidSnapshot(imported)) throw new Error()
        setDraft(imported)
        setMessage('Arquivo carregado. Revise os campos e publique para aplicar.')
      } catch {
        setMessage('Arquivo inválido. Selecione um JSON no formato do banco de dados.')
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  return <section className="admin-panel" id="dashboard-content">
    <div className="admin-heading">
      <div>
        <p className="section-label">ÁREA RESTRITA</p>
        <h2>Administrar dados</h2>
        <p>Edite o conteúdo do painel e publique um único arquivo JSON compartilhado.</p>
      </div>
      <span className={`storage-badge ${storageState === 'blob' ? 'online' : ''}`}>{storageState === 'blob' ? '● Dados publicados' : '○ Dados locais'}</span>
    </div>

    <form onSubmit={handleSave}>
      <section className="admin-card source-card">
        <div className="admin-card-heading"><div><p className="section-label">IDENTIFICAÇÃO</p><h3>Fonte dos dados</h3></div></div>
        <div className="source-fields">
          <label>Nome da fonte<input value={draft.source.name} onChange={(event) => updateSource('name', event.target.value)} /></label>
          <label>Link da fonte<input type="url" value={draft.source.url} onChange={(event) => updateSource('url', event.target.value)} /></label>
          <label>Link do dashboard<input type="url" value={draft.source.dashboardUrl} onChange={(event) => updateSource('dashboardUrl', event.target.value)} /></label>
          <label>Descrição<input value={draft.source.description} onChange={(event) => updateSource('description', event.target.value)} /></label>
          <label className="wide">Nota de atualização<input value={draft.source.snapshot} onChange={(event) => updateSource('snapshot', event.target.value)} /></label>
        </div>
      </section>

      <DataTable title="Tipos documentais" collection="documentTypes" rows={draft.documentTypes} fields={[
        ['type', 'Tipo', 'text'], ['count', 'Quantidade', 'number'], ['color', 'Cor', 'color']
      ]} onUpdate={updateItem} onRemove={removeItem} onAdd={addItem} />
      <DataTable title="Publicações por ano" collection="publicationsByYear" rows={draft.publicationsByYear} fields={[
        ['year', 'Ano', 'number'], ['documents', 'Documentos', 'number']
      ]} onUpdate={updateItem} onRemove={removeItem} onAdd={addItem} />
      <DataTable title="Palavras-chave" collection="keywords" rows={draft.keywords} fields={[
        ['keyword', 'Palavra-chave', 'text'], ['documents', 'Documentos', 'number'], ['group', 'Grupo', 'select']
      ]} onUpdate={updateItem} onRemove={removeItem} onAdd={addItem} />

      <section className="admin-actions">
        <div>
          <label>Senha administrativa<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Configurada no Vercel" autoComplete="current-password" /></label>
          {message && <p className="admin-message" role="status">{message}</p>}
        </div>
        <div className="action-buttons">
          <button type="button" className="secondary-button" onClick={() => downloadJson(draft)}>Exportar JSON</button>
          <button type="button" className="secondary-button" onClick={() => fileInput.current?.click()}>Importar JSON</button>
          <input ref={fileInput} className="visually-hidden" type="file" accept="application/json,.json" onChange={handleImport} />
          <button className="save-button" disabled={saving}>{saving ? 'Publicando…' : 'Publicar alterações'}</button>
        </div>
      </section>
    </form>
  </section>
}

function DataTable({ title, collection, rows, fields, onUpdate, onRemove, onAdd }) {
  return <section className="admin-card data-card">
    <div className="admin-card-heading"><div><p className="section-label">DADOS DO PAINEL</p><h3>{title}</h3></div><button type="button" className="add-button" onClick={() => onAdd(collection)}>+ Adicionar</button></div>
    <div className="admin-table-wrap"><table className="admin-table"><thead><tr>{fields.map(([, label]) => <th key={label}>{label}</th>)}<th aria-label="Ações"></th></tr></thead>
      <tbody>{rows.map((row, index) => <tr key={`${collection}-${index}`}>
        {fields.map(([field, label, type]) => <td key={field} data-label={label}>{type === 'select'
          ? <select value={row[field]} onChange={(event) => onUpdate(collection, index, field, event.target.value)}>{keywordGroups.map((group) => <option key={group}>{group}</option>)}</select>
          : <input aria-label={label} type={type} min={type === 'number' ? '0' : undefined} value={row[field]} onChange={(event) => onUpdate(collection, index, field, event.target.value)} />}
        </td>)}
        <td className="remove-cell"><button type="button" className="remove-button" onClick={() => onRemove(collection, index)}>Remover</button></td>
      </tr>)}</tbody>
    </table></div>
  </section>
}
