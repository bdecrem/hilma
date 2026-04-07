import type { Viewport } from 'next'

export const viewport: Viewport = {
  themeColor: '#0D3B66',
}

export default function SignalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
