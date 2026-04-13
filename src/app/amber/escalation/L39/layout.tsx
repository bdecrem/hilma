import type { Viewport } from 'next'

export const viewport: Viewport = {
  themeColor: '#140C08',
}

export default function L39Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
