// Runs one phase of the due diligence (../PLAN.md, ../audit.py) through Claude Code on the Max login:
//   sources   Sonnet 5.5, low: opens every cited source and reports what is there (read only)
//   verify    Opus 5.5, high: the second reader, tries to overturn each answer
//   redo      Fable 5.2, xhigh: codes the shaky answers again from the primary sources
//   sources2  the source check over the redo
// Prompts, schemas and models come from audit.py --emit; results go back through --ingest.
//
//   node cc/check.mjs <slug> <phase> [--workers 3] [--only key,key] [--again]
import { query, tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { execFile } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DOSSIERS = dirname(HERE)
const WORK = join(DOSSIERS, 'work')
mkdirSync(WORK, { recursive: true })

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
const [slug, phase] = args
const opt = (k, d) => { const i = args.indexOf(k); return i > 0 ? args[i + 1] : d }
const WORKERS = Number(opt('--workers', 3))
const ONLY = opt('--only', null)
const AGAIN = args.includes('--again')
if (!slug || !phase) { console.error('usage: node cc/check.mjs <slug> sources|verify|redo|sources2 [--workers 3] [--only a,b] [--again]'); process.exit(2) }

async function sb(method, path, body, prefer) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { method, headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) }, body: body ? JSON.stringify(body) : undefined })
  if (!r.ok) throw new Error(`supabase ${method} ${path}: ${r.status} ${(await r.text()).slice(0, 300)}`)
  const t = await r.text(); return t ? JSON.parse(t) : null
}
let COUNTRY = null
const stamp = () => new Date().toTimeString().slice(0, 8)
async function log(kind, text, tag, url) {
  console.log(`[${stamp()}] ${(tag || '-').padEnd(24)} ${kind.padEnd(7)} ${text.slice(0, 140)}${url ? ' ' + url : ''}`)
  try { await sb('POST', 'dossier_log', [{ country_id: COUNTRY.id, chunk: tag, kind, text: text.slice(0, 600), url }]) } catch (e) { console.error('log failed', e.message) }
}

const py = (script, argv, { timeout = 600_000 } = {}) => new Promise((resolve, reject) => {
  execFile('python3', [join(DOSSIERS, script), ...argv], { cwd: DOSSIERS, maxBuffer: 64 * 1024 * 1024, timeout, env: process.env }, (err, stdout, stderr) => {
    if (err && err.code !== 1) return reject(new Error(`${err.message}\n${stderr.slice(-800)}`))
    resolve({ code: err ? err.code : 0, stdout, stderr })
  })
})

function readerServer(tag, meta) {
  return createSdkMcpServer({
    name: 'reader',
    tools: [tool('read', "Fetch a web page or PDF and return its text. Pass `find` (terms separated by ' | ', e.g. 'Artigo 122 | reagrupamento familiar') to get the passages around those terms instead of the start of the document; consolidated codes are long, so always use `find` for article numbers. Blocked or script-only sites are retried in a real browser.",
      { url: z.string(), find: z.string().nullable().describe("terms separated by ' | '"), max_chars: z.number().int().nullable().describe('2000-20000, default 8000') },
      async ({ url, find, max_chars }) => {
        meta.reads++
        try { const u = new URL(url); await log('read', (u.host.replace(/^www\./, '') + u.pathname).slice(0, 90), tag, url) } catch { await log('read', url.slice(0, 90), tag, url) }
        const argv = [slug, '--read', url, '--max-chars', String(max_chars || 8000)]
        if (find) argv.push('--find', find)
        try {
          const { stdout, stderr, code } = await py('compile.py', argv, { timeout: 240_000 })
          if (code !== 0 && !stdout.trim()) return { content: [{ type: 'text', text: `read failed: ${stderr.slice(-400)}` }], isError: true }
          return { content: [{ type: 'text', text: stdout }] }
        } catch (e) { return { content: [{ type: 'text', text: `read failed: ${e.message.slice(0, 400)}` }], isError: true } }
      })],
  })
}

async function runJob(job) {
  const meta = { calls: 0, searches: 0, reads: 0, in_tokens: 0, out_tokens: 0, cost_usd: 0, error: null }
  let output = null
  const q = query({ prompt: job.user, options: {
    model: job.model, effort: job.effort, systemPrompt: job.system,
    tools: job.web ? ['WebSearch'] : [], mcpServers: { reader: readerServer(job.tag, meta) },
    allowedTools: job.web ? ['WebSearch', 'mcp__reader__read'] : ['mcp__reader__read'],
    permissionMode: 'dontAsk', settingSources: [], persistSession: false,
    outputFormat: { type: 'json_schema', schema: job.schema }, maxTurns: job.max_turns, cwd: WORK, env: childEnv(),
  } })
  try {
    for await (const m of q) {
      if (m.type === 'assistant') {
        meta.calls++
        for (const b of m.message?.content || []) {
          if (b.type === 'tool_use' && b.name === 'WebSearch') { meta.searches++; await log('search', String(b.input?.query || ''), job.tag) }
        }
      } else if (m.type === 'result') {
        const u = m.usage || {}
        meta.in_tokens = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0)
        meta.out_tokens = u.output_tokens || 0
        meta.cost_usd = m.total_cost_usd || 0
        meta.num_turns = m.num_turns; meta.model_usage = m.modelUsage || null
        if (m.subtype === 'success' && m.structured_output) output = m.structured_output
        else meta.error = `${m.subtype}${m.errors ? ': ' + JSON.stringify(m.errors).slice(0, 300) : ''}${m.result ? ' · ' + String(m.result).slice(0, 300) : ''}`
      }
    }
  } catch (e) { meta.error = e.message.slice(0, 600) }
  return { output, meta }
}

async function main() {
  const path = join(WORK, `${slug}-${phase}-jobs.json`)
  const extra = []; if (ONLY) extra.push('--only', ONLY); if (AGAIN) extra.push('--again')
  const r0 = await py('audit.py', [slug, '--emit', phase, path, ...extra]); console.log(r0.stdout.trim() || r0.stderr.trim())
  if (r0.code !== 0) process.exit(1)
  const P = JSON.parse(readFileSync(path, 'utf8'))
  COUNTRY = P.country
  let done = 0, errors = 0, cost = 0
  const queue = [...P.jobs]
  const worker = async () => {
    while (queue.length) {
      const job = queue.shift()
      const row = { country_id: COUNTRY.id, phase, key: job.key, status: 'running', model: job.model, effort: job.effort, started_at: new Date().toISOString(), error: null, finished_at: null }
      await sb('POST', 'dossier_check_runs', [row], 'resolution=merge-duplicates,return=minimal')
      await log('step', `Started: ${job.label} (${job.qids.length} indicators, ${job.model})`, job.tag)
      let r = await runJob(job)
      if (!r.output && /overloaded|rate|limit|timeout|ECONN|socket|529|500/i.test(r.meta.error || '')) {
        await log('note', `retrying after: ${(r.meta.error || '').slice(0, 160)}`, job.tag)
        await new Promise(res => setTimeout(res, 90_000)); r = await runJob(job)
      }
      const f = join(WORK, `${slug}-${phase}-${job.key}.json`); writeFileSync(f, JSON.stringify(r, null, 1))
      const ing = await py('audit.py', [slug, '--ingest', phase, job.key, f])
      console.log(ing.stdout.trim())
      const ok = ing.code === 0 && r.output
      const m = r.meta; cost += m.cost_usd
      await sb('PATCH', `dossier_check_runs?country_id=eq.${COUNTRY.id}&phase=eq.${phase}&key=eq.${job.key}`, { status: ok ? 'done' : 'error', error: ok ? null : (m.error || ing.stdout.slice(-600) || 'ingest failed').slice(0, 800),
        calls: m.calls, searches: m.searches, reads: m.reads, in_tokens: m.in_tokens, out_tokens: m.out_tokens, cost_usd: Math.round(m.cost_usd * 10000) / 10000, finished_at: new Date().toISOString() }, 'return=minimal')
      if (ok) done++; else errors++
      await log(ok ? 'step' : 'error', `${ok ? 'Done' : 'Failed'}: ${job.label} · $${m.cost_usd.toFixed(2)} API-equivalent${ok ? '' : ' · ' + (m.error || 'ingest').slice(0, 160)}`, job.tag)
    }
  }
  await Promise.all(Array.from({ length: Math.min(WORKERS, queue.length) }, worker))
  console.log(`${COUNTRY.name} · ${phase}: ${done} done, ${errors} failed, $${cost.toFixed(2)} API-equivalent`)
  process.exit(errors ? 1 : 0)
}
main().catch(e => { console.error(e); process.exit(1) })
