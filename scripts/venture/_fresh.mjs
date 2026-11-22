// OLA-273: is this copy of the tracker older than main's? Read from git, not from a number someone must
// remember to bump: the tracker's own files (issues.mjs and every ./x.mjs it imports, followed through)
// are compared with origin/main, and the copy is old when origin/main has a commit changing one of them
// that this checkout's HEAD does not contain. Local edits and unpushed commits ahead of main are not old.
// An agent's worktree under .claude/worktrees/ shares the main checkout's refs, so its origin/main is as
// fresh as the last fetch anywhere in that clone; trackerBehind() fetches first when that is over
// FETCH_EVERY old (a few seconds at most; when GitHub cannot be reached it compares with the last fetch
// and says so).
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

export const FETCH_EVERY = 5 * 60e3

const git = (cwd, args, timeout = 15000) => execFileSync('git', args, { cwd, encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'] }).trim()

/** The tracker's own files: entry and every relative .mjs import, followed through. Paths relative to root. */
export function trackerFiles(entry, root) {
  const seen = new Set()
  const walk = (file) => {
    const rel = relative(root, file)
    if (seen.has(rel) || !existsSync(file)) return
    seen.add(rel)
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+\.mjs)['"]/g)) walk(resolve(dirname(file), m[1]))
  }
  walk(resolve(entry))
  return [...seen].sort()
}

/** { behind: [{ sha, subject, files }], ref, fetched: 'now'|'recent'|'failed: …', main } or { behind: [] , skipped } */
export function trackerBehind({ entry, root, ref = 'origin/main', fetch = true }) {
  let common
  try { common = resolve(root, git(root, ['rev-parse', '--git-common-dir'])) } catch (e) { return { behind: [], skipped: `not in a git checkout (${String(e.message).split('\n')[0]})` } }
  const main = common.endsWith('/.git') ? dirname(common) : null
  let fetched = 'not asked'
  if (fetch && ref === 'origin/main') {
    const fh = join(common, 'FETCH_HEAD')
    const age = existsSync(fh) ? Date.now() - statSync(fh).mtimeMs : Infinity
    if (age < FETCH_EVERY) fetched = 'recent'
    else {
      try { git(root, ['fetch', '--quiet', 'origin', 'main'], 8000); fetched = 'now' } catch (e) { fetched = `failed: ${String(e.message).split('\n')[0].slice(0, 120)}` }
    }
  }
  try { git(root, ['rev-parse', '--verify', '--quiet', ref]) } catch { return { behind: [], skipped: `no ${ref} here`, fetched, main } }
  const files = trackerFiles(entry, root)
  const out = git(root, ['log', '--format=%x00%h %s', '--name-only', `HEAD..${ref}`, '--', ...files])
  const behind = out.split('\0').filter((s) => s.trim()).map((block) => {
    const [head, ...rest] = block.trim().split('\n')
    const sp = head.indexOf(' ')
    return { sha: head.slice(0, sp), subject: head.slice(sp + 1), files: rest.filter(Boolean) }
  })
  return { behind, ref, fetched, main, files }
}

/** One paragraph for a refusal (or a warning on a read-only call). */
export function behindLine(r, { here, args = [] }) {
  const n = r.behind.length
  const changed = [...new Set(r.behind.flatMap((c) => c.files))].join(', ')
  const list = r.behind.slice(0, 3).map((c) => `${c.sha} ${c.subject.slice(0, 90)}`).join('; ')
  const elsewhere = r.main && resolve(r.main) !== resolve(here) ? ` or run the main checkout's copy: node ${join(r.main, 'scripts/venture/issues.mjs')} ${args.join(' ')}`.trimEnd() : ''
  return `This copy of the tracker (${here}) is older than ${r.ref}: ${n} commit(s) there change its own files (${changed}) and are not in this checkout (${list}${n > 3 ? '; …' : ''}). Its rules are not main's (OLA-273). Rebase first (git pull --rebase, or git rebase ${r.ref} in a worktree) and run it again${elsewhere}.${r.fetched?.startsWith('failed') ? ` (GitHub could not be reached, so this compares with the last fetch: ${r.fetched})` : ''}`
}
