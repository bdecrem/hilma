# Stage 3a: type

Type does most of the work on a good page. Pick ONE of the scales below and copy its numbers; do not
invent sizes in between. Professional pages are smaller than you think: reading text 16 or 17 px,
not 20; a page title of 40 to 48 px on a laptop, not 80.

## The fonts you have

Bundled with this skill (all SIL Open Font License, files and licenses in `assets/fonts/`). Copy the
ones you use beside the page with `fonts.py add`, which also writes `fonts/fonts.css` with the
`@font-face` rules and the licenses. Never link a font from the internet.

| Family | Character | Good for |
|---|---|---|
| Public Sans | plain, sturdy, civic (made for US government sites) | dashboards, forms, results, anything that must feel trustworthy |
| Instrument Sans | crisp, contemporary, a little narrow | web apps, tools, sign-up flows, data-dense pages |
| Bricolage Grotesque | warm grotesque with character, indie | headlines of event pages, community groups, studio work |
| Source Serif 4 | a working serif, sharp at large sizes (has italics) | headlines and numbers of reports, research pages |
| Literata | a calm reading serif (has italics) | long reading text, reports, letters |
| JetBrains Mono | monospaced | code and ids only, never labels or decoration |

Without files: the system stack `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue",
Arial, sans-serif`. It looks different on every device (inside this computer it renders as DejaVu
Sans), so your screenshots will not match what the person sees. Prefer a bundled family.

## Four scales (px; line height in brackets)

| Role | A. Civic | B. Editorial | C. Studio | D. App |
|---|---|---|---|---|
| Fonts | Public Sans only | Source Serif 4 headings and numbers, Public Sans text | Bricolage Grotesque headings, Literata text | Instrument Sans only |
| Small (notes, captions, sources) | 13 (1.45) | 13 (1.45) | 13.5 (1.45) | 12.5 (1.4) |
| Interface (buttons, nav, labels) | 15 | 15 | 15 | 14 |
| Reading | 17 (1.6) | 17 (1.6) | 17 (1.62) | 15 (1.5) |
| Section heading | 21 (1.25), 650 | 22 (1.25), 600 | 22 (1.2), 700 | 18 (1.3), 600 |
| Page title | 28 phone / 40 laptop (1.12), 700 | 30 / 44 (1.1), 600 | 30 / 42 (1.1), 750 | 22 / 28 (1.2), 650 |
| Display number or date | 44 / 56 (1), 700 | 48 / 64 (1), 500 | 48 / 64 (1), 750 | 32 / 40 (1), 600 |

Write the title as `font-size: clamp(28px, 4vw + 12px, 40px)` (phone, then laptop sizes of the scale).

## Rules

- One family, or two with clear jobs (headings and reading). Never three.
- Two weights per family, three at most. Bold is for headings and the key figure, not for emphasis
  in every sentence.
- Large type gets tighter: letter-spacing -0.01em at 28 px and up, -0.02em at 44 px and up.
- Reading lines 55 to 75 characters: `max-width: 66ch` on paragraphs.
- Numbers in tables and figures: `font-variant-numeric: tabular-nums`, right-aligned in tables.
- No all-capitals for more than three words, and no capitals under 13 px. No monospaced labels.
- Italic is for a title, a term or a quotation, never for a colored phrase in the headline.
- Headings sit closer to what follows than to what precedes them (more space above than below).
