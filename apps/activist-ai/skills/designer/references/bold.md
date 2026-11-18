# The Bold register: gorgeous, fun, colorful, modern

Calm (the rest of this skill) is right for a report, a dashboard, a form, a tenants' notice. Bold is
right when the page has to make people want to come, join or give: a block party, a festival, a
night market, a fundraiser, a youth campaign, a celebration, a launch, or whenever the person says
"fun", "colorful", "gorgeous", "playful", "bold", "loud", "modern", "make it pop", "eye-catching".

Bold is still designed. It has a system (a few inks that work together), one idea from the subject,
and real content. What changes is the volume: more color, much bigger type, full-bleed fields, shapes,
overlap and a little motion.

Put `<meta name="ola-register" content="bold">` in the page's head, so `look.py` checks it by Bold's
rules (or pass `--register bold`).

Three worked examples, made-up content, open and copy what you need:

| Example | Preset | Display face | The idea |
|---|---|---|---|
| `/opt/ola/skills/designer/assets/bold-night-market.html` | night-neon | Anton | the street drawn as a row of stalls under string lights; the date as a 300 px numeral; a sky gradient that is the market's hours |
| `/opt/ola/skills/designer/assets/bold-rent-party.html` | riso | Bricolage Grotesque 800 | a ticket stub laid on a full-bleed vermillion field; the fund as ten blocks of ink |
| `/opt/ola/skills/designer/assets/bold-bike-day.html` | candy | Bowlby One | a big wheel with the date stamped on its hub; what gets fixed as colored stickers |

## 1. Color: three to five inks, built, not picked

Think like a screen printer: a ground (the paper), one ink for text, and two to four spot colors.
Each spot color appears as a **full field** somewhere (a band, a hero, a sticker), not as thin accents
scattered everywhere.

```
python3 /opt/ola/skills/designer/scripts/palette.py --bold --preset riso --css palette.css
python3 /opt/ola/skills/designer/scripts/palette.py --bold --scheme triadic --hue 25 --css palette.css
```

| Preset | Character | Good for |
|---|---|---|
| `riso` | vermillion #ff4b1f, ultramarine #3d3bff, sunflower #ffc31f, lime #b6f23a on cream #f7efdf, ink #16121c (approved by the owner) | rent parties, zines, campaigns, anything indie and hand-made |
| `night-neon` | acid lime, tangerine, lilac, sodium yellow on violet-black | night markets, concerts, dance parties, late events |
| `candy` | bubblegum, butter, mint, periwinkle fields under one plum ink | kids, families, picnics, libraries, a sweet celebration |
| `duotone` | deep forest green and tangerine on warm paper, two inks only | a gala dinner, a garden, a poster that must also print cheaply |

Schemes from one hue (the subject's color: a garden 140, the sea 240, a fire-red rally 25):
`complementary`, `triadic`, `split`, `analogous-clash` (three neighbors and one opposite that clashes
on purpose); `--ground dark` for night. Each color comes out at a different lightness (one deep, one
mid, one light), which is what keeps several colors from looking muddy.

Read the table it prints:
- `--on-cN` is the text color for a field of `cN`. Use it; never guess white or black.
- "fields and shapes only" means that color never carries text on the ground (sunflower or lime type
  on cream is unreadable). "display type 24 px and up" means headlines only.
- Reading text stays `--ink` on `--paper` or `--on-cN` on a field, at 4.5:1 or more. Always.

How much of each: one loud color owns the first screen as a full-bleed field (or the giant numeral);
the others take one field each further down (a band, the stickers, the button). Paper and ink still
carry the reading.

Never: teal with hot pink, purple-to-pink gradients, rainbow everything, a different color on every
heading, neon on white.

## 2. Type: one display face with character, very big

```
python3 /opt/ola/skills/designer/scripts/fonts.py add "Anton" "Space Grotesk" --to .
```

| Display face | Character | Pair with (text) |
|---|---|---|
| Anton | tall condensed poster capitals; set in uppercase | Space Grotesk or Public Sans |
| Bowlby One | fat, round, friendly | Space Grotesk |
| Bricolage Grotesque (weight 800, letter-spacing -0.035em) | warm, indie, a bit wild | Space Grotesk or Public Sans |
| Fraunces (weight 600 to 900, try the italic) | a soft, wonky old-style serif; gorgeous and grown-up | Public Sans or Instrument Sans |
| Space Grotesk (weight 700) | modern grotesque with quirks; campaigns, youth, tech | itself, at 400 for text |

The Bold scale (px; use `clamp` so a phone gets the small end):

| Role | Size |
|---|---|
| small (notes, sources) | 14 |
| interface (buttons, labels) | 16 to 17 |
| reading | 18, line height 1.5 to 1.6 |
| section heading (display face) | `clamp(30px, 5vw, 48px)` |
| page title (display face) | `clamp(52px, 11vw, 120px)`, line height 0.9 to 0.95 |
| the giant (the date, the number) | `clamp(120px, 32vw, 300px)`, line height 0.8 |

Rules: the display face only for headings, the giant and short labels; reading text in the text face
at 18 px, 62ch at most. Tighten big type (`letter-spacing: -0.02em` to `-0.05em`, except Anton).
`text-wrap: balance` on headings. Make sure the giant fits at 390 px: check the shot.

## 3. Full-bleed fields and bands

The first screen is a field of one spot color (or the dark ground), edge to edge, with the title and
the giant on it. Then sections alternate: paper, a band of another color, paper, the dark ground.

```css
.hero { background: var(--c1); color: var(--on-c1); padding: 32px 0 56px; }
.band { background: var(--c2); color: var(--on-c2); }   /* the one action lives in a band */
.wrap { max-width: 1180px; margin: 0 auto; padding: 0 16px; }   /* content inside, fields outside */
@media (min-width: 760px) { .wrap { padding: 0 40px; } }
```

## 4. Shapes from the subject, drawn in SVG or CSS

The shape is the idea, drawn. Never a blob, a wave or sparkles that could sit on any page.

- **The date as a giant numeral** ("22", "9"), in a spot color, with the month and hours beside it.
- **A ticket or stub** for anything with an entry price: a paper card turned -2deg, a dashed tear line,
  the price on a colored stub, a hard offset shadow (`box-shadow: 10px 10px 0 var(--ink)`).
- **Stickers and stamps** for counts and kinds: colored fields with `--on-cN` text, rotated -3 to 3deg,
  big rounded corners or a circle, a number in the display face.
- **The place, simplified**: the street as a row of stalls, the block as a map with the stage marked,
  the garden as beds, the march route as a thick line with its stops.
- **The thing itself**: a wheel for a bike day, a plate for a dinner, a bullhorn for a rally, the
  thermometer or blocks of a fund (one block per $1,000, computed).

Write the arithmetic of every drawing in a comment. An SVG that explains gets `role="img"` and an
`aria-label`; one that is pure ornament gets `aria-hidden="true"`.

## 5. Gradients, only with a reason

Allowed in Bold when the gradient means something and stays behind shapes, not under text:
- **time**: a sky from dusk to night for an evening event (the hours of the event).
- **duotone**: two of the palette's inks blending in a photo or a big shape.
- **heat or progress**: from one ink to another along a route or a goal.

Draw it in an `aria-hidden` SVG layer or on a shape. Text sits on a flat field next to or over it
(the contrast of text on a gradient cannot be checked). Never a default purple-to-pink, never on
buttons, never on text.

## 6. Layering and overlap

Things may overlap: a ticket over the edge of its field, stickers over each other, the giant numeral
running under the title. Rules: overlap on purpose (one or two places per screen), never over reading
text, and everything still inside the page at 390 px (shapes may run off the edge only inside an SVG
whose own box stays inside the page, as in the rent party's corner circles). `mix-blend-mode: multiply`
gives a riso overprint where two light inks cross on paper; on a dark or saturated field it prints mud.

## 7. Motion, small and respectful

One slow thing that belongs to the subject: string lights that breathe, a wheel that turns once a
minute, a sticker that settles in. 3 to 40 seconds a cycle, never a flash, never text that moves.
Always:

```css
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
```

## 8. Still never, in Bold too

- Decoration that says nothing: blobs, waves, sparkles, abstract 3D shapes, glows and neon halos
  (`text-shadow`, colored `box-shadow` blur), glassy blurred panels.
- A slogan instead of the facts ("Together we thrive!"): the title says what, the giant says when.
- Placeholder or invented content; emoji as icons.
- Text under 4.5:1 (3:1 for display type 24 px and up); sideways scroll at 390 px.
- More than two font families.

## 9. Quick Bold, in order

(SKILL.md, "Bold, step by step", is the same in commands.)

1. The idea: what is the giant (the date or the number) and what is the shape (from section 4)?
2. Copy the closest example above to `index.html` and `fonts.py add` its two families (or another
   preset: `palette.py --bold --preset ...` and replace the `:root`).
3. Rewrite every word from the person's files and redraw the shape for this subject; delete the
   example's top comment and its "Example page" footer. Keep its structure: hero field with title and
   giant, the shape, a band with the one action, sections that alternate fields, a footer.
4. `look.py index.html --name check` (it reads the `ola-register` meta). Fix every [broken],
   [readable], [order], [decorated] and [bare] line.
5. Look at the two shots yourself: is it fun, is it gorgeous, would the people it is for stop on it?
   If it is timid (one color, small type, no shape), go louder; if it is chaos, cut to the system.
