import { useMemo, useState } from 'react'

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true })

function normalize(value) {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function downloadCsv(filename, header, rows) {
  const cell = (value) => {
    const text = Array.isArray(value) ? value.join('; ') : String(value ?? '')
    return /[";\n,]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const csv = '﻿' + [header, ...rows].map((row) => row.map(cell).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function Pager({ page, pages, onPage }) {
  if (pages <= 1) return null
  const around = [page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages)
  const list = [...new Set([1, ...around, pages])]
  return <nav className="pager" aria-label="Paginação">
    <button disabled={page === 1} onClick={() => onPage(page - 1)} aria-label="Página anterior">‹</button>
    {list.map((p, index) => <span key={p}>
      {index > 0 && p - list[index - 1] > 1 && <em>…</em>}
      <button className={p === page ? 'current' : ''} aria-current={p === page ? 'page' : undefined} onClick={() => onPage(p)}>{p}</button>
    </span>)}
    <button disabled={page === pages} onClick={() => onPage(page + 1)} aria-label="Próxima página">›</button>
  </nav>
}

// Tabela com busca, ordenação por coluna, paginação e exportação CSV (tudo no cliente).
// onRowClick(row): torna cada linha um filtro clicável; selectedKey + rowKey destacam a linha escolhida.
export function DataTable({ columns, rows, pageSize = 10, searchKeys, exportName, emptyText = 'Nenhum registro.', onRowClick, rowKey, selectedKey }) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState({ key: null, dir: 'desc' })
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const needle = normalize(query.trim())
    let list = needle ? rows.filter((row) => (searchKeys || columns.map((c) => c.key)).some((key) => normalize(row[key]).includes(needle))) : rows
    if (sort.key) {
      const factor = sort.dir === 'asc' ? 1 : -1
      list = [...list].sort((a, b) => {
        const x = a[sort.key], y = b[sort.key]
        return factor * (typeof x === 'number' && typeof y === 'number' ? x - y : collator.compare(String(x ?? ''), String(y ?? '')))
      })
    }
    return list
  }, [rows, query, sort, columns, searchKeys])

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const current = Math.min(page, pages)
  const visible = filtered.slice((current - 1) * pageSize, current * pageSize)

  function toggleSort(key) {
    setPage(1)
    setSort((s) => s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' })
  }

  return <div className="data-table-wrap">
    <div className="table-toolbar">
      <label className="table-search"><span aria-hidden="true">⌕</span>
        <input type="search" value={query} placeholder="Filtrar…" aria-label="Filtrar tabela" onChange={(e) => { setQuery(e.target.value); setPage(1) }} />
      </label>
      <small>{new Intl.NumberFormat('pt-BR').format(filtered.length)} registros</small>
    </div>
    <div className="table-scroll">
      <table className="data-table">
        <thead><tr>
          <th className="num">#</th>
          {columns.map((c) => <th key={c.key} className={c.align === 'right' ? 'num' : ''} aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
            <button onClick={() => toggleSort(c.key)}>{c.label}<span aria-hidden="true">{sort.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ' ↕'}</span></button>
          </th>)}
        </tr></thead>
        <tbody>
          {visible.length ? visible.map((row, index) => {
            const selected = Boolean(selectedKey) && rowKey && String(row[rowKey]).toLowerCase() === String(selectedKey).toLowerCase()
            return <tr key={index} className={`${onRowClick ? 'clickable-row' : ''} ${selected ? 'selected-row' : ''}`} onClick={onRowClick ? (event) => { if (!event.target.closest('a')) onRowClick(row) } : undefined}>
              <td className="num muted">{(current - 1) * pageSize + index + 1}</td>
              {columns.map((c, ci) => <td key={c.key} className={c.align === 'right' ? 'num' : ''}>
                {ci === 0 && onRowClick
                  ? <button type="button" className="row-filter" aria-pressed={selected} title={selected ? 'Remover filtro' : 'Filtrar o painel por este valor'}>{c.render ? c.render(row) : row[c.key]}</button>
                  : (c.render ? c.render(row) : row[c.key])}
              </td>)}
            </tr>
          }) : <tr><td colSpan={columns.length + 1} className="muted">{emptyText}</td></tr>}
        </tbody>
      </table>
    </div>
    <div className="table-footer">
      {exportName && <button className="export-button" onClick={() => downloadCsv(exportName, columns.map((c) => c.label), filtered.map((row) => columns.map((c) => row[c.key])))}>Exportar CSV ↓</button>}
      <Pager page={current} pages={pages} onPage={setPage} />
    </div>
  </div>
}
