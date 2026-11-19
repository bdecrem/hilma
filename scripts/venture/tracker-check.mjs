#!/usr/bin/env node
// Walks the Issue Tracker's writes as a signed-in person, on a throwaway issue, against a dev server
// (OLA-163): New issue, edit the title and the description, a comment (Cmd-Return), every status
// (Done asks for proof), then Kit's side (issues.mjs comment, show, inbox) and the "seen by Kit" line.
// Takes pictures of the issue page at 1440 and 390, then drops the issue (issues.mjs drop) and
// deletes exactly its Activity rows. Never touches another issue; `inbox --mark` runs only when
// every unread row is the test issue's.
//   ( set -a; . <main checkout>/.env.local; set +a; BOARD_USER=dev BOARD_PASS=… \
//     node scripts/venture/tracker-check.mjs <out-dir> [http://localhost:3377/kochito/kit] )
// The dev server must run with KOCHITO_APP_USERS holding that account (see apps/venture/README.md).
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const [out, base = 'http://localhost:3377/kochito/kit'] = process.argv.slice(2)
if (!out || !process.env.SUPABASE_URL) (console.error('usage: (env loaded) tracker-check.mjs <out-dir> [base]'), process.exit(1))
mkdirSync(out, { recursive: true })
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
const cli = (...a) => execFileSync(process.execPath, ['scripts/venture/issues.mjs', ...a], { encoding: 'utf8' })
const ok = (c, what) => {
  if (!c) throw new Error(`FAILED: ${what}`)
  console.log(`ok  ${what}`)
}
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
const p = await ctx.newPage()
let id = null
try {
  await p.goto(`${base}/`, { waitUntil: 'networkidle' })
  await p.fill('input[name=name]', process.env.BOARD_USER ?? 'dev')
  await p.fill('input[name=passcode]', process.env.BOARD_PASS ?? '')
  await p.click('button')
  await p.waitForSelector('.bd')
  // a write without the session is refused
  const anon = await fetch(new URL('/api/kochito/app/issues', base), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'TEST (delete me) no session', area: 'board' }) })
  ok(anon.status === 401, 'a write without the session is refused (401)')

  const title = `TEST (delete me) board check ${new Date().toISOString().slice(11, 19)}`
  await p.goto(`${base}/issues/new`, { waitUntil: 'networkidle' })
  await p.fill('input[name=title]', title)
  await p.fill('textarea[name=what]', 'A throwaway issue made by scripts/venture/tracker-check.mjs.')
  await p.selectOption('select[name=area]', 'board')
  await p.selectOption('select[name=priority]', 'P2')
  await p.click('button:has-text("Create issue")')
  await p.waitForURL(/\/issues\/OLA-\d+$/)
  id = p.url().match(/OLA-\d+$/)[0]
  ok(true, `New issue made ${id}`)

  await p.click('h1 .bd-title-edit')
  await p.fill('input.bd-title-edit', `${title} edited`)
  await p.keyboard.press('Enter')
  await p.waitForSelector(`text=${title} edited`)
  ok(true, 'title edited')
  await p.click('.bd-desc-view')
  await p.fill('.bd-desc textarea', 'Edited description.\nSecond line with a link: https://ola.cx')
  await p.click('.bd-desc button:has-text("Save")')
  await p.waitForSelector('.bd-desc-view a[href="https://ola.cx"]')
  ok(true, 'description edited, the link is a link')

  await p.fill('.bd-comment textarea', 'A test comment from the board check.')
  await p.keyboard.press('Meta+Enter')
  await p.waitForSelector('text=A test comment from the board check.')
  await p.waitForSelector('text=not seen by Kit yet')
  ok(true, 'comment sent with Cmd-Return, shown as not seen by Kit yet')

  const status = 'select[aria-label=Status]'
  for (const s of ['in_progress', 'waiting', 'open']) {
    await p.selectOption(status, s)
    await p.waitForFunction(([sel, v]) => document.querySelector(sel)?.value === v && !document.querySelector(sel)?.disabled, [status, s])
    await p.waitForTimeout(600)
  }
  await p.selectOption(status, 'done')
  await p.fill('#bd-proof', 'the board check, by script')
  await p.click('button:has-text("Mark done")')
  await p.waitForSelector('text=Proof: the board check, by script')
  ok(true, 'status: doing, waiting, next up, done with proof')

  const row = await db.from('venture_issues').select('*').eq('id', id).single()
  ok(row.data.status === 'done' && row.data.proof === 'the board check, by script' && row.data.title.endsWith('edited'), 'the database has the title, status and proof')
  const act = await db.from('venture_issue_activity').select('*').eq('issue_id', id)
  ok(act.data.length >= 8 && act.data.every((a) => a.via === 'board' && a.who === (process.env.BOARD_USER ?? 'dev')), `${act.data.length} Activity rows, all by the signed-in account`)

  // Kit's side
  cli('comment', id, 'Kit read it: the test reply.')
  const inbox = cli('inbox')
  ok(inbox.includes(id) && inbox.includes('A test comment from the board check.'), 'issues.mjs inbox lists the comment')
  const unread = await db.from('venture_issue_activity').select('issue_id').is('seen_by_kit_at', null).eq('via', 'board')
  if (unread.data.every((a) => a.issue_id === id)) {
    cli('inbox', '--mark')
    ok(true, 'issues.mjs inbox --mark (only the test issue was unread)')
  } else {
    await db.from('venture_issue_activity').update({ seen_by_kit_at: new Date().toISOString() }).eq('issue_id', id).is('seen_by_kit_at', null)
    ok(true, 'other unread rows exist: marked only the test issue read, by hand')
  }
  ok(cli('show', id).includes('Kit read it: the test reply.'), 'issues.mjs show prints the thread')
  await p.reload({ waitUntil: 'networkidle' })
  await p.waitForSelector('text=seen by Kit')
  ok(true, 'the page says "seen by Kit"')
  await p.screenshot({ path: join(out, 'after-issue-1440.png'), fullPage: true })
  await p.setViewportSize({ width: 390, height: 844 })
  await p.reload({ waitUntil: 'networkidle' })
  await p.screenshot({ path: join(out, 'after-issue-390.png'), fullPage: true })
  await p.setViewportSize({ width: 1440, height: 900 })
  await p.selectOption(status, 'dropped')
  await p.waitForSelector('text=moved this to Dropped')
  ok(true, 'status: dropped')
} finally {
  if (id) {
    cli('drop', id, '--why', 'test')
    const del = await db.from('venture_issue_activity').delete().eq('issue_id', id).select('id')
    console.log(`cleaned up: ${id} dropped, ${del.data?.length ?? 0} Activity rows deleted`)
  }
  await b.close()
}
