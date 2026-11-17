---
name: workbook
description: Make an Excel workbook (.xlsx) a person can open and send on, with a summary sheet, the data sheets with frozen headers, filters and number formats, and a notes sheet saying what was dropped or assumed. Use whenever the person asks for a spreadsheet, an Excel file, a workbook or a table they can sort and filter.
license: Proprietary
metadata:
  ola/version: "1"
  ola/specialists: "none"
  ola/evals: "s3-workbook-summary s4-workbook-safe-text"
  ola/owner: "ola"
  ola/needs: "python:openpyxl"
  ola/mac: "yes"
---

# Making a workbook

People open these files on their own computers and send them to others. A workbook has to open
cleanly, read well at a glance, and say honestly what is in it.

## Steps

1. **Clean the data in code first.** Read the input with Python (`csv`, `openpyxl` for an .xlsx,
   or the project database with `ola-db query`). Fix types, units and duplicates in code. Write each
   table you will put in the workbook as a CSV (or keep it as a query on the project database).
   Keep a list, as you go, of every row you dropped and every assumption you made, with counts and
   identifiers: "Dropped 3 rows with no amount (ids 12, 40, 77)." That list becomes the Notes sheet.
2. **Make the summary in code.** The numbers on the Summary sheet are computed (a query or a
   script), not typed. Save them as a small CSV: one row per group, plain column names
   ("Program", "Grants", "Total amount (USD)").
3. **Build the workbook with the script:**

   ```
   python3 /opt/ola/skills/workbook/scripts/workbook.py build --out grants-2026.xlsx \
     --title "Grants paid in 2026, by program" --source "grants.csv, uploaded 2026-11-16" \
     --summary summary.csv --data "Grants=grants_clean.csv" \
     --note "Dropped 3 rows with no amount (ids 12, 40, 77)." \
     --note "Two grants were entered twice (ids 18 and 51); each is counted once."
   ```

   A sheet can come straight from the project database:
   `--db /work/project.db --data "Programs=sql:SELECT name, region FROM programs ORDER BY name"`.
   It makes the sheets Summary, then the data, then Notes, with bold frozen headers, filters,
   column widths and number formats, and stores values only.
4. **Read the check.** `build` ends by reopening the file: it opens, the sheets are in order, no
   cell is a formula, the headers are frozen and filtered, the row counts match. If it fails, fix
   the cause and build again.
5. **Check the summary against the data yourself:** total the data sheet's numbers in Python and
   compare with the Summary sheet. Say the totals in your reply.
6. **Tell the person** the file name as they see it under Files, what each sheet holds and how many
   rows, and the notes: what was dropped or assumed.

## Rules

- **No formulas.** A file that computes on open can surprise the reader, and text from someone
  else's data that starts with `=`, `+`, `-` or `@` can run as a formula. The script stores such
  text as plain text; do not write workbooks another way that loses this.
- Identifiers keep their leading zeros (they are text). Dates are real dates (YYYY-MM-DD).
- One table per sheet, starting at the top left, one header row. No merged cells, no blank rows
  inside a table, no colors that carry meaning.
- Column names in plain words with the unit: "Amount (USD)", not "amt_usd".
- If nothing was dropped or assumed, say that in a note.
