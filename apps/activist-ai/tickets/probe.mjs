#!/usr/bin/env node
// What a ticket run sends before the model has read anything (OLA-356), for no model money: opencode
// runs in the trial's sandbox on a case's files, against a stand-in model server on loopback that
// records the first request and answers "done." with a usage that has a prompt-cache hit in it. It
// prints the request's parts (system prompt, each tool definition, the user's message) in characters
// and estimated tokens, and how opencode reads the cached count back.
//   node apps/activist-ai/tickets/probe.mjs [--case ola-351-ready] [--lean | --default]
import { createServer } from 'node:http'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { here, repo, root, sh, q, runFolders, opencodeConfig, runOpencode } from './lib.mjs'

const argv = process.argv.slice(2)
const caseId = argv.includes('--case') ? argv[argv.indexOf('--case') + 1] : 'ola-351-ready'
const lean = !argv.includes('--default')
const c = JSON.parse(readFileSync(path.join(here, 'cases.json'), 'utf8')).find((x) => x.id === caseId)
if (!c) { console.error(`unknown case ${caseId}`); process.exit(2) }

const bodies = []
const server = createServer((req, res) => {
  let b = ''
  req.on('data', (d) => { b += d })
  req.on('end', () => {
    let body = {}
    try { body = JSON.parse(b) } catch {}
    bodies.push(body)
    const usage = { prompt_tokens: 1000, completion_tokens: 5, total_tokens: 1005, prompt_tokens_details: { cached_tokens: 600 } }
    const base = { id: 'p1', created: Math.floor(Date.now() / 1000), model: 'code' }
    if (body.stream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      res.write(`data: ${JSON.stringify({ ...base, object: 'chat.completion.chunk', choices: [{ index: 0, delta: { role: 'assistant', content: 'done.' }, finish_reason: null }] })}\n\n`)
      res.write(`data: ${JSON.stringify({ ...base, object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`)
      res.write(`data: ${JSON.stringify({ ...base, object: 'chat.completion.chunk', choices: [], usage })}\n\n`)
      res.end('data: [DONE]\n\n')
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ...base, object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: 'done.' }, finish_reason: 'stop' }], usage }))
    }
  })
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const port = server.address().port

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const run = runFolders(path.join(root, 'probe', `${c.id}-${lean ? 'lean' : 'default'}-${stamp}`))
sh(`git -C ${q(repo)} archive ${c.base || `${c.commit}^`} -- ${c.paths.map((x) => `'${x}'`).join(' ')} | tar -x -C ${q(run.work)}`)
const cfg = opencodeConfig('kimi-k3.1-pro', { lean, baseURL: `http://127.0.0.1:${port}/v1` })
writeFileSync(path.join(run.work, 'opencode.jsonc'), JSON.stringify(cfg, null, 2))
sh('git init -q && git add -A && git commit -qm base', run.work)
const s = await runOpencode(run, c.request, { timeLimit: 120, tokenLimit: Infinity, model: 'kimi-k3.1-pro', token: 'probe', lean })
server.close()
bodies.forEach((b, i) => writeFileSync(path.join(run.dir, `request-${i + 1}.json`), JSON.stringify(b, null, 2)))

// The work request is the one with the tools (a run also makes a small call for the session's title).
const first = bodies.find((b) => (b.tools || []).length) || bodies[0]
if (!first) { console.error(`no request reached the stand-in (${s.end}); see ${run.dir}/stderr.txt`); process.exit(1) }
const tok = (n) => Math.round(n / 3.6) // rough: about 3.6 characters a token for English, code and JSON
const len = (x) => (typeof x === 'string' ? x.length : JSON.stringify(x ?? '').length)
const rows = []
for (const [i, m] of (first.messages || []).entries()) rows.push([`message ${i + 1} (${m.role})`, len(m.content)])
for (const t of first.tools || []) rows.push([`tool ${t.function?.name}`, len(t)])
const total = rows.reduce((a, [, n]) => a + n, 0)
console.log(`${bodies.length} requests reached the stand-in, sizes ${bodies.map((b) => JSON.stringify(b).length).join(', ')} characters`)
console.log(`${c.id}, ${lean ? 'lean' : 'default'} configuration: ${(first.messages || []).length} messages, ${(first.tools || []).length} tools, ${total.toLocaleString()} characters, about ${tok(total).toLocaleString()} tokens`)
for (const [name, n] of rows.sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(7)} chars  ~${String(tok(n)).padStart(6)} tok  ${name}`)
console.log(`opencode read the stand-in's usage (1000 in, 600 of them cached, 5 out) as: ${JSON.stringify(s.cache_seen)}; run folder ${run.dir}`)
