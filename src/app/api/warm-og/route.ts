import { NextResponse } from 'next/server'
import CREATIONS from '@/app/amber/creations.json'

// Amber OG cache warmer.
//
// The problem: dynamic `opengraph-image.tsx` routes render via `next/og` on
// first request, taking ~30s on desktop for the newest creations. Once the
// CDN caches the rendered PNG, subsequent requests are instant — but the
// first human visitor after a deploy eats the cold start.
//
// This endpoint fetches every creation's OG URL, priming Vercel's edge cache
// so no user ever sees the cold render. Called by a Vercel Cron (see
// `vercel.json`). Idempotent and safe to call manually too.
//
// We hit the extension-less URL (e.g. `/amber/tuning/opengraph-image`) —
// that's the path the dynamic route resolves to and the one that actually
// triggers the ImageResponse render. For creations that have a baked
// `opengraph-image.png` instead, this URL 404s harmlessly; those are already
// fast because they're static files.

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const HOST = 'https://intheamber.com'

export async function GET(req: Request) {
  try {
    // Vercel Cron auto-includes `Authorization: Bearer ${CRON_SECRET}` if
    // CRON_SECRET is set in project env. If it's unset, allow anyone
    // (the endpoint is idempotent and read-only — worst case it re-warms).
    const secret = process.env.CRON_SECRET
    if (secret) {
      const auth = req.headers.get('authorization')
      if (auth !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
      }
    }

    const start = Date.now()
    const results = await Promise.all(
      CREATIONS.map(async (c) => {
        const url = `${HOST}${c.url}/opengraph-image`
        try {
          const res = await fetch(url, { cache: 'no-store' })
          return { url, status: res.status }
        } catch (err) {
          return { url, status: 0, error: String(err) }
        }
      }),
    )

    const ok = results.filter(r => r.status >= 200 && r.status < 300).length
    const notFound = results.filter(r => r.status === 404).length
    const failed = results.length - ok - notFound

    return NextResponse.json({
      total: results.length,
      ok,
      notFound, // static-only creations — expected, not a problem
      failed,
      elapsedMs: Date.now() - start,
      // Include individual results so failed warms are visible in logs.
      results: failed > 0 ? results : undefined,
    })
  } catch (err) {
    return NextResponse.json(
      { error: String(err), stack: err instanceof Error ? err.stack : undefined },
      { status: 500 },
    )
  }
}
