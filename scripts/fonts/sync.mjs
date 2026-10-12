#!/usr/bin/env node
// pnpm fonts:sync [--fresh] [Family ...]
//
// Builds src/fonts from the google/fonts repo: for every family in
// src/fonts/fonts.json, downloads the source TTFs (cached in scripts/fonts/.cache),
// cuts them to Google's latin + latin-ext ranges with fonttools (a venv in
// scripts/fonts/.venv, created on first run) and writes
//   src/fonts/<family-dir>/<Family>.woff2            variable, wght only
//   src/fonts/<family-dir>/<Family>-<w>.woff2        one per static weight
//   src/fonts/<family-dir>/<Family>-<w>.ttf          static instances for OG images
// plus src/fonts/catalog.json and src/fonts/README.md (the snippet to paste per
// family). Commit the result. Nothing at build time ever talks to Google again.
//
// `--fresh` re-downloads the sources; naming families builds only those.
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const FONTS = path.join(ROOT, 'src/fonts')
const HERE = path.join(ROOT, 'scripts/fonts')
const CACHE = path.join(HERE, '.cache')
const VENV = path.join(HERE, '.venv')

const argv = process.argv.slice(2)
const fresh = argv.includes('--fresh')
const only = argv.filter((a) => !a.startsWith('--'))

const WEIGHT_NAMES = { Thin: 100, ExtraLight: 200, Light: 300, Regular: 400, Medium: 500, SemiBold: 600, Bold: 700, ExtraBold: 800, Black: 900 }
const nameOfWeight = (w) => Object.keys(WEIGHT_NAMES).find((k) => WEIGHT_NAMES[k] === w) ?? String(w)

// ---------- GitHub ----------

function ghToken() {
  try {
    return execFileSync('gh', ['auth', 'token'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return process.env.GITHUB_TOKEN || ''
  }
}
const TOKEN = ghToken()

async function gh(url) {
  const headers = { 'User-Agent': 'hilma-fonts-sync', Accept: 'application/vnd.github+json' }
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`
  const r = await fetch(url, { headers })
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`GitHub ${r.status} for ${url}`)
  return r.json()
}

async function findFamilyDir(slug) {
  for (const lic of ['ofl', 'apache', 'ufl']) {
    const listing = await gh(`https://api.github.com/repos/google/fonts/contents/${lic}/${slug}`)
    if (listing) return { repoDir: `${lic}/${slug}`, listing }
  }
  throw new Error(`no ${slug} under ofl/, apache/ or ufl/ in google/fonts`)
}

async function download(file, slug) {
  const dest = path.join(CACHE, slug, file.name)
  if (!fresh && existsSync(dest)) return dest
  await mkdir(path.dirname(dest), { recursive: true })
  const r = await fetch(file.download_url)
  if (!r.ok) throw new Error(`download ${r.status} ${file.download_url}`)
  await writeFile(dest, Buffer.from(await r.arrayBuffer()))
  return dest
}

// ---------- Python ----------

function pythonFor(venv) {
  const bin = path.join(venv, 'bin/python')
  if (!existsSync(bin)) {
    const base = ['python3.13', 'python3.12', 'python3'].find((p) => spawnSync(p, ['--version']).status === 0)
    if (!base) throw new Error('no python3 on PATH')
    console.log(`creating ${path.relative(ROOT, venv)} with ${base}`)
    const mk = spawnSync(base, ['-m', 'venv', venv], { stdio: 'inherit' })
    if (mk.status !== 0) throw new Error('venv creation failed')
  }
  const probe = spawnSync(bin, ['-c', 'import fontTools, brotli'])
  if (probe.status !== 0) {
    console.log('installing fonttools + brotli')
    const pip = spawnSync(path.join(venv, 'bin/pip'), ['install', '-q', 'fonttools', 'brotli'], { stdio: 'inherit' })
    if (pip.status !== 0) throw new Error('pip install failed')
  }
  return bin
}

function runBuild(jobs) {
  const py = pythonFor(VENV)
  const r = spawnSync(py, [path.join(HERE, 'build.py')], { input: JSON.stringify(jobs), maxBuffer: 1 << 26 })
  if (r.status !== 0) throw new Error(`build.py failed:\n${r.stderr}`)
  return JSON.parse(r.stdout.toString())
}

// ---------- Families ----------

async function planFamily(family, cfg) {
  const slug = family.toLowerCase().replace(/\s+/g, '')
  const dir = family.toLowerCase().replace(/\s+/g, '-')
  const compact = family.replace(/\s+/g, '')
  const { repoDir, listing } = await findFamilyDir(slug)
  const ttfs = listing.filter((f) => f.type === 'file' && f.name.endsWith('.ttf'))
  const variable = ttfs.find((f) => new RegExp(`^${compact}\\[.*\\]\\.ttf$`).test(f.name))
  const variableItalic = ttfs.find((f) => new RegExp(`^${compact}-Italic\\[.*\\]\\.ttf$`).test(f.name))
  // Static files are `<Family>-<Weight>[Italic].ttf`; a family whose files are
  // named otherwise (IM Fell English: IMFeENrm28P.ttf) lists them in `files`
  // in fonts.json, keyed "<weight>" / "<weight>i".
  const staticOf = (weight, italic) => {
    const listed = cfg.files?.[`${weight}${italic ? 'i' : ''}`]
    if (listed) return ttfs.find((f) => f.name === listed)
    const name = nameOfWeight(weight)
    const style = italic ? (name === 'Regular' ? 'Italic' : `${name}Italic`) : name
    return ttfs.find((f) => f.name === `${compact}-${style}.ttf`)
  }
  const outDir = path.join(FONTS, dir)
  const jobs = []
  const sources = new Map()
  const use = async (file, what) => {
    if (!file) throw new Error(`${family}: no source file for ${what} in ${repoDir} (have ${ttfs.map((f) => f.name).join(', ')})`)
    sources.set(file.name, file.sha)
    return download(file, slug)
  }
  const og = cfg.og ?? []
  if (variable) {
    jobs.push({ src: await use(variable, 'the variable font'), out: path.join(outDir, `${compact}.woff2`), flavor: 'woff2', wght: null, role: 'web' })
    if (cfg.italic) jobs.push({ src: await use(variableItalic, 'the variable italic'), out: path.join(outDir, `${compact}-Italic.woff2`), flavor: 'woff2', wght: null, role: 'web' })
    for (const w of og) jobs.push({ src: await use(variable, 'the variable font'), out: path.join(outDir, `${compact}-${w}.ttf`), flavor: null, wght: w, role: 'og' })
  } else {
    const weights = cfg.weights ?? [400]
    for (const w of weights) jobs.push({ src: await use(staticOf(w, false), `weight ${w}`), out: path.join(outDir, `${compact}-${w}.woff2`), flavor: 'woff2', wght: null, role: 'web' })
    if (cfg.italic) for (const w of weights) jobs.push({ src: await use(staticOf(w, true), `italic ${w}`), out: path.join(outDir, `${compact}-${w}-Italic.woff2`), flavor: 'woff2', wght: null, role: 'web' })
    for (const w of og) jobs.push({ src: await use(staticOf(w, false), `OG weight ${w}`), out: path.join(outDir, `${compact}-${w}.ttf`), flavor: null, wght: null, role: 'og' })
  }
  return { family, dir, compact, kind: variable ? 'variable' : 'static', repoDir, sources: Object.fromEntries(sources), jobs }
}

// ---------- README ----------

const rel = (dir, file) => `../../fonts/${dir}/${file}`
const q = (s) => `'${s}'`

function snippet(entry) {
  const { dir, web, kind } = entry
  const v = `--font-${dir}`
  const tail = `variable: ${q(v)}, display: 'swap'`
  if (kind === 'variable') {
    const range = `${web[0].weight[0]} ${web[0].weight[1]}`
    if (web.length === 1) return `const font = localFont({ src: ${q(rel(dir, web[0].file))}, weight: ${q(range)}, ${tail} })`
    const srcs = web.map((f) => `    { path: ${q(rel(dir, f.file))}, style: ${q(f.style)} },`).join('\n')
    return `const font = localFont({\n  src: [\n${srcs}\n  ],\n  weight: ${q(range)},\n  ${tail},\n})`
  }
  if (web.length === 1) return `const font = localFont({ src: ${q(rel(dir, web[0].file))}, weight: ${q(String(web[0].weight))}, ${tail} })`
  const srcs = web.map((f) => `    { path: ${q(rel(dir, f.file))}, weight: ${q(String(f.weight))}${f.style === 'italic' ? ", style: 'italic'" : ''} },`).join('\n')
  return `const font = localFont({\n  src: [\n${srcs}\n  ],\n  ${tail},\n})`
}

function readme(catalog) {
  const out = []
  out.push(`# Fonts

Every web font on this site, bundled. Pages load them with \`next/font/local\`,
OG images read the \`.ttf\` instances from disk, and nothing at build time
fetches a font from Google Fonts. Google was the cause of every font-related
build failure on Vercel (2026-09-05, twice on 2026-10-11, again on 2026-10-12:
a network timeout or an unexpected font URL in its CSS takes every deploy down
with it). \`pnpm build\` now refuses to run while anything in \`src/\` still
imports \`next/font/google\` or fetches \`fonts.googleapis.com\` in an OG image
(\`scripts/fonts/check.mjs\`).

**Generated** by \`pnpm fonts:sync\` from \`fonts.json\` and the google/fonts
repo (\`scripts/fonts/sync.mjs\` + \`build.py\`): latin + latin-ext ranges,
unhinted, every axis but \`wght\` pinned to its default. Do not edit the font
files or this README by hand.

## Adding a family

1. Add it to \`fonts.json\` (\`"italic": true\` for an italic face, \`"weights"\`
   for a static family's weights, \`"og"\` for \`.ttf\` instances an OG image needs).
2. \`pnpm fonts:sync "Family Name"\` (first run creates \`scripts/fonts/.venv\`).
3. Paste the snippet below into the layout, with the variable name the page's
   CSS expects. Paths are relative to \`src/app/<page>/\`; a page one level
   deeper (\`src/app/design/<page>/\`) uses \`../../../fonts/…\`.
4. Commit \`src/fonts/\` with the page.

An OG image reads its font with \`readFile(path.join(process.cwd(),
'src/fonts/<dir>/<Family>-<w>.ttf'))\` — a literal path, so Vercel's file
tracing bundles it. A share-card route that renders at request time must also
list the file in \`outputFileTracingIncludes\` in \`next.config.ts\` (as
\`/drum/og\` does).

## Catalog

Built ${catalog.generated}.
`)
  for (const entry of Object.values(catalog.families)) {
    const axes = entry.axes && Object.keys(entry.axes).length ? Object.entries(entry.axes).map(([t, [lo, , hi]]) => `${t} ${lo}–${hi}`).join(', ') : ''
    const kb = (n) => `${Math.round(n / 1024)} KB`
    out.push(`### ${entry.family}\n`)
    out.push(`${entry.kind}${axes ? ` (${axes})` : ''} · \`${entry.repoDir}\` · ${entry.web.map((f) => `${f.file} ${kb(f.bytes)}`).join(', ')}\n`)
    out.push('```ts\n' + `import localFont from 'next/font/local'\n` + snippet(entry) + '\n```\n')
    if (entry.og.length) {
      out.push(`OG: ${entry.og.map((f) => `\`${entry.dir}/${f.file}\` → \`{ name: '${entry.family}', weight: ${f.weight}, style: '${f.style}' }\``).join('; ')}\n`)
    }
  }
  return out.join('\n')
}

// ---------- Main ----------

async function main() {
  const manifest = JSON.parse(await readFile(path.join(FONTS, 'fonts.json'), 'utf8'))
  const names = Object.keys(manifest.families).filter((f) => !only.length || only.includes(f))
  if (!names.length) throw new Error(`no family matches ${only.join(', ')}`)
  const catalogPath = path.join(FONTS, 'catalog.json')
  const catalog = existsSync(catalogPath) ? JSON.parse(await readFile(catalogPath, 'utf8')) : { families: {} }

  const plans = []
  for (const family of names) {
    process.stdout.write(`${family}: `)
    const plan = await planFamily(family, manifest.families[family])
    console.log(`${plan.kind}, ${plan.jobs.length} file(s) from ${plan.repoDir}`)
    plans.push(plan)
  }

  const jobs = plans.flatMap((p) => p.jobs)
  console.log(`building ${jobs.length} files…`)
  const results = runBuild(jobs)
  const byOut = new Map(results.map((r) => [r.out, r]))

  for (const plan of plans) {
    const outDir = path.join(FONTS, plan.dir)
    const keep = new Set(plan.jobs.map((j) => path.basename(j.out)))
    for (const f of await readdir(outDir)) if (!keep.has(f)) await rm(path.join(outDir, f))
    const rec = (j) => {
      const r = byOut.get(j.out)
      return { file: path.basename(j.out), style: r.style, weight: r.weight, bytes: r.bytes }
    }
    const web = plan.jobs.filter((j) => j.role === 'web').map(rec)
    const og = plan.jobs.filter((j) => j.role === 'og').map(rec)
    const axes = byOut.get(plan.jobs[0].out).axes
    catalog.families[plan.family] = { family: plan.family, dir: plan.dir, kind: plan.kind, repoDir: plan.repoDir, sources: plan.sources, axes, web, og }
    console.log(`  ${plan.family}: ${[...web, ...og].map((f) => `${f.file} (${Math.round(f.bytes / 1024)} KB)`).join(', ')}`)
  }

  // Families dropped from the manifest leave the catalog and the disk.
  for (const family of Object.keys(catalog.families)) {
    if (!manifest.families[family]) {
      await rm(path.join(FONTS, catalog.families[family].dir), { recursive: true, force: true })
      delete catalog.families[family]
    }
  }
  catalog.families = Object.fromEntries(Object.entries(catalog.families).sort(([a], [b]) => a.localeCompare(b)))
  catalog.generated = new Date().toISOString().slice(0, 10)
  await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + '\n')
  await writeFile(path.join(FONTS, 'README.md'), readme(catalog))

  const total = Object.values(catalog.families).flatMap((f) => [...f.web, ...f.og]).reduce((n, f) => n + f.bytes, 0)
  console.log(`done: ${Object.keys(catalog.families).length} families, ${Math.round(total / 1024)} KB in src/fonts`)
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
