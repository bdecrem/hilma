import type { Metadata, Viewport } from 'next';
import './onething.css';

export const metadata: Metadata = {
  title: '1thing',
  description: 'One sentence a day, by text. 365 cells. Fill one a day.',
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function OnethingLayout({ children }: { children: React.ReactNode }) {
  return <div className="ot">{children}</div>;
}
