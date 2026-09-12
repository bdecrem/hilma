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
