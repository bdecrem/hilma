// The asks runner's parts (OLA-231): the made-up account on the live test server, a conversation
// with Ola in either runtime through the same API the apps use, and the outcome checks.
//
// One conversation driver, two ways in:
//   cloud  https://app.ola.cx/oc/api/... with the person's sign-in cookie, the web app's own routes
//          (web/server/proxy.mjs ALLOWED): what the website and the apps' Cloud send.
//   local  the opencode that the Mac app starts on this Mac (OlaKit LocalServer, through the model
//          door with the account), run headless by `olakit-selftest` in OLA_SERVE_LOCAL mode; its
//          /api/... with the server's password, what the Mac app sends.
// Both speak opencode 2.3.0's session API: POST /api/session, POST .../prompt {text}, GET
// .../message (user, assistant, idle), GET .../permission and .../form (the yes cards and Ola's
// questions), POST .../permission/<id>/reply {decision} and .../form/<id>/reply {answer}.
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const AI = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const HERE = path.dirname(fileURLToPath(import.meta.url))
export const ORIGIN = process.env.OLA_ASKS_ORIGIN || 'https://app.ola.cx'
export const SITES = process.env.OLA_ASKS_SITES || 'https://sites.ola.cx'
// The live server's own code and settings: the deployed release, never a builder's copy.
export const LIVE = path.join(homedir(), 'ola-staging/current/apps/activist-ai')
export const STATE = process.env.OLA_ASKS_HOME || path.join(homedir(), 'ola-asks')
// The test server's record of what is live (ops/ola.mjs writes deployed.json when an update serves).
export const STAGING = process.env.OLA_ASKS_STAGING || path.join(homedir(), 'ola-staging')
/** The release the test server serves now: the first 12 characters of the deployed commit, or 'unknown'. */
export function liveRelease(staging = STAGING) {
  try {
    return String(JSON.parse(readFileSync(path.join(staging, 'deployed.json'), 'utf8')).commit ?? 'unknown').slice(0, 12)
  } catch {
    return 'unknown'
  }
}

// OLA-401: on Nov 22 at 18:47Z a builder's first version of a test called signOutAccount() for real on
// the test server; the run going then (e22f2b7ac99a) lost its sign-in mid-case and 32 cloud tries broke
// with "listing the project's files: 401" (the audit: sessions_revoked by admin re askcases at
// 18:47:34.811Z, 10 s before that run's own cleanup). What changes the made-up account (its password,
// its sign-ins, its pages, its project's files) now runs only in the process that holds the asks run
// lock in the real state folder (takeRunLock): never from a test, a builder's script or a second run.
let runHeld = false
export function mustHoldRun(what) {
  if (!runHeld) throw new Error(`${what} acts on the live made-up account (${WHO}); only the asks run that holds the run lock (${path.join(STATE, 'run.pid')}) may do it`)
}
// The made-up person and their one project. Kept between runs (the admin tool cannot delete a
// person, and a new one each run would pile up); each run gives it a new password nobody sees,
// empties the project, and at the end signs it out everywhere and takes its pages down.
export const WHO = 'askcases'
export const WHO_NAME = 'Asa Cases (made up)'
export const PROJECT = 'askcases'
export const TEAM = 'askcases-team'

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export const say = (s) => console.log(`${new Date().toISOString().slice(11, 19)}  ${s}`)

// ---------------------------------------------------------------- the live server's admin command
function liveEnv() {
  const env = { ...process.env, OLA_HOME: path.join(homedir(), '.ola') }
  for (const l of readFileSync(path.join(homedir(), '.ola/frontdesk.env'), 'utf8').split('\n')) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
  return env
}
// OLA-281: every command the runner starts while it holds connections to Ola runs without blocking
// this process. Taking the pages down took ~20 s in spawnSync; meanwhile the web server closed the
// kept-open connections (5 s idle) and nothing here could read the close, so the next try's first
// request went out on a dead connection: "fetch failed" (ECONNRESET), 4 times on ebdd4110 and 5 on
// da438040. Against app.ola.cx (Nov 22): after an 18 s blocking child 5 of 144 requests were reset,
// after the same child awaited 0 of 128. Browsers never block their network stack this way (54 of 54
// in Chromium and in WebKit, after idle gaps and an 18 s busy page): a person does not meet it.
export function runChild(cmd, args, { cwd, env, timeout = 600_000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (d) => (stdout += d))
    child.stderr.setEncoding('utf8').on('data', (d) => (stderr += d))
    const timer = setTimeout(() => child.kill('SIGKILL'), timeout)
    child.on('error', (e) => (clearTimeout(timer), resolve({ status: null, stdout, stderr: stderr || e.message })))
    child.on('close', (status) => (clearTimeout(timer), resolve({ status, stdout, stderr })))
  })
}
/** Runs one of the live release's tools (frontdesk/admin.mjs, workspace/ws.mjs). Output returned, never printed. */
export async function live(tool, args, { ok = false } = {}) {
  if (!existsSync(LIVE)) throw new Error(`the live server's release is not on this machine (${LIVE}): run the asks on the test server`)
  const r = await runChild(process.execPath, [path.join(LIVE, tool), ...args], { cwd: LIVE, env: liveEnv() })
  if (r.status !== 0 && !ok) throw new Error(`${tool} ${args[0]}: ${(r.stderr || r.stdout || '').trim().split('\n').pop()}`)
  return (r.stdout || '').trim()
}
export const admin = (...a) => live('frontdesk/admin.mjs', a)

/** The person and project exist, the project is empty, and the person has a fresh password (returned). */
export async function prepareAccount() {
  mustHoldRun('prepareAccount')
  const listed = await admin('list')
  if (!new RegExp(`^person ${WHO} `, 'm').test(listed)) await admin('add-person', WHO, '--name', WHO_NAME)
  if (new RegExp(`^person ${WHO} .*\\bsuspended`, 'm').test(listed)) throw new Error(`${WHO} is suspended on the live server; nothing here lifts that`)
  if (new RegExp(`^person ${WHO} .*\\badmin`, 'm').test(listed)) throw new Error(`${WHO} is an admin; the asks run as an ordinary person`)
  if (!new RegExp(`^workspace ${PROJECT} `, 'm').test(listed)) {
    await admin('create-workspace', PROJECT, '--name', 'Made-up asks', '--team', TEAM, '--team-name', 'Made-up Asks', '--owner', WHO, '--memory', '2g', '--disk', '2g', '--cpus', '2')
  }
  const link = (await admin('reset-password', WHO, '--hours', '1')).split(/\s+/).find((w) => w.includes('/#/reset/'))
  if (!link) throw new Error('no password link from the admin command')
  const password = `made up ${randomBytes(12).toString('base64url')} asks`
  const r = await post('/api/auth/reset', { token: link.split('/#/reset/')[1], password })
  if (r.status !== 200) throw new Error(`setting the password: ${r.status} ${r.text.slice(0, 160)}`)
  return password
}

/** Signs the made-up person in on the website: the cookie header for later requests. */
export async function signIn(password) {
  const r = await post('/api/auth/password', { handle: WHO, password })
  if (r.status !== 200) throw new Error(`sign-in: ${r.status} ${r.text.slice(0, 160)}`)
  const jar = r.headers.getSetCookie().map((c) => c.split(';')[0]).filter(Boolean)
  if (!jar.length) throw new Error('sign-in gave no cookie')
  const cookie = jar.join('; ')
  // The page's own first call: who am I, and the token every change carries (x-ola-csrf).
  const me = await fetch(ORIGIN + '/api/me', { headers: { cookie } })
  const csrf = me.status === 200 ? (await me.json()).csrf : null
  if (!csrf) throw new Error(`after sign-in, /api/me answered ${me.status} without the page's token`)
  return { cookie, csrf }
}
async function post(p, body, cookie) {
  const res = await fetch(ORIGIN + p, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) })
  return { status: res.status, headers: res.headers, text: await res.text() }
}

/** Takes down every page of the made-up person's (the project's site and their Mac sites). */
export async function takeDownSites() {
  mustHoldRun('takeDownSites')
  const done = []
  // `admin sites` lines: "<name> project <url> …", "<name> mac site of <handle> <url> …",
  // "<name> held by <handle> nothing up".
  for (const line of (await admin('sites')).split('\n').map((l) => l.trim())) {
    const name = line.split(/\s+/)[0]
    if (name === PROJECT && /^\S+\s+project\s/.test(line)) {
      await admin('unpublish', PROJECT)
      done.push(`${SITES}/${PROJECT}/ taken down`)
    } else if (line.includes(` mac site of ${WHO} `)) {
      await admin('unpublish', name)
      await admin('site-release', name, '--free')
      done.push(`${SITES}/${name}/ taken down, the name given up`)
    } else if (line.includes(` held by ${WHO} `) && line.includes('nothing up')) {
      await admin('site-release', name, '--free')
      done.push(`${name}: the name given up`)
    }
  }
  return done
}

/** Signs the person out everywhere (sessions and Macs) and stops the project's computer. */
export async function signOutAccount() {
  mustHoldRun('signOutAccount')
  const said = await admin('revoke-sessions', WHO)
  // It would stop itself after 30 idle minutes.
  await live('workspace/ws.mjs', ['stop', PROJECT], { ok: true })
  return `${said}; the project's computer stopped`
}

/** Stops the project's computer (OLA-401: when the cloud cases are done and the local ones follow, it
 *  would otherwise hold one of the machine's four VMs for hours without the turn). */
export async function stopProject() {
  mustHoldRun('stopProject')
  await live('workspace/ws.mjs', ['stop', PROJECT], { ok: true })
}

/** Empties the project's folder (its database and Ola's own record stay), so a case starts from nothing. */
export async function emptyProject() {
  mustHoldRun('emptyProject')
  await live('workspace/ws.mjs', ['start', PROJECT], { ok: true })
  const r = await runChild('/usr/local/bin/container', ['exec', `ola-${PROJECT}`, 'sh', '-c', 'find /work -mindepth 1 -maxdepth 1 ! -name project.db ! -name project.db-wal ! -name project.db-shm ! -name .ola -exec rm -rf {} +'])
  if (r.status !== 0) throw new Error(`emptying the project: ${(r.stderr || '').trim().slice(0, 200)}`)
}

/** Runs a shell line inside the project's computer (a case's setup). */
export async function inProject(script) {
  mustHoldRun('inProject')
  const r = await runChild('/usr/local/bin/container', ['exec', `ola-${PROJECT}`, 'sh', '-c', script])
  if (r.status !== 0) throw new Error(`in the project: ${(r.stderr || r.stdout || '').trim().slice(0, 200)}`)
  return r.stdout
}

// ---------------------------------------------------------------- the two ways in
// A restart of the web server right after a deploy (the deploy kit's install) cuts a request or
// answers 502/503 for a few seconds: a read is tried again for up to 40 s. A POST is not resent
// once the server answered (it may have been taken), only when it never connected.
async function steady(go, method) {
  const end = Date.now() + 40_000
  for (;;) {
    try {
      const r = await go()
      if (method === 'GET' && [502, 503, 504].includes(r.status) && Date.now() < end) {
        await sleep(2000)
        continue
      }
      return r
    } catch (e) {
      // OLA-250: "fetch failed" alone said nothing; the cause goes with it into the run log.
      const code = e.cause?.code ?? e.cause?.name ?? ''
      if (code && !String(e.message).includes(code)) e.message = `${e.message} (${code}${e.cause?.message ? `: ${e.cause.message}` : ''})`
      if (Date.now() > end || (method !== 'GET' && code !== 'ECONNREFUSED')) throw e
      await sleep(2000)
    }
  }
}
// ---------------------------------------------------------------- the cards a person sees (OLA-250)
// Nov 22, Mac 0.1 (33), Ola on the Mac, "publish it again": the page went up and the answer showed, then
// a card "Ola wants to run a command: Run publish.py" came up (a step that had already run, its yes
// given by the app itself), and its Yes gave "Your answer did not reach the machine" for good. The
// runner answered every waiting request on the server, so it saw none of that. Now it reads the cards
// a person sees: in the cloud the website's own fold of the event stream (web/src/lib/conversation.ts),
// on the Mac the app's own store (OlaKit OlaStore in olakit-selftest, cards.json); it answers only those,
// as a person does, and a case fails on a card still up after the answer or on a card that shows a
// publishing step as a raw command.
/** A card for a publishing step shown as the raw command (not the publish card): to a person, Ola
 *  publishing a second time, with a command to approve (Nov 22: "Run publish.py" after the page went up). */
export const rawPublishingCard = (card) => !!card && !card.publishCard && /publish\.py|ola-publish/.test(String(card.command ?? ''))
const cardWords = (c) => `"${c.title}"${c.command ? ` (${oneLineOf(c.command).slice(0, 140)})` : ''}`
const oneLineOf = (s) => String(s).replace(/\s+/g, ' ').trim()
/**
 * What the cards of one request say against the rules: a card left up after the answer, and a raw
 * command card for publishing. `cards`: { seen: [card], left: card|null, answers: [{card, status}] }.
 */
export function cardFaults(cards) {
  const out = []
  if (!cards) return out
  if (cards.left) out.push(`a card was still up after the answer: ${cardWords(cards.left)}${cards.left.problem ? `; the app said: ${cards.left.problem}` : ''}`)
  for (const c of cards.seen ?? []) if (rawPublishingCard(c)) out.push(`a publishing step was shown as a raw command card: ${cardWords(c)}`)
  for (const a of cards.answers ?? []) if (a.status >= 300) out.push(`the card's Yes did not reach the machine (${a.status}): ${cardWords(a.card)}`)
  for (const u of cards.unseen ?? []) out.push(`a request waited 20 s with no card and no yes from the app: ${oneLineOf(u).slice(0, 140)}`)
  return [...new Set(out)]
}

/** The website's cards in a cloud project: the event stream folded by the website's own code. */
export function websiteCards(open) {
  const states = new Map()
  const seen = new Map()
  let started = null
  let fold = null
  async function start() {
    fold = await import('../../web/src/lib/conversation.ts')
    const res = await open()
    if (res.status !== 200 || !res.body) throw new Error(`the event stream answered ${res.status}`)
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
    ;(async () => {
      let buf = ''
      for (;;) {
        const { value, done } = await reader.read().catch(() => ({ done: true }))
        if (done) return
        buf += value
        let nl
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim()
          buf = buf.slice(nl + 1)
          if (!line.startsWith('data:')) continue
          let ev
          try {
            ev = JSON.parse(line.slice(5).trim())
          } catch {
            continue
          }
          const sid = ev?.data?.sessionID ?? ev?.data?.form?.sessionID
          const st = sid && states.get(sid)
          if (!st) continue
          fold.applyEvent(st, ev)
          const a = st.approval
          if (a && !(seen.get(sid) ?? []).some((c) => c.id === a.id)) seen.set(sid, [...(seen.get(sid) ?? []), cardOf(a)])
        }
      }
    })()
  }
  const cardOf = (a) => (a ? { id: a.id, action: a.action, title: a.title, command: (a.items ?? []).map((i) => i.detail ?? i.label).join('\n'), publishCard: !!a.card } : null)
  return {
    /** Before a request is sent: the website shows it as a turn (startTurn). */
    async turn(sid, text) {
      started ??= start()
      await started
      if (!states.has(sid)) {
        const st = fold.emptyConversation()
        st.sessionID = sid
        states.set(sid, st)
      }
      fold.startTurn(states.get(sid), text)
    },
    card: (sid) => cardOf(states.get(sid)?.approval ?? null),
    seen: (sid) => seen.get(sid) ?? [],
  }
}

export function cloudTransport({ cookie, csrf }) {
  const headers = { cookie, origin: ORIGIN, 'x-ola-workspace': PROJECT, 'x-ola-csrf': csrf }
  return {
    runtime: 'cloud',
    cards: websiteCards(() => fetch(`${ORIGIN}/oc/api/event`, { headers: { ...headers, accept: 'text/event-stream' } })),
    async call(method, p, body) {
      const res = await steady(() => fetch(`${ORIGIN}/oc${p}`, {
        method,
        headers: { cookie, origin: ORIGIN, 'x-ola-workspace': PROJECT, 'x-ola-csrf': csrf, accept: 'application/json', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      }), method)
      const text = await res.text()
      let json = null
      try {
        json = text ? JSON.parse(text) : null
      } catch {}
      return { status: res.status, json, text }
    },
    // The Made by Ola list reads files through the website's own route.
    async readFile(rel) {
      const res = await fetch(`${ORIGIN}/api/files/${encodeURIComponent(rel)}?w=${PROJECT}`, { headers: { cookie, origin: ORIGIN } })
      return res.status === 200 ? await res.text() : null
    },
    async listFiles() {
      const res = await fetch(`${ORIGIN}/api/files?w=${PROJECT}`, { headers: { cookie, origin: ORIGIN, 'x-ola-workspace': PROJECT } })
      if (res.status !== 200) throw new Error(`listing the project's files: ${res.status}`)
      return ((await res.json()).files ?? []).map((f) => f.path)
    },
    async wrote(rel, { text, base64 }) {
      const b64 = base64 ?? Buffer.from(text).toString('base64')
      const safe = rel.replace(/[^A-Za-z0-9._/-]/g, '')
      await inProject(`mkdir -p "$(dirname '/work/${safe}')" && echo ${b64} | base64 -d > '/work/${safe}'`)
    },
    async claudeWrote(rel, text) {
      // Recorded the way the server records a Claude run (frontdesk/claude.mjs + madeby.mjs: begin,
      // the file written, end), without running Claude: what the case tests is Ola's answer.
      const turn = `asks-${randomBytes(4).toString('hex')}`
      const b64 = Buffer.from(text).toString('base64')
      await inProject(`ola-db made-by begin --turn ${turn} --engine claude --model claude-opus-5-5 && echo ${b64} | base64 -d > '/work/${rel.replace(/'/g, '')}' && ola-db made-by end --turn ${turn} --model claude-opus-5-5`)
    },
    // The project's record of who made its files (ola-db made-by --json), read in the VM (OLA-303).
    async madeBy(rel = null) {
      return JSON.parse(await inProject(`ola-db made-by --json --limit 50${rel ? ` '/work/${rel.replace(/'/g, '')}'` : ''}`) || '[]')
    },
    // The Unpublish button (OLA-421): the website's own route, as the person's click sends it (web/src/lib/api.ts
    // site.unpublish), then the address read until it answers 404, so the request starts from a page that is gone.
    async unpublishButton({ waitMs = 180_000 } = {}) {
      const res = await steady(() => fetch(`${ORIGIN}/api/site/unpublish`, { method: 'POST', headers: { ...headers, accept: 'application/json', 'content-type': 'application/json' }, body: '{}' }), 'POST')
      const body = await res.json().catch(() => null)
      if (res.status !== 200 || !body?.unpublished) throw new Error(`the Unpublish button's route answered ${res.status} ${JSON.stringify(body ?? {}).slice(0, 160)}`)
      const url = body.url || `${SITES}/${PROJECT}/`
      const stop = Date.now() + waitMs
      for (;;) {
        const s = (await fetchText(url)).status
        if (s === 404) return url
        if (Date.now() >= stop) throw new Error(`${url} still answers ${s} ${Math.round(waitMs / 60000)} minutes after the Unpublish button`)
        await sleep(5000)
      }
    },
  }
}

/** The Mac app's local runtime, headless (olakit-selftest OLA_SERVE_LOCAL): started, then talked to. */
export async function startLocal(password, { build = true } = {}) {
  const dir = path.join(STATE, 'local')
  // The skills and plugins are installed read-only (as the app does): writable again to remove them.
  if (existsSync(dir)) spawnSync('/bin/chmod', ['-R', 'u+w', dir])
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(path.join(dir, 'folder'), { recursive: true })
  const pw = path.join(dir, 'pw')
  writeFileSync(pw, password + '\n', { mode: 0o600 })
  const kit = path.join(AI, 'apple/OlaKit')
  const scratch = path.join(STATE, 'olakit-build')
  if (build) {
    const b = await runChild('/usr/bin/swift', ['build', '--product', 'olakit-selftest', '--scratch-path', scratch], { cwd: kit, timeout: 900_000 })
    if (b.status !== 0) throw new Error(`building olakit-selftest: ${(b.stderr || b.stdout || '').trim().split('\n').slice(-3).join(' ')}`)
  }
  const bin = path.join(scratch, 'debug/olakit-selftest')
  const child = spawn(bin, [], {
    env: { PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin', HOME: homedir(), USER: process.env.USER ?? '', TMPDIR: process.env.TMPDIR ?? '/tmp', OLA_SERVE_LOCAL: '1', OLA_ACCOUNT_BASE: ORIGIN, OLA_HANDLE: WHO, OLA_ACCOUNT_PASSWORD_FILE: pw, OLA_LOCAL_FOLDER: path.join(dir, 'folder'), OLA_SERVE_DIR: path.join(dir, 'serve') },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let log = ''
  child.stdout.on('data', (d) => (log = (log + d).slice(-8000)))
  child.stderr.on('data', (d) => (log = (log + d).slice(-8000)))
  const info = path.join(dir, 'serve/server.json')
  const end = Date.now() + 120_000
  while (!existsSync(info)) {
    if (child.exitCode !== null || Date.now() > end) {
      child.kill()
      throw new Error(`the local runtime did not start: ${log.trim().split('\n').slice(-3).join(' ')}`)
    }
    await sleep(300)
  }
  rmSync(pw, { force: true })
  // Not the app's commands: every local case would test something no Mac has (OLA-250). Stopped here,
  // with the reason, instead of a model's paraphrase of a usage line later.
  const wrong = commandsNotTheApps(path.join(dir, 'serve/support/web-tools'))
  if (wrong.length) {
    child.stdin.end()
    throw new Error(`the local runtime's commands are not the Mac app's: ${wrong.join('; ')}`)
  }
  const { url, password: serverPw, skills } = JSON.parse(readFileSync(info, 'utf8'))
  const auth = 'Basic ' + Buffer.from(`opencode:${serverPw}`).toString('base64')
  const folder = path.join(dir, 'folder')
  // The Mac app's own store on this server (ServeLocal AppCards, OLA-250): what the app shows.
  const cardsFile = path.join(dir, 'serve/cards.json')
  const appCards = () => {
    try {
      return JSON.parse(readFileSync(cardsFile, 'utf8'))
    } catch {
      return null
    }
  }
  return {
    runtime: 'local',
    skills,
    folder,
    cards: {
      app: true,
      async turn() {},
      card: (sid) => {
        const s = appCards()?.[sid]
        return s?.card ? { ...s.card, problem: s.problem ?? null } : null
      },
      seen: (sid) => appCards()?.[sid]?.seen ?? [],
      /** The app has this conversation loaded (its cards are known). */
      knows: (sid) => !!appCards()?.[sid],
    },
    async call(method, p, body) {
      const res = await steady(() => fetch(new URL(p, url), { method, headers: { authorization: auth, accept: 'application/json', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined }), method)
      const text = await res.text()
      let json = null
      try {
        json = text ? JSON.parse(text) : null
      } catch {}
      return { status: res.status, json, text }
    },
    async readFile(rel) {
      const f = path.join(folder, rel)
      return f.startsWith(folder + path.sep) && existsSync(f) ? readFileSync(f, 'utf8') : null
    },
    async listFiles() {
      const r = spawnSync('/usr/bin/find', [folder, '-type', 'f', '-not', '-path', '*/.*'], { encoding: 'utf8' })
      return r.stdout.split('\n').filter(Boolean).map((f) => path.relative(folder, f)).filter((f) => !f.startsWith('project.db'))
    },
    wrote(rel, { text, base64 }) {
      const f = path.join(folder, rel)
      mkdirSync(path.dirname(f), { recursive: true })
      writeFileSync(f, base64 ? Buffer.from(base64, 'base64') : text)
    },
    empty() {
      for (const f of spawnSync('/bin/ls', ['-A', folder], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean)) rmSync(path.join(folder, f), { recursive: true, force: true })
    },
    claudeWrote(rel, text) {
      // The app's own record (OlaKit LocalMadeBy, through ola-made-by's database in the folder):
      // begin, the file written, end, as the app brackets a Claude run.
      const tools = path.join(dir, 'serve/support/web-tools')
      const turn = `asks-${randomBytes(4).toString('hex')}`
      const env = { ...process.env, OLA_WORK: folder, OLA_LIB: tools }
      const db = (args) => {
        const r = spawnSync(path.join(tools, 'ola-db'), ['made-by', ...args], { cwd: folder, env, encoding: 'utf8' })
        if (r.status !== 0) throw new Error(`ola-db made-by ${args[0]}: ${(r.stderr || '').trim().slice(0, 200)}`)
      }
      db(['begin', '--turn', turn, '--engine', 'claude', '--model', 'claude-opus-5-5'])
      writeFileSync(path.join(folder, rel), text)
      db(['end', '--turn', turn, '--model', 'claude-opus-5-5'])
    },
    // The folder's record of who made its files, as the app keeps it (OLA-303).
    madeBy(rel = null) {
      const tools = path.join(dir, 'serve/support/web-tools')
      const r = spawnSync(path.join(tools, 'ola-db'), ['made-by', '--json', '--limit', '50', ...(rel ? [rel] : [])], { cwd: folder, env: { ...process.env, OLA_WORK: folder, OLA_LIB: tools }, encoding: 'utf8' })
      if (r.status !== 0) throw new Error(`ola-db made-by --json: ${(r.stderr || '').trim().slice(0, 200)}`)
      return JSON.parse(r.stdout || '[]')
    },
    async stop() {
      child.stdin.end()
      const t = Date.now() + 20_000
      while (child.exitCode === null && Date.now() < t) await sleep(200)
      if (child.exitCode === null) child.kill()
      return log.includes('stopped') ? 'stopped and signed out' : `ended (${log.trim().split('\n').pop()})`
    },
  }
}

/**
 * OLA-250: the local runtime is the app's only if its commands are the files the app carries. The
 * app's Resources are filled by apple/project.yml (the WebTools sources: workspace/ and bart/); a run
 * from the repo installs from those folders (OlaKit LocalServer.installWebTools). On Nov 20 the
 * repo run took the cloud's ola-publish (workspace/) instead of the Mac's (bart/), and every
 * "publish it on ola" failed with a command no Mac app carries. Returns one line per command that
 * differs or is missing; empty when the runtime carries exactly the app's commands.
 */
export function commandsNotTheApps(installed, apple = path.join(AI, 'apple')) {
  const yml = readFileSync(path.join(apple, 'project.yml'), 'utf8').split('\n')
  const carried = new Map() // name in the app's Resources -> the repo file
  for (let i = 0; i < yml.length - 1; i++) {
    const dir = yml[i].trim().match(/^- path: (\.\.\/\S+)$/)?.[1]
    const inc = yml[i + 1].trim().match(/^includes: \[(.*)\]$/)?.[1]
    if (!dir || !inc) continue
    for (const f of inc.split(',').map((x) => x.trim()).filter(Boolean)) {
      const name = path.basename(f)
      if (carried.has(name)) carried.set(name, null) // two files under one name: not one the app can carry
      else carried.set(name, path.join(apple, dir, f))
    }
  }
  // The names the Mac installs a carried file under (LocalServer.webToolFrom).
  const from = { 'ola-page': 'ola-page-mac', 'olapage.py': 'ola-page' }
  const out = []
  for (const name of readdirSync(installed)) {
    const src = carried.get(from[name] ?? name)
    if (src === undefined) out.push(`${name}: the app carries no such command`)
    else if (src === null) out.push(`${name}: project.yml puts two files under that name in the app`)
    else if (!readFileSync(src).equals(readFileSync(path.join(installed, name)))) out.push(`${name}: not the app's (${path.relative(AI, src)})`)
  }
  return out
}

// ---------------------------------------------------------------- one conversation
const list = (j) => (Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : [])
// opencode answers at most 200 messages a page; a refusal here must not read as "nothing yet".
async function messagesOf(T, sid) {
  const r = await T.call('GET', `/api/session/${sid}/message?limit=200`)
  if (r.status >= 300) throw new Error(`reading the conversation: ${r.status} ${r.text.slice(0, 160)}`)
  return turnsOf(list(r.json))
}

/** The turns of a conversation from its messages, the way the apps fold them (Conversation.swift). */
export function turnsOf(messages) {
  const turns = []
  for (const m of [...messages].sort((a, b) => (a.time?.created ?? 0) - (b.time?.created ?? 0))) {
    if (m.type === 'user') {
      turns.push({ request: String(m.text ?? ''), texts: [], tools: [], status: 'working' })
      continue
    }
    const t = turns[turns.length - 1]
    if (!t) continue
    if (m.type === 'assistant') {
      for (const part of m.content ?? []) {
        if (part.type === 'text' && String(part.text ?? '').trim()) t.texts.push(String(part.text))
        if (part.type === 'tool') t.tools.push({ name: part.name, input: part.state?.input?.command ?? JSON.stringify(part.state?.input ?? {}).slice(0, 300), status: part.state?.status })
      }
      if (m.error) t.error = JSON.stringify(m.error).slice(0, 300)
    }
    if (m.type === 'idle') t.status = m.outcome === 'succeeded' ? 'done' : m.outcome === 'interrupted' ? 'stopped' : 'failed'
  }
  return turns
}

// What a person says yes to: a choice that starts like a yes, else the first one.
const YES = /^(yes|publish|go ahead|ok|okay|sure|do it|allow|continue|confirm)/i

/**
 * Sends one request in a session and waits for its turn to end, saying yes to every yes card (a
 * permission) and answering Ola's questions the way a person who wants it done would. Returns the
 * turn: Ola's words, the steps, the status, and what was answered on the way.
 */
export async function ask(T, sid, text, limitMs) {
  const before = (await messagesOf(T, sid)).length
  await T.cards?.turn(sid, text)
  const sent = await T.call('POST', `/api/session/${sid}/prompt`, { text })
  if (sent.status >= 300) throw new Error(`the request was not taken: ${sent.status} ${sent.text.slice(0, 200)}`)
  const answered = []
  // OLA-250: the cards a person saw, the ones they answered (with the server's answer), and the one
  // still up after the answer, if any.
  const cards = { seen: [], left: null, answers: [], unseen: [] }
  const waiting = new Map() // On the Mac: a request waiting with neither a card nor the app's own yes
  const end = Date.now() + limitMs
  while (Date.now() < end) {
    await sleep(1500)
    if (T.cards?.app) {
      // The Mac app (its own store, Lots of permissions on): the person answers the card on screen; the
      // app answers the rest itself. Nothing else answers here, as nothing else does on a Mac.
      const card = T.cards.card(sid)
      if (card && !cards.answers.some((a) => a.card.id === card.id)) {
        const r = await T.call('POST', `/api/session/${sid}/permission/${card.id}/reply`, { decision: 'once' })
        cards.answers.push({ card, status: r.status })
        answered.push(`card "${card.title}", yes, once${card.command ? `: ${oneLineOf(card.command).slice(0, 120)}` : ''}${r.status >= 300 ? ` (reply ${r.status})` : ''}`)
      }
      // A request that waits 20 s with no card and no yes from the app: on a Mac the run would sit
      // there. Answered here so the case goes on, and counted against it.
      for (const q of list((await T.call('GET', `/api/session/${sid}/permission`)).json)) {
        if (!q?.id || cards.answers.some((a) => a.card.id === q.id)) continue
        if (!waiting.has(q.id)) waiting.set(q.id, Date.now())
        if (Date.now() - waiting.get(q.id) < 20_000) continue
        waiting.delete(q.id)
        const r = await T.call('POST', `/api/session/${sid}/permission/${q.id}/reply`, { decision: 'once' })
        const what = `${q.action ?? '?'} ${String((q.resources ?? []).join(' ') || q.metadata?.command || '').slice(0, 120)}`
        cards.unseen.push(what)
        answered.push(`no card and no yes for 20 s, answered by the runner: ${what}${r.status >= 300 ? ` (reply ${r.status})` : ''}`)
      }
    } else
    for (const q of list((await T.call('GET', `/api/session/${sid}/permission`)).json)) {
      if (!q?.id) continue
      const card = T.cards?.card(sid)
      const r = await T.call('POST', `/api/session/${sid}/permission/${q.id}/reply`, { decision: 'once' })
      if (card?.id === q.id) cards.answers.push({ card, status: r.status })
      answered.push(`yes, once: ${q.action ?? '?'} ${String(q.resource ?? q.metadata?.command ?? '').slice(0, 120)}${r.status >= 300 ? ` (reply ${r.status})` : ''}`)
    }
    for (const f of list((await T.call('GET', `/api/session/${sid}/form`)).json)) {
      if (!f?.id || !Array.isArray(f.fields)) continue
      const answer = {}
      const said = []
      for (const field of f.fields) {
        const opts = (field.options ?? []).filter((o) => typeof o?.value === 'string')
        const pick = opts.find((o) => YES.test(String(o.label ?? o.value))) ?? opts[0]
        answer[field.key] = field.type === 'multiselect' ? (pick ? [pick.value] : []) : pick ? pick.value : 'Yes, go ahead.'
        said.push(`"${String(field.title ?? field.description ?? '').slice(0, 100)}" → ${pick ? pick.label ?? pick.value : 'Yes, go ahead.'}`)
      }
      const r = await T.call('POST', `/api/session/${sid}/form/${f.id}/reply`, { answer })
      answered.push(`question: ${said.join('; ')}${r.status >= 300 ? ` (reply ${r.status})` : ''}`)
    }
    const turns = (await messagesOf(T, sid))
    const t = turns[turns.length - 1]
    if (turns.length > before && t && t.status !== 'working') {
      if (T.cards) {
        // What the person sees once the answer is there: looked at 3 s after the turn ended.
        await sleep(3000)
        cards.left = T.cards.card(sid)
        cards.seen = T.cards.seen(sid)
      }
      return { ...t, answered, cards }
    }
  }
  await T.call('POST', `/api/session/${sid}/interrupt`, {}).catch(() => {})
  const turns = (await messagesOf(T, sid))
  if (T.cards) cards.seen = T.cards.seen(sid)
  return { ...(turns[turns.length - 1] ?? { texts: [], tools: [] }), status: 'timeout', answered, cards }
}

/** A new conversation, as the website makes one with Lots of permissions on (the default). */
export async function newSession(T, title) {
  const r = await T.call('POST', '/api/session', T.runtime === 'cloud' ? { title, metadata: { autonomy: 'go' } } : { title })
  const id = r.json?.data?.id ?? r.json?.id
  if (!id) throw new Error(`no conversation: ${r.status} ${r.text.slice(0, 200)}`)
  return id
}

// ---------------------------------------------------------------- the checks
// What Ola must never answer a request it can do: it cannot from here, or go and do it yourself.
export const NEVER = [
  { label: 'says it cannot do it from here', re: /\b(can(?:no|['’])t|unable to|not able to|no way to|isn['’]t possible to|not possible to)\b[^.\n]{0,100}\b(publish|put (?:it|this|the page) (?:online|live)|push|deploy|go live|from here|from this (?:computer|runtime|machine))/i },
  // Soft: a tip after the work is done ("press Publish to update it later") is fine; this counts
  // only when Ola did not do what was asked.
  { soft: true, label: 'sends the person to a button or another screen', re: /\b(press|tap|click|hit|use)\b[^.\n]{0,30}\b(the )?["“'‘*]*publish\b[^.\n]{0,20}(button|tab|menu|sheet)?/i },
  { label: 'says publishing is not switched on', re: /not (?:switched|turned) on/i },
  // OLA-232: the reason given on Nov 20 for not publishing, for any request: the sealed computer.
  { label: 'blames having no network', re: /\b(?:no (?:internet|network|web)(?: access| connection)?\b[^.\n]{0,60}\b(?:so|can(?:no|['’])t|unable)|(?:cloud runtime|sandbox(?:ed)?)\b[^.\n]{0,40}\b(?:no network|offline|no internet))/i },
]
// The labels a not-offered case is allowed to say (it says it cannot, with the sentence it is given).
const CANNOT = new Set(['says it cannot do it from here'])

/**
 * OLA-250, Nov 22 (Mac 0.1 (32), Ola on the Mac): Ola ended its turn on "Shall I publish these 3 files
 * at https://sites.ola.cx/bart-simpson/?", a question in words with no card, so a person had nothing to
 * say yes to and nothing was published. The runner says "Yes, go ahead." to a turn that ends on a
 * question, which published the page and hid the fault. At Ola's address the app's card is the only
 * question (skill publish 8): a reply that asks in words to publish is a failure in every case.
 */
export function asksToPublishInWords(text) {
  const t = String(text).trim()
  if (!/\?[\s*_]*$/.test(t)) return false
  const tail = t.slice(-400)
  // Which home (the skill's one question for a plain "publish this"), or their own hosting: asked in words.
  if (/\b(?:github|vercel)\b/i.test(tail)) return false
  return /\b(?:shall|should|can|may) I (?:go ahead and |now )?(?:publish|republish|put (?:it|this|them|the page|these [\w\s]{0,20}) (?:up|online|live|on))\b|\b(?:want|like) me to (?:go ahead and )?(?:publish|republish|put (?:it|this) (?:up|online|live))\b|\bready (?:for me )?to publish\b|\bpublish (?:it|this|these [\w\s]{0,20}) (?:now|at https?:\S+)\?/i.test(tail)
}

/** The https://sites.ola.cx/<name>/ addresses in a text. */
export const siteAddresses = (text) => [...new Set([...String(text).matchAll(/https:\/\/sites\.ola\.cx\/[a-z0-9][a-z0-9-]{0,62}\/?/gi)].map((m) => m[0].replace(/\/?$/, '/')))]
/**
 * Every sites.ola.cx link in a text, whole, as a person would copy it (OLA-267, Nov 21: Ola's answer
 * gave "https://sites.ola.cx/chk1121da-test/sites.ola.cx"; siteAddresses saw only its first part, the
 * right address, and the check passed). Sentence punctuation after a link is not part of it.
 */
// Markdown's marks around a link (OLA-250, Nov 22: "**https://sites.ola.cx/bart/**" is a bold
// link in every app, which shows the address without the stars; the test read the stars as part of
// it, fetched ".../bart/**" (404) and failed a publish that worked, 2 of 6 and 2 of 2). Emphasis
// marks (* _ ~) and sentence punctuation after a link are not part of it, in any order.
const LINK_TAIL = /[.,;:!?*_~]+$/
export const siteLinks = (text) => [...new Set([...String(text).matchAll(/(?:https?:\/\/)?sites\.ola\.cx(?:\/[^\s<>"'`()[\]]*)?/gi)].map((m) => m[0].replace(LINK_TAIL, '')))]

// The front desk's own reader (sites.mjs), loaded only when a site: check runs (add-case's test copies
// this file elsewhere).
const readAsReaderLazy = (u) => import('../../frontdesk/sites.mjs').then((m) => m.readAsReader(u))

async function fetchText(url) {
  try {
    const r = await fetch(url, { cache: 'no-store', redirect: 'follow' })
    return { status: r.status, text: await r.text() }
  } catch (e) {
    return { status: `error ${e.cause?.code ?? e.message}`, text: '' }
  }
}

/** Does an answer name the engine a record row names? { ok, who, miss } (record:, OLA-303). */
export function whoVerdict(row, answer) {
  const design = row.engine === 'ola' && /^(design:|the design model, )/.test(row.model ?? '')
  const a = String(answer)
  if (design) {
    const name = String(row.model).replace(/^design:|^the design model, /, '').split('/').pop()
    if (!new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(a)) return { ok: false, who: `${name} (the design model)`, miss: `no ${name}` }
    if (/Ola.s own (open )?model (made|built|changed|did)/i.test(a) && !/not Ola.s own/i.test(a)) return { ok: false, who: `${name} (the design model)`, miss: 'it says Ola’s own model' }
    return { ok: true, who: `${name} (the design model)` }
  }
  if (row.engine === 'ola') {
    const ok = /\bOla.s own\b|\bI (made|built|created|changed|did)\b/i.test(a) && !/inkling|design model/i.test(a.replace(/not (by )?(Inkling[\w-]*|the design model)/gi, ''))
    return { ok, who: 'Ola’s own open model', miss: 'it does not say Ola’s own model, or names the design model' }
  }
  const re = row.engine === 'claude' ? /\bclaude\b/i : /hosted|deepseek/i
  return { ok: re.test(a), who: row.engine, miss: `no ${row.engine}` }
}

/**
 * One outcome, checked. Kinds (cases.json "must"):
 *   site:<words>         Ola's answer gives an https://sites.ola.cx/<name>/ address, and that address
 *                        (read once, then 3 more times over 12 s as a reader, OLA-302)
 *                        answers 200 with a page that says <words>
 *   says:<regex>         Ola's answer matches (case-insensitive)
 *   file:<path>[:<words>]  the file is in the project (and says <words>)
 *   ran:<regex>          a step of this request matches; noran:<regex>: none does (OLA-244)
 *   served:<name>        the model connection's own record says <name> served at least one of this
 *                        case's requests (design, general); served:!<name>: none of them (OLA-168)
 *   card                 the request itself asked the person with the question tool (a card they
 *                        answer), not only in the words of its answer (OLA-325)
 *   nocard               the request put up no question card (OLA-168: a page request is made
 *                        first, with draft lines, and questions come after)
 *   record:made|last     the answer names whoever the project's own record says made (or last
 *                        changed) the newest page (OLA-303); the design model as an outside model
 */
export async function checkMust(must, T, answer, { steps = [], lastSteps = steps, lastAnswered = [], before = [], earlier = '', wait = 60_000, since = 0, sessions = [], rereads = 3, rereadMs = 4000, reader = readAsReaderLazy, fetchFirst = fetchText } = {}) {
  const [kind, ...rest] = must.split(':')
  const arg = rest.join(':')
  if (kind === 'card') {
    // OLA-325: "ask me two things first" asked in words leaves the person no card to answer; the
    // runner's typed yes would go on and hide it.
    const q = lastAnswered.find((a) => a.startsWith('question: '))
    return { ok: !!q, why: q ? `a card: ${q.slice(10, 200)}` : 'no question card in this request; Ola asked in words or not at all' }
  }
  if (kind === 'nocard') {
    // OLA-168, Nov 22: 4 of 4 page requests on the website asked "What are the details ...?" as a card
    // before any page existed; the runner's answer went on and hid it.
    const q = lastAnswered.filter((a) => a.startsWith('question: '))
    return { ok: !q.length, why: q.length ? `a question card before the work: ${q.map((x) => x.slice(10, 160)).join(' | ')}` : 'no question card' }
  }
  if (kind === 'served') {
    const not = arg.startsWith('!')
    const name = arg.replace(/^!/, '')
    const names = await servedNames(T, sessions, since)
    if (!names) return { ok: false, why: 'the model connection could not be asked which model served this case' }
    const n = names[name] ?? 0
    const all = Object.entries(names).map(([k, v]) => `${k} ${v}`).join(', ') || 'no requests'
    return not ? { ok: n === 0, why: `the model connection served: ${all}` } : { ok: n > 0, why: `the model connection served: ${all}` }
  }
  if (kind === 'gone') {
    // gone: the page is down. Every sites.ola.cx address Ola gave in the conversation (the turns said
    // first and this one) answers 404, within a minute; at least one address was given.
    const addrs = siteAddresses(`${earlier}\n${answer}`)
    if (!addrs.length) return { ok: false, why: 'no sites.ola.cx address anywhere in the conversation, so nothing to see taken down' }
    const stop = Date.now() + wait
    for (;;) {
      const seen = []
      for (const a of addrs) seen.push({ a, status: (await fetchText(a)).status })
      if (seen.every((s) => s.status === 404)) return { ok: true, why: seen.map((s) => `${s.a} 404`).join('; ') }
      if (Date.now() >= stop) return { ok: false, why: `still up: ${seen.filter((s) => s.status !== 404).map((s) => `${s.a} ${s.status}`).join('; ')}` }
      await sleep(5000)
    }
  }
  if (kind === 'site') {
    const addrs = siteAddresses(answer)
    if (!addrs.length) return { ok: false, why: 'no sites.ola.cx address in Ola’s answer' }
    const seen = []
    for (const a of addrs) {
      const r = await fetchFirst(a)
      const has = r.status === 200 && r.text.toLowerCase().includes(arg.toLowerCase())
      seen.push(`${a} ${r.status}${r.status === 200 ? (has ? ` with "${arg}"` : ` without "${arg}"`) : ''}`)
      if (!has) continue
      // OLA-302: one fresh read is not what a reader gets. The page counts only if it says the words
      // on every one of `rereads` more reads over the next seconds, each on a new connection with no
      // cache-skipping headers (another of the host's edge servers may still have the old page).
      for (let i = 1; i <= rereads; i++) {
        await new Promise((res) => setTimeout(res, rereadMs))
        const x = await reader(a).then((y) => ({ status: y.status, text: y.body.toString('utf8') }), (e) => ({ status: `error ${e.code ?? e.message}`, text: '' }))
        if (!(x.status === 200 && x.text.toLowerCase().includes(arg.toLowerCase()))) {
          seen.push(`read again ${i * rereadMs / 1000} s later as a reader: ${x.status}${x.status === 200 ? ` without "${arg}" (the old page)` : ''}`)
          return { ok: false, why: seen.join('; ') }
        }
      }
      seen.push(`the same on ${rereads} more reads over ${(rereads * rereadMs) / 1000} s, each a new connection`)
      // Every link to sites.ola.cx the person is told must be that address, or a page under it that
      // answers: never an address Ola composed that goes nowhere (OLA-267).
      for (const l of siteLinks(answer)) {
        const full = /^https?:\/\//i.test(l) ? l : `https://${l}`
        // The host named on its own ("published on sites.ola.cx") is not an address.
        if (full.replace(/\/?$/, '/') === a || /^https?:\/\/sites\.ola\.cx\/?$/i.test(full)) continue
        if (!full.startsWith(a)) return { ok: false, why: `${seen.join('; ')}; but the answer also gives ${l}, which is not the published address ${a}` }
        const r = await fetchFirst(full)
        if (r.status !== 200) return { ok: false, why: `${seen.join('; ')}; but the answer also gives ${l}, which answers ${r.status}, not the published page` }
      }
      return { ok: true, why: seen.join('; '), url: a }
    }
    return { ok: false, why: seen.join('; ') }
  }
  if (kind === 'record') {
    // record:made | record:last (OLA-303): the answer names whoever the project's own record says made
    // (or last changed) the newest page, so an answer that disagrees with the record fails whichever
    // model really did the work. On Nov 21 the record said one thing and Ola another.
    let rows
    try {
      rows = await T.madeBy()
    } catch (e) {
      return { ok: false, why: `the record could not be read (${e.message})` }
    }
    const page = rows.filter((r) => /\.html?$/i.test(r?.path ?? '') && r.how !== 'deleted' && !/^site\//.test(r.path)).sort((x, y) => String(y.at).localeCompare(String(x.at)))[0]
    if (!page) return { ok: false, why: 'the record has no page' }
    const hist = (await T.madeBy(page.path)).filter((r) => r.path === page.path)
    const row = arg === 'made' ? (hist.filter((r) => r.how === 'created').at(-1) ?? hist.at(-1)) : hist[0]
    if (!row) return { ok: false, why: `the record has no row for ${page.path}` }
    const v = whoVerdict(row, answer)
    return { ok: v.ok, why: `the record says ${page.path} was ${arg === 'made' ? 'made' : 'last changed'} by ${v.who}; ${v.ok ? 'the answer says so' : `the answer does not (${v.miss})`}` }
  }
  if (kind === 'says') {
    const ok = new RegExp(arg, 'i').test(answer)
    return { ok, why: ok ? `the answer matches /${arg}/` : `the answer does not match /${arg}/` }
  }
  if (kind === 'opens') {
    // opens:<regex>: the reply's first 300 characters match: what a person on a phone reads first
    // (OLA-232 checker, Nov 21: the birdsong note came fourth, after a loudness note and check talk).
    const head = String(answer).trim().slice(0, 300)
    const ok = new RegExp(arg, 'i').test(head)
    return { ok, why: ok ? `the reply opens with /${arg}/` : `the reply's first 300 characters do not match /${arg}/ ("${head.slice(0, 120)}")` }
  }
  if (kind === 'nonewfile') {
    // nonewfile:<regex>: the request made no file matching (Ola was to ask first, not do it).
    const re = new RegExp(arg, 'i')
    const made = (await T.listFiles()).filter((f) => re.test(f) && !before.includes(f))
    return { ok: !made.length, why: made.length ? `made ${made.join(', ').slice(0, 160)} without being told to` : `no new file matching /${arg}/` }
  }
  if (kind === 'file') {
    const [rel, ...w] = arg.split(':')
    const words = w.join(':')
    const text = await T.readFile(rel)
    if (text === null) return { ok: false, why: `${rel} is not in the project` }
    const ok = !words || text.toLowerCase().includes(words.toLowerCase())
    return { ok, why: ok ? `${rel} is there${words ? ` with "${words}"` : ''}` : `${rel} is there without "${words}"` }
  }
  if (kind === 'noran') {
    // noran:<regex>: no step of this request matches (OLA-244: asked only to change a published page,
    // Ola ran ola-publish too; the runner says yes to every question, so the step is what shows it).
    const re = new RegExp(arg, 'i')
    const hit = lastSteps.find((x) => re.test(x))
    return { ok: !hit, why: hit ? `a step ran ${hit.slice(0, 120)} without being asked to` : `no step matches /${arg}/ (${lastSteps.length} steps of this request)` }
  }
  if (kind === 'ran') {
    const re = new RegExp(arg, 'i')
    const hit = steps.find((x) => re.test(x))
    return { ok: !!hit, why: hit ? `a step ran ${hit.slice(0, 120)}` : `no step matches /${arg}/ (${steps.length} steps)` }
  }
  if (kind === 'newfile') {
    // newfile:<regex of the name>[:<words>]: a file the request made (not there before), matching.
    const [pat, ...w] = arg.split(':')
    const words = w.join(':')
    const re = new RegExp(pat, 'i')
    const made = (await T.listFiles()).filter((f) => re.test(f) && !before.includes(f))
    if (!made.length) return { ok: false, why: `no new file matching /${pat}/` }
    if (!words) return { ok: true, why: `made ${made.join(', ').slice(0, 160)}` }
    for (const f of made) {
      const text = await T.readFile(f)
      if (text && text.toLowerCase().includes(words.toLowerCase())) return { ok: true, why: `made ${f} with "${words}"` }
    }
    return { ok: false, why: `made ${made.join(', ').slice(0, 160)}, none with "${words}"` }
  }
  return { ok: false, why: `unknown outcome kind "${kind}"` }
}

/**
 * Which names served this case's requests, from the model connection itself (GET /v1/served with the
 * front desk's usage token), never from what Ola says. A cloud project's requests are counted by
 * conversation; the Mac's by the made-up person's caller since the case began (its door does not pass
 * the conversation id on).
 */
async function servedNames(T, sessions, since) {
  let env
  try {
    env = liveEnv()
  } catch {
    return null
  }
  const token = env.OLA_FD_GATEWAY_USAGE_TOKEN
  const base = (env.OLA_FD_GATEWAY_URL || `http://127.0.0.1:${env.OLA_GATEWAY_PORT || 4180}`).replace(/\/+$/, '')
  if (!token) return null
  let callers
  if (T.runtime === 'cloud') callers = sessions.map((s) => ({ caller: `ws-${PROJECT}`, session: s }))
  else {
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(path.join(env.OLA_FD_DATA || path.join(homedir(), '.ola-frontdesk'), 'platform.db'), { readOnly: true })
    const p = db.prepare('SELECT id FROM people WHERE handle = ?').get(WHO)
    db.close()
    if (!p) return null
    callers = [{ caller: `p-${p.id}`, session: null }]
  }
  const out = {}
  for (const c of callers) {
    const q = new URLSearchParams({ caller: c.caller, since: String(since), ...(c.session ? { session: c.session } : {}) })
    const r = await fetch(`${base}/v1/served?${q}`, { headers: { authorization: `Bearer ${token}` } }).catch(() => null)
    if (!r?.ok) return null
    for (const [k, v] of Object.entries((await r.json()).names ?? {})) out[k] = (out[k] ?? 0) + v
  }
  return out
}

export function checkNever(c, answer, { done = false } = {}) {
  const hits = []
  for (const n of NEVER) if (n.re.test(answer) && !(n.soft && done) && !(c.notOffered && CANNOT.has(n.label))) hits.push(n.label)
  for (const s of c.mustNot ?? []) if (new RegExp(s, 'i').test(answer)) hits.push(`says /${s}/`)
  return hits
}

/** The ratchet and the record (run.mjs): the new asks-latest table from the old one and this run's
 *  results. Each case@place keeps its newest result; one that passed before and fails now is STOPPED
 *  WORKING; a result of two passes with a fail between is "works sometimes", apart from "passing". */
export function ratchet(table, results, { now, release, known, lastRun }) {
  table = { cases: {}, ...(table ?? {}) }
  table.cases ??= {}
  // A stored fail whose reason is the model refusing (allowance used up, provider credits) was written
  // before run.mjs learned to skip those (OLA-232, Nov 21: 22 of 106 lines of the abilities list showed
  // "failing" on 44ec5d68e931 tries that never reached Ola). It is not a result: it becomes not run,
  // with what it had passed before kept.
  for (const [k, was] of Object.entries(table.cases)) {
    if (was.status !== 'STOPPED WORKING' && was.status !== 'not working yet') continue
    const refused = modelUsedUp({ why: was.why })
    if (refused) table.cases[k] = { ...was, status: 'not run', verdict: null, tries: null, why: `not counted: ${refused} on ${was.release ?? 'an earlier release'}` }
  }
  for (const r of results) {
    const key = `${r.id}@${r.place}`
    const was = table.cases[key] ?? {}
    const at = r.at ?? now // OLA-401: when this result was decided; the record is written after every case
    // A fail whose reason is the model refusing (the allowance, the provider's credits) did not run, by
    // whatever path it came (OLA-323): never STOPPED WORKING, never not working yet, never a pass.
    const refused = r.ok === false && modelUsedUp(r)
    if (refused) Object.assign(r, { ok: null, didNotRun: true, why: `did not run: ${refused}` })
    if (r.ok === null && r.didNotRun) {
      // It was tried but never reached Ola (OLA-231 check 7): what it had stands, and the record says so.
      table.cases[key] = { ...was, id: r.id, place: r.place, say: r.say, ticket: r.ticket, status: was.status ?? 'not run', everPassed: !!was.everPassed, didNotRun: { at, release: r.release, why: r.why } }
      r.status = 'did not run'
      continue
    }
    if (r.ok === null) {
      // Not run: keeps what it had, if it ever ran; otherwise listed as not run.
      table.cases[key] = { ...was, id: r.id, place: r.place, say: r.say, ticket: r.ticket, status: was.status && was.status !== 'not run' ? was.status : 'not run', why: was.why ?? r.why, everPassed: !!was.everPassed }
      r.status = 'not run'
      continue
    }
    const ever = !!was.everPassed || r.ok
    r.status = r.ok ? (r.sometimes ? 'works sometimes' : 'passing') : was.everPassed ? 'STOPPED WORKING' : 'not working yet'
    r.everPassed = ever
    table.cases[key] = {
      id: r.id,
      place: r.place,
      say: r.say,
      ticket: r.ticket,
      status: r.status,
      tries: r.tries,
      verdict: r.verdict,
      why: r.why,
      at,
      release: r.release,
      everPassed: ever,
      firstPassed: was.firstPassed ?? (r.ok ? { at, release: r.release } : null),
      lastPassed: r.ok ? { at, release: r.release } : was.lastPassed ?? null,
      didNotRun: null,
    }
  }
  // Cases no longer in the set leave the table.
  for (const k of Object.keys(table.cases)) if (!known.has(k)) delete table.cases[k]
  const all = Object.values(table.cases)
  const count = (s) => all.filter((x) => x.status === s).length
  return {
    updated: now,
    release,
    lastRun,
    summary: { passing: count('passing'), worksSometimes: count('works sometimes'), stoppedWorking: count('STOPPED WORKING'), notWorkingYet: count('not working yet'), notRun: count('not run') },
    cases: table.cases,
  }
}

/** The verdict of a case at a place from its tries (OLA-251). The runner tries until two passes or two
 *  fails, as before; only the words changed: "works" is two passes in a row. Two passes with a fail
 *  among three tries is "works sometimes (2 of 3)", never reported as works. */
//  Since OLA-231 (Nov 20) the passes needed are set per case (passesNeeded): a request that failed for a
//  person needs five, the rest two, and the verdict prints the count ("works (5 of 5)").
export function verdictOf(tries, need = 2) {
  const passes = tries.filter((t) => t.ok).length
  if (passes >= need && passes === tries.length) return { ok: true, status: 'passing', verdict: `works (${passes} of ${passes})` }
  if (passes >= need) return { ok: true, status: 'works sometimes', verdict: `works sometimes (${passes} of ${tries.length})` }
  return { ok: false, status: null, verdict: `fails (${passes} of ${tries.length})` }
}
/** The runner tries a case at a place until it has the passes it needs or two fails. */
export const triesDone = (tries, need = 2) => tries.filter((t) => t.ok).length >= need || tries.filter((t) => !t.ok).length >= 2
/** Passes needed before a case shows as working (OLA-231): five when the request once failed for a
 *  person (the case says so with "passes": 5; add-case.mjs writes it), two otherwise. A checker tried
 *  the publish sentence 19 times and it failed about one in five: two in a row pass that 2 times in 3. */
export const passesNeeded = (c) => Math.max(2, Number(c.passes) || 2)

/** A try that could not reach Ola (a connection refused, reset or dropped) says nothing about Ola: it
 *  is reported as "did not run" and tried again, never counted as a pass or a fail (OLA-231 check 7,
 *  OLA-270). A connection refused or reset in the middle of a try is the network's or the test's own. */
const LOST = /\b(fetch failed|ECONNRESET|ECONNREFUSED|EPIPE|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|UND_ERR_SOCKET|UND_ERR_CONNECT_TIMEOUT|other side closed|socket hang up)\b/
export function lostConnection(e) {
  const code = e?.cause?.code ?? e?.code ?? ''
  return LOST.test(String(code)) || LOST.test(String(e?.message ?? ''))
}

/** A try refused because the account's model allowance is used up says nothing about Ola either: on
 *  Nov 20 (release 44ec5d68e931) all 34 Mac tries failed in 2 s each with provider.quota, and each was
 *  counted as Ola failing. Returns the reason ("the model allowance is used up; It starts again on …")
 *  or null. The place's remaining cases are then "did not run", and their earlier results stand. */
//  The model provider's own refusal for money (Together, Nov 21, 9 am to 3:39 pm: 402 "Credit limit
//  exceeded, please add credits" on every request, OLA-346) is the same kind: nothing about Ola.
const QUOTA = /provider\.quota|allowance of Ola's model is used up/i
const CREDITS = /Credit limit exceeded|please add credits/i
export function modelUsedUp(r) {
  const why = String(r?.why ?? r?.message ?? '')
  if (CREDITS.test(why)) return "the model provider's credits had run out"
  if (!QUOTA.test(why)) return null
  const when = why.match(/It starts again on ([^."\\]+)/)
  return `the made-up account's model allowance is used up${when ? ` (it starts again on ${when[1].trim()})` : ''}`
}

/** The website no longer takes the run's sign-in (401): someone signed the made-up account out. Not a
 *  result about Ola (OLA-401): the try did not run, and the runner signs in again. */
export function signedOut(e) {
  return /: 401\b/.test(String(e?.message ?? e ?? ''))
}

/**
 * OLA-401: a run is stopped when a newer update serves, so a run may not reach every case. The cases
 * whose newest result is oldest go first (never run first; ties keep the file's order), so runs that
 * are cut short still refresh every case in turn instead of the first ones over and over.
 */
export function stalestFirst(cases, table, place) {
  const age = (c) => {
    const at = table?.cases?.[`${c.id}@${place}`]?.at
    const t = at ? Date.parse(at) : NaN
    return Number.isFinite(t) ? t : -Infinity
  }
  return cases.map((c, i) => [c, age(c), i]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(([c]) => c)
}
/** The runtimes, the one whose oldest result is oldest first (a runtime never run first). */
export function stalestRuntime(runtimes, cases, table) {
  const oldest = (rt) => {
    const place = Object.keys(PLACES_REACHED).find((p) => PLACES_REACHED[p] === rt)
    const mine = cases.filter((c) => placesOf(c).includes(place))
    if (!mine.length) return Infinity
    const first = stalestFirst(mine, table, place)[0]
    const at = table?.cases?.[`${first.id}@${place}`]?.at
    const t = at ? Date.parse(at) : NaN
    return Number.isFinite(t) ? t : -Infinity
  }
  return runtimes.map((r, i) => [r, oldest(r), i]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(([r]) => r)
}

// ---------------------------------------------------------------- the record (OLA-401)
// asks-latest.json is written after every case and place, not once at the end: a run that is stopped
// (a newer update serves, its time limit, a signal), breaks, or is killed outright still leaves what it
// ran, and the file says what became of the run: `lastRun.state` running | finished | stopped | broke |
// died, `note` in one sentence, and `runs`, the last runs with their state (a run left to a newer one
// included). A run whose process is gone while its record still says running is shown as died.
const alivePid = (pid) => {
  if (!(pid > 0)) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e.code === 'EPERM'
  }
}
function readTable(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return { cases: {} }
  }
}
function writeAtomic(file, data) {
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n')
  renameSync(tmp, file)
}
const clock = (iso) => (iso ? `${String(iso).slice(0, 16).replace('T', ' ')} UTC` : 'an unknown time')
/** One sentence on what became of a run, for the board and for whoever reads the file. */
export function runNote(run) {
  const n = Number(String(run.done ?? '').split(' ')[0]) || 0
  const ran = n ? `; ${run.done} case-places had run (their results are in, the rest keep their earlier result)` : '; no case had run yet (every case keeps its earlier result)'
  if (run.state === 'running') return `The run for release ${run.release} is going (started ${clock(run.startedAt)})${ran}.`
  if (run.state === 'finished') return `The run for release ${run.release} finished at ${clock(run.endedAt)}: ${run.done} case-places had run.`
  if (run.state === 'stopped') return `The run for release ${run.release} was stopped at ${clock(run.endedAt)} (${run.why})${ran}.`
  if (run.state === 'broke') return `The run for release ${run.release} broke at ${clock(run.endedAt)} (${run.why})${ran}.`
  if (run.state === 'died') return `The run for release ${run.release} (pid ${run.pid}) ended without finishing; last written ${clock(run.updatedAt)}${ran}.`
  return `The run for release ${run.release} did not run: ${run.why}.`
}
function mergeRuns(table, run, now) {
  const runs = (Array.isArray(table.runs) ? table.runs : []).filter((r) => r && r.id !== run?.id)
  for (const r of runs) if (r.state === 'running' && r.pid !== process.pid && !alivePid(r.pid)) Object.assign(r, { state: 'died', why: 'its process ended without finishing (killed, or the machine restarted)', endedAt: r.updatedAt ?? null })
  if (run) runs.push({ ...run, updatedAt: now })
  return runs.slice(-12)
}
/**
 * Writes the run's results so far into the record: the file as it is now, the ratchet applied to
 * `results` (the same result applied twice gives the same row), `lastRun` and `note` for this run, and
 * the run in `runs`. `run`: { id, pid, release, afterDeploy, startedAt, state, why?, done, cases, runtimes }.
 */
export function writeRecord(file, { results, known, run, now = new Date().toISOString() }) {
  const was = readTable(file)
  const t = ratchet(was, results, { now, release: run.release, known, lastRun: { at: now, release: run.release, secs: Math.round((Date.parse(now) - Date.parse(run.startedAt)) / 1000), afterDeploy: run.afterDeploy, cases: run.cases, runtimes: run.runtimes, state: run.state, ...(run.why ? { why: run.why } : {}), done: run.done, pid: run.pid, startedAt: run.startedAt } })
  const full = { ...t, note: runNote({ ...run, updatedAt: now, endedAt: run.state === 'running' ? null : now }), runs: mergeRuns(was, { ...run, ...(run.state === 'running' ? {} : { endedAt: now }) }, now) }
  writeAtomic(file, full)
  return full
}
/** A run that ran nothing (left to a newer update's run): only `runs` gets a line; the results, `lastRun`
 *  and `note` stay those of the last run that ran. */
export function noteRun(file, run, now = new Date().toISOString()) {
  const was = readTable(file)
  if (!was.cases) was.cases = {}
  writeAtomic(file, { ...was, runs: mergeRuns(was, { ...run, endedAt: now }, now) })
}

/**
 * OLA-401: what stops a run that is going. Every everyMs it reads what is live; when the live release is
 * no longer the run's (a newer update serves) or the run has gone on for maxMs, it calls onStop(why) once.
 * Returns a function that ends the watch.
 */
export function releaseWatch({ release, read = () => liveRelease(), everyMs = 20_000, maxMs = 6 * 3600_000, onStop, t0 = Date.now() }) {
  let done = false
  const tick = () => {
    if (done) return
    const now = read()
    if (now !== 'unknown' && release !== 'unknown' && now !== release) {
      done = true
      return onStop(`the test server moved from ${release} to ${now}; a run for ${now} replaces this one`)
    }
    if (Date.now() - t0 > maxMs) {
      done = true
      return onStop(`its time limit of ${Math.round(maxMs / 60_000)} min (OLA_ASKS_MAX_MIN) was reached`)
    }
  }
  const timer = setInterval(tick, everyMs)
  timer.unref?.()
  return () => {
    done = true
    clearInterval(timer)
  }
}

/**
 * OLA-401: stops the run in an orderly way, once: writes the record first (so a stop that hangs or is
 * killed still leaves it), then cleans up (capped at capMs), then exits with `code`. SIGTERM and SIGINT
 * stop the run the same way; a newer update's run says why in `<state>/stop-request.json`.
 */
export function makeStopper({ write, cleanup, exit = (c) => process.exit(c), log = say, capMs = 120_000, state = STATE, signals = true }) {
  let stopping = null
  const stop = (why, code = 3) => {
    if (stopping) return stopping
    log(`asks: STOPPING: ${why}`)
    stopping = (async () => {
      try {
        write(why)
      } catch (e) {
        log(`asks: writing the record while stopping FAILED: ${e.message}`)
      }
      try {
        await Promise.race([Promise.resolve().then(cleanup), sleep(capMs).then(() => log(`asks: cleanup took over ${Math.round(capMs / 1000)} s; leaving it`))])
      } catch (e) {
        log(`asks: cleanup while stopping FAILED: ${e.message}`)
      }
      exit(code)
    })()
    return stopping
  }
  if (signals)
    for (const sig of ['SIGTERM', 'SIGINT'])
      process.on(sig, () => {
        let why = `it was sent ${sig}`
        try {
          const q = JSON.parse(readFileSync(path.join(state, 'stop-request.json'), 'utf8'))
          if (q.target === process.pid && q.why) why = `${q.why} (${sig})`
        } catch {}
        stop(why)
      })
  return { stop, stopping: () => stopping }
}

/** One asks run at a time (they share the made-up account). OLA-401: the run an update starts
 *  (after: true) STOPS a run that is going for another release (or one that does not say: a run of the
 *  code before OLA-401): it asks it to stop (stop-request.json, SIGTERM), so that run writes its record,
 *  signs the account out and gives the turn back; after stopWaitMs it is killed. A run going for this
 *  same release is waited for, as before (OLA-231 check 5), up to maxMs. Only a newer update's run
 *  replaces a waiting one. A builder's run (after: false) leaves it to a run that is going or an update's
 *  run that is waiting. Returns true when this process holds the lock; `<state>/run.json` then says
 *  which release it runs for. */
export async function takeRunLock({ after, state = STATE, release = liveRelease(), pollMs = 15_000, maxMs = 4 * 3600_000, stopWaitMs = 180_000, log = say } = {}) {
  mkdirSync(state, { recursive: true })
  const LOCK = path.join(state, 'run.pid')
  const INFO = path.join(state, 'run.json')
  const WAITER = path.join(state, 'after-deploy.waiting')
  const pidIn = (f) => {
    try {
      return Number(readFileSync(f, 'utf8'))
    } catch {
      return 0
    }
  }
  const alive = (pid) => !!pid && pid !== process.pid && alivePid(pid)
  const drop = (f) => () => {
    try {
      if (pidIn(f) === process.pid) rmSync(f)
    } catch {}
  }
  const infoOf = (pid) => {
    try {
      const j = JSON.parse(readFileSync(INFO, 'utf8'))
      return j.pid === pid ? j : null
    } catch {
      return null
    }
  }
  if (after) {
    writeFileSync(WAITER, String(process.pid))
    process.on('exit', drop(WAITER))
    const since = Date.now()
    let told = false
    let asked = null // { pid, at, killed }
    while (alive(pidIn(LOCK))) {
      const other = pidIn(LOCK)
      if (pidIn(WAITER) !== process.pid) {
        log(`asks: a newer update's run (pid ${pidIn(WAITER)}) is waiting to test the newer release; this one leaves it to that run`)
        return false
      }
      const info = infoOf(other)
      if (info && info.release === release) {
        if (!told) log(`asks: another run for this same release ${release} is going (pid ${other}); this one waits its turn and runs after it`), (told = true)
        if (Date.now() - since > maxMs) throw new Error(`asks: the run holding the lock (pid ${other}) has gone on for ${Math.round(maxMs / 60_000)} min; this update's run stops waiting (a stuck run: look at it)`)
      } else if (!asked || asked.pid !== other) {
        const why = `a newer update's run (pid ${process.pid}, release ${release}) replaces it`
        writeFileSync(path.join(state, 'stop-request.json'), JSON.stringify({ target: other, by: process.pid, release, at: new Date().toISOString(), why }) + '\n')
        try {
          process.kill(other, 'SIGTERM')
        } catch {}
        asked = { pid: other, at: Date.now(), killed: false }
        log(`asks: a run for ${info ? `release ${info.release}` : 'an older release (it does not say which)'} is going (pid ${other}); this run for ${release} asked it to stop`)
      } else if (!asked.killed && Date.now() - asked.at > stopWaitMs) {
        try {
          process.kill(other, 'SIGKILL')
        } catch {}
        asked.killed = true
        log(`asks: the run (pid ${other}) had not stopped ${Math.round(stopWaitMs / 1000)} s after it was asked; it was killed`)
      }
      await sleep(asked ? Math.min(pollMs, 2000) : pollMs)
    }
    if (asked) log(`asks: the older run (pid ${asked.pid}) ended after ${Math.round((Date.now() - asked.at) / 1000)} s; this one runs now`)
    else if (told) log(`asks: the other run finished after ${Math.round((Date.now() - since) / 60_000)} min; this one runs now`)
  } else {
    const other = alive(pidIn(LOCK)) ? pidIn(LOCK) : alive(pidIn(WAITER)) ? pidIn(WAITER) : 0
    if (other) {
      log(`asks: ${other === pidIn(LOCK) ? 'another run is going' : "an update's run is waiting for its turn"} (pid ${other}); this one leaves it to that run`)
      return false
    }
  }
  writeFileSync(LOCK, String(process.pid))
  process.on('exit', drop(LOCK))
  writeFileSync(INFO, JSON.stringify({ pid: process.pid, release, after: !!after, at: new Date().toISOString() }) + '\n')
  process.on('exit', () => {
    if (infoOf(process.pid)) rmSync(INFO, { force: true })
  })
  // Only the real lock lets this process change the live made-up account (mustHoldRun).
  if (path.resolve(state) === path.resolve(STATE)) runHeld = true
  return true
}

export function readCases(file = path.join(HERE, 'cases.json')) {
  return JSON.parse(readFileSync(file, 'utf8')).cases
}

// Places as the tracker names them (scripts/venture/issues.mjs PLACES x WAYS).
export const PLACES = ['cloud-web', 'cloud-mac', 'cloud-phone', 'local-mac', 'local-phone'].flatMap((p) => [`${p}:chat`, `${p}:screen`])
// What this runner reaches, headlessly, and how.
export const PLACES_REACHED = { 'cloud-web:chat': 'cloud', 'local-mac:chat': 'local' }
// A runtime, as add-case's --runtime says it: every chat place of it.
export const RUNTIME_PLACES = { cloud: ['cloud-web:chat', 'cloud-mac:chat', 'cloud-phone:chat'], local: ['local-mac:chat', 'local-phone:chat'] }
export const placesOf = (c) => c.places ?? (c.runtimes ?? []).flatMap((r) => RUNTIME_PLACES[r] ?? [])
