import { useState } from 'react'

export function AdminLoginModal({ onClose, onAuthenticate }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    try {
      await onAuthenticate({ username, password })
    } catch (error) {
      setMessage(error.message || 'Não foi possível autenticar.')
    } finally {
      setLoading(false)
    }
  }

  return <div className="login-overlay" role="presentation" onMouseDown={onClose}>
    <section className="login-modal" role="dialog" aria-modal="true" aria-labelledby="login-title" onMouseDown={(event) => event.stopPropagation()}>
      <button className="modal-close" type="button" onClick={onClose} aria-label="Fechar">×</button>
      <div className="login-icon" aria-hidden="true">⌁</div>
      <p className="section-label">ACESSO RESTRITO</p>
      <h2 id="login-title">Entrar na administração</h2>
      <p>Informe suas credenciais para gerenciar os dados publicados.</p>
      <form onSubmit={handleSubmit}>
        <label>Usuário<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required autoFocus /></label>
        <label>Senha<span className="password-field"><input type={passwordVisible ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /><button type="button" className="password-toggle" onClick={() => setPasswordVisible((visible) => !visible)} aria-label={passwordVisible ? 'Ocultar senha' : 'Mostrar senha'}>{passwordVisible ? 'Ocultar' : 'Mostrar'}</button></span></label>
        {message && <p className="login-message" role="alert">{message}</p>}
        <button className="login-submit" disabled={loading}>{loading ? 'Verificando…' : 'Entrar'}</button>
      </form>
    </section>
  </div>
}
