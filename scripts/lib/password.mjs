// Small password hashing helper using Node's built-in scrypt (no dependencies).
// Format stored in the database: "scrypt$<saltHex>$<hashHex>".
//
// This keeps admin credentials out of plain text even for this POC.

import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto'

const KEYLEN = 64

export function hashPassword(password) {
  const salt = randomBytes(16)
  const hash = scryptSync(String(password), salt, KEYLEN)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

export function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const salt = Buffer.from(parts[1], 'hex')
  const expected = Buffer.from(parts[2], 'hex')
  const actual = scryptSync(String(password), salt, expected.length)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
