import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './smallgpt.css'

const display = localFont({ src: '../../fonts/bricolage-grotesque/BricolageGrotesque.woff2', weight: '200 800', variable: '--font-display' })
const body = localFont({ src: '../../fonts/instrument-sans/InstrumentSans.woff2', weight: '400 700', variable: '--font-body' })
const mono = localFont({ src: '../../fonts/jetbrains-mono/JetBrainsMono.woff2', weight: '100 800', variable: '--font-mono' })

export const metadata: Metadata = {
  metadataBase: new URL('https://ola.cx'),
  title: 'smallgpt — building a GPT, one step at a time',
  description:
    'Bart builds a complete GPT at toy scale and touches every mechanism along the way: backpropagation, the tokenizer, attention, pretraining, SFT, DPO, RLVR. Fourteen steps, one at a time.',
  openGraph: { url: 'https://ola.cx/smallgpt' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f7efdf',
}

export default function SmallGptLayout({ children }: { children: React.ReactNode }) {
  return <div className={`sg ${display.variable} ${body.variable} ${mono.variable}`}>{children}</div>
}
