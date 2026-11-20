// Which of the documents in venture_docs the voice call and the text replies carry.
// No imports: scripts/venture/notes-check.ts runs this against the live table.

export type Doc = { slug: string; title: string; body: string; updated_at?: string | null }

// The notes have a size budget. On 2026-11-15 seven raw research files (1.5 MB) were synced
// into venture_docs in the morning; at 4:09 pm the prompt was 1,097,063 tokens against the
// model's 1,000,000 and every reply failed: one text, then nineteen voice replies across
// three calls, while Bart said "Hello, can you hear me?" to a dead line. Measured that
// day: about 2.7 characters a token, so 1,000,000 characters is about 370,000 tokens.
export const NOTES_BUDGET = 1_000_000 // characters, all documents together
export const NOTES_DOC_MAX = 150_000 // a longer file is a raw dump, not a note: listed, never loaded
// "now" (where things stand) is loaded first, then the standing rules distilled from Bart's
// corrections, the corrections themselves and the lessons: he asked (2026-11-14) that those
// "are always part of your context". These load whatever their size.
// "terminal-chat" is what Bart and the terminal Kit said, kept current after every message
// (scripts/venture/chat-export.py; 2026-11-18, Bart to the voice Kit: "You typed it just now in
// the chat that I'm having with you. Go read it.").
const FIRST = ['now', 'terminal-chat', 'rules', 'corrections', 'lessons', 'charter', 'bets', 'kit', '001-founding-interview']

// Which documents are loaded in full and which are only listed: the FIRST ones, then the
// rest newest first, each taken if it is under the per-file limit and still fits.
export function pickNotes(all: Doc[]): { loaded: Doc[]; listed: Doc[] } {
  const rank = (slug: string) => (FIRST.includes(slug) ? FIRST.indexOf(slug) : FIRST.length)
  const docs = [...all].sort(
    (a, b) => rank(a.slug) - rank(b.slug) || (b.updated_at ?? '').localeCompare(a.updated_at ?? '') || a.slug.localeCompare(b.slug),
  )
  const loaded: Doc[] = []
  const listed: Doc[] = []
  let used = 0
  for (const d of docs) {
    const core = FIRST.includes(d.slug)
    // An archive note (a file named *-ARCHIVE*.md, slug "…-archive…") is listed, never loaded: the
    // evening review moves stale layers of NOW.md there (OLA-251, SWEEP.md "Clean the notes").
    if (/(^|-)archive(-|$)/.test(d.slug)) {
      listed.push(d)
      continue
    }
    if (core || (d.body.length <= NOTES_DOC_MAX && used + d.body.length <= NOTES_BUDGET)) {
      loaded.push(d)
      used += d.body.length
    } else listed.push(d)
  }
  return { loaded, listed }
}

// The order in the text is not the order of importance: the least recently changed document
// first, the newest last (OLA-204). The notes are about 370,000 tokens and the model reads them
// from its prompt cache only up to the first character that changed. "now" and "terminal-chat"
// used to go first and change many times a day, so a reply after any change read all of it
// again: on the check-in of 2026-11-19 those replies began after 8.6 and 10.4 seconds, the
// others after 3 to 4.5.
export function notesText({ loaded, listed }: { loaded: Doc[]; listed: Doc[] }): string {
  const order = [...loaded].sort((a, b) => (a.updated_at ?? '').localeCompare(b.updated_at ?? '') || a.slug.localeCompare(b.slug))
  const full = order.map((d) => `\n===== ${d.slug}: ${d.title} =====\n${d.body}\n`).join('')
  if (listed.length === 0) return full
  const titles = listed.map((d) => `- ${d.slug}: ${d.title} (${Math.round(d.body.length / 1000)}k characters)`).join('\n')
  return `${full}\n===== files that exist but are not loaded here (too long) =====\nOnly the terminal session can read these. If Bart asks for something that is in one of them, say that the file is not loaded here and that you will check after.\n${titles}\n`
}
