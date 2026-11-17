#!/usr/bin/env node
// The steer count: how often Bart had to steer Kit, per day (Bart, 2026-11-16: "each time i
// steer, that's a failure of sorts... i want some sort of metric about if you're getting better
// and better at that. a number or some such").
//   node scripts/venture/steers.mjs                      yesterday (America/Los_Angeles)
//   node scripts/venture/steers.mjs --day 2026-11-16     one day
//   node scripts/venture/steers.mjs --backfill 2026-11-13 2026-11-16
//   node scripts/venture/steers.mjs --dry [--day …]      grade and print, store nothing
//   node scripts/venture/steers.mjs --collect [--day …]  print what he wrote, no model call
// Collects every message Bart wrote that day: what he typed into this project's Claude Code
// sessions on this iMac (~/.claude/projects/<this project>/*.jsonl, including messages sent
// mid-turn; never tool results, reminders, notifications, hook output, compaction summaries or
// slash-command boilerplate), his Venture texts and voice notes (venture_messages, direction
// "in"), and what he said on the voice calls (venture_interview_turns, role "bart", test calls
// left out). Each message carries the end of what Kit said just before it.
// An independent grader (Claude Opus 5.5) labels each one: steer, maybe or not, with a class,
// "repeat" when the class was already covered by a rule or an earlier correction, his words and
// what Kit had done. The headline is the steer rate: (steers + repeats) per 100 of his
// messages, so a repeat counts twice.
// Stores the day in venture_state "steers" (a map by date, read by app.kochitolabs.com and the
// morning text) and writes the day's table into apps/venture/private/STEERS.md (private, synced
// by sync.mjs). Runs on this iMac at 9:40 (launchd sh.venture.steers), because the transcripts
// live here. The rubric, the rules and his words stay out of git: they are read from
// apps/venture/private/ at run time.
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { getState, setState } from './_state.mjs'

const root = new URL('../../', import.meta.url)
const env = Object.fromEntries(
  readFileSync(new URL('.env.local', root), 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]),
)
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
const priv = (f) => new URL(`apps/venture/private/${f}`, root)
const TZ = 'America/Los_Angeles'
const MODEL = 'claude-opus-5-5'
const PRICE = { in: 4, write: 5, read: 0.2, out: 20 } // $ per million tokens, Opus 5.5
const CONTEXT = 1500

const args = process.argv.slice(2)
const flag = (f) => args.includes(f)
const after = (f) => args[args.indexOf(f) + 1]
const dry = flag('--dry')
const collectOnly = flag('--collect')
const laDay = (t) => new Date(t).toLocaleDateString('en-CA', { timeZone: TZ })
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400e3).toISOString().slice(0, 10)
let days
if (flag('--backfill')) {
  const [from, to] = [after('--backfill'), args[args.indexOf('--backfill') + 2]]
  days = []
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d)
} else days = [flag('--day') ? after('--day') : addDays(laDay(Date.now()), -1)]

// ---------- collection ----------

const tail = (s) => (s.length > CONTEXT ? '…' + s.slice(-CONTEXT) : s)
const clean = (s) => s.replace(/<pasted_content[^>]*>([\s\S]*?)(<\/pasted_content>|$)/g, (_, b) => `[pasted: ${b.trim().slice(0, 300)}${b.length > 300 ? '…' : ''}]`).replace(/\[Image #\d+\]\s*/g, '[image] ').replace(/\[Pasted text #\d+[^\]]*\]/g, '[pasted text]').trim()

// What he typed into Claude Code. origin.kind "human" marks his own messages, on user lines
// and on mid-turn (queued_command) attachments; everything else in a transcript is the machine.
function fromTranscripts(day) {
  const dir = join(homedir(), '.claude/projects', '-Users-bart-Documents-code-hilma')
  const lo = Date.parse(`${addDays(day, -1)}T00:00:00Z`)
  const out = []
  const seen = new Set()
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.jsonl'))) {
    const p = join(dir, f)
    if (statSync(p).mtimeMs < lo) continue
    let kit = ''
    let title = ''
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      if (!line) continue
      let d
      try {
        d = JSON.parse(line)
      } catch {
        continue
      }
      if (d.type === 'custom-title') title = d.customTitle
      else if (d.type === 'ai-title' && !title) title = d.aiTitle
      if (d.isSidechain) continue
      if (d.type === 'assistant' && Array.isArray(d.message?.content)) {
        const text = d.message.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
        if (text.trim()) kit = (kit + '\n' + text).slice(-CONTEXT * 2)
        continue
      }
      let text = null
      if (d.type === 'user' && d.origin?.kind === 'human' && !d.isMeta && !d.isCompactSummary) {
        const c = d.message?.content
        text = typeof c === 'string' ? c : Array.isArray(c) ? c.filter((b) => b.type === 'text').map((b) => b.text).join(' ') : ''
      } else if (d.type === 'attachment' && d.attachment?.type === 'queued_command' && (d.attachment.origin?.kind ?? d.origin?.kind) === 'human') {
        const pr = d.attachment.prompt
        text = typeof pr === 'string' ? pr : Array.isArray(pr) ? pr.filter((b) => b.type === 'text').map((b) => b.text).join(' ') : ''
      }
      if (text == null) continue
      // a slash command: keep only what he typed after it
      if (/<command-name>/.test(text)) text = (text.match(/<command-args>([\s\S]*?)<\/command-args>/)?.[1] ?? '').trim()
      if (text.startsWith('<') || /^\[Request interrupted/.test(text)) continue
      text = clean(text)
      if (!text || !d.timestamp || laDay(d.timestamp) !== day) continue
      const k = `${d.timestamp.slice(0, 16)} ${text.slice(0, 200)}` // a resumed session repeats its history
      if (seen.has(k)) continue
      seen.add(k)
      out.push({ at: d.timestamp, source: 'terminal', where: title || f.slice(0, 8), text, kit: tail(kit.trim()) })
    }
  }
  return out
}

// His Venture texts and voice notes (the memo page writes into the same table).
async function fromTexts(day) {
  const lo = new Date(Date.parse(`${day}T00:00:00Z`) - 86400e3).toISOString()
  const hi = new Date(Date.parse(`${day}T00:00:00Z`) + 2 * 86400e3).toISOString()
  const { data, error } = await db.from('venture_messages').select('id, direction, author, text, at').gte('at', lo).lt('at', hi).order('id')
  if (error) throw new Error(`venture_messages: ${error.message}`)
  const out = []
  let kit = ''
  for (const m of data) {
    if (m.direction === 'out') {
      kit = (kit + '\n' + m.text).slice(-CONTEXT * 2)
      continue
    }
    if (laDay(m.at) !== day) continue
    const memo = /^\S{0,4}\s*(voice note|memo)/i.test(m.text) || m.text.startsWith('🎙')
    out.push({ at: m.at, source: memo ? 'voice note' : 'text', where: 'iMessage', text: clean(m.text), kit: tail(kit.trim()) })
  }
  return out
}

// What he said on the voice calls; consecutive turns of his are one message.
async function fromCalls(day) {
  const lo = new Date(Date.parse(`${day}T00:00:00Z`) - 86400e3).toISOString()
  const hi = new Date(Date.parse(`${day}T00:00:00Z`) + 2 * 86400e3).toISOString()
  const { data, error } = await db.from('venture_interview_turns').select('*').gte('at', lo).lt('at', hi).order('id')
  if (error) throw new Error(`venture_interview_turns: ${error.message}`)
  const bySession = new Map()
  for (const t of data) bySession.set(t.session, [...(bySession.get(t.session) ?? []), t])
  // a check that crashed before marking its call "test" still speaks the check's scripted lines
  const isTest = (turns) => turns.some((t) => t.role === 'event' && t.text === 'test')
  const scripted = new Set([...bySession.values()].filter(isTest).flatMap((ts) => ts.filter((t) => t.role === 'bart').map((t) => t.text)))
  const out = []
  for (const turns of bySession.values()) {
    if (isTest(turns) || turns.some((t) => t.role === 'bart' && scripted.has(t.text))) continue
    let kit = ''
    let cur = null
    let cut = false // Kit's last turn was cut off by him (an "interrupted" event right after it)
    for (const t of turns) {
      if (t.role === 'event') {
        if (t.text === 'interrupted') cut = true
        continue
      }
      if (t.role === 'claude') {
        if (cur && !(cut && Date.parse(t.at) - Date.parse(cur.last) < 90e3)) cur = null
        cut = false
        kit = (kit + '\n' + t.text).slice(-CONTEXT * 2)
      } else if (t.role === 'bart') {
        if (cur && cut && Date.parse(t.at) - Date.parse(cur.last) < 90e3) {
          cur.text += ' ' + t.text
          cur.last = t.at
          cut = false
        } else if (cur) {
          cur.text += ' ' + t.text
          cur.last = t.at
        }
        else if (laDay(t.at) === day) out.push((cur = { at: t.at, last: t.at, source: 'voice call', where: turns[0].call ?? 'call', text: t.text, kit: tail(kit.trim()) }))
      }
    }
  }
  return out
}

async function collect(day) {
  const all = [...fromTranscripts(day), ...(await fromTexts(day)), ...(await fromCalls(day))].sort((a, b) => a.at.localeCompare(b.at))
  // the same words sent twice within ten minutes (two terminals, a resubmit, a "/btw" side
  // question) are one message
  const norm = (t) => t.replace(/^\/btw\s+/i, '').toLowerCase().replace(/\s+/g, ' ').trim()
  const kept = []
  for (const m of all) {
    if (kept.some((k) => norm(k.text) === norm(m.text) && Date.parse(m.at) - Date.parse(k.at) < 600e3)) continue
    kept.push({ ...m, text: m.text.replace(/^\/btw\s+/i, '') })
  }
  return kept.map((m, i) => ({ id: i + 1, ...m }))
}

// ---------- grading ----------

const rulesMd = readFileSync(priv('RULES.md'), 'utf8')
const corrMd = readFileSync(priv('CORRECTIONS.md'), 'utf8')
const RULES = [...rulesMd.matchAll(/^(\d+)\. \*\*(.+?)\*\*(.*)$/gm)].map((m) => `Rule ${m[1]}: ${m[2]}${(m[3].match(/\((?:Corrected )?[^)]*\d{1,2}\/\d{1,2}[^)]*\)|\((?:\d{1,2}\/\d{1,2}|Nov \d+)[^)]*\)/)?.[0] ?? '').slice(0, 160)}`)
const CORRECTIONS = corrMd
  .split(/\n(?=## )/)
  .filter((s) => /^## \d+\./.test(s))
  .map((s) => {
    const head = s.split('\n')[0].slice(3)
    const words = s.match(/\*\*His words:\*\*\s*(.+)|His words:\s*(.+)/)
    return `${head}${words ? ` — his words: ${(words[1] ?? words[2]).slice(0, 220)}` : ''}`
  })

// Lessons older than Venture's ledger, from the session memory index (feedback entries only).
const memFile = join(homedir(), '.claude/projects/-Users-bart-Documents-code-hilma/memory/MEMORY.md')
const MEMORY = existsSync(memFile) ? readFileSync(memFile, 'utf8').split('\n').filter((l) => /\]\(feedback_/.test(l)).map((l) => l.replace(/\]\([^)]*\)/, ']').replace(/^- /, '').slice(0, 260)) : []

const SYSTEM = `You are an independent auditor for an experiment in which an AI agent ("Kit", a Claude model working through Claude Code, iMessage and voice calls) runs a small business with a human, Bart. Bart wants one honest number: how often he has to steer Kit. Every steer is a failure of Kit's system, and a steer in a class Kit had already been corrected on is a failure of its learning.

You read every message Bart wrote on one day, each with the end of what Kit said just before it, and label each message.

STEER: Bart had to correct Kit, repeat an instruction, re-explain something, say he did not understand Kit, chase a status or result he should already have had, push Kit to do something it should have done unasked (including "think like a designer", "make it better", "you should have…", "why didn't you…", "remember to…", "again:"), reject or redo Kit's work ("I don't like…", "too plain", "no, …"), stop Kit ("stop", "wait"), or report that something Kit handed him did not work. A reminder of a standing expectation is a steer. A complaint about cost, speed or token use caused by Kit is a steer.
NOT A STEER: a new request or a new piece of work, a decision that is genuinely his to make (taste between options Kit offered, a business call, money), an answer to a question Kit asked (unless the question itself was one Kit should not have needed to ask: then it is a steer, class "needless-question"), praise, thanks, small talk, a status he asks for when Kit could not have known he wanted it then, information only he has.
ONE POINT, ONE STEER: when Bart makes one point across several messages in a row before Kit has had a chance to act on it (minutes apart, Kit only acknowledged or was cut off), it is one steer: label the first, and the later ones "not" with reason "continues message N". When Kit did act and got the same thing wrong again, the later message is its own steer, and a repeat.
CHASES ARE STEERS: "what's next?", "what do you need from me?", "update on X?", "give me a status", "url?" are steers when Kit should already have told him (it was handing him asks one at a time, had a result he did not get, or a status that was stale), not when he simply wants something new.
FIRST STATEMENT OF A PRINCIPLE: the first time Bart lays down a general principle because Kit fell short (for example "every correction must become memory"), it is a steer and new, not a repeat.
MAYBE: you cannot tell from the message and the context whether Kit was at fault. Do not drop these and do not round them to "not". When in doubt between steer and maybe, choose steer if a reasonable observer would say Kit should have handled it without him.

Be strict. Do not give Kit the benefit of the doubt. Kit's own wording ("great question", "as you said") is not evidence that Kit was right.

For each STEER and MAYBE:
- class: a short kebab-case slug for the kind of failure Kit made in THIS message's context (not the class of the message before it), reusable across days (for example design-taste, anticipate-next-need, status-not-current, jargon-unclear, untested-handoff, needless-question, long-answer, model-budget, swung-on-pushback, ignored-instruction, wrong-fact). Reuse a class from the list of earlier steers when it fits.
- repeat: true when this class was already covered BEFORE this message by one of Kit's standing rules or written corrections (each carries its date; one dated later than the message does not count), or by an earlier steer in the list of earlier steers, or by an earlier message on this same day. A repeat means the learning failed.
  Dating matters. The rules and corrections below are the current list; many were written BECAUSE of a message you are grading. A rule or correction born from this very message, or written later than it, never makes it a repeat. When a correction is dated the same day as the message, compare times (the heading often gives one, and it quotes his words: if it quotes this message, it was written after it). A rule's date is the date of the correction it came from. When you cannot establish that the covering rule existed before the message, set repeat false and name the rule in repeat_of as "(later: Rule N)".
- repeat_of: which rule, correction or earlier steer it repeats ("Rule 21", "Correction 9", "earlier today 14:02"), or "".
- quote: Bart's words, short (at most 25 words), exact.
- kit_did: one plain line on what Kit had done or failed to do.
For NOT, give only a one-line reason.

Kit's standing rules (RULES.md, titles):
${RULES.join('\n')}

Kit's written corrections (CORRECTIONS.md, headings, dated):
${CORRECTIONS.join('\n')}

Older lessons from Kit's session memory (most predate November 13, 2026; where a line gives a later date, that date applies):
${MEMORY.join('\n')}`

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['labels'],
  properties: {
    labels: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'label', 'class', 'repeat', 'repeat_of', 'quote', 'kit_did', 'reason'],
        properties: {
          id: { type: 'integer' },
          label: { type: 'string', enum: ['steer', 'maybe', 'not'] },
          class: { type: 'string' },
          repeat: { type: 'boolean' },
          repeat_of: { type: 'string' },
          quote: { type: 'string' },
          kit_did: { type: 'string' },
          reason: { type: 'string' },
        },
      },
    },
  },
}

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
const cost = { in: 0, write: 0, read: 0, out: 0 }
const dollars = () => (cost.in * PRICE.in + cost.write * PRICE.write + cost.read * PRICE.read + cost.out * PRICE.out) / 1e6

async function gradeChunk(day, msgs, earlier) {
  const fmt = (m) =>
    `### Message ${m.id} · ${new Date(m.at).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })} · ${m.source}${m.where ? ` (${m.where})` : ''}\nKIT SAID JUST BEFORE:\n${m.kit || '(nothing yet in this conversation)'}\n\nBART WROTE:\n${m.text.slice(0, 4000)}`
  const user = `Day: ${day} (Pacific time).\n\nEarlier steers (earlier days and earlier today), for classes and repeats:\n${earlier.length ? earlier.map((s) => `- ${s.day} ${s.time} [${s.class}] "${s.quote}"`).join('\n') : '(none)'}\n\nLabel every one of these ${msgs.length} messages (ids ${msgs[0].id} to ${msgs[msgs.length - 1].id}), one label per id.\n\n${msgs.map(fmt).join('\n\n')}`
  const stream = anthropic.beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
  })
  const res = await stream.finalMessage()
  const u = res.usage
  cost.in += u.input_tokens ?? 0
  cost.write += u.cache_creation_input_tokens ?? 0
  cost.read += u.cache_read_input_tokens ?? 0
  cost.out += u.output_tokens ?? 0
  if (res.stop_reason !== 'end_turn') throw new Error(`grader stopped with ${res.stop_reason}`)
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
  const labels = JSON.parse(text).labels
  const byId = new Map(labels.map((l) => [l.id, l]))
  const missing = msgs.filter((m) => !byId.has(m.id))
  if (missing.length) throw new Error(`grader skipped messages ${missing.map((m) => m.id).join(', ')}`)
  return byId
}

const hhmm = (t) => new Date(t).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })

async function gradeDay(day, earlier) {
  const msgs = await collect(day)
  const labelled = []
  const seenToday = []
  for (let i = 0; i < msgs.length; i += 40) {
    const chunk = msgs.slice(i, i + 40)
    // the grader once returned 7 labels for 40 messages: grade what it skipped once more, then fail loudly
    let byId
    try {
      byId = await gradeChunk(day, chunk, [...earlier, ...seenToday])
    } catch (e) {
      if (!/skipped messages/.test(e.message)) throw e
      console.error(`(${e.message}; grading the chunk again)`)
      byId = await gradeChunk(day, chunk, [...earlier, ...seenToday])
    }
    for (const m of chunk) {
      const l = byId.get(m.id)
      const row = { ...m, ...l }
      labelled.push(row)
      if (l.label === 'steer') seenToday.push({ day, time: hhmm(m.at), class: l.class, quote: l.quote })
    }
  }
  const steers = labelled.filter((l) => l.label === 'steer')
  const repeats = steers.filter((l) => l.repeat).length
  const n = msgs.length
  return {
    day,
    messages: n,
    by_source: Object.fromEntries(['terminal', 'text', 'voice note', 'voice call'].map((s) => [s, msgs.filter((m) => m.source === s).length])),
    steers: steers.length,
    repeats,
    maybes: labelled.filter((l) => l.label === 'maybe').length,
    rate: n ? Math.round(((steers.length + repeats) / n) * 1000) / 10 : null,
    between: steers.length ? Math.round((n / steers.length) * 10) / 10 : null,
    items: labelled
      .filter((l) => l.label !== 'not')
      .map((l) => ({ time: hhmm(l.at), at: l.at, source: l.source, label: l.label, class: l.class, repeat: l.repeat, repeat_of: l.repeat_of, quote: l.quote, kit_did: l.kit_did })),
    graded: labelled.map((l) => ({ id: l.id, time: hhmm(l.at), source: l.source, label: l.label, text: l.text.slice(0, 300), reason: l.reason || l.kit_did })),
    model: MODEL,
    at: new Date().toISOString(),
  }
}

// ---------- STEERS.md ----------

function dayTable(d) {
  const lines = [
    `## ${d.day}`,
    '',
    `His messages ${d.messages} (terminal ${d.by_source.terminal}, texts ${d.by_source.text}, voice notes ${d.by_source['voice note']}, calls ${d.by_source['voice call']}) · steers ${d.steers} · repeats ${d.repeats} · maybe ${d.maybes} · **steer rate ${d.rate ?? '–'}** · ${d.between ? `one steer every ${d.between} messages` : 'no steers'}`,
    '',
    '| time | source | label | class | new/repeat | his words | what Kit had done |',
    '|---|---|---|---|---|---|---|',
    ...d.items.map((s) => `| ${s.time} | ${s.source} | ${s.label} | ${s.class} | ${s.repeat ? `repeat (${s.repeat_of})` : 'new'} | ${s.quote.replace(/\|/g, '/')} | ${s.kit_did.replace(/\|/g, '/')} |`),
    '',
  ]
  return lines.join('\n')
}

function writeMd(daysMap) {
  const f = priv('STEERS.md')
  const old = existsSync(f) ? readFileSync(f, 'utf8') : ''
  const head = `# Steers\n\nHow often Bart had to steer Kit, per day, graded by an independent Claude Opus 5.5 (scripts/venture/steers.mjs). Steer rate = (steers + repeats) per 100 of his messages; a repeat (a class already covered by a rule or an earlier correction) counts twice. Lower is better. The replay suite (steer-replay.mjs) is at the bottom.\n\n`
  const replay = old.includes('\n# Replay') ? old.slice(old.indexOf('\n# Replay')) : ''
  const body = Object.keys(daysMap).sort().reverse().map((k) => dayTable(daysMap[k])).join('\n')
  writeFileSync(f, head + body + replay)
}

// ---------- run ----------

if (collectOnly) {
  for (const day of days) {
    const msgs = await collect(day)
    console.log(`\n=== ${day}: ${msgs.length} messages`)
    for (const m of msgs) console.log(`#${m.id} ${hhmm(m.at)} ${m.source} (${m.where}): ${m.text.slice(0, 160).replace(/\n/g, ' ')}`)
  }
  process.exit(0)
}

const stored = (await getState(db, 'steers'))?.value ?? { days: {} }
for (const day of days) {
  const earlier = Object.values(stored.days)
    .filter((d) => d.day < day)
    .flatMap((d) => d.items.filter((s) => s.label === 'steer').map((s) => ({ day: d.day, time: s.time, class: s.class, quote: s.quote })))
  const d = await gradeDay(day, earlier)
  console.log(`${day}: ${d.messages} messages, ${d.steers} steers (${d.repeats} repeats), ${d.maybes} maybe, rate ${d.rate}  [$${dollars().toFixed(2)} so far]`)
  for (const s of d.items) console.log(`  ${s.time} ${s.label.padEnd(5)} ${s.class.padEnd(22)} ${s.repeat ? 'REPEAT' : 'new   '} "${s.quote}"`)
  if (dry) {
    if (flag('--all')) for (const g of d.graded) console.log(`    #${g.id} ${g.time} ${g.label}: ${g.text.slice(0, 120).replace(/\n/g, ' ')} — ${g.reason}`)
    continue
  }
  stored.days[day] = d
  await setState(db, 'steers', stored)
  writeMd(stored.days)
}
const spent = { ...cost, dollars: Math.round(dollars() * 100) / 100 }
console.log(`grader: ${JSON.stringify(spent)}`)
if (!dry) console.log(`stored in venture_state "steers" and apps/venture/private/STEERS.md`)
