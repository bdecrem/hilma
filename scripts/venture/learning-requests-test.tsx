// npx tsx --test scripts/venture/learning-requests-test.tsx
// OLA-213: the Learning page's line for Bart's requests of a day (RequestsLine in
// src/app/kochito/kit/views/Learning.tsx), rendered from made-up entries in the shape sweep.mjs post
// stores, and, when the tracker can be read (.env.local), from the real stored match of the newest day
// (read only: nothing is written).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import React, { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createRequire } from 'node:module'
import type { RequestsLine as RL } from '../../src/app/kochito/kit/views/Learning'

// the board imports its stylesheet (Shell.tsx: './board.css'); node has no loader for it
;(createRequire(import.meta.url) as NodeJS.Require).extensions['.css'] = () => {}
let RequestsLine: typeof RL
// tsx compiles the board's JSX with the classic runtime (React.createElement)
;(globalThis as { React?: typeof React }).React = React

const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/\s+/g, ' ').trim()
test.before(async () => { ({ RequestsLine } = await import('../../src/app/kochito/kit/views/Learning')) })
const render = (r: Parameters<typeof RL>[0]['r'], base = '') => renderToStaticMarkup(createElement(RequestsLine, { r, base }))

test('a matched day: the count, what had a ticket, and each ticket opened that night as a link', () => {
  const html = render({ n: 13, matched: 6, done: 3, answered: 3, opened: ['OLA-365'], at: '2026-11-22T02:30:00Z' })
  assert.equal(text(html), 'Requests from Bart: 13, each accounted for (6 had one, 3 done the same day, 3 answered, 1 opened that night: OLA-365)')
  assert.match(html, /<a href="\/issues\/OLA-365"/)
})

test('two opened: both are links, comma separated', () => {
  const html = render({ n: 4, matched: 2, done: 0, answered: 0, opened: ['OLA-3', 'OLA-4'], at: 'x' })
  assert.equal(text(html), 'Requests from Bart: 4, each accounted for (2 had one, 2 opened that night: OLA-3, OLA-4)')
  assert.equal((html.match(/<a href="\/issues\/OLA-/g) ?? []).length, 2)
})

test('none opened says so, with no link', () => {
  const html = render({ n: 62, matched: 21, done: 14, answered: 27, opened: [], at: 'x' })
  assert.equal(text(html), 'Requests from Bart: 62, each accounted for (21 had one, 14 done the same day, 27 answered, none opened)')
  assert.doesNotMatch(html, /<a /)
})

test('a failed match posted anyway says not matched, the failure and the reason', () => {
  const html = render({ failed: 'collector exited 1', why: 'the M4 is off the network tonight', opened: [], at: 'x' })
  assert.equal(text(html), 'Requests from Bart: not matched (the matching failed: collector exited 1; posted anyway because the M4 is off the network tonight)')
})

test('posted while an earlier day was matched early: the line names that day and the reason', () => {
  const html = render({ n: 2, matched: 2, done: 0, answered: 0, opened: [], at: 'x', early: [{ day: '2026-11-19', at: '2026-11-20T02:30:00Z', why: 'the mini cannot read the transcripts tonight' }] })
  assert.match(text(html), /Posted while an earlier day's match was not final: 2026-11-19 \(matched 2026-11-20T02:30Z\), because the mini cannot read the transcripts tonight$/)
})

test('an entry from before Nov 21 (no requests) shows no line', () => {
  assert.equal(render(undefined), '')
})

test('the real stored match of the newest day renders, in the shape sweep.mjs post stores', { skip: !existsSync('.env.local') && 'no .env.local' }, async () => {
  const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]))
  const { createClient } = await import('@supabase/supabase-js')
  const { getState } = await import('./_state.mjs')
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
  const days = (await getState(db, 'requests'))?.value?.days ?? {}
  const day = Object.keys(days).filter((d) => !days[d].failed).sort().pop()
  assert.ok(day, 'no matched day stored yet')
  const req = days[day]
  // the same mapping as sweep.mjs post (line "const requests = req.failed ? …")
  const r = { n: req.counts.requests, matched: req.counts.matched, done: req.counts.done ?? 0, answered: req.counts.answered ?? 0, opened: req.opened, at: req.at }
  const line = text(render(r))
  console.log(`  ${day}: ${line}`)
  assert.match(line, new RegExp(`^Requests from Bart: ${r.n}, each accounted for \\(${r.matched} had one`))
  for (const id of r.opened) assert.ok(line.includes(id), `${id} missing`)
  assert.equal(r.matched + r.done + r.answered + r.opened.length, r.n, 'the outcomes add up to the requests')
})
