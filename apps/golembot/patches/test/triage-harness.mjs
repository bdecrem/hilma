// Drives the patched triageMessage() against the real Sonnet gate.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { triageMessage } from (process.env.GOLEMBOT_DIST ?? './node_modules/golembot/dist') + '/gateway.js';

const dir = join(process.cwd(), 'triage-ws');
rmSync(dir, { recursive: true, force: true });
mkdirSync(join(dir, '.golem', 'history'), { recursive: true });
const groupKey = 'discord:123';
const config = { name: 'Strays', groupChat: { triageModel: 'claude-sonnet-5' } };
const gc = { groupPolicy: 'smart', historyLimit: 20, maxTurns: 10 };

let t = Date.now() - 600_000;
const tick = () => (t += 10_000);
function botSaid(text) {
  writeFileSync(join(dir, '.golem', 'history', 'discord:123.jsonl'),
    JSON.stringify({ ts: new Date(tick()).toISOString(), sessionKey: groupKey, role: 'assistant', content: text }) + '\n', { flag: 'a' });
}
const human = (who, text) => ({ senderName: who, text, isBot: false, ts: tick() });

const cases = [
  { name: 'two humans chatting', expect: 'pass',
    hist: [human('kira', 'lunch today?'), human('bartdecrem', 'sure, 12:30 at the usual place')] },
  { name: 'follow-up to bot work', expect: 'respond', pre: () => botSaid('Done — the page is live at https://hilma-nine.vercel.app/hello'),
    hist: [human('bartdecrem', '@Strays make me a hello world page at /hello'), human('bartdecrem', 'make the title bigger and blue')] },
  { name: 'unaddressed request the bot can do', expect: 'respond',
    hist: [human('kira', 'morning'), human('bartdecrem', 'can someone put up a quick page at /party with the address and a map link')] },
  { name: 'thanks after bot reply', expect: 'pass', pre: () => botSaid('Title is bigger and blue now, same URL.'),
    hist: [human('bartdecrem', 'make the title bigger and blue'), human('bartdecrem', 'thanks!')] },
  { name: 'thinking out loud', expect: 'pass',
    hist: [human('bartdecrem', 'hmm, I wonder whether we should move the mini back home at some point'), human('kira', 'maybe after the semester')] },
  { name: 'named without @mention', expect: 'respond',
    hist: [human('bartdecrem', 'strays, what did the last build say?')] },
];

let fails = 0;
for (const c of cases) {
  rmSync(join(dir, '.golem', 'history', 'discord:123.jsonl'), { force: true });
  c.pre?.();
  const hist = c.hist;
  const last = hist[hist.length - 1];
  const t0 = Date.now();
  const v = await triageMessage({ dir, config, gc, groupKey, hist, senderName: last.senderName, userText: last.text, verbose: true, channelType: 'discord' });
  const ok = v === c.expect;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}: got ${v}, expected ${c.expect} (${Date.now() - t0}ms)`);
}
console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
