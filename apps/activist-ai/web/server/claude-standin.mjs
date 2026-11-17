// The front desk's Claude routes (frontdesk/claude.mjs), stood in for by dev.mjs: no VM, no
// Claude Code, no Anthropic. It keeps the setting in memory and plays one scripted run in the
// same NDJSON the front desk sends (its own lines plus Claude Code's stream-json events, already
// typed), so the page's Settings view, the drawer's choice, the marking, approvals, Stop and "Ask
// Claude instead" can be checked in a browser. The real path is proven by frontdesk/check.mjs.
//
//   "write <name> saying <word>"  writes <name> into the dev folder (after a yes under "Ask me first")
//   "please fail"                 ends in an error
//   "slow"                        works for 30 s, one step every 2 s (for Stop)
//   OLA_DEV_CLAUDE=unset          Claude is not set up: the setting cannot be turned on
import fs from 'node:fs'
import path from 'node:path'

// WebKit holds back the first bytes of a streamed reply (to sniff its type) until it has about 512;
// a blank line of 1 KiB first lets every later line through at once. Blank lines are skipped.
export const PAD = ' '.repeat(1024) + '\n'

export function makeClaudeStandin({ work, role = () => 'owner' }) {
  const st = { enabled: false, auto: 'ask', used: 0 }
  const runs = new Map()
  const history = new Map() // conversation -> records
  const configured = process.env.OLA_DEV_CLAUDE !== 'unset'
  const info = () => ({
    enabled: st.enabled,
    auto: st.auto,
    canChange: role() === 'owner',
    mode: 'api_key',
    configured,
    unavailable: configured ? null : 'Claude is not set up on this machine yet: there is no Anthropic account to use. Bart can set it up.',
    month: { unit: 'usd', used: st.used, cap: 25, reported: true },
    running: null,
  })
  const json = (res, status, body) => res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(body))
  const read = async (req) => {
    let raw = ''
    for await (const c of req) raw += c
    try {
      return JSON.parse(raw || '{}')
    } catch {
      return null
    }
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  async function play(run, body) {
    const say = (e) => {
      run.events.push(e)
      for (const r of run.clients) r.write(JSON.stringify(e) + '\n' + (e.ola === 'approval' ? PAD : ''))
    }
    const end = (reason, extra = {}) => {
      say({ ola: 'ended', reason, ...extra })
      run.ended = true
      for (const r of run.clients) r.end()
      st.used = Math.round((st.used + 0.04) * 100) / 100
    }
    say({ ola: 'started', run: run.id, at: run.at, autonomy: body.autonomy, why: body.why })
    say({ type: 'system', subtype: 'init', model: 'claude-opus-5-5' })
    await sleep(300)
    if (/please fail/.test(body.request)) {
      say({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'Claude could not finish this request.', usage: { input_tokens: 1200, output_tokens: 20 } })
      return end('failed')
    }
    if (/slow/.test(body.request)) {
      for (let i = 0; i < 15 && !run.stop; i++) {
        say({ type: 'assistant', message: { id: `m${i}`, content: [{ type: 'tool_use', id: `t${i}`, name: 'Bash', input: { command: 'sleep 2', description: 'Wait' } }] } })
        await sleep(2000)
        say({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: `t${i}`, is_error: false, content: '' }] } })
      }
      return end(run.stop ? 'stopped' : 'done')
    }
    const w = /write (\S+) saying (\S+)/.exec(body.request)
    if (w) {
      say({ type: 'assistant', message: { id: 'm1', content: [{ type: 'text', text: `I will write ${w[1]}.` }, { type: 'tool_use', id: 'toolu_1', name: 'Write', input: { file_path: `/work/${w[1]}`, content: `${w[2]}\n` } }] } })
      let allowed = true
      if (body.autonomy === 'ask') {
        const decision = await new Promise((resolve) => {
          run.answer = resolve
          say({ ola: 'approval', request_id: 'req_1', tool_name: 'Write', input: { file_path: `/work/${w[1]}`, content: `${w[2]}\n` }, tool_use_id: 'toolu_1' })
          const beat = setInterval(() => (run.answer ? [...run.clients].forEach((r) => r.write('\n')) : clearInterval(beat)), 1000)
        })
        run.answer = null
        if (run.stop) return end('stopped')
        say({ ola: 'answered', request_id: 'req_1', decision })
        allowed = decision !== 'reject'
      }
      if (allowed) fs.writeFileSync(path.join(work, w[1]), `${w[2]}\n`)
      say({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_1', is_error: !allowed, content: allowed ? `File created successfully at: /work/${w[1]}` : 'The person said no.' }] } })
      const text = allowed ? `Done. It is in your Files as ${w[1]}.` : `I did not write ${w[1]}, because you said no.`
      say({ type: 'assistant', message: { id: 'm2', content: [{ type: 'text', text }] } })
      say({ type: 'result', subtype: 'success', is_error: false, result: text, usage: { input_tokens: 2400, output_tokens: 40 } })
      return end('done')
    }
    say({ type: 'assistant', message: { id: 'm1', content: [{ type: 'text', text: 'Hello from Claude, the stand-in.' }] } })
    say({ type: 'result', subtype: 'success', is_error: false, result: 'Hello from Claude, the stand-in.', usage: { input_tokens: 1200, output_tokens: 20 } })
    end('done')
  }

  handle.info = info
  handle.st = st
  return handle
  async function handle(req, res, p, url) {
    if (p === '/api/claude' && req.method === 'GET') return json(res, 200, info()), true
    if (!p.startsWith('/api/claude/')) return false
    const what = p.slice('/api/claude/'.length)
    if (what === 'turns') return json(res, 200, { runs: history.get(url.searchParams.get('conversation')) ?? [] }), true
    if (what === 'follow') {
      const run = runs.get(url.searchParams.get('run'))
      if (!run) return json(res, 404, { error: 'not_found' }), true
      res.writeHead(200, { 'content-type': 'application/x-ndjson', 'x-content-type-options': 'nosniff' }).write(PAD)
      for (const e of run.events) res.write(JSON.stringify(e) + '\n')
      if (run.ended) res.end()
      else run.clients.add(res)
      return true
    }
    const body = await read(req)
    if (!body) return json(res, 400, { error: 'bad_json' }), true
    if (what === 'settings') {
      if (body.enabled === true && (body.consent !== true || !configured)) return json(res, 400, { error: 'consent', message: 'Read the note and confirm to turn this on.' }), true
      if (role() !== 'owner') return json(res, 403, { error: 'owner_only', message: 'Only the project’s owner can change this.' }), true
      if (typeof body.enabled === 'boolean') st.enabled = body.enabled
      if (['ask', 'stuck', 'always'].includes(body.auto)) st.auto = body.auto
      return json(res, 200, info()), true
    }
    if (what === 'run') {
      // "Just this once" (the stretch card): the owner, with the switch left off.
      if (!st.enabled && !(body.once === true && role() === 'owner')) return json(res, 403, { error: 'claude_off', message: 'Fallback to Claude is off for this project. Its owner can turn it on in Settings.' }), true
      if (body.once === true && !st.enabled) st.onceRuns = (st.onceRuns ?? 0) + 1
      const id = `c${Date.now().toString(36)}`
      const run = { id, at: Date.now(), events: [], clients: new Set([res]), ended: false, answer: null, stop: false }
      runs.set(id, run)
      const rec = { run: id, at: run.at, autonomy: body.autonomy, why: body.why, request: body.request, events: run.events, active: true }
      history.set(body.conversation, [...(history.get(body.conversation) ?? []), rec])
      res.writeHead(200, { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }).write(PAD)
      res.on('close', () => run.clients.delete(res))
      play(run, body).finally(() => (rec.active = false))
      return true
    }
    const run = runs.get(body.run)
    if (!run) return json(res, 404, { error: 'not_found' }), true
    if (what === 'answer') return run.answer?.(body.decision), json(res, 200, { ok: true }), true
    if (what === 'stop') return (run.stop = true), run.answer?.('reject'), json(res, 200, { ok: true }), true
    return json(res, 404, { error: 'not_found' }), true
  }
}
