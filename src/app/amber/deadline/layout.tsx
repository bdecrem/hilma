import type { Viewport } from 'next'

export const viewport: Viewport = {
  themeColor: '#FFF8E7',
}

export default function DeadlineLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
