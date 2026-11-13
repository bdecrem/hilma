// CASBS Quest books (schema apps/semibart/schema/023). Every fellow's book is written ahead of
// time by Opus 5.5 from the one line the game knows about them: something funny and unexpected in
// whatever form suits them, ten pages, pixel drawings allowed. A fellow reads it a page at a time
// as they pick up loose leaves (social.ts, semibart_pages); at ten it is unlocked, readable by
// anyone, and its owner can ask the chat to change it (reviseBook). Admins read every book.
// Written in advance by scripts/semibart/books-generate.ts. No Next imports.

import type Anthropic from '@anthropic-ai/sdk'
import { db } from './db'

const MODEL = 'claude-opus-5-5'
export const BOOK_PAGES = 10

export type BookPage = { text: string; art: { rows: string[]; palette: Record<string, string> } | null }
export type Book = { form: string; title: string; subtitle: string; pages: BookPage[] }
export type BookRow = Book & { character: string; about: string; share: string; version: number; updated_at: string }

// The spread to choose from. Each book is offered a few of these at random, so that fifty books
// are not fifty plays, and is free to take none of them.
export const FORMS = [
  'a stage play, with stage directions', 'an epic poem', 'a picture book for small children', 'an art book: nothing but drawings, each with a title',
  'a cookbook', 'a field guide', 'a hard-boiled detective story', 'an assembly manual with diagrams', 'a choose-your-own-adventure',
  'a self-help book', 'the libretto of a musical', 'a travel guide', 'a book of haiku', 'a comic, told in drawn panels', 'an almanac of horoscopes',
  'a romance novel', 'a hymnal', 'the script of a nature documentary', 'a wine list with tasting notes', 'an auction catalogue',
  'an alphabet book', "a ship's log", 'terms and conditions', 'a bestiary', 'a museum audio guide', 'a book of knitting patterns',
  'the minutes of a meeting', 'a fairy tale', 'a Western', 'a pulp science-fiction paperback', 'a high-school yearbook', 'a collection of letters of complaint',
  'liner notes for an album', 'a book of spells', 'a sports almanac', 'a tarot deck with its little booklet', 'a pop-up book, described flap by flap',
  'a seed catalogue', 'a phrasebook for travellers', 'a book of card tricks',
]

export const BOOK_SYSTEM = `You write books for CASBS Quest, a point-and-click pixel game set at the Center for Advanced Study in the Behavioral Sciences at Stanford, where scholars spend a year writing a book. In the game each fellow slowly collects ten loose pages; when they have all ten there is a finished book on their desk, and anyone who walks into their study can pick it up and read it. You write that book: all ten pages, in one go.

# What to make

Something funny, unexpected and delightful that could only belong to this one person. You are told one line about what they actually work on. Take that subject and put it in a kind of book it has no business being in: their research as a stage play, a cookbook, a book of haiku, a Western, an assembly manual, a picture book that is nothing but drawings. The pleasure is in the collision, and in how seriously the book commits to its form. A reader should grin at the title, and again on every page.

You are offered a few forms to start from. Use one if it suits this person, bend it, or throw them all out for a better idea. Do not default to the academic monograph, and do not mix several forms: pick one and commit.

The person is a real scholar who will read this in front of colleagues. It should make them laugh and want to show someone. They come out of it as someone whose obsessions are worth a whole strange book. The joke is never at their expense, and never on their competence, looks, age, origin or private life. Use only what you are told; invent no facts about their life, and name no other real people.

# Craft

Write it well. Whatever the form, it should be a good example of that form: a poem that scans, a play whose two lines of dialogue land, a recipe you could almost follow. Specific beats general. Dry beats zany. No exclamation marks unless the form demands them, nothing that explains its own joke, no winking at the reader. Let the ten pages go somewhere: a beginning, a turn, an ending worth the wait.

# Pages

Exactly ten pages, in reading order. A page holds text, a drawing, or both.
- Text: at most 50 words on a page (at most 25 when the page also has a drawing). It has to fit on a small card in a pixel font. Plain text; line breaks are kept, so verse and dialogue can be set out in lines.
- A drawing is pixel art, drawn the way the game is drawn: chunky, flat colors, dark outlines, no shading to speak of. Give it as rows of single characters, at most 44 wide and 26 tall, all rows the same length, with '.' for bare paper, and a palette that maps each other character to a hex color (at most 8 colors). The paper is cream (#fff7e6), so draw in darker colors. Make each drawing a clear, readable picture of one thing.
- Use drawings when they make the book better. An art book or a comic may be all drawings; a book of haiku may have none.

# Format

<form>what kind of book it is, in a few words: "a play in one act", "a field guide"</form>
<title>at most 50 characters</title>
<subtitle>optional, at most 80 characters</subtitle>
<page>
<text>...</text>
<art palette="k:#141414 r:#ff5a1f">
rows
</art>
</page>
... ten <page> blocks. Leave out <text> or <art> on a page that does not have one.`


/** Read a reply in the format above. Null when it is not a whole book. */
export function parseBook(text: string): Book | null {
  const tag = (t: string, s = text) => (new RegExp(`<${t}>([\\s\\S]*?)</${t}>`).exec(s)?.[1] ?? '').trim()
  const pages = [...text.matchAll(/<page>([\s\S]*?)<\/page>/g)].map(m => {
    const art = /<art palette="([^"]*)">\s*\n?([\s\S]*?)\s*<\/art>/.exec(m[1])
    let drawing: BookPage['art'] = null
    if (art) {
      const palette: Record<string, string> = {}
      for (const pair of art[1].trim().split(/\s+/)) { const i = pair.indexOf(':'); if (i === 1 && /^#[0-9a-fA-F]{3,8}$/.test(pair.slice(2))) palette[pair[0]] = pair.slice(2) }
      const rows = art[2].split('\n').map(r => r.replace(/\s+$/, '')).filter(r => r.length).slice(0, 26).map(r => r.slice(0, 44))
      if (rows.length && Object.keys(palette).length) drawing = { rows, palette }
    }
    return { text: tag('text', m[1]).slice(0, 600), art: drawing }
  }).filter(p => p.text || p.art)
  const title = tag('title').slice(0, 80)
  if (!title || pages.length !== BOOK_PAGES) return null
  return { form: tag('form').slice(0, 80), title, subtitle: tag('subtitle').slice(0, 120), pages }
}

/** One call: the book, or null after a second try fails too. */
async function ask(messages: Anthropic.MessageParam[], effort: 'low' | 'medium' | 'high'): Promise<Book | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  const { default: AnthropicSDK } = await import('@anthropic-ai/sdk')
  const client = new AnthropicSDK({ apiKey })
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await client.messages.stream({ model: MODEL, max_tokens: 24000, output_config: { effort }, system: [{ type: 'text', text: BOOK_SYSTEM, cache_control: { type: 'ephemeral' } }], messages }).finalMessage()
    if (res.stop_reason === 'refusal') return null
    const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('')
    const book = parseBook(text)
    if (book) return book
    messages = [...messages, { role: 'assistant', content: text || '(nothing)' }, { role: 'user', content: `That was not a whole book in the format: it needs a <title> and exactly ${BOOK_PAGES} <page> blocks. Write it again, complete.` }]
  }
  return null
}

export type Author = { name: string; look: string; say?: string }

/** Write a fellow's book from scratch. */
/** taken: forms colleagues' books already use; this one must be something else. */
export function writeBook(a: Author, effort: 'low' | 'medium' | 'high' = 'medium', taken: string[] = []): Promise<Book | null> {
  const used = (f: string) => taken.some(t => t.toLowerCase().split(/\W+/).filter(w => w.length > 4).some(w => f.toLowerCase().includes(w)))
  const offered = FORMS.filter(f => !used(f)).sort(() => Math.random() - 0.5).slice(0, 4)
  return ask([{ role: 'user', content: `The author: ${a.name}.\nWhat the game says about them: ${JSON.stringify(a.look)}${a.say ? `\nSomething they say in the game: ${JSON.stringify(a.say)}` : ''}\n\nForms on offer this time: ${offered.join('; ')}. Or a better one of your own.${taken.length ? `\nColleagues' books already take these forms, so this one must be something different: ${[...new Set(taken)].join('; ')}.` : ''}\n\nWrite their book.` }], effort)
}

const asText = (b: Book) => [`<form>${b.form}</form>`, `<title>${b.title}</title>`, `<subtitle>${b.subtitle}</subtitle>`,
  ...b.pages.map(p => `<page>\n${p.text ? `<text>${p.text}</text>\n` : ''}${p.art ? `<art palette="${Object.entries(p.art.palette).map(([k, v]) => `${k}:${v}`).join(' ')}">\n${p.art.rows.join('\n')}\n</art>\n` : ''}</page>`)].join('\n')

/** The owner asked for a change ("make it a musical", "more about my dog", "page 4 is too long"). */
export function reviseBook(a: Author, book: Book, request: string): Promise<Book | null> {
  return ask([{ role: 'user', content: `The author: ${a.name}.\nWhat the game says about them: ${JSON.stringify(a.look)}\n\nTheir book as it stands:\n${asText(book)}\n\nThey have read it and ask for a change: ${JSON.stringify(request)}\n\nDo what they ask, as well as it can be done, and keep everything they did not ask to change. The same rules apply: still funny, still kind to them, still exactly ${BOOK_PAGES} pages. Reply with the whole book in the format.` }], 'medium')
}

/* ---------- storage ---------- */

export async function getBook(character: string): Promise<BookRow | null> {
  const { data, error } = await db().from('semibart_books').select('character, form, title, subtitle, pages, about, share, version, updated_at').eq('character', character).maybeSingle()
  if (error) throw new Error(`semibart_books: ${error.message}`)
  return (data as BookRow | null) ?? null
}

export async function allBookTitles(): Promise<Record<string, { form: string; title: string }>> {
  const { data, error } = await db().from('semibart_books').select('character, form, title')
  if (error) throw new Error(`semibart_books: ${error.message}`)
  return Object.fromEntries((data || []).map(r => [r.character as string, { form: r.form as string, title: r.title as string }]))
}

/** Store a new version of a character's book (the first, or a change). Returns its version. */
export async function saveBook(character: string, book: Book, ask: string, author: string, about?: string): Promise<number> {
  const now = await getBook(character)
  const version = (now ? now.version : 0) + 1
  const v = await db().from('semibart_book_versions').insert({ character, version, book, ask, author })
  if (v.error) throw new Error(`semibart_book_versions: ${v.error.message}`)
  const row = { character, form: book.form, title: book.title, subtitle: book.subtitle, pages: book.pages, version, updated_at: new Date().toISOString(), ...(about !== undefined ? { about } : {}) }
  const { error } = await db().from('semibart_books').upsert(row)
  if (error) throw new Error(`semibart_books: ${error.message}`)
  return version
}

/** Back one version. Null when there is nothing before it. */
export async function undoBook(character: string, author: string): Promise<BookRow | null> {
  const now = await getBook(character)
  if (!now || now.version < 2) return null
  const { data, error } = await db().from('semibart_book_versions').select('book').eq('character', character).eq('version', now.version - 1).maybeSingle()
  if (error) throw new Error(`semibart_book_versions: ${error.message}`)
  if (!data) return null
  await saveBook(character, data.book as Book, '(undo)', author)
  return getBook(character)
}

/** The book whose own page is ola.cx/semibart/book/<share>. */
export async function getBookByShare(share: string): Promise<BookRow | null> {
  if (!/^[0-9a-f]{12}$/.test(share)) return null
  const { data, error } = await db().from('semibart_books').select('character, form, title, subtitle, pages, about, share, version, updated_at').eq('share', share).maybeSingle()
  if (error) throw new Error(`semibart_books: ${error.message}`)
  return (data as BookRow | null) ?? null
}
