#!/usr/bin/env node
// Screenshots of Data, Settings and the web approval, for a design look (made-up data only):
//   node scripts/data-shots.mjs <dir>     (from web/, after `npm run build`)
// Starts dev.mjs with the scripted model, fills its project database through the real ola-db
// (a 200,000-row table, a three-page PDF, a page "downloaded" from the web), then shoots each view
// at 1440 and 390 px in Chromium, and the main ones in WebKit.
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, webkit } from 'playwright'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const WEB = path.join(HERE, '..')
const out = path.resolve(process.argv[2] ?? 'shots')
fs.mkdirSync(out, { recursive: true })

const p = spawn(process.execPath, [path.join(WEB, 'dev.mjs'), '--dist', '--fake-model', '--port', '0'], { cwd: WEB, env: { ...process.env, OLA_DEV_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'ola-shots-')) }, stdio: ['ignore', 'pipe', 'pipe'] })
let log = ''
p.stderr.on('data', (d) => (log += d))
const url = await new Promise((ok, no) => {
  const t = setTimeout(() => no(new Error(log)), 60_000)
  p.stdout.on('data', (d) => {
    log += d
    const m = /ready (http:\/\/\S+)/.exec(log)
    if (m) clearTimeout(t), ok(m[1])
  })
})
const work = /workspace folder: (\S+)/.exec(log)[1]
const env = { ...process.env, OLA_WORK: work }
const db = (...a) => {
  const r = spawnSync('python3', [path.join(WEB, '../workspace/ola-db'), ...a], { env, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(r.stderr)
}
const countries = ['Kenya', 'Bangladesh', 'Peru', 'Viet Nam', 'Morocco', 'Fiji', 'Norway', 'Chile', 'Ghana', 'Nepal']
const rows = ['law_id,country,year,title,category,score']
for (let i = 0; i < 200_000; i++) rows.push(`L${100000 + i},${countries[i % 10]},${1960 + (i % 64)},"Made-up act no. ${i} on residence and work",${['Access to justice', 'Family unity', 'Labor rights', 'Residence'][i % 4]},${((i * 7919) % 10000) / 100}`)
fs.writeFileSync(path.join(work, 'laws.csv'), rows.join('\n') + '\n')
fs.writeFileSync(path.join(work, 'adaptation-studies.csv'), 'study_id,region,hazard,sector,year\n' + Array.from({ length: 1682 }, (_, i) => `S${i + 1},${['East Africa', 'South Asia', 'Andes', 'Pacific'][i % 4]},${['Drought', 'Flood', 'Heat', 'Sea level'][i % 4]},${['Agriculture', 'Water', 'Health', 'Cities'][i % 4]},${2008 + (i % 17)}`).join('\n') + '\n')
fs.writeFileSync(path.join(work, 'report.pdf'), spawnSync('python3', [path.join(WEB, '../workspace/testdata/mkpdf.py'), 'Made-up regional assessment. Page one is about drought in the Sahel.', 'Page two covers mangrove restoration in coastal Tanzania and the communities that manage it.', 'Page three is about flood insurance.']).stdout)
fs.mkdirSync(path.join(work, 'sources'), { recursive: true })
fs.writeFileSync(path.join(work, 'sources', 'coastal-plans.html'), '<html><head><title>Coastal adaptation plans, a made-up overview</title></head><body><p>Several coastal districts restored mangrove belts between 2015 and 2022.</p><p>Sea walls were built in two towns.</p></body></html>')
db('init')
db('load', 'laws.csv', '--table', 'laws', '--note', 'Made-up laws, one row per law, with a score per category')
db('load', 'adaptation-studies.csv', '--table', 'studies', '--note', 'Made-up adaptation studies, one row each')
db('add', 'report.pdf', '--by', 'upload')
db('add', 'sources/coastal-plans.html', '--by', 'web', '--source', 'https://www.example.org/coastal-plans', '--fetched', new Date().toISOString())

async function shoot(browserType, tag, viewport) {
  const b = await browserType.launch()
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 2 })
  const pg = await ctx.newPage()
  const snap = (name) => pg.screenshot({ path: path.join(out, `${tag}-${viewport.width}-${name}.png`), fullPage: true })
  await pg.goto(`${url}#/data`)
  await pg.waitForSelector('table.data-tables')
  await pg.evaluate(() => document.fonts.ready)
  await snap('1-data')
  await pg.getByRole('button', { name: 'Open laws' }).click()
  await pg.waitForSelector('.grid tbody tr')
  await pg.locator('.grid th button', { hasText: 'score' }).click()
  await pg.locator('.grid th button', { hasText: 'score' }).click()
  await pg.waitForSelector('.grid th[aria-sort="descending"]')
  await pg.waitForTimeout(400)
  await snap('2-table')
  await pg.getByRole('button', { name: 'All tables and documents' }).click()
  await pg.fill('#docs-q', 'mangrove')
  await pg.press('#docs-q', 'Enter')
  await pg.waitForSelector('.hit')
  await snap('3-search')
  await pg.goto(`${url}#/settings`)
  await pg.getByRole('switch', { name: 'Search and download without asking' }).waitFor()
  await snap('4-settings')
  await pg.goto(url)
  await pg.waitForSelector('.thing')
  await pg.fill('#askbar-input', 'Please search the web for coastal adaptation plans in East Africa')
  await pg.press('#askbar-input', 'Enter')
  await pg.locator('dialog.approval[open]').waitFor({ timeout: 30_000 })
  await pg.waitForTimeout(300)
  await pg.screenshot({ path: path.join(out, `${tag}-${viewport.width}-5-approval.png`) })
  await pg.locator('dialog.approval[open]').getByRole('button', { name: 'Not now' }).click()
  await b.close()
}
try {
  await shoot(chromium, 'chromium', { width: 1440, height: 900 })
  await shoot(chromium, 'chromium', { width: 390, height: 844 })
  await shoot(webkit, 'webkit', { width: 1440, height: 900 })
  console.log(`shots in ${out}`)
} finally {
  p.kill('SIGTERM')
}
