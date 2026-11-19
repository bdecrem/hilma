#!/usr/bin/env node
// One contact sheet of the screenshots: problems down, columns across, the score under each.
//   node sheet.mjs <out.png>
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire('/Users/bartdecrem/Documents/coding2025/hilma/apps/activist-ai/web/package.json')
const { chromium } = require('playwright')
const PROBLEMS = JSON.parse(fs.readFileSync(path.join(HERE, 'problems.json'), 'utf8'))
const COLS = [['ola', 'open weights (Nemotron 3.5 Super VL)'], ['claude', 'Claude Code'], ['local', 'local']]
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])

let rows = ''
for (const p of PROBLEMS) {
  rows += `<tr><th>${esc(p.id)}<small>${esc(p.request)}</small></th>`
  for (const [c] of COLS) {
    const f = path.join(HERE, 'results', `${p.id}.${c}.json`)
    if (c === 'local') { rows += '<td class="empty">from Dec, when the Studio serves the model</td>'; continue }
    if (!fs.existsSync(f)) { rows += '<td class="empty">not run (Claude runs capped at four problems)</td>'; continue }
    const r = JSON.parse(fs.readFileSync(f, 'utf8'))
    const img = r.screenshot && fs.existsSync(r.screenshot) ? `<img src="data:image/png;base64,${fs.readFileSync(r.screenshot).toString('base64')}">` : '<div class="none">no page</div>'
    rows += `<td>${img}<p class="${r.pass ? 'pass' : 'fail'}">${r.passed} of ${r.total}, ${r.pass ? 'pass' : `fail (${esc(r.failure)})`}${r.model && c === 'claude' ? `, ${esc(r.model)}` : ''}</p></td>`
  }
  rows += '</tr>'
}
const html = `<!doctype html><meta charset="utf-8"><style>
body{font:14px -apple-system,sans-serif;margin:16px;background:#fff}
table{border-collapse:collapse} td,th{border:1px solid #ccc;padding:6px;vertical-align:top}
th{width:180px;text-align:left} th small{display:block;font-weight:normal;color:#555;margin-top:4px}
img{width:448px;height:280px;display:block;border:1px solid #eee}
.none,.empty{width:448px;color:#777;text-align:center} .none{height:280px;line-height:280px}
.pass{color:#060;margin:4px 0 0} .fail{color:#a00;margin:4px 0 0}
</style><table><tr><th></th>${COLS.map(([, n]) => `<th>${esc(n)}</th>`).join('')}</tr>${rows}</table>`
const b = await chromium.launch()
const pg = await b.newPage({ viewport: { width: 1400, height: 800 } })
await pg.setContent(html)
await pg.screenshot({ path: process.argv[2], fullPage: true })
await b.close()
