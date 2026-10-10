import { NextResponse } from 'next/server'

// Apple App Site Association for ola.cx — served at
// /.well-known/apple-app-site-association via a rewrite in next.config.ts.
// Lets https://ola.cx/dolly/today (the daily text's link) open Dolly on the
// map. Dolly ships under Polly's App Store record and bundle id.
const AASA = {
  applinks: {
    apps: [],
    details: [
      {
        appIDs: ['274T5WCVD2.com.bartdecrem.Polly'],
        components: [{ '/': '/dolly/today' }, { '/': '/dolly/today/*' }],
      },
    ],
  },
}

export function GET() {
  return NextResponse.json(AASA, { headers: { 'Cache-Control': 'public, max-age=86400' } })
}
