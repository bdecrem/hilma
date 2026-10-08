#!/usr/bin/env node
/*
 * agent-voice — the voice of the Macintosh Plus (:2341, HTTP).
 *
 * The web page hilma-nine.vercel.app/plus is the Plus's face; this is its
 * mouth. While the Plus is on (= a Macinclaude Code session is connected to
 * :2324 from a non-loopback host), Claude Haiku writes a one-liner in the
 * Plus's voice every few minutes, `say -v Fred` renders it as crunchy 8-bit
 * 16 kHz audio (served as 16-bit WAV), and the page polls /state and plays it.
 *
 * Context for the lines: time of day, how long the Plus has been on, and the
 * latest prompt typed into Claude Code on the mini (from the session
 * transcripts in ~/.claude/projects). Lines never quote the prompt verbatim -
 * the page is public.
 *
 * Exposed to the internet by tunn3l (sh.tunn3l.voice-mini -> voice-mini.tunn3l.sh).
 *
 *   node server.mjs --listen 2341 [--test "text"]   (--test: render one wav and exit)
 *
 * Post a line yourself: echo "text" > ~/.plus-voice-inbox  (spoken verbatim)
 *
 * HTTP:
 *   GET /state        {online, since, line:{id,text,at}|null, error}
 *   GET /audio/<id>   audio/wav for a line
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const argv = process.argv;
const PORT = Number(argv[argv.indexOf('--listen') + 1]) || 2341;
const MODEL = process.env.VOICE_MODEL || 'claude-haiku-5-5';
const MIN_MS = Number(process.env.VOICE_MIN_SEC || 120) * 1000;
const MAX_MS = Number(process.env.VOICE_MAX_SEC || 360) * 1000;
const AUDIO = path.join(os.homedir(), '.plus-voice');
const TRANSCRIPTS = path.join(os.homedir(), '.claude/projects/-Users-admin-Documents-code-hilma');
const KEEP = 30;

const log = (...a) => console.log(new Date().toISOString(), ...a);
fs.mkdirSync(AUDIO, { recursive: true });

async function render(id, text) {
  // Render 8-bit for the crunch, then re-wrap as 16-bit PCM, which every
  // browser decodes (8-bit WAV is spotty outside Chrome).
  const out = path.join(AUDIO, `${id}.wav`);
  const raw = path.join(os.tmpdir(), `plus-voice-${id}.wav`);
  await run('/usr/bin/say', ['-v', 'Fred', '--file-format=WAVE', '--data-format=UI8@16000', '-o', raw, text]);
  await run('/usr/bin/afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', raw, out]);
  fs.unlinkSync(raw);
  return out;
}

if (argv.includes('--test')) {
  const out = await render('test', argv[argv.indexOf('--test') + 1] || 'Hello. I am a Macintosh Plus.');
  console.log(out, fs.statSync(out).size, 'bytes');
  process.exit(0);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('agent-voice: ANTHROPIC_API_KEY missing (~/.macplus-backend.env)');
  process.exit(1);
}

const state = { online: false, since: null, line: null, error: null };
const recent = []; // last lines, so Claude doesn't repeat itself
let timer = null;

// The Plus is "on" when a non-loopback host holds an established TCP
// connection to Macinclaude Code on :2324.
async function plusConnected() {
  const { stdout } = await run('/usr/sbin/netstat', ['-an', '-p', 'tcp']);
  return stdout.split('\n').some(l => {
    const f = l.trim().split(/\s+/);
    return f[3]?.endsWith('.2324') && f[5] === 'ESTABLISHED' && !f[4].startsWith('127.');
  });
}

function latestPrompt() {
  const files = fs.readdirSync(TRANSCRIPTS).filter(f => f.endsWith('.jsonl'))
    .map(f => ({ f, t: fs.statSync(path.join(TRANSCRIPTS, f)).mtimeMs })).sort((a, b) => b.t - a.t);
  if (!files.length) return null;
  const p = path.join(TRANSCRIPTS, files[0].f);
  const size = fs.statSync(p).size;
  const fd = fs.openSync(p, 'r');
  const len = Math.min(size, 2_000_000);
  const buf = Buffer.alloc(len);
  fs.readSync(fd, buf, 0, len, size - len);
  fs.closeSync(fd);
  let last = null;
  for (const l of buf.toString('utf8').split('\n')) {
    if (!l.includes('"type":"user"')) continue;
    try {
      const o = JSON.parse(l);
      const c = o.message?.content;
      if (o.type === 'user' && typeof c === 'string' && !c.startsWith('<')) last = c;
    } catch { /* partial first line */ }
  }
  return last && last.slice(0, 400);
}

async function writeLine(kind) {
  const mins = state.since ? Math.round((Date.now() - state.since) / 60000) : 0;
  const now = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'long', hour: 'numeric', minute: '2-digit' });
  const prompt = latestPrompt();
  const ctx = [
    `It is ${now} (California).`,
    kind === 'hello' ? 'Bart just switched you on and connected to the mini.' : `You have been on for ${mins} minutes.`,
    prompt ? `The latest thing Bart typed into Claude Code (the agent you talk to on the Mac mini): "${prompt}"` : '',
    recent.length ? `Things you already said (don't repeat): ${recent.join(' | ')}` : '',
  ].filter(Boolean).join('\n');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      output_config: { effort: 'low' },
      system: 'You are a 1986 Macintosh Plus: 8 MHz 68000, 1 MB RAM, 9-inch 1-bit screen, beige, delighted to be alive, a bit vain, very funny. You now work as a VT100 terminal for Claude running on a Mac mini over a 9600-baud link, and you speak out loud through the 1984 MacinTalk voice "Fred". Say ONE short spoken line (max 20 words) in character - a quip, observation or complaint. Riff on what Bart is doing but never quote him verbatim and never reveal passwords, keys, emails, phone numbers or names of other people. Always just say the line, never explain or refuse. Plain words only: no emoji, no stage directions, no quotes, no markdown.',
      messages: [{ role: 'user', content: ctx }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  if (!['end_turn', 'stop_sequence'].includes(data.stop_reason)) throw new Error(`Anthropic response did not complete: ${data.stop_reason}`);
  const text = data.content?.filter(b => b.type === 'text').map(b => b.text).join('').trim().replace(/^"|"$/g, '');
  if (!text) throw new Error('anthropic: empty line');
  if (text.length > 180 || text.includes('\n')) throw new Error(`line rejected (too long): ${text.slice(0, 80)}`);
  return text;
}

async function speak(text) {
  const id = Date.now().toString(36);
  await render(id, text);
  state.line = { id, text, at: Date.now() };
  recent.push(text); if (recent.length > 8) recent.shift();
  for (const f of fs.readdirSync(AUDIO).sort().slice(0, -KEEP)) fs.unlinkSync(path.join(AUDIO, f));
  log('said:', text);
}

async function say(kind) {
  try {
    await speak(await writeLine(kind));
    state.error = null;
  } catch (e) {
    state.error = String(e.message || e);
    log('ERROR', state.error);
  }
  if (state.online) timer = setTimeout(() => say('chat'), MIN_MS + Math.random() * (MAX_MS - MIN_MS));
}

async function tick() {
  let on;
  try { on = await plusConnected(); } catch (e) { log('netstat failed', e.message); return; }
  if (on === state.online) return;
  state.online = on;
  clearTimeout(timer);
  if (on) {
    state.since = Date.now();
    log('Plus is ON');
    timer = setTimeout(() => say('hello'), 2000);
  } else {
    state.since = null;
    log('Plus is OFF');
    speak('It is now safe to turn off your Macintosh.').catch(e => log('ERROR', e.message));
  }
}
setInterval(tick, 5000);
tick();

// Posting from the mini: write text to ~/.plus-voice-inbox and the Plus says
// it verbatim on the page (no Claude), whether or not the Plus is on.
const INBOX = path.join(os.homedir(), '.plus-voice-inbox');
setInterval(() => {
  if (!fs.existsSync(INBOX)) return;
  const text = fs.readFileSync(INBOX, 'utf8').trim().replace(/\s+/g, ' ').slice(0, 300);
  fs.unlinkSync(INBOX);
  if (text) speak(text).catch(e => { state.error = String(e.message || e); log('ERROR', state.error); });
}, 1000);

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/state') {
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify(state));
  }
  const m = url.pathname.match(/^\/audio\/([a-z0-9]+)$/);
  const file = m && path.join(AUDIO, `${m[1]}.wav`);
  if (file && fs.existsSync(file)) {
    // Safari won't play media unless the server honors Range requests.
    const size = fs.statSync(file).size;
    res.setHeader('content-type', 'audio/wav');
    res.setHeader('accept-ranges', 'bytes');
    const r = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (r) {
      const start = r[1] ? Number(r[1]) : size - Number(r[2]);
      const end = r[1] && r[2] ? Math.min(Number(r[2]), size - 1) : size - 1;
      res.statusCode = 206;
      res.setHeader('content-range', `bytes ${start}-${end}/${size}`);
      res.setHeader('content-length', end - start + 1);
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.setHeader('content-length', size);
    return fs.createReadStream(file).pipe(res);
  }
  res.statusCode = 404;
  res.end('not found\n');
}).listen(PORT, () => log(`listening on :${PORT} (model ${MODEL}, every ${MIN_MS / 1000}-${MAX_MS / 1000}s)`));
