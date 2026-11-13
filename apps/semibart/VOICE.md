# CASBS Quest: the voice (2026-11-13)

Bart asked for one curator and a strong voice: in how the game looks, what it says, and how it
behaves. These are the rules every change is held to. When a new thing does not fit one of them,
the thing changes, not the rule.

## How it talks

- **Deadpan.** The game is a dry observer of academic life. Short declarative sentences. The joke
  is in the second sentence, which is shorter than the first. "Occupied. Of course."
- **It never explains the joke** and never announces one. No exclamation marks except for real
  alarm ("Gah!"). No winking, no emoji, no "pun intended".
- **The subject is the life of a scholar:** the book that is not finished, the seminar that runs
  long, the room that is always booked, reviewer two, tenure, the grant. A good new line could
  only have been written about this place.
- **Things escalate.** A place worth clicking twice has something else to say the second time
  (`again()` in `index.html`: the restrooms, the library, the small conference room), and settles
  on a last line.
- **Second person never.** The player's character says "I". Claude says what is now true ("Ten
  rats. One is already in your bookshelf."), not what it did.

## How it looks

- **The world speaks; the interface does not.** Everything anyone says, Claude included, is
  outlined pixel text floating by the speaker's head, in the speaker's colour. No speech boxes,
  no headers, no avatars beside text.
- **One of everything.** One typeface (Jersey 15). One accent for the interface (the yellow,
  `--hot`). One place for controls: the dock at the bottom left, three small squares (the wire,
  Who's where, you). One line to type on. Nothing in any other corner, ever.
- **Pictures before words.** A control is an icon; its words are in its `aria-label`. The
  interface itself never jokes.
- **A name appears only when you can do something.** Doors, people, Claude, notes, things that
  open. Scenery and the campus's small jokes have no hover name: clicking them is the discovery.
- **Pixels are honest.** No gradients, no soft shadows, no rounded corners, no easing: things
  move in steps. Translucency is for light, glass and shadow.
- **Diegetic first.** If something can live in the room (a note on a desk, a name plate, a stack
  of pages, a spark on the door frame), it lives in the room and not in a panel.

## How it behaves

- **You are one click from the game at all times.** Esc closes anything. Nothing opens by itself.
- **Nothing asks twice.** No confirmations, no tutorials, no tips. The title card has three lines
  of instructions and that is all the game ever explains.
- **The game rewards looking around,** quietly: a leaf under an oak, a second line at a door. It
  never points at its own rewards.
- **Other people are the point.** What a fellow does shows up for everyone: on their desk, in
  their room, on the wire.

## The one collectible

Loose leaves (`leaves.js`). Everyone at CASBS is writing a book; the oaks drop its pages. Pick
them up and the stack grows on your own desk; ten make the book. The price is that you start to
talk like it: footnotes, then hedges ("Arguably."), then citing yourself ("Me, forthcoming."),
then mentioning the book. It is the only thing to collect, on purpose.
