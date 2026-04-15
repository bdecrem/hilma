import type { Metadata, Viewport } from 'next'
import bakedToday from '../../../../data/amber-noon/2026-04-14.json'
import type { NoonRun } from './generator'

const run = bakedToday as NoonRun

const title = `noon · ${run.date}`
const description = `${run.winner.concept} — ${run.winner.blurb.toLowerCase()}`

// Palette bg (matches page). Keeps the URL bar tinted on mobile.
const PALETTE_BG: Record<string, string> = {
  night:   '#0A0A0A',
  hearth:  '#1A110A',
  ink:     '#0C1424',
  petrol:  '#0A1C1A',
  bruise:  '#150826',
  oxblood: '#1C0808',
}

export const viewport: Viewport = {
  themeColor: PALETTE_BG[run.mood.palette] ?? '#0A0A0A',
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    type: 'website',
    siteName: 'amber',
  },
  twitter: {
    card: 'summary_large_image',
    creator: '@intheamber',
    title,
    description,
  },
}

export default function NoonLayout({ children }: { children: React.ReactNode }) {
  return children
}
