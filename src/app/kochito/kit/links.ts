// The board's sidebar: the things Bart opens. Public addresses only live here (this repo is public);
// the notes come from the journal's "Active project" links (private, edited in JOURNAL.md) and are
// shown inside the board by /notes/<slug>. A link with url null is shown as "coming".
// Edit this list to add or move a link; Bart, 2026-11-17: "key links in the sidebar".
export type SideLink = { name: string; url: string | null; note?: string }
export const OPEN: SideLink[] = [
  { name: 'The web app', url: 'https://app.ola.cx', note: 'app.ola.cx' },
  { name: 'The landing page', url: 'https://ola.cx', note: 'ola.cx' },
  { name: 'The Mac app', url: 'https://ola.cx/ola-site/mac/Ola-0.1-2.dmg', note: 'signed download, unlisted' },
  { name: 'TestFlight', url: null, note: 'coming: Apple’s agreement is signed, the iPhone app is on its way' },
]
export const CODE: SideLink[] = [{ name: 'The code', url: 'https://github.com/bdecrem/hilma', note: 'github.com/bdecrem/hilma' }]
// Ola's by link only: never changed from here.
export const ALSO: SideLink[] = [
  { name: 'The Adaptation Almanac', url: 'https://almanac.tunn3l.sh/almanac/', note: 'Frances' },
  { name: 'The migrant rights library', url: 'https://ola.cx/mrd', note: 'Ian' },
]
