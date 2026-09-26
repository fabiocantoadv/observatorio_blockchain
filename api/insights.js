import { buildInsights, parseFilters } from './lib/insights.mjs'

// GET /api/insights?tipo=&ano=&instituicao=&autor=&pais=&idioma=&palavra=&topico=
export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store')
  if (request.method !== 'GET') return response.status(405).json({ error: 'Método não permitido.' })
  try {
    return response.status(200).json(await buildInsights(parseFilters(new URL(request.url, 'http://localhost'))))
  } catch (error) {
    console.error(error)
    return response.status(500).json({ error: 'Erro ao acessar o banco de dados.' })
  }
}
