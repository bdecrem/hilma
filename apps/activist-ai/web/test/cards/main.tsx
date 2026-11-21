// The cards page (OLA-325): each fixture of test/cards.fixtures.json drawn by the web app's own
// card components, as the conversation draws them, so check.mjs can read every card's text in
// Chromium and WebKit and compare it with the fixture's lines (OlaKit's CardsTests reads the same
// file). Built by check.mjs into a scratch folder; never part of the served page.
import { render } from 'solid-js/web'
import { QuestionCard } from '../../src/components/QuestionCard.tsx'
import { ApprovalSheet } from '../../src/components/ApprovalSheet.tsx'
import { questionOf } from '../../src/lib/conversation.ts'
import { describeApproval } from '../../src/lib/steps.ts'
import type { Ola } from '../../src/lib/ola.ts'
import '../../src/styles/tokens.css'
import '../../src/styles/app.css'

type Fixture = { name: string; form?: unknown; permission?: { action: string; resources: string[] }; ctx?: { address?: string; files?: string[] }; lines: string[] }
// The fixtures, served beside the page by check.mjs (test/cards.fixtures.json).
const cards = ((await (await fetch('/cards.fixtures.json')).json()) as { cards: Fixture[] }).cards

// The front desk's preview of a cloud publish, made from the fixture: the files the command names.
const previews = new Map<string, { url: string; files: string[] }>()
const realFetch = window.fetch.bind(window)
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const u = new URL(String(input instanceof Request ? input.url : input), location.href)
  if (u.pathname === '/api/site/preview') {
    const key = u.searchParams.get('folder') ?? u.searchParams.get('page') ?? ''
    const p = previews.get(key)
    if (!p) return new Response(JSON.stringify({ error: 'no fixture' }), { status: 404 })
    const items = p.files.map((f) => ({ path: f, as: f, size: 1200, uploaded: false }))
    return new Response(JSON.stringify({ url: `https://${p.url}`, page: 'index.html', items, leftOut: [], warnings: [], total: items.length * 1200, fingerprint: 'fixture', published: false, acceptableUse: 'Only pages your group may share.' }), { headers: { 'content-type': 'application/json' } })
  }
  return realFetch(input, init)
}) as typeof fetch

function Card(props: { f: Fixture }) {
  const f = props.f
  if (f.form) {
    const q = questionOf(f.form)
    return q ? <QuestionCard question={q} onAnswer={async () => false} /> : null
  }
  const p = f.permission!
  const words = describeApproval(p.action, p.resources, undefined, '/work')
  if (!words.card || words.card.runtime === 'local') return null
  if (words.publish) previews.set('folder' in words.publish.sel ? words.publish.sel.folder : words.publish.sel.page, { url: f.ctx?.address ?? 'sites.ola.cx', files: words.publish.files })
  const ola = { state: { approval: { id: `per_${f.name}`, sessionID: 'ses_fixture', action: p.action, stepID: null, ...words }, autonomy: 'ask' }, answer: async () => {} } as unknown as Ola
  return <ApprovalSheet ola={ola} />
}

render(
  () => (
    <main>
      {cards.map((f) => (
        <section class="fixture" data-card={f.name}>
          <Card f={f} />
        </section>
      ))}
    </main>
  ),
  document.getElementById('root')!,
)
