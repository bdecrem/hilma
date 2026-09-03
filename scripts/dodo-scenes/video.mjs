#!/usr/bin/env node
// Assemble the overview video from the exported frames — the same React
// frame the site renders, so the video matches the page pixel for pixel.
//
//   node scripts/dodo-scenes/video.mjs            # 1080x1920 from out/story
//   node scripts/dodo-scenes/video.mjs --wide     # 1920x1080 from out/wide
//   node scripts/dodo-scenes/video.mjs --no-music
//
// Stills get a slow push-in; clip scenes are rebuilt from their exported
// layers (ground → the clip inside the screen rect, rounded → the bird on
// top) so the recorded motion plays where the still sat. Segments crossfade,
// the jambot bed (music.mjs) goes underneath. Needs `pnpm dodo:export`
// first. Writes out/video/overview[-wide].mp4 and copies the 9:16 result to
// public/dodo/tour/ for the site.

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const args = process.argv.slice(2)
const flag = (f) => args.includes(f)
const WIDE = flag('--wide')
const fmt = WIDE ? 'wide' : 'story'
const IN = path.join(HERE, 'out', fmt, 'light')
const OUT = path.join(HERE, 'out', 'video')
const SEG = path.join(OUT, 'seg')
const FPS = 30
const XFADE = 0.5
const log = (...a) => console.log('[video]', ...a)

const manifest = JSON.parse(fs.readFileSync(path.join(HERE, 'scenes.json'), 'utf8'))
const byId = Object.fromEntries(manifest.scenes.map((s) => [s.id, s]))
const isClip = (s) => Boolean(s.clip) || s.capture === 'record'
const clipSeconds = (s) => (s.trim ? s.trim[1] : s.seconds ?? 7)

function run(argv) {
  try {
    execFileSync('ffmpeg', ['-y', '-v', 'error', ...argv], { stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (e) {
    console.error(String(e.stderr || e).slice(-2000))
    process.exit(1)
  }
}

// ---- inputs ------------------------------------------------------------------
if (!fs.existsSync(IN)) throw new Error(`${path.relative(ROOT, IN)} missing — run \`pnpm dodo:export\` first`)
const sidecars = fs.readdirSync(IN).filter((f) => /^\d\d-.*\.json$/.test(f)).sort()
const card = (kind) => path.join(HERE, 'out', `${fmt}-${kind}`, 'light', `01-${fmt}-${kind}.png`)
for (const k of ['title', 'outro']) if (!fs.existsSync(card(k))) throw new Error(`${fmt}-${k} frame missing — export it`)

const music = path.join(HERE, 'music.wav')
if (!flag('--no-music') && !fs.existsSync(music)) {
  log('rendering the music bed (music.mjs)')
  execFileSync('node', [path.join(HERE, 'music.mjs')], { stdio: 'inherit' })
}

// Reading time per still: about 0.28 s a word, between 3.2 and 4.6 s.
const secsFor = (s) => {
  if (isClip(s)) return Math.min(8, clipSeconds(s))
  const words = s.line.replace(/\*\*/g, '').split(/\s+/).length
  return Math.min(4.6, Math.max(3.2, 2.2 + words * 0.28))
}

fs.rmSync(SEG, { recursive: true, force: true })
fs.mkdirSync(SEG, { recursive: true })

const shots = [{ kind: 'card', png: card('title'), secs: 3.0, id: 'title' }]
for (const f of sidecars) {
  const meta = JSON.parse(fs.readFileSync(path.join(IN, f), 'utf8'))
  const s = byId[meta.scene]
  if (!s) continue
  const stem = path.join(IN, f.replace(/\.json$/, ''))
  shots.push({ kind: isClip(s) ? 'clip' : 'still', png: stem + '.png', stem, meta, scene: s, secs: secsFor(s), id: s.id })
}
shots.push({ kind: 'card', png: card('outro'), secs: 3.4, id: 'outro' })

const first = JSON.parse(fs.readFileSync(path.join(IN, sidecars[0]), 'utf8'))
const W = first.w, H = first.h

// ---- segments ----------------------------------------------------------------
async function roundedMask(w, h, r, file) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" ry="${r}" fill="#fff"/></svg>`
  await sharp({ create: { width: w, height: h, channels: 3, background: '#000' } })
    .composite([{ input: Buffer.from(svg) }]).png().toFile(file)
}

const segments = []
for (let i = 0; i < shots.length; i++) {
  const sh = shots[i]
  const seg = path.join(SEG, `${String(i).padStart(2, '0')}.mp4`)
  const frames = Math.round(sh.secs * FPS)
  if (sh.kind === 'card') {
    run(['-loop', '1', '-t', String(sh.secs), '-i', sh.png, '-vf', `fps=${FPS},format=yuv420p`, '-c:v', 'libx264', '-preset', 'fast', seg])
  } else if (sh.kind === 'still') {
    // Gentle push-in: 1.00 → ~1.035 over the shot.
    run(['-loop', '1', '-t', String(sh.secs), '-i', sh.png,
      '-vf', `scale=${W * 2}:${H * 2},zoompan=z='min(1.035,1+0.0009*on)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${FPS},format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'fast', seg])
  } else {
    const r = sh.meta
    const cw = Math.round(r.width / 2) * 2, ch = Math.round(r.height / 2) * 2
    const clip = path.join(ROOT, 'public/dodo/scenes', `${sh.id}.mp4`)
    const mask = path.join(SEG, `${sh.id}.mask.png`)
    await roundedMask(cw, ch, Math.round(r.radius), mask)
    run(['-loop', '1', '-i', `${sh.stem}.bg.png`, '-stream_loop', '-1', '-i', clip, '-loop', '1', '-i', mask, '-loop', '1', '-i', `${sh.stem}.bird.png`,
      '-filter_complex',
      `[1:v]scale=${cw}:${ch}:flags=lanczos,setsar=1[c];[2:v]format=gray[m];[c][m]alphamerge[ca];` +
      `[0:v][ca]overlay=x=${Math.round(r.left)}:y=${Math.round(r.top)}[o1];[o1][3:v]overlay=0:0,fps=${FPS},format=yuv420p[out]`,
      '-map', '[out]', '-t', String(sh.secs), '-an', '-c:v', 'libx264', '-preset', 'fast', seg])
  }
  segments.push({ seg, secs: sh.secs })
  log(`segment ${String(i).padStart(2, '0')} ${sh.id} (${sh.kind}, ${sh.secs.toFixed(1)}s)`)
}

// ---- crossfade chain + music --------------------------------------------------
const n = segments.length
const inputs = []
for (const { seg } of segments) inputs.push('-i', seg)
const withMusic = !flag('--no-music')
if (withMusic) inputs.push('-i', music)
const graph = []
let off = 0, prev = '[0:v]'
for (let i = 1; i < n; i++) {
  off += segments[i - 1].secs - XFADE
  const outl = i < n - 1 ? `[x${i}]` : '[vout]'
  graph.push(`${prev}[${i}:v]xfade=transition=fade:duration=${XFADE}:offset=${off.toFixed(3)}${outl}`)
  prev = outl
}
const total = off + segments[n - 1].secs
const maps = ['-map', '[vout]']
if (withMusic) {
  graph.push(`[${n}:a]atrim=0:${total.toFixed(3)},afade=t=in:d=1.2,afade=t=out:st=${(total - 2.6).toFixed(3)}:d=2.6,volume=-4dB[aout]`)
  maps.push('-map', '[aout]')
}
fs.mkdirSync(OUT, { recursive: true })
const name = WIDE ? 'overview-wide' : 'overview'
const final = path.join(OUT, `${name}.mp4`)
run([...inputs, '-filter_complex', graph.join(';'), ...maps, '-c:v', 'libx264', '-preset', 'medium', '-crf', '19',
  ...(withMusic ? ['-c:a', 'aac', '-b:a', '160k'] : []), '-movflags', '+faststart', final])
await sharp(shots[0].png).jpeg({ quality: 88 }).toFile(path.join(OUT, `${name}-poster.jpg`))
if (!WIDE) {
  fs.mkdirSync(path.join(ROOT, 'public/dodo/tour'), { recursive: true })
  fs.copyFileSync(final, path.join(ROOT, 'public/dodo/tour/overview.mp4'))
  fs.copyFileSync(path.join(OUT, `${name}-poster.jpg`), path.join(ROOT, 'public/dodo/tour/overview-poster.jpg'))
}
log(`done — ${total.toFixed(1)}s → ${path.relative(ROOT, final)}`)
