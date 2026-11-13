# CASBS Quest rooms as data (2026-11-12)

What a fellow adds to their study is **a piece of drawing code saved in Supabase**, not part of
the page. Saying "put a cute pink rat in my room" is one Claude call and one saved row; everyone
in that room sees it a few seconds later. No deploy is involved, so ten people changing ten rooms
at once each wait only for their own request (10 to 40 seconds).

## How a change happens

1. The occupant (or an admin) sends a sentence: the Decorate box in their own room
   (`public/semibart/rooms.js`), or the in-room chat agent. Both end in
   `changeRoom(user, room, prompt)` in `src/lib/semibart/room-change.ts`, the one way a room changes.
2. `room-agent.ts` asks Claude (Opus 5.5, effort low) for the room's complete new code, giving it
   the room's geometry, the drawing helpers, the game's pixel style and the code already there.
3. `room-check.ts` test-runs the answer before anything is saved: a scan for names room code has
   no business using, then two minutes of frames in an empty V8 context. It stops code that does
   not compile, throws, loops forever, draws nothing, draws far too much or passes junk to the
   helpers. A failed draft goes back to the model with the reason, twice at most.
4. `rooms.ts` saves it as the room's next version (`semibart_rooms`, history in
   `semibart_room_versions`). Undo is a new version holding the older code.
5. Every open game polls `GET /api/semibart/rooms` (room -> version, held two seconds at the CDN)
   and fetches the code of any room whose version moved.

## What room code is

The body of a function that returns `{ back, mid, front, spots }`: three optional draw functions
`(api, t)` for three depths (behind the occupant and desk / in front of them but behind the
visitor / over everything) and the things a visitor can hover and look at. `api` is the game's
own pixel helpers (`rect`, `px`, `disc`, `oval`, `dither`, `sprite`, `text`, `rng`) plus the
visitor's position (`api.you`) and `api.calm`. The full contract, with the room's coordinates, is
the system prompt in `room-agent.ts`; the furniture positions there are copied from
`public/semibart/index.html` (`makeRoomBg`, `deskScene`, `readingScene`, `standingScene`,
`drawRoom`) and must move when those move.

## The fence

Room code is written by a model from a colleague's sentence and runs in every visitor's page.

- Server, before saving: the name scan and the dry run above. The dry-run context has no
  `process`, `require`, timers or console, and cannot make code from strings.
- Browser (`rooms.js`): the code gets only `api`; every browser global is shadowed; the Function
  constructors are removed from the page; each helper checks its arguments and counts calls; a
  room that throws three times or averages over 5 ms a frame is switched off until its next version.
- Limits: 600 characters a request, 24,000 characters of code, 9,000 drawing calls a frame,
  80 changes a room a day, one change to a room at a time (`semibart_claim_room`).

This stops accidents and mischief among fifty colleagues. It is not a sandbox for a hostile web:
a busy loop that never calls a helper and only starts after the two tested minutes would freeze
the tab of whoever walks in, until the room is undone.

## Files

| What | Where |
|---|---|
| Tables, the lock function | `apps/semibart/schema/010_semibart_rooms.sql` (rooms own 010-019) |
| Storage, who may decorate | `src/lib/semibart/rooms.ts` |
| The one way a room changes | `src/lib/semibart/room-change.ts` (`changeRoom`, `undoChange`) |
| The decorator and its prompt | `src/lib/semibart/room-agent.ts` |
| The test run | `src/lib/semibart/room-check.ts` |
| Rooms and their occupants | `src/lib/semibart/roster.json`, written by `node scripts/semibart/roster.mjs` from the game; rerun it when the cast, the studies or the room-mates change |
| Routes | `src/app/api/semibart/rooms/` over `room-handlers.ts`: `GET /rooms`, `GET /rooms/:room[?v=N]`, `POST /rooms/:room { prompt }`, `POST /rooms/:room/undo` |
| The game side | `public/semibart/rooms.js`, riding on `window.quest.hooks` and `quest.gfx` (see `ACCOUNTS.md`); `window.questRooms.setRoom(room, version, code)` applies a change at once, `questRooms.ui(false)` retires the Decorate button |

A room key is the host's slug (`daniel`; `kevin` for the three in Study 27; `bart`). A user may
decorate the room whose occupants include their character; an admin, any room.

## Checks

- `npx tsx scripts/semibart/room-check-test.ts`: the fence and the ownership rule, no network.
- `npx tsx scripts/semibart/decorate-try.ts <room> "<request>" <out.js>`: one real request,
  nothing saved (needs `.env.local` in the environment).
- `node scripts/semibart/room-shots.mjs <dir> <room> <code.js>`: that code in the real game, six
  frames and a sheet, nothing saved.
- `node scripts/semibart/rooms-check.mjs <dir>`: the whole thing through the page, API and
  database as Bart: decorate (one real Claude call), a second tab that never reloads, the new
  hotspot, undo, who is turned away. It leaves two history rows in Bart's room.

The last two run against `next dev -p 3277`.

## Measured (2026-11-12, this iMac, dev server)

"put a cute pink rat in my room": 11, 23 and 26 seconds at effort low, 40 at medium, first try
each time. "a fireplace with a crackling fire, and a cat asleep in front of it": 34 seconds.
The rooms cost 0.04 to 0.07 ms a frame to draw.
