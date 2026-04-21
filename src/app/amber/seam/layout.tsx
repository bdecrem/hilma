import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'seam — amber',
  description: 'where they meet',
  openGraph: {
    title: 'seam',
    description: 'where they meet',
    url: 'https://intheamber.com/amber/seam',
  },
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  viewportFit: 'cover',
}

export default function SeamLayout({ children }: { children: React.ReactNode }) {
  return children
}
