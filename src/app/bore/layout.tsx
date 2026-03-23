import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'bore — tunnel service for AI agents',
  description: 'Expose localhost to the internet. One command. No config. Built for AI agents.',
}

export default function BoreLayout({ children }: { children: React.ReactNode }) {
  return children
}
