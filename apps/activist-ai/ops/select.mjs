// Which suites an update runs, and side by side how (OLA-283).
//
// Until Nov 20 every update ran every suite one after another: 23 minutes for a README. Now an
// update (ops/ola.mjs deploy and check, so also the automatic checks of ops/ci.mjs) compares the
// new commit with the last one that passed (the deployed commit, or --base) and runs a suite only
// when the change touches what that suite uses. The rule is the one ops/restart.mjs uses for jobs,
// made wider, because a check uses more than it imports:
//
//   a suite's files = its entry's closure: every relative import, and every string literal in the
//     code that names a file of the tree (a script it spawns, a fixture it reads, the server it
//     starts: 'gateway/server.mjs', new URL('../README.md', …), 'server.mjs' beside it), followed
//     file to file; a named folder (path.join(AI, 'skills')) and a file name that several files
//     share count all their files, not followed; a package import counts its folder's lockfile;
//   plus the folders it owns (OWNS below): what reaches it through something that is not code it
//     reads, like the built web page the front desk serves (web/src → web/dist) or the project
//     image its VMs run (workspace/, skills/).
//
// A changed file that no suite uses runs nothing only when it is on the UNCHECKED list (writing:
// *.md outside the image's folders; the evals and the asks' runner; the site, the brand; the Apple
// apps for a deploy; ops programs no update suite runs). Anything else that no suite claims is a
// file the rule cannot place, and then every suite runs. So does a change to the update tool
// (ops/ola.mjs and its imports, this file among them) or to the packages at the top, a missing
// base, a diff that cannot be read, and an entry that cannot be read. The seconds-long suites
// (ALWAYS) run every time.
//
// Side by side (README "Deploying staging"): the two suites that start VMs (workspace, frontdesk)
// run one after the other in one lane, since together they would take all four of the machine's
// VMs and leave none for the test server's people; every other suite starts no VM, listens on port
// 0 or its own port, and works in its own temp folder, so each runs in a lane of its own beside
// them. The front desk suite serves a copy of web/dist taken before the suites start (OLA_FD_DIST),
// because the web suite builds web/dist again while it runs.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'


// Seconds each, no VM: run every time.
export const ALWAYS = ['turn', 'backup', 'ci', 'signers', 'restart', 'asks', 'select', 'models', 'suite']
// Entry file per suite (the check's own test file).
export const ENTRY = {
  turn: 'ops/turn-test.mjs',
  backup: 'ops/backup-test.mjs',
  ci: 'ops/ci-test.mjs',
  signers: 'ops/signers-test.mjs',
  restart: 'ops/restart-test.mjs',
  asks: 'evals/asks/test.mjs',
  select: 'ops/select-test.mjs',
  models: 'ops/models-test.mjs',
  suite: 'ops/suite-test.mjs',
  gateway: 'gateway/test.mjs',
  workspace: 'workspace/check.mjs',
  web: 'web/check.mjs',
  frontdesk: 'frontdesk/check.mjs',
  tls: 'ops/tls-test.mjs',
  apps: 'apple/OlaKit/Package.swift',
}
// Folders (a prefix ending in /) and files a suite uses as a whole, beyond what its code names.
export const OWNS = {
  gateway: ['gateway/'],
  // The image its VMs run: workspace/ (Containerfile, the ola-* tools, door, desk) and skills/.
  workspace: ['workspace/', 'skills/', 'spike/'],
  web: ['web/'],
  // It signs people in through the built page (web/dist, made from these), and its VMs run the image.
  frontdesk: ['frontdesk/', 'web/src/', 'web/public/', 'web/index.html', 'web/vite.config.ts', 'web/tsconfig.json', 'web/package.json', 'web/package-lock.json', 'web/scripts/', 'web/server/', 'workspace/', 'skills/'],
  // OlaKit's tests read the workspace's plugins and skills and the web app's recorded runs.
  apps: ['apple/', 'workspace/', 'skills/', 'web/test/fixtures/', 'web/src/lib/'],
}
// Lanes: the suites of one lane run in order; lanes run side by side.
export const LANES = [['workspace', 'frontdesk'], ['web'], ['gateway'], ['tls'], ['apps'], ['turn', 'backup', 'ci', 'signers', 'restart', 'asks', 'select', 'models', 'suite']]
// A change to these runs every suite (with the update tool's own files, toolFiles).
export const ALL_IF = ['package.json', 'package-lock.json']
// Files no suite runs or reads, when no suite's closure names them: writing (*.md outside the
// image's folders), the evals and the asks' runner (the asks' own test is an ALWAYS suite), the
// site, the brand, Bart's own tools, the opencode fork's scripts, the Apple apps (a check's apps
// suite owns them), and the ops programs no update suite runs (the alarm, the cleaner's and the
// studio's own tests, the certificate, DNS, probe and tunnel scripts).
const UNCHECKED = [
  /\.md$/, /^evals\//, /^site\//, /^brand\//, /^bart\//, /^opencode-fork\//, /(^|\/)\.gitignore$/, /^apple\//,
  /^ops\/(watch|watch-test|clean-test|studio|studio-test|cert|dns|probe|tunnel)\.mjs$/, /^ops\/studio\//, /^ops\/ngrok\.yml$/,
]
// *.md in these folders goes into the image or is read by a check: never "unchecked" by its name.
const READ_MD = [/^workspace\//, /^skills\//]
export const unchecked = (f) => UNCHECKED.some((r) => r.test(f)) && !READ_MD.some((r) => r.test(f))
// A file that checks read only a part of: when that part is the same before and after, the change
// is no change for any check. The README: web/test/commands.test.ts and workspace/check.mjs read
// only its standing instruction (README "Slash commands and reactions").
export const PARTS = {
  'README.md': (t) => /\*\*The standing instruction\*\*[\s\S]*?```text\n([\s\S]*?)\n```/.exec(t)?.[1] ?? null,
}

// Not counted when only their parent folder is named: the asks (evals/asks) have their own suite,
// and a check that names evals/ (the front desk's compare test runs evals/run.mjs there) never
// reads them; a file there named exactly still counts.
const FOLDER_SKIP = [/^evals\/asks\//]
const SPEC = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"\n]+)\1/g
const LIT = /(['"`])([A-Za-z0-9_.@/-]{2,160})\1/g
const JOIN = /(?:join|resolve|PathComponent|URL)\(([^()]*)\)/g
const CODE = /\.(m?js|cjs|ts|tsx|mts|py|sh|swift)$|(^|\/)(ola-[a-z-]+|Containerfile)$/

/** Every file under `root` (relative, sorted), skipping node_modules, dist, .build and dot names. */
export function treeFiles(root) {
  const out = []
  const walk = (rel) => {
    for (const e of readdirSync(path.join(root, rel), { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.build' || e.name.startsWith('.')) continue
      const r = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) walk(r)
      else if (e.isFile()) out.push(r)
    }
  }
  walk('')
  return out.sort()
}

/**
 * A suite's files: the closure of `entry` in the tree `files` (sorted relative paths) at `root`.
 * null when the entry or a file it reaches cannot be read. `trace` (a Map) gets file → who named it.
 */
export function suiteFiles(root, entry, files, trace = null) {
  if (!existsSync(path.join(root, entry))) return null
  const set = new Set(files)
  const dirs = new Set()
  for (const f of files) for (let d = path.dirname(f); d !== '.'; d = path.dirname(d)) dirs.add(d)
  const byBase = new Map()
  for (const f of files) byBase.set(path.basename(f), [...(byBase.get(path.basename(f)) ?? []), f])
  const under = (d) => files.filter((f) => f.startsWith(`${d}/`))
  const seen = new Set()
  const leaves = new Set()
  const todo = [entry]
  let cur = null
  const add = (f) => !seen.has(f) && (trace && !trace.has(f) && trace.set(f, cur), todo.push(f))
  // A path that names one file is followed; the files of a named folder, and every file a shared
  // bare name could mean, are counted but not followed (following a word like 'web' or
  // 'server.mjs' would pull in everything).
  const leaf = (f) => (trace && !trace.has(f) && trace.set(f, `${cur} (folder or name)`), leaves.add(f))
  // bare: the literal is an argument of path.join/resolve/new URL/appendingPathComponent, so a
  // word without a slash there may name a folder.
  const resolve = (from, spec, { bare = true } = {}) => {
    const hits = []
    const tryOne = (p) => {
      const n = path.normalize(p)
      if (n.startsWith('..') || n === '.' || n === '') return
      for (const c of [n, `${n}.ts`, `${n}.tsx`, `${n}.mjs`, `${n}.js`, `${n}/index.ts`, `${n}/index.mjs`]) if (set.has(c)) return void hits.push(c)
      // (a folder's README.md is about the folder: named as a folder, it is not read)
      if (dirs.has(n) && (bare || spec.includes('/'))) under(n).filter((f) => path.basename(f) !== 'README.md' && !FOLDER_SKIP.some((r) => r.test(f))).forEach(leaf)
    }
    tryOne(path.join(path.dirname(from), spec))
    tryOne(spec) // relative to apps/activist-ai (path.join(AI, 'workspace/ws.mjs'))
    if (!hits.length && !spec.includes('/') && /\.[a-z0-9]+$/i.test(spec)) {
      // A bare file name: the one in this folder or the folder above, else the only one in the
      // tree, else every file of that name (counted, not followed).
      const all = byBase.get(spec) ?? []
      const near = all.filter((f) => path.dirname(f) === path.dirname(from) || path.dirname(f) === path.dirname(path.dirname(from)))
      if (near.length) hits.push(...near)
      else if (all.length === 1) hits.push(all[0])
      else all.forEach(leaf)
    }
    return hits
  }
  while (todo.length) {
    const rel = todo.pop()
    if (seen.has(rel)) continue
    seen.add(rel)
    cur = rel
    if (!CODE.test(rel)) continue
    let text
    try {
      text = readFileSync(path.join(root, rel), 'utf8')
    } catch {
      return null
    }
    for (const m of text.matchAll(SPEC)) {
      const spec = m[2]
      if (spec.startsWith('node:')) continue
      if (spec.startsWith('.')) resolve(rel, spec).forEach(add)
      else {
        // A package: the nearest folder's lockfile (and package.json) stand for node_modules.
        let dir = path.dirname(rel)
        while (dir !== '.' && !set.has(path.join(dir, 'package-lock.json'))) dir = path.dirname(dir)
        for (const f of [path.join(dir, 'package-lock.json'), path.join(dir, 'package.json')]) if (set.has(path.normalize(f))) add(path.normalize(f))
      }
    }
    const joined = new Set()
    for (const c of text.matchAll(JOIN)) for (const m of c[1].matchAll(LIT)) joined.add(m[2])
    for (const m of text.matchAll(LIT)) {
      const s = m[2].replace(/^\.\//, '')
      if (s === '..' || s === '.' || /^(https?:|node:)/.test(s)) continue
      resolve(rel, s, { bare: joined.has(m[2]) }).forEach(add)
      // "../../../../workspace" from a test four folders down: also from the top.
      const tail = s.replace(/^(\.\.\/)+/, '')
      if (tail !== s && tail) resolve(rel, tail, { bare: true }).forEach(add)
    }
  }
  return [...new Set([...seen, ...leaves])].sort()
}

/**
 * The update tool's own files: ops/ola.mjs and the files it imports, followed (a relative import
 * that names no file, like the one inside the skills-version snippet, is passed over).
 */
export function toolFiles(root) {
  const seen = new Set()
  const todo = ['ops/ola.mjs']
  while (todo.length) {
    const rel = todo.pop()
    if (seen.has(rel) || !existsSync(path.join(root, rel))) continue
    seen.add(rel)
    for (const m of readFileSync(path.join(root, rel), 'utf8').matchAll(SPEC)) if (m[2].startsWith('.')) todo.push(path.normalize(path.join(path.dirname(rel), m[2])))
  }
  return [...new Set([...seen, 'ops/select.mjs'])].filter((f) => f.startsWith('ops/')).sort() // (prove-restarts' softauthn.mjs is no part of an update)
}

/**
 * The plan for one update. Pure apart from reading the new tree at `root`.
 *   root     the new release's apps/activist-ai
 *   changed  paths under apps/activist-ai that differ from the base; null: no base, or the diff
 *            could not be read
 *   suites   the suites this update runs when it runs everything, in order
 *   before   (path) => that file's text at the base, or null (for PARTS)
 * → { run: [names], skip: [{ name, why }], all: why | null, why: { name: reason } }
 */
export function plan({ root, changed, suites, before = () => null }) {
  const everything = (why) => ({ run: [...suites], skip: [], all: why, why: Object.fromEntries(suites.map((s) => [s, why])) })
  if (!changed) return everything('no passed commit to compare with')
  const unknown = suites.filter((s) => !ENTRY[s])
  if (unknown.length) return everything(`the selection does not know suite ${unknown.join(', ')}`)
  const tool = new Set(toolFiles(root))
  const top = changed.filter((f) => ALL_IF.includes(f) || tool.has(f))
  if (top.length) return everything(`the change touches the update tool or the top packages (${top.join(', ')})`)
  const files = treeFiles(root)
  const uses = {}
  for (const s of suites) {
    const c = suiteFiles(root, ENTRY[s], files)
    if (!c) return everything(`${s}'s entry ${ENTRY[s]} or a file it names cannot be read`)
    uses[s] = { closure: new Set(c), owns: OWNS[s] ?? [] }
  }
  const owned = (s, f) => !unchecked(f) && uses[s].owns.some((p) => (p.endsWith('/') ? f.startsWith(p) : f === p))
  const touches = (s, f) => uses[s].closure.has(f) || owned(s, f)
  const why = {}
  const unplaced = []
  const same = []
  for (const f of changed) {
    if (PARTS[f]) {
      let now = null
      try {
        now = readFileSync(path.join(root, f), 'utf8')
      } catch {}
      const was = before(f)
      const part = now === null ? null : PARTS[f](now)
      if (part !== null && was !== null && part === PARTS[f](was)) {
        same.push(f)
        continue
      }
    }
    const by = suites.filter((s) => touches(s, f))
    for (const s of by) why[s] ??= `the change touches ${f}`
    if (!by.length && !unchecked(f)) unplaced.push(f)
  }
  if (unplaced.length) return everything(`no suite is known to use ${unplaced.slice(0, 3).join(', ')}${unplaced.length > 3 ? ` and ${unplaced.length - 3} more` : ''}, so every suite runs`)
  const run = []
  const skip = []
  for (const s of suites) {
    if (ALWAYS.includes(s)) (run.push(s), (why[s] ??= 'seconds, runs every time'))
    else if (why[s]) run.push(s)
    else skip.push({ name: s, why: `the change touches none of its ${uses[s].closure.size} files${uses[s].owns.length ? ` or ${uses[s].owns.join(' ')}` : ''}${same.length ? ` (${same.join(', ')}: changed outside the part checks read)` : ''}` })
  }
  return { run, skip, all: null, why }
}

/** The lanes for the suites to run: LANES order, each suite once; a suite in no lane gets its own. */
export function lanes(run) {
  const out = LANES.map((l) => l.filter((s) => run.includes(s))).filter((l) => l.length)
  for (const s of run) if (!out.some((l) => l.includes(s))) out.push([s])
  return out
}

/** `git diff --name-only base commit -- apps/activist-ai`, relative to apps/activist-ai; null on failure. */
export function changedFiles(git, base, commit) {
  if (!base) return null
  const r = git('diff', '--name-only', '--no-renames', base, commit, '--', 'apps/activist-ai')
  if (r.status !== 0) return null
  return r.stdout.split('\n').filter(Boolean).map((f) => f.replace(/^apps\/activist-ai\//, ''))
}
