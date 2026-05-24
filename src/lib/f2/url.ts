// URL detection + fetching + HTML→text extraction for F2.
// Ported from vibeceo/sms-bot/commands/f2.ts.

import { YoutubeTranscript } from 'youtube-transcript'

const FETCH_TIMEOUT_MS = 15000
const USER_AGENT =
  'Mozilla/5.0 (compatible; F2Bot/1.0; +https://hilma-nine.vercel.app)'

export function isUrl(s: string): boolean {
  return /^https?:\/\/\S+/i.test(s.trim())
}

export function stripSurroundingQuotes(s: string): string {
  return s.replace(/^["'‘’“‛”]+|["'‘’“‛”]+$/g, '')
}

function stripHtml(html: string): string {
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')
    .replace(/<[^>]+>/g, ' ')

  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')

  return text.replace(/\s+/g, ' ').trim()
}

// YouTube URL → video id. Covers watch?v=, youtu.be/, shorts/, embed/, m.youtube.
const YOUTUBE_PATTERNS = [
  /youtu\.be\/([A-Za-z0-9_-]{6,})/i,
  /youtube\.com\/shorts\/([A-Za-z0-9_-]{6,})/i,
  /youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/i,
  /(?:m\.|www\.)?youtube\.com\/watch\?(?:.*&)?v=([A-Za-z0-9_-]{6,})/i,
]

export function extractYouTubeVideoId(url: string): string | null {
  for (const re of YOUTUBE_PATTERNS) {
    const m = url.match(re)
    if (m) return m[1]
  }
  return null
}

// Direct call into the youtube-transcript package. Works on residential IPs;
// returns empty/null on datacenter IPs (Vercel, AWS, etc.) because YouTube
// blocks them. Exported so the local proxy endpoint can call it directly.
export async function fetchYouTubeTranscriptLocal(
  videoId: string,
): Promise<string | null> {
  try {
    const lines = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' })
    if (!Array.isArray(lines) || lines.length === 0) return null
    const text = lines
      .map((l) => l.text)
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    return text.length > 0 ? text : null
  } catch (err) {
    console.error(`[f2] YouTube transcript fetch (local) failed for ${videoId}:`, err)
    return null
  }
}

// Top-level entry point. If F2_YOUTUBE_FETCH_URL is set, proxy through that
// base (typically Bart's iMac via bart-imac.tunn3l.sh) so the actual YouTube
// call happens from a residential IP. Otherwise call directly — works for
// local dev on the iMac itself.
//
// Returns null on any failure; callers fall back to the regular HTML
// extraction so the user still gets *something* stored for the URL.
export async function fetchYouTubeTranscript(
  videoId: string,
): Promise<string | null> {
  const proxyBase = process.env.F2_YOUTUBE_FETCH_URL?.replace(/\/$/, '')
  if (!proxyBase) {
    return fetchYouTubeTranscriptLocal(videoId)
  }

  const secret = process.env.F2_YOUTUBE_FETCH_SECRET ?? ''
  if (!secret) {
    console.error('[f2] F2_YOUTUBE_FETCH_URL set but F2_YOUTUBE_FETCH_SECRET missing')
    return null
  }

  try {
    const res = await fetch(
      `${proxyBase}/api/f2/youtube-transcript?v=${encodeURIComponent(videoId)}`,
      {
        headers: { 'x-f2-secret': secret },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
    )
    if (!res.ok) {
      console.error(`[f2] YouTube proxy ${proxyBase} → ${res.status}`)
      return null
    }
    const data = (await res.json()) as { text?: string; error?: string }
    return data.text?.trim() || null
  } catch (err) {
    console.error(`[f2] YouTube proxy error:`, err)
    return null
  }
}

export async function fetchUrlContent(url: string): Promise<string | null> {
  // YouTube URLs: prefer the transcript over the watch-page HTML.
  // (HTML on youtube.com strips down to chrome / "Sign in to like this video"
  // boilerplate — useless for learning.) If no captions exist or anything in
  // the transcript chain breaks, fall through to the regular HTML path so the
  // user still gets *something* stored.
  const ytId = extractYouTubeVideoId(url)
  if (ytId) {
    const transcript = await fetchYouTubeTranscript(ytId)
    if (transcript && transcript.length >= 50) return transcript
    console.log(`[f2] YouTube ${ytId}: no transcript, falling back to HTML`)
  }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })

    if (!res.ok) {
      console.error(`[f2] fetch ${url} → ${res.status}`)
      return null
    }

    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('text/html') && !ct.includes('text/plain')) {
      console.log(`[f2] skipping non-text content-type for ${url}: ${ct}`)
      return null
    }

    const body = await res.text()
    const text = ct.includes('text/html') ? stripHtml(body) : body.trim()
    if (text.length < 50) return null

    return text
  } catch (err) {
    console.error(`[f2] fetch error for ${url}:`, err)
    return null
  }
}
