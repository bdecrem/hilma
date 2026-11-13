// An experiment (2026-11-13): can the ten loose leaves be a real book? One Claude call writes a
// fellow's whole absurd monograph from the one line the game knows about them. Prints the book,
// how long it took and what it cost in tokens; saves nothing.
// Usage: set -a; source ./.env.local; set +a
//        npx tsx scripts/semibart/book-try.ts <character> [low|medium|high] [out.txt]
import { readFileSync, writeFileSync } from 'node:fs'
import Anthropic from '@anthropic-ai/sdk'

export const BOOK_SYSTEM = `You write books for CASBS Quest, a point-and-click pixel game set at the Center for Advanced Study in the Behavioral Sciences at Stanford, where scholars spend a year writing the book they have been meaning to write. In the game the oaks on campus drop loose leaves, each one a page. A fellow who collects ten has a book on their desk, and anyone who walks into their study can pick it up and read it. You write that book: all ten pages, in one go.

# What the book is

A parody monograph by a real scholar, co-written with an oak. It is built from the one line the game knows about the fellow's actual work, and it is absurd in a specific way: it takes their real subject completely seriously and follows it somewhere it should not go. The comedy comes from three places.
- Their subject, pushed one logical step too far and then defended at length.
- The habits of academic prose: the hedge, the footnote that quietly disagrees with the sentence it hangs from, the self-citation, the reviewer who was not persuaded, the figure that explains nothing, the acknowledgments, the index.
- The co-author. The oak has standing, patience, and opinions about squirrels, weather, and anything that happened before 1800. Its contributions are few and unmistakable.

The scholar comes out of it well: brilliant, thorough, slightly possessed. The joke is on the genre and on the tree, never on the person. They are a real colleague and will read this in front of their peers, so it should make them laugh and want to show someone. Use only what you are told about them; invent no facts about their life, name no other real people, and no institution but CASBS.

# How it reads

Deadpan. Short declarative sentences. Understatement. The joke lands in the second sentence, which is shorter than the first. No exclamation marks, no puns announced as puns, nothing that explains itself, no winking at the reader. It should read like a real academic book that has gone wrong without noticing, and a good line could only be about this scholar's subject.

# The ten pages

The pages were found out of order, and the finder reacts to some of them, so each of the ten has a job. Write them in this order, with these page numbers:

1. Page 12. The middle of an argument, mid-stride.
2. Page 3. The thesis, stated with more confidence than the evidence allows.
3. Page 40. A page that is mostly footnotes. Number them.
4. Page 7. The argument assembling itself; the reader starts to worry it may be right.
5. Page 55. A figure or a table, described in words: its caption, what its axes are, what it fails to show.
6. Page 91. The boldest claim in the book. A reasonable reader disagrees with it.
7. Page 118. The oak's own passage. It cites itself (Oak, forthcoming).
8. Page 2. The first line of the book, and how it starts.
9. Page 203. The acknowledgments, or a stretch of the index. The oak is in it.
10. Page 240. The last page. It ends with the words THE END.

Each page is 35 to 60 words: it has to fit on a small card in a pixel font. Plain text only, no markdown.

# Format

<title>The title, at most 50 characters</title>
<subtitle>The subtitle, at most 80 characters; academic subtitles are where the truth slips out</subtitle>
<page n="12">...</page>
... ten pages in the order above, each with its page number.`

async function main() {
  const [slug, effort = 'low', out] = process.argv.slice(2)
  const html = readFileSync('public/semibart/index.html', 'utf8')
  const fellows = JSON.parse(/const FELLOWS = (\{.*?\});\n/s.exec(html)![1]) as Record<string, { name: string; look: string; whisper: string }>
  const f = slug === 'bart' ? { name: 'Bart', look: 'Bart. Fellow. Builder of things. Owner of sunglasses. Teaches a seminar on how to use AI, and is building a piano course called Takt.', whisper: '' } : fellows[slug]
  if (!f) { console.error('no such fellow: ' + slug); process.exit(1) }
  const client = new Anthropic()
  const t0 = Date.now()
  const res = await client.messages.stream({
    model: 'claude-opus-5-5',
    max_tokens: 8000,
    output_config: { effort: effort as 'low' | 'medium' | 'high' },
    system: BOOK_SYSTEM,
    messages: [{ role: 'user', content: `The author: ${f.name}.\nWhat the game says about them: ${JSON.stringify(f.look)}${f.whisper ? `\nWhat they whisper in the seminar: ${JSON.stringify(f.whisper.replace(/^Shh\.\s*/, ''))}` : ''}\n\nWrite their book.` }],
  }).finalMessage()
  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('')
  const title = /<title>([\s\S]*?)<\/title>/.exec(text)?.[1].trim() ?? '(no title)'
  const subtitle = /<subtitle>([\s\S]*?)<\/subtitle>/.exec(text)?.[1].trim() ?? ''
  const pages = [...text.matchAll(/<page n="(\d+)">([\s\S]*?)<\/page>/g)].map(m => ({ n: +m[1], text: m[2].trim() }))
  const words = pages.map(p => p.text.split(/\s+/).length)
  const report = [`${f.name} · effort ${effort} · ${((Date.now() - t0) / 1000).toFixed(1)} s · ${res.usage.input_tokens} in, ${res.usage.output_tokens} out · stop ${res.stop_reason} · ${pages.length} pages, ${Math.min(...words)}-${Math.max(...words)} words`,
    '', title.toUpperCase(), subtitle, `by ${f.name} and an oak`, '', ...pages.map(p => `p. ${p.n}\n${p.text}\n`)].join('\n')
  console.log(report)
  if (out) writeFileSync(out, report)
}
main().catch(e => { console.error(e); process.exit(1) })
