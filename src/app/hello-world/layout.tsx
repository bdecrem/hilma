import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Hello, world',
  description: 'Built on the mini, shipped to Vercel.',
};

export const viewport: Viewport = {
  themeColor: '#0b0f14',
};

export default function HelloWorldLayout({ children }: { children: React.ReactNode }) {
  return children;
}
