import { useEffect, useRef, useState } from 'react'

function initialsFrom(name) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'AD'
}

export function ProfileModal({ profile, onClose, onSave }) {
  const [draft, setDraft] = useState(profile)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const fileInput = useRef(null)

  useEffect(() => setDraft(profile), [profile])

  function updateName(name) {
    setDraft((current) => ({ ...current, name, initials: initialsFrom(name) }))
  }

  function selectPhoto(event) {
    const [file] = event.target.files
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setMessage('Selecione uma imagem válida.')
      return
    }
    if (file.size > 700 * 1024) {
      setMessage('Escolha uma foto de até 700 KB para manter o JSON leve.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setDraft((current) => ({ ...current, photo: String(reader.result) }))
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      await onSave(draft)
      onClose()
    } catch (error) {
      setMessage(error.message || 'Não foi possível atualizar o perfil.')
    } finally {
      setSaving(false)
    }
  }

  return <div className="login-overlay" role="presentation" onMouseDown={onClose}>
    <section className="login-modal profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title" onMouseDown={(event) => event.stopPropagation()}>
      <button className="modal-close" type="button" onClick={onClose} aria-label="Fechar">×</button>
      <p className="section-label">PERFIL ADMINISTRATIVO</p>
      <h2 id="profile-title">Editar perfil</h2>
      <p>Esse perfil aparece no canto superior do dashboard.</p>
      <form onSubmit={handleSubmit}>
        <div className="profile-preview">{draft.photo ? <img src={draft.photo} alt="Prévia do perfil" /> : <span>{draft.initials}</span>}</div>
        <div className="profile-photo-actions"><button className="secondary-button" type="button" onClick={() => fileInput.current?.click()}>Escolher foto</button>{draft.photo && <button className="remove-button" type="button" onClick={() => setDraft((current) => ({ ...current, photo: '' }))}>Remover foto</button>}<input ref={fileInput} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={selectPhoto} /></div>
        <label>Nome exibido<input value={draft.name} onChange={(event) => updateName(event.target.value)} maxLength="50" required autoFocus /></label>
        <label>Iniciais<input value={draft.initials} onChange={(event) => setDraft((current) => ({ ...current, initials: event.target.value.toUpperCase().slice(0, 3) }))} maxLength="3" required /></label>
        {message && <p className="login-message" role="alert">{message}</p>}
        <button className="login-submit" disabled={saving}>{saving ? 'Salvando…' : 'Salvar perfil'}</button>
      </form>
    </section>
  </div>
}
