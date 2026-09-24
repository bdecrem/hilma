# Recipe: margin doodles (Onething)

Every Onething entry (one sentence a day, [onething.ink](https://onething.ink))
gets a small pen doodle in the margin, drawn by **Opus 5.5 at low effort**.
The showcase page is `public/onething-doodles.html`. The feature lives in
`src/lib/onething/doodle.ts` (drawing), `src/app/onething/Doodle.tsx`
(display) and `onething.css` (the page). This is the minimal-art member of
the set: the model draws something new each time, in the same hand.

## The feel in one line

One image, a few confident strokes, one red accent, a little wit, the way
someone with a pen would do it in twenty seconds.

## The prompt (the part that makes the style)

The system prompt in `doodle.ts` is the recipe. Its rules:

- **Pick the ONE thing worth drawing:** a concrete object, a small scene or
  a gesture. Don't illustrate every noun.
- **Specific over symbolic:** the actual cliff, the actual cushion castle.
  No smileys, hearts, stars, check marks or lightbulbs unless the sentence
  is literally about them. No faces on objects.
- **Tone:** dry, warm humour is welcome; sentiment is not.
- **Format:** SVG element markup for a **340×170** viewBox, with air around
  the drawing. **3–10 elements**, only path, circle, ellipse, rect, line,
  polyline, polygon and g. No style, stroke or fill attributes. Only these
  classes:
  - `r`: the ONE red accent
  - `thin`: lighter detail
  - `f`: a small filled ink dot
  - `fr`: a small filled red dot
- **Three examples in the model's own hand,** from Bart's September page.
  They are what keep every new doodle looking like the same pen.
- **No repeats:** the last three days' sentences and what was drawn for
  them are passed in, so the model doesn't draw the same thing again.
- **Words almost never:** `wordAllowed()` opens only when nothing worded is
  in the previous three days. The day's instruction then says either "none
  at all" or "a word or two is welcome". The result is a worded doodle
  every four days at most.
- **Output:** structured `{ alt, svg, word }`.

## The pen (the page does the styling, never the model)

- Every element is stroke-only in ink `#2a251c`, 2.2 wide with round caps
  and `vector-effect: non-scaling-stroke`, so it is one pen at every size.
  `.r` is red `#a8341f`, and `.thin` is 1.2.
- A sanitizer keeps only the allowed elements and classes (plus `<text>` on
  word days).
- **On the ruled page:**
  - 28 px rules the full width, with a red double margin.
  - Every doodle sits in one margin slot, top-aligned with its entry and
    rotated ±2° by row.
  - Each drawing is cropped to its ink (`getBBox`) but never scaled past
    0.8 px per canvas unit, so small drawings stay small.

## Prompt (to make doodles for something else)

> Draw margin doodles in the Onething style (docs/opus55/onething-doodles.md;
> reuse the SYSTEM prompt and EXAMPLES in src/lib/onething/doodle.ts). One
> image per sentence, 3–10 stroke-only elements in a 340×170 viewBox, one
> red accent, specific not symbolic, no text. Style it with the page's pen
> CSS; the model never picks colours or widths.

**Checks:**
- `npx tsx scripts/onething/doodle-check.ts` covers the sanitizer and the
  word gate.
- `doodle-backfill.ts` redraws real entries.
- `node scripts/onething/pw-page-shot.mjs` shows the ruled page.
