import type { Metadata } from 'next'
import { canDos, LEVELS, topAuthoredLevel } from '@/lib/dolly/curriculum'
import { LANGUAGES, type LanguageCode } from '@/lib/dolly/language'
import { REFRESH_INTERVALS } from '@/lib/dolly/day'

// ola.cx/dolly/levels — the ladder, every level and every objective, as a
// plain document: what the app's Settings → Learning objectives links to,
// and what a completed level's sheet points back at. Generated from
// src/lib/dolly/curriculum.ts, so it never drifts from what Dolly teaches.

export const metadata: Metadata = {
  title: 'Dolly’s levels',
  description: 'The eight levels Dolly teaches, A1 to B2, and every objective in each one.',
  openGraph: { title: 'Dolly’s levels', description: 'The eight levels Dolly teaches, A1 to B2, and every objective in each one.', url: 'https://ola.cx/dolly/levels' },
}

export default async function LevelsPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang: raw } = await searchParams
  const lang: LanguageCode = raw === 'zh' ? 'zh' : 'es'
  const language = LANGUAGES[lang]
  const top = topAuthoredLevel(lang)
  return (
    <main className="dolly-doc">
      <p className="dolly-doc-crumb">
        <a href="/dolly">Dolly</a> · Levels ·{' '}
        {lang === 'es' ? (
          <>
            <b>Spanish</b> / <a href="/dolly/levels?lang=zh">Mandarin</a>
          </>
        ) : (
          <>
            <a href="/dolly/levels?lang=es">Spanish</a> / <b>Mandarin</b>
          </>
        )}
      </p>
      <h1>Dolly’s levels</h1>
      <p>
        Eight levels, the first four bands of the Common European Framework (A1 to B2) each split in two so progress shows inside a band. Every level is a list of
        things you can <em>do</em> in {language.name}, with the words and the grammar behind each one. The content follows the{' '}
        {lang === 'es' ? 'Plan Curricular del Instituto Cervantes' : 'HSK 3.0 word lists'}, compressed into the order people learn it.
      </p>
      <p>
        <b>How a level is earned.</b> With Learning objectives on, a star round after your day is a short scripted call on the next four objectives of your level;
        each one you produce yourself is earned. Earn all of them and the level is complete: a flag goes on that day on your map. A completed level stays bright for{' '}
        {REFRESH_INTERVALS[0]} days, then its refresher is due: a short call on two things from it, then four cards. Pass and it stays bright for {REFRESH_INTERVALS[1]}{' '}
        days, then {REFRESH_INTERVALS[2]}, {REFRESH_INTERVALS[3]} and {REFRESH_INTERVALS[4]}. A level whose refresher is due comes before the next level’s star rounds.
      </p>
      <nav className="dolly-doc-toc" aria-label="Levels">
        <ol>
          {LEVELS.map((l) => (
            <li key={l.n}>
              <a href={`#level-${l.n}`}>
                Level {l.n} · {l.name}
              </a>{' '}
              <span>{l.cefr}</span>
            </li>
          ))}
        </ol>
      </nav>
      {LEVELS.map((l) => {
        const list = canDos(lang, l.n)
        return (
          <section key={l.n} id={`level-${l.n}`}>
            <h2>
              Level {l.n} · {l.name} <span className="dolly-doc-cefr">{l.cefr}</span>
            </h2>
            <p className="dolly-doc-tag">{l.tagline}</p>
            {list.length === 0 ? (
              <p className="dolly-doc-soon">{l.n <= top ? 'No objectives here yet.' : `The objectives for this level are being written. Levels 1 to ${top} are ready in ${language.name}.`}</p>
            ) : (
              <ol className="dolly-doc-cando">
                {list.map((c) => (
                  <li key={c.id} id={c.id}>
                    <h3>{c.title}</h3>
                    <ul>
                      {c.items.map((it) => (
                        <li key={it.t}>
                          <span lang={lang}>{it.t}</span>
                          {it.p ? <i> {it.p}</i> : null} — {it.n}
                        </li>
                      ))}
                    </ul>
                    <p className="dolly-doc-grammar">Grammar: {c.grammar}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )
      })}
      <p className="dolly-doc-foot">
        {LEVELS.length} levels · {LEVELS.reduce((n, l) => n + canDos(lang, l.n).length, 0)} objectives written in {language.name} so far · the thinking behind it is in the
        project’s pedagogy notes.
      </p>
    </main>
  )
}
