#!/usr/bin/env node
// One queue for everything that starts sealed VMs on this machine, and deploys go first (OLA-83).
//
// The machine runs at most four VMs (workspace/ws.mjs MACHINE_MAX). On the night of 2026-11-18
// builders running their checks side by side filled all four and a deploy's own suites were
// refused for a full machine four times. Now a check suite (workspace/check.mjs,
// frontdesk/check.mjs, the *-live scripts) takes a turn before it starts a VM and holds it to
// the end; one turn at a time, first come first served, except that a waiting deploy is served
// before every waiting builder. A builder that arrives while a deploy waits or runs waits too.
//
//   node ops/turn.mjs status                    who holds the turn, for how long, and who waits
//   node ops/turn.mjs run [--deploy] [--label <what>] -- <command…>
//                                               wait for a turn, run the command holding it,
//                                               give it back when the command exits (its code)
//
// From code: `import { takeTurn } from '../ops/turn.mjs'; await takeTurn('frontdesk check')`
// waits and holds the turn until the process exits. A child of a turn's holder (a deploy runs its
// suites, `turn.mjs run` its command) inherits the turn through OLA_TURN_HELD and does not queue.
//
// The files, kept compatible with the evals' shell scripts, which already used the first two:
//   ~/ola-suite.lock/          the turn itself (made with mkdir, atomic); owner = pid + label
//   ~/ola-deploy.hold          present while a deploy waits or holds the turn (its pid)
//   ~/.ola-turns/<t>-<pid>.json  one ticket per waiter, in arrival order
// A ticket, a hold or a turn whose process is gone is cleared by the next waiter. A turn taken by
// a shell script (an owner file without a pid) is trusted until that script removes it.
// OLA_TURN_HOME puts all three in one folder instead (the tests).
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export function turnPaths(home = process.env.OLA_TURN_HOME) {
  if (home) return { lock: path.join(home, 'suite.lock'), hold: path.join(home, 'deploy.hold'), queue: path.join(home, 'turns') }
  const H = homedir()
  return { lock: path.join(H, 'ola-suite.lock'), hold: path.join(H, 'ola-deploy.hold'), queue: path.join(H, '.ola-turns') }
}

const alive = (pid) => {
  if (!(pid > 0)) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e.code === 'EPERM'
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const readJson = (f) => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'))
  } catch {
    return null
  }
}

/** Who holds the turn: { pid, label, since, shell } or null. Clears a turn whose holder is gone. */
export function holder(P = turnPaths()) {
  if (!existsSync(P.lock)) return null
  const owner = path.join(P.lock, 'owner')
  let text = ''
  try {
    text = readFileSync(owner, 'utf8')
  } catch {}
  let since = null
  try {
    since = statSync(P.lock).mtimeMs
  } catch {
    return null
  }
  const m = /^pid (\d+)\b/.exec(text)
  if (!m) {
    // A shell script's turn (`echo "fu2 $(date)" > owner`), or one being written this instant.
    return { pid: null, label: text.trim() || '(starting)', since, shell: true }
  }
  const pid = Number(m[1])
  if (!alive(pid)) {
    rmSync(P.lock, { recursive: true, force: true })
    return null
  }
  return { pid, label: text.slice(m[0].length).trim(), since, shell: false }
}

/** The live tickets in serving order: deploys first, then arrival. Dead waiters' tickets are removed. */
export function waiting(P = turnPaths()) {
  if (!existsSync(P.queue)) return []
  const out = []
  for (const f of readdirSync(P.queue)) {
    if (!f.endsWith('.json')) continue
    const t = readJson(path.join(P.queue, f))
    if (!t || !alive(t.pid)) {
      rmSync(path.join(P.queue, f), { force: true })
      continue
    }
    out.push({ ...t, file: f })
  }
  return out.sort((a, b) => (b.deploy === true) - (a.deploy === true) || a.at - b.at || a.file.localeCompare(b.file))
}

function clearStaleHold(P) {
  if (!existsSync(P.hold)) return
  const pid = Number(String(readFileSync(P.hold, 'utf8')).trim()) || 0
  // A hold with no pid was made by hand: trusted. One whose deploy is gone is cleared.
  if (pid > 0 && !alive(pid)) rmSync(P.hold, { force: true })
}

/**
 * Wait in line for the turn. Resolves to { release, waitedMs } once held. With deploy, the hold
 * file is put down at once, so no new builder turn starts while this waits.
 * on: called with a line to print whenever the position changes (default: quiet).
 * signal: an AbortSignal; once aborted, the ticket (and a deploy's hold) is taken back and the
 * promise resolves to null.
 */
export async function acquire({ label = `pid ${process.pid}`, deploy = false, P = turnPaths(), poll = 1000, on = () => {}, pid = process.pid, signal = null } = {}) {
  mkdirSync(P.queue, { recursive: true })
  const at = Date.now()
  const file = path.join(P.queue, `${at}-${pid}.json`)
  writeFileSync(file, JSON.stringify({ pid, label, deploy, at }) + '\n')
  if (deploy) writeFileSync(P.hold, `${pid}\n`)
  const cleanup = () => {
    rmSync(file, { force: true })
    if (deploy && existsSync(P.hold) && Number(readFileSync(P.hold, 'utf8').trim()) === pid) rmSync(P.hold, { force: true })
  }
  let said = ''
  try {
    for (;;) {
      if (signal?.aborted) {
        cleanup()
        return null
      }
      clearStaleHold(P)
      if (deploy && !existsSync(P.hold)) writeFileSync(P.hold, `${pid}\n`)
      const h = holder(P)
      const line = waiting(P)
      const mine = line.findIndex((t) => t.pid === pid && t.at === at)
      const first = mine === 0
      // A builder never starts while some deploy waits (the hold may also be a shell script's
      // view of it); a deploy only needs to be first in line.
      const held = !deploy && existsSync(P.hold) && Number(readFileSync(P.hold, 'utf8').trim()) !== pid
      if (!h && first && !held) {
        try {
          mkdirSync(P.lock)
        } catch {
          await sleep(poll)
          continue
        }
        writeFileSync(path.join(P.lock, 'owner'), `pid ${pid} ${label}${deploy ? ' (deploy)' : ''}\n`)
        rmSync(file, { force: true })
        let released = false
        const release = () => {
          if (released) return
          released = true
          const o = readText(path.join(P.lock, 'owner'))
          if (o.startsWith(`pid ${pid} `)) rmSync(P.lock, { recursive: true, force: true })
          if (deploy && existsSync(P.hold) && Number(readFileSync(P.hold, 'utf8').trim()) === pid) rmSync(P.hold, { force: true })
        }
        return { release, waitedMs: Date.now() - at }
      }
      const now = h ? `the turn is held by ${h.label}${h.pid ? ` (pid ${h.pid})` : ''} for ${Math.round((Date.now() - h.since) / 60000)} min` : held ? 'a deploy goes first' : 'waiting'
      const msg = `${now}; ${mine < 0 ? '?' : mine} ahead of ${label}`
      if (msg !== said) on((said = msg))
      await sleep(poll)
    }
  } catch (e) {
    cleanup()
    throw e
  }
}
function readText(f) {
  try {
    return readFileSync(f, 'utf8')
  } catch {
    return ''
  }
}

/**
 * For a check suite: wait for the turn, hold it until this process exits, and let children
 * inherit it. Does nothing when this process already runs inside a turn (OLA_TURN_HELD names a
 * live holder of it) or when OLA_TURN=off (a development machine with nothing else on it).
 */
export async function takeTurn(label, { deploy = false } = {}) {
  if (process.env.OLA_TURN === 'off') return null
  const P = turnPaths()
  const inherited = Number(process.env.OLA_TURN_HELD || 0)
  const h = holder(P)
  if (inherited && h && h.pid === inherited) return null
  const t0 = Date.now()
  const got = await acquire({ label, deploy, P, on: (m) => console.log(`turn: ${m}`) })
  if (got.waitedMs > 2000) console.log(`turn: ${label} has the turn after ${Math.round((Date.now() - t0) / 1000)} s`)
  process.env.OLA_TURN_HELD = String(process.pid)
  // Given back when the process exits; a process killed by a signal leaves its turn behind, and the
  // next waiter clears it (its pid is gone). No signal handlers here: the suites own theirs.
  process.on('exit', got.release)
  return got
}

// ---------------------------------------------------------------- the command
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2)
  const P = turnPaths()
  if (cmd === 'status') {
    const h = holder(P)
    clearStaleHold(P)
    const line = waiting(P)
    console.log(h ? `turn: ${h.label}${h.pid ? `, pid ${h.pid}` : ' (a shell script)'}, ${Math.round((Date.now() - h.since) / 60000)} min` : 'turn: free')
    console.log(existsSync(P.hold) ? `deploy hold: on (pid ${readFileSync(P.hold, 'utf8').trim() || '?'})` : 'deploy hold: off')
    for (const [i, t] of line.entries()) console.log(`  ${i + 1}. ${t.label}${t.deploy ? ' (deploy)' : ''}, pid ${t.pid}, waiting ${Math.round((Date.now() - t.at) / 60000)} min`)
    if (!line.length) console.log('  nobody waiting')
  } else if (cmd === 'run') {
    const dd = rest.indexOf('--')
    if (dd < 0 || dd === rest.length - 1) {
      console.error('usage: node ops/turn.mjs run [--deploy] [--label <what>] -- <command…>')
      process.exit(2)
    }
    const opts = rest.slice(0, dd)
    const li = opts.indexOf('--label')
    const command = rest.slice(dd + 1)
    const label = li >= 0 ? opts[li + 1] : command.join(' ').slice(0, 80)
    await takeTurn(label, { deploy: opts.includes('--deploy') })
    const c = spawn(command[0], command.slice(1), { stdio: 'inherit', env: process.env })
    c.on('close', (code, sig) => process.exit(code ?? (sig ? 1 : 0)))
  } else {
    console.error('usage: node ops/turn.mjs status | run [--deploy] [--label <what>] -- <command…>')
    process.exit(2)
  }
}
