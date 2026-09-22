import { verifyUser } from './lib/database.mjs'

// Falls back to environment variables when the database has no users table
// (e.g. an environment where the native SQLite module is unavailable).
function envMatches(username, password) {
  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) return false
  return username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD
}

export default function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store')
  if (request.method !== 'POST') return response.status(405).json({ error: 'Método não permitido.' })

  const { username, password } = request.body || {}
  if (!username || !password) {
    return response.status(400).json({ error: 'Informe usuário e senha.' })
  }

  if (verifyUser(username, password) || envMatches(username, password)) {
    return response.status(200).json({ authenticated: true })
  }
  return response.status(401).json({ error: 'Usuário ou senha inválidos.' })
}
