import { listPublications, parseFilters } from './lib/insights.mjs'

function csvCell(value) {
  const text = Array.isArray(value) ? value.join('; ') : String(value ?? '')
  return /[";\n,]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store')
  if (request.method !== 'GET') return response.status(405).json({ error: 'Método não permitido.' })
  try {
    const url = new URL(request.url, 'http://localhost')
    const get = (key) => url.searchParams.get(key) || ''
    const filters = parseFilters(url)
    const result = await listPublications(filters, { page: get('page'), size: get('size') })

    if (get('format') === 'csv') {
      const header = ['Título', 'Tipo de documento', 'Ano', 'Autores', 'Afiliações', 'DOI', 'Fonte']
      const lines = result.all().map((r) => [r.titulo, r.tipo, r.ano, r.autores, r.instituicoes, r.doi, r.fonte].map(csvCell).join(','))
      response.setHeader('Content-Type', 'text/csv; charset=utf-8')
      response.setHeader('Content-Disposition', 'attachment; filename="publicacoes.csv"')
      response.statusCode = 200
      return response.end('﻿' + [header.join(','), ...lines].join('\n'))
    }

    const { all, ...payload } = result
    return response.status(200).json(payload)
  } catch (error) {
    console.error(error)
    return response.status(500).json({ error: 'Erro ao acessar o banco de dados.' })
  }
}
