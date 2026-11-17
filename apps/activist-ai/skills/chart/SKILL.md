---
name: chart
description: Make a chart from a table, a CSV or a query on the project database, saved as PNG and SVG with the data file behind it and a caption that says what the numbers are and where they came from. Use whenever the person asks for a chart, graph, plot or figure, or a chart for a report, page or slide.
license: Proprietary
metadata:
  ola/version: "1"
  ola/specialists: "none"
  ola/evals: "s1-chart-db s2-chart-gaps"
  ola/owner: "ola"
---

# Making a chart

A chart is a claim about numbers. It has to be right before it is pretty, and a reader has to be
able to check it. So every chart leaves four files: the picture twice (PNG for documents, SVG for
pages), the exact rows it drew, and a small record of where they came from.

## Steps

1. **Get the numbers in code, not by reading.** Compute the table with a query or a short Python
   script. If the data is in the project database, query it there (`ola-db query "SELECT ..."`, or
   pass the query to the script below). Count, sum or average in SQL or Python, never in your head.
   Save the result as a CSV if it is not one already.
2. **Look at the table before you draw it.** Print it. Are there rows with no number, a total row,
   duplicates, a unit that changes? Fix those in the query, or let the script leave them out and
   say so. Never turn a missing value into zero.
3. **Pick the form from the question:**
   - comparing amounts across categories: `bar` (or `hbar` when the labels are long or there are
     more than 8 of them), sorted largest first unless the categories have an order of their own;
   - change over time: `line`, with time in order on the horizontal axis;
   - how two measures relate: `scatter`.
   Never a pie, 3D or a second vertical axis. Several series: at most 4; past that, make several charts.
4. **Draw it with the script** (it enforces the honest parts: bars start at zero, missing values are
   gaps, dropped rows are counted in the caption):

   ```
   python3 /opt/ola/skills/chart/scripts/chart.py draw --csv table.csv --x region --y studies \
     --kind bar --sort desc --title "Studies per region" --what "Number of studies" \
     --source "studies table in the project database, 2026-11-16" --out charts/studies-by-region
   ```

   or straight from the database:

   ```
   python3 /opt/ola/skills/chart/scripts/chart.py draw --db /work/project.db \
     --sql "SELECT region, COUNT(*) AS studies FROM studies GROUP BY region" --x region --y studies ...
   ```

   `--title` says what the chart shows in the reader's words. `--what` names the numbers and their
   unit ("Rainfall (mm)"). `--source` names the file or table and its date; if the data came from
   the web, give the address and the download date. A line chart may start above zero only with
   `--no-zero`, and the caption then says so.
5. **Read the check.** `draw` ends by running `chart.py check`, which reopens the PNG and SVG and
   proves the drawn values equal the data file. If it fails, fix the cause and draw again. Do not
   hand over a chart whose check failed.
6. **Compare with your own numbers.** The script prints the caption. Check one or two values in the
   data file against your table by hand, and the row count against what you expected.
7. **Tell the person** in plain words: what the chart shows, the file names as they see them under
   Files (`charts/studies-by-region.png`, `.svg` and the data file `.csv`), how many rows it rests
   on, and anything left out and why.

## Putting it in a page or a document

- In a page, use the SVG with a relative path (`<img src="charts/studies-by-region.svg" alt="...">`)
  and put the caption under it as text. The alt text says the finding, not "chart".
- In a Word or PDF report, use the PNG (the report skill does this).

## What not to do

- Do not draw numbers you typed in from memory or from reading a file by eye.
- Do not drop rows silently, or clip the axis to make a difference look bigger.
- Do not decorate: no gradients, shadows, background colors, or a color per bar. One series is one color.
