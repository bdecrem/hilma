import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'shed — amber',
  description: 'cut the wires. keep the warmth.',
  openGraph: {
    title: 'shed',
    description: 'cut the wires. keep the warmth.',
    siteName: 'amber',
    url: 'https://intheamber.com/amber/shed',
    type: 'website',
    images: ['https://intheamber.com/amber/shed/opengraph-image'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'shed',
    description: 'cut the wires. keep the warmth.',
    creator: '@intheamber',
    images: ['https://intheamber.com/amber/shed/opengraph-image'],
  },
}

// Starts dark grey, so match that for the Safari URL bar
export const viewport: Viewport = {
  themeColor: '#282830',
}

export default function ShedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
