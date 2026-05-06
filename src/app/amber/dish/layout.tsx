import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'dish — a slow weather of cells',
  description:
    "L65's Gray-Scott chemistry as a non-interactive video. mitosis morphology, auto-reignites every ~38s. paired with an Eno-style ambient drone in A minor.",
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function DishLayout({ children }: { children: React.ReactNode }) {
  return children
}
