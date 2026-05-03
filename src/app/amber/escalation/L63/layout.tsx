import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'L63 — look through it',
  description: 'a glass marble refracting a cloud field. drag to roll, tap to nudge.',
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function L63Layout({ children }: { children: React.ReactNode }) {
  return children
}
