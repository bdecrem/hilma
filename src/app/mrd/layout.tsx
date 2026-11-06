import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './mrd.css'

const serif = localFont({
  src: [
    { path: '../../fonts/source-serif-4/SourceSerif4.woff2', style: 'normal' },
    { path: '../../fonts/source-serif-4/SourceSerif4-Italic.woff2', style: 'italic' },
  ],
  weight: '200 900',
  variable: '--font-source-serif-4', display: 'swap',
})
const sans = localFont({ src: '../../fonts/inter-tight/InterTight.woff2', weight: '100 900', variable: '--font-inter-tight', display: 'swap' })
const mono = localFont({ src: '../../fonts/jetbrains-mono/JetBrainsMono.woff2', weight: '100 800', variable: '--font-jetbrains-mono', display: 'swap' })

export const metadata: Metadata = {
  metadataBase: new URL('https://ola.cx'),
  title: 'MRD · source law crawl',
  description: 'Live progress: tracing every statute, regulation and court decision the Migrant Rights Database cites, across 45 countries.',
  robots: { index: false, follow: false },
  openGraph: { url: 'https://ola.cx/mrd', title: 'MRD · source law crawl', description: 'Tracing every law the Migrant Rights Database cites, live.' },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f1e8' },
    { media: '(prefers-color-scheme: dark)', color: '#14120e' },
  ],
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className={`mrd ${serif.variable} ${sans.variable} ${mono.variable}`}>{children}</div>
}
