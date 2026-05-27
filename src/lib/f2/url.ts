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

// Pull <title>…</title> verbatim. Returns the trimmed inner text or null.
// Used as a hint for the topic-naming step alongside the body text.
export function extractHtmlTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (!m) return null
  const text = m[1]
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > 0 ? text : null
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

// Direct YouTube transcript fetch via the `youtube-transcript` package.
// Only works from a residential IP — YouTube returns empty responses to
// datacenter ranges. Called by the /api/f2/youtube-transcript route which
// runs on the Mac mini behind a tunn3l tunnel.
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

// Top-level dispatcher used by fetchUrlContent. If F2_YOUTUBE_FETCH_URL is
// set (Vercel), call the mini's proxy to borrow its residential IP. Otherwise
// fetch directly (works in local dev or anywhere with a residential IP).
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
        signal: AbortSignal.timeout(15000),
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

export type FetchedUrl = {
  /** Extracted readable text (transcript / article body / plain text). */
  body: string | null
  /** HTML <title> if available — used as a naming hint, not authoritative. */
  title: string | null
}

export async function fetchUrlContent(url: string): Promise<FetchedUrl> {
  // YouTube URLs: try the transcript first. If we got one, optionally fetch
  // the watch page's <title> as a separate, cheap GET so the topic-naming
  // step has a real document title to work from (transcripts don't carry one).
  const ytId = extractYouTubeVideoId(url)
  if (ytId) {
    const transcript = await fetchYouTubeTranscript(ytId)
    if (transcript && transcript.length >= 50) {
      const title = await fetchHtmlTitleOnly(url)
      return { body: transcript, title }
    }
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
      return { body: null, title: null }
    }

    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('text/html') && !ct.includes('text/plain')) {
      console.log(`[f2] skipping non-text content-type for ${url}: ${ct}`)
      return { body: null, title: null }
    }

    const raw = await res.text()
    const isHtml = ct.includes('text/html')
    const body = isHtml ? stripHtml(raw) : raw.trim()
    const title = isHtml ? extractHtmlTitle(raw) : null
    return { body: body.length >= 50 ? body : null, title }
  } catch (err) {
    console.error(`[f2] fetch error for ${url}:`, err)
    return { body: null, title: null }
  }
}

// Lightweight title-only GET (used by the YouTube path to grab the video's
// real page title for naming, after we already have the transcript).
async function fetchHtmlTitleOnly(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('text/html')) return null
    const html = await res.text()
    return extractHtmlTitle(html)
  } catch {
    return null
  }
}
