import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL('https://hilma-nine.vercel.app'),
  title: 'Openlab',
  description: 'A small open model on a Mac mini, running on our own rules.',
};

export const viewport: Viewport = {
  themeColor: '#fff6ea',
};

export default function OpenlabLayout({ children }: { children: React.ReactNode }) {
  return children;
}
