// Checks that `effort: high` in golem.yaml reaches the CLI as `--effort high`,
// and that a bad value is refused before anything is spawned. A fake `claude`
// on PATH records its argv.
//   GOLEMBOT_DIST=/tmp/gb-dist node effort-harness.mjs
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
const DIST = process.env.GOLEMBOT_DIST ?? './node_modules/golembot/dist';
const { createAssistant } = await import(DIST + '/index.js');

const root = join(process.cwd(), 'effort-ws');
rmSync(root, { recursive: true, force: true });
const bin = join(root, 'bin');
mkdirSync(bin, { recursive: true });
const argsFile = join(root, 'argv.txt');
writeFileSync(join(bin, 'claude'), `#!/bin/sh
printf '%s\\n' "$@" > "${argsFile}"
echo '{"type":"result","subtype":"success","is_error":false,"session_id":"fake-1","result":"hi","duration_ms":1,"total_cost_usd":0,"num_turns":1}'
`);
chmodSync(join(bin, 'claude'), 0o755);
process.env.PATH = `${bin}:${process.env.PATH}`;

let failures = 0;
async function run(label, effortLine, expectArg) {
  const dir = join(root, label);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'golem.yaml'), ['name: T', 'engine: claude-code', 'model: claude-fable-5-1', effortLine, 'skipPermissions: true', ''].join('\n'));
  rmSync(argsFile, { force: true });
  const assistant = createAssistant({ dir });
  let error = '';
  try {
    for await (const e of assistant.chat('hi', { sessionKey: 'k' })) if (e.type === 'error') error = e.message;
  } catch (e) { error = e.message; }
  const argv = existsSync(argsFile) ? readFileSync(argsFile, 'utf8').split('\n') : [];
  const i = argv.indexOf('--effort');
  const got = i >= 0 ? argv[i + 1] : undefined;
  const ok = expectArg === 'ERROR' ? /effort must be one of/.test(error) && argv.length === 0 : got === expectArg;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: --effort ${got ?? '(absent)'}${error ? ` | error: ${error.slice(0, 60)}` : ''}`);
  if (!ok) failures++;
}
await run('high', 'effort: high', 'high');
await run('none', '# no effort key', undefined);
await run('bogus', 'effort: turbo', 'ERROR');
rmSync(root, { recursive: true, force: true });
console.log(failures ? `${failures} failure(s)` : 'all passed');
process.exit(failures ? 1 : 0);
