'use client'

import { useEffect, useState } from 'react'
import { NotebookJournal, NotebookLanding } from './Notebook'
import { RisoJournal, RisoLanding } from './Riso'
import { TearoffJournal, TearoffLanding } from './Tearoff'
import TearoffV2 from './TearoffV2'
import CutPaper from './CutPaper'
import Stamps from './Stamps'

type ViewDef = { id: string; label: string; C: () => React.ReactNode }
type Concept = { id: string; name: string; line: string; theme: string; bg?: string; views: ViewDef[] }

const LANDING_JOURNAL = (L: () => React.ReactNode, J: () => React.ReactNode): ViewDef[] => [
  { id: 'landing', label: 'Landing', C: L },
  { id: 'journal', label: 'Your page', C: J },
]
const DAY = (C: (p: { moment: 'morning' | 'evening' }) => React.ReactNode): ViewDef[] => [
  { id: 'morning', label: 'Morning', C: () => <C moment="morning" /> },
  { id: 'evening', label: 'Written', C: () => <C moment="evening" /> },
]

const CONCEPTS: Concept[] = [
  { id: 'tearoff-v2', name: 'Tear-off v2', line: 'The signed-in page mid-month. Today is the top sheet of the pad, blank until you write; the days you lived are torn off into a pile.', theme: '#e9e3d8', views: DAY(TearoffV2) },
  { id: 'cut-paper', name: 'Cut paper', line: 'Today’s brand, colours, ink drop and tilted tiles, cut from flat coloured paper. Hard offsets instead of glow.', theme: '#ffd23f', bg: '#fbf7f0', views: DAY(CutPaper) },
  { id: 'stamps', name: 'Stamps', line: 'Each day you keep is a postage stamp in your album, in that day’s colour. The streak is the postmark.', theme: '#f2ead9', views: DAY(Stamps) },
  { id: 'notebook', name: 'Notebook', line: 'Ballpoint on ruled paper. Quiet and personal; the doodles and margin notes carry the fun.', theme: '#f4efe2', views: LANDING_JOURNAL(NotebookLanding, NotebookJournal) },
  { id: 'riso', name: 'Riso', line: 'A printed zine. Loud flat ink, off-register overprints, halftone instead of light.', theme: '#f7efdf', views: LANDING_JOURNAL(RisoLanding, RisoJournal) },
  { id: 'tearoff', name: 'Tear-off', line: 'A day-by-day desk calendar. Giant numerals, Sundays in red, tap the page to tear it.', theme: '#e9e3d8', views: LANDING_JOURNAL(TearoffLanding, TearoffJournal) },
]

export default function Concepts() {
  const [c, setC] = useState(0)
  const [v, setV] = useState(0)

  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const i = CONCEPTS.findIndex((x) => x.id === q.get('c'))
    if (i >= 0) {
      setC(i)
      const j = CONCEPTS[i].views.findIndex((x) => x.id === q.get('v'))
      if (j >= 0) setV(j)
    }
  }, [])

  useEffect(() => {
    const q = new URLSearchParams({ c: CONCEPTS[c].id, v: CONCEPTS[c].views[v].id })
    window.history.replaceState(null, '', `?${q}`)
    let tag = document.querySelector('meta[name="theme-color"]')
    if (!tag) { tag = document.createElement('meta'); tag.setAttribute('name', 'theme-color'); document.head.appendChild(tag) }
    tag.setAttribute('content', CONCEPTS[c].theme)
    document.body.style.background = CONCEPTS[c].bg ?? CONCEPTS[c].theme
  }, [c, v])

  const pick = (i: number, j: number) => { setC(i); setV(j); window.scrollTo({ top: 0 }) }
  const cur = CONCEPTS[c]
  const Page = cur.views[v].C

  return (
    <div className="oc">
      <Page />
      <nav className="oc-bar" aria-label="Design concepts">
        <p className="oc-line"><b>{cur.name}</b> {cur.line}</p>
        <div className="oc-seg oc-scroll">
          {CONCEPTS.map((x, i) => (
            <button key={x.id} type="button" className={i === c ? 'on' : ''} onClick={() => pick(i, i < 3 && c < 3 ? v : 0)}>
              {x.name}
            </button>
          ))}
        </div>
        <div className="oc-seg oc-views">
          {cur.views.map((x, j) => (
            <button key={x.id} type="button" className={j === v ? 'on' : ''} onClick={() => pick(c, j)}>{x.label}</button>
          ))}
        </div>
      </nav>
    </div>
  )
}
