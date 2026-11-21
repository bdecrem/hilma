// node workspace/plugins/ola-examples/opencode.check.mjs [path to opencode]
// The plugin inside a real opencode 2.3.0 (Ola's build, opencode-fork/dist), against a stand-in model server on
// 127.0.0.1 that records each request and answers "ok". Proves what the unit tests cannot: opencode loads the
// plugin, calls its context hook, and the worked example is in the system prompt the model receives; with
// OLA_EXAMPLES=off it is not; and a request that is not an app request gets none. No real model is called.
import http from 'node:http'

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OC = process.argv[2] || path.join(HERE, '../../../opencode-fork/dist', `darwin-${process.arch}`, 'opencode')
if (!existsSync(OC)) { console.error(`no opencode at ${OC}`); process.exit(2) }

const bodies = []
const server = http.createServer((q, r) => {
  let b = ''
  q.on('data', (d) => (b += d))
  q.on('end', () => {
    if (q.method === 'POST') bodies.push(b)
    const chunk = (delta, finish) => 'data: ' + JSON.stringify({ id: 'x', object: 'chat.completion.chunk', created: 1, model: 'general', choices: [{ index: 0, delta, finish_reason: finish }], usage: finish ? { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } : undefined }) + '\n\n'
    r.setHeader('content-type', 'text/event-stream')
    r.end(chunk({ role: 'assistant', content: 'ok' }, null) + chunk({}, 'stop') + 'data: [DONE]\n\n')
  })
})
await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
const port = server.address().port

const root = mkdtempSync(path.join(tmpdir(), 'olaex-oc-'))
mkdirSync(path.join(root, 'cfg/opencode'), { recursive: true })
mkdirSync(path.join(root, 'work'))
writeFileSync(path.join(root, 'cfg/opencode/opencode.jsonc'), JSON.stringify({
  providers: { ola: { name: 'Ola', env: ['BOX_API_KEY'], package: '@opencode/ai/providers/openai-compatible', settings: { baseURL: `http://127.0.0.1:${port}/v1` },
    models: { general: { modelID: 'general', name: 'general', capabilities: { tools: true, input: ['text'], output: ['text'] }, limit: { context: 131072, output: 16000 } } } } },
  model: 'ola/general', update: 'disable', share: 'disabled', plugins: [HERE],
  policies: [{ action: 'provider.use', resource: '*', effect: 'deny' }, { action: 'provider.use', resource: 'ola', effect: 'allow' }],
}))

function run(request, extra = {}) {
  bodies.length = 0
  const env = { PATH: '/usr/bin:/bin', HOME: root, BOX_API_KEY: 'stand-in', XDG_CONFIG_HOME: path.join(root, 'cfg'), XDG_DATA_HOME: path.join(root, 'data'),
    XDG_STATE_HOME: path.join(root, 'state'), XDG_CACHE_HOME: path.join(root, 'cache'), OPENCODE_DISABLE_CLAUDE_CODE: '1', ...extra }
  return new Promise((ok) => {
    // async so the stand-in server keeps answering while opencode runs
    import('node:child_process').then(({ spawn }) => {
      const p = spawn(OC, ['run', request], { cwd: path.join(root, 'work'), env, stdio: ['ignore', 'pipe', 'pipe'] })
      const t = setTimeout(() => p.kill('SIGKILL'), 60_000)
      p.on('close', (code) => { clearTimeout(t); ok({ code, sent: bodies.join('\n') }) })
    })
  })
}

let failed = 0
const check = (name, ok) => { console.log(`${ok ? 'pass' : 'FAIL'}  ${name}`); if (!ok) failed++ }

const a = await run('build me a to-do app where each task has a due date')
check('an app request: opencode ran and the model was asked', a.code === 0 && a.sent.length > 0)
check('an app request: the worked example is in what the model received', a.sent.includes('[Ola worked example]') && a.sent.includes('reading list app'))
const b = await run('build me a to-do app where each task has a due date', { OLA_EXAMPLES: 'off' })
check('OLA_EXAMPLES=off: the model received no example', b.code === 0 && b.sent.length > 0 && !b.sent.includes('[Ola worked example]'))
const c = await run('summarize these meeting minutes')
check('not an app request: the model received no example', c.code === 0 && c.sent.length > 0 && !c.sent.includes('[Ola worked example]'))

server.close()
rmSync(root, { recursive: true, force: true })
console.log(failed ? `${failed} of 4 failed` : '4 of 4 passed')
process.exit(failed ? 1 : 0)
