#!/usr/bin/env node
// pnpm fonts:check — runs in front of `next build`.
//
// Fails the build when anything under src/ would fetch a font from Google at
// build time: an import of next/font/google, or an OG image (ImageResponse)
// reaching for fonts.googleapis.com / fonts.gstatic.com. Those took the whole
// site down on Vercel four times (a timeout, or a font URL Next's loader does
// not expect, and no page deploys). Fonts are bundled: see src/fonts/README.md.
//
// Also fails when a share image that is drawn during the build contains an emoji:
// the image library downloads each emoji's picture from a CDN while building, and a
// timeout there failed the deploy of 2026-11-18 (/bts/opengraph-image; nothing on the
// site deployed until it was fixed). Draw the shape as SVG, or render the image on
// demand (`export const runtime = 'edge'` or `export const dynamic = 'force-dynamic'`).
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SRC = path.join(ROOT, 'src')
const EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs'])

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('_archive')) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* walk(p)
    else if (EXT.has(path.extname(e.name))) yield p
  }
}

const offenses = []
const emojis = []
for await (const file of walk(SRC)) {
  const text = await readFile(file, 'utf8')
  const where = path.relative(ROOT, file)
  if (/from\s+['"]next\/font\/google['"]/.test(text)) offenses.push(`${where}: imports next/font/google`)
  if (text.includes('ImageResponse') && /fonts\.(googleapis|gstatic)\.com/.test(text)) offenses.push(`${where}: OG image fetches Google Fonts`)
  if (/(opengraph|twitter)-image\.[jt]sx?$/.test(file) && text.includes('ImageResponse') && !/export const (runtime = ['"]edge['"]|dynamic = ['"]force-dynamic['"])/.test(text)) {
    const emoji = text.replace(/\/\/.*$/gm, '').match(/\p{Emoji_Presentation}/u)
    if (emoji) emojis.push(`${where}: draws the emoji ${emoji[0]} during the build`)
  }
}

if (emojis.length) {
  console.error('A share image drawn during the build must not contain an emoji (its picture is downloaded from a CDN while building):\n')
  for (const o of emojis) console.error(`  ${o}`)
  console.error('\nDraw it as SVG, or add `export const runtime = \'edge\'` so the image is made on demand.')
  process.exit(1)
}
if (offenses.length) {
  console.error('Fonts must be bundled — the build would fetch from Google Fonts:\n')
  for (const o of offenses) console.error(`  ${o}`)
  console.error('\nAdd the family to src/fonts/fonts.json, run `pnpm fonts:sync`, and load it with')
  console.error('next/font/local (or readFile for an OG image) — the snippet is in src/fonts/README.md.')
  process.exit(1)
}
