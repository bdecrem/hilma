import { NextResponse } from 'next/server'
import { keyOk } from '@/lib/venture/interview'
import { f2Supabase } from '@/lib/f2/supabase'

export const runtime = 'nodejs'

// POST /api/venture/status  { key, status }
// The Ola machine's live status for the board at app.kochitolabs.com, pushed every 10 minutes by
// the alarm on the Mac mini (apps/activist-ai/ops/watch.mjs, launchd cx.ola.watch) with the same
// Venture key it texts with. Stored in venture_state "ola_status"; the board marks it stale after
// 30 minutes. Only the fields below are kept, each a number, a short string or a flag.
const str = (v: unknown, n = 200) => (typeof v === 'string' ? v.slice(0, n) : null)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const iso = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null)

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { key?: unknown; status?: Record<string, unknown> } | null
  if (!body || !keyOk(body.key)) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const s = body.status
  if (!s || typeof s !== 'object' || JSON.stringify(s).length > 20000) return NextResponse.json({ error: 'bad status' }, { status: 400 })
  const dep = s.deployed as Record<string, unknown> | null | undefined
  const suites: Record<string, string> = {}
  if (dep && typeof dep.suites === 'object' && dep.suites) for (const [k, v] of Object.entries(dep.suites as Record<string, unknown>).slice(0, 12)) if (typeof v === 'string') suites[k.slice(0, 40)] = v.slice(0, 40)
  let passed = 0
  let total = 0
  for (const v of Object.values(suites)) {
    const m = v.match(/^(\d+) of (\d+)$/)
    if (m) (passed += Number(m[1]), (total += Number(m[2])))
  }
  // The automatic checks on main (OLA-84, apps/activist-ai/ops/ci.mjs): the newest result.
  const c = s.ci as Record<string, unknown> | null | undefined
  const ciSuites: Record<string, string> = {}
  if (c && typeof c.suites === 'object' && c.suites) for (const [k, v] of Object.entries(c.suites as Record<string, unknown>).slice(0, 12)) if (typeof v === 'string') ciSuites[k.slice(0, 40)] = v.slice(0, 40)
  const ci = c && str(c.commit, 64) && typeof c.ok === 'boolean' ? { commit: str(c.commit, 64), at: iso(c.at), ok: c.ok, by: str(c.by, 20), suites: ciSuites, why: c.ok ? null : str(c.why, 160) } : null
  const alarm = (s.alarm ?? {}) as Record<string, unknown>
  const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => str(x)).filter((x): x is string => !!x).slice(0, 12) : [])
  const parts: Record<string, boolean> = {}
  if (s.parts && typeof s.parts === 'object') for (const [k, v] of Object.entries(s.parts as Record<string, unknown>).slice(0, 12)) if (typeof v === 'boolean') parts[k.slice(0, 40)] = v
  // The request tests (OLA-231, evals/asks): the summary counts, the cases that do not work (or work
  // sometimes: two passes with a fail between, OLA-251) by id, place and ticket, and the abilities count
  // (OLA-232). Dropped here until Nov 20, so the board never showed them (OLA-251, OLA-294).
  const a = s.asks as Record<string, unknown> | null | undefined
  const counts = (v: unknown, keys: string[]) => {
    const o = (v ?? {}) as Record<string, unknown>
    return Object.fromEntries(keys.map((k) => [k, num(o[k]) ?? 0]))
  }
  const cases = (v: unknown) =>
    Array.isArray(v)
      ? v
          .slice(0, 20)
          .map((x) => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {}))
          .filter((x) => str(x.case, 64))
          .map((x) => ({ case: str(x.case, 64) as string, ticket: str(x.ticket, 12), tries: str(x.tries, 60) }))
      : []
  const asks =
    a && typeof a === 'object'
      ? {
          release: str(a.release, 40),
          at: iso(a.at),
          summary: a.summary && typeof a.summary === 'object' ? counts(a.summary, ['passing', 'worksSometimes', 'stoppedWorking', 'notWorkingYet', 'notRun']) : null,
          worksSometimes: cases(a.worksSometimes),
          stoppedWorking: cases(a.stoppedWorking),
          notWorkingYet: cases(a.notWorkingYet),
          abilities: a.abilities && typeof a.abilities === 'object' ? counts(a.abilities, ['lines', 'passing', 'sometimes', 'failing', 'notRun', 'notOffered', 'noCase']) : null,
        }
      : null
  const value = {
    at: new Date().toISOString(),
    from: str(s.host, 60),
    deployed: dep && str(dep.commit, 64) ? { commit: str(dep.commit, 64), at: iso(dep.at), suites } : null,
    checks: total ? { passed, total } : null,
    ci,
    asks,
    alarm: { state: ['ok', 'warn', 'alarm'].includes(String(alarm.state)) ? alarm.state : 'ok', says: list(alarm.says), warns: list(alarm.warns), runAt: iso(alarm.runAt) },
    disk: num((s.disk as Record<string, unknown> | undefined)?.freeGB) !== null ? { freeGB: num((s.disk as Record<string, unknown>).freeGB) } : null,
    memory: str(s.memory, 80),
    projects: num((s.projects as Record<string, unknown> | undefined)?.running) !== null ? { running: num((s.projects as Record<string, unknown>).running) } : null,
    parts,
  }
  // Each machine has its own place (OLA-477): the mini's reading is "ola_status" (the board's main
  // reading), the Studio's "ola_status_studio", so the two never overwrite each other.
  const slot = !value.from || value.from === 'mini' ? 'ola_status' : value.from === 'studio' ? 'ola_status_studio' : null
  if (!slot) return NextResponse.json({ error: 'unknown machine' }, { status: 400 })
  const { error } = await f2Supabase().from('venture_state').upsert({ key: slot, value, at: value.at })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
