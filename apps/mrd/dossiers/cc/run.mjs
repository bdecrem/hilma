// Runs a country's dossier jobs through Claude Code (Agent SDK, Max login): the law map, then the 18
// chunks of indicators, three at a time. Prompts and schemas come from ../compile.py --emit-prompts;
// results go back through --ingest-map / --ingest-chunk. Searches are Claude Code's WebSearch; pages
// are read by our Python reader (compile.py --read), exposed as the MCP tool `read`.
//
//   node cc/run.mjs <slug> [--workers 3] [--only key,key] [--redo]
import { query, tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { execFile, spawn } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DOSSIERS = dirname(HERE)
const WORK = join(DOSSIERS, 'work')
mkdirSync(WORK, { recursive: true })
const MODEL = 'claude-opus-5-5'

// env: the mrd Supabase project; the API key is removed so the SDK uses the Claude Code login
for (const f of [join(DOSSIERS, '..', '.env'), join(DOSSIERS, '..', '..', '..', '.env.local')]) {
  if (!existsSync(f)) continue
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const SB_URL = process.env.MRD_SUPABASE_URL, SB_KEY = process.env.MRD_SUPABASE_SERVICE_KEY
const childEnv = () => { const e = { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: 'mrd-dossiers/0.1' }; delete e.ANTHROPIC_API_KEY; return e }

const args = process.argv.slice(2)
const slug = args[0]
const opt = (k, d) => { const i = args.indexOf(k); return i > 0 ? args[i + 1] : d }
const WORKERS = Number(opt('--workers', 3))
const ONLY = opt('--only', null)
const REDO = args.includes('--redo')
if (!slug) { console.error('usage: node cc/run.mjs <slug> [--workers 3] [--only a,b] [--redo]'); process.exit(2) }

// ---- Supabase (log + heartbeat) ----
async function sb(method, path, body, prefer) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { method, headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) }, body: body ? JSON.stringify(body) : undefined })
  if (!r.ok) throw new Error(`supabase ${method} ${path}: ${r.status} ${(await r.text()).slice(0, 300)}`)
  const t = await r.text(); return t ? JSON.parse(t) : null
}
let COUNTRY = null, BASE = {}
const METER = { calls: 0, searches: 0, reads: 0, in_tokens: 0, out_tokens: 0, cost_usd: 0 }
const stamp = () => new Date().toTimeString().slice(0, 8)
async function log(kind, text, chunk, url) {
  console.log(`[${stamp()}] ${(chunk || '-').padEnd(14)} ${kind.padEnd(7)} ${text.slice(0, 140)}${url ? ' ' + url : ''}`)
  try { await sb('POST', 'dossier_log', [{ country_id: COUNTRY.id, chunk, kind, text: text.slice(0, 600), url }]) } catch (e) { console.error('log failed', e.message) }
}
let lastBeat = 0
async function beat(fields = {}, force = false) {
  if (!force && Date.now() - lastBeat < 4000) return
  lastBeat = Date.now()
  const row = { updated_at: new Date().toISOString(), model: MODEL, ...fields }
  for (const k of ['calls', 'searches', 'reads', 'in_tokens', 'out_tokens']) row[k] = (BASE[k] || 0) + METER[k]
  row.cost_usd = Math.round(((Number(BASE.cost_usd) || 0) + METER.cost_usd) * 10000) / 10000
  try { await sb('PATCH', `dossier_runs?country_id=eq.${COUNTRY.id}`, row, 'return=minimal') } catch (e) { console.error('beat failed', e.message) }
}

// ---- python side ----
const py = (argv, { timeout = 600_000 } = {}) => new Promise((resolve, reject) => {
  execFile('python3', [join(DOSSIERS, 'compile.py'), ...argv], { cwd: DOSSIERS, maxBuffer: 64 * 1024 * 1024, timeout, env: process.env }, (err, stdout, stderr) => {
    if (err && err.code !== 1) return reject(new Error(`${err.message}\n${stderr.slice(-800)}`))
    resolve({ code: err ? err.code : 0, stdout, stderr })
  })
})

// ---- the reader as an MCP tool ----
function readerServer(chunkKey) {
  return createSdkMcpServer({
    name: 'reader',
    tools: [tool('read', "Fetch a web page or PDF and return its text. Pass `find` (terms separated by ' | ', e.g. 'Artigo 122 | reagrupamento familiar') to get the passages around those terms instead of the start of the document; consolidated codes are long, so always use `find` for article numbers. Blocked or script-only sites are retried in a real browser.",
      { url: z.string(), find: z.string().nullable().describe("terms separated by ' | '"), max_chars: z.number().int().nullable().describe('2000-20000, default 8000') },
      async ({ url, find, max_chars }) => {
        METER.reads++
        try { const u = new URL(url); await log('read', (u.host.replace(/^www\./, '') + u.pathname).slice(0, 90), chunkKey, url) } catch { await log('read', url.slice(0, 90), chunkKey, url) }
        beat()
        const argv = [slug, '--read', url, '--max-chars', String(max_chars || 8000)]
        if (find) argv.push('--find', find)
        try {
          const { stdout, stderr, code } = await py(argv, { timeout: 240_000 })
          if (code !== 0 && !stdout.trim()) return { content: [{ type: 'text', text: `read failed: ${stderr.slice(-400)}` }], isError: true }
          return { content: [{ type: 'text', text: stdout }] }
        } catch (e) { return { content: [{ type: 'text', text: `read failed: ${e.message.slice(0, 400)}` }], isError: true } }
      })],
  })
}

// ---- one job ----
async function runJob(job, chunkKey, maxTurns) {
  const meta = { calls: 0, searches: 0, reads: 0, in_tokens: 0, out_tokens: 0, cost_usd: 0, error: null }
  const reads0 = METER.reads
  let output = null
  const q = query({ prompt: job.user, options: {
    model: MODEL, effort: 'high', systemPrompt: job.system,
    tools: ['WebSearch'], mcpServers: { reader: readerServer(chunkKey) }, allowedTools: ['WebSearch', 'mcp__reader__read'],
    permissionMode: 'dontAsk', settingSources: [], persistSession: false,
    outputFormat: { type: 'json_schema', schema: job.schema }, maxTurns, cwd: WORK, env: childEnv(),
  } })
  try {
    for await (const m of q) {
      if (m.type === 'assistant') {
        meta.calls++; METER.calls++
        for (const b of m.message?.content || []) {
          if (b.type === 'tool_use' && b.name === 'WebSearch') { meta.searches++; METER.searches++; await log('search', String(b.input?.query || ''), chunkKey) }
        }
        beat()
      } else if (m.type === 'result') {
        const u = m.usage || {}
        meta.in_tokens = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0)
        meta.out_tokens = u.output_tokens || 0
        meta.cost_usd = m.total_cost_usd || 0
        meta.usage = u; meta.num_turns = m.num_turns; meta.model_usage = m.modelUsage || null
        METER.in_tokens += meta.in_tokens; METER.out_tokens += meta.out_tokens; METER.cost_usd += meta.cost_usd
        if (m.subtype === 'success' && m.structured_output) output = m.structured_output
        else meta.error = `${m.subtype}${m.errors ? ': ' + JSON.stringify(m.errors).slice(0, 300) : ''}${m.result ? ' · ' + String(m.result).slice(0, 300) : ''}`
      }
    }
  } catch (e) { meta.error = e.message.slice(0, 600) }
  meta.reads = METER.reads - reads0
  return { output, meta }
}

async function main() {
  const promptsPath = join(WORK, `${slug}-prompts.json`)
  const emit = async () => { const extra = []; if (ONLY) extra.push('--only', ONLY); if (REDO) extra.push('--redo'); const r = await py([slug, '--emit-prompts', promptsPath, ...extra]); console.log(r.stdout.trim()); return JSON.parse(readFileSync(promptsPath, 'utf8')) }
  let P = await emit()
  COUNTRY = P.country
  BASE = (await sb('GET', `dossier_runs?country_id=eq.${COUNTRY.id}&select=*`))[0] || {}
  if (!BASE.started_at || ['preparing', 'queued'].includes(BASE.status)) {
    await sb('PATCH', `dossier_runs?country_id=eq.${COUNTRY.id}`, { status: 'mapping', started_at: new Date().toISOString(), chunks_total: P.chunks_total, questions_total: 64, note: null }, 'return=minimal')
    BASE = (await sb('GET', `dossier_runs?country_id=eq.${COUNTRY.id}&select=*`))[0]
  }
  if (P.map) {
    await beat({ status: 'mapping', note: `Mapping ${COUNTRY.name}'s law: which acts, which portals, which treaties.` }, true)
    await log('step', 'Mapping the law: the instruments, treaties and portals', 'map')
    const r = await runJob(P.map, 'map', 90)
    if (!r.output) { await log('error', `law map failed: ${r.meta.error}`, 'map'); await beat({ status: 'error', note: `Law map failed: ${r.meta.error}` }, true); process.exit(1) }
    const f = join(WORK, `${slug}-map.json`); writeFileSync(f, JSON.stringify(r, null, 1))
    await py([slug, '--ingest-map', f])
    P = await emit()
  }
  const chunks = P.chunks
  let done = P.done.length, qDone = 0, errors = 0
  const QN = Object.fromEntries(chunks.map(c => [c.key, c.qids.length]))
  const prior = await sb('GET', `dossier_chunks?country_id=eq.${COUNTRY.id}&status=eq.done&select=question_ids`)
  qDone = prior.reduce((a, r) => a + (r.question_ids?.length || 0), 0)
  await beat({ status: 'coding', chunks_done: done, questions_done: qDone, note: `Coding ${COUNTRY.name}: ${chunks.length} chunks of indicators, ${WORKERS} at a time, through Claude Code.` }, true)
  console.log(`${COUNTRY.name}: ${chunks.length} chunks to code (${done} already done)`)
  const queue = [...chunks]
  const worker = async () => {
    while (queue.length) {
      const job = queue.shift()
      await sb('POST', 'dossier_chunks', [{ country_id: COUNTRY.id, key: job.key, label: job.label, question_ids: job.qids, status: 'running', started_at: new Date().toISOString(), error: null }], 'resolution=merge-duplicates,return=minimal')
      await log('step', `Started: ${job.label} (${job.qids.length} indicators)`, job.key)
      const r = await runJob(job, job.key, 80)
      const f = join(WORK, `${slug}-${job.key}.json`); writeFileSync(f, JSON.stringify(r, null, 1))
      const { code } = await py([slug, '--ingest-chunk', job.key, f])
      if (code === 0) { done++; qDone += QN[job.key] } else errors++
      await beat({ chunks_done: done, questions_done: qDone, note: `Coding ${COUNTRY.name}: ${done} of ${P.chunks_total} chunks done${errors ? `, ${errors} failed` : ''}.` }, true)
    }
  }
  await Promise.all(Array.from({ length: Math.min(WORKERS, chunks.length) }, worker))
  const status = errors ? 'error' : 'coded'
  await beat({ status, chunks_done: done, questions_done: qDone, note: errors ? `${errors} chunk(s) failed; rerun to retry them.` : `All ${P.chunks_total} chunks coded; scoring next.` }, true)
  console.log(`done: ${done} chunks, ${errors} errors, $${METER.cost_usd.toFixed(2)} API-equivalent`)
  process.exit(errors ? 1 : 0)
}
main().catch(e => { console.error(e); process.exit(1) })
