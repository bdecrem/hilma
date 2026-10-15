// Paths, secrets and settings. Everything is read from the environment (launchd loads ~/.almanac.env).
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

const HOME = os.homedir()
export const PORT = Number(process.env.ALMANAC_PORT || 3920)
export const BASE = '/almanac'
export const GAMI_DIR = process.env.GAMI_DIR || path.join(HOME, 'GAMI')
export const GAMI_DB = path.join(GAMI_DIR, 'gami.db')
export const PAPERS_DIR = path.join(GAMI_DIR, 'papers')
export const DATA = process.env.ALMANAC_DATA || path.join(HOME, 'almanac')
export const STATE_DB = path.join(DATA, 'almanac.db')
export const ARTIFACTS = path.join(DATA, 'artifacts')
export const WORKSPACE = path.join(DATA, 'workspace')
export const MODEL = process.env.ALMANAC_MODEL || 'claude-opus-5-5'
export const EFFORT = process.env.ALMANAC_EFFORT || 'high'
export const PUBLIC_URL = process.env.ALMANAC_PUBLIC_URL || 'https://almanac.tunn3l.sh/almanac'
// models a coding run may use, by short name
export const CODING_MODELS = { sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5', haiku: 'claude-haiku-5-5' }

// The accounts: ALMANAC_USERS="Frances:passcode,Bart:passcode". The name before the colon is the one shown
// on conversations; sign-in matches it without regard to case.
export const USERS = new Map(String(process.env.ALMANAC_USERS || '').split(',').map(s => s.trim()).filter(Boolean).map(s => {
  const i = s.indexOf(':')
  if (i < 1 || i === s.length - 1) throw new Error(`ALMANAC_USERS: "${s}" is not name:passcode`)
  return [s.slice(0, i).trim().toLowerCase(), { name: s.slice(0, i).trim(), passcode: s.slice(i + 1) }]
}))
export const SECRET = process.env.ALMANAC_SECRET
if (!USERS.size || !SECRET) throw new Error('ALMANAC_USERS and ALMANAC_SECRET must be set (see ~/.almanac.env)')
if (!fs.existsSync(GAMI_DB)) throw new Error(`no database at ${GAMI_DB}`)
for (const d of [DATA, ARTIFACTS, WORKSPACE]) fs.mkdirSync(d, { recursive: true })
