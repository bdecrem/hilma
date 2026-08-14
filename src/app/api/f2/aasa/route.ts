import { NextResponse } from 'next/server'

// Apple App Site Association for feynd.cc — served at
// /.well-known/apple-app-site-association via a rewrite in next.config.ts.
// Lets https://feynd.cc/peck open the Dodo app (Peck tab) directly.
const AASA = {
  applinks: {
    apps: [],
    details: [
      {
        appIDs: ['274T5WCVD2.com.bartdecrem.Feynd'],
        components: [{ '/': '/peck' }],
      },
    ],
  },
}

export function GET() {
  return NextResponse.json(AASA, {
    headers: {
      // Apple's CDN refetches on its own schedule; a day of caching is fine.
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
