import type { Metadata, Viewport } from 'next'
import { Inter, Source_Serif_4 } from 'next/font/google'
import './socratic.css'

// The tutor speaks in a serif; the interface in a quiet sans.
const serif = Source_Serif_4({ subsets: ['latin'], weight: ['400', '500', '600'], style: ['normal', 'italic'], variable: '--font-serif' })
const sans = Inter({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-sans' })

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
