#!/usr/bin/env node
// A real test of the voice notes page (ola.cx/venture/memo), no human needed:
// headless Chromium with a fake microphone playing one spoken note (macOS
// `say`). Checks the key gate, record → stop and send → the transcript on the
// page, the stored row, and discard. The note is sent as a test (?test=1), so
// it is stored as already read and never wakes the working session; the row is
// deleted afterwards.
//   VENTURE_KEY=<key> node scripts/venture/memo-check.mjs <outDir> [base]   (default http://localhost:3277)
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const out = path.resolve(process.argv[2] || 'memo-check')
const base = process.argv[3] || 'http://localhost:3277'
const root = new URL('../../', import.meta.url)
const env = Object.fromEntries(readFileSync(new URL('.env.local', root), 'utf8').split('\n').filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]))
const key = process.env.VENTURE_KEY || env.VENTURE_KEY
if (!key) throw new Error('VENTURE_KEY is not set')
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
mkdirSync(out, { recursive: true })

const aiff = path.join(out, 'note.aiff')
const wav = path.join(out, 'note.wav')
execFileSync('say', ['-o', aiff, 'This is a test note. Please check the price on the landing page and make the headline shorter.'])
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-t', '1', '-i', 'anullsrc=r=48000:cl=mono', '-i', aiff, '-f', 'lavfi', '-t', '60', '-i', 'anullsrc=r=48000:cl=mono', '-filter_complex', '[1:a]aresample=48000[a];[0:a][a][2:a]concat=n=3:v=0:a=1', '-ac', '1', '-ar', '48000', wav])

const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${wav}%noloop`] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ['microphone'] })
const page = await ctx.newPage()
const results = []
const ok = (name, pass, detail = '') => { results.push(pass); console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`) }

ok('no key is a 404', (await page.goto(`${base}/venture/memo`)).status() === 404)
await page.goto(`${base}/venture/memo?k=${key}&test=1`)
await page.waitForSelector('.vi-btn.primary')
await page.screenshot({ path: path.join(out, '1-idle.png') })
const before = await page.locator('.vi-turn').count()

// discard: nothing is sent
await page.getByRole('button', { name: 'Record a note' }).click()
await page.waitForTimeout(1500)
await page.getByRole('button', { name: 'Discard' }).click()
await page.waitForTimeout(1500)
ok('a discarded note is not stored', (await page.locator('.vi-turn').count()) === before)

// the real one: record 9 s (the spoken note is about 6), stop and send
await page.reload()
await page.waitForSelector('.vi-btn.primary')
await page.getByRole('button', { name: 'Record a note' }).click()
await page.waitForTimeout(4000)
await page.screenshot({ path: path.join(out, '2-recording.png') })
ok('the clock runs while recording', /0:0[3-6]/.test(await page.locator('.vi-memo-clock').innerText()))
await page.waitForTimeout(5000)
await page.getByRole('button', { name: 'Stop and send' }).click()
await page.locator('.vi-turn').nth(before).waitFor({ timeout: 45000 }).catch(() => {})
await page.screenshot({ path: path.join(out, '3-sent.png') })
const text = (await page.locator('.vi-turn').first().innerText().catch(() => '')).toLowerCase()
ok('the transcript appears on the page', /landing page/.test(text) && /headline/.test(text), text.replace(/\s+/g, ' ').slice(0, 140))
const { data } = await db.from('venture_messages').select('*').eq('direction', 'in').like('text', '(voice note)%').order('id', { ascending: false }).limit(1)
const row = data?.[0]
ok('it is stored in the thread the session watches', !!row && /landing page/i.test(row.text), row ? `id ${row.id}` : 'no row')
ok('a test note is stored as already read (it does not wake the session)', !!row?.seen_at)
// only ever the row this run just made: a test note (stored as read), seconds old, with our words in it
if (row?.seen_at && /landing page/i.test(row.text) && Date.now() - new Date(row.at).getTime() < 120000) await db.from('venture_messages').delete().eq('id', row.id)
await browser.close()
const pass = results.every(Boolean)
console.log(pass ? '\nall ok' : '\nproblems')
process.exit(pass ? 0 : 1)
