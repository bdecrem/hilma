'use client';

import { useRouter } from 'next/navigation';
import { MILESTONES, pointsAfterRun } from '@/lib/onething/levels';
import Payoff from '../Payoff';

export default function PayoffPreview({ streak }: { streak: number }) {
  const router = useRouter();
  return <Payoff streak={streak} bonus={MILESTONES[streak] ?? 0} points={pointsAfterRun(streak)} onClose={() => router.push('/onething')} />;
}
