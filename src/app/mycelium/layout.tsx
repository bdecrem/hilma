import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Mycelium',
  description:
    'A slime mould in your pocket. Thirty thousand agents with no plan, growing a living network. Drag to feed it. Double-tap to mutate.',
};

export const viewport: Viewport = {
  themeColor: '#05030a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function MyceliumLayout({ children }: { children: React.ReactNode }) {
  return children;
}
