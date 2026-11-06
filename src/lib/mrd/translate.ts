// English machine translation of law texts for the library at ola.cx/mrd, with Haiku 5.5.
// A page is split into ~5k-char chunks at line breaks; each chunk is translated once and kept in `translations`.
import Anthropic from '@anthropic-ai/sdk'
import { createHash } from 'crypto'
import { completedText } from '@/lib/anthropic-response'

export const MODEL = 'claude-haiku-5-5'
const CHUNK = 5000

let _client: Anthropic | null = null
function client() {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')
    _client = new Anthropic({ apiKey })
  }
  return _client
}

/** Running token count, for the batch script's cost line. */
export const usage = { input: 0, output: 0 }

export const sha1 = (s: string) => createHash('sha1').update(s).digest('hex')

/** Deterministic split, so cached chunks line up with the same text next time. Cuts fall on a paragraph break, else a
 * sentence end, else a line break: a chunk that starts mid-sentence gets its first words dropped or left untranslated. */
export function chunks(text: string): string[] {
  const out: string[] = []
  let a = 0
  while (a < text.length) {
    let b = Math.min(text.length, a + CHUNK)
    if (b < text.length) {
      const win = text.slice(a + CHUNK / 2, b)
      const para = win.lastIndexOf('\n\n')
      let cut = para >= 0 ? para + 2 : -1
      if (cut < 0) {
        let m: RegExpExecArray | null, last = -1
        const re = /[.;:]["”)]?\s+(?=[\p{Lu}\d(«"“])/gu
        while ((m = re.exec(win))) last = m.index + m[0].length
        cut = last
      }
      if (cut < 0) { const nl = win.lastIndexOf('\n'); cut = nl >= 0 ? nl + 1 : -1 }
      if (cut < 0) { const sp = win.lastIndexOf(' '); cut = sp >= 0 ? sp + 1 : -1 }
      if (cut >= 0) b = a + CHUNK / 2 + cut
    }
    out.push(text.slice(a, b))
    a = b
  }
  return out
}

// No system prompt, and the instruction after the excerpt: with a system prompt, or with rules like "keep the line breaks
// exactly" before the text, Haiku 5.5 returned whole chunks untranslated about one time in four (tested 2026-11-06).

const LANG = new Intl.DisplayNames(['en'], { type: 'language' })

/** Share of the source's word 4-grams that survive into the output: a high share means the model copied instead of translating. */
export function echo(src: string, out: string): number {
  const grams = (t: string) => {
    const w = t.toLowerCase().split(/\s+/).filter(Boolean)
    const g = new Set<string>()
    for (let i = 0; i + 4 <= w.length; i++) g.add(w.slice(i, i + 4).join(' '))
    return g
  }
  const a = grams(src)
  if (a.size < 20) return 0
  const b = grams(out)
  let same = 0
  for (const x of a) if (b.has(x)) same++
  return same / a.size
}

export async function once(text: string, ctx: { lang?: string | null; law?: string }, effort: 'low' | 'medium') {
  const from = ctx.lang ? (LANG.of(ctx.lang) ?? ctx.lang) : 'its original language'
  const res = await client().messages.create({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort },
    messages: [{
      role: 'user',
      content: `<excerpt>\n${text}\n</excerpt>\n\nTranslate the excerpt above${ctx.law ? ` (from ${ctx.law})` : ''} from ${from} into English, preserving its line breaks and headings. It may begin or end mid-sentence. Output only the English translation, as plain text, with no notes and no added headings or Markdown.`,
    }],
  } as never) as unknown as Anthropic.Message
  usage.input += res.usage?.input_tokens ?? 0
  usage.output += res.usage?.output_tokens ?? 0
  return completedText(res)
}

export async function translate(text: string, ctx: { lang?: string | null; law?: string }): Promise<string> {
  if (!text.trim()) return text
  let out = await once(text, ctx, 'low')
  // some sources are bilingual (Japan's official texts carry an English version): copying the English is right there
  const english = (t: string) => { const w = t.split(/\s+/).length; return w > 0 && (t.match(/\b(the|of|and|shall|to|in)\b/gi) ?? []).length / w > 0.08 }
  const copied = (o: string) => ctx.lang !== 'en' && echo(text, o) > 0.3 && !english(text)
  if (copied(out)) out = await once(text, ctx, 'medium')
  if (copied(out)) throw new Error('the model returned the original instead of a translation')
  // a leading ellipsis or quote the source doesn't have
  if (!/^\s*[.…"“]/.test(text)) out = out.replace(/^\s*(?:\.{3}|…|["“])\s*/, '')
  return out
}
