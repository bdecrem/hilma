import type { Viewport } from 'next'

export const viewport: Viewport = {
  themeColor: '#FFF8E7',
}

export default function ErosionLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
