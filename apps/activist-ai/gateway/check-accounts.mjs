// The made-up accounts our own checks use on the test server, and their own weekly allowance of
// Ola's model (OLA-323, 2026-11-22).
//
//   askcases   the request tests (evals/asks/lib.mjs WHO and PROJECT): its person, whose Mac caller
//              runs the local runtime's cases, and its project, whose VM runs the cloud cases
//   appdriver  the Mac and iPhone check tools (apple/tools/drive-account.mjs WHO and PROJECT)
//
// They shared the normal week (20 million tokens) with everyone. By Nov 21 all four of their
// callers were at 20 million: after that night's update the request tests marked 25 requests
// STOPPED WORKING, 22 of them only because the allowance was used up, and no checker could work
// until it started again on Sunday. Each check account now has its own, larger week, by name here:
// never a general raise (GATEWAY_WEEKLY_TOKENS is untouched), never a real person.
//
// Who applies it: the gateway gives each project's caller (ws-<name>) this week
// (gateway/server.mjs); the front desk writes each person's (p-<id>, found by handle) into the
// people's quotas file (frontdesk/devices.mjs syncPeopleFile). An allowance set on purpose wins: a
// GATEWAY_QUOTAS entry for the project's caller, or the admin's own number for the person (admin.mjs
// app-allowance). A person who is an admin or not active never gets it.
export const CHECK_WEEKLY_TOKENS = 100_000_000
export const CHECK_ACCOUNTS = Object.freeze(['askcases', 'appdriver'])

// Real people's handles: never a check account, whatever the list above says.
const REAL = ['bart']
for (const n of CHECK_ACCOUNTS) {
  if (REAL.includes(n)) throw new Error(`check-accounts: ${n} is a real person, never a check account`)
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(n)) throw new Error(`check-accounts: ${n} is not a handle and project name`)
}

/** The check allowance of a gateway caller: a check project's caller ws-<name>, else null. */
export const checkCallerWeekly = (caller) => (CHECK_ACCOUNTS.some((n) => caller === `ws-${n}`) ? CHECK_WEEKLY_TOKENS : null)

/** The check allowance of a person (a platform database row): a check account's handle, active, not an admin; else null. */
export const checkPersonWeekly = (p) => (p && CHECK_ACCOUNTS.includes(p.handle) && p.status === 'active' && !p.is_admin && !REAL.includes(p.handle) ? CHECK_WEEKLY_TOKENS : null)
