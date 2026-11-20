// Cleans the staging machine's disk (OLA-135): run by `ola.mjs deploy` after every deploy that
// served, and on demand as `node ops/ola.mjs clean [--dry]`.
//
// On Nov 17 the mini's disk fell to 3.5 GB free twice. What filled it: the image builder's cache
// (the `buildkit` container held 49 GB), old ola-workspace images, old releases in
// ~/ola-staging/releases, finished builders' clones and check folders in the home folder, and the
// ship script's archives. Each has one rule here:
//
//   images     ola-workspace:* tags only (the base images stay). Kept: the image the current
//              release names (workspace/ws.mjs IMAGE), the one the previous release names, any image
//              a container is made from (running or stopped: a project's VM, a suite's), and any
//              tag newer than the current one (a release being prepared). The rest are deleted.
//   releases   kept: the current and the previous release, any a workspace's door or desk runs
//              from (~/.ola/launchd), any a running process names. The rest are deleted.
//   builder    deleted (container builder stop + delete) when its container holds more than 15 GB
//              (OLA_CLEAN_BUILDER_GB) and no build is running; the next image build makes a new one.
//   leftovers  only what matches ALLOW below, last changed more than 2 days ago
//              (OLA_CLEAN_LEFTOVER_DAYS), named by no running process, no process's working folder,
//              no launchd plist and no existing container, and (for a git clone) with nothing
//              uncommitted, untracked or unpushed. Anything else in the home folder is never touched.
//
// Images and the builder are left alone while someone else holds the machine's test turn
// (ops/turn.mjs: a suite may be about to start a VM from an image) or another deploy runs; the
// releases while another deploy runs. To wait for the turn: node ops/turn.mjs run --label clean
// -- node ops/ola.mjs clean. Nothing here reads or prints a secret: containers are listed with the
// plain `container ls -a` (its JSON form carries each project's passwords).
import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { holder, insideHolder } from './turn.mjs'

const HOME = homedir()
const OLA = process.env.OLA_HOME || path.join(HOME, '.ola')
const STAGING = process.env.OLA_STAGING || path.join(HOME, 'ola-staging')
const CONTAINER = process.env.OLA_CONTAINER_BIN || '/usr/local/bin/container'
const STORE = process.env.OLA_CONTAINER_STORE || path.join(HOME, 'Library/Application Support/com.apple.container')
const BUILDER_GB = Number(process.env.OLA_CLEAN_BUILDER_GB || 15)
const LEFTOVER_DAYS = Number(process.env.OLA_CLEAN_LEFTOVER_DAYS || 2)
const REPO = 'ola-workspace'

// Never deleted, whatever a pattern says (checked by name before anything else).
export const NEVER = new Set([
  '.ola', '.ola-bart', '.ola-frontdesk', '.ola-turns', 'ola-bart', 'ola-staging', 'ola-evals', 'ola-ship',
  'ola-suite.lock', 'ola-deploy.hold', 'GAMI', 'almanac', 'hilma-deploy', 'hilma-venture', 'hilma-bot', 'Documents', 'Library', 'Desktop',
])
// The allowlist: where, which names, and why. A name that matches none of these is never touched.
export const ALLOW = [
  // Builders' copies of Ola: ~/ola-<tag> (a sparse git clone or an rsync, README "Scratch
  // checkouts on the mini"), only when it holds Ola's code.
  { where: 'home', re: /^ola-[a-z0-9]{1,12}$/, dir: true, needs: ['apps/activist-ai/ops/ola.mjs', 'activist-ai/ops/ola.mjs', 'apps/activist-ai/workspace/ws.mjs'], what: 'a builder\'s copy of Ola' },
  { where: 'home', re: /^ola-[a-z0-9]{1,12}-scratch$/, dir: true, what: 'a builder\'s scratch folder' },
  // The checks' state folders: workspace/check.mjs, frontdesk/check.mjs (OLA_CHECK_TAG), and the
  // live scripts' fixed ones (compare-live, claude-smoke, test/cloud-stage).
  { where: 'home', re: /^\.ola-(check|fdcheck)(-[a-z0-9]{1,12})?$/, dir: true, what: 'a check\'s state folder' },
  { where: 'home', re: /^\.ola-(cq-live|wcc|cloudcheck)$/, dir: true, what: 'a live script\'s state folder' },
  // Hand-made check homes builders left on the mini (seen 2026-11-19).
  { where: 'home', re: /^\.ola-(rev\d*|rot-repro|f2exp|f2live)$/, dir: true, what: 'a builder\'s check folder' },
  // Builders' logs and deploy outputs in the home folder.
  { where: 'home', re: /^ola-[a-z0-9-]{1,40}\.(log|out)$/, dir: false, what: 'a builder\'s log' },
  // The ship script's archives (apple/testflight/ship-via-mini.sh), not its build caches.
  { where: 'ship', re: /^ola-(ios|mac)\.xcarchive(\.tgz)?$/, what: 'a ship archive' },
  // Temporary folders Ola's checks make with mkdtemp.
  { where: 'tmp', re: /^ola-(check|fdcheck|image|web|shots|batch-live|batch-test|batch-truth|twin|studies|wcc|first-user-shots|fu-docs|watch-test|clean-test|skills-head|bart-skills)-[A-Za-z0-9]{6}$/, dir: true, what: 'a check\'s temporary folder' },
  { where: 'tmp', re: /^ola-check-notes-\d+\.txt$/, dir: false, what: 'a check\'s temporary file' },
]

const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 << 20, ...opts })
const alive = (pid) => {
  if (!(pid > 0)) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e.code === 'EPERM'
  }
}
const pidIn = (file) => {
  try {
    return Number(readFileSync(file, 'utf8').trim()) || 0
  } catch {
    return 0
  }
}
const kb = (p) => Number(/^(\d+)/.exec(sh('/usr/bin/du', ['-sk', p]).stdout || '')?.[1] || 0)
const freeKb = () => Number((sh('/bin/df', ['-k', HOME]).stdout.trim().split('\n').pop() || '').split(/\s+/)[3] || 0)
export const human = (k) => (k >= 1024 * 1024 ? `${(k / 1024 / 1024).toFixed(1)} GB` : k >= 1024 ? `${Math.round(k / 1024)} MB` : `${k} KB`)
const tilde = (p) => (p.startsWith(HOME + '/') ? '~' + p.slice(HOME.length) : p)
/** "2.3.0-36" -> [2, 3, 0, 36]; compares tags by their numbers. */
const nums = (t) => (t.match(/\d+/g) || []).map(Number)
function newer(a, b) {
  const x = nums(a)
  const y = nums(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? -1) !== (y[i] ?? -1)) return (x[i] ?? -1) > (y[i] ?? -1)
  return false
}

/** Containers (any state) by id and image, from the plain table (never the JSON form). */
function containers() {
  const r = sh(CONTAINER, ['ls', '-a'])
  if (r.status !== 0) throw new Error(`container ls -a: ${(r.stderr || '').trim().split('\n').pop()}`)
  return r.stdout.split('\n').slice(1).map((l) => l.trim().split(/\s+/)).filter((c) => c[0]).map(([id, image]) => ({ id, image: (image || '').replace(/^(docker\.io\/)?(library\/)?/, '') }))
}
/** ola-workspace tags, with a size where the verbose list gives one. */
function images() {
  const r = sh(CONTAINER, ['image', 'ls'])
  if (r.status !== 0) throw new Error(`container image ls: ${(r.stderr || '').trim().split('\n').pop()}`)
  const tags = [...new Set(r.stdout.split('\n').slice(1).map((l) => l.trim().split(/\s+/)).filter(([n, t]) => n === REPO && t && t !== '<none>').map(([, t]) => t))]
  const sizes = {}
  for (const l of (sh(CONTAINER, ['image', 'ls', '-v']).stdout || '').split('\n')) {
    const m = /^(\S+)\s+(\S+)\s.*?\barm64\b.*?(\d+(?:\.\d+)?) (KB|MB|GB)\b/.exec(l)
    if (m && m[1] === REPO && !(m[2] in sizes)) sizes[m[2]] = Math.round(Number(m[3]) * { KB: 1, MB: 1000, GB: 1e6 }[m[4]] / 1.024)
  }
  return tags.map((tag) => ({ tag, kb: sizes[tag] ?? 0 }))
}
/** The image a release names: its workspace/ws.mjs, from the release folder or from git. */
function releaseImage(commit12) {
  if (!commit12) return null
  const f = path.join(STAGING, 'releases', commit12, 'apps/activist-ai/workspace/ws.mjs')
  const text = existsSync(f) ? readFileSync(f, 'utf8') : sh('/usr/bin/git', ['-C', STAGING, 'show', `${commit12}:apps/activist-ai/workspace/ws.mjs`]).stdout || ''
  return /^export const IMAGE = '([^']+)'/m.exec(text)?.[1] ?? null
}

/** Every path a running process, a process's working folder or a launchd plist names. */
function busyText() {
  const out = []
  for (const l of sh('/bin/ps', ['-axww', '-o', 'pid=,command=']).stdout.split('\n')) {
    const m = /^\s*(\d+)\s+(.*)$/.exec(l)
    if (m && Number(m[1]) !== process.pid) out.push(m[2])
  }
  for (const l of (sh('/usr/sbin/lsof', ['-a', '-d', 'cwd', '-u', String(process.getuid()), '-Fn']).stdout || '').split('\n')) if (l.startsWith('n')) out.push(l.slice(1))
  for (const dir of [path.join(HOME, 'Library/LaunchAgents'), path.join(OLA, 'launchd')]) {
    if (!existsSync(dir)) continue
    for (const f of readdirSync(dir)) if (f.endsWith('.plist')) out.push(readFileSync(path.join(dir, f), 'utf8'))
  }
  return out
}
function named(p, texts) {
  const forms = [p]
  try {
    forms.push(realpathSync(p))
  } catch {}
  return forms.some((f) => texts.some((t) => t === f || t.includes(f + '/') || t.includes(f + ' ') || t.includes(f + '<') || t.endsWith(f)))
}
/** Newest change in a folder's top levels (node_modules and .git skipped). */
function newest(p, depth = 3) {
  let st
  try {
    st = lstatSync(p)
  } catch {
    return 0
  }
  let t = st.mtimeMs
  if (st.isDirectory() && depth > 0) {
    let names = []
    try {
      names = readdirSync(p)
    } catch {}
    for (const n of names) if (n !== 'node_modules' && n !== '.git') t = Math.max(t, newest(path.join(p, n), depth - 1))
  }
  return t
}
/** Workspace ids kept under any ws/ folder inside p (an OLA_HOME), to depth 6. */
function wsIds(p, depth = 6, out = []) {
  let names = []
  try {
    if (!lstatSync(p).isDirectory()) return out
    names = readdirSync(p)
  } catch {
    return out
  }
  for (const n of names) {
    if (n === 'node_modules' || n === '.git') continue
    const q = path.join(p, n)
    if (n === 'ws') {
      try {
        if (lstatSync(q).isDirectory()) out.push(...readdirSync(q))
      } catch {}
    } else if (depth > 0) wsIds(q, depth - 1, out)
  }
  return out
}
/** Why a git clone must stay (work in it that exists nowhere else), or null. */
function gitWork(p) {
  if (!existsSync(path.join(p, '.git'))) return null
  const s = sh('/usr/bin/git', ['-C', p, 'status', '--porcelain'])
  if (s.status !== 0) return 'git status failed'
  if (s.stdout.trim()) return `uncommitted or untracked files (${s.stdout.trim().split('\n').length})`
  const u = sh('/usr/bin/git', ['-C', p, 'log', '--branches', '--not', '--remotes', '--oneline', '-1'])
  if (u.status !== 0) return 'git log failed'
  if (u.stdout.trim()) return 'commits that were never pushed'
  return null
}

/**
 * The whole pass. `say` prints a line; dry changes nothing. Returns { freedKb, deleted, kept }.
 */
export function clean({ dry = false, say = console.log } = {}) {
  const t0Free = freeKb()
  const deleted = []
  const kept = []
  say(`clean${dry ? ' --dry (nothing is deleted)' : ''}: ${human(t0Free)} free`)

  // Who else is at work: another deploy, the test turn, an image build.
  const deployPid = [pidIn(path.join(STAGING, 'deploy.lock')), pidIn(path.join(HOME, 'ola-deploy.hold'))].find((p) => p && p !== process.pid && alive(p)) || 0
  const turn = holder()
  const ours = !turn || turn.pid === process.pid || (turn.pid && turn.pid === Number(process.env.OLA_TURN_HELD || 0)) || insideHolder(turn)
  const ps = sh('/bin/ps', ['-axww', '-o', 'pid=,command=']).stdout.split('\n').filter((l) => Number(l.trim().split(/\s/)[0]) !== process.pid)
  const building = ps.find((l) => /(^|\/)container\s+build\b|ws\.mjs\s+image\b/.test(l.replace(/^\s*\d+\s+/, '')))
  const busy = busyText()
  let ctrs = []
  let ctrsKnown = true
  try {
    ctrs = containers()
  } catch (e) {
    ctrsKnown = false
    say(`  containers: ${e.message}; images, the builder and leftovers are left alone`)
  }
  const ctrIds = new Set(ctrs.map((c) => c.id))

  // ---- releases
  const releasesDir = path.join(STAGING, 'releases')
  let current = null
  try {
    current = /^releases\/([0-9a-f]{12})$/.exec(readlinkSync(path.join(STAGING, 'current')))?.[1] ?? null
  } catch {}
  let previous = null
  try {
    previous = JSON.parse(readFileSync(path.join(STAGING, 'deployed.json'), 'utf8')).previous?.slice(0, 12) ?? null
  } catch {}
  if (deployPid) say(`releases: left alone, a deploy is running (pid ${deployPid})`)
  else if (!current) say('releases: left alone, ~/ola-staging/current points at no release')
  else if (existsSync(releasesDir)) {
    const why = new Map([[current, 'current'], ...(previous ? [[previous, 'previous']] : [])])
    const launchd = path.join(OLA, 'launchd')
    if (existsSync(launchd)) for (const f of readdirSync(launchd)) for (const m of readFileSync(path.join(launchd, f), 'utf8').matchAll(/releases\/([0-9a-f]{12})\//g)) if (!why.has(m[1])) why.set(m[1], `a workspace's door or desk runs from it`)
    const all = readdirSync(releasesDir).filter((d) => /^[0-9a-f]{12}$/.test(d))
    for (const d of all) if (!why.has(d) && named(path.join(releasesDir, d), busy)) why.set(d, 'a running process uses it')
    say(`releases: keep ${[...why].filter(([d]) => all.includes(d)).map(([d, w]) => `${d} (${w})`).join(', ') || 'none'}`)
    for (const d of all.filter((d) => !why.has(d))) {
      const p = path.join(releasesDir, d)
      const k = kb(p)
      say(`  ${dry ? 'would delete' : 'delete'} release ${d} (${human(k)})`)
      if (!dry) rmSync(p, { recursive: true, force: true })
      deleted.push({ kind: 'release', name: d, kb: k })
    }
  }

  // ---- images and the builder: only with the turn free (or ours) and no other deploy
  const blocked = deployPid ? `a deploy is running (pid ${deployPid})` : !ours ? `the test turn is held by ${turn.label || 'someone'}${turn.pid ? ` (pid ${turn.pid})` : ''}; to wait for it: node ops/turn.mjs run --label clean -- node ops/ola.mjs clean` : !ctrsKnown ? 'the containers could not be listed' : null
  if (blocked) say(`images and builder: left alone, ${blocked}`)
  else {
    const curImg = releaseImage(current)
    const prevImg = releaseImage(previous)
    if (!curImg) say('images: left alone, the current release names no image (workspace/ws.mjs IMAGE)')
    else {
      const curTag = curImg.split(':')[1]
      const why = new Map()
      const add = (tag, w) => why.set(tag, why.has(tag) ? `${why.get(tag)}; ${w}` : w)
      add(curTag, 'the current release')
      if (prevImg) add(prevImg.split(':')[1], 'the previous release')
      for (const c of ctrs) if (c.image.startsWith(`${REPO}:`)) add(c.image.slice(REPO.length + 1), `container ${c.id}`)
      const list = images()
      for (const { tag } of list) {
        if (why.has(tag)) continue
        if (/-building$/.test(tag) && building) add(tag, 'being built')
        else if (!/-building$/.test(tag) && newer(tag, curTag)) add(tag, 'newer than the current release (being prepared)')
      }
      say(`images: keep ${list.filter((i) => why.has(i.tag)).map((i) => `${REPO}:${i.tag} (${why.get(i.tag)})`).join(', ') || 'none'}`)
      for (const i of list.filter((i) => !why.has(i.tag))) {
        say(`  ${dry ? 'would delete' : 'delete'} image ${REPO}:${i.tag}${i.kb ? ` (about ${human(i.kb)})` : ''}`)
        if (!dry) {
          const r = sh(CONTAINER, ['image', 'delete', `${REPO}:${i.tag}`])
          if (r.status !== 0) {
            say(`    could not delete it: ${(r.stderr || r.stdout || '').trim().split('\n').pop()}`)
            continue
          }
        }
        deleted.push({ kind: 'image', name: `${REPO}:${i.tag}`, kb: i.kb })
      }
    }
    const bdir = path.join(STORE, 'containers', 'buildkit')
    const bkb = existsSync(bdir) ? kb(bdir) : 0
    const limit = BUILDER_GB * 1024 * 1024
    if (!bkb) say('builder: none')
    else if (bkb <= limit) say(`builder: ${human(bkb)}, under ${BUILDER_GB} GB, kept`)
    else if (building) say(`builder: ${human(bkb)}, but a build is running (pid ${building.trim().split(/\s/)[0]}), kept`)
    else {
      say(`builder: ${human(bkb)}, over ${BUILDER_GB} GB: ${dry ? 'would delete' : 'delete'} it (container builder stop + delete; the next image build makes a new one)`)
      if (!dry) {
        sh(CONTAINER, ['builder', 'stop'])
        const r = sh(CONTAINER, ['builder', 'delete'])
        if (r.status !== 0) say(`  could not delete it: ${(r.stderr || r.stdout || '').trim().split('\n').pop()}`)
        else deleted.push({ kind: 'builder', name: 'buildkit', kb: bkb })
      } else deleted.push({ kind: 'builder', name: 'buildkit', kb: bkb })
    }
  }

  // ---- leftovers: the allowlist, older than LEFTOVER_DAYS, in use by nothing
  if (!ctrsKnown) say('leftovers: left alone, the containers could not be listed')
  else {
    const places = { home: HOME, ship: path.join(HOME, 'ola-ship'), tmp: tmpdir() }
    const cutoff = Date.now() - LEFTOVER_DAYS * 86_400_000
    let n = 0
    const tmpSum = {}
    say(`leftovers: on the allowlist and unchanged for ${LEFTOVER_DAYS} days`)
    for (const [where, dir] of Object.entries(places)) {
      if (!existsSync(dir)) continue
      for (const name of readdirSync(dir).sort()) {
        if (where === 'home' && NEVER.has(name)) continue
        const rule = ALLOW.find((a) => a.where === where && a.re.test(name))
        if (!rule) continue
        const p = path.join(dir, name)
        let st
        try {
          st = lstatSync(p)
        } catch {
          continue
        }
        if (st.isSymbolicLink()) continue
        if (rule.dir === true && !st.isDirectory()) continue
        if (rule.dir === false && !st.isFile()) continue
        if (rule.needs && !rule.needs.some((f) => existsSync(path.join(p, f)))) continue
        const age = newest(p)
        if (age > cutoff) continue
        const ws = st.isDirectory() ? wsIds(p).filter((id) => ctrIds.has(`ola-${id}`)) : []
        const reason = named(p, busy) ? 'a running process, a working folder or a launchd job names it' : ws.length ? `container ${ws.map((id) => `ola-${id}`).join(', ')} exists` : st.isDirectory() ? gitWork(p) : null
        if (reason) {
          say(`  keep ${tilde(p)}: ${reason}`)
          kept.push({ kind: 'leftover', name: tilde(p), reason })
          continue
        }
        const k = kb(p)
        n++
        // The temporary folder holds hundreds of these: one line for all of them, below.
        if (where === 'tmp') tmpSum[rule.what] = { n: (tmpSum[rule.what]?.n ?? 0) + 1, kb: (tmpSum[rule.what]?.kb ?? 0) + k }
        else say(`  ${dry ? 'would delete' : 'delete'} ${tilde(p)} (${human(k)}, ${rule.what}, last changed ${new Date(age).toISOString().slice(0, 10)})`)
        if (!dry) rmSync(p, { recursive: true, force: true })
        deleted.push({ kind: 'leftover', name: tilde(p), kb: k })
      }
    }
    for (const [what, v] of Object.entries(tmpSum)) say(`  ${dry ? 'would delete' : 'delete'} ${v.n} × ${what} in ${tmpdir()} (${human(v.kb)})`)
    if (!n) say('  nothing')
  }

  const est = deleted.reduce((s, d) => s + d.kb, 0)
  const freedKb = dry ? est : Math.max(0, freeKb() - t0Free)
  say(dry ? `would free about ${human(est)}` : `freed ${human(freedKb)} (${human(t0Free)} -> ${human(freeKb())} free)`)
  return { freedKb, deleted, kept }
}
