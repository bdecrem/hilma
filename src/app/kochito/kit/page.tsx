import type { Metadata, Viewport } from 'next'
import { notFound } from 'next/navigation'
import { getDoc, keyOk } from '@/lib/venture/interview'
import '../company.css'

// kochitolabs.com/kit?k=<key>: the project's home page, for Bart. Kit is the
// AI agent that runs Kochito Labs with him. The page has Kit's face, honest
// numbers, the three ways to talk to it (voice notes, an open conversation, a
// short interview), what is waiting on him, and a journal of what Kit did.
// Private: the same key as the /venture pages, and never indexed. The text
// comes from the venture_docs row "journal" (apps/venture/private/JOURNAL.md,
// pushed by scripts/venture/sync.mjs), so it changes without a deploy.
// The look is the company's own (company.css), not the products'.
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Kit', robots: { index: false, follow: false } }
export const viewport: Viewport = { themeColor: '#0d0d10', viewportFit: 'cover' }

// Kit's face. Eight candidates by two designers (public/kochito/kit/<id>.svg);
// FACE is the one Bart signed off, null until he has: the page then shows all
// eight, numbered, and asks.
const FACE: string | null = null
const CANDIDATES: { id: string; by: string }[] = [
  { id: 'hand-1', by: 'hand-drawn' },
  { id: 'hand-2', by: 'hand-drawn' },
  { id: 'hand-3', by: 'hand-drawn' },
  { id: 'hand-4', by: 'hand-drawn' },
  { id: 'pixel-1', by: 'pixel' },
  { id: 'pixel-2', by: 'pixel' },
  { id: 'pixel-3', by: 'pixel' },
  { id: 'pixel-4', by: 'pixel' },
]
const src = (id: string) => `/kochito/kit/${id}.svg`
// the drawings that exist in public/kochito/kit/ (a candidate not listed shows as "still being drawn")
const READY = new Set(['hand-1', 'hand-2', 'hand-3', 'hand-4'])

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

// The journal file: "## Now" (a paragraph), "## Numbers", "## Waiting on you" and
// "## Parked, your call" (lists), then one "## <day>" per day of "- **time** what".
function parse(body: string) {
  const sections: { title: string; lines: string[] }[] = []
  for (const line of body.split('\n')) {
    if (line.startsWith('## ')) sections.push({ title: line.slice(3).trim(), lines: [] })
    else if (sections.length && line.trim()) sections[sections.length - 1].lines.push(line.trim())
  }
  const named = ['Now', 'Numbers', 'Waiting on you', 'Parked, your call']
  const get = (t: string) => sections.find((s) => s.title === t)
  const items = (t: string) => (get(t)?.lines ?? []).filter((l) => l.startsWith('- ')).map((l) => l.slice(2))
  const days = sections
    .filter((s) => !named.includes(s.title))
    .map((s) => ({
      day: s.title,
      entries: s.lines
        .filter((l) => l.startsWith('- '))
        .map((l) => l.slice(2).match(/^\*\*([^*]+)\*\*\s*(.*)$/))
        .map((m, i, all) => (m ? { time: m[1], text: m[2] } : { time: '', text: String(all[i]) })),
    }))
  return { now: (get('Now')?.lines ?? []).join(' '), numbers: items('Numbers'), waiting: items('Waiting on you'), parked: items('Parked, your call'), days }
}

export default async function Page({ searchParams }: { searchParams: Promise<{ k?: string; look?: string }> }) {
  const { k, look } = await searchParams
  if (!keyOk(k)) notFound()
  const j = parse((await getDoc('journal'))?.body ?? '')
  const q = `?k=${encodeURIComponent(k as string)}`
  const last = j.days[0]?.entries[0]
  const voices = [
    { href: `https://ola.cx/venture/memo${q}`, tag: 'voice notes', name: 'Leave a note', what: 'Say what you want done, changed or looked at. I read it within a minute or two and act; no need to text me.', go: 'Record' },
    { href: `https://ola.cx/venture/talk${q}`, tag: 'conversation', name: 'Talk it through', what: 'No agenda. I answer out loud from everything in my notes, and you can cut in.', go: 'Start talking' },
    { href: `https://ola.cx/venture/call/checkin${q}`, tag: 'interview', name: 'Answer my questions', what: 'I ask the things only you can settle, one at a time. About five minutes.', go: 'Start the check-in' },
  ]
  return (
    <div className="ko" data-look={look === 'day' ? 'day' : 'night'}>
      <div className="ko-wrap">
        <header className="ko-top">
          <a className="ko-name" href="/">
            Kochito Labs<span>.</span>
          </a>
          <nav aria-label="Products">
            <a href="https://clerkpdf.com">ClerkPDF ↗</a>
            <a href="https://appadopt.com">AppAdopt ↗</a>
          </nav>
        </header>

        <main>
          <div className="ko-hero">
            <div>
              {last && (
                <p className="ko-seen ko-mono">
                  last entry {last.time}, {j.days[0].day}
                </p>
              )}
              <h1>
                Hi, I’m{' '}
                <span className="u">
                  Kit.
                  <svg viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden="true">
                    <path d="M3 13c22-8 40 6 62-1s38-9 60-2 44 2 72-5" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
                  </svg>
                </span>
              </h1>
              <p className="ko-lede">
                The AI agent running <strong>Kochito Labs</strong> with Bart. I pick the ideas, build the pages, do the work and find the customers. He holds the accounts and the money. {j.now}
              </p>
              {j.numbers.length > 0 && (
                <ul className="ko-stats ko-mono">
                  {j.numbers.map((n, i) => (
                    <li key={i}>{inline(n)}</li>
                  ))}
                </ul>
              )}
            </div>
            {FACE ? (
              <div className="ko-face">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src(FACE)} alt="Kit, a young beaver" />
              </div>
            ) : (
              <div className="ko-face empty">
                <div>
                  <b>?</b>
                  <span>my face goes here once you pick one</span>
                </div>
              </div>
            )}
          </div>

          {!FACE && (
            <section className="ko-sec" aria-labelledby="face">
              <div className="ko-sec-head">
                <h2 id="face">Pick my face</h2>
                <p>
                  {READY.size === CANDIDATES.length ? 'Eight takes on Kit by two designers, one drawing by hand, one in pixels.' : `${READY.size} of 8 are in: one designer draws by hand, the other in pixels and is still working.`} Text me the number: <span className="ko-kbd">v kit 3</span>
                </p>
              </div>
              <ol className="ko-faces">
                {CANDIDATES.map((c, i) => (
                  <li key={c.id}>
                    <span className="big">
                      {READY.has(c.id) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={src(c.id)} alt={`Kit, design ${i + 1}, ${c.by}`} loading="lazy" />
                      ) : (
                        <span className="pending ko-mono">still being drawn</span>
                      )}
                    </span>
                    <div className="row">
                      <span className="num">{i + 1}</span>
                      <span className="small" aria-hidden="true">
                        {READY.has(c.id) && (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={src(c.id)} alt="" width={36} height={36} />
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={src(c.id)} alt="" width={22} height={22} />
                          </>
                        )}
                        <span className="ko-mono by">{c.by}</span>
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="ko-sec" aria-labelledby="talk">
            <div className="ko-sec-head">
              <h2 id="talk">Talk to me</h2>
              <p>Three ways, all by voice. Each one reaches the session that does the work.</p>
            </div>
            <div className="ko-talk">
              {voices.map((v) => (
                <a key={v.tag} href={v.href}>
                  <span className="ko-mono tag">{v.tag}</span>
                  <h3>{v.name}</h3>
                  <p>{v.what}</p>
                  <span className="go">{v.go} →</span>
                </a>
              ))}
            </div>
          </section>

          {(j.waiting.length > 0 || j.parked.length > 0) && (
            <section className="ko-sec" aria-labelledby="you">
              <div className="ko-sec-head">
                <h2 id="you">Your side</h2>
                <p>Things only you can do or decide. Everything else I do without asking.</p>
              </div>
              <div className="ko-two">
                <div>
                  <p className="ko-sub">Waiting on you</p>
                  <ul className="ko-list">
                    {j.waiting.map((w, i) => (
                      <li key={i}>{inline(w)}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="ko-sub">Parked, your call</p>
                  <ul className="ko-list parked">
                    {j.parked.map((w, i) => (
                      <li key={i}>{inline(w)}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          )}

          <section className="ko-sec" aria-labelledby="journal">
            <div className="ko-sec-head">
              <h2 id="journal">Journal</h2>
              <p>What I did, newest first.</p>
            </div>
            {j.days.map((d) => (
              <div key={d.day} className="ko-day">
                <h3>{d.day}</h3>
                <ol>
                  {d.entries.map((e, i) => (
                    <li key={i}>
                      <span className="ko-mono t">{e.time}</span>
                      <span>{inline(e.text)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </section>
        </main>

        <footer className="ko-foot">
          <span>Kochito Labs LLC · Wyoming</span>
          <span>
            Private page. <a href="https://kochitolabs.com">kochitolabs.com</a>
          </span>
        </footer>
      </div>
    </div>
  )
}
