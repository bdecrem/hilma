import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './socratic.css'

// The tutor speaks in a serif; the interface in a quiet sans.
const serif = localFont({
  src: [
    { path: '../../fonts/source-serif-4/SourceSerif4.woff2', style: 'normal' },
    { path: '../../fonts/source-serif-4/SourceSerif4-Italic.woff2', style: 'italic' },
  ],
  weight: '200 900',
  variable: '--font-serif',
})
const sans = localFont({ src: '../../fonts/inter/Inter.woff2', weight: '100 900', variable: '--font-sans' })

export const metadata: Metadata = {
  title: 'Socratic — a study session',
  description:
    'A one-on-one Socratic study session on negligent entrustment, modelled on Professor Kathryn Zeiler\'s Torts class: the doctrine, then a hard hypothetical you have to argue through. A list of facts is never an argument.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#f3eee4',
}

export default function SocraticLayout({ children }: { children: React.ReactNode }) {
  return <div className={`soc ${serif.variable} ${sans.variable}`}>{children}</div>
}
