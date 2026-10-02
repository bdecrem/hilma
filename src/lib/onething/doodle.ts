// A doodle for every entry. When a sentence is kept, Opus 5.5 (low effort)
// draws one small margin doodle for that day — stroke-only SVG in the
// journal's ink with one red accent — and it is stored on the day's row.
// The day's text changing (an added thought, an edit) redraws it.
//
// Words: almost never. The model may put a word or two in the drawing only
// on a day the code allows it (`wordAllowed`: nothing worded in the last
// three days), and it is told to use that only when the doodle cannot land
// without it — so a worded doodle shows up every four days at most, and
// usually less. When words are not allowed, any <text> is stripped.
//
// The generation is scheduled with next's after() from the routes that save
// entries; a failed drawing is logged and the day simply has no doodle until
// the journal page asks again (/api/onething/me schedules missing ones).

import Anthropic from '@anthropic-ai/sdk'
import { after } from 'next/server'
import { f2Supabase } from '@/lib/f2/supabase'
import type { Entry } from './core'
import { EXAMPLES } from './examples'

export const DOODLE_MODEL = process.env.ONETHING_DOODLE_MODEL || 'claude-opus-5-5'
export const DOODLE_EFFORT = 'low' as const
/// Days after a worded doodle during which the next ones stay wordless.
export const WORD_GAP_DAYS = 3
export const VIEWBOX = '0 0 340 170'
const MAX_SVG = 6000

let _client: Anthropic | null = null
function anthropic(): Anthropic {
  if (_client) return _client
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  _client = new Anthropic({ apiKey })
  return _client
}

// Three of the doodles Opus 5.5 drew for Bart's own September (the page this
// feature copies): the style, in the model's own hand.

const SYSTEM = [
  'You doodle in the margin of a paper journal. Each day the person keeps one sentence (sometimes a few) about their day, and you draw one small doodle beside it, the way someone with a pen would in twenty seconds: one image, a few confident strokes, a little wit.',
  '',
  'How to choose the image: read the sentence and pick the ONE thing worth drawing — a concrete object, a small scene, a gesture. Do not illustrate every noun. Prefer the specific over the symbolic: the actual cliff, the actual cushion castle, not a heart or a thumbs-up. No smiley faces, hearts, stars, check marks or lightbulbs unless the sentence is literally about them. No faces on objects. A dry, warm sense of humour is welcome; sentiment is not.',
  '',
  'The drawing is SVG element markup for a 340 by 170 viewBox (landscape; leave air around the drawing). The page styles it: every element is stroke-only in ink, 2.2 wide, round caps, no fill. Use these classes and nothing else: class="r" for the ONE red accent (a single element, or two that read as one thing), class="thin" for lighter detail strokes, class="f" for a small filled ink dot, class="fr" for a small filled red dot. Allowed elements: path, circle, ellipse, rect, line, polyline, polygon, g. Between 3 and 10 elements. No style attributes, no stroke or fill attributes, no defs, no images, no text unless the instruction for the day allows a word.',
  '',
  'Return JSON: { "alt": a plain six-to-twelve-word description of what is drawn, "svg": the element markup, "word": the word or two the drawing carries as a <text> element, or null }.',
  '',
  'Examples of the hand, from earlier pages:',
  ...EXAMPLES.flatMap((e) => [`Sentence: ${e.sentence}`, `svg: ${e.svg}`, '']),
].join('\n')

const SCHEMA = {
  type: 'object',
  properties: {
    alt: { type: 'string' },
    svg: { type: 'string' },
    word: { type: ['string', 'null'] },
  },
  required: ['alt', 'svg', 'word'],
  additionalProperties: false,
}

export type Drawn = { svg: string; alt: string; word: string | null }

/// Draw a doodle for `text` (the day's sentences, one per line). `recent` is
/// what the days just before looked like, so the doodle does not repeat them.
export async function drawDoodle(
  text: string,
  opts: { wordAllowed: boolean; recent?: { text: string; alt: string | null }[]; avoid?: string[]; take?: string },
): Promise<Drawn> {
  const lines = text.split('\n').map((t) => t.trim()).filter(Boolean)
  const parts: string[] = []
  if (opts.recent?.length) {
    parts.push('The last few days on this page (do not draw these again):')
    for (const r of opts.recent) parts.push(`- "${r.text.split('\n')[0]}"${r.alt ? ` → drawn as: ${r.alt}` : ''}`)
    parts.push('')
  }
  if (opts.avoid?.length) {
    parts.push('This day has been drawn before. Draw something different from each of these:')
    for (const a of opts.avoid) parts.push(`- ${a}`)
    parts.push('')
  }
  parts.push(lines.length > 1 ? "Today's sentences:" : "Today's sentence:")
  for (const l of lines) parts.push(l)
  parts.push('')
  parts.push(
    opts.wordAllowed
      ? 'Words today: a word or two is allowed, as a single <text x=".." y="..">…</text> element (the page sets its handwriting font at 20px) — a label, a sound, a small aside in the margin, like "surf day!" or "again today" on earlier pages. Use it when it makes the doodle land better; skip it when the drawing says it alone. Put the same word in "word", or null.'
      : 'Words today: none at all. No <text>. "word" is null.',
  )
  if (opts.take) parts.push('', opts.take)

  const res = await anthropic().messages.create({
    model: DOODLE_MODEL,
    max_tokens: 4096,
    output_config: { effort: DOODLE_EFFORT, format: { type: 'json_schema', schema: SCHEMA } },
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: parts.join('\n') }],
  })
  if (res.stop_reason === 'refusal') throw new Error('onething doodle: the model declined')
  const block = res.content.find((b) => b.type === 'text')
  if (!block || block.type !== 'text') throw new Error(`onething doodle: no text in the reply (stop ${res.stop_reason})`)
  const out = JSON.parse(block.text) as Drawn
  const svg = sanitizeSvg(out.svg, { allowText: opts.wordAllowed })
  if (!svg) throw new Error(`onething doodle: nothing drawable came back (${String(out.svg ?? '').length} chars: ${String(out.svg ?? '').slice(0, 200)})`)
  const word = opts.wordAllowed && /<text\b/.test(svg) ? (out.word ?? textContent(svg)) : null
  return { svg, alt: String(out.alt ?? '').slice(0, 200), word: word ? word.slice(0, 40) : null }
}

/// A word is allowed on `day` when none of the entries in the WORD_GAP_DAYS
/// days before it carried one.
export function wordAllowed(entries: Pick<Entry, 'day' | 'doodle_word'>[], day: string): boolean {
  const floor = addDaysIso(day, -WORD_GAP_DAYS)
  return !entries.some((e) => e.day !== day && e.day >= floor && e.day <= day && !!e.doodle_word)
}

function addDaysIso(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// ---------- sanitizing ----------

const TAGS = new Set(['path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'g', 'text'])
const ATTRS = new Set(['d', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'points', 'class', 'transform', 'opacity', 'text-anchor', 'font-size'])
const CLASSES = new Set(['r', 'thin', 'f', 'fr'])

/// Keep only the plain drawing elements and attributes the page styles; drop
/// everything else (scripts, handlers, hrefs, styles, foreign content). Text
/// content survives only inside <text>, and only when allowed.
export function sanitizeSvg(raw: string, opts: { allowText: boolean }): string {
  const src = String(raw ?? '').replace(/<\?xml[^>]*>/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<svg\b[^>]*>|<\/svg>/g, '')
  const out: string[] = []
  const re = /<\/?([a-zA-Z]+)([^>]*?)(\/?)>|([^<]+)/g
  let m: RegExpExecArray | null
  let inText = false
  let kept = 0
  while ((m = re.exec(src))) {
    if (m[4] !== undefined) {
      if (inText && opts.allowText) out.push(escapeText(m[4].replace(/\s+/g, ' ')))
      continue
    }
    const tag = m[1].toLowerCase()
    const closing = m[0].startsWith('</')
    const selfClosing = m[3] === '/'
    if (!TAGS.has(tag)) continue
    if (tag === 'text' && !opts.allowText) {
      if (!closing && !selfClosing) inText = true
      if (closing) inText = false
      continue
    }
    if (closing) {
      if (tag === 'text') inText = false
      out.push(`</${tag}>`)
      continue
    }
    const attrs: string[] = []
    const ar = /([a-zA-Z0-9:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g
    let a: RegExpExecArray | null
    while ((a = ar.exec(m[2]))) {
      const name = a[1].toLowerCase()
      const value = (a[3] ?? a[4] ?? '').trim()
      if (!ATTRS.has(name)) continue
      if (name === 'class') {
        const cls = value.split(/\s+/).filter((c) => CLASSES.has(c))
        if (cls.length) attrs.push(`class="${cls.join(' ')}"`)
        continue
      }
      if (/[<>"'&]/.test(value) || /url\(|javascript|expression/i.test(value)) continue
      attrs.push(`${name}="${value}"`)
    }
    if (tag === 'text') inText = !selfClosing
    kept++
    out.push(`<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}${selfClosing ? '/>' : '>'}`)
  }
  const svg = out.join('')
  if (kept === 0 || svg.length > MAX_SVG) return ''
  return svg
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function textContent(svg: string): string | null {
  const t = [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map((m) => m[1].trim()).filter(Boolean).join(' ')
  return t || null
}

// ---------- storage ----------

type Context = { entry: Entry; allowed: boolean; recent: { text: string; alt: string | null }[] }

/// What drawing one entry needs: the row, whether a word is allowed that day,
/// and the days just before. Null when the owner has doodles turned off.
/// With `userId`, the entry must belong to that user.
async function drawContext(entryId: string, userId?: string): Promise<Context | null> {
  const sb = f2Supabase()
  const { data: entry, error } = await sb.from('onething_entries').select('*').eq('id', entryId).maybeSingle()
  if (error) throw new Error(`onething doodle: load failed: ${error.message}`)
  if (!entry || (userId && (entry as Entry).user_id !== userId)) throw new Error('onething doodle: no such entry')
  const e = entry as Entry
  const { data: owner, error: e0 } = await sb.from('onething_users').select('doodles').eq('id', e.user_id).maybeSingle()
  if (e0) throw new Error(`onething doodle: owner failed: ${e0.message}`)
  if (owner && owner.doodles === false) return null
  const { data: before, error: e2 } = await sb
    .from('onething_entries')
    .select('day, text, doodle_alt, doodle_word')
    .eq('user_id', e.user_id)
    .lt('day', e.day)
    .order('day', { ascending: false })
    .limit(5)
  if (e2) throw new Error(`onething doodle: recent failed: ${e2.message}`)
  const rows = (before ?? []) as Pick<Entry, 'day' | 'text' | 'doodle_alt' | 'doodle_word'>[]
  return { entry: e, allowed: wordAllowed(rows, e.day), recent: rows.slice(0, 3).map((r) => ({ text: r.text, alt: r.doodle_alt ?? null })) }
}

/// Draw and store the doodle for one entry row. Returns what was drawn, or
/// null when the person has doodles turned off.
export async function doodleEntry(entryId: string): Promise<Drawn | null> {
  const ctx = await drawContext(entryId)
  if (!ctx) return null
  const { entry: e } = ctx
  const drawn = await drawDoodle(e.text, { wordAllowed: ctx.allowed, recent: ctx.recent })
  const { error: e3 } = await f2Supabase()
    .from('onething_entries')
    .update({ doodle: drawn.svg, doodle_alt: drawn.alt, doodle_word: drawn.word, doodled_at: new Date().toISOString() })
    .eq('id', entryId)
    // The text may have changed while we drew; a newer save redraws it.
    .eq('updated_at', e.updated_at)
  if (e3) throw new Error(`onething doodle: save failed: ${e3.message}`)
  return drawn
}

// ---------- redraws: three takes, the person keeps one ----------

export const REDRAW_TAKES = 3
// Each take gets its own push, so three parallel calls don't come back as the same drawing.
const TAKES = [
  'Take 1 of 3: the most obvious good image, drawn well.',
  'Take 2 of 3: a different subject from the sentence than the obvious one — a detail, a side object, the setting.',
  'Take 3 of 3: a sideways, slightly funny angle on the day; still one clear image.',
]

/// Three new drawings for one of the user's entries, drawn in parallel and
/// NOT stored: the person picks one (keepRedraw) or none. A take that fails
/// is dropped; all three failing throws.
export async function redrawOptions(entryId: string, userId: string): Promise<Drawn[]> {
  const ctx = await drawContext(entryId, userId)
  if (!ctx) throw new Error('Doodles are off. Turn them on in settings.')
  const avoid = ctx.entry.doodle_alt ? [ctx.entry.doodle_alt] : []
  const got = await Promise.allSettled(
    TAKES.slice(0, REDRAW_TAKES).map((take) => drawDoodle(ctx.entry.text, { wordAllowed: ctx.allowed, recent: ctx.recent, avoid, take })),
  )
  const ok = got.flatMap((g) => (g.status === 'fulfilled' ? [g.value] : []))
  for (const g of got) if (g.status === 'rejected') console.error('[onething] redraw take failed', entryId, g.reason)
  if (!ok.length) throw new Error('The pen slipped. Try again.')
  return ok
}

/// Store the take the person picked. The markup comes back from the browser,
/// so it goes through the sanitizer again, with words only on a day that allows them.
export async function keepRedraw(entryId: string, userId: string, pick: { svg: string; alt: string }): Promise<Drawn> {
  const ctx = await drawContext(entryId, userId)
  if (!ctx) throw new Error('Doodles are off. Turn them on in settings.')
  const svg = sanitizeSvg(pick.svg, { allowText: ctx.allowed })
  if (!svg) throw new Error('That drawing came back empty.')
  const word = ctx.allowed ? textContent(svg) : null
  const drawn = { svg, alt: String(pick.alt ?? '').slice(0, 200), word: word ? word.slice(0, 40) : null }
  const { error } = await f2Supabase()
    .from('onething_entries')
    .update({ doodle: drawn.svg, doodle_alt: drawn.alt, doodle_word: drawn.word, doodled_at: new Date().toISOString() })
    .eq('id', entryId)
    .eq('user_id', userId)
  if (error) throw new Error(`onething doodle: save failed: ${error.message}`)
  return drawn
}

/// Draw after the response is sent. Outside a request (scripts), draw now.
export function scheduleDoodle(entryId: string): void {
  const run = () => doodleEntry(entryId).then(() => undefined, (err: unknown) => console.error('[onething] doodle failed', entryId, err))
  try {
    after(run)
  } catch {
    void run()
  }
}
