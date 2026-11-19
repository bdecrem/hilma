import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { fixture, fixtureActivity, fixtureFrame, fixtureOverview } from '../../fixture'
import Shell, { type Page } from '../../Shell'
import Home from '../../views/Home'
import IssueView from '../../views/IssueView'
import NewIssue from '../../views/NewIssue'
import { NoteView, NotesIndex, OverviewNote } from '../../views/Notes'
import Learning from '../../views/Learning'
import Plan from '../../views/Plan'
import Tracker, { type TrackerParams } from '../../views/Tracker'
import '../../../company.css'

// Every board page with made-up data, without signing in, for design work on a dev server only:
// /kochito/kit/mock (Home), /mock/issues (?tab=done…), /mock/issues/OLA-210, /mock/issues/new,
// /mock/plan, /mock/notes, /mock/notes/plan, /mock/overview, /mock/learning. Every link inside stays
// in the mock. Writes on the issue page change only the page in the browser. Not served in
// production. Data: ../../fixture.ts.
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Board mock', robots: { index: false, follow: false } }

const BASE = '/kochito/kit/mock'
const NOTE_BODY = '# A made-up note\n\nThis paragraph is made up so the note page can be looked at. It stands where the first paragraph of a real note would be, at a reading width.\n\n## A section\n\n- A first point, made up.\n- A second point, with a [link](https://ola.cx).\n\n| What | When |\n| --- | --- |\n| A row | Nov 18 |\n\nA closing paragraph, also made up.\n'

export default async function Mock({ params, searchParams }: { params: Promise<{ path?: string[] }>; searchParams: Promise<TrackerParams> }) {
  if (process.env.NODE_ENV === 'production') notFound()
  const [path, p] = [(await params).path ?? [], await searchParams]
  const d = fixture()
  const f = fixtureFrame(d)
  const [a, b] = path
  let current: Page = 'home'
  let body: React.ReactNode
  if (!a) body = <Home d={d} base={BASE} />
  else if (a === 'issues' && !b) ((current = 'issues'), (body = <Tracker all={d.issues} p={p} base={BASE} now={d.now} today={d.today} />))
  else if (a === 'issues' && b === 'new') ((current = 'issues'), (body = <NewIssue base={BASE} mock />))
  else if (a === 'issues') {
    const i = d.issues?.find((x) => x.id === b.toUpperCase())
    if (!i) notFound()
    current = 'issues'
    body = <IssueView issue={i} activity={i.num === 210 ? fixtureActivity(i.id) : []} base={BASE} now={d.now} user="bart" mock />
  } else if (a === 'plan') ((current = 'plan'), (body = <Plan d={d} base={BASE} />))
  else if (a === 'learning') ((current = 'learning'), (body = <Learning d={d} base={BASE} />))
  else if (a === 'notes' && !b) ((current = 'notes'), (body = <NotesIndex notes={d.notes} o={fixtureOverview()} base={BASE} now={d.now} />))
  else if (a === 'notes') {
    const n = d.notes.find((x) => x.slug === b)
    if (!n) notFound()
    current = 'notes'
    body = <NoteView title={n.title} updated="2 h ago" from={<>from Kit&rsquo;s private notes ({n.slug})</>} body={NOTE_BODY} base={BASE} />
  } else if (a === 'overview') ((current = 'notes'), (body = <OverviewNote o={fixtureOverview()} base={BASE} />))
  else notFound()
  return (
    <Shell base={BASE} q="" user="someone" f={f} current={current}>
      {body}
    </Shell>
  )
}
