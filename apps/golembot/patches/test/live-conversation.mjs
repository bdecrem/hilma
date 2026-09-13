// A REAL conversation through the real gateway path — costs money, takes minutes.
// Drives gateway.handleMessage() with the live dist, the live assistant directory
// (so the real golem.yaml: workdir, persona, triage, patches) and a fake Discord
// adapter that prints what the channel would see. The agent really builds,
// commits and pushes. Messages arrive with or without an @mention, so the Sonnet
// triage gate is exercised too.
//
//   set -a; . ~/.golembot.env; set +a
//   node live-conversation.mjs [script.json]        (default script below)
//
// A script is an array of { text, mentioned, wait? } — `wait` seconds after the
// turn before the next message (so "thanks" comes after the delivery).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
const DIST = process.env.GOLEMBOT_DIST ?? '/opt/homebrew/lib/node_modules/golembot/dist';
const dir = process.env.GOLEMBOT_DIR ?? join(homedir(), 'golembot', 'strays');
const { handleMessage } = await import(DIST + '/gateway.js');
const { createAssistant } = await import(DIST + '/index.js');
const { loadConfig } = await import(DIST + '/workspace.js');
const { createMetrics } = await import(DIST + '/dashboard.js');

const chatId = process.env.CHAT_ID ?? `live-test-${Date.now().toString(36)}`;
const config = await loadConfig(dir);
const assistant = createAssistant({ dir });
const metrics = createMetrics();
const t0 = Date.now();
const stamp = () => `[${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s]`;
const adapter = {
  nativeStreaming: false, maxMessageLength: 2000,
  async reply(_m, text) { console.log(`${stamp()} STRAYS ▸ ${text.replace(/\n/g, '\n            ')}`); },
  async typing() {}, async sendStatus() {}, async updateStatus() {}, async clearStatus() {},
};

const script = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], 'utf8')) : [
  { text: 'Hi', mentioned: false },
  { text: 'Build me a simple web page at /hello-strays: a friendly one-screen "hello from Strays" page with a short line about what you are (a Discord-driven build agent on a Mac mini), the date it was built, and a link back to bartin16.xyz. Keep it tiny and tasteful. Commit and push, then give me the link.', mentioned: true },
  { text: 'make the heading bigger and add a footer that says "built from a phone"', mentioned: false },
  { text: 'nice. can you also add an OG image so it looks right when I share the link?', mentioned: false },
  { text: 'thanks strays', mentioned: false },
];

console.log(`chat ${chatId} · dir ${dir} · policy ${config.groupChat?.groupPolicy} · model ${config.model} · workdir ${config.workdir}`);
for (const step of script) {
  console.log(`\n${stamp()} BART   ▸ ${step.mentioned ? '@Strays ' : ''}${step.text}`);
  const msg = { chatType: 'group', channelType: 'discord', chatId, senderId: '143014170252541952', senderName: 'bartdecrem',
    text: step.text, mentioned: !!step.mentioned };
  const started = Date.now();
  try {
    await handleMessage(msg, config, assistant, adapter, 'discord', true, dir, metrics, undefined, undefined);
  } catch (e) {
    console.log(`${stamp()} ERROR  ▸ ${e.message}`);
  }
  console.log(`${stamp()} (turn took ${Math.round((Date.now() - started) / 1000)}s)`);
  if (step.wait) await new Promise((r) => setTimeout(r, step.wait * 1000));
}
console.log(`\n${stamp()} done`);
process.exit(0);
