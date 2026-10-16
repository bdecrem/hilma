'use client'

import { useEffect, useState } from 'react'
import { NotebookJournal, NotebookLanding } from './Notebook'
import { RisoJournal, RisoLanding } from './Riso'
import { TearoffJournal, TearoffLanding } from './Tearoff'

const CONCEPTS = [
  { id: 'notebook', name: 'Notebook', line: 'Ballpoint on ruled paper. Quiet and personal; the doodles and margin notes carry the fun.', theme: '#f4efe2', Landing: NotebookLanding, Journal: NotebookJournal },
  { id: 'riso', name: 'Riso', line: 'A printed zine. Loud flat ink, off-register overprints, halftone instead of light.', theme: '#f7efdf', Landing: RisoLanding, Journal: RisoJournal },
  { id: 'tearoff', name: 'Tear-off', line: 'A day-by-day desk calendar. Giant numerals, Sundays in red, tap the page to tear it.', theme: '#e9e3d8', Landing: TearoffLanding, Journal: TearoffJournal },
] as const

type View = 'landing' | 'journal'

export default function Concepts() {
  const [c, setC] = useState(0)
  const [v, setV] = useState<View>('landing')

  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const i = CONCEPTS.findIndex((x) => x.id === q.get('c'))
    if (i >= 0) setC(i)
    if (q.get('v') === 'journal') setV('journal')
  }, [])

  useEffect(() => {
    const q = new URLSearchParams({ c: CONCEPTS[c].id, v })
    window.history.replaceState(null, '', `?${q}`)
    let tag = document.querySelector('meta[name="theme-color"]')
    if (!tag) { tag = document.createElement('meta'); tag.setAttribute('name', 'theme-color'); document.head.appendChild(tag) }
    tag.setAttribute('content', CONCEPTS[c].theme)
    document.body.style.background = CONCEPTS[c].theme
  }, [c, v])

  const pick = (i: number, view: View) => { setC(i); setV(view); window.scrollTo({ top: 0 }) }
  const cur = CONCEPTS[c]
  const Page = v === 'landing' ? cur.Landing : cur.Journal

  return (
    <div className="oc">
      <Page />
      <nav className="oc-bar" aria-label="Design concepts">
        <p className="oc-line"><b>{c + 1}. {cur.name}</b> {cur.line}</p>
        <div className="oc-row">
          <div className="oc-seg">
            {CONCEPTS.map((x, i) => (
              <button key={x.id} type="button" className={i === c ? 'on' : ''} onClick={() => pick(i, v)}>{x.name}</button>
            ))}
          </div>
          <div className="oc-seg">
            {(['landing', 'journal'] as const).map((x) => (
              <button key={x} type="button" className={x === v ? 'on' : ''} onClick={() => pick(c, x)}>{x === 'landing' ? 'Landing' : 'Your page'}</button>
            ))}
          </div>
        </div>
      </nav>
    </div>
  )
}
