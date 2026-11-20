// Which of the always-running jobs a deploy restarts (OLA-94). A restart cuts what is open through
// that job, so a job whose code is the same in the new release keeps running from the release it
// started in: the TLS front and the tunnel carry every visitor's connection and change rarely, and
// the gateway carries the models' streams. ops/clean.mjs keeps a release that a running process works
// in, so the one such a job runs from is never deleted under it.
//
// A job's code is the import closure of its entry files (relative `import … from`, `import '…'`,
// `export … from` and `import('…')` with a literal path), plus the files it reads at start (FILES),
// plus a package's lockfile when one of those files imports a package. The front desk is not here:
// it serves the release's web app and release.json, so it restarts at every deploy, and a restart
// of it drops nothing (its drain, frontdesk/server.mjs, and the TLS front's wait, ops/tls.mjs).
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export const FILES = {
  'cx.ola.gateway': { entries: ['ops/run.mjs', 'gateway/server.mjs'] },
  'cx.ola.tls': { entries: ['ops/run.mjs', 'ops/tls.mjs'] },
  'cx.ola.tunnel': { entries: ['ops/run.mjs', 'ops/tunnel.mjs'], read: ['ops/ngrok.yml'] },
}

const SPEC = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"\n]+)\1/g

/** The files `entries` load, relative to `root`, sorted; null when one cannot be read. */
export function closure(root, entries, read = []) {
  const seen = new Set()
  const todo = [...entries]
  while (todo.length) {
    const rel = path.normalize(todo.pop())
    if (seen.has(rel)) continue
    const file = path.join(root, rel)
    if (!existsSync(file)) return null
    seen.add(rel)
    if (!/\.m?js$/.test(rel)) continue
    for (const m of readFileSync(file, 'utf8').matchAll(SPEC)) {
      const spec = m[2]
      if (spec.startsWith('.')) todo.push(path.join(path.dirname(rel), spec))
      else if (!spec.startsWith('node:')) {
        // A package: its folder's lockfile stands for node_modules.
        let dir = path.dirname(rel)
        while (dir !== '.' && !existsSync(path.join(root, dir, 'package-lock.json'))) dir = path.dirname(dir)
        todo.push(path.join(dir, 'package-lock.json'))
      }
    }
  }
  for (const r of read) {
    if (!existsSync(path.join(root, r))) return null
    seen.add(path.normalize(r))
  }
  return [...seen].sort()
}

/** One hash over the job's files (names and contents) in `root`; null when the job is not listed or a file is missing. */
export function fingerprint(root, label) {
  const f = FILES[label]
  const files = f && closure(root, f.entries, f.read)
  if (!files) return null
  const h = createHash('sha256')
  for (const rel of files) h.update(`${rel}\0`).update(readFileSync(path.join(root, rel))).update('\0')
  return h.digest('hex')
}

/**
 * Whether `label`, running from the release folder `running` (its apps/activist-ai), can be left
 * running when `next` is served: same plist (the caller checks), and the same code in both.
 */
export function unchanged(label, running, next) {
  if (!running || !next || !existsSync(running)) return false
  const a = fingerprint(running, label)
  return a !== null && a === fingerprint(next, label)
}
