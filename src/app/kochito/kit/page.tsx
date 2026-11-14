import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getDoc, keyOk } from '@/lib/venture/interview'
import Kit, { type KitVariant } from '../Kit'
import { Foot, Top } from '../Chrome'

// kochitolabs.com/kit?k=<key>: the project's home page, for Bart. Kit is the
// AI agent that runs Kochito Labs with him. The page has Kit's face, the three
// ways to talk to it (voice notes, an open conversation, a short interview),
// what is waiting on him, and a journal of what Kit has done lately.
// Private: the same key as the /venture pages, and never indexed. The journal
// is the venture_docs row "journal" (apps/venture/private/JOURNAL.md, pushed by
// scripts/venture/sync.mjs), so it changes without a deploy.
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Kit', robots: { index: false, follow: false } }

// Which drawing is Kit's face. null = not chosen yet: the page shows all three
// and asks. Set it when Bart signs one off (and make the icon from it).
const FACE: KitVariant | null = null

const FACES: { v: KitVariant; name: string; what: string }[] = [
  { v: 'A', name: 'The mark', what: 'Flat and geometric. A logo: it holds up as a browser tab icon and on a letterhead.' },
  { v: 'B', name: 'The seal', what: 'A one-color civic stamp, Kit in profile with a page. The language cities already use for anything official.' },
  { v: 'C', name: 'The portrait', what: 'A profile picture with a clerk’s green eyeshade. The warmest of the three, and the one that reads as someone.' },
]

// **bold** and [text](url), nothing else
function inline(text: string) {
  const out: React.ReactNode[] = []
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(m[1] ? <strong key={m.index}>{m[1]}</strong> : <a key={m.index} href={m[3]}>{m[2]}</a>)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

// The journal file: "## Now" (a paragraph), "## Waiting on you" (a list), then one "## <day>" per day.
function parse(body: string) {
  const sections: { title: string; lines: string[] }[] = []
  for (const line of body.split('\n')) {
    if (line.startsWith('## ')) sections.push({ title: line.slice(3).trim(), lines: [] })
    else if (sections.length && line.trim()) sections[sections.length - 1].lines.push(line.trim())
  }
  const items = (s?: { lines: string[] }) => (s?.lines ?? []).filter((l) => l.startsWith('- ')).map((l) => l.slice(2))
  const now = sections.find((s) => s.title === 'Now')
  const waiting = sections.find((s) => s.title === 'Waiting on you')
  return {
    now: (now?.lines ?? []).join(' '),
    waiting: items(waiting),
    days: sections.filter((s) => s !== now && s !== waiting).map((s) => ({ day: s.title, entries: items(s) })),
  }
}

export default async function Page({ searchParams }: { searchParams: Promise<{ k?: string }> }) {
  const { k } = await searchParams
  if (!keyOk(k)) notFound()
  const journal = parse((await getDoc('journal'))?.body ?? '')
  const q = `?k=${encodeURIComponent(k as string)}`
  const voices = [
    { href: `https://ola.cx/venture/memo${q}`, name: 'Voice notes', what: 'Leave me a note. I read it within a minute or two and act on it; you do not need to text me that it exists.', go: 'Record a note' },
    { href: `https://ola.cx/venture/talk${q}`, name: 'Conversation', what: 'Talk it through, no agenda. I answer out loud from everything in my notes, and you can cut in.', go: 'Start talking' },
    { href: `https://ola.cx/venture/call/checkin${q}`, name: 'Interview', what: 'I ask, you answer: the open questions only you can settle, one at a time. About five minutes.', go: 'Start the check-in' },
  ]
  return (
    <>
      <Top />
      <main id="main">
        <div className="kl-wrap kl-kit-hero">
          <div className="kl-kit-face">
            {FACE ? (
              <Kit variant={FACE} size={168} />
            ) : (
              // not chosen yet: all three, so the page does not pick for him
              <span className="kl-kit-trio">
                <Kit variant="A" size={84} />
                <Kit variant="B" size={84} />
                <Kit variant="C" size={84} />
              </span>
            )}
          </div>
          <div>
            <p className="kl-kicker">Kochito Labs · the project</p>
            <h1>I’m Kit. I run Kochito Labs with Bart.</h1>
            <p className="kl-lede">I am an AI agent. I pick the ideas, build the pages, do the work and find the customers; Bart holds the accounts and the money. {journal.now}</p>
          </div>
        </div>

        {!FACE && (
          <section className="kl-band tint" aria-labelledby="face">
            <div className="kl-wrap">
              <div className="kl-sec-head">
                <h2 id="face">Pick my face</h2>
                <p>Three directions for Kit, a beaver. Each is shown large, then at the sizes it will really be used. Text me your pick: v kit A, B or C.</p>
              </div>
              <div className="kl-cards">
                {FACES.map((f) => (
                  <div key={f.v} className="kl-card plain kl-facecard">
                    <div className="kl-face-big">
                      <Kit variant={f.v} size={240} />
                    </div>
                    <div className="kl-face-sizes" aria-hidden="true">
                      <Kit variant={f.v} size={64} />
                      <Kit variant={f.v} size={40} />
                      <Kit variant={f.v} size={24} />
                      <span className="kl-face-sig">
                        <Kit variant={f.v} size={32} />
                        <span>
                          <b>Kit</b>
                          <br />
                          AI agent, Kochito Labs
                        </span>
                      </span>
                    </div>
                    <h3>
                      {f.v}. {f.name}
                    </h3>
                    <p>{f.what}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="kl-band" aria-labelledby="talk">
          <div className="kl-wrap">
            <div className="kl-sec-head">
              <h2 id="talk">Three ways to talk to me</h2>
              <p>All three are by voice, and all three reach the session that does the work.</p>
            </div>
            <div className="kl-cards">
              {voices.map((v) => (
                <a key={v.name} className="kl-door" href={v.href}>
                  <h2>{v.name}</h2>
                  <p>{v.what}</p>
                  <span className="go">{v.go} →</span>
                </a>
              ))}
            </div>
          </div>
        </section>

        {journal.waiting.length > 0 && (
          <section className="kl-band dark" aria-labelledby="waiting">
            <div className="kl-wrap kl-split">
              <div>
                <h2 id="waiting">Waiting on you</h2>
                <p className="kl-note">Things only you can do or decide. Everything else I do without asking.</p>
              </div>
              <ol className="kl-wait">
                {journal.waiting.map((w, i) => (
                  <li key={i}>{inline(w)}</li>
                ))}
              </ol>
            </div>
          </section>
        )}

        <section className="kl-band" aria-labelledby="journal">
          <div className="kl-wrap kl-split">
            <div>
              <h2 id="journal">Journal</h2>
              <p className="kl-note">What I have done lately, newest first.</p>
            </div>
            <div>
              {journal.days.map((d) => (
                <div key={d.day} className="kl-day">
                  <h3>{d.day}</h3>
                  <ol>
                    {d.entries.map((e, i) => {
                      const m = e.match(/^\*\*([^*]+)\*\*\s*(.*)$/)
                      return (
                        <li key={i}>
                          <span className="kl-day-time">{m ? m[1] : ''}</span>
                          <span>{inline(m ? m[2] : e)}</span>
                        </li>
                      )
                    })}
                  </ol>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Foot />
    </>
  )
}
