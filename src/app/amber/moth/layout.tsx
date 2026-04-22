import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'moth — amber',
  description: 'drawn to the light',
  openGraph: {
    title: 'moth',
    description: 'drawn to the light',
    url: 'https://intheamber.com/amber/moth',
  },
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  viewportFit: 'cover',
}

export default function MothLayout({ children }: { children: React.ReactNode }) {
  return children
}
