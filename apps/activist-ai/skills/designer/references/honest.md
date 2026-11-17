# Stage 7: honest and usable

A beautiful page that some readers cannot use, or a chart that misleads, is a failure.
`look.py` checks the items marked (program).

## Everyone can read and use it

- Text contrast at least 4.5 to 1, large text 3 to 1, lines that carry meaning 3 to 1 (program).
- Real headings in order: one h1, then h2, then h3 (program). Headings are words, not images.
- Every image has alt text that says what it shows; decoration gets `alt=""` (program).
- A chart is an `<svg role="img" aria-label="...">` whose label states the finding, or sits in a
  `<figure>` with a `<figcaption>` (program).
- Every form field has a visible `<label>` above it (program); errors say what to do, in words,
  next to the field, not only in red.
- A visible focus style on links, buttons and fields (program):
  `:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }`
- Tap targets 44 px tall on a phone (program).
- Motion only to show a change, and none under reduced motion (program):
  `@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }`
- Language set: `<html lang="en">`. A title in `<title>`.

## Charts tell the truth

- Bars start at zero. A line chart may start elsewhere only if the axis says so plainly.
- Missing data is a gap, never a zero.
- The title says the finding ("Rents rose fastest in the north"), the caption says the source,
  the date and anything left out ("Source: rents.csv, 2025. Two buildings had no data.").
- Label the values or the axis, not both; label lines at their ends instead of a legend when you can.
- One color per series, the same everywhere on the page; the accent for the series that matters.
- No 3D, no pie with more than three slices, no dual axes.

## Honest content

- Numbers exactly as in the source, with units. Rounded numbers say they are rounded.
- Drafts marked as drafts. Nothing invented: no testimonials, logos, partner names or counts.
