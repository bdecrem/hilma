# Alternate Bart in 16 homepages

Unfinished concepts retained for future editing. The existing `src/app/hi/page.tsx` and domain rewrite remain unchanged.

- `/hi/alt3` — **Small wonders**: supplied app screenshots woven into a personal introduction.
  **This design shipped on 2026-09-09 as the bartin16.xyz homepage.** Its markup now lives in
  `../home.ts`, served by `../route.ts` with real (indexable) metadata and `public/hi/og.png`; the
  previous React homepage is archived in `../_archive/`. `/hi/alt3` re-uses the same body behind
  noindex, so edit `../home.ts` and both follow. The `.edition-three` block in `styles.ts` is
  therefore live stylesheet, not draft — `.edition-four` beside it is still a draft.
  It is also the front door of decremental.com (host rewrite in `next.config.ts`); the project
  list moved to decremental.com/projects, which the landing's footer links to.
  On phones the page is built to land inside one screen: `.edition-three` is a flex column at
  `100dvh`, `.three-bottom` takes the slack with `margin-top: auto` so the bio and footer stay a
  block on the bottom edge, and a second tier at `max-height: 700px` steps everything down ~15%
  for short phones. Both `.three-main` and `.three-footer` need explicit `margin: … 0` there —
  the base `margin: auto` would otherwise shrink-to-fit and centre them inside the flex column.
  The two hosts differ in their contact block and footer labels. bartin16.xyz keeps the email
  and phone number in the paragraph and the CASBS door invitation. decremental.com links CASBS
  out to casbs.stanford.edu, replaces the door paragraph with one line ending in "talk to you",
  and puts the message form in a native `<dialog>` behind that link — a mailto form, no backend,
  Send opens the visitor's own mail app. Its footer reads "More about me" and "All my AI
  projects". `route.ts` picks by Host header and adds a `site-decremental` body class so the
  variant can be styled anywhere; `@@BIO@@` and `@@LINKS@@` in FLOW are where the two diverge.
  On phones both variants centre and are sized to nearly fill the screen: the flow lines run at
  8.9vw against about 6% of horizontal headroom, so leftover space falls as an even margin top
  and bottom instead of a hole under the headline. The footer becomes one wrapping line divided
  by rules — the separator span carries a space after it and none before, so a wrapped line never
  starts with a dangling rule, and without that space the run cannot break at all. On desktop the
  separators are display:none and the footer stays a flex row.
  The three photos answer to touch as well as hover. On a device with no pointer, the first tap
  lifts a photo to the middle of the screen at up to 3.2x with its address under it, over a
  dimmed, blurred page; tapping it again follows the link, and the scrim, Escape, a scroll or a
  resize put it back. The hover rules moved inside `@media (hover: hover)` so a tap cannot leave
  a sticky hover behind. Two details make the address land right: it divides its size and offset
  by the scale so it stays 13px whatever the photo does, and the script measures the *open*
  arrangement first (`.is-measuring` is the open photo positions without the parent scale),
  because the photos fan out on open and each box holds them differently — measuring at rest
  put the Mac's address 20px too low.
  `/hi/card` renders the sentence as a 1600x900 poster (`.edition-card`, photos about a third
  larger, three wide lines instead of five narrow ones) — `node scripts/hi/make-card.mjs`
  screenshots it to `~/Desktop/bartin16-linkedin.png` with the dev server running.
  Revised 2026-09-09 to Bart's brief: the "builder, tinkerer" kicker, the "a small collection…" caption with its
  project index, and both hairlines are gone; the CASBS paragraph stays. One typeface does the whole page (Inter
  Tight — the serif italics are retired here, alt4 still uses them) with emphasis carried by the clay accent, on the
  warm paper of the live homepage (#fff6ea / #2b2118 / #d64a22). The three photo objects are now plain links —
  Dodo → dodo.foo, Jambot → jambot.to, Mac Plus → github.com/bdecrem/Macinclaude — and reveal their destination on
  hover instead of opening the dialog, so alt3 no longer renders `.project-dialog`. The email and phone number sit in the
  CASBS paragraph as their own sentence ("I'm at … or …"), the way the live homepage says it; the footer carries the rest of its links:
  About me, decremental.com, Substack, LinkedIn, X. The floating edition switcher, the header's
  "a few things that make me tick" strapline and the "small experiments / open possibilities" aside are gone from
  alt3 (alt4 still has the switcher); reach the drafts by URL.
  Polished the same day: one left axis (the flow block no longer sits indented from the title), "Hey, I'm Bart." dropped
  to a 22-28px muted salutation so the flow line is the page's only headline, emphasis on "stick / jam / new again."
  carried by weight (semibold) instead of colour so clay now means "this is a link", the decorative asterisk after
  "new again." removed, and the footer set in the same warm ink at 13px without the "↗" arrows (they now underline in
  clay on hover). Display tracking on the flow lines is -.016em: anything near -.05em collides "rn" into "m" in
  "learning", in Safari especially. Screenshot both engines after touching it — WebKit is installed for Playwright.
  Copy since 2026-09-12 (both hosts): the hero is the one word "inspire." (`.three-title`, now 600 weight at about
  1.4x the flow lines, ink not muted — "Hey, I'm Bart." is gone) over the sentence "This year I'm at CASBS, spending
  my tokens on AI × human flourishing." with the same three photos inline (Dodo before "CASBS,", Jambot before
  "tokens", the Mac Plus after "human"); "CASBS" links out through `.flow-link` (no dressing, clay on hover, like the
  photo addresses). decremental.com's contact line is now just "Would love to talk to you if you're into that."; the
  card and `scripts/hi/make-og.mjs` show the hero too.
- `/hi/alt4` — **Room for play**: a chrome 16, draggable project objects, hover reveals, and a small user-initiated rhythm sketch. Edit `../alt4/html.ts`.

The HTML route handlers use the repository’s existing full-document pattern (`/1ziu1wahxw`) so the designs retain their CSS and native browser interactions without inheriting the homepage’s React layout or global Tailwind resets. Both return noindex/nofollow. Their small navigation links only to each other and the original homepage.

## Shared files

- `document.ts`: document shell, metadata, embedded CSS and browser script.
- `styles.ts`: styles for concepts 3 and 4 only, including responsive and reduced-motion rules.
- `interactions.ts`: project dialogs, drag/reset behavior, and the playable rhythm sketch.
- `public/hi/alts/assets/`: local fonts, supplied screenshots, Mac photo, and generated chrome artwork.

Concepts 1 and 2, their unused styles, and the superseded static preview files were removed from the project.

The rhythm sketch is a standalone design interaction, not a recording from Jambot. It starts only after pressing Play and stops when the dialog closes or the tab becomes hidden. Dialogs support Escape and focus return. Touch uses tap to inspect and retains vertical scrolling.

## Generated artwork

`public/hi/alts/assets/room-16-sculpture.jpg` was created once with built-in image generation, inspected, and converted to JPEG. The other images derive from the supplied attachments.

Exact generation prompt:

Use case: product-mockup
Asset type: fullbleed landscape hero background for a personal creative frontend portfolio in Room 16 at Stanford CASBS, approximately 1536x1024.
Primary request: a high-end industrial-design still life of a very large sculptural number "16", made of mirror-polished softly rounded tubular chrome, sitting on a dark almost-black deep aubergine tabletop/backdrop (#231d26).
Style/medium: photorealistic premium studio product photography, tasteful Apple industrial design meets collectible design gallery.
Subject: the number "16" has a playful, sophisticated biomorphic form and thick continuous round sections, with two unmistakably legible digits, a one and a six.
Composition/framing: landscape 3:2. The sculpture occupies the RIGHT half, centered around x65%, y50%. The left 42% is nearly empty dark background for white HTML typography. Straight-on, slightly elevated three-quarter camera. Leave ample dark empty space at bottom and on the left, because three real interactive app screenshot objects will be overlaid later. Do not render those screenshots or any interface into the image.
Lighting/mood: cinematic directional studio lighting from upper left, warm silver reflections, tangible subtle surface grain, beautiful long soft shadows.
Constraints: only the sculptural "16" and its tabletop/backdrop. No other text or labels, no interface, no furniture, no plants, no colored blobs, no gradients as artwork, no watermark. Maintain the near-black aubergine background and generous empty space.
