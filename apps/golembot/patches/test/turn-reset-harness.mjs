// Drives handleMessage() with a stubbed assistant + fake adapter and counts
// replies. Run against the stock dist and the patched dist:
//   GOLEMBOT_DIST=/opt/homebrew/lib/node_modules/golembot/dist node turn-reset-harness.mjs
// Stock: with maxTurns 2, the 3rd and 4th human messages in a busy channel are
// skipped. Patched (group-turn-reset): every human message is answered, while a
// run of bot-sent messages is still capped at maxTurns.
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
const DIST = process.env.GOLEMBOT_DIST ?? './node_modules/golembot/dist';
const { handleMessage, groupTurnCounters, groupLastActivity, groupHistories } = await import(DIST + '/gateway.js');
const { createMetrics } = await import(DIST + '/dashboard.js');

const dir = join(process.cwd(), 'turn-reset-ws');
rmSync(dir, { recursive: true, force: true });
mkdirSync(join(dir, '.golem'), { recursive: true });

const config = { name: 'Strays', engine: 'claude-code', autoContinue: 0,
  groupChat: { groupPolicy: 'mention-only', maxTurns: 2, historyLimit: 20 }, streaming: { mode: 'buffered' } };
const assistant = {
  async *chat() { yield { type: 'text', content: 'ok' }; yield { type: 'done', fullText: 'ok', sessionId: 's1', costUsd: 0, durationMs: 1 }; yield { type: 'completion', status: 'completed', finalText: 'ok', costUsd: 0, durationMs: 1 }; },
  getStatus() { return {}; }, cancel() {}, resetSession() {},
};
const replies = [];
const adapter = { nativeStreaming: false, maxMessageLength: 2000,
  async reply(_m, text) { replies.push(text); }, async typing() {}, async sendStatus() {}, async updateStatus() {}, async clearStatus() {} };
const metrics = createMetrics();

const isPatched = (await import('node:fs')).readFileSync(DIST + '/gateway.js', 'utf8').includes('golembot-group-turn-reset-patch');
console.log(`dist: ${DIST}  (${isPatched ? 'PATCHED' : 'stock'})`);

async function run(label, senderType, n) {
  groupTurnCounters.clear(); groupLastActivity.clear(); groupHistories.clear(); replies.length = 0;
  for (let i = 1; i <= n; i++) {
    const msg = { chatType: 'group', channelType: 'discord', chatId: 'c1', senderId: 'u1', senderName: 'bartdecrem',
      senderType, text: `@Strays job ${i}`, mentioned: true };
    await handleMessage(msg, config, assistant, adapter, 'discord', false, dir, metrics, undefined, undefined);
  }
  console.log(`${label}: ${replies.length}/${n} answered`);
  return replies.length;
}

const humans = await run('4 human messages, maxTurns 2', undefined, 4);
const bots   = await run('4 bot-sent messages, maxTurns 2', 'bot', 4);
const expect = isPatched ? { humans: 4, bots: 2 } : { humans: 2, bots: 2 };
const ok = humans === expect.humans && bots === expect.bots;
console.log(ok ? 'ALL OK' : `FAIL (expected humans=${expect.humans} bots=${expect.bots})`);
rmSync(dir, { recursive: true, force: true });
process.exit(ok ? 0 : 1);
