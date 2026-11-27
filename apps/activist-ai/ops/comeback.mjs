// Projects come back after the machine restarts (OLA-101).
//
// Before this, an unattended reboot left every project stopped until someone opened it, and the
// first person back waited for a cold start. The Studio will restart at Stanford (a power cut, an
// update), with nobody there to open anything. So:
//
//   1. The front desk keeps $OLA_HOME/up.json: the machine's boot time and the projects that are
//      running because the front desk started them. A start adds the project; a stop by the front
//      desk (the idle stop, parking for an update) removes it. Only slugs and times are in it.
//   2. When the front desk starts and the boot time differs from the file's (the machine restarted
//      since), it starts again every listed project that is still open (`isActive`), one at a time,
//      through the same start a person's request uses (the machine's cap and a closed project hold).
//      Apple's container system may still be coming up: a start that fails is tried again every
//      15 seconds, for 15 minutes; after that the project starts on its next request, as before.
//   3. When the boot time is the same (a front desk restart, as every update does), nothing is
//      started: VMs outlive the front desk, and the list is trimmed to what is running.
//
// A new project needs nothing extra: its first start adds it.
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { uptime } from 'node:os'
import path from 'node:path'

export const RETRY_MS = 15_000
export const GIVE_UP_MS = 15 * 60_000
export const SAME_BOOT_S = 120 // boot times from uptime drift by a second or two

export const file = (home) => path.join(home, 'up.json')
export const bootTime = () => Math.round(Date.now() / 1000 - uptime())

function read(f) {
  try {
    const v = JSON.parse(readFileSync(f, 'utf8'))
    return Number.isFinite(v?.boot) && Array.isArray(v.up) ? v : null
  } catch {
    return null
  }
}

/**
 * `running()` -> slugs running now (throws while the container system is not up); `start(slug)`
 * starts one (rejects with code 'CLOSED' for a closed project, anything else is tried again);
 * `isActive(slug)` -> the platform still has it open.
 */
export function makeComeback({ home, running, start, isActive = () => true, log = () => {}, boot = bootTime, now = () => Date.now(), retryMs = RETRY_MS, giveUpMs = GIVE_UP_MS, timer = setTimeout }) {
  const f = file(home)
  const up = new Set()
  let myBoot = boot()
  const save = () => {
    try {
      writeFileSync(`${f}.tmp`, JSON.stringify({ boot: myBoot, up: [...up] }) + '\n', { mode: 0o600 })
      renameSync(`${f}.tmp`, f)
    } catch (e) {
      log(`up.json not written (${e.code ?? 'error'})`)
    }
  }
  const note = (slug) => {
    if (up.has(slug)) return
    up.add(slug)
    save()
  }
  const gone = (slug) => {
    if (!up.delete(slug)) return
    save()
  }

  /** At the front desk's start. Resolves with { rebooted, started, left } once it is finished. */
  async function resume() {
    const prev = read(f)
    const rebooted = !!prev && Math.abs(prev.boot - myBoot) > SAME_BOOT_S
    const listed = (prev?.up ?? []).filter((s) => typeof s === 'string' && isActive(s))
    for (const s of listed) up.add(s)
    if (!rebooted) {
      try {
        const r = new Set(running())
        for (const s of [...up]) if (!r.has(s)) up.delete(s)
      } catch {}
      save()
      return { rebooted: false, started: [], left: [] }
    }
    save()
    if (!listed.length) return { rebooted: true, started: [], left: [] }
    log(`the machine restarted: starting again ${listed.length} project(s) that were running (${listed.join(', ')})`)
    const started = []
    let todo = [...listed]
    const end = now() + giveUpMs
    for (;;) {
      let r = null
      try {
        r = new Set(running())
      } catch {}
      if (r) {
        const next = []
        for (const slug of todo) {
          if (r.has(slug) || !up.has(slug)) continue // a person woke it meanwhile, or it was stopped since
          try {
            await start(slug)
            started.push(slug)
            log(`${slug}: started again after the restart`)
          } catch (e) {
            if (e?.code === 'CLOSED') {
              gone(slug)
              continue
            }
            next.push(slug)
          }
        }
        todo = next
      }
      if (!todo.length) break
      if (now() >= end) {
        log(`not started again after the restart, they start on their next request: ${todo.join(', ')}`)
        break
      }
      await new Promise((res) => timer(res, retryMs))
    }
    return { rebooted: true, started, left: todo }
  }
  return { note, gone, resume, list: () => [...up] }
}
