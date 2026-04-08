import type { Viewport } from 'next'

export const viewport: Viewport = {
  themeColor: '#FFB347',
}

export default function L32Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
