// URL detection + fetching + HTML→text extraction for F2.
// Ported from vibeceo/sms-bot/commands/f2.ts.

const MAX_STORED_CONTENT = 30000
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

export async function fetchUrlContent(url: string): Promise<string | null> {
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

    return text.slice(0, MAX_STORED_CONTENT)
  } catch (err) {
    console.error(`[f2] fetch error for ${url}:`, err)
    return null
  }
}
