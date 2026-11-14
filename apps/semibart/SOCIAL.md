# CASBS Quest: notes, the Claude on the door frame, the wire

Three social features (2026-11-12), all riding on the game through `window.quest` (the hook
registry in `public/semibart/index.html`), next to accounts (`ACCOUNTS.md`) and rooms as data
(`ROOMS.md`). `index.html` loads `notes.js`; `notes.js` loads `ticker.js` and `claude.js`.

## Sticky notes (`public/semibart/notes.js`)

Every desk has a pad of sticky notes and a pen. Click it in someone's study and write (140
characters); the note lands on the front of their desk, and anyone who walks in can click it
and read the desk close up. In a shared study you pick who it is for. Its reader, its author
and an admin can peel a note off. New notes on your own desk wiggle and carry a red dot until
you have opened the desk, and the wire tells you when you arrive.

Why notes on the desk and not a board on the wall: the wall is where each room differs (maps,
easels, monitors) and where the decorator hangs things; the desk front is an empty panel in
nearly every room, and a desk covered in notes reads at a glance as "people come by here".
Rooms without that panel have their own places (`PLACES` in notes.js): the arms and back of
Frances's chair and her lampshade, the front edge of Joseph's standing desk. When a room's own
code hides the desk (`questRooms.hidden(room)`, the nap and floor-plan changes), the notes move
to the wall under the window and the pad to the sill, which no room can hide. In a shared
study with a desk per person (`quest.desks(room)` from the rooms layer, two or more entries)
each person's notes stick to their own front panel and each desk has its own pad, which
writes to that person; until that layer lands, shared studies use the one-desk layout.

Bart's study is the exception (2026-11-13, his ask): it has a pinboard on the wall, so his notes
are pinned there, three by three (`BOARD` in notes.js; the board is painted empty in
`makeRoomBg`, x 155-194, y 12-49), the close-up is cork, and the wire says "pinned a note to
Bart's board". The pad stays on his desk. If his room's code hides the wall things (`extras`),
the notes go back to the desk.

The pad and pen are the one thing on a desk that does something, so `drawPad` marks them as a
control in the game's own terms (VOICE.md: honest pixels, one accent): a full ink outline, the
pen in orange, and a three-frame twinkle at the pen's cap every 3.6 seconds, still when motion
is reduced. `node scripts/semibart/notes-shots.mjs <dir> [base] [bart-room-code.js]` shoots one
room of each kind with mocked notes and prints the note and pad hotspots.

- `GET /api/semibart/desk?room=mary` → `{ notes }`, `POST { to, body }` and `DELETE ?id=`, all
  signed in only: "anyone who walks in" means anyone in the game, not anyone with curl. Reads are `deskNotes` in `src/lib/semibart/social.ts`; writes go
  through the accounts session's `leaveNote` / `removeNote` (`notes.ts`, table 002).
- The older `/api/semibart/notes` hides a note's text from everyone but its reader and author.
  The game does not use it: Bart's call was that a note on a desk is in plain view.

## Claude on the door frame (`public/semibart/claude.js`, `src/lib/semibart/social-agent.ts`)

A small clay spark sits on the door frame of your own study, and only there (the character
from `/claude`, at pixel size); in anyone else's study there is nothing to see or click. An admin
is the exception and has one in every study (Bart, 2026-11-12, both rules). Click it and type: "add ten cute rats", "make it pink", "I'm on
the couch taking a nap", "make me grumpy today". It answers in a speech bubble; the input is a
bar along the bottom, so the room stays in view while it changes.

`POST /api/semibart/agent { room, messages }` runs Claude (Opus 5.5, low effort) with tools:

- `change_room` hands one complete sentence to the decorator through `changeRoom()`
  (`room-change.ts`, the rooms session's single way in). Anything a visitor sees goes here,
  including where the occupant is and the floor plan; what the decorator can actually draw is
  its business and it says so in its own line.
- `set_lines` rewrites a character's lines (`semibart_personas`): `look`, `come` (through the
  door), `hello`, `lines` (when talked to), `doing`. claude.js lays them over the game's own.
- `undo_room` steps the drawing back; `announce` (admins) puts a line on the wire.

Each message to the chat counts against 60 a day per person (`semibart_agent_turns`, schema
021; `countTurn` in social.ts); past that Claude says so and no model is called. Room changes
have their own cap inside `changeRoom`.

Two levels. A fellow: their own study, their own lines. An admin (Bart): any study he is
standing in, anyone's lines in it, and announcements on the wire.

## The wire (`public/semibart/ticker.js`)

A slide-out widget along the bottom (since 2026-11-13): the yellow CASBS WIRE tab sits at the
bottom left and a dark strip slides out of it to the right. Click the tab to shut it or open it
again; it starts open and the choice is kept on the device (`localStorage` `semibart:wire`). Open,
each new announcement scrolls across ("Bart just added ten cute rats to their study." "Inbal left
a note on Mary's desk.") and the day's last few come round again, dimmer, while it is quiet. Shut,
the tab counts what arrived unseen. Rows live in `semibart_events` (written by the desk route, the
agent's tools, admins); `GET /api/semibart/events?after=ID`, polled every 12 s, held by the CDN
for 4. The whole widget stays out of the way of dialog choices, the slides, and any open box.
Check: `node scripts/semibart/wire-shots.mjs <dir>` (the events API answered locally). Each new row is also a
`semibart:event` on `window`, which is how an open room picks up a new note or new lines.
`questTicker.local(text)` scrolls a line only this player sees. `/api/semibart/events` and
`/api/semibart/personas` answer without a session on purpose: they are lines meant for the
whole campus and hold nothing a visitor to the game would not be shown.

## Tables, checks

Schema `apps/semibart/schema/020_semibart_social.sql` (`semibart_events`,
`semibart_personas`) and `021_semibart_agent_turns.sql`, applied 2026-11-12. The Supabase CLI login on the iMac was stale that
day; it ran with `SUPABASE_ACCESS_TOKEN` from the ops vault in the command's environment.

`source ./.env.local && node scripts/semibart/social-check.mjs <dir> [url] [notes|chat|all]`
against a dev server (or `https://ola.cx/semibart`) drives it in a browser as the check-only
admin `check` (it mints that account's session cookie; never a real fellow): writes a note on
Daniel's desk, reads and peels it, watches the wire, reads a note on Bart's desk as a visitor,
confirms there is no spark in someone else's study, and asks the agent one question that
changes nothing. It deletes the notes and announcements it made. `social-shots.mjs` shoots rooms.

## The dock, the chat line, and loose leaves (2026-11-13, the design pass)

The rules behind these are in `VOICE.md`.

- **The dock** (`ticker.js`): three squares at the bottom left and nothing in any other corner:
  the wire (an antenna; click to slide the strip shut or open), Who's where (map only), and you
  (your own face; opens the menu `accounts.js` draws: sound, full screen, passcode, sign out).
  The old Who's where button, the name chip and the sound and full-screen buttons are gone from
  the corners.
- **Talking to Claude** (`claude.js`): Claude answers in floating clay-coloured text by the door
  frame, like every character. You type on one prompt line along the bottom: Enter sends, Esc
  leaves, what you asked stays on the line while Claude works, and the empty line suggests one
  thing to ask, a different one each time. No suggestion buttons, no speech box.
- **Hover names** appear only for doors, people and things that open something; scenery and the
  small jokes (anything whose only verb is look, and hotspots marked `quiet`) show none.
- **Loose leaves** (`leaves.js`, `semibart_pages`, `GET`/`POST /api/semibart/pages`): the one
  collectible, described in `VOICE.md`. A leaf falls from an oak in view every half minute or so
  of map time (the first within fifteen seconds), one at a time, until your book is done. The
  server counts pages (`semibart_pick_leaf`, at most ten, not faster than one in eight seconds)
  and puts a line on the wire when a book is finished.

Checks: `design-shots.mjs` (every screen on one sheet), `wire-shots.mjs`, `leaves-check.mjs`
(the jokes, a leaf, the stacks, how your lines change); all answer the APIs locally.

## Books (2026-11-13)

Every fellow has a book, written ahead of time (`src/lib/semibart/books.ts`, tables
`semibart_books` and `semibart_book_versions`, schema 023): Opus 5.5 at medium effort, from the
one line in the game's `FELLOWS` table, in a form chosen for that person from a wide spread (it is
offered four at random each time, so fifty books are not fifty plays), ten pages of text and pixel
drawings. `node scripts/semibart/books-generate.ts` writes any that are missing (`--force` to
rewrite, `--only a,b`); about 70 s and 6,000 output tokens each, four at a time.

- Where it is (`leaves.js`): until it is finished, the book is the first spine on the top shelf
  of its owner's bookshelf (one spine per person in a shared study), drawn like the books around
  it; it has no name and does nothing when clicked, except for an admin, who can take it down and
  read it whole (`GET /api/semibart/books/:who`, `visibleBook` in `social-handlers.ts`). At ten
  pages it leaves a gap on the shelf and stands face-out on its owner's desk, where anyone can
  read it. The owner does not read pages early: the pickup lines tell them what they found.
- Changing: once a book is finished its owner asks the door-frame Claude ("make it a musical");
  the agent's `change_book` tool calls `reviseBook`, which keeps what was not asked to change;
  `undo_book` steps back. An admin may change anyone's book in the study they stand in. About a
  minute a change.
- The wire names a finished book: `Brian finished their book: "Farewell, My Cookie".`

Checks: `npx tsx scripts/semibart/books-test.ts` (who reads what, the parser; offline);
`node scripts/semibart/books-check.mjs <dir> [base] [room]` (an admin reads a real book from a
desk; a fellow's partial manuscript and a visitor, with the APIs answered locally);
`book-try.ts` and `book-sheet.mjs` to try the prompt and look at the results.

## The demo page and the music (2026-11-13)

- **ola.cx/semibart/demo.html** (`src/app/semibart/demo.html/route.ts`) is the game page with the
  trailer's opening in front of it: the route adds a pinned three.js import map and
  `public/semibart/intro.js`. Black and "Click to begin. Sound on." (no sound before a click), then
  THIS. / CHANGES. / EVERYTHING. as 3D metal (`intro3d.js`, shared with the trailer render in
  `apps/semibart-trailer`) with braams and glitter; the frame freezes and crumbles into the game's
  palette, and on the jingle the game's own `start()` runs, so a signed-in player skips the title card
  and the live game steps out of the mosaic. Signed out, the intro ends on the sign-in card. Esc or a
  click skips. Its clock is the game's AudioContext. Check: `SEMIBART_DEMO_PASS=… node
  scripts/semibart/demo-check.mjs <dir> [base]`.
- **The demo account**: `demobart`, an admin with no study (study `0`), who walks as Bart with spiky
  hair and a pink T-shirt (`DEMO_LOOK` in index.html). `scripts/semibart/make-demo-account.mjs
  <passcode>` creates it or resets its passcode; the passcode is never in the repo. Someone without a
  study starts with the visitor's lines ("CASBS. Fifty-four studies.").
- **Music** (`public/semibart/music.js`): the trailer's chiptune theme, a 32-second loop, is the game's
  background music on every page. It comes in after the start jingle, sits under the sound effects,
  dips while anyone talks, and is silent when sound is off (your menu) or the tab is hidden.
