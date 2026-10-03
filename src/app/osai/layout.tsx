import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, Instrument_Sans, JetBrains_Mono } from 'next/font/google'
import { DISPLAY, getOsaiUser } from '@/lib/osai/auth'
import { hasPassword } from '@/lib/osai/password'
import Login from './Login'
import Shell from './Shell'
import './osai.css'

const display = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
})
const sans = Instrument_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
  display: 'swap',
})
const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
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
  themeColor: '#0f1115',
}

// Applies the saved theme before first paint (dark is the default).
const THEME_SCRIPT = `try{var t=localStorage.getItem('osai:theme');if(t==='light')document.documentElement.setAttribute('data-osai-theme','light')}catch(e){}`

export default async function OsaiLayout({ children }: { children: React.ReactNode }) {
  const user = await getOsaiUser()
  const own = user ? await hasPassword(user) : false
  return (
    <div className={`osai ${display.variable} ${sans.variable} ${mono.variable}`}>
      <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      {user ? <Shell name={DISPLAY[user]} hasPassword={own}>{children}</Shell> : <Login />}
    </div>
  )
}
