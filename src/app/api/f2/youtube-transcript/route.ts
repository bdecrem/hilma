import { NextResponse } from 'next/server'
import { fetchYouTubeTranscriptLocal } from '@/lib/f2/url'

export const runtime = 'nodejs'
export const maxDuration = 30

// GET /api/f2/youtube-transcript?v=<videoId>
// Header: X-F2-Secret: <F2_YOUTUBE_FETCH_SECRET>
//
// Runs on the Mac mini (reached via the tunn3l subdomain) so Vercel
// can borrow a residential IP for YouTube transcript fetches.
export async function GET(req: Request) {
  const expected = process.env.F2_YOUTUBE_FETCH_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'proxy not configured' }, { status: 503 })
  }
  const secret = req.headers.get('x-f2-secret')
  if (secret !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const v = new URL(req.url).searchParams.get('v')?.trim()
  if (!v) {
    return NextResponse.json({ error: 'v required' }, { status: 400 })
  }

  const text = await fetchYouTubeTranscriptLocal(v)
  if (!text) {
    return NextResponse.json({ error: 'no transcript' }, { status: 404 })
  }
  return NextResponse.json({ text, length: text.length })
}
