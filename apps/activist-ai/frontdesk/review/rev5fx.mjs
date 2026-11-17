// Review 5's follow-up (2026-11-17): proofs in one workspace VM of its own (fx-a, under ~/.ola-fx),
// never against a deployed front desk, never with a real credential. Each proof runs the way before
// the fix (`--before`) and the way after it, so it fails before and passes after.
//   node frontdesk/review/rev5fx.mjs twin [--before]     "Compare with Claude": a process the agent's
//                                                       user left running stops the copy-maker and
//                                                       writes its mark into every file of the copy it
//                                                       can reach. Before: ola-twin make as the agent's
//                                                       user (main's script, REV5FX_OLD_TWIN). After:
//                                                       gather as the agent's user, make as `twin`.
//   node frontdesk/review/rev5fx.mjs runner [--before]  batch jobs: can the agent's user read the job
//                                                       runner's key (its environment, pipes, memory)?
//                                                       Before: the runner as work:work. After: as
//                                                       work:olarun (`--user 1000:1001`).
//   node frontdesk/review/rev5fx.mjs --destroy          removes fx-a and the state
// Prints one line per proof, `pass` or `FAIL`; exits 1 if any fails. Needs image 2.3.0-20.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { twinAnswer } from '../../web/server/fake-twin.mjs'
import { RUNNER_PEEK, TWIN_ATTACK } from '../test/attacks.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const AI = path.resolve(HERE, '../..')
const CTR = '/usr/local/bin/container'
const WS = 'fx-a'
const C = `ola-${WS}`
const base = { ...process.env, OLA_HOME: path.join(homedir(), '.ola-fx'), OLA_MAX_RUNNING: '1', OLA_RUNNING_SCOPE: 'home', OLA_GATEWAY_PORT: '4193', OLA_GATEWAY_DOORS: path.join(homedir(), '.ola-fx', 'gw') }
Object.assign(process.env, { OLA_HOME: base.OLA_HOME, OLA_MAX_RUNNING: '1', OLA_RUNNING_SCOPE: 'home', OLA_GATEWAY_DOORS: base.OLA_GATEWAY_DOORS })
const argv = process.argv.slice(2)
const BEFORE = argv.includes('--before')
let failed = 0
const proof = (name, pass, detail) => {
  if (!pass) failed++
  console.log(`${pass ? 'pass' : 'FAIL'}  ${name}${BEFORE ? ' [before the fix]' : ''}  (${typeof detail === 'string' ? detail : JSON.stringify(detail)})`)
}
const sh = (cmd, input, user = '1000') => spawnSync(CTR, ['exec', '-i', '--user', user, C, 'sh', '-c', cmd], { input: input ?? '', encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

if (argv.includes('--destroy')) {
  spawnSync(process.execPath, [path.join(AI, 'workspace/ws.mjs'), 'destroy', WS, '--confirm', WS], { env: base, stdio: 'inherit' })
  rmSync(base.OLA_HOME, { recursive: true, force: true })
  process.exit(0)
}
if (existsSync(path.join(homedir(), 'ola-deploy.hold'))) {
  console.log('a deploy is waiting (~/ola-deploy.hold): no VM started')
  process.exit(2)
}
const ws = await import('../../workspace/ws.mjs')
if (!existsSync(ws.paths(WS).meta)) {
  const r = spawnSync(process.execPath, [path.join(AI, 'workspace/ws.mjs'), 'create', WS, '--memory', '2g', '--disk', '2g', '--cpus', '2'], { env: base, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`create: ${r.stderr}`)
}
await ws.waitForRoom([WS], 1)
await ws.start(WS)

// ---------------------------------------------------------------- the made-up copy
if (argv.includes('twin')) {
  const PORT = 4996
  // Ola's own model, scripted, on the VM's loopback: the copy fake-twin.mjs makes (30 invented rows).
  const reply = twinAnswer({ messages: [{ role: 'system', content: 'OLA-TWIN-MAKER' }, { role: 'user', content: 'The task:\nClean roster.csv: drop the repeated people and say how many there were.' }] })
  const body = JSON.stringify({ id: 'x', object: 'chat.completion', created: 0, model: 'general', choices: [{ index: 0, message: { role: 'assistant', content: reply.content }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } })
  sh('mkdir -p /tmp/fx && cat > /tmp/fx/reply.json', body)
  sh(`cat > /tmp/fx/model.py; (nohup setsid python3 -I /tmp/fx/model.py >/dev/null 2>&1 &); sleep 1`, `import http.server\nR = open("/tmp/fx/reply.json", "rb").read()\nclass H(http.server.BaseHTTPRequestHandler):\n    def do_POST(self):\n        self.rfile.read(int(self.headers.get("content-length") or 0))\n        self.send_response(200)\n        self.send_header("content-type", "application/json")\n        self.send_header("content-length", str(len(R)))\n        self.end_headers()\n        self.wfile.write(R)\n    def log_message(self, *a):\n        pass\nhttp.server.ThreadingHTTPServer(("127.0.0.1", ${PORT}), H).serve_forever()\n`)
  sh(`printf 'person,shift\\nZebulon Quartermaine,Harbor\\nIlse Brandvold,Night\\n' > /work/roster.csv; rm -rf /work/.ola/twins /tmp/fx-attack.log`)
  // The agent's leftover: the same attacker as frontdesk/check.mjs's.
  sh('cat > /tmp/fx/attack.py; (nohup setsid python3 -I /tmp/fx/attack.py >/dev/null 2>&1 &)', TWIN_ATTACK)
  await sleep(500)
  const id = '0f0f0f0f0f' + String(Date.now() % 90 + 10)
  const env = `OLA_BATCH_GATEWAY=http://127.0.0.1:${PORT}`
  let out
  if (BEFORE) {
    // main's ola-twin (before the follow-up), as the agent's user, as the front desk ran it.
    const old = readFileSync(process.env.REV5FX_OLD_TWIN || path.join(HERE, 'old-ola-twin'), 'utf8')
    sh('cat > /tmp/fx/old-ola-twin', old)
    out = spawnSync(CTR, ['exec', '-i', '--user', '1000', '-e', env, C, 'python3', '-I', '/tmp/fx/old-ola-twin', 'make', id], { input: JSON.stringify({ request: 'Clean roster.csv: drop the repeated people and say how many there were.', context: '', files: ['roster.csv'] }), encoding: 'utf8' }).stdout
  } else {
    const g = spawnSync(CTR, ['exec', '-i', '--user', '1000', C, '/opt/ola/bin/ola-twin', 'gather'], { input: JSON.stringify({ files: ['roster.csv'] }), encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }).stdout
    out = spawnSync(CTR, ['exec', '-i', '--user', '1002:1002', '-e', env, C, '/opt/ola/bin/ola-twin', 'make', id], { input: JSON.stringify({ request: 'Clean roster.csv: drop the repeated people and say how many there were.', context: '', gathered: JSON.parse(g.trim().split('\n').pop()) }), encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }).stdout
  }
  await sleep(1500)
  sh('for p in /proc/[0-9]*; do grep -q /tmp/fx/attack.py $p/cmdline 2>/dev/null && kill ${p#/proc/} 2>/dev/null; done; true; for p in /proc/[0-9]*; do grep -q /tmp/fx/model.py $p/cmdline 2>/dev/null && kill ${p#/proc/} 2>/dev/null; done; true')
  let copy = {}
  try {
    copy = JSON.parse(out.trim().split('\n').pop())
  } catch {}
  const log = sh('cat /tmp/fx-attack.log 2>/dev/null').stdout.split('\n').filter(Boolean)
  const marked = (copy.files ?? []).some((f) => Buffer.from(f.b64, 'base64').toString('latin1').includes('FXMARK'))
  const stopped = log.filter((l) => / stop WORKED/.test(l)).length
  const wrote = log.filter((l) => l.startsWith('wrote ')).length
  proof('a process the agent’s user left running cannot stop the copy-maker or change the copy it releases', copy.leak && !marked && stopped === 0 && wrote === 0, `${copy.leak ? `copy ${copy.leak.verdict}` : `no copy: ${out.slice(0, 200)}`}; the copy carries the attacker’s mark: ${marked}; maker stopped ${stopped} times; files written ${wrote}; maker seen ${log.filter((l) => l.startsWith('maker ')).length} times`)
}

// ---------------------------------------------------------------- the job runner's key
if (argv.includes('runner')) {
  const KEY = 'f'.repeat(64)
  sh('mkdir -p /tmp/fx && cat > /tmp/fx/ola-batch', 'import sys, time\nk = sys.stdin.readline()\ntime.sleep(20)\n')
  // The runner as the front desk starts it: after the fix in a group of its own, before as work:work.
  const user = BEFORE ? '1000:1000' : '1000:1001'
  spawnSync('/bin/sh', ['-c', `printf '%s\\n' ${KEY} | ${CTR} exec -i --user ${user} -e OLA_RUNNER_PROBE=${KEY} ${C} python3 -I /tmp/fx/ola-batch run 0123456789ab --key-stdin >/dev/null 2>&1 &`])
  await sleep(1500)
  sh('cat > /tmp/fx/peek.py', RUNNER_PEEK)
  const r = sh('python3 -I /tmp/fx/peek.py').stdout.trim()
  const env = sh(`for p in /proc/[0-9]*; do tr '\\0' '\\n' < $p/environ 2>/dev/null | grep -q OLA_RUNNER_PROBE=${KEY} && echo found; done; true`).stdout.trim()
  proof('the agent’s user cannot read the job runner’s key from its environment, its pipes or its memory', /^runner \d+: environ refused, fd refused, mem refused, maps refused$/.test(r) && !env, `${r}; the key in a readable environment: ${env ? 'yes' : 'no'}`)
  sh('for p in /proc/[0-9]*; do grep -q /tmp/fx/ola-batch $p/cmdline 2>/dev/null && kill ${p#/proc/} 2>/dev/null; done; true', '', '1000:1001')
}

ws.stop(WS)
process.exit(failed ? 1 : 0)
