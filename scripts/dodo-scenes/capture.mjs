#!/usr/bin/env node
// Capture every scene in scenes.json from the iOS simulator, signed in as
// the demo account, then export the site assets and a contact sheet.
//
//   node scripts/dodo-scenes/capture.mjs              # light theme, all scenes
//   node scripts/dodo-scenes/capture.mjs --dark       # light + dark
//   node scripts/dodo-scenes/capture.mjs --only peck,chat
//   node scripts/dodo-scenes/capture.mjs --export     # skip the simulator, re-export raw/
//
// Flow: one warm-up launch signs in and primes the caches; every scene after
// that reuses the warm session, so the launch hooks fire reliably. Raw
// captures land in raw/<id>.<theme>.png (gitignored); exports go to
// public/dodo/scenes/ (committed) and contact-sheet.png (committed, the
// thing to look at after a run).

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const RAW = path.join(HERE, 'raw')
const OUT = path.join(ROOT, 'public/dodo/scenes')
const BUNDLE = 'com.bartdecrem.Feynd'

const args = process.argv.slice(2)
const flag = (f) => args.includes(f)
const opt = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null }

const manifest = JSON.parse(fs.readFileSync(path.join(HERE, 'scenes.json'), 'utf8'))
const themes = flag('--dark') ? ['light', 'dark'] : manifest.themes
const only = opt('--only')?.split(',')
const scenes = manifest.scenes.filter((s) => !only || only.includes(s.id))

for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const log = (...a) => console.log('[capture]', ...a)
const sh = (cmd, a, o = {}) => execFileSync(cmd, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...o })
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000))

// ---- resolve $T_KEY launch args from seed-state.json ------------------------
const statePath = path.join(HERE, 'seed-state.json')
if (!fs.existsSync(statePath)) throw new Error('seed-state.json missing — run `pnpm dodo:seed` first')
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
const resolve = (a) =>
  a.replace(/\$T_([A-Z]+)/g, (_, k) => {
    if (!state.topics[k]) throw new Error(`no topic ${k} in seed-state.json`)
    return state.topics[k]
  })

// ---- simulator ---------------------------------------------------------------
function pickSim() {
  const list = JSON.parse(sh('xcrun', ['simctl', 'list', '-j', 'devices', 'available']))
  const hits = []
  for (const [runtime, devices] of Object.entries(list.devices)) {
    for (const d of devices) if (d.name === manifest.sim) hits.push({ runtime, udid: d.udid })
  }
  if (!hits.length) throw new Error(`no simulator named "${manifest.sim}"`)
  hits.sort((a, b) => b.runtime.localeCompare(a.runtime, undefined, { numeric: true }))
  if (manifest.runtime) {
    const want = manifest.runtime.replace(/[ .]/g, '-')
    const hit = hits.find((h) => h.runtime.endsWith(want))
    if (hit) return hit
    log(`runtime ${manifest.runtime} not installed — using ${hits[0].runtime.split('.').pop()}`)
  }
  return hits[0]
}
function findApp() {
  const dd = path.join(os.homedir(), 'Library/Developer/Xcode/DerivedData')
  const apps = fs.readdirSync(dd)
    .filter((d) => d.startsWith('Feynd-'))
    .map((d) => path.join(dd, d, 'Build/Products/Debug-iphonesimulator/Feynd.app'))
    .filter((p) => fs.existsSync(p))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
  if (!apps.length) throw new Error('no simulator build of Feynd.app in DerivedData — build the Feynd scheme for the simulator first')
  return apps[0]
}

async function capture() {
  const pass = process.env.DODO_DEMO_PASS
  if (!pass) throw new Error('DODO_DEMO_PASS is not set in .env.local')
  const sim = pickSim()
  const app = findApp()
  log('sim', manifest.sim, sim.udid, sim.runtime.split('.').pop())
  log('app', app)
  fs.mkdirSync(RAW, { recursive: true })

  sh('xcrun', ['simctl', 'bootstatus', sim.udid, '-b'])
  sh('xcrun', ['simctl', 'install', sim.udid, app])
  // The final review asks for the microphone; a system permission alert
  // would sit over every capture after it (and survives relaunches).
  sh('xcrun', ['simctl', 'privacy', sim.udid, 'grant', 'microphone', BUNDLE])
  sh('xcrun', ['simctl', 'spawn', sim.udid, 'defaults', 'write', BUNDLE, 'streakCelebrated', '-int', '9999'])
  sh('xcrun', ['simctl', 'status_bar', sim.udid, 'override', '--time', '9:41', '--batteryState', 'charged',
    '--batteryLevel', '100', '--cellularBars', '4', '--wifiBars', '3'])

  const launch = (...extra) => {
    try { sh('xcrun', ['simctl', 'terminate', sim.udid, BUNDLE]) } catch { /* not running */ }
    sh('xcrun', ['simctl', 'launch', sim.udid, BUNDLE, '-SkipNotifPrompt', '1', '-NoSFX', '1', ...extra])
  }

  for (const theme of themes) {
    sh('xcrun', ['simctl', 'ui', sim.udid, 'appearance', theme])
    log(`theme ${theme}: warming up (sign-in + caches)`)
    launch('-TestLoginUser', state.username, '-TestLoginPass', pass, '-StartTab', 'topics'); await sleep(12)
    launch('-StartTab', 'peck'); await sleep(12)

    for (const s of scenes) {
      if (!s.launch) continue
      launch(...s.launch.map(resolve))
      if (s.capture === 'record') {
        // Record from launch; the scene's `trim` picks the moment out in export.
        const mov = path.join(RAW, `${s.id}.${theme}.mp4`)
        await record(sim.udid, mov, s.seconds ?? 12)
        log(`recorded ${s.id} (${theme}) ${s.seconds ?? 12}s`)
        continue
      }
      const file = path.join(RAW, `${s.id}.${theme}.png`)
      const r = await stableShot(sim.udid, file, s.settle ?? 6)
      const note = r.blank ? ' — BLANK, check the launch args' : r.stable ? '' : ' — never settled (animated screen?)'
      log(`captured ${s.id} (${theme}) after ${r.waited.toFixed(0)}s${note}`)
    }
  }
  try { sh('xcrun', ['simctl', 'terminate', sim.udid, BUNDLE]) } catch { /* fine */ }
  sh('xcrun', ['simctl', 'ui', sim.udid, 'appearance', 'light'])
}

// Screenshot until two frames two seconds apart agree (under 2% of pixels
// changed) and the frame isn't blank paper. App launch on the simulator
// varies from 3 to 10 seconds, so a fixed sleep either wastes time or
// captures the splash; this waits exactly as long as the screen needs.
// `minSettle` is the scene's floor; 30 seconds is the ceiling.
async function stableShot(udid, file, minSettle, maxWait = 30) {
  await sleep(minSettle)
  const t0 = Date.now()
  let prev = null, prevFile = null, n = 0
  for (;;) {
    const tmp = `${file}.${n++}.tmp.png`
    sh('xcrun', ['simctl', 'io', udid, 'screenshot', tmp])
    const small = sharp(tmp).resize({ width: 315 }).greyscale()
    const [{ data }, stats] = await Promise.all([small.clone().raw().toBuffer({ resolveWithObject: true }), small.clone().stats()])
    const blank = stats.channels[0].stdev < 4
    let changed = 1
    if (prev) {
      let c = 0
      for (let i = 0; i < data.length; i++) if (Math.abs(data[i] - prev[i]) > 24) c++
      changed = c / data.length
    }
    const stable = Boolean(prev) && changed < 0.02 && !blank
    const timedOut = Date.now() - t0 > maxWait * 1000
    if (stable || timedOut) {
      fs.renameSync(tmp, file)
      if (prevFile) fs.rmSync(prevFile, { force: true })
      return { stable, blank, waited: minSettle + (Date.now() - t0) / 1000 }
    }
    if (prevFile) fs.rmSync(prevFile, { force: true })
    prev = data; prevFile = tmp
    await sleep(2)
  }
}

async function record(udid, file, seconds) {
  const p = spawn('xcrun', ['simctl', 'io', udid, 'recordVideo', '--codec', 'h264', '--force', file], { stdio: 'ignore' })
  await sleep(seconds)
  p.kill('SIGINT')
  await new Promise((r) => p.on('exit', r))
}

// ---- export ------------------------------------------------------------------
// Site assets: 840px-wide WebP (3x for the 268px tour frame is 804px). Legacy
// stills and clips are copied as they are.
async function exportAssets() {
  fs.mkdirSync(OUT, { recursive: true })
  const thumbs = []
  for (const s of manifest.scenes) {
    for (const theme of themes) {
      let src = null
      const flags = []
      const isClip = Boolean(s.clip) || s.capture === 'record'
      if (s.clip) { src = path.join(ROOT, s.clip); flags.push('clip') }
      else if (s.capture === 'record') { src = path.join(RAW, `${s.id}.${theme}.mp4`); flags.push('clip') }
      else {
        // A live capture wins; the legacy still is the fallback until the screen has a hook.
        src = path.join(RAW, `${s.id}.${theme}.png`)
        if (!fs.existsSync(src) && s.legacy) { src = path.join(ROOT, s.legacy); flags.push('legacy') }
      }
      if (!fs.existsSync(src)) { log(`MISSING ${s.id} (${theme}) — ${path.relative(ROOT, src)}`); thumbs.push({ s, theme, flags: [...flags, 'missing'] }); continue }
      const suffix = theme === 'light' ? '' : `.${theme}`
      if (isClip) {
        // Trim, scale to 630 wide (2x the tour frame), strip audio; poster
        // from the midpoint doubles as the still for static frames.
        const dst = path.join(OUT, `${s.id}${suffix}.mp4`)
        const trim = s.trim ? ['-ss', String(s.trim[0]), '-t', String(s.trim[1])] : []
        sh('ffmpeg', ['-y', '-v', 'error', ...trim, '-i', src, '-vf', "scale='min(630,iw)':-2", '-an',
          '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', dst])
        const poster = path.join(RAW, `${s.id}.${theme}.poster.png`)
        const mid = (s.trim ? s.trim[1] : s.seconds ?? 7) / 2
        sh('ffmpeg', ['-y', '-v', 'error', '-ss', String(mid), '-i', dst, '-frames:v', '1', poster])
        await sharp(poster).resize({ width: 840, withoutEnlargement: true }).webp({ quality: 88 }).toFile(path.join(OUT, `${s.id}${suffix}.webp`))
        thumbs.push({ s, theme, flags, file: poster })
        continue
      }
      const dst = path.join(OUT, `${s.id}${suffix}.webp`)
      await sharp(src).resize({ width: 840 }).webp({ quality: 88 }).toFile(dst)
      thumbs.push({ s, theme, flags, file: src })
    }
  }
  await contactSheet(thumbs)
}

async function contactSheet(items) {
  const W = 240, H = Math.round(W * 2736 / 1260), PAD = 24, LABEL = 56, COLS = 5
  const rows = Math.ceil(items.length / COLS)
  const sheetW = COLS * (W + PAD) + PAD
  const sheetH = rows * (H + LABEL + PAD) + PAD + 40
  const layers = []
  const labels = []
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    const x = PAD + (i % COLS) * (W + PAD)
    const y = PAD + 40 + Math.floor(i / COLS) * (H + LABEL + PAD)
    if (it.file) {
      const buf = await sharp(it.file).resize({ width: W, height: H, fit: 'cover', position: 'top' }).png().toBuffer()
      layers.push({ input: buf, left: x, top: y })
    } else {
      layers.push({ input: { create: { width: W, height: H, channels: 4, background: '#F2EAD6' } }, left: x, top: y })
    }
    const tag = [it.theme, ...it.flags].join(' · ')
    const warn = it.flags.some((f) => f === 'legacy' || f === 'missing')
    labels.push(`<text x="${x}" y="${y + H + 26}" font-size="18" font-weight="600" fill="#33383E">${esc(it.s.id)}</text>` +
      `<text x="${x}" y="${y + H + 46}" font-size="14" fill="${warn ? '#B97A14' : '#606C75'}">${esc(tag)}</text>`)
  }
  const title = `Dodo scenes · ${items.length} frames · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sheetW}" height="${sheetH}" font-family="Helvetica, Arial, sans-serif">
    <text x="${PAD}" y="${PAD + 18}" font-size="20" font-weight="700" fill="#33383E">${esc(title)}</text>${labels.join('')}</svg>`
  await sharp({ create: { width: sheetW, height: sheetH, channels: 4, background: '#FBF5E6' } })
    .composite([...layers, { input: Buffer.from(svg), left: 0, top: 0 }])
    .png().toFile(path.join(HERE, 'contact-sheet.png'))
  log('contact sheet →', path.relative(ROOT, path.join(HERE, 'contact-sheet.png')))
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')

if (!flag('--export')) await capture()
await exportAssets()
log('done')
