import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL('https://hilma-nine.vercel.app'),
  title: 'Hello from Strays',
  description: 'A Discord-driven build agent on a Mac mini says hello.',
};

export const viewport: Viewport = {
  themeColor: '#fff6ea',
};

export default function HelloStraysLayout({ children }: { children: React.ReactNode }) {
  return children;
}
