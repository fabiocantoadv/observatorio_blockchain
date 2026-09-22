// One-off migration: add the usuarios table to an existing observatorio.sql
// (used because the source CSVs are no longer present to run a full rebuild).
// Safe to run multiple times.

import Database from 'better-sqlite3'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { hashPassword } from './lib/password.mjs'

const dbPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'observatorio.sql')
const db = new Database(dbPath, { fileMustExist: true })

db.exec(`CREATE TABLE IF NOT EXISTS usuarios (
  username TEXT PRIMARY KEY,
  senha_hash TEXT NOT NULL
);`)

const seedUser = process.env.SEED_ADMIN_USERNAME || 'admin'
const seedPass = process.env.SEED_ADMIN_PASSWORD || 'Dados@2026'

const exists = db.prepare('SELECT 1 FROM usuarios WHERE username = ?').get(seedUser)
if (exists) {
  db.prepare('UPDATE usuarios SET senha_hash = ? WHERE username = ?').run(hashPassword(seedPass), seedUser)
  console.log(`usuário "${seedUser}" atualizado.`)
} else {
  db.prepare('INSERT INTO usuarios (username, senha_hash) VALUES (?, ?)').run(seedUser, hashPassword(seedPass))
  console.log(`usuário "${seedUser}" criado.`)
}

db.pragma('wal_checkpoint(TRUNCATE)')
db.close()
console.log('Migração concluída.')
