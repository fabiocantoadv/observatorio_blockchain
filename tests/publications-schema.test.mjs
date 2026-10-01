import assert from 'node:assert/strict'
import test from 'node:test'
import { createClient } from '@libsql/client'
import { readPublications } from '../api/lib/insights.mjs'

async function withDatabase(extraColumns, run) {
  const conn = createClient({ url: 'file::memory:' })
  try {
    await conn.execute(`CREATE TABLE publicacoes (
      id INTEGER PRIMARY KEY, fonte TEXT, titulo TEXT, tipo TEXT, ano INTEGER,
      doi TEXT, autores TEXT, instituicoes TEXT, paises TEXT, idioma TEXT
      ${extraColumns ? `, ${extraColumns}` : ''}
    )`)
    await conn.execute({
      sql: `INSERT INTO publicacoes (id, fonte, titulo, tipo, ano, doi)
            VALUES (1, 'openalex', 'Blockchain', 'Artigo', 2025, ?)`,
      args: ['https://doi.org/10.1234/exemplo'],
    })
    await run(conn)
  } finally {
    conn.close()
  }
}

test('reads the production schema before topics and identifiers were added', async () => {
  await withDatabase('', async (conn) => {
    const { rows } = await readPublications(conn)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].titulo, 'Blockchain')
    assert.equal(rows[0].doi, 'https://doi.org/10.1234/exemplo')
    assert.equal(rows[0].topico_principal, null)
    assert.equal(rows[0].identificador, null)
    assert.equal(rows[0].identificador_tipo, null)
    assert.equal(rows[0].identificador_url, null)
  })
})

test('preserves topics when identifier columns have not been added yet', async () => {
  await withDatabase('topico_principal TEXT', async (conn) => {
    await conn.execute("UPDATE publicacoes SET topico_principal = 'Computer Science'")
    const { rows } = await readPublications(conn)
    assert.equal(rows[0].topico_principal, 'Computer Science')
    assert.equal(rows[0].identificador, null)
  })
})

test('preserves identifiers when the topic column is absent', async () => {
  await withDatabase('identificador TEXT, identificador_tipo TEXT, identificador_url TEXT', async (conn) => {
    await conn.execute("UPDATE publicacoes SET identificador = '10.1234/exemplo', identificador_tipo = 'DOI', identificador_url = 'https://doi.org/10.1234/exemplo'")
    const { rows } = await readPublications(conn)
    assert.equal(rows[0].topico_principal, null)
    assert.equal(rows[0].identificador, '10.1234/exemplo')
    assert.equal(rows[0].identificador_tipo, 'DOI')
    assert.equal(rows[0].identificador_url, 'https://doi.org/10.1234/exemplo')
  })
})

test('preserves every field in the current schema', async () => {
  await withDatabase('topico_principal TEXT, identificador TEXT, identificador_tipo TEXT, identificador_url TEXT', async (conn) => {
    await conn.execute("UPDATE publicacoes SET topico_principal = 'Computer Science', identificador = '10.1234/exemplo', identificador_tipo = 'DOI', identificador_url = 'https://doi.org/10.1234/exemplo'")
    const { rows } = await readPublications(conn)
    assert.equal(rows[0].topico_principal, 'Computer Science')
    assert.equal(rows[0].identificador, '10.1234/exemplo')
    assert.equal(rows[0].identificador_tipo, 'DOI')
    assert.equal(rows[0].identificador_url, 'https://doi.org/10.1234/exemplo')
  })
})

test('does not suppress errors when the publications table is missing', async () => {
  const conn = createClient({ url: 'file::memory:' })
  try {
    await assert.rejects(readPublications(conn), /no such table: publicacoes/)
  } finally {
    conn.close()
  }
})
