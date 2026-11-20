import type { Metadata } from 'next'
import fs from 'fs'
import path from 'path'
import Md from '../review/Md'

// What the checks changed, for the attorney's review. The log is apps/mrd/dossiers/CAUGHT.md, read at build time.

export const dynamic = 'force-static'

export const metadata: Metadata = {
  title: 'MRD · what changed this week',
  description: 'What changed in the six experimental country dossiers in the week of 17 November 2026, and which Claude model did each piece of work.',
  openGraph: {
    url: 'https://ola.cx/mrd/dossiers/changes',
    title: 'MRD · what changed this week',
    description: 'What changed in the six experimental country dossiers, and which Claude model did each piece of work.',
  },
}

const SLUGS: Record<string, string> = { 'Costa Rica': 'costa_rica', Portugal: 'portugal', Norway: 'norway', Philippines: 'philippines' }

const MODELS = `| Step | Model | What it does |
|---|---|---|
| First coding (6 November) | Claude Opus 5.5, high effort | Answered the 64 indicators for each country. |
| Web search | Claude Haiku 5.5 | Finds pages. Nothing counts from search results alone. |
| Source check | Claude Sonnet 5.5, low effort | Opens every cited source and confirms the quoted words are at the cited article, and that practice evidence is about practice and about the right people. |
| Second reader | Claude Opus 5.5, high effort | Reads the primary sources itself and tries to prove the answer wrong, without seeing the first coder's notes. |
| Coded again | Claude Fable 5.2, high effort | Redoes every answer that failed a check or was low confidence, reading every law and ruling in full. |
| Decision | A fixed rule, then people | Marks the answer verified or changed, or sends it to a person when the readers disagree. |`

function annotate(cell: string) {
  return cell
    .replace(/Source check/g, 'Source check (Sonnet 5.5)')
    .replace(/Second reader/g, 'Second reader (Opus 5.5)')
    .replace(/\b[Rr]ecode\b/g, 'Recode (Fable 5.2)')
}

function prepare(raw: string) {
  const body = raw.slice(raw.indexOf('\n## ') + 1)
  const lines = body.split('\n')
  let col = -1
  const out = lines.map(line => {
    if (!line.startsWith('|')) { col = -1; return line }
    const cells = line.split('|')
    const head = cells.findIndex(c => c.trim() === 'Caught by')
    if (head >= 0) { col = head; return line }
    if (col >= 0 && cells[col] !== undefined && !/^\s*-+\s*$/.test(cells[col])) cells[col] = annotate(cells[col])
    return cells.join('|')
  }).join('\n')
  // no file names on the page
  return out.replace(/`[^`]*\.(py|mjs|sh|js)`/g, 'the checking program')
}

export default function Page() {
  const raw = fs.readFileSync(path.join(process.cwd(), 'apps/mrd/dossiers/CAUGHT.md'), 'utf8')
  const sections = prepare(raw).split(/^## /m).filter(s => s.trim()).map(s => {
    const nl = s.indexOf('\n')
    return { title: s.slice(0, nl).trim(), body: s.slice(nl + 1) }
  })

  return (
    <main className="wrap chg">
      <header className="top">
        <div className="eyebrow">
          <span><a href="/mrd/dossiers">MRD · six new dossiers</a> · <a href="/mrd/dossiers/checks">checks</a> · what changed this week · <a href="/mrd">the library</a></span>
        </div>
        <h1>What changed <em>this week</em></h1>
        <p className="lede">
          On 17 November a reviewer found one answer (Costa Rica, indicator 55) coded Yes from a press summary of a court ruling; the full ruling does not support it.
          Since then no answer stays published unless its sources were actually read and a second reader agrees. The work was paused on 18 November and is not finished:
          17 Costa Rica answers, 4 for Qatar and 12 for China are still to be coded again.
        </p>
      </header>

      <section className="rv-report">
        <div className="md">
          <h2>Which model did what</h2>
        </div>
        <Md text={MODELS} />
        <p className="note">The checks themselves and the rules were written in Claude Code sessions on Fable 5.2.</p>
      </section>

      <section className="rv-report">
        <div className="md">
          <h2>Rules that changed</h2>
          <ul>
            <li>A court ruling supports a Yes only when it was read in full and it states a general rule.</li>
            <li>Evidence of implementation must show practice (a regulation is not evidence that it is applied) and must be about the people the answer covers.</li>
            <li>A law or ruling known only from a news story or a summary fails.</li>
            <li>The full text of a law on a third-party site counts as the text.</li>
            <li>A rating that moves half a step is reported as changed.</li>
          </ul>
        </div>
      </section>

      {sections.map(s => {
        const country = Object.keys(SLUGS).find(c => s.title.startsWith(c))
        return (
          <section className="rv-report" key={s.title}>
            <div className="md">
              <h2>{s.title}</h2>
              {country && (
                <p className="note">
                  <a href="/mrd/dossiers/checks">every changed answer, before and after</a> · <a href={`/mrd/countries/${SLUGS[country]}`}>{country} in the library</a>
                </p>
              )}
            </div>
            <Md text={s.body} />
          </section>
        )
      })}
    </main>
  )
}
