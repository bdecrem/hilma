import type { Metadata, Viewport } from 'next'
import FeyndThemeProvider from './(authed)/FeyndThemeProvider'
import './feynd-tokens.css'

export const metadata: Metadata = {
  title: 'Dodo',
  description: 'Learn anything.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0E0C0B',
}

export default function F2Layout({ children }: { children: React.ReactNode }) {
  // Theme provider lives at the /f2 root so login + signup get the same
  // light/dark tokens as the authed surfaces.
  return <FeyndThemeProvider>{children}</FeyndThemeProvider>
}
