import { buildInsights } from './lib/insights.mjs'

function params(request) {
  const url = new URL(request.url, 'http://localhost')
  return { tipo: url.searchParams.get('tipo') || '', ano: url.searchParams.get('ano') || '' }
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store')
  if (request.method !== 'GET') return response.status(405).json({ error: 'Método não permitido.' })
  try {
    return response.status(200).json(await buildInsights(params(request)))
  } catch (error) {
    console.error(error)
    return response.status(500).json({ error: 'Erro ao acessar o banco de dados.' })
  }
}
