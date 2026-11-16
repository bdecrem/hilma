// Made-up project data for the dev server: the eviction-report project from the design mocks
// (~/Desktop/ola-brand/app/structure/3-things). Every name, building and number is invented.
// The real front desk serves the same shape from the platform database.
export const fixture = {
  project: {
    id: 'spring-eviction-report',
    name: 'Spring eviction report',
    group: 'North District Tenants’ Union',
    people: ['you', 'Dana'],
    filesUploaded: 0,
  },
  // How many people are working on the machine right now (never who).
  machine: { working: 3, capacity: 4 },
  things: [
    {
      kind: 'dashboard',
      id: 'court-watch',
      title: 'Court-watch',
      byline: { madeBy: 'bart', when: '2026-11-09T09:00:00Z', from: ['hearings.csv'] },
      state: 'ready',
      live: true,
      cadence: 'updated Mondays',
      heading: 'Eviction hearings in the North District court',
      dek: 'October 6 to November 7, from the notes of nine volunteers who sat in.',
      stats: [
        { value: '212', label: 'hearings watched' },
        { value: '61%', label: 'of tenants had no lawyer' },
        { value: '38', label: 'cases put off to a later date' },
      ],
      series: {
        label: 'Hearings watched, by week',
        points: [
          { label: 'Oct 6', value: 44 },
          { label: 'Oct 13', value: 52 },
          { label: 'Oct 20', value: 49 },
          { label: 'Oct 27', value: 17 },
          { label: 'Nov 3', value: 50 },
        ],
        note: 'The week of October 27 has notes from two volunteers instead of the usual seven or eight.',
      },
      breakdown: {
        label: 'How the hearings ended',
        rows: [
          { label: 'Judgment for the landlord', value: 97 },
          { label: 'Put off to a later date', value: 38 },
          { label: 'Settled in the hallway', value: 44 },
          { label: 'Dismissed', value: 33 },
        ],
      },
    },
    {
      kind: 'document',
      id: 'report-draft-3',
      title: 'The report, draft 3',
      byline: { madeBy: 'group', who: 'Ruth, Dana and Ola', when: '2026-11-15T21:12:00Z', from: ['survey.csv'] },
      state: 'ready',
      formats: ['Word', 'PDF'],
      heading: 'Spring eviction report',
      dek: 'Evictions in the North District, from 412 doors, 18 interviews and 212 court hearings.',
      sections: [
        {
          heading: '1 Who is being evicted',
          paragraphs: [
            'Of the 412 households we reached door to door, 97 had received an eviction notice in the past year. Most of them pay more than half their income in rent: 71 of the 97.',
            'The notices are not spread evenly. Five buildings account for 62 of the 97.',
          ],
        },
        { heading: '2 Repairs before notices', paragraphs: [], pending: true },
        {
          heading: '3 What the ordinance allows',
          paragraphs: ['Section 14 bars a rent increase for twelve months after a tenant reports a code violation.'],
        },
      ],
    },
    {
      kind: 'chart',
      id: 'what-tenants-describe',
      title: 'What tenants describe',
      byline: { madeBy: 'ola', when: '2026-11-03T15:00:00Z', from: ['interviews/'] },
      state: 'ready',
      bars: [
        { label: 'No heat or hot water', value: 7 },
        { label: 'Mold or leaks', value: 6 },
        { label: 'Notice within a month of a complaint', value: 5 },
        { label: 'Rent raised after a repair request', value: 4 },
      ],
      of: 18,
      unit: 'interviews',
    },
    {
      kind: 'table',
      id: 'rent-burden',
      title: 'Rent burden by building',
      byline: { madeBy: 'ola', when: '2026-11-10T15:00:00Z', from: ['survey.csv'] },
      state: 'ready',
      file: null,
      columns: [{ label: 'Building' }, { label: 'Homes', numeric: true }, { label: 'Notices', numeric: true }, { label: 'Rent > ½', numeric: true }],
      rows: [
        ['Alder Court', '64', '19', '58%'],
        ['Kestrel Arms', '41', '14', '61%'],
        ['Linden Place', '52', '12', '49%'],
        ['Marlow House', '30', '9', '55%'],
        ['Birch Tower', '88', '8', '34%'],
      ],
      note: '38 buildings; the five with the most notices.',
    },
    {
      kind: 'site',
      id: 'know-your-rights',
      title: 'Know your rights, one page',
      byline: { madeBy: 'you', when: '2026-11-12T18:30:00Z', from: ['ordinance-2024.pdf'] },
      state: 'ready',
      visibility: 'private',
      pages: 1,
      summary: 'What Section 14 means for a tenant who reported a repair, in English and Spanish.',
    },
  ],
}
