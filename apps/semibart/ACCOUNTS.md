# CASBS Quest accounts (2026-11-12)

Everyone signs in before they play: **first name + passcode**. The first passcode is your
study number (Bart: `bart` / `16`); in your own study a padlock by the door changes it to
four digits of your own. All 49 people are seeded, so nobody signs up. Bart is the first admin.

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
  Six wrong tries lock a name for five minutes.
- Handlers (`handlers.ts`, plain `Request -> Response`), mounted one line each in
  `src/app/api/semibart/<name>/route.ts`:
  - `GET /api/semibart/me` → `{ user: { character, name, study, role, passcodeIsDefault } | null }`
  - `POST /api/semibart/login { name, passcode }` (first name, nickname, full name or slug)
  - `POST /api/semibart/logout`
  - `POST /api/semibart/passcode { current, next }` (signed in; next = four digits)
  - `GET /api/semibart/notes?for=a,b` · `POST { to, body }` · `DELETE ?id=` (signed in).
    Anyone sees that a note is on a desk; only its reader, its author and an admin get `body`.
    140 characters, 30 a day per author.
  - `GET /api/semibart/admin/users`, `POST /api/semibart/admin/reset { character }` (admin)
- Env: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SEMIBART_SESSION_SECRET` (in `.env.local`,
  Vercel `hilma` production, and the ops vault).

## Tables (apps/semibart/schema; accounts own 001-009, rooms 010+)

- `001_semibart_users.sql`: `semibart_users` (+ the seed of all 49, Bart admin).
- `002_semibart_notes.sql`: `semibart_notes` (sticky notes, soft-deleted with `removed_at`).
- Row-level security on, no policies; only server code with the service key touches them.
- Apply: `supabase db query --linked -f apps/semibart/schema/<file>` (if the CLI's login has
  expired, prefix `SUPABASE_ACCESS_TOKEN` from the ops vault).

## Browser (public/semibart/accounts.js)

- The title card asks for name + passcode before Start; you start at your own door.
- `window.quest.me` = the `/me` user or null (undefined until loaded); a `semibart:user` event
  fires on window whenever it changes. Your own room: `quest.occupants(S.room).includes(quest.me.character)`.
- The chip at top right: change passcode, sign out, and for admins the roster with a reset.

## Riding on the game (public/semibart/index.html)

Files that add to the game push functions into `window.quest.hooks` instead of editing it:
`roomBack(roomKey, t)` (after the room's light, before people), `roomMid` (before you are
drawn), `roomFront` (after you), all in room coordinates inside the OY translate, in the
person rooms and Bart's; `roomSpots(roomKey) -> hotspots` (prepended in those rooms);
`keyBlock(e) -> true` holds the game's keys while an overlay is open. `quest.gfx` has the
pixel helpers. Script tags, in order: accounts.js, rooms.js (rooms agent), notes.js (desk notes UI).

Check: `node scripts/semibart/accounts-check.mjs <dir>` against `next dev -p 3277`
(signs in as Bart, changes his passcode in his study, then resets it to 16).
