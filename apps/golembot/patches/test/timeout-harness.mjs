// Drives the patched assistant with a stubbed engine: the first run hangs until
// the time limit kills it; the next turn in the same conversation must open
// with the cut-off briefing, and the turn after that must not.
//   GOLEMBOT_DIST=/tmp/gb-dist node timeout-harness.mjs
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
const DIST = process.env.GOLEMBOT_DIST ?? './node_modules/golembot/dist';
const { createAssistant } = await import(DIST + '/index.js');
const { ClaudeCodeEngine } = await import(DIST + '/engines/claude-code.js');

const dir = join(process.cwd(), 'timeout-ws');
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'golem.yaml'), ['name: T', 'engine: claude-code', 'model: claude-fable-5-1', 'skipPermissions: true', ''].join('\n'));

const prompts = [];
let hang = true;
ClaudeCodeEngine.prototype.invoke = async function* (prompt, opts) {
  prompts.push(prompt);
  if (hang) {
    yield { type: 'text', content: 'On it — writing the page.' };
    await new Promise((res) => opts.signal.addEventListener('abort', res, { once: true }));
    yield { type: 'error', message: 'Agent invocation timed out' };
    return;
  }
  yield { type: 'text', content: 'done' };
  yield { type: 'done', sessionId: 'sess-1', durationMs: 5, costUsd: 0, fullText: 'done' };
};

const assistant = createAssistant({ dir, timeoutMs: 200 });
async function turn(text) {
  const out = [];
  for await (const e of assistant.chat(text, { sessionKey: 'discord:1' })) out.push(e);
  return out;
}
let failures = 0;
const check = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) failures++; };

const t1 = await turn('build the page');
const c1 = t1.find((e) => e.type === 'completion');
check(c1?.status === 'aborted' && c1?.reason === 'timeout', `run 1 aborted by timeout (${c1?.status}/${c1?.reason})`);

hang = false;
await turn('Done?');
const p2 = prompts[1] ?? '';
check(p2.startsWith('[System: Your previous run in this conversation was cut off by the '), 'run 2 opens with the cut-off briefing');
check(/The last thing it said: "On it — writing the page\."/.test(p2), 'briefing quotes what the killed run last said');
check(/git status/.test(p2) && /do not start over/.test(p2), 'briefing says to check the tree and finish, not restart');
check(p2.endsWith('\n\nDone?'), 'the user text follows the briefing');

await turn('thanks');
check(!(prompts[2] ?? '').includes('[System: Your previous run'), 'run 3 has no briefing (it was consumed)');

rmSync(dir, { recursive: true, force: true });
console.log(failures ? `${failures} failure(s)` : 'all passed');
process.exit(failures ? 1 : 0);
