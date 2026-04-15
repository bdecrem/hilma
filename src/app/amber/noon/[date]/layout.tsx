import type { Metadata, Viewport } from 'next'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { NoonRun } from '../generator'

// Palette bg (matches page). Keeps the URL bar tinted on mobile.
const PALETTE_BG: Record<string, string> = {
  night:   '#0A0A0A',
  hearth:  '#1A110A',
  ink:     '#0C1424',
  petrol:  '#0A1C1A',
  bruise:  '#150826',
  oxblood: '#1C0808',
}

function loadRun(date: string): NoonRun | null {
  try {
    const p = join(process.cwd(), 'public', 'amber-noon', `${date}.json`)
    return JSON.parse(readFileSync(p, 'utf8')) as NoonRun
  } catch {
    return null
  }
}

export async function generateViewport({ params }: { params: Promise<{ date: string }> }): Promise<Viewport> {
  const { date } = await params
  const run = loadRun(date)
  return {
    themeColor: run ? (PALETTE_BG[run.mood.palette] ?? '#0A0A0A') : '#0A0A0A',
    viewportFit: 'cover',
  }
}

export async function generateMetadata({ params }: { params: Promise<{ date: string }> }): Promise<Metadata> {
  const { date } = await params
  const run = loadRun(date)
  const title = run ? `noon · ${run.date}` : `noon · ${date}`
  const description = run
    ? `${run.winner.concept} — ${run.winner.blurb.toLowerCase()}`
    : "amber's daily baked piece"
  return {
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
}

export default function NoonDateLayout({ children }: { children: React.ReactNode }) {
  return children
}
