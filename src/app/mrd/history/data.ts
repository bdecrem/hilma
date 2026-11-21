import fs from 'fs'
import path from 'path'

export const COUNTRIES = { argentina: 'Argentina', chile: 'Chile' } as const
export const STEPS = {
  forward: { name: 'Forward, 2023 to 2026', short: 'Forward', blurb: 'What changed in the law and in practice between 1 January 2023 and 1 January 2026.' },
  back2000: { name: 'Back in time, 2020 to 2000', short: 'Back in time', blurb: 'From the MRD’s answer as of 1 January 2020, back to 1 January 2000, with answers on 2000, 2005, 2010 and 2015.' },
} as const
export type CountrySlug = keyof typeof COUNTRIES
export type StepKey = keyof typeof STEPS
export const TOTAL = 64

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Run = {
  file: string; status: string; slug: string; step: string; chunk: string; model: string; effort: string
  qids: number[]; minutes: number; cost: number; input: number; output: number; total: number; finished: string
  answers: any[]
}
export type Q = { id: number; text: string; options: string[] }

const root = process.cwd()
const resDir = process.env.HISTORY_TEST_DIR || path.join(root, 'apps/mrd/dossiers/cost/results')

let _book: any
function book() {
  if (!_book) _book = JSON.parse(fs.readFileSync(path.join(root, 'apps/mrd/dossiers/codebook.json'), 'utf8'))
  return _book
}
export function question(id: number): Q {
  const q = book().questions[String(id)] || {}
  return { id, text: q.text_long || q.text || `Indicator ${id}`, options: (q.options || []).map((o: any) => o.answer ?? o) }
}
export function chunkLabels(): Record<string, string> {
  return Object.fromEntries(book().chunks.map((c: any) => [c.key, c.label]))
}

export function runs(): Run[] {
  if (!fs.existsSync(resDir)) return []
  const out: Run[] = []
  for (const f of fs.readdirSync(resDir).sort()) {
    if (!f.endsWith('.json')) continue
    let d: any
    try { d = JSON.parse(fs.readFileSync(path.join(resDir, f), 'utf8')) } catch { continue }
    if (!(d.slug in COUNTRIES) || !(d.step in STEPS)) continue
    const t = d.tokens?.totals || {}
    out.push({
      file: f, status: d.status, slug: d.slug, step: d.step, chunk: d.chunk, model: d.model, effort: d.effort,
      qids: d.qids || [], minutes: Number(d.minutes) || 0, cost: Number(t.cost_usd) || 0,
      input: (t.input || 0) + (t.cache_read || 0) + (t.cache_write || 0), output: t.output || 0, total: t.total || 0,
      finished: d.finished_at || '', answers: d.status === 'ok' ? (d.output?.answers || []) : [],
    })
  }
  return out
}

export type Ind = { qid: number; chunk: string; a: any; changed: boolean }

const NO_CHANGE = (s: string) => /^There have been no right protections/.test(s) || /neither the right protection nor the implementation level of these protections has changed/.test(s)

export function isChanged(step: string, a: any): boolean {
  if (step === 'forward') {
    if (a.answer_2023 !== a.answer_2026 || a.implementation_2023 !== a.implementation_2026) return true
    return !NO_CHANGE(a.change_2023_2026 || '')
  }
  const ds: any[] = a.answers_by_date || []
  const first = ds[0]
  if (ds.some(d => d.answer !== first?.answer || d.implementation !== first?.implementation)) return true
  return !NO_CHANGE(a.change_2000_2020 || '')
}

export function inds(all: Run[], slug: string, step: string): Ind[] {
  const m = new Map<number, Ind>()
  for (const r of all.filter(r => r.slug === slug && r.step === step && r.status === 'ok')) {
    for (const a of r.answers) m.set(a.question_id, { qid: a.question_id, chunk: r.chunk, a, changed: isChanged(step, a) })
  }
  return [...m.values()].sort((x, y) => x.qid - y.qid)
}

export function stats(all: Run[], slug: string, step: string) {
  const rs = all.filter(r => r.slug === slug && r.step === step)
  const done = inds(all, slug, step)
  const sum = (k: 'cost' | 'input' | 'output' | 'total' | 'minutes') => rs.reduce((s, r) => s + r[k], 0)
  const models = [...new Set(rs.map(r => `${r.model.replace('claude-', '').replace(/-(\d)-(\d)/, ' $1.$2').replace(/^./, c => c.toUpperCase())}, ${r.effort} effort`))]
  return {
    done: done.length, changed: done.filter(i => i.changed).length,
    runs: rs.filter(r => r.status === 'ok').length, running: rs.filter(r => r.status === 'started').length,
    cost: sum('cost'), input: sum('input'), output: sum('output'), total: sum('total'), minutes: sum('minutes'), models,
  }
}

export const usd = (n: number) => '$' + n.toFixed(2)
export const num = (n: number) => n.toLocaleString('en-US')
export const mil = (n: number) => n >= 1e6 ? (n / 1e6).toFixed(2) + ' M' : n >= 1e3 ? (n / 1e3).toFixed(1) + ' k' : String(n)
