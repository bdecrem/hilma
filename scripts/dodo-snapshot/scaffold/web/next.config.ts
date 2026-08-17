import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    return [
      // Universal-link manifest for the iOS app — Apple fetches this exact
      // path on your domain. Harmless if you don't use universal links.
      {
        source: '/.well-known/apple-app-site-association',
        destination: '/api/f2/aasa',
      },
    ]
  },
}

export default nextConfig
