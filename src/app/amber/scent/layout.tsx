import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'scent — dub techno for L66',
  description:
    "L66's Physarum slime-mold simulation paired with a 120 BPM dub techno track in C minor. drag rides the master filter and steers the agents; tap drops a chord stab and scatters fresh agents.",
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function ScentLayout({ children }: { children: React.ReactNode }) {
  return children
}
