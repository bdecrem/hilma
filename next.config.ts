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
      ],
      afterFiles: [
        // intheamber.com/anything → /amber/anything (only if no file matched above)
        {
          source: '/:path+',
          has: [{ type: 'host', value: 'intheamber.com' }],
          destination: '/amber/:path+',
        },
        {
          source: '/:path+',
          has: [{ type: 'host', value: 'www.intheamber.com' }],
          destination: '/amber/:path+',
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
