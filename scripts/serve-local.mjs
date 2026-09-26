import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, extname } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = join(root, 'dist')
const port = process.env.PORT || 3000

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

const apiHandlers = {
  '/api/data': () => import('../api/data.js'),
  '/api/auth': () => import('../api/auth.js'),
  '/api/insights': () => import('../api/insights.js'),
  '/api/publicacoes': () => import('../api/publicacoes.js'),
}

function decorate(req, res) {
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (obj) => {
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(obj))
    return res
  }
}

async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  if (!chunks.length) return undefined
  const raw = Buffer.concat(chunks).toString('utf8')
  try { return JSON.parse(raw) } catch { return raw }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const pathname = url.pathname

  if (apiHandlers[pathname]) {
    try {
      const mod = await apiHandlers[pathname]()
      const handler = mod.default
      decorate(req, res)
      req.body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req)
      await handler(req, res)
    } catch (err) {
      console.error(err)
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ error: 'Erro interno no servidor local.' }))
    }
    return
  }

  let filePath = join(distDir, pathname === '/' ? 'index.html' : pathname)
  if (!existsSync(filePath)) filePath = join(distDir, 'index.html')
  try {
    const data = await readFile(filePath)
    res.setHeader('Content-Type', MIME[extname(filePath)] || 'application/octet-stream')
    res.end(data)
  } catch {
    res.statusCode = 404
    res.end('Not found')
  }
})

if (!existsSync(distDir)) {
  console.error('dist/ não encontrado. Rode `npm run build` antes de `npm run serve`.')
  process.exit(1)
}

server.listen(port, () => {
  console.log(`Servidor local em http://localhost:${port}`)
  console.log('APIs: /api/data, /api/insights, /api/publicacoes (lêem do observatorio.sql) e /api/auth')
})
