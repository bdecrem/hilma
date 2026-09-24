import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  devIndicators: false,
  // The Openlab chat route reads the constitution from apps/ at runtime.
  outputFileTracingIncludes: {
    '/api/openlab/chat': ['./apps/openlab/01-constitution/constitution.md'],
    '/openlab/about': ['./apps/openlab/README.md'],
  },
  async rewrites() {
    return {
      beforeFiles: [
        // decremental.com and www.decremental.com share the bartin16 landing at root;
        // the project list itself lives at decremental.com/projects (no rewrite needed).
        {
          source: '/',
          has: [{ type: 'host', value: 'decremental.com' }],
          destination: '/hi',
        },
        {
          source: '/',
          has: [{ type: 'host', value: 'www.decremental.com' }],
          destination: '/hi',
        },
        // intheamber.com root → /amber feed
        {
          source: '/',
          has: [{ type: 'host', value: 'intheamber.com' }],
          destination: '/amber',
        },
        {
          source: '/',
          has: [{ type: 'host', value: 'www.intheamber.com' }],
          destination: '/amber',
        },
        // bartin16.xyz root → /hi (CASBS door page)
        {
          source: '/',
          has: [{ type: 'host', value: 'bartin16.xyz' }],
          destination: '/hi',
        },
        {
          source: '/',
          has: [{ type: 'host', value: 'www.bartin16.xyz' }],
          destination: '/hi',
        },
        // first100.dev root → /first100
        {
          source: '/',
          has: [{ type: 'host', value: 'first100.dev' }],
          destination: '/first100',
        },
        {
          source: '/',
          has: [{ type: 'host', value: 'www.first100.dev' }],
          destination: '/first100',
        },
        // nowwhat.ac and nowwhat.wtf root → /nowwhat
        {
          source: '/',
          has: [{ type: 'host', value: 'nowwhat.ac' }],
          destination: '/nowwhat',
        },
        {
          source: '/',
          has: [{ type: 'host', value: 'www.nowwhat.ac' }],
          destination: '/nowwhat',
        },
        {
          source: '/',
          has: [{ type: 'host', value: 'nowwhat.wtf' }],
          destination: '/nowwhat',
        },
        {
          source: '/',
          has: [{ type: 'host', value: 'www.nowwhat.wtf' }],
          destination: '/nowwhat',
        },
        {
          source: '/',
          has: [{ type: 'host', value: 'nowwhat.cc' }],
          destination: '/nowwhat',
        },
        {
          source: '/',
          has: [{ type: 'host', value: 'www.nowwhat.cc' }],
          destination: '/nowwhat',
        },
        // feynd.cc universal-link manifest — Apple fetches this exact path
        // to let https://feynd.cc/peck open the Dodo app.
        {
          source: '/.well-known/apple-app-site-association',
          has: [{ type: 'host', value: 'feynd.cc' }],
          destination: '/api/f2/aasa',
        },
        {
          source: '/.well-known/apple-app-site-association',
          has: [{ type: 'host', value: 'www.feynd.cc' }],
          destination: '/api/f2/aasa',
        },
        // feynd.cc root → /f2 (the F2 web app)
        {
          source: '/',
          has: [{ type: 'host', value: 'feynd.cc' }],
          destination: '/f2',
        },
        {
          source: '/',
          has: [{ type: 'host', value: 'www.feynd.cc' }],
          destination: '/f2',
        },
        // dodogo.cc root → /dodo (the Dodo project site)
        {
          source: '/',
          has: [{ type: 'host', value: 'dodogo.cc' }],
          destination: '/dodo',
        },
        {
          source: '/',
          has: [{ type: 'host', value: 'www.dodogo.cc' }],
          destination: '/dodo',
        },
        // dodo.foo — the primary Dodo domain, same site as dodogo.cc
        {
          source: '/',
          has: [{ type: 'host', value: 'dodo.foo' }],
          destination: '/dodo',
        },
        {
          source: '/',
          has: [{ type: 'host', value: 'www.dodo.foo' }],
          destination: '/dodo',
        },
        // jambot.to root → /jam (Jam — Jambot in the browser)
        {
          source: '/',
          has: [{ type: 'host', value: 'jambot.to' }],
          destination: '/jam',
        },
        {
          source: '/',
          has: [{ type: 'host', value: 'www.jambot.to' }],
          destination: '/jam',
        },
        // onething.ink root → /onething (one sentence a day, by text)
        {
          source: '/',
          has: [{ type: 'host', value: 'onething.ink' }],
          destination: '/onething',
        },
        {
          source: '/',
          has: [{ type: 'host', value: 'www.onething.ink' }],
          destination: '/onething',
        },
        // tokensurfers.app + brainrot.surf root → /surf (Token Surfers)
        {
          source: '/',
          has: [{ type: 'host', value: 'tokensurfers.app' }],
          destination: '/surf',
        },
        {
          source: '/',
          has: [{ type: 'host', value: 'www.tokensurfers.app' }],
          destination: '/surf',
        },
        {
          source: '/',
          has: [{ type: 'host', value: 'brainrot.surf' }],
          destination: '/surf',
        },
        {
          source: '/',
          has: [{ type: 'host', value: 'www.brainrot.surf' }],
          destination: '/surf',
        },
        // dogear.bar root → /book-scout (the Dog-Ear app)
        {
          source: '/',
          has: [{ type: 'host', value: 'dogear.bar' }],
          destination: '/book-scout',
        },
        {
          source: '/',
          has: [{ type: 'host', value: 'www.dogear.bar' }],
          destination: '/book-scout',
        },
      ],
      afterFiles: [
        // intheamber.com/anything → /amber/anything (only if no file matched above)
        // Exclude paths already under /amber/* — those resolve to actual routes;
        // without this, dynamic routes (e.g. /amber/noon/[date]) get caught by this
        // rewrite and become /amber/amber/... which 404s.
        {
          source: '/:path((?!amber(?:/|$)).*)',
          has: [{ type: 'host', value: 'intheamber.com' }],
          destination: '/amber/:path',
        },
        {
          source: '/:path((?!amber(?:/|$)).*)',
          has: [{ type: 'host', value: 'www.intheamber.com' }],
          destination: '/amber/:path',
        },
        // first100.dev/anything → /first100/anything
        {
          source: '/:path+',
          has: [{ type: 'host', value: 'first100.dev' }],
          destination: '/first100/:path+',
        },
        {
          source: '/:path+',
          has: [{ type: 'host', value: 'www.first100.dev' }],
          destination: '/first100/:path+',
        },
        // nowwhat.ac/anything → /nowwhat/anything
        {
          source: '/:path+',
          has: [{ type: 'host', value: 'nowwhat.ac' }],
          destination: '/nowwhat/:path+',
        },
        {
          source: '/:path+',
          has: [{ type: 'host', value: 'www.nowwhat.ac' }],
          destination: '/nowwhat/:path+',
        },
        {
          source: '/:path+',
          has: [{ type: 'host', value: 'nowwhat.wtf' }],
          destination: '/nowwhat/:path+',
        },
        {
          source: '/:path+',
          has: [{ type: 'host', value: 'www.nowwhat.wtf' }],
          destination: '/nowwhat/:path+',
        },
        {
          source: '/:path+',
          has: [{ type: 'host', value: 'nowwhat.cc' }],
          destination: '/nowwhat/:path+',
        },
        {
          source: '/:path+',
          has: [{ type: 'host', value: 'www.nowwhat.cc' }],
          destination: '/nowwhat/:path+',
        },
        // dodogo.cc/anything → /dodo/anything (og image, icon)
        {
          source: '/:path((?!(?:dodo|api|_next)(?:/|$)).*)',
          has: [{ type: 'host', value: 'dodogo.cc' }],
          destination: '/dodo/:path',
        },
        {
          source: '/:path((?!(?:dodo|api|_next)(?:/|$)).*)',
          has: [{ type: 'host', value: 'www.dodogo.cc' }],
          destination: '/dodo/:path',
        },
        // dodo.foo/anything → /dodo/anything
        {
          source: '/:path((?!(?:dodo|api|_next)(?:/|$)).*)',
          has: [{ type: 'host', value: 'dodo.foo' }],
          destination: '/dodo/:path',
        },
        {
          source: '/:path((?!(?:dodo|api|_next)(?:/|$)).*)',
          has: [{ type: 'host', value: 'www.dodo.foo' }],
          destination: '/dodo/:path',
        },
        // jambot.to/anything → /jam/anything (opengraph-image etc.)
        {
          source: '/:path((?!(?:jam|api|_next)(?:/|$)).*)',
          has: [{ type: 'host', value: 'jambot.to' }],
          destination: '/jam/:path',
        },
        {
          source: '/:path((?!(?:jam|api|_next)(?:/|$)).*)',
          has: [{ type: 'host', value: 'www.jambot.to' }],
          destination: '/jam/:path',
        },
        // onething.ink/anything → /onething/anything (opengraph-image etc.)
        {
          source: '/:path((?!(?:onething|api|_next)(?:/|$)).*)',
          has: [{ type: 'host', value: 'onething.ink' }],
          destination: '/onething/:path',
        },
        {
          source: '/:path((?!(?:onething|api|_next)(?:/|$)).*)',
          has: [{ type: 'host', value: 'www.onething.ink' }],
          destination: '/onething/:path',
        },
        // tokensurfers.app + brainrot.surf /anything → /surf/anything (gallery, /a/<slug>, og)
        {
          source: '/:path((?!(?:surf|api|_next)(?:/|$)).*)',
          has: [{ type: 'host', value: 'tokensurfers.app' }],
          destination: '/surf/:path',
        },
        {
          source: '/:path((?!(?:surf|api|_next)(?:/|$)).*)',
          has: [{ type: 'host', value: 'www.tokensurfers.app' }],
          destination: '/surf/:path',
        },
        {
          source: '/:path((?!(?:surf|api|_next)(?:/|$)).*)',
          has: [{ type: 'host', value: 'brainrot.surf' }],
          destination: '/surf/:path',
        },
        {
          source: '/:path((?!(?:surf|api|_next)(?:/|$)).*)',
          has: [{ type: 'host', value: 'www.brainrot.surf' }],
          destination: '/surf/:path',
        },
        // feynd.cc/anything → /f2/anything
        // Excludes /f2/* (avoid /f2/f2/…) AND /api/* and /_next/* — afterFiles
        // rewrites run BEFORE dynamic routes, so without the api exclusion the
        // catch-all swallows /api/f2/topics/[id] etc. before they can match.
        {
          source: '/:path((?!(?:f2|api|_next|dodo)(?:/|$)).*)',
          has: [{ type: 'host', value: 'feynd.cc' }],
          destination: '/f2/:path',
        },
        {
          source: '/:path((?!(?:f2|api|_next|dodo)(?:/|$)).*)',
          has: [{ type: 'host', value: 'www.feynd.cc' }],
          destination: '/f2/:path',
        },
      ],
      fallback: [],
    }
  },
  async redirects() {
    return [
      // www.decremental.com/anything → decremental.com/anything (except root which rewrites above)
      {
        source: '/:path+',
        has: [{ type: 'host', value: 'www.decremental.com' }],
        destination: 'https://decremental.com/:path+',
        permanent: true,
      },
      // The journal lives at onething.ink only. Served from the vercel host too,
      // it was a second origin with its own cookie jar: sign in on one, and the
      // other looks signed out. (API routes stay — the cron calls them here.)
      {
        source: '/onething',
        has: [{ type: 'host', value: 'hilma-nine.vercel.app' }],
        destination: 'https://onething.ink/',
        permanent: true,
      },
      {
        source: '/onething/:path+',
        has: [{ type: 'host', value: 'hilma-nine.vercel.app' }],
        destination: 'https://onething.ink/:path+',
        permanent: true,
      },
    ]
  },
}

export default nextConfig
