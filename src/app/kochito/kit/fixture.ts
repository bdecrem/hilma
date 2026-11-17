import type { Area, BoardData, Issue } from '@/lib/venture/board'

// Made-up data for designing the board (/kochito/kit/mock on a dev server only). Nothing here is
// real: the titles, numbers and decisions are invented so the page can be looked at with a full day.
const T = (d: string, h: number, m = 0) => new Date(Date.parse(`${d}T00:00:00Z`) + (h + 8) * 3600e3 + m * 60e3).toISOString() // Pacific (PST) h:m
const DONE: [string, Area, string, string, number][] = [
  ['2026-11-18', 'web', 'The web app remembers which project you had open', '28 of 28 checks', 9],
  ['2026-11-18', 'security', 'A shared link to a page stops working after an hour', 'a proof test; review six', 8],
  ['2026-11-18', 'apps', 'Your phone app shows a badge when Ola needs a yes', 'on your phone, by hand', 7],
  ['2026-11-18', 'model', 'Ola checks its totals before answering a counting question', '11 of 12 runs, was 6 of 12', 6],
  ['2026-11-18', 'ops', 'The mini restarts its practice copy in under a minute after a power cut', 'pulled the plug twice', 5],
  ['2026-11-17', 'web', 'Uploading a folder keeps its subfolders', '412 checks at the update', 23],
  ['2026-11-17', 'web', 'The sign-in page explains a mistyped name instead of saying "error"', 'a first-time user walk', 22],
  ['2026-11-17', 'design', 'The settings page uses the same type sizes as the rest of the app', 'before-and-after pictures', 21],
  ['2026-11-17', 'model', 'A skill for making a chart from a spreadsheet, measured with and without', '9 of 10 with, 4 of 10 without', 20],
  ['2026-11-17', 'security', 'A file name with a slash can no longer reach outside its project', 'a proof test', 19],
  ['2026-11-17', 'apps', 'The Mac app reopens where you left it', '6 of 6', 18],
  ['2026-11-17', 'ops', 'A text to your phone when the disk is nearly full', 'a forced test reached your phone', 16],
  ['2026-11-17', 'voice', 'Every voice call ends with a short summary on the board', '14 of 14', 14],
  ['2026-11-17', 'web', 'A long answer no longer jumps while it is being written', 'by hand in Safari', 13],
  ['2026-11-17', 'model', 'The test set gains ten harder tasks with scanned pages', 'stand-in 7 of 10, Claude 9 of 10', 11],
  ['2026-11-17', 'board', 'The board shows how old each part is', 'the board check', 10],
  ['2026-11-17', 'security', 'Review six: two faults in the upload path, both fixed', 'fixes live, 409 checks', 4],
  ['2026-11-17', 'apps', 'Dark mode in the phone app follows the system', 'on your phone', 3],
  ['2026-11-16', 'web', 'A project home lists only real things', '41 of 41', 20],
  ['2026-11-16', 'ops', 'The practice copy changes only through one update command', '34 of 34', 14],
  ['2026-11-16', 'security', 'Each project runs in its own sealed box with no network', '55 of 55 on the mini', 11],
  ['2026-11-16', 'model', 'A first test set of 24 tasks and a Claude baseline', 'stand-in 46 of 48, Claude 48 of 48', 15],
  ['2026-11-16', 'apps', 'Your Mac app, first version', '13 of 13', 17],
  ['2026-11-15', 'design', "Ola's name and look chosen", 'your pick', 19],
]
const issue = (num: number, f: Partial<Issue> & Pick<Issue, 'title' | 'area'>): Issue => ({ id: `OLA-${num}`, num, what: '', priority: 'P1', status: 'done', who: 'builders', week: null, opened_at: T('2026-11-16', 9), started_at: null, finished_at: null, day: null, links: [], proof: '', commits: [], ...f })

export function fixture(): BoardData {
  const now = T('2026-11-18', 11, 40)
  const done = DONE.map(([day, area, title, proof, h], n) =>
    issue(200 - n, { title, area, proof, day, status: n === 9 ? 'dropped' : 'done', opened_at: T(day, Math.max(0, h - 3)), started_at: T(day, Math.max(0, h - 2)), finished_at: T(day, h, (n * 7) % 60), week: n % 3 === 0 ? 1 : null, what: 'Made-up example: one or two sentences on what changed and why it mattered.', commits: [{ sha: `a1b2c3d4e5f6${String(n).padStart(4, '0')}`, subject: `ola web: a made-up commit for ${title.toLowerCase()}`, at: T(day, h) }] }),
  )
  const plate = [
    issue(210, { title: 'Sign-in with a name and a password, a passkey optional', area: 'web', priority: 'P0', status: 'in_progress', who: 'builder 1', started_at: T('2026-11-18', 8, 10), week: 1 }),
    issue(211, { title: 'The Mac app for anyone with an account, with a usage cap', area: 'apps', priority: 'P0', status: 'in_progress', who: 'builder 2', started_at: T('2026-11-18', 7, 30), week: 1 }),
    issue(212, { title: 'A designer skill for pages and app screens, measured with and without', area: 'model', priority: 'P0', status: 'in_progress', who: 'builder 3', started_at: T('2026-11-17', 21, 5) }),
    issue(213, { title: 'Accept the app store agreement so test builds can go out', area: 'apps', priority: 'P0', status: 'waiting', who: 'Bart', opened_at: T('2026-11-17', 10), what: 'Only you can do this; it unblocks test builds and notifications.' }),
    issue(214, { title: 'Builders take turns on the mini, updates go first', area: 'ops', priority: 'P0', status: 'open', week: 1 }),
    issue(215, { title: 'Automatic checks on every code change', area: 'ops', priority: 'P1', status: 'open', week: 1 }),
    issue(216, { title: 'Encrypted daily backups and a weekly restore test', area: 'ops', priority: 'P1', status: 'open', week: 2 }),
    issue(217, { title: 'Only signed changes can be deployed', area: 'security', priority: 'P1', status: 'open', week: 2 }),
    issue(218, { title: 'An activity view: what happened to my files', area: 'web', priority: 'P1', status: 'open', week: 1 }),
    issue(219, { title: 'Test round three: tasks where Claude also fails sometimes', area: 'model', priority: 'P1', status: 'open', week: 2 }),
    issue(220, { title: 'The tag icon on the landing page tab', area: 'design', priority: 'P1', status: 'open' }),
    issue(221, { title: 'The document editor', area: 'web', priority: 'P2', status: 'open' }),
  ]
  const days = ['2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17']
  const rates = [44, 63, 40, 52, 71, 38]
  return {
    now,
    today: '2026-11-18',
    journal: {
      at: T('2026-11-18', 10, 5),
      now: '*Wednesday, 10:05 am.* Sign-in with a password and the Mac app for everyone are being built; the web app passed a first-time user walk in Safari overnight. Three builders are at work.',
      project: { title: 'Ola, a private AI agent for activists and academics', text: '', links: [] },
      numbers: ['**38** steers per 100 of your messages yesterday', '**412 of 412** checks passed before the latest update', '**73%** on our test tasks for the everyday model', '**$31** of the $50 a month comparison budget used'],
      decided: [
        { tag: 'Nov 18', text: '**Sign-in is a name and a password, a passkey optional.**' },
        { tag: 'Nov 18', text: '**The Mac app is for anyone with an account**, on request.' },
        { tag: 'Nov 17', text: 'Backups and signed updates over the next week.' },
        { tag: 'Nov 16', text: 'The first users are two researchers, in December.' },
      ],
      toDecide: [{ tag: 'Nov 18', text: 'Whether the phone app should work without the private network.' }],
      parked: ['Two older product ideas, set aside for Ola.'],
      waiting: [],
      checkin: [],
      days: { '2026-11-17': [{ time: '10:19 pm', text: 'A made-up note: the evening\'s work, in two sentences for you.' }, { time: '2:30 pm', text: 'Another made-up note.' }] },
    },
    issues: [...plate, ...done],
    unsorted: [{ sha: 'f00dfeed00000000000000000000000000000001', subject: 'ola web: a made-up commit that names no issue', at: T('2026-11-18', 9, 12) }],
    commitSync: { at: T('2026-11-18', 11, 30), ok: true },
    status: {
      at: T('2026-11-18', 11, 36),
      deployed: { commit: '9c1e2a7b4d5e', at: T('2026-11-18', 9, 2), suites: { gateway: '21 of 21', workspace: '66 of 66', frontdesk: '301 of 301', web: '24 of 24' } },
      checks: { passed: 412, total: 412 },
      alarm: { state: 'ok', says: [], warns: [], runAt: T('2026-11-18', 11, 36) },
      disk: { freeGB: 61 },
      memory: 'normal, swap 12%',
      projects: { running: 2 },
      parts: { 'web app': true, 'model connection': true, address: true, tunnel: true },
    },
    independence: {
      days: days.map((day, n) => ({ day, messages: 60 + n * 3, steers: Math.round((rates[n] * (60 + n * 3)) / 100), repeats: n, maybes: 1, rate: rates[n], between: 3, items: [{ time: '9:12 am', label: 'steer' as const, class: 'own labels', repeat: n % 2 === 0, quote: 'a made-up correction, for the design' }] })),
      replay: { at: T('2026-11-17', 17), cases: 21, with_rules: { passed: 54, tries: 63 }, without_rules: { passed: 21, tries: 63 }, prevented: 18, prevented_without: 7 },
    },
    plan: {
      slug: 'plan',
      title: '30 days',
      start: '2026-11-16',
      end: '2026-12-16',
      weeks: [
        { n: 1, title: 'You use it every day', from: '2026-11-17', to: '2026-11-21', items: ['The real address on the mini', 'The web app, second version', 'Your Mac and phone apps', 'A first-time user walk before anything is handed over'], demo: 'You build something from your phone and from your Mac.' },
        { n: 2, title: 'Ready for the new machine', from: '2026-11-23', to: '2026-11-27', items: ['One command installs everything', 'Backups and a restore test'], demo: 'Wipe, reinstall, restore.' },
        { n: 3, title: 'The new machine runs Ola', from: '2026-11-30', to: '2026-12-04', items: ['The first real user starts'], demo: 'A real task on the real model.' },
        { n: 4, title: 'The second user, and the review', from: '2026-12-07', to: '2026-12-11', items: ['The second user starts'], demo: '' },
      ],
    },
  }
}
