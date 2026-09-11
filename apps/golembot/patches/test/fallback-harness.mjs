// Drives the patched assistant with a stubbed engine: the primary model fails
// with the out-of-credits message, the fallback model answers.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createAssistant } from (process.env.GOLEMBOT_DIST ?? './node_modules/golembot/dist') + '/index.js';
import { ClaudeCodeEngine } from (process.env.GOLEMBOT_DIST ?? './node_modules/golembot/dist') + '/engines/claude-code.js';

const dir = join(process.cwd(), 'fallback-ws');
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'golem.yaml'), [
  'name: Strays', 'engine: claude-code', 'model: claude-fable-5-1',
  'fallbackModel: claude-opus-5', 'fallbackHoldMinutes: 1', 'skipPermissions: true', '',
].join('\n'));

const calls = [];
let mode = process.argv[2] || 'error'; // 'error' = result is_error; 'text' = plain reply text
ClaudeCodeEngine.prototype.invoke = async function* (prompt, opts) {
  calls.push(opts.model);
  if (opts.model === 'claude-fable-5-1') {
    if (mode === 'error') {
      yield { type: 'error', message: "You're out of usage credits. Run /usage-credits to keep using Fable 5." };
    } else {
      const msg = "You're out of usage credits. Run /usage-credits to keep using Fable 5.";
      yield { type: 'text', content: msg };
      yield { type: 'done', sessionId: 'sess-1', durationMs: 5, costUsd: 0, fullText: msg };
    }
    return;
  }
  yield { type: 'text', content: `hello from ${opts.model}` };
  yield { type: 'done', sessionId: 'sess-2', durationMs: 5, costUsd: 0, fullText: `hello from ${opts.model}` };
};

const assistant = createAssistant({ dir });
async function turn(label) {
  const events = [];
  for await (const e of assistant.chat('hi', { sessionKey: 'discord:1' })) events.push(e);
  const kinds = events.map((e) => e.type + (e.type === 'warning' ? `(${e.message.slice(0, 26)})` : e.type === 'completion' ? `(${e.status})` : ''));
  console.log(`${label}: ${kinds.join(' → ')}`);
  return events;
}

let fails = 0;
const check = (cond, what) => { if (!cond) { fails++; console.log('FAIL', what); } else console.log('ok  ', what); };

const ev1 = await turn(`turn 1 (${mode})`);
const done = ev1.find((e) => e.type === 'completion');
check(ev1.some((e) => e.type === 'warning' && e.message.startsWith('Switching to fallback model')), 'switch warning emitted');
check(done?.status === 'completed' && /hello from claude-opus-5/.test(done.finalText ?? ''), 'turn completed with the fallback reply');
check(calls.join(',') === 'claude-fable-5-1,claude-opus-5', `engine called primary then fallback (${calls.join(',')})`);

calls.length = 0;
const ev2 = await turn('turn 2');
check(calls.join(',') === 'claude-opus-5', `second turn goes straight to fallback (${calls.join(',')})`);
check(!ev2.some((e) => e.type === 'warning' && e.message.startsWith('Switching')), 'no second switch warning');

console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
