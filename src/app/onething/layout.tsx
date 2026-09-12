import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Onething',
  description: 'One sentence a day. Texted to you at 10, kept for good, with a streak.',
};

export const viewport: Viewport = {
  themeColor: '#f6f1e7',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function OnethingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
