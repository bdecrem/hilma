import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'amber · cradle',
  description: "Newton's cradle. knock the first one. they all answer.",
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function CradleLayout({ children }: { children: React.ReactNode }) {
  return children
}
