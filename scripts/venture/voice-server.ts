// Kit's voice replies, written on the Mac mini on the Claude login, the Max plan, never the API
// key (OLA-187). Bart, Nov 19, 2026: "text replies too, yes, whatever we CAN switch". Measured the
// same day with the full notes loaded: the first words arrive 1 to 2 seconds after the question.
//
// The Vercel server still runs the call (the page, the phone, the transcript); for every reply it
// asks this small server what Kit says and streams the words on (src/lib/venture/talk.ts).
//
//   tsx scripts/venture/voice-server.ts            the job (launchd sh.venture.voice, kept alive), 127.0.0.1:3931,
//                                                  reached from Vercel at the mini's Tailscale Funnel address (port 10000)
//
//   POST /reply  { lead, messages }   → Kit's reply as plain text, streamed as it is written
//   POST /warm   { lead }             → puts the notes in the prompt cache while a call connects
//   GET  /health                      → "ok"
// Every request carries "Authorization: Bearer <VENTURE_VOICE_SECRET>" (the same value in the
// mini's ~/.venture-runner.env and on Vercel). `lead` goes before the persona (the phone meeting
// says where the call is); the persona and the notes are put together here, by the same code the
// server used (talkSystem).
//
// Each reply is one headless Claude Code call with no tools, no settings and an empty folder, the
// API key removed from its environment. When the caller hangs up on a reply (he said more), the
// reply goes on for a few seconds: if the next request is his same turn with only a few words
// added, it takes that reply over instead of starting again (src/lib/venture/voice-carry.ts,
// OLA-204); otherwise it is stopped. The job ends by itself when the checkout moves to a new
// commit; launchd starts it again on the new code.
import { execFileSync, spawn } from 'node:child_process'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { timingSafeEqual } from 'node:crypto'
import { carryKey, carryRegistry } from '../../src/lib/venture/voice-carry'

const root = path.join(__dirname, '../..')
for (const l of readFileSync(path.join(root, '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^(SUPABASE_URL|SUPABASE_SERVICE_KEY)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const SECRET = process.env.VENTURE_VOICE_SECRET ?? ''
const PORT = Number(process.env.VENTURE_VOICE_PORT || 3931)
const MODEL = 'claude-opus-5-5'
const say = (s: string) => console.log(`${new Date().toISOString().slice(0, 19)}Z ${s}`)
// How long a reply whose caller left waits to be taken over (the phone's next request comes about
// a second after the last; the talk page's sooner).
const carry = carryRegistry({ graceMs: 8000 })
const head = () => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()

type Msg = { role: 'user' | 'assistant'; content: string }

// The system text (lead + persona + notes). A reply never waits on a megabyte of notes: it uses the
// copy in memory, and a copy older than 15 seconds is read again in the background for the next
// reply. Only the first reply after a start, or after ten quiet minutes, waits for the read.
const systems = new Map<string, { at: number; text: string; reading: boolean }>()
async function read(lead: string): Promise<string> {
  const { talkSystem } = await import('../../src/lib/venture/talk')
  const text = await talkSystem(lead)
  systems.set(lead, { at: Date.now(), text, reading: false })
  return text
}
async function system(lead: string): Promise<string> {
  const had = systems.get(lead)
  if (!had || Date.now() - had.at > 10 * 60_000) return read(lead)
  if (Date.now() - had.at > 15_000 && !had.reading) {
    had.reading = true
    read(lead).catch((e) => {
      had.reading = false
      say(`(the notes could not be read again: ${(e as Error).message.slice(0, 200)})`)
    })
  }
  return had.text
}

/// The call so far as one piece of text: Claude Code takes one prompt, not a list of turns.
function transcript(messages: Msg[]): string {
  const lines = messages.map((m) => `${m.role === 'user' ? 'BART' : 'YOU'}: ${m.content}`)
  return `The call so far, oldest first:\n\n${lines.join('\n\n')}\n\nSay your next turn: only the words to be spoken, nothing before or after them.`
}

function claude(systemText: string, user: string, onText: (t: string) => void, signal: AbortSignal): Promise<{ said: boolean; ms: number; firstMs: number; why: string }> {
  const dir = mkdtempSync(path.join(tmpdir(), 'venture-voice-'))
  writeFileSync(path.join(dir, 'system.txt'), systemText)
  const env = { ...process.env, PATH: `${homedir()}/.local/bin:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? '/usr/bin:/bin'}`, DISABLE_AUTOUPDATER: '1' }
  delete env.ANTHROPIC_API_KEY
  delete env.ANTHROPIC_AUTH_TOKEN
  delete env.VENTURE_VOICE_SECRET
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--model', MODEL, '--effort', 'low', '--system-prompt-file', path.join(dir, 'system.txt'), '--tools', '', '--no-session-persistence', '--setting-sources', '', '--strict-mcp-config']
  const t0 = Date.now()
  return new Promise((resolve) => {
    const p = spawn('claude', args, { cwd: dir, env, stdio: ['pipe', 'pipe', 'pipe'] })
    let buf = ''
    let err = ''
    let said = false
    let firstMs = 0
    let why = ''
    const stop = () => p.kill('SIGKILL')
    signal.addEventListener('abort', stop)
    const timer = setTimeout(stop, 90_000)
    p.stdout.on('data', (d) => {
      buf += d
      for (let i = buf.indexOf('\n'); i >= 0; i = buf.indexOf('\n')) {
        const line = buf.slice(0, i)
        buf = buf.slice(i + 1)
        let j: { type?: string; is_error?: boolean; result?: unknown; event?: { type?: string; delta?: { type?: string; text?: string } } }
        try {
          j = JSON.parse(line)
        } catch {
          continue
        }
        if (j.type === 'stream_event' && j.event?.type === 'content_block_delta' && j.event.delta?.type === 'text_delta' && j.event.delta.text) {
          if (!said) firstMs = Date.now() - t0
          said = true
          onText(j.event.delta.text)
        } else if (j.type === 'result' && j.is_error) why = String(j.result ?? 'error').slice(0, 300)
      }
    })
    p.stderr.on('data', (d) => (err += d))
    p.on('error', (e) => (why = `could not start claude: ${e.message}`))
    p.on('close', (code) => {
      clearTimeout(timer)
      signal.removeEventListener('abort', stop)
      rmSync(dir, { recursive: true, force: true })
      if (!said && !why && code !== 0) why = (err.trim() || `claude exit ${code}`).slice(0, 300)
      resolve({ said, ms: Date.now() - t0, firstMs, why })
    })
    p.stdin.end(user)
  })
}

// OLA-478: a checker tries the plan-limit line on a live call without the login being at its limit.
// Only a call marked 'test' gets it, and only while ~/.venture-voice-test-limit holds a time in the
// future (at most 15 minutes ahead), so it ends by itself: `date -u -v+10M +%FT%TZ > ~/.venture-voice-test-limit`.
// The text is the Claude CLI's own wording at the limit, as the writer got it on Nov 26.
const VOICE_TEST_LIMIT = path.join(homedir(), '.venture-voice-test-limit')
const LIMIT_TEXT = "You've hit your weekly limit · resets 2am (America/Los_Angeles)"
function testLimitOn(): boolean {
  try {
    const until = Date.parse(readFileSync(VOICE_TEST_LIMIT, 'utf8').trim())
    return until > Date.now() && until - Date.now() <= 15 * 60_000
  } catch {
    return false
  }
}

const authed = (req: IncomingMessage) => {
  const got = Buffer.from(String(req.headers.authorization ?? ''))
  const want = Buffer.from(`Bearer ${SECRET}`)
  return SECRET.length >= 32 && got.length === want.length && timingSafeEqual(got, want)
}
const body = (req: IncomingMessage) =>
  new Promise<Record<string, unknown>>((resolve, reject) => {
    let s = ''
    req.on('data', (d) => {
      s += d
      if (s.length > 4_000_000) reject(new Error('too large'))
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(s || '{}'))
      } catch {
        reject(new Error('bad json'))
      }
    })
    req.on('error', reject)
  })

async function handle(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'GET' && req.url === '/health') return void res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok')
  if (!authed(req)) return void res.writeHead(404).end()
  if (req.method !== 'POST' || (req.url !== '/reply' && req.url !== '/warm')) return void res.writeHead(404).end()
  const b = await body(req)
  const lead = typeof b.lead === 'string' ? b.lead : ''
  if (req.url === '/warm') {
    const ac = new AbortController()
    res.on('close', () => {
      if (!res.writableEnded) ac.abort() // the caller went away
    })
    const r = await claude(await system(lead), 'BART: (The call just connected.)\n\nReply with the single word: ready', () => {}, ac.signal)
    say(`warm: ${r.said ? `notes cached in ${r.ms} ms` : `failed (${r.why})`}`)
    return void res.writeHead(r.said ? 200 : 502, { 'Content-Type': 'text/plain' }).end(r.said ? 'ok' : r.why)
  }
  const messages = (Array.isArray(b.messages) ? b.messages : []).filter((m): m is Msg => !!m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
  if (!messages.length) return void res.writeHead(400).end('no messages')
  if (b.test === true && testLimitOn()) {
    say('reply: test call, answered with the plan-limit text (VOICE_TEST_LIMIT is in date)')
    return void res.writeHead(502, { 'Content-Type': 'text/plain' }).end(LIMIT_TEXT)
  }
  const last = messages[messages.length - 1]
  const opened = carry.open(carryKey(lead, messages), last.role === 'user' ? last.content : '', async (onText, signal) => {
    const r = await claude(await system(lead), transcript(messages), onText, signal)
    say(`reply: ${signal.aborted ? 'stopped: nobody took it over' : r.said ? `first words after ${r.firstMs} ms, done in ${r.ms} ms` : `failed (${r.why || 'nothing said'})`}`)
    return r
  })
  if (opened.carried) say(`reply: carried over, already ${opened.ms} ms along (he added a few words)`)
  let started = false
  await new Promise<void>((resolve) => {
    res.on('close', () => {
      if (!res.writableEnded) opened.leave() // he said more, or the caller went away
      resolve()
    })
    opened.attach({
      onText(t) {
        if (!started) res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no', 'X-Kit-Carried': opened.carried ? '1' : '0' })
        started = true
        res.write(t)
      },
      onEnd(w) {
        if (started) res.end()
        else res.writeHead(502, { 'Content-Type': 'text/plain' }).end(w.why || 'no reply')
        resolve()
      },
    })
  })
}

if (SECRET.length < 32) {
  console.error('VENTURE_VOICE_SECRET is not set (32 characters or more): add it to ~/.venture-runner.env')
  process.exit(1)
}
const started = head()
createServer((req, res) => {
  handle(req, res).catch((e) => {
    say(`request failed: ${(e as Error).message.slice(0, 300)}`)
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' })
    res.end()
  })
}).listen(PORT, '127.0.0.1', () => say(`voice replies on the Claude login, 127.0.0.1:${PORT}`))
setInterval(() => {
  if (head() !== started) {
    say('the checkout moved to a new commit: restarting')
    process.exit(0)
  }
}, 60_000)
