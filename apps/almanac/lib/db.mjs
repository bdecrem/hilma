// Read-only access to the corpus: every call runs in its own short-lived child process with a time limit.
import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { GAMI_DB, STATE_DB } from './config.mjs'

const WORKER = fileURLToPath(new URL('./sqlworker.mjs', import.meta.url))

export function runDb(op, args = {}, { timeout = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = fork(WORKER, [], { serialization: 'advanced', execArgv: ['--no-warnings'], stdio: ['ignore', 'ignore', 'pipe', 'ipc'] })
    let settled = false, stderr = ''
    child.stderr.on('data', d => { stderr += d })
    const done = fn => v => { if (settled) return; settled = true; clearTimeout(timer); if (child.exitCode === null) child.kill('SIGKILL'); fn(v) }
    const ok = done(resolve), bad = done(reject)
    const timer = setTimeout(() => bad(new Error(`the query ran longer than ${timeout / 1000} s and was stopped; narrow it down`)), timeout)
    child.once('message', m => (m.error ? bad(new Error(m.error)) : ok(m.result)))
    child.once('error', bad)
    child.once('exit', code => bad(new Error(`query process exited (${code}) ${stderr.slice(0, 300)}`)))
    child.send({ gamiDb: GAMI_DB, stateDb: STATE_DB, op, args })
  })
}

let statsCache = null
export async function corpusStats() {
  if (!statsCache) statsCache = await runDb('stats', {}, { timeout: 60000 })
  return statsCache
}
