import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    return {
      beforeFiles: [
        // www.decremental.com serves the /projects page at its root
        {
          source: '/',
          has: [{ type: 'host', value: 'www.decremental.com' }],
          destination: '/projects',
        },
      ],
      afterFiles: [],
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
