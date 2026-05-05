import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'current — dub techno study',
  description:
    "L64's curl-noise streamlines paired with a 116 BPM dub techno loop in C minor. Cm9 / Fm7 / Gm7 / Abmaj7 chord stabs through a 3/16-note delay chain with lowpass-in-feedback. drag rides the master filter; tap drops a stab.",
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function CurrentLayout({ children }: { children: React.ReactNode }) {
  return children
}
