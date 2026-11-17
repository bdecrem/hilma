# Stage 5: build from the recipes

`/opt/ola/skills/designer/assets/components.html` holds plain HTML and CSS recipes (no frameworks),
each marked `RECIPE` in its stylesheet, shown with real-looking words. Copy `assets/base.css` beside
the page, replace its `:root` with your palette and font, then copy only the recipes you need.

| Recipe | Use it for | Rules |
|---|---|---|
| nav | a site of two to five pages | name left, links right, wraps on a phone; the current page marked |
| hero | the first screen | the fact (what, when, where, the number) and one action; no slogan |
| button | the one action per screen | label says what happens; a quiet one for the second action |
| figures | two to four key numbers | the numeral, a short label, the source under the row |
| table | a ledger | hairlines, numbers right-aligned, scrolls inside its box on a phone |
| chart (figure) | a comparison over categories or time | drawn from the real numbers in SVG; title states the finding; caption the source |
| form | sign-up, contact, a survey | labels above, help text, 44 px fields, errors in words beside the field, "Step 1 of 2" |
| card | separate objects a person chooses between | rarely; flat, a 1 px rule, radius 4 |
| empty state | a list with nothing in it yet | what goes here, how it fills, one action |
| footer | who made it, when, the source, a contact | one dark band at most |

## A multi-step flow

One question or one group per screen; the step line ("Step 2 of 3") at the top; Back and Continue
at the bottom; the last screen says what happens next and when. Each step is its own page
(`step-1.html`, `step-2.html`, ...) or a section shown one at a time with a small script.
Never lose what the person typed when they go back.

## A dashboard

The number that matters most first and largest; then a ledger of the other measures, each with
this period, the last one and the change; small charts share one scale and one color. Dates of the
data at the top ("Data to February 28"). No tiles with icons.

## Charts without a library

Draw bars and lines as SVG from the data in a script or by hand: compute each bar's length as
value / max * width and write the arithmetic in a comment. Put the value at the bar's end. Use the
`chart` skill when a PNG or SVG file is wanted for a document.
