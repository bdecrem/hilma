import type { Viewport } from 'next'

export const viewport: Viewport = {
  themeColor: '#FFEED2',
}

export default function ColorscapeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
