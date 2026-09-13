// Checks that `workdir:` in golem.yaml makes the CLI run inside that directory
// with the assistant directory's CLAUDE.md appended as system prompt — and
// that without the key nothing changes. A fake `claude` records argv and cwd.
//   GOLEMBOT_DIST=/tmp/gb-pkg/dist node workdir-harness.mjs
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync, chmodSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
const DIST = process.env.GOLEMBOT_DIST ?? './node_modules/golembot/dist';
const { createAssistant } = await import(DIST + '/index.js');

const root = join(process.cwd(), 'workdir-ws');
rmSync(root, { recursive: true, force: true });
const bin = join(root, 'bin');
const repo = join(root, 'repo');
mkdirSync(bin, { recursive: true });
mkdirSync(repo, { recursive: true });
const argsFile = join(root, 'argv.txt');
const cwdFile = join(root, 'cwd.txt');
writeFileSync(join(bin, 'claude'), `#!/bin/sh
pwd > "${cwdFile}"
printf '%s\\0' "$@" > "${argsFile}"
echo '{"type":"result","subtype":"success","is_error":false,"session_id":"fake-1","result":"hi","duration_ms":1,"total_cost_usd":0,"num_turns":1}'
`);
chmodSync(join(bin, 'claude'), 0o755);
process.env.PATH = `${bin}:${process.env.PATH}`;

let failures = 0;
const check = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) failures++; };

async function run(label, extraYaml) {
  const dir = join(root, label);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'golem.yaml'), ['name: T', 'engine: claude-code', 'model: claude-fable-5-1', 'skipPermissions: true',
    'systemPrompt: PERSONA MARKER 4711', ...extraYaml, ''].join('\n'));
  rmSync(argsFile, { force: true });
  rmSync(cwdFile, { force: true });
  const assistant = createAssistant({ dir });
  let error = '';
  try {
    for await (const e of assistant.chat('hi', { sessionKey: 'k' })) if (e.type === 'error') error = e.message;
  } catch (e) { error = e.message; }
  // NUL-separated: the appended persona is multi-line.
  const argv = existsSync(argsFile) ? readFileSync(argsFile, 'utf8').split('\0') : [];
  const cwd = existsSync(cwdFile) ? readFileSync(cwdFile, 'utf8').trim() : '';
  const i = argv.indexOf('--append-system-prompt');
  return { dir, argv, cwd, appended: i >= 0 ? argv[i + 1] : undefined, error };
}

const a = await run('with', [`workdir: ${repo}`]);
check(a.cwd.endsWith('/workdir-ws/repo'), `workdir set → CLI runs in the repo (${a.cwd.split('/').slice(-2).join('/')})`);
check(!!a.appended && a.appended.includes('PERSONA MARKER 4711'), 'persona (assistant dir CLAUDE.md) appended as system prompt');
check(a.appended?.includes('## System Instructions'), 'the appended text is the generated AGENTS.md');
check(existsSync(join(a.dir, '.golem', 'sessions.json')), 'session state still lives in the assistant directory');
const ss = a.argv.indexOf('--setting-sources');
check(ss >= 0 && a.argv[ss + 1] === 'project,local', 'user-level settings (this machine\'s plugins) excluded');

const b = await run('without', []);
check(b.cwd.endsWith('/workdir-ws/without'), `no workdir → CLI runs in the assistant directory (${b.cwd.split('/').slice(-1)})`);
check(b.appended === undefined, 'no workdir → nothing appended');
check(!b.argv.includes('--setting-sources'), 'no workdir → setting sources untouched');

const c = await run('missing', [`workdir: ${join(root, 'does-not-exist')}`]);
check(/workdir does not exist/.test(c.error) && c.argv.length === 0, `missing workdir → refused before spawning (${c.error.slice(0, 40)})`);

rmSync(root, { recursive: true, force: true });
console.log(failures ? `${failures} failure(s)` : 'all passed');
process.exit(failures ? 1 : 0);
