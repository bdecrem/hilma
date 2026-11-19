// The menu's links out of the board (round three, 2026-11-18): "Talk to Kit" and "Quick links",
// below the pages, drawn smaller with an arrow. Public addresses only live here (this repo is
// public). The Mac app's address is read at render from https://ola.cx/ola-site/mac/latest.json
// (macLatest in src/lib/venture/board.ts), never typed here. A link with url null shows as "coming".
export type SideLink = { name: string; url: string | null; note?: string }
export const talk = (q: string): SideLink[] => [
  { name: 'Leave a voice note', url: `https://ola.cx/venture/memo${q}` },
  { name: 'Talk it through', url: `https://ola.cx/venture/talk${q}` },
  { name: 'Answer my questions', url: `https://ola.cx/venture/call/checkin${q}` },
]
export const quick = (mac: { url: string; version: string } | null): SideLink[] => [
  { name: 'The web app', url: 'https://app.ola.cx' },
  { name: 'The landing page', url: 'https://ola.cx' },
  { name: 'The Mac app', url: mac?.url ?? 'https://ola.cx', note: mac ? mac.version : 'from the landing page' },
  { name: 'TestFlight', url: null, note: 'coming' },
  { name: 'The code', url: 'https://github.com/bdecrem/hilma' },
  { name: 'The Adaptation Almanac', url: 'https://almanac.tunn3l.sh/almanac/' },
  { name: 'The migrant rights library', url: 'https://ola.cx/mrd' },
]
