#!/usr/bin/env node
// Standalone YouTube-transcript proxy for F2.
//
// Why this exists: YouTube returns empty responses to datacenter IPs (Vercel),
// so production F2 borrows the Mac mini's residential IP. This used to run as a
// full Next.js app (`pnpm start`), which needs a `.next` build — and when that
// build went missing the proxy silently crash-looped. This script does the one
// job with zero build step: plain Node + the `youtube-transcript` package.
//
// Run: node scripts/f2-youtube-proxy.mjs   (cwd must be the repo so node_modules
// resolves). Managed on the mini by launchd (sh.f2.youtube-proxy.plist).
//
// Env: F2_YOUTUBE_FETCH_SECRET (required) — read from repo .env.local if not
// already in the environment. PORT (optional, default 3000).

import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { YoutubeTranscript } from 'youtube-transcript'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..')

// Load F2_YOUTUBE_FETCH_SECRET from .env.local if not already set.
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

const SECRET = loadSecret()
const PORT = Number(process.env.PORT) || 3000

if (!SECRET) {
  console.error('[f2-proxy] F2_YOUTUBE_FETCH_SECRET not set (env or .env.local). Exiting.')
  process.exit(1)
}

async function fetchTranscript(videoId) {
  // Prefer English; fall back to whatever the video has.
  for (const opts of [{ lang: 'en' }, {}]) {
    try {
      const lines = await YoutubeTranscript.fetchTranscript(videoId, opts)
      if (Array.isArray(lines) && lines.length) {
        const text = lines
          .map((l) => l.text)
          .filter(Boolean)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
        if (text.length > 0) return text
      }
    } catch (err) {
      console.error(`[f2-proxy] fetch failed for ${videoId} (${JSON.stringify(opts)}):`, err?.message || err)
    }
  }
  return null
}

function json(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(payload)
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)

  if (url.pathname === '/health') {
    return json(res, 200, { ok: true })
  }

  if (req.method !== 'GET' || url.pathname !== '/api/f2/youtube-transcript') {
    return json(res, 404, { error: 'not found' })
  }

  if (req.headers['x-f2-secret'] !== SECRET) {
    return json(res, 401, { error: 'unauthorized' })
  }

  const v = url.searchParams.get('v')?.trim()
  if (!v) return json(res, 400, { error: 'v required' })

  const text = await fetchTranscript(v)
  if (!text) return json(res, 404, { error: 'no transcript' })
  return json(res, 200, { text, length: text.length })
})

server.listen(PORT, () => {
  console.log(`[f2-proxy] listening on :${PORT}`)
})
