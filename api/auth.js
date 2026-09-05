function configured() {
  return Boolean(process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD)
}

export default function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store')
  if (request.method !== 'POST') return response.status(405).json({ error: 'Método não permitido.' })
  if (!configured()) return response.status(503).json({ error: 'As credenciais administrativas ainda não foram configuradas.' })

  const { username, password } = request.body || {}
  if (username !== process.env.ADMIN_USERNAME || password !== process.env.ADMIN_PASSWORD) {
    return response.status(401).json({ error: 'Usuário ou senha inválidos.' })
  }
  return response.status(200).json({ authenticated: true })
}
