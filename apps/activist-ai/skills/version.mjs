// The version of a set of Ola's skills: the hash of the skill folders (every file's path and bytes,
// in order; the folder's own README.md, check.py and this file stay out, as they stay out of the
// image), and the commit they came from. The one hash for every place skills go: the workspace image
// (workspace/ws.mjs labels it ola.skills=<hash>), the Mac app's bundled copy
// (apple/tools/skills.mjs), and the deploy's record (ops/ola.mjs, release.json and deployed.json).
//
//   node skills/version.mjs [folder]      {"hash": "...", "skills": ["chart", ...]} for that folder
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const SKILLS_DIR = path.dirname(fileURLToPath(import.meta.url))

/** The skill folders (not hidden, not starting with _), sorted. */
export const skillFolders = (dir = SKILLS_DIR) =>
  readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_')).map((e) => e.name).sort()

/** The first 16 hex characters of a sha256 over every file of every skill folder. */
export function skillsHash(dir = SKILLS_DIR) {
  const h = createHash('sha256')
  const walk = (d, rel) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (e.name.startsWith('.') || e.name === '__pycache__') continue
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p, `${rel}${e.name}/`)
      else if (e.isFile()) h.update(`${rel}${e.name}\0`).update(readFileSync(p)).update('\0')
    }
  }
  for (const s of skillFolders(dir)) walk(path.join(dir, s), `${s}/`)
  return h.digest('hex').slice(0, 16)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = path.resolve(process.argv[2] ?? SKILLS_DIR)
  console.log(JSON.stringify({ hash: skillsHash(dir), skills: skillFolders(dir) }))
}
