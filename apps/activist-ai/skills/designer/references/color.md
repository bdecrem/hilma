# Stage 3b: color

(This is the Calm register. For a Bold page, three to five inks from `palette.py --bold`: `bold.md`.)

A confident, small palette where tone does the work: a paper, two or three inks, a hairline, and
ONE accent used sparingly (the key figure, links, the one button). A second color only to mean
something (a warning, a negative value). Never color for decoration.

## Build it, do not pick it

1. Choose the accent's hue from the subject: a river or rain report, deep water blue (240 to 255);
   land, housing, tenants, warm brick or soil (25 to 45); food and parks, deep green (140 to 155);
   courts, law, ink blue-violet (265 to 280); a brand color the person has, use it (`--from`).
2. Choose the temperature of the neutrals: `warm` (paper, letters, community) or `cool`
   (data, tools, dashboards). Never pure white with pure black for long reading.
3. Run it, and read the table it prints. Every line must say ok:
   `python3 /opt/ola/skills/designer/scripts/palette.py --hue 30 --neutral warm --css design/palette.css`
   Add `--dark` when the person wants dark mode, `--html design/palette.html` to look at swatches.
4. Use the roles, not new colors: `var(--paper)`, `--surface` (a lifted band or a table header),
   `--rule` (hairlines), `--ink` (text), `--ink-2` (secondary), `--ink-3` (notes, sources),
   `--accent`, `--on-accent` (text on an accent button), `--accent-wash` (one highlight), `--alert`.

## How much of each

About 85% paper and surface, 12% ink, 3% accent. If the accent is on more than three or four things
in the first screen, it is no longer an accent. Charts: one series in the accent, the others in
`--ink-2` and `--ink-3`, or the accent and its wash. Bars and lines start from a hairline.

## Dark sections

One dark band (a footer, a hero on `--ink` with `--paper` text) can give a page weight. Long text and
tables stay on the paper.

## What failed before (the owner's words)

- Saturated navy right next to black: "unsophisticated". Do not put two dark, strongly colored
  tones side by side. Let the neutrals carry it and keep the brand color for the accent.
- Teal with hot pink, purple gradients, glows: "ai slop".
- White, one default blue, and tables: "too plain". The fix is not more color: it is a warmer or
  cooler paper, an accent with depth (`palette.py` searches for one), and a real idea.
