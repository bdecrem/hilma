import type { Metadata } from 'next';
import AltJournal from './AltJournal';

// An unlisted experiment (2026-09-23): the same month, with the doodles in
// the margins of a ruled notebook instead of under each sentence.
export const metadata: Metadata = { title: 'onething · margins', robots: { index: false, follow: false } };

export default function AltPage() {
  return <AltJournal />;
}
