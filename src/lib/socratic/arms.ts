// The study arms. Same doctrine, same student, three tutors.
//
//   A  Assistant — a helpful law tutor that explains and answers directly.
//                  No method. The control.
//   B  Socratic  — the study script: overview → readiness → questioning
//                  → mastery, with Zeiler's nine moves enforced by the
//                  tutor itself.
//   C  Socratic + coach — B, plus a second agent (the observer) reads
//                  each student message first and tells the tutor which
//                  move the method calls for. The multi-agent variant.
//
// The observer runs in every arm (its verdicts are the measurement); only
// in C does the tutor see them.

import type { Arm } from './types'

export const ARMS: Arm[] = ['A', 'B', 'C']

export const ARM_INFO: Record<Arm, { name: string; blurb: string; socratic: boolean; coached: boolean }> = {
  A: { name: 'Assistant', blurb: 'Explains the doctrine and answers questions directly.', socratic: false, coached: false },
  B: { name: 'Socratic', blurb: 'Runs the session the way Professor Zeiler runs class.', socratic: true, coached: false },
  C: { name: 'Socratic + coach', blurb: 'Socratic, with a second agent steering each move.', socratic: true, coached: true },
}

export function isArm(x: unknown): x is Arm {
  return x === 'A' || x === 'B' || x === 'C'
}
