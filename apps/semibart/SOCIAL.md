# CASBS Quest: notes, the Claude on the door frame, the wire

Social features (2026-11-12, the flame war 2026-11-13), all riding on the game through `window.quest` (the hook
registry in `public/semibart/index.html`), next to accounts (`ACCOUNTS.md`) and rooms as data
(`ROOMS.md`). `index.html` loads `notes.js`; `notes.js` loads `ticker.js` and `claude.js`.

## Sticky notes (`public/semibart/notes.js`)

Every desk has a pad of sticky notes and a pen. Click it in someone's study and write (140
characters); the note is pinned to the message board on their wall, and anyone who walks in can
click it, or the board, and read it close up. In a shared study you pick who it is for (one
board for the room, a pad on every desk). Its reader, its author and an admin can peel a note
off. New notes for you wiggle and carry a red dot until you have opened the board, and the
wire tells you when you arrive ("Check pinned a note to Daniel's board").

**The message boards** (2026-11-13, Bart: "in ALL ROOMS we need a message board on the wall,
where the notes people leave will go"). Every study has one: a walnut frame with a lit top
edge, speckled cork, a little brass plate underneath, the notes held by colored pushpins, and a
few pins waiting in the cork while it is empty; a full board ends in a stack. Where it hangs
(`BOARD_AT` and `BOARDS` in notes.js, repeated in `room-agent.ts` for the decorator): over the
desk in a desk room (x 160-216, y 12-47, four by two and then a stack: the first boards were 76 x 44 and were the biggest, brightest thing in every room), over Frances's armchair, low under the
window sill in Joseph's room (his wall is all monitors), above the second desk in a shared
study (Ian's at the far right, beside his map), Inbal's upper right over her monitor to balance the rat palace, Kevin's between the poster and the arcade
cabinet. The board is drawn behind the people (roomBack), so heads and monitors stay in front.
The decorator is told where the board is and keeps it clear; a room's code can take it down
(hide name `board`) and then its notes go back on the front of the desk (`PLACES`, and the wall
under the window when the desk is hidden too). `node scripts/semibart/study-sheet.mjs <dir>`
shoots every study on one sheet.

Bart's study had the first one (2026-11-13, his ask): a pinboard on the wall, so his notes
are pinned there, three by three (`BOARD` in notes.js; the board is painted empty in
`makeRoomBg`, x 155-194, y 12-49), the close-up is cork, and the wire says "pinned a note to
Bart's board". The pad stays on his desk. If his room's code hides the wall things (`extras`),
the notes go back to the desk.

Study 27 has a board too (2026-11-13): its wall is Kevin's dial-up den, so the notes for all
three of them are pinned to one cork board between the tour poster and the arcade cabinet
(`BOARDS` in notes.js: a room, a frame, the slots, a look line). notes.js draws that board over
the room's own decoration, each desk keeps its pad, and the decorator is told to keep the
rectangle clear (`EXTRAS.kevin` in room-agent.ts). Another room gets a board by adding a line
to `BOARDS` and one to `EXTRAS`.

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
  `public/semibart/intro.js`. A dark floor under a night sky and "Click to begin. Sound on." (no sound
  before a click), then THIS. / CHANGES. / EVERYTHING. as 3D metal (`intro3d.js`, shared with the
  trailer render in `apps/semibart-trailer`) with braams and glitter; the frame freezes and crumbles
  into the game's palette, and on the jingle the game's own `start()` runs, so a signed-in player skips
  the title card and the live game steps out of the mosaic. Signed out, the intro ends on the sign-in
  card. Esc or a click skips. Its clock is the game's AudioContext. Check: `SEMIBART_DEMO_PASS=… node
  scripts/semibart/demo-check.mjs <dir> [base]` (without the demo passcode it runs as the check-only
  account and skips the two demobart-only lines).
- **The look of the 3D act** (redone 2026-11-13, after "a little flat"): one color to a word. THIS. is
  cold steel under an ultramarine light; CHANGES. lands as steel and a white-hot line crosses it and
  leaves it copper (two meshes and a clipping plane, with a sear in the score); EVERYTHING. is gold.
  Each word is slammed onto a black mirror floor, a light comes up behind it and shines through the
  letters (an occlusion pass smeared away from the light), the camera drifts low around it and swings
  to the other side in the dark between words. The metal looks like metal because of what it reflects:
  three painted studio panoramas (`room()` in `intro3d.js`) with a white horizon that crosses the
  letters. To change it, look first: `node scripts/semibart/intro-shots.mjs <dir> [--times 2.2,4.3]`
  renders any moment without the game (`--tune '{"sun":0,"bloom":0}'` shows the bare metal, `--browser
  webkit` is Safari's engine, `--size 390x844` a phone), and `--perf` times a frame: 11 ms at 1080p on
  the M1 iMac, so `intro.js` caps the picture at about 1080p of pixels however big the window is.
  Two things cost half the frame until they were moved: post passes writing into the multisampled
  buffer, and the floor drawing its mirror image in the middle of the scene. `node
  scripts/semibart/intro-listen.mjs [base]` plays the page and prints its loudness a quarter second at
  a time (exit 1 if anything reaches full scale).
- **The demo account**: `demobart`, an admin with no study (study `0`), who walks as Bart with spiky
  hair and a pink T-shirt (`DEMO_LOOK` in index.html). `scripts/semibart/make-demo-account.mjs
  <passcode>` creates it or resets its passcode; the passcode is never in the repo. Someone without a
  study starts with the visitor's lines ("CASBS. Fifty-four studies.").
- **Music** (`public/semibart/music.js`): the trailer's chiptune theme, a 32-second loop, is the game's
  background music on every page. It comes in after the start jingle, sits under the sound effects,
  dips while anyone talks, and is silent when sound is off (your menu) or the tab is hidden.

## The chaos at the seminar (`public/semibart/flamewar.js`, `src/lib/semibart/flamewar.ts`, `src/lib/semibart/seminar.ts`)

Bart, 2026-11-13: a floor mic stands in the Margaret Levi Meeting Room, between the end of the
table and the presenter. Click it: the mic goes live (red light, a squeal), the presenter asks for
questions at the end, and a line opens along the bottom: type a comment (it is never a question),
or press **Stir up some stuff for me**. You say "It's more of a comment than a question." and the
room goes silent while the scene is written: every head turns, the clock ticks louder and faster,
the presenter starts to steam, a mug rattles, somebody half rises (no murmured lines). Then all
hell breaks loose.

**Physical comedy, not debate** (Bart, 2026-11-14: the first version was "a bunch of boring
conversation"), **at level 9** (the same evening: "correct direction but it's at level 3"). Two
lines at most between your comment and the first move, four lines in all, at least four moves and
at least two that leave a mess. Nobody sits back down: the scene ends with everyone where the
chaos left them. The moves are a fixed vocabulary, each animated in flamewar.js:

| move | what happens | what stays |
|---|---|---|
| `rise` / `slam` | stands bolt upright / a fist on the table, the room shakes, papers jump | |
| `throw` | the whole stack of papers into the air; it rains paper, most of it lands on the table | paper on the table and the floor |
| `spill` | the mug tips, coffee floods along the table and drips on the floor, the neighbors leap up | coffee, a tipped mug |
| `smash` | the mug through the window: glass everywhere, wind blows in and lifts the paper off the table | a hole and cracks, glass on the floor |
| `kick` | walks out from behind the table and kicks the trash can across the room; it hits the far wall, bounces, rolls; garbage everywhere | the can on its side, garbage |
| `screen` | yanks the projector screen; it comes down and swings, hanging by one end of its rod | the screen hanging |
| `jump` | onto the table | footprints on the table |
| `storm` | walks out; the door swings open as they reach it. `style="slam"`: slammed so hard the clock falls off the wall; `"open"`: left swinging | the clock on the floor / the door open |
| `faint` | slides under the table (and can still talk from there; a hand waves now and then) | |
| `clap` | a slow clap the whole room picks up, faster and faster | |
| `spin` | spins in the chair | |
| `music` | disco, tango or polka (WebAudio, the game's own music stops); disco brings a ball and lights | the mirror ball |
| `dance` / `conga` | everyone left dances / dances out the door in a line, leaving the player alone | the door open |
| `alarm` | fire alarm, red light, sprinklers, papers held over heads | puddles, soggy paper |
| `lights` | a blackout with only eyes, crashes; lights up with that person on the table, paper everywhere, the ceiling light hanging by one chain, flickering, the room dimmed | the light hanging, flickering |
| `freeze` / `turkey` | dead silence and a cricket / the wild turkey walks in (and may gobble lines) | the turkey stays |

Each grab of the mic is handed one of `SHAPES` at random (paper storm, coffee, the window, table
dance, fire drill, blackout, walkout, the turkey, escalation, slow clap, tango), which the model
follows or bends, so no two seminars go alike. A new move needs a line in `MOVES` (server), a
function in `MOVE` (flamewar.js), and, if it leaves something behind, a line in `buildWreck` and
`WRECK_MOVES`; a new shape is one sentence in `SHAPES`.

**The mess stays for the next visitor.** Every scene's moves are stored (`semibart_seminar`,
schema `024_semibart_seminar.sql`, one row `room`; the check account has its own row `check`, so
checks never wreck or sweep the fellows' room; `flamewar-try.ts` stores nothing). Whoever walks in
next, any fellow, finds the room empty and wrecked the way those moves wreck it (`buildWreck`; paper
and garbage fall in the same places for everyone, seeded by the time), says "Where is everybody?"
and that the commenter had a comment, and finds a broom leaning by the screen. The mic refuses until
someone sweeps. Sweeping walks you across the room with the broom (the mess goes where it has been),
puts everything back one thing at a time (the can, the screen, the clock, the light, the glass, the
door; the turkey leaves), clears the row for everyone (the wire: "X swept up the seminar room.
Mostly.") and brings next week's seminar in.

- `POST /api/semibart/flamewar { comment?, cast, topic }` (signed in) runs one Claude call (Opus
  5.5, effort low; 4 to 10 seconds) that returns `<comment>`, `<line who>` and `<do act who style>`
  tags and a wire headline. The scene is checked before it plays (known moves and people, at most
  four lines of at most 70 characters, at most two before the first move, four moves at least and
  two that leave a mess, music before any dance or conga, nobody acts after leaving, the turkey
  speaks only once it is in, no he/she: the cast are real colleagues) and written again once if it
  fails. It counts against the day's Claude turns (`countTurn`, shared with the door frame), and
  stores the wreck.
- `GET /api/semibart/seminar` -> `{ wreck }` (null when tidy); `POST` (signed in) is the broom.
- The prompt keeps it something everyone in it would show a friend: ridiculous, never humiliated
  or hurt, and no real colleague put on a side of a real political fight or made to talk about a
  public figure; such a comment becomes its academic proxy.
- Who is who comes from `roster.json`'s `fellows` table, plus anyone's changed lines from their persona.
- The game's side (index.html): from the moment you speak, flamewar.js draws the six people itself.
  `S.sem.pose[k]` tells the game to leave a body alone, `S.sem.at[k]` is where its lines float.
  `HOOKS.seminarWall` draws on the walls, window, door and ceiling (behind everybody),
  `seminarBack` behind the table (standing people, the table hides their legs), `seminarMid` /
  `seminarFront` on and in front of it; `HOOKS.seminarEnter` lets flamewar.js fetch the wreck before
  you walk in and play the entrance; `S.sem.wild` makes leaving bring next week. `gfx.bust`,
  `gfx.turkey` and `gfx.seminarBare` (the walls with nothing on them, for what falls off) are
  exposed for it, and `quest.walkTo` for the broom.
- The wire gets the headline. The check account's scenes and `flamewar-try.ts` stay off it.
- Checks: `npx tsx scripts/semibart/flamewar-try.ts [--shape N] [--as c] [--cast a,b,c,d,e,f] ["comment"]`
  prints one scene; `node scripts/semibart/chaos-check.mjs <dir> [base] [--no-live] [--only paper,coffee,persist]`
  plays seven hand-written scenes that use every move (no Claude call, a sheet of frames each),
  draws a wreck with every lasting move and sweeps it (`persist`), then clicks the mic as the check
  account, stirs once, checks it plays to the end, refuses a second grab and resets when you leave,
  walks back in through the door to find the check account's wreck waiting, and sweeps it off the
  server. Its sheets are drawn by Playwright, not ffmpeg.
