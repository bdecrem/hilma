import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Sans, Source_Serif_4 } from 'next/font/google'
import { DISPLAY, getOsaiUser } from '@/lib/osai/auth'
import Login from './Login'
import Shell from './Shell'
import './osai.css'

const serif = Source_Serif_4({
  subsets: ['latin'],
  weight: ['400', '600'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
})
const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'osai',
  description: 'Open Source AI and the public-benefit AI map: working notes for a conversation.',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f4f5f7',
}

export default async function OsaiLayout({ children }: { children: React.ReactNode }) {
  const user = await getOsaiUser()
  return (
    <div className={`osai ${serif.variable} ${sans.variable}`}>
      {user ? <Shell user={user} name={DISPLAY[user]}>{children}</Shell> : <Login />}
    </div>
  )
}
