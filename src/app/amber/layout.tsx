import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'amber',
  description: 'things amber made',
}

export default function AmberLayout({ children }: { children: React.ReactNode }) {
  return children
}
