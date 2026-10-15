// Artifacts: tables (CSV + Excel), charts (Vega-Lite, rendered to SVG/PNG here so a broken spec fails at save
// time), web pages and documents. Each lives in ~/almanac/artifacts/<id>/ with a row in the state db.
import fs from 'node:fs/promises'
import path from 'node:path'
import ExcelJS from 'exceljs'
import * as vega from 'vega'
import { compile } from 'vega-lite'
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { ARTIFACTS } from './config.mjs'

// Chart PNGs are drawn by librsvg through pango, which on macOS asks CoreText for fonts and so never sees ours.
// Point it at fontconfig and ../fonts (CMU Serif, Departure Mono) before the first chart is drawn.
process.env.PANGOCAIRO_BACKEND ??= 'fc'
process.env.FONTCONFIG_FILE ??= fileURLToPath(new URL('../fonts/fonts.conf', import.meta.url))
import * as store from './store.mjs'

// the almanac look for charts: white page, Computer Modern, ballpoint blue first, red pen second
// (the PNG is rasterized with the TTFs in ../fonts, found through fonts/fonts.conf)
export const CHART_THEME = {
  background: '#ffffff',
  font: 'CMU Serif, Latin Modern Roman, Georgia, serif',
  padding: 12,
  title: { font: 'CMU Serif, Georgia, serif', fontSize: 18, fontWeight: 'bold', anchor: 'start', color: '#15161a', subtitleColor: '#44464f', subtitleFontSize: 13, offset: 12 },
  axis: { labelColor: '#44464f', titleColor: '#15161a', gridColor: '#ececf0', domainColor: '#15161a', tickColor: '#15161a',
    labelFontSize: 12, titleFontSize: 13, titleFontWeight: 'normal', labelLimit: 260 },
  legend: { labelColor: '#44464f', titleColor: '#15161a', labelFontSize: 12, titleFontSize: 13, titleFontWeight: 'normal', labelLimit: 260 },
  header: { labelColor: '#15161a', titleColor: '#15161a', labelFontSize: 13 },
  view: { stroke: 'transparent' },
  range: { category: ['#1f3fd1', '#e0362a', '#d9a300', '#1d8348', '#7b3fc4', '#15161a', '#8ea0f0', '#f2978d', '#85878f', '#9cc06a'] },
  mark: { color: '#1f3fd1' },
  bar: { color: '#1f3fd1' }, line: { color: '#1f3fd1', strokeWidth: 2 }, point: { color: '#1f3fd1' }, area: { color: '#1f3fd1' },
}

const dir = id => path.join(ARTIFACTS, id)
const isObj = v => v && typeof v === 'object' && !Array.isArray(v)
function merge(a, b) {
  const out = { ...a }
  for (const [k, v] of Object.entries(b || {})) out[k] = isObj(v) && isObj(a[k]) ? merge(a[k], v) : v
  return out
}
function hasDataUrl(o) {
  if (!o || typeof o !== 'object') return false
  if (isObj(o.data) && 'url' in o.data) return true
  return Object.entries(o).some(([k, v]) => k !== 'values' && hasDataUrl(v))
}
function csvCell(v) {
  if (v == null) return ''
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export const toCsv = (columns, rows) => '﻿' + [columns, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n'

async function writeXlsx(file, title, columns, rows) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Adaptation Almanac'
  const ws = wb.addWorksheet((title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim()) || 'Sheet1')
  ws.addRow(columns)
  ws.getRow(1).font = { bold: true }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  for (const r of rows) ws.addRow(r.map(v => {
    if (v == null) return null
    if (typeof v === 'object') v = JSON.stringify(v)
    return typeof v === 'string' && v.length > 32000 ? v.slice(0, 32000) + '…' : v
  }))
  columns.forEach((c, i) => {
    let w = String(c).length
    for (const r of rows.slice(0, 300)) w = Math.max(w, Math.min(60, String(r[i] ?? '').length))
    ws.getColumn(i + 1).width = Math.max(8, w + 2)
  })
  if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } }
  await wb.xlsx.writeFile(file)
}

export async function saveTable({ chatId, author, title, description, columns, rows, meta = {}, kind = 'table' }) {
  if (!columns?.length) throw new Error('a table needs columns')
  const id = store.newId(); const d = dir(id)
  await fs.mkdir(d, { recursive: true })
  await fs.writeFile(path.join(d, 'data.csv'), toCsv(columns, rows))
  await writeXlsx(path.join(d, 'data.xlsx'), title, columns, rows)
  await fs.writeFile(path.join(d, 'preview.json'), JSON.stringify({ columns, rows: rows.slice(0, 300) }))
  store.artifacts.create({ id, chatId, kind, title, description, author,
    files: [{ name: 'data.xlsx', label: 'Excel' }, { name: 'data.csv', label: 'CSV' }],
    meta: { rows: rows.length, columns, ...meta } })
  return { id, rows: rows.length }
}

async function renderChart(spec) {
  const forSvg = structuredClone(spec)
  if (forSvg.width === 'container') forSvg.width = 640
  if (forSvg.height === 'container') forSvg.height = 360
  const vg = compile(forSvg).spec
  const view = new vega.View(vega.parse(vg), { renderer: 'none' })
  await view.runAsync()
  return view.toSVG()
}

export async function saveChart({ chatId, author, title, description, spec, rows }) {
  if (!isObj(spec)) throw new Error('spec must be a Vega-Lite object')
  spec = structuredClone(spec)
  if (rows) spec.data = { values: rows }
  if (hasDataUrl(spec)) throw new Error('charts cannot load data from a url; pass the data with sql or inline as data.values')
  spec.$schema ??= 'https://vega.github.io/schema/vega-lite/v6.json'
  spec.config = merge(CHART_THEME, spec.config)
  spec.title ??= title
  let svg
  try { svg = await renderChart(spec) } catch (e) { throw new Error(`the chart does not render: ${e.message}`) }
  const id = store.newId(); const d = dir(id)
  await fs.mkdir(d, { recursive: true })
  await fs.writeFile(path.join(d, 'chart.json'), JSON.stringify(spec, null, 1))
  await fs.writeFile(path.join(d, 'chart.svg'), svg)
  await sharp(Buffer.from(svg), { density: 192 }).png().toFile(path.join(d, 'chart.png'))
  const files = [{ name: 'chart.png', label: 'PNG' }, { name: 'chart.svg', label: 'SVG' }]
  const values = spec.data?.values
  if (Array.isArray(values) && values.length && isObj(values[0])) {
    const columns = [...new Set(values.flatMap(v => Object.keys(v)))]
    await fs.writeFile(path.join(d, 'data.csv'), toCsv(columns, values.map(v => columns.map(c => v[c]))))
    files.push({ name: 'data.csv', label: 'Data' })
  }
  files.push({ name: 'chart.json', label: 'Vega-Lite' })
  store.artifacts.create({ id, chatId, kind: 'chart', title, description, author, files, meta: { points: Array.isArray(values) ? values.length : null } })
  return { id }
}

const PAGE_BASE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:18px/1.6 'CMU Serif','Latin Modern Roman',Georgia,serif;color:#15161a;background:#fff;max-width:760px;margin:40px auto;padding:0 20px}
h1,h2,h3{font-weight:700;line-height:1.2}table{border-collapse:collapse;font:15px/1.4 'CMU Serif',Georgia,serif;border-top:1.5px solid #15161a;border-bottom:1.5px solid #15161a}
th{border-bottom:1px solid #15161a;font-weight:400}td,th{padding:5px 14px 5px 0;text-align:left;vertical-align:top}a{color:#1f3fd1}</style></head><body>`

export async function savePage({ chatId, author, title, description, html }) {
  if (!/<html[\s>]/i.test(html)) html = PAGE_BASE + html + '</body></html>'
  const id = store.newId(); const d = dir(id)
  await fs.mkdir(d, { recursive: true })
  await fs.writeFile(path.join(d, 'page.html'), html)
  store.artifacts.create({ id, chatId, kind: 'page', title, description, author, files: [{ name: 'page.html', label: 'HTML' }], meta: { bytes: html.length } })
  return { id }
}

export async function saveDocument({ chatId, author, title, description, markdown }) {
  const id = store.newId(); const d = dir(id)
  await fs.mkdir(d, { recursive: true })
  await fs.writeFile(path.join(d, 'document.md'), markdown)
  store.artifacts.create({ id, chatId, kind: 'document', title, description, author, files: [{ name: 'document.md', label: 'Markdown' }], meta: { words: markdown.split(/\s+/).length } })
  return { id }
}

// what the agent sees when it opens an artifact again
export async function readArtifact(id) {
  const a = store.artifacts.get(id)
  if (!a) throw new Error(`no artifact ${id}`)
  const d = dir(id)
  const head = `${a.kind} "${a.title}" (${a.id}), made ${a.created.slice(0, 16).replace('T', ' ')}${a.description ? `: ${a.description}` : ''}`
  const cap = s => (s.length > 120000 ? s.slice(0, 120000) + `\n…[cut at 120,000 of ${s.length} characters]` : s)
  if (a.kind === 'table' || a.kind === 'coding') return `${head}\n${a.meta.rows} rows.\n\n` + cap((await fs.readFile(path.join(d, 'data.csv'), 'utf8')).replace(/^﻿/, ''))
  if (a.kind === 'chart') return `${head}\n\nVega-Lite spec (theme config left out):\n` + cap(JSON.stringify({ ...JSON.parse(await fs.readFile(path.join(d, 'chart.json'), 'utf8')), config: undefined }))
  if (a.kind === 'page') return `${head}\n\n` + cap(await fs.readFile(path.join(d, 'page.html'), 'utf8'))
  if (a.kind === 'document') return `${head}\n\n` + cap(await fs.readFile(path.join(d, 'document.md'), 'utf8'))
  return head
}

export async function removeArtifact(id) {
  store.artifacts.remove(id)
  await fs.rm(dir(id), { recursive: true, force: true })
}
export const artifactFile = (id, name) => path.join(dir(id), path.basename(name))
