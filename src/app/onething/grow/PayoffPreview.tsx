'use client';

import { useRouter } from 'next/navigation';
import { MILESTONES, pointsForEntry } from '@/lib/onething/levels';
import Payoff from '../Payoff';

/// The points an unbroken run of `n` days earns, milestone bonuses included.
function pointsAfter(n: number): number {
  let pts = 0;
  for (let k = 1; k <= n; k++) { const { base, bonus } = pointsForEntry(k); pts += base + bonus; }
  return pts;
}

export default function PayoffPreview({ streak }: { streak: number }) {
  const router = useRouter();
  return <Payoff streak={streak} bonus={MILESTONES[streak] ?? 0} points={pointsAfter(streak)} onClose={() => router.push('/onething')} />;
}
