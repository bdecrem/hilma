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
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
      if (Date.now() > end || (method !== 'GET' && e.cause?.code !== 'ECONNREFUSED')) throw e
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
    async stop() {
      child.stdin.end()
      const t = Date.now() + 20_000
      while (child.exitCode === null && Date.now() < t) await sleep(200)
      if (child.exitCode === null) child.kill()
      return log.includes('stopped') ? 'stopped and signed out' : `ended (${log.trim().split('\n').pop()})`
    },
  }
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

async function fetchText(url) {
  try {
    const r = await fetch(url, { cache: 'no-store', redirect: 'follow' })
    return { status: r.status, text: await r.text() }
  } catch (e) {
    return { status: `error ${e.cause?.code ?? e.message}`, text: '' }
  }
}

/**
 * One outcome, checked. Kinds (cases.json "must"):
 *   site:<words>         Ola's answer gives an https://sites.ola.cx/<name>/ address, and that address
 *                        answers 200 with a page that says <words>
 *   says:<regex>         Ola's answer matches (case-insensitive)
 *   file:<path>[:<words>]  the file is in the project (and says <words>)
 */
export async function checkMust(must, T, answer, { steps = [], before = [] } = {}) {
  const [kind, ...rest] = must.split(':')
  const arg = rest.join(':')
  if (kind === 'site') {
    const addrs = siteAddresses(answer)
    if (!addrs.length) return { ok: false, why: 'no sites.ola.cx address in Ola’s answer' }
    const seen = []
    for (const a of addrs) {
      const r = await fetchText(a)
      const has = r.status === 200 && r.text.toLowerCase().includes(arg.toLowerCase())
      seen.push(`${a} ${r.status}${r.status === 200 ? (has ? ` with "${arg}"` : ` without "${arg}"`) : ''}`)
      if (has) return { ok: true, why: seen.join('; '), url: a }
    }
    return { ok: false, why: seen.join('; ') }
  }
  if (kind === 'says') {
    const ok = new RegExp(arg, 'i').test(answer)
    return { ok, why: ok ? `the answer matches /${arg}/` : `the answer does not match /${arg}/` }
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
  for (const r of results) {
    const key = `${r.id}@${r.place}`
    const was = table.cases[key] ?? {}
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
export function verdictOf(tries) {
  const passes = tries.filter((t) => t.ok).length
  if (passes >= 2 && tries.length === 2) return { ok: true, status: 'passing', verdict: 'works' }
  if (passes >= 2) return { ok: true, status: 'works sometimes', verdict: `works sometimes (${passes} of ${tries.length})` }
  return { ok: false, status: null, verdict: 'fails' }
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
