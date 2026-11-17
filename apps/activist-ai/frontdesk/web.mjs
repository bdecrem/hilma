// The front desk's side of web search and downloads: the person's answer to "Ola wants to search
// the web for …" becomes a grant the gateway enforces (gateway/web.mjs), and a project's
// "Always in this project" is kept here, shown and reversible in its Settings, and audited.
//
//   - The agent runs `ola-search "…"` or `ola-fetch <address>`. opencode asks (the session's rules,
//     web/server/proxy.mjs permissionsFor), and the page shows the question in plain words.
//   - The person answers through POST /oc/api/session/<s>/permission/<r>/reply. The front desk
//     reads the request back from opencode, finds the web request(s) in it (web/server/webask.mjs),
//     and before passing the answer on:
//       Allow once              a one-time grant for that exact search or address (10 minutes)
//       Always in this project  the project's choice (web_access, audit web_allowed), a standing grant
//       Not now                 nothing; the answer goes on as a no
//     "Always" goes to opencode as "once": opencode's own "always" saves a durable rule in the
//     project that we could not take back from Settings; ours is the only one that lasts.
//   - The grants are written to one file for the gateway (OLA_FD_WEB_FILE, ~/.ola/gateway-web,
//     mode 600, by rename): { "ws-<id>": { "always": true } | { "once": [...] } }.
// Nothing here writes the search words or the address anywhere but that file, as a sha256, for at
// most 10 minutes. The audit log says that the project allowed or revoked the web, and who.
import { randomBytes, createHash } from 'node:crypto'
import { chmodSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { audit } from './db.mjs'
import { webRequests } from '../web/server/webask.mjs'

const ONCE_MS = 10 * 60_000
const itemHash = (kind, item) => createHash('sha256').update(`${kind}\0${item}`, 'utf8').digest('hex')

export function makeWeb({ db, file, providerName, log = () => {} }) {
  const once = new Map() // slug -> [{ id, kind, h, exp }]
  const alwaysOf = (workspaceId) => db.prepare('SELECT always FROM web_access WHERE workspace_id = ?').get(workspaceId)?.always === 1

  function write() {
    const out = {}
    for (const r of db.prepare("SELECT w.slug FROM web_access a JOIN workspaces w ON w.id = a.workspace_id WHERE a.always = 1 AND w.status = 'active'").all()) out[`ws-${r.slug}`] = { always: true }
    const now = Date.now()
    for (const [slug, list] of once) {
      const live = list.filter((o) => o.exp > now)
      if (!live.length) once.delete(slug)
      else if (!out[`ws-${slug}`]) out[`ws-${slug}`] = { once: live }
    }
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
    const tmp = `${file}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(out), { mode: 0o600 })
    chmodSync(tmp, 0o600)
    renameSync(tmp, file)
  }
  write()
  const sweeper = setInterval(() => [...once.values()].some((l) => l.some((o) => o.exp <= Date.now())) && write(), 60_000)
  sweeper.unref()

  function setAlways(ws, personId, on) {
    const was = alwaysOf(ws.id)
    if (was === on) return false
    db.prepare('INSERT INTO web_access (workspace_id, always, changed_at, changed_by) VALUES (?, ?, ?, ?) ON CONFLICT (workspace_id) DO UPDATE SET always = excluded.always, changed_at = excluded.changed_at, changed_by = excluded.changed_by').run(ws.id, on ? 1 : 0, Date.now(), personId)
    audit(db, { actor: personId, action: on ? 'web_allowed' : 'web_revoked', workspace: ws.id })
    if (!on) once.delete(ws.slug)
    write()
    return true
  }

  /** The project's web setting, as Settings shows it. */
  function settings(ws) {
    const row = db.prepare('SELECT a.always, a.changed_at, p.display_name FROM web_access a LEFT JOIN people p ON p.id = a.changed_by WHERE a.workspace_id = ?').get(ws.id)
    return { always: row?.always === 1, changedAt: row ? new Date(row.changed_at).toISOString() : null, changedBy: row?.display_name ?? null, provider: typeof providerName === 'function' ? providerName() : providerName }
  }

  /**
   * The person's answer to a permission request, before it goes to opencode. `ask(method, path, body)`
   * talks to the workspace's opencode. Returns the decision to pass on.
   */
  async function onReply(ws, personId, sessionID, requestID, decision, ask) {
    if (!['once', 'always', 'reject'].includes(decision)) return decision
    const list = await ask('GET', `/api/session/${sessionID}/permission`)
    // opencode answers a list, or { data: [...] } (the client unwraps either); its word, so only read.
    const all = Array.isArray(list.json) ? list.json : Array.isArray(list.json?.data) ? list.json.data : []
    const req = all.find((p) => p?.id === requestID) ?? null
    const items = req ? webRequests(req.action, req.resources) : []
    if (!items.length) return decision
    if (decision === 'reject') return 'reject'
    // The page shows one web question: the first command's words, or the "run code" sheet when the
    // request mixes a web command with another. So only a request that is exactly one web command
    // becomes a grant; anything else gets none (review 4, M1: a second search behind the first got
    // its own grant, and "for the rest of this conversation" on a "run code" sheet turned on
    // "Always in this project"). Its answer goes on as it was; the gateway refuses the web part.
    if (items.length !== 1 || (Array.isArray(req.resources) ? req.resources.length : 0) !== 1) {
      log(`${ws.slug}: a web approval inside a request of ${Array.isArray(req.resources) ? req.resources.length : 0} commands; no grant written`)
      return decision
    }
    if (decision === 'always') {
      setAlways(ws, personId, true)
      return 'once'
    }
    const exact = items.filter((x) => x.item)
    if (exact.length) {
      const l = (once.get(ws.slug) ?? []).filter((o) => o.exp > Date.now())
      for (const x of exact) l.push({ id: randomBytes(16).toString('hex'), kind: x.kind, h: itemHash(x.kind, x.item), exp: Date.now() + ONCE_MS })
      once.set(ws.slug, l.slice(-50))
      write()
    } else log(`${ws.slug}: a web approval for a command that is not in a simple form; no grant written`)
    return 'once'
  }

  const modeBySlug = (slug) => (db.prepare('SELECT a.always FROM web_access a JOIN workspaces w ON w.id = a.workspace_id WHERE w.slug = ?').get(slug)?.always === 1 ? 'always' : 'ask')
  return { onReply, settings, setAlways, modeBySlug, write, close: () => clearInterval(sweeper) }
}
