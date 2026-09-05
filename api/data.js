import { BlobPreconditionFailedError, get, head, put } from '@vercel/blob'

const pathname = 'banco_de_dados.json'

function configured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN && process.env.ADMIN_PASSWORD)
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

  if (!configured()) {
    return response.status(200).json({ data: null, storage: 'seed' })
  }

  try {
    if (request.method === 'GET') {
      const stored = await get(pathname, { access: 'private', useCache: false })
      if (!stored) return response.status(200).json({ data: null, storage: 'seed' })
      return response.status(200).json({
        data: await new Response(stored.stream).json(),
        etag: stored.blob.etag,
        updatedAt: stored.blob.uploadedAt,
        storage: 'blob'
      })
    }

    if (request.method !== 'POST') return response.status(405).json({ error: 'Método não permitido.' })

    const authorization = request.headers.authorization || ''
    if (authorization !== `Bearer ${process.env.ADMIN_PASSWORD}`) {
      return response.status(401).json({ error: 'Senha administrativa inválida.' })
    }
    const { data, etag } = request.body || {}
    if (!validSnapshot(data)) return response.status(400).json({ error: 'O formato do JSON é inválido.' })

    let current
    try {
      current = await head(pathname)
    } catch (error) {
      if (error?.status !== 404 && error?.name !== 'BlobNotFoundError') throw error
    }
    if (current && etag !== current.etag) {
      return response.status(409).json({ error: 'Os dados foram alterados por outra pessoa. Atualize a página e tente novamente.' })
    }

    const blob = await put(pathname, JSON.stringify(data, null, 2), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json; charset=utf-8',
      cacheControlMaxAge: 60,
      ...(current ? { ifMatch: current.etag } : {})
    })
    return response.status(200).json({ data, etag: blob.etag, updatedAt: new Date().toISOString(), storage: 'blob' })
  } catch (error) {
    if (error instanceof BlobPreconditionFailedError || error?.name === 'BlobPreconditionFailedError') {
      return response.status(409).json({ error: 'Os dados foram alterados por outra pessoa. Atualize a página e tente novamente.' })
    }
    console.error(error)
    return response.status(500).json({ error: 'Erro ao acessar o armazenamento de dados.' })
  }
}
