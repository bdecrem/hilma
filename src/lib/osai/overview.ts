// The Public Benefit AI overview: eight kinds of work, ranked by room left.
// One source for the /osai/overview page and for the assistant's grounding.
// Facts as of 2026-10-02; the long form is apps/osai/content/map.md.

export type Room = 1 | 2 | 3 | 4 | 5

export type OverviewRow = {
  box: number
  name: string
  tier: 'Build' | 'Steer' | 'Apply' | 'Everywhere'
  why: string
  examples: string
  room: Room
  label: string
  mozilla: 'yes' | 'barely' | 'no'
  hai: boolean
}

export const OVERVIEW_ROWS: OverviewRow[] = [
  {
    box: 3,
    name: 'AI products made for the public',
    tier: 'Build',
    why: 'Apps and assistants that a public-interest group actually ships to people. Today there are almost none.',
    examples: "Firefox's new AI window, Khanmigo, the Public AI chat utility",
    room: 5,
    label: 'Wide open',
    mozilla: 'barely',
    hai: false,
  },
  {
    box: 2,
    name: 'Shared data, computers, and scorekeeping',
    tier: 'Build',
    why: 'The plumbing everyone else relies on, and nobody funds as such. Independent scorekeeping is shrinking.',
    examples: "Common Crawl, Mozilla Data Collective, Stanford's AI Index",
    room: 4,
    label: 'Mostly open',
    mozilla: 'yes',
    hai: true,
  },
  {
    box: 5,
    name: "AI's effect on jobs, rights, and democracy",
    tier: 'Steer',
    why: 'Plenty of policy shops. Almost nobody measuring what AI does to work, or asking what people will do all day.',
    examples: 'AI Now, Stanford Digital Economy Lab, Partnership on AI',
    room: 3,
    label: 'Half full',
    mozilla: 'yes',
    hai: true,
  },
  {
    box: 1,
    name: 'Open AI models anyone can rebuild',
    tier: 'Build',
    why: 'Lots of free-to-download models from companies. Only one nonprofit effort, Apertus in Switzerland, scaled this year.',
    examples: "Ai2's OLMo, Apertus, EleutherAI",
    room: 3,
    label: 'Half full',
    mozilla: 'yes',
    hai: true,
  },
  {
    box: 8,
    name: 'The money, and the people to run programs',
    tier: 'Everywhere',
    why: 'Billions pledged, little spent. The shortage is operators and grantmakers, not dollars.',
    examples: 'Humanity AI, Current AI, Coefficient Giving',
    room: 3,
    label: 'Half full',
    mozilla: 'yes',
    hai: true,
  },
  {
    box: 7,
    name: 'AI for schools, government, and news',
    tier: 'Apply',
    why: 'Real operators exist, but the AI labs pay for most of it and set the agenda.',
    examples: 'Khan Academy, Code for America, Common Sense Media',
    room: 2,
    label: 'Getting crowded',
    mozilla: 'no',
    hai: true,
  },
  {
    box: 6,
    name: 'AI for science and medicine',
    tier: 'Apply',
    why: 'The second-best-funded area. What is missing is proof that the tools work where they are deployed.',
    examples: 'Arc Institute, Open Athena, Gates Foundation',
    room: 1,
    label: 'Packed',
    mozilla: 'no',
    hai: true,
  },
  {
    box: 4,
    name: 'Making AI safe',
    tier: 'Steer',
    why: 'The best-funded area by far, around $1.5 billion a year in philanthropy. The bottleneck is senior people, not money.',
    examples: 'METR, the UK AI Security Institute, Coefficient Giving',
    room: 1,
    label: 'Packed',
    mozilla: 'no',
    hai: false,
  },
]

export const TAKEAWAYS: { title: string; text: string }[] = [
  {
    title: 'The emptiest box is the one Mozilla was built for.',
    text: 'Firefox once broke a monopoly with a product people chose. No public-interest group ships an AI product at that scale today.',
  },
  {
    title: 'Money is piling up where people are scarce.',
    text: 'Safety and science have billions. Across the whole field, the shortage is people who can run programs and make grants.',
  },
  {
    title: 'Nobody owns the "now what" question.',
    text: 'What people do all day once intelligence is abundant has no institution behind it. It sits between boxes.',
  },
]

/** Plain text of the overview, for the assistant's system prompt. */
export function overviewText(): string {
  const rows = OVERVIEW_ROWS.map(
    (r, i) =>
      `${i + 1}. ${r.name} (box ${r.box}, ${r.tier}). Room to work: ${r.room}/5, ${r.label}. ${r.why} Examples: ${r.examples}. Mozilla present: ${r.mozilla}. Stanford HAI present: ${r.hai ? 'yes' : 'no'}.`,
  )
  const takes = TAKEAWAYS.map((t) => `- ${t.title} ${t.text}`)
  return `Eight kinds of public-benefit AI work, ranked by how much room is left (most room first):\n${rows.join('\n')}\n\nThree takeaways:\n${takes.join('\n')}`
}
