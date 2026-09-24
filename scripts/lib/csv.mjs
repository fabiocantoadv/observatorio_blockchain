import { createReadStream } from 'node:fs'

export async function parseCsvFile(path, onRow) {
  const stream = createReadStream(path, { encoding: 'utf8' })
  let header = null
  let field = ''
  let row = []
  let inQuotes = false
  let pendingCR = false

  function endField() {
    row.push(field)
    field = ''
  }

  function endRow() {
    endField()
    if (row.length === 1 && row[0] === '') {
      row = []
      return
    }
    if (!header) {
      header = row
    } else {
      const obj = {}
      for (let i = 0; i < header.length; i++) obj[header[i]] = row[i] ?? ''
      onRow(obj)
    }
    row = []
  }

  for await (const chunk of stream) {
    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i]

      if (pendingCR) {
        pendingCR = false
        if (ch === '\n') {
          endRow()
          continue
        }
        endRow()
      }

      if (inQuotes) {
        if (ch === '"') {
          if (chunk[i + 1] === '"') {
            field += '"'
            i++
          } else {
            inQuotes = false
          }
        } else {
          field += ch
        }
      } else {
        if (ch === '"') {
          inQuotes = true
        } else if (ch === ',') {
          endField()
        } else if (ch === '\n') {
          endRow()
        } else if (ch === '\r') {
          pendingCR = true
        } else {
          field += ch
        }
      }
    }
  }

  if (pendingCR) endRow()
  else if (field !== '' || row.length > 0) endRow()
}
