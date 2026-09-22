// Re-exports the canonical password helper that lives in api/lib so the
// serverless bundle stays self-contained. Scripts import from here.
export { hashPassword, verifyPassword } from '../../api/lib/password.mjs'
