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

The body of a function that returns `{ back, mid, front, spots, hide }`: three optional draw
functions `(api, t)` for three depths (behind the occupant and desk / in front of them but behind
the visitor / over everything), the things a visitor can hover and look at, and the parts of the
room the game should leave out. `api` is the game's own pixel helpers (`rect`, `px`, `disc`,
`oval`, `dither`, `sprite`, `text`, `rng`) plus the visitor's position (`api.you`) and `api.calm`.

Rearranging ("I'm on the couch taking a nap", "redo the floor plan"): `hide` takes `occupant`,
`mates`, `desk`, `chair`, `extras`, `bookshelf`, `rug`. The game skips the parts it draws live
and drops their hover names (`quest.hooks.roomHide`, in index.html); `rooms.js` paints wall or
floor over the ones baked into the background (`api.wall` / `api.floor` do the same for any
rectangle). `api.person(x, y, { asleep, down, who })` draws the occupant's head and shoulders
anywhere, and the game moves their hotspot and speech there (`quest.hooks.roomPersonAt`). The door
and the window never go. The full contract, with the room's coordinates, is
the system prompt in `room-agent.ts`; the furniture positions there are copied from
`public/semibart/index.html` (`makeRoomBg`, `deskScene`, `readingScene`, `standingScene`,
`drawRoom`) and must move when those move.

## Shared studies and decoration wars

Four studies are shared: 28, 29 and 016 by two people, 27 by three. Everyone has a desk of their
own (`PLANS` and `sharedScene` in `public/semibart/index.html`): the first person sits in front of
the window, the last at the far right where the bookshelf stands in other rooms, and the
bookshelf is moved left to stand between desks. Those rooms are painted on backgrounds of their
own (`makeRoomBg(false, plan)`), with the rug fitted to the plan. Two people get desks 96 wide
with open floor between them; three get desks 84 wide that fill the room. A brass name plate is
on the front of each desk, and the host's own things are moved to fit (Ian's map, Jacqueline's
easel). `PEOPLE[room].plan` is `'duo'` or `'trio'`, and the roster carries it as the room's scene.
`quest.desks(room)` gives every desk (top, front panel, name plate) and `quest.fixtures(room)` the
bookshelf and the rug, which is how the notes stick to the right person's desk and how a hidden
bookshelf is painted away in the right place. **The same numbers are repeated in `PLANS` in
`room-agent.ts`** for the decorator's description of the room: change both.
`node scripts/semibart/shared-shots.mjs <dir>` shoots all four rooms and Study 27 from one of its
own seats.

Any occupant may change a shared room, and they will not always agree: that is a decoration war,
and the decorator is told to play it straight. It does what the person asking wants, including
removing a room-mate's thing; it keeps a comment in the code above each thing saying who asked for
it; and its line names whose thing went ("Kevin's rats are out. A fat orange cat now sleeps across
Mikael's desk"). To do that it is given who is asking, which desk is theirs, and the room's recent
changes (`roomLog` in `rooms.ts`: who asked for what, and the decorator's line each time). Room
code can address one person: `hide: ['person:1', 'desk:0', 'chair:2']` (numbers in occupant
order; `rooms.js` turns them into the game's `person:<slug>` and so on) and
`api.person(x, y, { who: 1 })`.

`decorate-try.ts` plays a war without saving anything: `--as <character>` says who is asking and
`--history h.json` carries the changes from one run to the next.

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
- `npx tsx scripts/semibart/room-put.ts <room> <code.js> <character> "<request>" "<say>"`: saves
  code you have looked at with the two above as the room's next version, through the same test run.
- `node scripts/semibart/rooms-check.mjs <dir> ["request"] [base]`: the whole thing through the
  page, API and database as the check account (`SEMIBART_CHECK_NAME` / `SEMIBART_CHECK_PASS`, an
  admin that owns no study): decorate (one real Claude call), a second tab that never reloads,
  the new hotspot, undo, who is turned away. `https://ola.cx` as base checks production. It works
  in `SEMIBART_CHECK_ROOM` (`alison` unless set) and leaves that room as it was, two versions on.

Never delete rows from `semibart_rooms` or `semibart_room_versions` to tidy up after a test: a
room's version numbers must only ever go up, because `GET /rooms/:room?v=N` is cached for good.

The last two run against `next dev -p 3277`.

## Measured (2026-11-12, this iMac, dev server)

"put a cute pink rat in my room": 11, 23 and 26 seconds at effort low, 40 at medium, first try
each time. "a fireplace with a crackling fire, and a cat asleep in front of it": 34 seconds.
"I'm on the couch taking a nap": 18 seconds (the occupant hidden, a couch, a blanket, the head
asleep at one end). A three-move war in Study 27 (Kevin's rats, Mikael's cat
instead, Kevin's rats back under a NO CATS sign): 21, 9 and 39 seconds, first try each. The rooms cost 0.04 to 0.07 ms a frame to draw.
