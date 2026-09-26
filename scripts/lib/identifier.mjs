// Identificador persistente de uma publicação: DOI ou, na falta dele, Handle.
const DOI_RE = /\b(10\.\d{4,9}\/[^\s|"'<>]+)/i
const HANDLE_NET_RE = /https?:\/\/hdl\.handle\.net\/([^\s|?#]+\/[^\s|?#]+)/i
const HANDLE_URL_RE = /(https?:\/\/[^\s|]*?\/handle\/([^\s|/?#]+\/[^\s|/?#]+))/i

function cleanDoi(value) {
  return value.replace(/[.,;:)\]]+$/, '')
}

// Recebe os campos de texto em que o identificador pode aparecer, em ordem de preferência.
export function extractIdentifier(...fields) {
  const texts = fields.map((f) => String(f || ''))
  for (const text of texts) {
    const doi = text.match(DOI_RE)
    if (doi) {
      const value = cleanDoi(doi[1])
      return { tipo: 'DOI', valor: value, url: `https://doi.org/${value}` }
    }
  }
  for (const text of texts) {
    const net = text.match(HANDLE_NET_RE)
    if (net) return { tipo: 'Handle', valor: net[1], url: `https://hdl.handle.net/${net[1]}` }
  }
  for (const text of texts) {
    const local = text.match(HANDLE_URL_RE)
    if (local) return { tipo: 'Handle', valor: local[2], url: local[1] }
  }
  return null
}
