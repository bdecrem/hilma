---
name: batch-quotes
description: Ask the same question of every document in a set (dozens to thousands) and get one row per document with verbatim quotes and page numbers, each quote checked by a program. Use when the person wants something found, coded or extracted across many files.
license: Proprietary
disable-model-invocation: true
metadata:
  ola/version: "0"
  ola/status: "placeholder: waits for the ola-batch job runner"
  ola/specialists: "read ocr"
  ola/evals: "c2-code-traps c3-code-pages c4-code-corpus g1-code-360 p3-code-pdfs"
  ola/owner: "ola"
---

# Asking the same thing of every document (placeholder)

**Not in use yet.** This skill is hidden from the agent (`disable-model-invocation: true`) until the
job runner `ola-batch` is in the image and its interface is published in the README. When it is,
these instructions are written against that interface, tested on the evals listed above, and the
skill is turned on (version 1).

What the finished skill will do, so the instructions have a shape to fill:

1. Agree the question with the person first: the fields, their allowed values, and what counts as
   "not stated". Write it down as a small scheme file.
2. Pilot on 10 to 20 documents, show the person the rows with their quotes, refine, and get a yes
   with an estimate of time and tokens before the full run.
3. Run the whole set as a job (`ola-batch`): one row per document, every value with a verbatim quote
   and its page, resumable after a restart, nothing coded twice.
4. Check every quote against its page by program; retry only the values whose quote failed; report
   the share of quotes found on their stated page.
5. Hand over the table (and a workbook with the workbook skill), the quote-check rate, and the
   documents that could not be read.

Until then, for a handful of documents, do it directly: read each document's pages with
`pdftotext -f N -l N`, write one row per document with a quote and its page, and check each quote
with a short script that searches the page text word for word.
