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
// API key removed from its environment. When the caller hangs up on a reply (he started talking),
// the call is stopped. The job ends by itself when the checkout moves to a new commit; launchd
// starts it again on the new code.
import { execFileSync, spawn } from 'node:child_process'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { timingSafeEqual } from 'node:crypto'

const root = path.join(__dirname, '../..')
for (const l of readFileSync(path.join(root, '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^(SUPABASE_URL|SUPABASE_SERVICE_KEY)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const SECRET = process.env.VENTURE_VOICE_SECRET ?? ''
const PORT = Number(process.env.VENTURE_VOICE_PORT || 3931)
const MODEL = 'claude-opus-5-5'
const say = (s: string) => console.log(`${new Date().toISOString().slice(0, 19)}Z ${s}`)
const head = () => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()

type Msg = { role: 'user' | 'assistant'; content: string }

// The system text (lead + persona + notes). The notes are read from the database at most every 20
// seconds, so a reply does not wait on a megabyte of notes each time.
const systems = new Map<string, { at: number; text: string }>()
async function system(lead: string): Promise<string> {
  const had = systems.get(lead)
  if (had && Date.now() - had.at < 20_000) return had.text
  const { talkSystem } = await import('../../src/lib/venture/talk')
  const text = await talkSystem(lead)
  systems.set(lead, { at: Date.now(), text })
  return text
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
  const ac = new AbortController()
  res.on('close', () => {
    if (!res.writableEnded) ac.abort() // he started talking, or the caller went away
  })
  if (req.url === '/warm') {
    const r = await claude(await system(lead), 'BART: (The call just connected.)\n\nReply with the single word: ready', () => {}, ac.signal)
    say(`warm: ${r.said ? `notes cached in ${r.ms} ms` : `failed (${r.why})`}`)
    return void res.writeHead(r.said ? 200 : 502, { 'Content-Type': 'text/plain' }).end(r.said ? 'ok' : r.why)
  }
  const messages = (Array.isArray(b.messages) ? b.messages : []).filter((m): m is Msg => !!m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
  if (!messages.length) return void res.writeHead(400).end('no messages')
  let started = false
  const r = await claude(
    await system(lead),
    transcript(messages),
    (t) => {
      if (!started) res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' })
      started = true
      res.write(t)
    },
    ac.signal,
  )
  if (started) res.end()
  else res.writeHead(ac.signal.aborted ? 499 : 502, { 'Content-Type': 'text/plain' }).end(r.why || 'no reply')
  say(`reply: ${ac.signal.aborted ? 'stopped by the caller' : r.said ? `first words after ${r.firstMs} ms, done in ${r.ms} ms` : `failed (${r.why || 'nothing said'})`}`)
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
