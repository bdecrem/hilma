import type { Viewport } from 'next'

export const viewport: Viewport = {
  themeColor: '#FF4E50',
}

export default function SiphonLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
