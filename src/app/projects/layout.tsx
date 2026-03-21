import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'decremental',
  description: 'things i\'m building',
  openGraph: {
    title: 'decremental',
    description: 'things i\'m building',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'decremental',
    description: 'things i\'m building',
  },
}

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return children
}
