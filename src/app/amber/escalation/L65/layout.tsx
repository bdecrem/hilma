import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'L65 — let it grow',
  description: 'Gray-Scott reaction-diffusion. ping-pong FBO simulation: cells form, divide, evolve. drag to seed; tap to perturb the chemistry.',
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function L65Layout({ children }: { children: React.ReactNode }) {
  return children
}
