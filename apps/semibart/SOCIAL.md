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

A bar that slides up along the bottom and scrolls each announcement once: "Bart just added ten
cute rats to their study." "Inbal left a note on Mary's desk." Rows live in `semibart_events`
(written by the desk route, the agent's tools, admins); `GET /api/semibart/events?after=ID`,
polled every 12 s, held by the CDN for 4. On arrival it replays the last four of the day. It
stays out of the way of dialog choices, the slides, and any open box. Each new row is also a
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
