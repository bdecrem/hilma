// Only Ola's models on Bart's opencode (OLA-249), the mini's copy of OlaKit/ModelGuard.swift.
// opencode 2.3.0 with no provider it can use turns on its own hosted provider and its free models
// ("big-pickle" first), needing no key, and answers with one as if nothing happened. run.sh gives
// opencode its settings in the environment and switches the free models off; this is the second
// line: it reads what opencode offers (GET /api/model and /api/model/default) and, when any model or
// the default is not provider `ola`, or there is no model at all, says so in one sentence and exits 3.
// run.sh then stops opencode, and launchd starts it again from the sealed settings.
//
//   OPENCODE_PASSWORD=… node model-guard.mjs <opencode-host:port> once [--wait <s>]   check one time (waits for opencode to answer)
//   OPENCODE_PASSWORD=… node model-guard.mjs <opencode-host:port> watch [--every <s>] check until something is wrong
// Exit 0: only Ola's models. 3: another model offered (or none). 4: opencode never answered (once).
// No dependencies.

import { realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const PROVIDER = 'ola'
export const STOPPED = "Ola stopped because its settings on the Ola machine are missing or damaged, so nothing was sent. It starts again by itself in a few seconds."

/** The same rule as ModelGuard.verdict: `{ ok: true }` or `{ ok: false, foreign: [names] }`. */
export function verdict(models, defaultModel) {
  if (!models.length && !defaultModel) return { ok: false, foreign: [] }
  const all = [...models, ...(defaultModel ? [defaultModel] : [])]
  const bad = [...new Set(all.filter((m) => m.providerID !== PROVIDER).map((m) => `${m.providerID}/${m.id}`))]
  return bad.length ? { ok: false, foreign: bad } : { ok: true }
}

async function ask(base, auth, path) {
  const r = await fetch(base + path, { headers: { Authorization: auth }, signal: AbortSignal.timeout(5000) })
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`)
  return (await r.json()).data
}

export async function check(base, password) {
  const auth = 'Basic ' + Buffer.from(`opencode:${password}`).toString('base64')
  const models = await ask(base, auth, '/api/model')
  const d = await ask(base, auth, '/api/model/default')
  return verdict(Array.isArray(models) ? models : [], d ?? null)
}

async function main() {
  const [upstream, mode, ...rest] = process.argv.slice(2)
  const password = process.env.OPENCODE_PASSWORD ?? ''
  const opt = (name, dflt) => { const i = rest.indexOf(name); return i >= 0 ? Number(rest[i + 1]) : dflt }
  if (!upstream || !['once', 'watch'].includes(mode) || !password) {
    console.error('usage: OPENCODE_PASSWORD=… node model-guard.mjs <opencode-host:port> once|watch [--wait s] [--every s]')
    process.exit(2)
  }
  const base = `http://${upstream}`
  const stop = (v) => {
    console.error(`${new Date().toISOString()} model-guard: ${STOPPED} (offered: ${v.foreign.length ? v.foreign.join(', ') : 'no model at all'})`)
    process.exit(3)
  }
  if (mode === 'once') {
    const until = Date.now() + opt('--wait', 30) * 1000
    for (;;) {
      try {
        const v = await check(base, password)
        if (!v.ok) stop(v)
        console.log(`${new Date().toISOString()} model-guard: only Ola's models`)
        process.exit(0)
      } catch (e) {
        if (Date.now() > until) { console.error(`model-guard: opencode did not answer (${e.message})`); process.exit(4) }
        await new Promise((r) => setTimeout(r, 500))
      }
    }
  }
  const every = opt('--every', 2) * 1000
  for (;;) {
    try {
      const v = await check(base, password)
      if (!v.ok) stop(v)
    } catch {
      // Not answering is not a model: run.sh notices a dead opencode by itself.
    }
    await new Promise((r) => setTimeout(r, every))
  }
}

// Run when started as a program (realpath: /tmp is a link to /private/tmp, and import.meta.url is resolved).
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main()
