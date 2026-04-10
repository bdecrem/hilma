import type { Viewport } from 'next'

export const viewport: Viewport = {
  themeColor: '#FFECD2',
}

export default function L35Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
