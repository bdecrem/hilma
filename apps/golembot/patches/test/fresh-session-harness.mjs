// Fresh-session rule, unit and end to end.
//   GOLEMBOT_DIST=/tmp/gb-dist node fresh-session-harness.mjs
// Unit: sessionRotation on idle time and on transcript size, transcriptTokens
// on a fake Claude Code transcript. End to end: a stubbed engine, the stored
// session made 3 h old → the next turn is a fresh session with the briefing;
// the turn after resumes; a transcript over the token limit rotates again.
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd(), 'fresh-ws');
rmSync(root, { recursive: true, force: true });
mkdirSync(root, { recursive: true });
// The transcript reader looks under $HOME/.claude/projects — point HOME at the sandbox.
process.env.HOME = root;

const DIST = process.env.GOLEMBOT_DIST ?? './node_modules/golembot/dist';
const { createAssistant } = await import(DIST + '/index.js');
const { ClaudeCodeEngine } = await import(DIST + '/engines/claude-code.js');
const { sessionRotation, transcriptTokens, transcriptPath } = await import(DIST + '/session.js');

let failures = 0;
const check = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) failures++; };
const H = 3_600_000;
const cfg = { freshSessionAfterMinutes: 120, freshSessionAfterTokens: 100_000 };
const now = Date.now();

// ── unit ──
check(!sessionRotation(undefined, 5, cfg, now).rotate, 'no stored session → nothing to rotate');
check(!sessionRotation({ lastUsed: now - H }, 50_000, cfg, now).rotate, '1 h idle, 50k tokens → resume');
let r = sessionRotation({ lastUsed: now - 3.2 * H }, 50_000, cfg, now);
check(r.rotate && /3h12m ago/.test(r.reason), `3.2 h idle → fresh (${r.reason})`);
r = sessionRotation({ lastUsed: now - H }, 465_000, cfg, now);
check(r.rotate && /~465k tokens \(limit 100k\)/.test(r.reason), `465k tokens → fresh (${r.reason})`);
check(!sessionRotation({ lastUsed: now - H }, undefined, cfg, now).rotate, 'unknown token count → resume');
check(!sessionRotation({ lastUsed: now - 30 * H }, 465_000, {}, now).rotate, 'no limits configured → resume');

const ws = join(root, 'strays');
const tp = transcriptPath(ws, 'abc', join(root, 'p'));
check(tp === join(root, 'p', root.replace(/[^A-Za-z0-9]/g, '-') + '-strays', 'abc.jsonl'), `transcript path encodes the workspace (${tp.split('/').slice(-2).join('/')})`);
mkdirSync(join(tp, '..'), { recursive: true });
writeFileSync(tp, [
  '{"type":"user","message":{"role":"user","content":"hi"}}',
  '{"type":"assistant","message":{"usage":{"input_tokens":10,"cache_creation_input_tokens":2000,"cache_read_input_tokens":30000}}}',
  '{"type":"assistant","message":{"usage":{"input_tokens":32,"cache_creation_input_tokens":2945,"cache_read_input_tokens":464827}}}',
  '',
].join('\n'));
check(transcriptTokens(ws, 'abc', join(root, 'p')) === 32 + 2945 + 464827, 'transcriptTokens reads the LAST usage line');
check(transcriptTokens(ws, 'nope', join(root, 'p')) === undefined, 'missing transcript → undefined');

// ── end to end ──
mkdirSync(ws, { recursive: true });
writeFileSync(join(ws, 'golem.yaml'), ['name: T', 'engine: claude-code', 'model: claude-fable-5-1', 'skipPermissions: true',
  'freshSessionAfterMinutes: 120', 'freshSessionAfterTokens: 100000', ''].join('\n'));
const calls = [];
let n = 0;
ClaudeCodeEngine.prototype.invoke = async function* (prompt, opts) {
  n++;
  calls.push({ prompt, sessionId: opts.sessionId });
  yield { type: 'text', content: 'ok' };
  yield { type: 'done', sessionId: `sess-${n}`, durationMs: 1, costUsd: 0, fullText: 'ok' };
};
const assistant = createAssistant({ dir: ws });
const key = 'discord:1';
async function turn(text) {
  const out = [];
  for await (const e of assistant.chat(text, { sessionKey: key })) out.push(e);
  return out;
}
const sessionsFile = join(ws, '.golem', 'sessions.json');
const age = (ms) => { const s = JSON.parse(readFileSync(sessionsFile, 'utf8')); s[key].lastUsed = Date.now() - ms; writeFileSync(sessionsFile, JSON.stringify(s)); };

await turn('build the page');
check(calls[0].sessionId === undefined, 'turn 1: no stored session → new');
await turn('make it blue');
check(calls[1].sessionId === 'sess-1' && !calls[1].prompt.startsWith('[System'), 'turn 2 (right after): resumed, no briefing');

age(3 * H);
const t3 = await turn('now the jam page');
check(calls[2].sessionId === undefined, 'turn 3 (3 h later): fresh session');
check(calls[2].prompt.startsWith('[System: This is a fresh session — the previous turn was 3h00m ago'), 'turn 3 prompt opens with the briefing and the reason');
check(calls[2].prompt.includes(transcriptPath(ws, 'sess-2')) && /tail it/.test(calls[2].prompt), 'briefing points at the previous transcript');
check(!/Read .*history.*to restore context/.test(calls[2].prompt), 'stock "read your history file" hint suppressed');
check(calls[2].prompt.endsWith('\n\nnow the jam page'), 'user text follows the briefing');
check(t3.some((e) => e.type === 'warning' && /^Fresh session: /.test(e.message)), 'a warning event names the rotation');

await turn('add a header');
check(calls[3].sessionId === 'sess-3' && !calls[3].prompt.startsWith('[System'), 'turn 4: resumes the new session');

// Over the token limit, even though it is recent.
const big = transcriptPath(ws, 'sess-4');
mkdirSync(join(big, '..'), { recursive: true });
writeFileSync(big, '{"type":"assistant","message":{"usage":{"input_tokens":5,"cache_creation_input_tokens":100,"cache_read_input_tokens":180000}}}\n');
await turn('and a footer');
check(calls[4].sessionId === undefined && /~180k tokens \(limit 100k\)/.test(calls[4].prompt), 'turn 5: 180k-token transcript → fresh');

rmSync(root, { recursive: true, force: true });
console.log(failures ? `${failures} failure(s)` : 'all passed');
process.exit(failures ? 1 : 0);
