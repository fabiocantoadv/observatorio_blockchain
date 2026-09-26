import { buildPatentInsights, listPatents } from './lib/patents.mjs'

function csvCell(value) {
  const text = String(value ?? '')
  return /[";\n,]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

// GET /api/patentes?view=insights|list&ano=&pais=&q=&page=&size=&format=csv
export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store')
  if (request.method !== 'GET') return response.status(405).json({ error: 'Método não permitido.' })
  try {
    const url = new URL(request.url, 'http://localhost')
    const get = (key) => url.searchParams.get(key) || ''
    const filters = { ano: get('ano'), pais: get('pais'), q: get('q') }

    if (get('view') === 'insights') return response.status(200).json(await buildPatentInsights(filters))

    const result = await listPatents(filters, { page: get('page'), size: get('size') })
    if (get('format') === 'csv') {
      const header = ['Nº do pedido', 'Título', 'Titular', 'País do titular', 'Data de depósito', 'Resumo']
      const lines = result.all().map((p) => [p.numero, p.titulo, p.titular, p.pais, p.data, p.resumo].map(csvCell).join(','))
      response.setHeader('Content-Type', 'text/csv; charset=utf-8')
      response.setHeader('Content-Disposition', 'attachment; filename="patentes.csv"')
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
