import { buildSnapshotFromDatabase, saveSnapshotToDatabase, verifyUser } from './lib/database.mjs'

function envMatches(username, password) {
  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) return false
  return username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD
}

// Parses a "Basic base64(user:pass)" header into { username, password }.
function parseBasicAuth(authorization) {
  if (!authorization || !authorization.startsWith('Basic ')) return null
  const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8')
  const sep = decoded.indexOf(':')
  if (sep < 0) return null
  return { username: decoded.slice(0, sep), password: decoded.slice(sep + 1) }
}

function validSnapshot(data) {
  if (!data || typeof data !== 'object' || !data.source || typeof data.source !== 'object') return false
  if (!['name', 'url', 'dashboardUrl', 'description', 'snapshot'].every((key) => typeof data.source[key] === 'string')) return false
  if (!Array.isArray(data.documentTypes) || !Array.isArray(data.publicationsByYear) || !Array.isArray(data.keywords)) return false
  if (!data.documentTypes.length || !data.publicationsByYear.length || !data.keywords.length) return false
  return data.documentTypes.every((item) => typeof item.type === 'string' && Number.isFinite(item.count) && typeof item.color === 'string')
    && data.publicationsByYear.every((item) => Number.isInteger(item.year) && Number.isFinite(item.documents))
    && data.keywords.every((item) => typeof item.keyword === 'string' && typeof item.group === 'string' && Number.isFinite(item.documents))
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store')

  if (request.method === 'GET') {
    const data = buildSnapshotFromDatabase()
    if (!data) return response.status(200).json({ data: null, storage: 'seed' })
    return response.status(200).json({ data, storage: 'sqlite' })
  }

  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Método não permitido.' })
  }

  // Authenticate the admin (database users, with env-var fallback).
  const creds = parseBasicAuth(request.headers.authorization || '')
  if (!creds || !(verifyUser(creds.username, creds.password) || envMatches(creds.username, creds.password))) {
    return response.status(401).json({ error: 'Sua sessão não é válida. Entre novamente.' })
  }

  const { data } = request.body || {}
  if (!validSnapshot(data)) return response.status(400).json({ error: 'O formato dos dados é inválido.' })

  try {
    const saved = saveSnapshotToDatabase(data)
    return response.status(200).json({ data: saved, storage: 'sqlite', updatedAt: new Date().toISOString() })
  } catch (error) {
    console.error(error)
    // Serverless filesystem is read-only: writes cannot persist there.
    return response.status(503).json({ error: 'O banco não pôde ser gravado neste ambiente (somente leitura). Rode localmente para persistir alterações.' })
  }
}
