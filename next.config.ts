import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    return {
      beforeFiles: [
        // decremental.com and www.decremental.com serve the /projects page at root
        {
          source: '/',
          has: [{ type: 'host', value: 'decremental.com' }],
          destination: '/projects',
        },
        {
          source: '/',
          has: [{ type: 'host', value: 'www.decremental.com' }],
          destination: '/projects',
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
    ]
  },
}

export default nextConfig
