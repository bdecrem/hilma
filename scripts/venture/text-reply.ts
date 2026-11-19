// The automatic answer to Bart's texts ("v …"), written on the Mac mini on the Claude login, the
// Max plan, never the API key (OLA-187). Bart, Nov 19, 2026: "text replies too, yes, whatever we
// CAN switch". Until that day the Vercel server wrote each answer on the API key, about $1.90 when
// the notes were not cached.
//
//   tsx scripts/venture/text-reply.ts                 the job (launchd sh.venture.texts, kept alive): looks every
//                                                     5 seconds for a text of his that has no answer, writes one
//                                                     with the same instructions and notes the server used
//                                                     (src/lib/venture/texter.ts), and sends it
//   tsx scripts/venture/text-reply.ts --dry           the same job for a check: answers are written and held to
//                                                     his limits but not sent, and its place is not stored
//   tsx scripts/venture/text-reply.ts --try "text"    write the answer to a made-up text after the real thread and
//                                                     print it with the timings; stores and sends nothing
//
// Several texts sent in a row get one answer. Every answer leaves through `imsg.mjs send --reply`,
// so his limits for a text (reply-rules.json) are checked before it reaches his phone; a refused
// answer is written again with the reason, twice at most. A text that is only an acknowledgment
// gets no answer. Voice notes are not answered here (they get minutes).
// Where it stands is venture_state "text_reply" ({ last: the id of the last text dealt with });
// the first start begins at the newest text, so nothing old is answered late.
// The job ends by itself when the checkout moves to a new commit; launchd starts it again on the
// new code.
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { notesText, pickNotes, type Doc } from '../../src/lib/venture/notes'
import { TEXTER, threadText, type TextMsg } from '../../src/lib/venture/texter'
import { MEMO_MARK } from '../../src/lib/venture/memo'
// @ts-expect-error plain .mjs helpers shared with the other scripts
import { askClaude } from './_claude.mjs'
// @ts-expect-error
import { getState, setState } from './_state.mjs'

const root = path.join(__dirname, '../..')
const env = Object.fromEntries(
  readFileSync(path.join(root, '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => /^SUPABASE_(URL|SERVICE_KEY)=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]),
)
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
const say = (s: string) => console.log(`${new Date().toISOString().slice(0, 19)}Z ${s}`)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const SORRY = 'Got it. I could not write a proper answer just now; the session will pick this up.'
const dry = process.argv.includes('--dry')
const head = () => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()

async function notes(): Promise<string> {
  const { data, error } = await db.from('venture_docs').select('slug, title, body, updated_at')
  if (error) throw new Error(`venture docs read failed: ${error.message}`)
  return notesText(pickNotes((data ?? []) as Doc[]))
}

async function thread(): Promise<TextMsg[]> {
  const { data, error } = await db.from('venture_messages').select('id, direction, author, text, at').order('id', { ascending: false }).limit(40)
  if (error) throw new Error(`venture thread read failed: ${error.message}`)
  return ((data ?? []) as TextMsg[]).reverse()
}

async function write(msgs: TextMsg[], pending: number[], again = ''): Promise<{ text: string; ms: number; firstWordMs: number; usd: number }> {
  const r = await askClaude({ system: TEXTER + (await notes()), user: threadText(msgs, pending) + again, effort: 'low', timeoutMs: 4 * 60e3 })
  return { text: String(r.text).trim(), ms: r.ms, firstWordMs: r.firstWordMs, usd: r.apiEquivalentUsd }
}

/// Send through the same gate as a session's text. Returns '' when sent, else why it was refused.
function send(text: string): string {
  const r = spawnSync('node', [path.join(root, 'scripts/venture/imsg.mjs'), 'send', text, '--reply', ...(dry ? ['--check'] : [])], { cwd: root, encoding: 'utf8' })
  if (dry && r.status === 0) say(`(not sent, a check) ${text}`)
  return r.status === 0 ? '' : (r.stderr || r.stdout || 'not sent').trim().split('\n').pop()!
}

async function answer(pending: TextMsg[]) {
  const ids = pending.map((m) => m.id)
  let again = ''
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await write(await thread(), ids, again)
    if (!r.text || r.text === 'NONE') return say(`text ${ids.join(', ')}: an acknowledgment, no answer (${Math.round(r.ms / 1000)} s)`)
    const refused = send(r.text)
    if (!refused) return say(`text ${ids.join(', ')}: answered in ${Math.round(r.ms / 1000)} s on the Claude login (the key would have charged about $${r.usd.toFixed(2)})${attempt > 1 ? `, on try ${attempt}` : ''}`)
    if (!/^not sent:/.test(refused)) throw new Error(refused) // the bridge, not the wording
    say(`text ${ids.join(', ')}: try ${attempt} refused (${refused})`)
    again = `\n\nYour last draft was refused before it reached him: ${refused}\nThe draft was:\n${r.text}\nWrite it again within those limits.`
  }
  throw new Error('three drafts were refused by his limits for a text')
}

async function main() {
  const [flag, arg] = process.argv.slice(2)
  if (flag === '--try') {
    const msgs = await thread()
    const made: TextMsg = { id: (msgs[msgs.length - 1]?.id ?? 0) + 1, direction: 'in', author: 'bart', text: arg || 'where do things stand?', at: new Date().toISOString() }
    for (const label of ['first call', 'second call (notes cached)']) {
      const r = await write([...msgs, made], [made.id])
      console.log(`${label}: ${Math.round(r.ms / 100) / 10} s, first word after ${Math.round(r.firstWordMs / 100) / 10} s, the key would have charged about $${r.usd.toFixed(2)}\n  ${r.text}`)
    }
    return
  }
  const started = head()
  const keep = (last: number) => (dry ? Promise.resolve() : setState(db, 'text_reply', { last }))
  let cursor = dry ? undefined : ((await getState(db, 'text_reply'))?.value as { last?: number } | undefined)?.last
  if (cursor == null) {
    const { data, error } = await db.from('venture_messages').select('id').order('id', { ascending: false }).limit(1)
    if (error) throw new Error(error.message)
    cursor = data?.[0]?.id ?? 0
    await keep(cursor)
  }
  say(`answering his texts on the Claude login, after text ${cursor}`)
  let fails = 0
  for (let tick = 0; ; tick++) {
    if (tick % 12 === 11 && head() !== started) return say('the checkout moved to a new commit: restarting')
    try {
      const { data, error } = await db.from('venture_messages').select('id, direction, author, text, at').gt('id', cursor).order('id')
      if (error) throw new Error(error.message)
      const rows = (data ?? []) as TextMsg[]
      const pending = rows.filter((m) => m.direction === 'in' && !m.text.startsWith(MEMO_MARK))
      const newest = pending[pending.length - 1]
      // he may be sending a second text: wait until the newest is 4 seconds old
      if (newest && Date.now() - new Date(newest.at).getTime() > 4000) {
        // a session that already wrote back after his last text has answered it
        const answered = rows.some((m) => m.direction === 'out' && m.id > newest.id)
        if (answered) say(`text ${pending.map((m) => m.id).join(', ')}: already answered by a session`)
        else
          try {
            await answer(pending)
          } catch (e) {
            say(`text ${pending.map((m) => m.id).join(', ')}: no answer could be written (${(e as Error).message.slice(0, 300)})`)
            send(SORRY)
          }
        cursor = newest.id
        await keep(cursor)
      } else if (!pending.length && rows.length) {
        cursor = rows[rows.length - 1].id // voice notes and what was sent to him: nothing to answer
        await keep(cursor)
      }
      fails = 0
    } catch (e) {
      if (fails++ === 0) say(`(could not look for texts: ${(e as Error).message.slice(0, 200)}; trying again)`)
    }
    await sleep(5000)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
