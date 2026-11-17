import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { APP_HOST, sessionUser } from '@/lib/kochito/app-auth'
import { getDoc, keyOk } from '@/lib/venture/interview'
import { f2Supabase } from '@/lib/f2/supabase'
import Login from './Login'
import '../company.css'

// app.kochitolabs.com: the project's home page, for Bart. Kit is the AI agent
// that runs Kochito Labs with him. The page has Kit's face, honest numbers, the
// three ways to talk to it (voice notes, an open conversation, a short
// interview), what is waiting on him, and a journal of what Kit did.
// Private: behind a login with a cookie that lasts a year
// (src/lib/kochito/app-auth.ts; Bart, 2026-11-14: "change the url for the
// dashboard to app.kochitolabs.com, and have that behind a login, with a cookie
// to make it stick"), and never indexed. Its old address, kochitolabs.com/kit?k=,
// and any other host send you to the new one. The text
// comes from the venture_docs row "journal" (apps/venture/private/JOURNAL.md,
// pushed by scripts/venture/sync.mjs), so it changes without a deploy.
// The look is the company's own (company.css), not the products'.
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Kit', robots: { index: false, follow: false }, icons: { icon: '/kochito/kit/kit-icon.png', apple: '/kochito/kit/kit-icon.png' } }
export const viewport: Viewport = { themeColor: '#f6ecd9', viewportFit: 'cover' }

// Kit's face. Candidates by two designers (public/kochito/kit/<id>.svg);
// FACE is the one Bart signed off, null until he has: the page then shows all
// candidates, numbered, and asks. The character sheet is apps/venture/private/KIT.md.
const FACE: string | null = 'brain-1' // number 9, chosen by Bart 2026-11-14
const CANDIDATES: { id: string; by: string }[] = [
  { id: 'hand-1', by: 'hand-drawn' },
  { id: 'hand-2', by: 'hand-drawn' },
  { id: 'hand-3', by: 'hand-drawn' },
  { id: 'hand-4', by: 'hand-drawn' },
  { id: 'pixel-1', by: 'pixel' },
  { id: 'pixel-2', by: 'pixel' },
  { id: 'pixel-3', by: 'pixel' },
  { id: 'pixel-4', by: 'pixel' },
  // after his note on 1 to 4 ("the buck teeth make you a little too silly... we want you to have a brainiac vibe")
  { id: 'brain-1', by: 'brainiac' },
  { id: 'brain-2', by: 'brainiac' },
  { id: 'brain-3', by: 'brainiac' },
  { id: 'brain-4', by: 'brainiac' },
]
const src = (id: string) => `/kochito/kit/${id}.svg`
// the drawings that exist in public/kochito/kit/ (a candidate not listed shows as "still being drawn")
const READY = new Set(['hand-1', 'hand-2', 'hand-3', 'hand-4', 'pixel-1', 'pixel-2', 'pixel-3', 'pixel-4', 'brain-1', 'brain-2', 'brain-3', 'brain-4'])

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
  const named = ['Now', 'Numbers', 'Waiting on you', 'Parked, your call', 'Active project', 'On my plate', 'Decided']
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
  // "- **P1** text" → a priority and the item; "- **Nov 16** text" → a date and the decision
  const tagged = (t: string) => items(t).map((l) => { const m = l.match(/^\*\*([^*]+)\*\*\s*(.*)$/); return m ? { tag: m[1], text: m[2] } : { tag: '', text: l } })
  const active = get('Active project')?.lines ?? []
  return {
    now: (get('Now')?.lines ?? []).join(' '),
    numbers: items('Numbers'),
    waiting: items('Waiting on you'),
    parked: items('Parked, your call'),
    project: { title: active.find((l) => l.startsWith('# '))?.slice(2) ?? '', text: active.filter((l) => !l.startsWith('# ') && !l.startsWith('- ')).join(' '), links: active.filter((l) => l.startsWith('- ')).map((l) => l.slice(2)) },
    plate: tagged('On my plate'),
    decided: tagged('Decided'),
    days,
  }
}

// Independence (Bart, 2026-11-16: "each time i steer, that's a failure of sorts... i want some
// sort of metric about if you're getting better and better at that"). scripts/venture/steers.mjs
// grades every message he wrote on a day and stores the day in venture_state "steers";
// steer-replay.mjs replays past mistakes against the rules and stores "steer_replay".
type SteerItem = { time: string; label: 'steer' | 'maybe'; class: string; repeat: boolean; quote: string }
type SteerDay = { day: string; messages: number; steers: number; repeats: number; maybes: number; rate: number | null; between: number | null; items: SteerItem[] }
type Replay = { at: string; cases: number; with_rules: { passed: number; tries: number }; without_rules: { passed: number; tries: number }; prevented: number; prevented_without: number }
async function independence() {
  const { data, error } = await f2Supabase().from('venture_state').select('key, value').in('key', ['steers', 'steer_replay'])
  if (error) throw new Error(`venture_state read failed: ${error.message}`)
  const days = Object.values((data.find((r) => r.key === 'steers')?.value?.days ?? {}) as Record<string, SteerDay>).sort((a, b) => a.day.localeCompare(b.day))
  return { days, replay: (data.find((r) => r.key === 'steer_replay')?.value ?? null) as Replay | null }
}
const dayName = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })

export default async function Page() {
  const host = ((await headers()).get('host') ?? '').replace(/:\d+$/, '')
  if (host !== APP_HOST && host !== 'localhost' && host !== '127.0.0.1') redirect(`https://${APP_HOST}/`)
  const user = await sessionUser()
  if (!user) return <Login face={src(FACE ?? 'brain-1')} />
  const j = parse((await getDoc('journal'))?.body ?? '')
  const ind = await independence()
  const latest = ind.days[ind.days.length - 1]
  const before = ind.days[ind.days.length - 2]
  // the last 14 calendar days up to the latest graded one; a day with no grade shows an empty slot
  const window14 = latest
    ? Array.from({ length: 14 }, (_, i) => {
        const d = new Date(Date.parse(`${latest.day}T12:00:00Z`) - (13 - i) * 86400e3).toISOString().slice(0, 10)
        return { day: d, row: ind.days.find((x) => x.day === d) }
      })
    : []
  const top = Math.max(20, ...window14.map((w) => w.row?.rate ?? 0))
  // the voice pages on ola.cx still open with the venture key; a signed-in reader gets it in the links
  const k = process.env.VENTURE_KEY
  if (!keyOk(k)) throw new Error('VENTURE_KEY is not set, or is not the current key')
  const q = `?k=${encodeURIComponent(k as string)}`
  const last = j.days[0]?.entries[0]
  const voices = [
    { href: `https://ola.cx/venture/memo${q}`, tag: 'voice notes', name: 'Leave a note', what: 'Say what you want done, changed or looked at. I read it within a minute or two and act; no need to text me.', go: 'Record' },
    { href: `https://ola.cx/venture/talk${q}`, tag: 'conversation', name: 'Talk it through', what: 'No agenda. I answer out loud from everything in my notes, and you can cut in.', go: 'Start talking' },
    { href: `https://ola.cx/venture/call/checkin${q}`, tag: 'interview', name: 'Answer my questions', what: 'I ask the things only you can settle, one at a time. About five minutes.', go: 'Start the check-in' },
  ]
  return (
    <div className="ko">
      <div className="ko-wrap">
        <header className="ko-top">
          <a className="ko-name" href="/">
            Kochito Labs<span>.</span>
          </a>
          <nav aria-label="Products">
            <a href="https://ola.cx">Ola ↗</a>
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
                The AI agent running <strong>Kochito Labs</strong> with Bart. I pick the ideas, build the pages, do the work and find the customers. He holds the accounts and the money.
              </p>
              {j.now && <p className="ko-now">{inline(j.now.replace(/^\*([^*]+)\*\s*/, ''))}</p>}
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
                  {READY.size === CANDIDATES.length ? 'Twelve takes on Kit by two designers: 1 to 4 by hand, 5 to 8 in pixels, 9 to 12 the brainiac versions you asked for.' : `${READY.size} of ${CANDIDATES.length} are in: 1 to 4 by hand, 5 to 8 in pixels. 9 to 12, the brainiac versions you asked for, are being drawn.`} Text me the number: <span className="ko-kbd">v kit 3</span>
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

          {latest && (
            <section className="ko-sec" aria-labelledby="independence">
              <div className="ko-sec-head">
                <h2 id="independence">Independence</h2>
                <p>How often you had to steer me: per 100 of your messages, every correction, repeat, re-explanation or chase counts once, and a repeat of something I was already told counts twice. Graded each morning by a separate Claude. Lower is better.</p>
              </div>
              <div className="ko-ind">
                <div className="ko-ind-nums">
                  <div>
                    <p className="ko-sub">{dayName(latest.day)}</p>
                    <p className="ko-ind-big">{latest.rate ?? '–'}</p>
                    <p className="ko-ind-what">
                      {latest.steers} {latest.steers === 1 ? 'steer' : 'steers'} in {latest.messages} messages, {latest.repeats} {latest.repeats === 1 ? 'repeat' : 'repeats'}
                      {latest.between ? `. One steer every ${latest.between} messages.` : '.'}
                    </p>
                  </div>
                  {before && (
                    <div className="prev">
                      <p className="ko-sub">{dayName(before.day)}</p>
                      <p className="ko-ind-big">{before.rate ?? '–'}</p>
                      <p className="ko-ind-what">
                        {before.steers} in {before.messages}, {before.repeats} {before.repeats === 1 ? 'repeat' : 'repeats'}
                      </p>
                    </div>
                  )}
                </div>
                <ol className="ko-ind-bars" aria-label="Steer rate, last 14 days">
                  {window14.map((w) => (
                    <li key={w.day} title={w.row ? `${dayName(w.day)}: ${w.row.rate}` : `${dayName(w.day)}: not graded`}>
                      <span className="ko-mono v">{w.row?.rate ?? ''}</span>
                      <span className={`bar${w.row ? '' : ' none'}${w.day === latest.day ? ' last' : ''}`} style={{ height: w.row ? `${Math.max(3, Math.round(((w.row.rate ?? 0) / top) * 96))}px` : undefined }} />
                      <span className="ko-mono d">{w.day.slice(8).replace(/^0/, '')}</span>
                    </li>
                  ))}
                </ol>
              </div>
              {latest.items.some((s) => s.label === 'steer') && (
                <>
                  <p className="ko-sub ko-ind-head">Your steers, {dayName(latest.day)}</p>
                  <ol className="ko-plate ko-steers">
                    {latest.items
                      .filter((s) => s.label === 'steer')
                      .map((s, i) => (
                        <li key={i}>
                          <span className="ko-mono t">{s.time}</span>
                          <span>
                            “{s.quote}”
                            <span className="ko-mono c">
                              {s.class} <span className={`ko-pri ${s.repeat ? 'p0' : 'p2'}`}>{s.repeat ? 'repeat' : 'new'}</span>
                            </span>
                          </span>
                        </li>
                      ))}
                  </ol>
                </>
              )}
              {ind.replay && (
                <p className="ko-ind-replay">
                  <strong>
                    Replay: {ind.replay.prevented} of {ind.replay.cases} past mistakes prevented by the rules.
                  </strong>{' '}
                  Each past mistake is replayed three times to a fresh Claude with my rules and three times without; without the rules, {ind.replay.prevented_without} of {ind.replay.cases}. Run {dayName(ind.replay.at.slice(0, 10))}.
                </p>
              )}
            </section>
          )}

          {j.project.title && (
            <section className="ko-sec" aria-labelledby="project">
              <div className="ko-sec-head">
                <p className="ko-sub">Active project</p>
                <h2 id="project">{j.project.title}</h2>
                <p>{inline(j.project.text)}</p>
              </div>
              {j.project.links.length > 0 && (
                <ul className="ko-links">
                  {j.project.links.map((l, i) => (
                    <li key={i}>{inline(l)}</li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {j.plate.length > 0 && (
            <section className="ko-sec" aria-labelledby="plate">
              <div className="ko-sec-head">
                <h2 id="plate">On my plate</h2>
                <p>What I am doing or will do next, most important first. P0 is now, P1 this week, P2 after that.</p>
              </div>
              <ol className="ko-plate">
                {j.plate.map((p, i) => (
                  <li key={i}>
                    <span className={`ko-mono ko-pri ${p.tag.toLowerCase()}`}>{p.tag}</span>
                    <span>{inline(p.text)}</span>
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

          {j.decided.length > 0 && (
            <section className="ko-sec" aria-labelledby="decided">
              <div className="ko-sec-head">
                <h2 id="decided">Decided</h2>
                <p>What we settled, newest first. Your words where they matter.</p>
              </div>
              <ol className="ko-decided">
                {j.decided.map((d, i) => (
                  <li key={i}>
                    <span className="ko-mono t">{d.tag}</span>
                    <span>{inline(d.text)}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="ko-sec" aria-labelledby="journal">
            <div className="ko-sec-head">
              <h2 id="journal">Done</h2>
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
          <form method="post" action="/api/kochito/app/logout" className="ko-out">
            <span>Signed in as {user}.</span> <button>Sign out</button> <a href="https://kochitolabs.com">kochitolabs.com</a>
          </form>
        </footer>
      </div>
    </div>
  )
}
