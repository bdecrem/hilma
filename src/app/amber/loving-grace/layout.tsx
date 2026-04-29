import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'amber · loving grace',
  description: 'all watched over by machines of loving grace.',
}

export const viewport: Viewport = {
  themeColor: '#1A110A',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
