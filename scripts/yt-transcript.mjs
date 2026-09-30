#!/usr/bin/env node
// Fetch a YouTube transcript from any machine, via the Mac mini.
//
// YouTube blocks datacenter IPs, so the fetch happens on the mini's residential
// IP (scripts/f2-youtube-proxy.mjs, launchd sh.f2.youtube-proxy), reached through
// the tunn3l subdomain f2-mini. This is the client.
//
// Usage: node scripts/yt-transcript.mjs <youtube url or video id> [-o file.txt]
// Prints the transcript to stdout unless -o is given.
//
// Env: F2_YOUTUBE_FETCH_SECRET (read from repo .env.local if not set),
// YT_PROXY_URL (optional, default https://f2-mini.tunn3l.sh).

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function loadSecret() {
  if (process.env.F2_YOUTUBE_FETCH_SECRET) return process.env.F2_YOUTUBE_FETCH_SECRET
  try {
    const env = readFileSync(join(REPO_ROOT, '.env.local'), 'utf8')
    const m = env.match(/^F2_YOUTUBE_FETCH_SECRET=(.*)$/m)
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  } catch {
    // fall through
  }
  return null
}

function videoId(input) {
  if (/^[\w-]{11}$/.test(input)) return input
  try {
    const u = new URL(input)
    if (u.hostname === 'youtu.be') return u.pathname.slice(1, 12)
    if (u.searchParams.get('v')) return u.searchParams.get('v')
    const m = u.pathname.match(/\/(?:shorts|embed|live|v)\/([\w-]{11})/)
    if (m) return m[1]
  } catch {
    // fall through
  }
  return null
}

const args = process.argv.slice(2)
const oIdx = args.indexOf('-o')
const outFile = oIdx >= 0 ? args[oIdx + 1] : null
const input = args.find((a, i) => a !== '-o' && (oIdx < 0 || i !== oIdx + 1))

if (!input) {
  console.error('usage: node scripts/yt-transcript.mjs <youtube url or id> [-o file.txt]')
  process.exit(2)
}
const id = videoId(input)
if (!id) {
  console.error(`not a YouTube URL or video id: ${input}`)
  process.exit(2)
}
const secret = loadSecret()
if (!secret) {
  console.error('F2_YOUTUBE_FETCH_SECRET not set (env or .env.local)')
  process.exit(2)
}

const base = (process.env.YT_PROXY_URL || 'https://f2-mini.tunn3l.sh').replace(/\/$/, '')
const res = await fetch(`${base}/api/f2/youtube-transcript?v=${encodeURIComponent(id)}`, {
  headers: { 'x-f2-secret': secret },
  signal: AbortSignal.timeout(90_000),
})
const body = await res.json().catch(() => ({}))
if (!res.ok || !body.text) {
  console.error(`transcript failed (${res.status}): ${body.error || 'no body'}`)
  process.exit(1)
}

if (outFile) {
  writeFileSync(outFile, body.text + '\n')
  console.error(`wrote ${body.text.length} chars to ${outFile}`)
} else {
  process.stdout.write(body.text + '\n')
}
