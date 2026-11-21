// One suite of an update or a check, run under a time limit, and a failed one run once more by itself
// (OLA-334, OLA-335; Bart, Nov 21: "Ola-338 yes").
//
// Nov 21, 1:12 to 1:43 am: the automatic check's apps suite (swift test) sat 30 minutes in one test and
// held the machine's one test turn; nothing stopped it, and the update of the test server waited behind
// it. So every suite has a limit (LIMITS, in minutes; about three times its usual length on the mini):
// at the limit its whole process group is stopped (SIGTERM, then SIGKILL 5 s later), it counts as
// failed, and the caller refuses the update, which gives the turn back. A suite stopped at its limit is
// not run again (that would hold the machine for another limit).
//
// A suite that fails is run once more by itself, after the others: when the rerun passes, the update
// goes on and its record says which suite failed once and where its first output is kept; when the
// rerun fails too, the update is refused naming the suite and the kept output.
import { spawn } from 'node:child_process'

// Usual lengths on the mini (Nov 21 deploys.log and logs): frontdesk ~590 s, web ~440 s, workspace
// ~300 s, gateway ~70 s, apps (swift test) ~4 min with its build, the rest seconds.
export const LIMITS = { frontdesk: 25, web: 20, workspace: 15, gateway: 8, tls: 8, apps: 15 }
export const DEFAULT_LIMIT_MIN = 5
/** The limit of suite `name` in ms; OLA_SUITE_LIMIT_MIN (a number) overrides them all, for tests. */
export function limitMs(name, env = process.env) {
  const all = Number(env.OLA_SUITE_LIMIT_MIN)
  return Math.round((all > 0 ? all : LIMITS[name] ?? DEFAULT_LIMIT_MIN) * 60000)
}

/**
 * Runs cmd with args in its own process group, its output to out.write, for at most limit ms.
 * Resolves { code, tail, timedOut, ms }; a suite stopped at its limit has code 124 and timedOut true.
 */
export function runLimited(cmd, args, { cwd, out, env = process.env, limit, killGrace = 5000 }) {
  return new Promise((resolve) => {
    const t0 = Date.now()
    const c = spawn(cmd, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
    let tail = ''
    let timedOut = false
    const take = (d) => {
      out.write(d)
      tail = (tail + d).slice(-4000)
    }
    c.stdout.on('data', take)
    c.stderr.on('data', take)
    const group = (sig) => {
      try {
        process.kill(-c.pid, sig)
      } catch {}
    }
    let hard = null
    const timer = setTimeout(() => {
      timedOut = true
      take(`\n---- stopped at its time limit (${Math.round(limit / 1000)} s) ----\n`)
      group('SIGTERM')
      hard = setTimeout(() => group('SIGKILL'), killGrace)
    }, limit)
    c.on('error', (e) => take(`\n${e.message}\n`))
    c.on('close', (code) => {
      clearTimeout(timer)
      if (hard) clearTimeout(hard)
      group('SIGKILL') // anything the suite left running in its group
      resolve({ code: timedOut ? 124 : code ?? 1, tail, timedOut, ms: Date.now() - t0 })
    })
  })
}

/**
 * The record of a suite that was run up to twice: { ok, count, flaky, line }.
 * first/rerun: { code, count, timedOut, kept } (kept: the file holding that run's output).
 */
export function outcome(name, first, rerun = null) {
  if (first.code === 0) return { ok: true, count: first.count, flaky: false, line: null }
  if (first.timedOut) return { ok: false, count: first.count, flaky: false, line: `suite ${name} stopped at its time limit and counted as failed (${first.count}; output kept in ${first.kept})` }
  if (!rerun) return { ok: false, count: first.count, flaky: false, line: `suite ${name} failed (${first.count}; output kept in ${first.kept}), not rerun` }
  if (rerun.code === 0) return { ok: true, count: rerun.count, flaky: true, line: `${name} failed once (${first.count}; output kept in ${first.kept}) and passed on the rerun (${rerun.count})` }
  return { ok: false, count: rerun.count, flaky: false, line: `suite ${name} failed twice (${first.count}, then ${rerun.count}${rerun.timedOut ? ', stopped at its time limit' : ''}; output kept in ${first.kept} and ${rerun.kept})` }
}
