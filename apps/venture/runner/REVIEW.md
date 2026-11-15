# Reviewing a fixed document before it goes to anyone

The brief for the independent read that every fixed PDF gets before it is sent
to a customer or published as a sample. It exists because of November 14, 2026:
the fixing pipeline declared four new agendas READY, and a reviewer who had not
built them found two of them not ready (struck-through text read as ordinary
text; a numbered list cut into pieces at each page break), with nothing flagged.
The pipeline's own verdict is necessary and not sufficient.

Whoever fixed the document does not review it. Give this file to a fresh agent
(the Agent tool, general purpose) with the folder to read, and act on its
verdict only.

## The brief (give it as written, with the folder filled in)

Independent review of a PDF that was made accessible by an automated pipeline.
You did not build it. Your verdict decides whether it is sent to the office
that posted the original, as an example of careful work. Be strict: a wrong
"ready" costs more than a wrong "not ready".

The folder `<FOLDER>` holds `original.pdf` (as posted), `fixed.pdf` (the same
pages with tags added), `transcript.txt` (the fixed file's tag tree in reading
order: headings with levels, paragraphs, lists, figures with descriptions,
links with descriptions, language marks, and at the end what is marked as
decoration and not read aloud), `before.json` and `after.json` (veraPDF
PDF/UA-1 results), `result.json` (the pipeline's verdict and its `to_read`
list), and `work/tags.txt`.

Render every page of the original to an image (the Python at
`apps/venture/private/pdf-proof/.venv/bin/python`, run with `-I`, has pymupdf
and pikepdf; about 100 dpi; write images only to a temporary folder) and look
at each page while reading the transcript for that page. Check the fixed file
directly with pikepdf where the transcript leaves a doubt: at least that the
heading and link counts match the transcript, that the language and title are
set, and that every page has `/Tabs /S`.

Page by page:

1. Reading order: everything in the order a sighted person reads it; nothing
   twice, nothing out of place.
2. Headings: every visual heading is a heading at a sensible level, no level
   skipped, nothing tagged as a heading that is not one, one H1.
3. Lists: numbered or lettered items are list items (or headings) the same way
   on every page; no series changes form at a page break; no sentence is cut
   in two where a page ends.
4. Links: each link's text or description tells a listener where it goes;
   links with the same name can be told apart; no link without text; no
   description that asserts something nobody checked.
5. Images: each description is accurate; nothing meaningful is marked as
   decoration; no decoration is read aloud.
6. Words: nothing visible is missing from the transcript and nothing is in it
   that is not on the page; no run-together or broken words; text that is
   struck through, highlighted or otherwise marked on the page is conveyed as
   such.
7. Passages in another language are marked.
8. The title announced on opening fits the document.

Verdict: READY, READY WITH NOTES (list them; none would embarrass us in front
of the person who posted the original), or NOT READY (exactly what, with the
page and the words). Then every fault, most serious first, with page, words,
and what a listener would experience. Change no file. Contact nobody.

## Acting on the verdict

- READY, or READY WITH NOTES: it may go out. Put the notes in the log.
- NOT READY: it does not go out. Tell the customer when they will have it and
  put the faults at the top of the next actions; a terminal session fixes the
  pipeline or the file.
- Faults that recur across documents are the pipeline's: write them down for
  the next pipeline pass, with the documents that show them.
