# Alternate Bart in 16 homepages

Unfinished concepts retained for future editing. The existing `src/app/hi/page.tsx` and domain rewrite remain unchanged.

- `/hi/alt3` — **Small wonders**: supplied app screenshots woven into a personal introduction.
  **This design shipped on 2026-09-09 as the bartin16.xyz homepage.** Its markup now lives in
  `../home.ts`, served by `../route.ts` with real (indexable) metadata and `public/hi/og.png`; the
  previous React homepage is archived in `../_archive/`. `/hi/alt3` re-uses the same body behind
  noindex, so edit `../home.ts` and both follow. The `.edition-three` block in `styles.ts` is
  therefore live stylesheet, not draft — `.edition-four` beside it is still a draft.
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
  to a 22-28px muted salutation so the flow line is the page's only headline, emphasis on "stick / sing / new again."
  carried by weight (semibold) instead of colour so clay now means "this is a link", the decorative asterisk after
  "new again." removed, and the footer set in the same warm ink at 13px without the "↗" arrows (they now underline in
  clay on hover). Display tracking on the flow lines is -.016em: anything near -.05em collides "rn" into "m" in
  "learning", in Safari especially. Screenshot both engines after touching it — WebKit is installed for Playwright.
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
