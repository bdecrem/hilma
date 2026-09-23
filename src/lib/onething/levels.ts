// Levels are earned on cumulative points, so a broken streak never demotes you.
// Shared by the server (scoring) and the client (the ladder on the page), so it
// must stay free of server-only imports.
export type Level = { name: string; min: number }

export const LEVELS: Level[] = [
  { name: 'Seed', min: 0 },
  { name: 'Sprout', min: 40 },
  { name: 'Sapling', min: 150 },
  { name: 'Tree', min: 400 },
  { name: 'Grove', min: 1000 },
  { name: 'Forest', min: 2500 },
  { name: 'Old Growth', min: 6000 },
]

/// What a kept day is worth: 10 + 2 per streak day (capped at 25 days), plus a
/// milestone bonus on the day a streak reaches 3, 7, 14, 30, 60, 100 or 365.
/// Here rather than in core.ts because the page shows what tomorrow earns.
export const MILESTONES: Record<number, number> = {
  3: 20, 7: 50, 14: 100, 30: 300, 60: 600, 100: 1000, 365: 5000,
}

export function pointsForEntry(streak: number): { base: number; bonus: number } {
  const base = 10 + 2 * Math.min(streak, 25)
  const bonus = MILESTONES[streak] ?? 0
  return { base, bonus }
}

/// The points an unbroken run of `n` days earns, milestone bonuses included.
export function pointsAfterRun(n: number): number {
  let pts = 0
  for (let k = 1; k <= n; k++) { const { base, bonus } = pointsForEntry(k); pts += base + bonus }
  return pts
}
