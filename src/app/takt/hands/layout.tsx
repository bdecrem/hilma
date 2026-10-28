import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL('https://ola.cx'),
  title: 'Takt · Hands',
  description:
    'Six hand concepts for Takt’s scale lessons: one SVG each, five addressable fingers, a thumb that tucks under.',
  openGraph: {
    title: 'Takt · Hands',
    description: 'Six hand concepts for the scale lessons, with the finger highlights and the thumb tuck live.',
    url: 'https://ola.cx/takt/hands',
  },
};

export const viewport: Viewport = {
  themeColor: '#0d0d0d',
};

export default function TaktHandsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
