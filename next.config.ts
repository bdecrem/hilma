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
