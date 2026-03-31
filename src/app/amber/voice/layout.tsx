import type { Viewport } from 'next'

export const viewport: Viewport = {
  themeColor: '#1A1A2E',
}

export default function VoiceLayout({ children }: { children: React.ReactNode }) {
  return children
}
