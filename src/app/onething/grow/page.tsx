import type { Metadata } from 'next';
import PayoffPreview from './PayoffPreview';

// onething.ink/grow?streak=7 — the milestone payoff for any streak length,
// with the points an unbroken run of that length earns. Unlisted: for review
// and the Playwright harness. The real thing plays on the journal page on the
// day a streak reaches a milestone.
export const metadata: Metadata = { title: 'onething — a milestone', robots: { index: false, follow: false } };

export default async function GrowPage({ searchParams }: { searchParams: Promise<{ streak?: string }> }) {
  const { streak } = await searchParams;
  const n = Math.max(1, Math.min(3650, Math.floor(Number(streak)) || 7));
  return <PayoffPreview streak={n} />;
}
