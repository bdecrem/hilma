import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Hello, world',
  description: 'Built on the mini, shipped to Vercel.',
};

export const viewport: Viewport = {
  themeColor: '#ff69b4',
};

export default function HelloWorldLayout({ children }: { children: React.ReactNode }) {
  return children;
}
