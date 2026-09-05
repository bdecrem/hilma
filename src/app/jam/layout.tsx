import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Jambot — talk to a groovebox',
  description:
    'Describe a beat, hear it in seconds, tweak it with sliders, save it as an MP3. Jambot in your browser.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#0d0e12',
}

export default function JamLayout({ children }: { children: React.ReactNode }) {
  return children
}
