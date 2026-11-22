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
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
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
/** Runs one of the live release's tools (frontdesk/admin.mjs, workspace/ws.mjs). Output returned, never printed. */
export function live(tool, args, { ok = false } = {}) {
  if (!existsSync(LIVE)) throw new Error(`the live server's release is not on this machine (${LIVE}): run the asks on the test server`)
  const r = spawnSync(process.execPath, [path.join(LIVE, tool), ...args], { cwd: LIVE, env: liveEnv(), encoding: 'utf8', timeout: 600_000 })
  if (r.status !== 0 && !ok) throw new Error(`${tool} ${args[0]}: ${(r.stderr || r.stdout || '').trim().split('\n').pop()}`)
  return (r.stdout || '').trim()
}
export const admin = (...a) => live('frontdesk/admin.mjs', a)

/** The person and project exist, the project is empty, and the person has a fresh password (returned). */
export async function prepareAccount() {
  const listed = admin('list')
  if (!new RegExp(`^person ${WHO} `, 'm').test(listed)) admin('add-person', WHO, '--name', WHO_NAME)
  if (new RegExp(`^person ${WHO} .*\\bsuspended`, 'm').test(listed)) throw new Error(`${WHO} is suspended on the live server; nothing here lifts that`)
  if (new RegExp(`^person ${WHO} .*\\badmin`, 'm').test(listed)) throw new Error(`${WHO} is an admin; the asks run as an ordinary person`)
  if (!new RegExp(`^workspace ${PROJECT} `, 'm').test(listed)) {
    admin('create-workspace', PROJECT, '--name', 'Made-up asks', '--team', TEAM, '--team-name', 'Made-up Asks', '--owner', WHO, '--memory', '2g', '--disk', '2g', '--cpus', '2')
  }
  const link = admin('reset-password', WHO, '--hours', '1').split(/\s+/).find((w) => w.includes('/#/reset/'))
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
export function takeDownSites() {
  const done = []
  // `admin sites` lines: "<name> project <url> …", "<name> mac site of <handle> <url> …",
  // "<name> held by <handle> nothing up".
  for (const line of admin('sites').split('\n').map((l) => l.trim())) {
    const name = line.split(/\s+/)[0]
    if (name === PROJECT && /^\S+\s+project\s/.test(line)) {
      admin('unpublish', PROJECT)
      done.push(`${SITES}/${PROJECT}/ taken down`)
    } else if (line.includes(` mac site of ${WHO} `)) {
      admin('unpublish', name)
      admin('site-release', name, '--free')
      done.push(`${SITES}/${name}/ taken down, the name given up`)
    } else if (line.includes(` held by ${WHO} `) && line.includes('nothing up')) {
      admin('site-release', name, '--free')
      done.push(`${name}: the name given up`)
    }
  }
  return done
}

/** Signs the person out everywhere (sessions and Macs) and stops the project's computer. */
export function signOutAccount() {
  const said = admin('revoke-sessions', WHO)
  // It would stop itself after 30 idle minutes.
  live('workspace/ws.mjs', ['stop', PROJECT], { ok: true })
  return `${said}; the project's computer stopped`
}

/** Empties the project's folder (its database and Ola's own record stay), so a case starts from nothing. */
export function emptyProject() {
  live('workspace/ws.mjs', ['start', PROJECT], { ok: true })
  const r = spawnSync('/usr/local/bin/container', ['exec', `ola-${PROJECT}`, 'sh', '-c', 'find /work -mindepth 1 -maxdepth 1 ! -name project.db ! -name project.db-wal ! -name project.db-shm ! -name .ola -exec rm -rf {} +'], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`emptying the project: ${(r.stderr || '').trim().slice(0, 200)}`)
}

/** Runs a shell line inside the project's computer (a case's setup). */
export function inProject(script) {
  const r = spawnSync('/usr/local/bin/container', ['exec', `ola-${PROJECT}`, 'sh', '-c', script], { encoding: 'utf8' })
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
export function cloudTransport({ cookie, csrf }) {
  return {
    runtime: 'cloud',
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
    wrote(rel, { text, base64 }) {
      const b64 = base64 ?? Buffer.from(text).toString('base64')
      const safe = rel.replace(/[^A-Za-z0-9._/-]/g, '')
      inProject(`mkdir -p "$(dirname '/work/${safe}')" && echo ${b64} | base64 -d > '/work/${safe}'`)
    },
    claudeWrote(rel, text) {
      // Recorded the way the server records a Claude run (frontdesk/claude.mjs + madeby.mjs: begin,
      // the file written, end), without running Claude: what the case tests is Ola's answer.
      const turn = `asks-${randomBytes(4).toString('hex')}`
      const b64 = Buffer.from(text).toString('base64')
      inProject(`ola-db made-by begin --turn ${turn} --engine claude --model claude-opus-5-5 && echo ${b64} | base64 -d > '/work/${rel.replace(/'/g, '')}' && ola-db made-by end --turn ${turn} --model claude-opus-5-5`)
    },
    // The project's record of who made its files (ola-db made-by --json), read in the VM (OLA-303).
    madeBy(rel = null) {
      return JSON.parse(inProject(`ola-db made-by --json --limit 50${rel ? ` '/work/${rel.replace(/'/g, '')}'` : ''}`) || '[]')
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
    const b = spawnSync('/usr/bin/swift', ['build', '--product', 'olakit-selftest', '--scratch-path', scratch], { cwd: kit, encoding: 'utf8', timeout: 900_000 })
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
  return {
    runtime: 'local',
    skills,
    folder,
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
  const sent = await T.call('POST', `/api/session/${sid}/prompt`, { text })
  if (sent.status >= 300) throw new Error(`the request was not taken: ${sent.status} ${sent.text.slice(0, 200)}`)
  const answered = []
  const end = Date.now() + limitMs
  while (Date.now() < end) {
    await sleep(1500)
    for (const q of list((await T.call('GET', `/api/session/${sid}/permission`)).json)) {
      if (!q?.id) continue
      const r = await T.call('POST', `/api/session/${sid}/permission/${q.id}/reply`, { decision: 'once' })
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
    if (turns.length > before && t && t.status !== 'working') return { ...t, answered }
  }
  await T.call('POST', `/api/session/${sid}/interrupt`, {}).catch(() => {})
  const turns = (await messagesOf(T, sid))
  return { ...(turns[turns.length - 1] ?? { texts: [], tools: [] }), status: 'timeout', answered }
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

/** The https://sites.ola.cx/<name>/ addresses in a text. */
export const siteAddresses = (text) => [...new Set([...String(text).matchAll(/https:\/\/sites\.ola\.cx\/[a-z0-9][a-z0-9-]{0,62}\/?/gi)].map((m) => m[0].replace(/\/?$/, '/')))]
/**
 * Every sites.ola.cx link in a text, whole, as a person would copy it (OLA-267, Nov 21: Ola's answer
 * gave "https://sites.ola.cx/chk1121da-test/sites.ola.cx"; siteAddresses saw only its first part, the
 * right address, and the check passed). Sentence punctuation after a link is not part of it.
 */
export const siteLinks = (text) => [...new Set([...String(text).matchAll(/(?:https?:\/\/)?sites\.ola\.cx(?:\/[^\s<>"'`()[\]]*)?/gi)].map((m) => m[0].replace(/[.,;:!?]+$/, '')))]

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
 *   served:<name>        the model connection's own record says <name> served at least one of this
 *                        case's requests (design, general); served:!<name>: none of them (OLA-168)
 *   record:made|last     the answer names whoever the project's own record says made (or last
 *                        changed) the newest page (OLA-303); the design model as an outside model
 */
export async function checkMust(must, T, answer, { steps = [], before = [], earlier = '', wait = 60_000, since = 0, sessions = [], rereads = 3, rereadMs = 4000, reader = readAsReaderLazy, fetchFirst = fetchText } = {}) {
  const [kind, ...rest] = must.split(':')
  const arg = rest.join(':')
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
    if (r.ok === null && r.didNotRun) {
      // It was tried but never reached Ola (OLA-231 check 7): what it had stands, and the record says so.
      table.cases[key] = { ...was, id: r.id, place: r.place, say: r.say, ticket: r.ticket, status: was.status ?? 'not run', everPassed: !!was.everPassed, didNotRun: { at: now, release: r.release, why: r.why } }
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
      at: now,
      release: r.release,
      everPassed: ever,
      firstPassed: was.firstPassed ?? (r.ok ? { at: now, release: r.release } : null),
      lastPassed: r.ok ? { at: now, release: r.release } : was.lastPassed ?? null,
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

/** One asks run at a time (they share the made-up account). The run an update starts (after: true)
 *  WAITS for a run that is going and then runs, so every update is tested (OLA-231 check 5); only a
 *  newer update's run replaces a waiting one. A builder's run (after: false) leaves it to a run that is
 *  going or an update's run that is waiting. Returns true when this process holds the lock. */
export async function takeRunLock({ after, state = STATE, pollMs = 15_000, maxMs = 4 * 3600_000, log = say } = {}) {
  mkdirSync(state, { recursive: true })
  const LOCK = path.join(state, 'run.pid')
  const WAITER = path.join(state, 'after-deploy.waiting')
  const pidIn = (f) => {
    try {
      return Number(readFileSync(f, 'utf8'))
    } catch {
      return 0
    }
  }
  const alive = (pid) => {
    try {
      return !!pid && pid !== process.pid && (process.kill(pid, 0), true)
    } catch {
      return false
    }
  }
  const drop = (f) => () => {
    try {
      if (pidIn(f) === process.pid) rmSync(f)
    } catch {}
  }
  if (after) {
    writeFileSync(WAITER, String(process.pid))
    process.on('exit', drop(WAITER))
    const since = Date.now()
    let told = false
    while (alive(pidIn(LOCK))) {
      if (pidIn(WAITER) !== process.pid) {
        log(`asks: a newer update's run (pid ${pidIn(WAITER)}) is waiting to test the newer release; this one leaves it to that run`)
        return false
      }
      if (!told) log(`asks: another run is going (pid ${pidIn(LOCK)}); this one waits its turn and runs after it`), (told = true)
      if (Date.now() - since > maxMs) throw new Error(`asks: the run holding the lock (pid ${pidIn(LOCK)}) has gone on for ${Math.round(maxMs / 60_000)} min; this update's run stops waiting (a stuck run: look at it)`)
      await sleep(pollMs)
    }
    if (told) log(`asks: the other run finished after ${Math.round((Date.now() - since) / 60_000)} min; this one runs now`)
  } else {
    const other = alive(pidIn(LOCK)) ? pidIn(LOCK) : alive(pidIn(WAITER)) ? pidIn(WAITER) : 0
    if (other) {
      log(`asks: ${other === pidIn(LOCK) ? 'another run is going' : "an update's run is waiting for its turn"} (pid ${other}); this one leaves it to that run`)
      return false
    }
  }
  writeFileSync(LOCK, String(process.pid))
  process.on('exit', drop(LOCK))
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
