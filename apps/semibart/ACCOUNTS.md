# CASBS Quest accounts (2026-11-12)

Everyone signs in before they play: **first name + passcode**. The first passcode is your
study number (Bart: `bart` / `16`); the chip with your name at top right is the one place to
change it to four digits of your own (it shows a dot until you have). All 49 people are
seeded, so nobody signs up. Bart is the first admin.

## Server (src/lib/semibart, no Next imports: movable to the game's own project)

- `sessionUser(req: Request): Promise<SemibartUser | null>` in `auth.ts` is the one function
  every route needs. `SemibartUser` = `{ id (uuid), character, name, study, role: 'user' | 'admin' }`.
  `userByCharacter(slug)` answers "who owns this room".
- A user owns exactly one **character**: the game's lowercase slug (`bart`, `daniel`, `inbal`),
  which is also the room key. Same study number = same room (27, 28, 29 and 016 are shared;
  the room key is the host: kevin, jacqueline, ian, toussaint).
- Session: cookie `semibart_session`, HMAC-signed with `SEMIBART_SESSION_SECRET`. Changing a
  passcode bumps `session_version`, which ends every other session.
- Passcodes: scrypt; null hash = still the study number ("016" and "16" both open 016).
  Six tries lock a name for five minutes; each attempt is counted and the lock checked in one
  statement (`semibart_try_login`, schema 003) before the passcode is looked at, so parallel guesses
  can't slip past it.
- Handlers (`handlers.ts`, plain `Request -> Response`), mounted one line each in
  `src/app/api/semibart/<name>/route.ts`:
  - `GET /api/semibart/me` → `{ user: { character, name, study, role, passcodeIsDefault } | null }`
  - `POST /api/semibart/login { name, passcode }` (first name, nickname, full name or slug)
  - `POST /api/semibart/logout`
  - `POST /api/semibart/passcode { current, next }` (signed in; next = four digits)
  - `GET /api/semibart/notes?for=a,b` · `POST { to, body }` · `DELETE ?id=` (signed in).
    **The rule: a note on a desk is readable by any signed-in fellow** (Bart's call, 2026-11-12).
    The game reads desks through `/api/semibart/desk` (social.ts, same rule); this GET agrees.
    Writes go through `leaveNote` / `removeNote` either way. 140 characters, 30 a day per author;
    the reader, the author or an admin can take a note down.
  - `GET /api/semibart/admin/users`, `POST /api/semibart/admin/reset { character }` (admin)
- Env: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SEMIBART_SESSION_SECRET` (in `.env.local`,
  Vercel `hilma` production, and the ops vault).

## Tables (apps/semibart/schema; accounts own 001-009, rooms 010+)

- `001_semibart_users.sql`: `semibart_users` (+ the seed of all 49, Bart admin).
- `002_semibart_notes.sql`: `semibart_notes` (sticky notes, soft-deleted with `removed_at`).
- `003_semibart_login_attempts.sql`: `semibart_try_login(user)`, the atomic attempt counter.
- Row-level security on, no policies; only server code with the service key touches them.
- Apply: `supabase db query --linked -f apps/semibart/schema/<file>` (if the CLI's login has
  expired, prefix `SUPABASE_ACCESS_TOKEN` from the ops vault).

## Browser (public/semibart/accounts.js)

- The title card asks for name + passcode before Start; you start at your own door.
- `window.quest.me` = the `/me` user or null (undefined until loaded); a `semibart:user` event
  fires on window whenever it changes. Your own room: `quest.occupants(S.room).includes(quest.me.character)`.
- The chip at top right: your passcode ("Set your own passcode" and a dot while it's still the
  study number), sign out, and for admins the roster with a reset. There is no padlock in the
  rooms: one place for the account.

## Point of view (index.html)

Signed in, you are your character. You walk in your own colors (map sprite and room figure
colored from your seminar look). Your study opens without a knock and your chair is empty
until you sit (click it); sitting shows the room as everyone sees it, you at your desk, and
clicking yourself, the floor or the door stands you up. Other studies keep their fellow at
the desk: their stand-in while they're away. In the seminar you're never at the table twice.
`quest.S.seated` and a `semibart:seated` event; a rider's `roomHide` name `person:<slug>`
hides one person; `gfx.person` and `roomPersonAt` skip you while your own study waits for you.

## Riding on the game (public/semibart/index.html)

Files that add to the game push functions into `window.quest.hooks` instead of editing it:
`roomBack(roomKey, t)` (after the room's light, before people), `roomMid` (before you are
drawn), `roomFront` (after you), all in room coordinates inside the OY translate, in the
person rooms and Bart's; `roomSpots(roomKey) -> hotspots` (prepended in those rooms);
`keyBlock(e) -> true` holds the game's keys while an overlay is open. `quest.gfx` has the
pixel helpers. Script tags, in order: accounts.js, rooms.js (rooms agent), notes.js (desk notes UI).

Check: `set -a; source .env.local; set +a; node scripts/semibart/accounts-check.mjs <dir>`
against `next dev -p 3277`. It signs in with the check-only admin account (`check`, its long
passcode in `.env.local` as SEMIBART_CHECK_NAME / SEMIBART_CHECK_PASS and in the ops vault;
recreate with `node scripts/semibart/make-check-account.mjs`), never a real fellow, and changes
no passcode; the point-of-view part pretends in the page to be Inbal, Mikael and a seminar speaker.

## Decided (2026-11-12): sign-in strength stays as is, for now

Names and study numbers are public in the game, and most accounts still use the study number as
their passcode, so anyone with the link can sign in as a fellow who hasn't set their own code.
Bart's call: fine as is for now. If it changes, the proposal was a shared word given out at the
seminar, required only while an account still uses its study number, plus choosing your own four
digits at that first sign-in (accounts.js and src/lib/semibart/auth.ts; index.html doesn't change).
