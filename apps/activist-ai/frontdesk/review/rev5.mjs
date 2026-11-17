// The fifth outside review's harness (2026-11-17): proofs in one workspace VM of its own (r5-a,
// under ~/.ola-rev5), never against a deployed front desk, never with a real credential.
//   node frontdesk/review/rev5.mjs probe       what the VM's kernel offers a sandbox (prints only)
//   node frontdesk/review/rev5.mjs twin        "Compare with Claude": can the copy's generator (code
//                                             a model wrote, run by ola-twin as the agent's user)
//                                             read the project? Runs THIS checkout's
//                                             workspace/lib/olatwin.py in the VM against a planted
//                                             /work/secret.csv, with one generator per known
//                                             escape from a Python audit hook.
//   node frontdesk/review/rev5.mjs --destroy   removes r5-a and the state
// Prints one line per proof, `pass` or `FAIL`; exits 1 if any fails.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const AI = path.resolve(HERE, '../..')
const CTR = '/usr/local/bin/container'
const WS = 'r5-a'
const C = `ola-${WS}`
const base = { ...process.env, OLA_HOME: path.join(homedir(), '.ola-rev5'), OLA_MAX_RUNNING: '1', OLA_RUNNING_SCOPE: 'home', OLA_GATEWAY_PORT: '4195', OLA_GATEWAY_DOORS: path.join(homedir(), '.ola-rev5', 'gw') }
Object.assign(process.env, { OLA_HOME: base.OLA_HOME, OLA_MAX_RUNNING: '1', OLA_RUNNING_SCOPE: 'home', OLA_GATEWAY_DOORS: base.OLA_GATEWAY_DOORS })
const argv = process.argv.slice(2)
let failed = 0
const proof = (name, pass, detail) => {
  if (!pass) failed++
  console.log(`${pass ? 'pass' : 'FAIL'}  ${name}  (${typeof detail === 'string' ? detail : JSON.stringify(detail)})`)
}
const sh = (cmd, input, user = '1000') => spawnSync(CTR, ['exec', '-i', '--user', user, C, 'sh', '-c', cmd], { input: input ?? '', encoding: 'utf8' })

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

if (argv.includes('sh')) {
  // REV5_SH: one shell command in the VM as the agent's user, for looking around while proving.
  sh('mkdir -p /tmp/r5/lib && cat > /tmp/r5/lib/olatwin.py', readFileSync(path.join(AI, 'workspace/lib/olatwin.py'), 'utf8'))
  sh('cat > /tmp/r5/lib/common-words.txt', readFileSync(path.join(AI, 'workspace/lib/common-words.txt'), 'utf8'))
  if (process.env.REV5_PY) sh('cat > /tmp/r5/dbg.py', readFileSync(process.env.REV5_PY, 'utf8'))
  const r = sh(process.env.REV5_SH ?? 'true')
  console.log(r.stdout, r.stderr)
}
if (argv.includes('probe')) {
  const r = sh('id; uname -r; cat /proc/sys/kernel/yama/ptrace_scope 2>&1; cat /sys/kernel/security/lsm 2>&1; cat /proc/sys/kernel/unprivileged_userns_clone 2>&1; cat /proc/sys/user/max_user_namespaces 2>&1; unshare -rmn true && echo userns-ok; which bwrap setpriv unshare; ls -ld /work /work/.ola; python3 --version')
  console.log(r.stdout, r.stderr)
}

// ---------------------------------------------------------------- the copy's generator
if (argv.includes('twin')) {
  const SECRET = 'Zebulon Quartermaine,48213.77'
  sh('mkdir -p /tmp/r5/lib && cat > /tmp/r5/lib/olatwin.py', readFileSync(process.env.REV5_OLATWIN || path.join(AI, 'workspace/lib/olatwin.py'), 'utf8'))
  sh('cat > /tmp/r5/lib/common-words.txt', readFileSync(path.join(AI, 'workspace/lib/common-words.txt'), 'utf8'))
  sh(`printf 'name,amount\\n${SECRET}\\n' > /work/secret.csv`)
  // Each generator tries to copy /work/secret.csv into its own folder, encoded so the leak check
  // would not see it (each character as a number over 1000).
  const enc = 'lambda s: "id,amount\\n" + "\\n".join(f"{i},{ord(c)+1000}" for i, c in enumerate(s))'
  const escapes = {
    // the audit hook reads its rules from the runner's module globals, which the generator can reach
    main_globals: `import sys\nm = sys.modules['__main__']\nm.inside = lambda p, roots: True\ns = open('/work/secret.csv').read()`,
    // a function's code object is writable: the hook itself, found through the garbage collector
    hook_code: `import gc, sys\nfor f in gc.get_objects():\n    if getattr(f, '__name__', '') == 'hook' and hasattr(f, '__code__'):\n        f.__code__ = (lambda ev, args: None).__code__\ns = open('/work/secret.csv').read()`,
    // a process started without the subprocess module raises no audit event (Python 3.11's signature)
    fork_exec: `import _posixsubprocess, os\nr, w = os.pipe()\ner, ew = os.pipe()\n_posixsubprocess.fork_exec([b'/bin/cat', b'/work/secret.csv'], [b'/bin/cat'], True, (w, ew), None, None, -1, -1, -1, w, -1, -1, er, ew, False, False, -1, None, None, None, -1, None, False)\nos.close(w)\nimport time\ntime.sleep(1)\ns = os.read(r, 65536).decode()`,
  }
  for (const [name, body] of Object.entries(escapes)) {
    const src = `def make(out, rng):\n${body.split('\n').map((l) => '    ' + l).join('\n')}\n    (out / 'data.csv').write_text((${enc})(s))\n    return {'n': len(s)}\n`
    const py = `import sys, json\nsys.path.insert(0, '/tmp/r5/lib')\nimport olatwin as T\nfrom pathlib import Path\nimport shutil\nd = Path('/work/.ola/twins/r5-${name}')\nshutil.rmtree(d, ignore_errors=True)\ntry:\n    truth, files = T.run_generator(sys.stdin.read(), d, 1)\nexcept Exception as e:\n    print(json.dumps({'refused': str(e)[:160]})); sys.exit(0)\ntext = (d / 'data.csv').read_text() if (d / 'data.csv').exists() else ''\ngot = ''.join(chr(int(l.split(',')[1]) - 1000) for l in text.splitlines()[1:] if l.count(',') == 1)\nidx = T.Index(); idx.add_text(open('/work/secret.csv').read()); idx.add_name('secret.csv')\nprint(json.dumps({'got': got[:60], 'verdict': T.check_leaks(idx, {'request': 'Total the amount column.', 'checks': [], 'files': T.twin_view(d, files)})['verdict']}))\n`
    sh(`cat > /tmp/r5gen.py`, py)
    const r = sh('python3 -I /tmp/r5gen.py', src)
    let j = {}
    try {
      j = JSON.parse(r.stdout.trim().split('\n').pop())
    } catch {
      j = { error: (r.stderr || r.stdout).slice(-200) }
    }
    const leaked = String(j.got ?? '').includes('Quartermaine')
    proof(`the copy's generator cannot read the project (${name})`, !leaked, leaked ? `read it; the leak check said ${j.verdict}` : j.refused ?? j.error ?? 'nothing read')
  }
  // The unit tests in the VM, with this checkout's library: the jail's own proofs (twin_test.py).
  const u = sh('cd /tmp/r5 && python3 -I -', readFileSync(path.join(AI, 'workspace/twin_test.py'), 'utf8'))
  for (const line of u.stdout.split('\n')) if (/^FAIL /.test(line) || /jail|no jail/.test(line)) console.log(`   twin_test.py: ${line}`)
  proof('twin_test.py passes in the VM with this checkout\'s olatwin.py', u.status === 0, u.stdout.trim().split('\n').pop() + u.stderr.slice(-300))
}

// ---------------------------------------------------------------- what Claude Code really sends
// The gateway now refuses server tools, MCP connectors and files by URL or id (claude.mjs
// outsideReach). This runs the image's Claude Code under THIS checkout's ola-claude against review
// 4's stand-in (on the VM's own loopback, recording every body) and checks that nothing Claude Code
// sends on its own would be refused.
if (argv.includes('claudebody')) {
  const PORT = 4998
  const fake = readFileSync(path.join(HERE, 'rev4-fake-anthropic.py'), 'utf8').replace('        if self.path.startswith("/v1/messages/count_tokens"):', '        open("/tmp/r5-bodies.jsonl", "a").write(json.dumps(body) + "\\n")\n        if self.path.startswith("/v1/messages/count_tokens"):')
  if (!fake.includes('r5-bodies')) throw new Error('the stand-in was not changed to record')
  sh('rm -f /tmp/r5-bodies.jsonl; cat > /tmp/r5-fa.py', fake)
  sh(`(nohup setsid python3 -I /tmp/r5-fa.py ${PORT} >/tmp/r5-fa.log 2>&1 &) ; sleep 1`)
  const script = readFileSync(path.join(AI, 'workspace/ola-claude'), 'utf8').replace('http://127.0.0.1:4180/anthropic', `http://127.0.0.1:${PORT}`)
  sh('cat > /tmp/r5-ola-claude', script)
  for (const [mode, ask] of [['go', 'write r5-hello.txt'], ['ask', 'say hello']]) {
    const msg = JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: ask }] }, parent_tool_use_id: null, session_id: '' }) + '\n'
    spawnSync(CTR, ['exec', '-i', C, 'sh', '-c', `timeout 90 sh /tmp/r5-ola-claude ${mode} r5conv r5${mode} asked`], { input: msg, encoding: 'utf8', timeout: 120_000 })
  }
  const bodies = sh('cat /tmp/r5-bodies.jsonl').stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l))
  const { outsideReach } = await import('../../gateway/claude.mjs')
  const refused = bodies.map((b) => outsideReach(b)).filter(Boolean)
  const types = [...new Set(bodies.flatMap((b) => (b.tools ?? []).map((t) => t.type ?? '(none)')))]
  proof('every request the image’s Claude Code sent passes the gateway’s new check', bodies.length > 0 && refused.length === 0, `${bodies.length} requests, tool types ${types.join(', ')}${refused.length ? `; refused: ${refused.join(', ')}` : ''}`)
}

ws.stop(WS)
process.exit(failed ? 1 : 0)
