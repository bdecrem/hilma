// Coding runs: the researcher's coding sheet applied to many papers, one Claude call per paper (through the Agent
// SDK, so on Bart's Max plan), every value with the exact passage behind it, and every passage checked against
// the paper's text. Runs survive a restart: unfinished papers are picked up again when the server starts.
import { query } from '@anthropic-ai/claude-agent-sdk'
import * as store from './store.mjs'
import { runDb } from './db.mjs'
import { saveTable } from './artifacts.mjs'
import { CODING_MODELS, WORKSPACE, PUBLIC_URL } from './config.mjs'
import { childEnv } from './env.mjs'

const CONCURRENCY = Number(process.env.ALMANAC_JOB_CONCURRENCY || 3)
export const CONFIRM_ABOVE = 25 // papers; a bigger run needs the user's go-ahead
const active = new Map() // job id -> { cancelled, paused, aborts }
let notify = () => {}
export const onJobEvent = fn => { notify = fn }

const FIELD_NAME = /^[a-z][a-z0-9_]{0,40}$/
export function checkSpec(spec) {
  if (!spec.name?.trim()) throw new Error('name the run')
  if (!spec.instructions?.trim()) throw new Error('instructions are required')
  if (!spec.fields?.length || spec.fields.length > 25) throw new Error('give 1 to 25 fields')
  const seen = new Set()
  for (const f of spec.fields) {
    if (!FIELD_NAME.test(f.name)) throw new Error(`field name "${f.name}": use lower_snake_case`)
    if (seen.has(f.name)) throw new Error(`field "${f.name}" appears twice`)
    seen.add(f.name)
    if (f.type === 'category' && !(f.options?.length >= 2)) throw new Error(`category field "${f.name}" needs at least two options`)
  }
  if (!CODING_MODELS[spec.model || 'sonnet']) throw new Error(`model is one of ${Object.keys(CODING_MODELS).join(', ')}`)
}

function valueSchema(f) {
  if (f.type === 'number') return { anyOf: [{ type: 'number' }, { type: 'null' }] }
  if (f.type === 'boolean') return { anyOf: [{ type: 'boolean' }, { type: 'null' }] }
  if (f.type === 'category') {
    const e = { type: 'string', enum: [...f.options, 'not stated'] }
    return f.multiple ? { type: 'array', items: e } : e
  }
  return { type: 'string' }
}
function outputSchema(spec) {
  const sheet = { type: 'object', additionalProperties: false, required: spec.fields.map(f => f.name),
    properties: Object.fromEntries(spec.fields.map(f => [f.name, { type: 'object', additionalProperties: false,
      required: ['value', 'quote', 'page'], properties: { value: valueSchema(f), quote: { type: 'string' },
        page: { anyOf: [{ type: 'integer' }, { type: 'null' }] } } }])) }
  return spec.unit === 'list'
    ? { type: 'object', additionalProperties: false, required: ['items', 'note'], properties: { items: { type: 'array', items: sheet }, note: { type: 'string' } } }
    : { type: 'object', additionalProperties: false, required: ['sheet', 'note'], properties: { sheet, note: { type: 'string' } } }
}
function systemFor(spec) {
  const item = spec.item || 'item'
  return [
    'You code one research paper for a systematic review of climate change adaptation. Read the paper, then fill in the coding sheet.',
    '',
    'Rules:',
    '- Every value rests on a passage in the paper. "quote" is copied exactly, character for character, from the paper text you are given: one to three consecutive sentences, no ellipses, no paraphrase, no added words. "page" is the number of the [page N] marker the quote sits under.',
    '- If the paper does not say, the value is "not stated" (text and category fields) or null (number and yes/no fields), with quote "" and page null. Never guess or infer beyond what the text supports.',
    '- Code what the paper itself studies or reports, not what it cites from other studies in its literature review.',
    spec.unit === 'list'
      ? `- Fill one sheet for each distinct ${item} the instructions describe, at most 15. If the paper has none, return an empty list.`
      : '- Fill one sheet for the paper as a whole.',
    '- "note" is one short sentence on anything a reviewer should know (ambiguity, a poor fit with the instructions, a garbled or partial text). Empty if nothing.',
    '',
    "The researcher's instructions:",
    spec.instructions.trim(),
    '',
    'Fields:',
    ...spec.fields.map(f => `- ${f.name} (${f.type}${f.type === 'category' ? `: ${f.options.join(' / ')}${f.multiple ? '; one or more' : ''}` : ''}): ${f.description}`),
  ].join('\n')
}
function paperPrompt(meta, pages, source) {
  const head = [`Paper ${meta.id}: ${meta.title}`, `${meta.authors || 'Unknown authors'} (${meta.year || 'n.d.'}). ${meta.journal || ''}`,
    `GAMI coders' summary: ${meta.summary || '(none)'}`].join('\n')
  if (source === 'summary') return `${head}\n\nOnly the summary above is available. Quote from it and leave page null.`
  return `${head}\n\nFull text:\n\n` + pages.map(p => `[page ${p.page}]\n${p.text}`).join('\n\n')
}

// 1 = found on the stated page, 2 = found elsewhere in the paper, 0 = not found, null = no quote given
const norm = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '')
function checkQuote(quote, page, pages, summary) {
  const q = norm(quote)
  if (!q) return null
  if (q.length < 8) return 0
  const onPage = pages.find(p => p.page === page)
  if (onPage && norm(onPage.text).includes(q)) return 1
  return norm(pages.map(p => p.text).join(' ') + ' ' + summary).includes(q) ? (pages.length ? 2 : 1) : 0
}
const isLimit = msg => /usage limit|limit reached|rate.?limit|429|overloaded/i.test(msg || '')

async function codePaper(job, paperId, ctl) {
  const spec = job.spec
  const { meta, pages } = await runDb('paper', { id: paperId })
  const abort = new AbortController()
  ctl.aborts.add(abort)
  let out = null, lastErr = ''
  try {
    for (let attempt = 0; attempt < 2 && !out && !ctl.cancelled; attempt++) {
      try {
        for await (const m of query({ prompt: paperPrompt(meta, pages, spec.source), options: {
          model: CODING_MODELS[spec.model || 'sonnet'], effort: spec.effort || 'low', tools: [], settingSources: [],
          persistSession: false, systemPrompt: systemFor(spec), outputFormat: { type: 'json_schema', schema: outputSchema(spec) },
          maxTurns: 4, permissionMode: 'dontAsk', cwd: WORKSPACE, env: childEnv(), abortController: abort } })) {
          if (m.type !== 'result') continue
          if (m.subtype === 'success' && m.structured_output) out = m.structured_output
          else lastErr = [m.subtype, ...(m.errors || []), m.result || ''].join(' ').trim()
        }
      } catch (e) { lastErr = String(e?.message || e) }
      if (!out && isLimit(lastErr)) break
    }
  } finally { ctl.aborts.delete(abort) }
  if (!out) throw new Error(lastErr || 'no answer')
  const sheets = spec.unit === 'list' ? out.items || [] : [out.sheet]
  const rows = []
  sheets.forEach((sheet, item) => {
    for (const f of spec.fields) {
      const c = sheet?.[f.name] || {}
      const value = c.value == null ? null : Array.isArray(c.value) ? c.value.join(' | ') : String(c.value)
      const page = Number.isInteger(c.page) ? c.page : null
      rows.push({ item: item + 1, field: f.name, value, quote: c.quote || '', page, quote_found: checkQuote(c.quote, page, pages, meta.summary) })
    }
  })
  store.jobs.saveCoding(job.id, paperId, rows, out.note || '')
}

export async function runJob(id) {
  if (active.has(id)) return
  const job = store.jobs.get(id)
  const ctl = { cancelled: false, paused: null, aborts: new Set() }
  active.set(id, ctl)
  const todo = store.jobs.todo(id)
  let next = 0
  const worker = async () => {
    while (!ctl.cancelled && !ctl.paused && next < todo.length) {
      const pid = todo[next++]
      try { await codePaper(job, pid, ctl) } catch (e) {
        if (ctl.cancelled) break
        const msg = String(e?.message || e)
        if (isLimit(msg)) { ctl.paused = msg.slice(0, 300); break }
        store.jobs.paperError(id, pid, msg.slice(0, 500))
      }
      store.jobs.count(id)
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.max(1, Math.min(CONCURRENCY, todo.length)) }, worker))
    store.jobs.count(id)
    if (ctl.cancelled) { store.jobs.status(id, 'cancelled'); return }
    if (ctl.paused) { store.jobs.status(id, 'paused', { error: `Paused: ${ctl.paused}` }); return }
    const artifactId = await resultTable(store.jobs.get(id))
    store.jobs.status(id, 'done', { artifactId })
  } catch (e) {
    store.jobs.status(id, 'failed', { error: String(e?.message || e).slice(0, 500) })
  } finally {
    active.delete(id)
    notify(store.jobs.get(id))
  }
}

// the run as one wide table: a row per paper (or per item), and for each field its value, quote, page and check
async function resultTable(job) {
  const spec = job.spec
  const codings = store.jobs.codings(job.id)
  const papers = store.jobs.papers(job.id)
  const ids = papers.map(p => p.paper_id)
  const meta = ids.length ? (await runDb('rows', { query: `SELECT id, title, year, authors FROM papers WHERE id IN (${ids.map(i => `'${i.replace(/'/g, "''")}'`).join(',')})` })).rows : []
  const byId = Object.fromEntries(meta.map(r => [r[0], r]))
  const check = v => (v === 1 ? 'found' : v === 2 ? 'found, other page' : v === 0 ? 'NOT FOUND' : '')
  const columns = ['paper_id', 'title', 'year', 'authors', ...(spec.unit === 'list' ? ['item'] : []),
    ...spec.fields.flatMap(f => [f.name, `${f.name}_quote`, `${f.name}_page`, `${f.name}_check`]), 'note', 'status', 'pdf']
  const rows = []
  for (const p of papers) {
    const m = byId[p.paper_id] || [p.paper_id, '', null, '']
    const mine = codings.filter(c => c.paper_id === p.paper_id)
    const items = [...new Set(mine.map(c => c.item))]
    const base = [p.paper_id, m[1], m[2], m[3]]
    const tail = [p.note || '', p.status === 'error' ? `error: ${p.error}` : p.status, `${PUBLIC_URL}/papers/${p.paper_id}.pdf`]
    if (!items.length) { rows.push([...base, ...(spec.unit === 'list' ? [null] : []), ...spec.fields.flatMap(() => [null, null, null, null]), ...tail]); continue }
    for (const it of items) {
      const cells = spec.fields.flatMap(f => {
        const c = mine.find(x => x.item === it && x.field === f.name) || {}
        return [c.value ?? null, c.quote || null, c.page ?? null, check(c.quote_found)]
      })
      rows.push([...base, ...(spec.unit === 'list' ? [it] : []), ...cells, ...tail])
    }
  }
  const quoted = codings.filter(c => c.quote_found != null)
  const found = quoted.filter(c => c.quote_found > 0).length
  const description = `${papers.length} papers, ${job.done} coded, ${job.errors} errors. ${quoted.length ? `${found} of ${quoted.length} quotes found in the papers' text.` : ''} Instructions: ${spec.instructions.slice(0, 300)}`
  const { id } = await saveTable({ chatId: job.chat_id, author: job.author, title: `Coding run: ${job.name}`, description, columns, rows, kind: 'coding', meta: { job: job.id } })
  return id
}

export async function createJob({ chatId, author, spec }) {
  checkSpec(spec)
  const chosen = await runDb('choose', { where: spec.where || '1=1', ids: spec.ids, needText: spec.source !== 'summary', limit: spec.limit, sample: spec.sample || 'random' }, { timeout: 60000 })
  if (!chosen.length) throw new Error('no papers match that selection' + (spec.source !== 'summary' ? ' (with full text)' : ''))
  const perPaper = p => (spec.source === 'summary' ? p.summary_chars / 4 : p.words * 1.7) + 2500
  const estTokens = Math.round(chosen.reduce((a, p) => a + perPaper(p), 0))
  if (chosen.length > CONFIRM_ABOVE && !spec.confirmed) return { needsConfirmation: true, papers: chosen.length, estTokens }
  const id = store.jobs.create({ chatId, name: spec.name.trim(), spec, total: chosen.length, estTokens, author, paperIds: chosen.map(p => p.id) })
  notify(store.jobs.get(id))
  runJob(id)
  return { id, papers: chosen.length, estTokens }
}

export function cancelJob(id) {
  const ctl = active.get(id)
  if (!ctl) { const j = store.jobs.get(id); if (j && ['running', 'paused'].includes(j.status)) store.jobs.status(id, 'cancelled'); return !!j }
  ctl.cancelled = true
  for (const a of ctl.aborts) a.abort()
  return true
}
export function resumeJob(id) {
  const j = store.jobs.get(id)
  if (!j) throw new Error(`no run ${id}`)
  if (!['paused', 'failed', 'cancelled'].includes(j.status)) throw new Error(`run ${id} is ${j.status}`)
  store.jobs.status(id, 'running')
  runJob(id)
}
export const resumeAll = () => store.jobs.running().forEach(id => runJob(id))
export const isActive = id => active.has(id)
