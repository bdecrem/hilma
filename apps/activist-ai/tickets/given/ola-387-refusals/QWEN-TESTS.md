# Tests for two of the ten bugs (OLA-520, Nov 27)

Two test files, one per bug. Both are **red on the current code** because of the bug, and go green
when the bug is fixed. They are checked like that: each was run red, then against a sample fix,
then red again with the fix taken back. Both are plain `node --test` files, no browser, no server,
no model: a few seconds.

They sit with the tests of that part of the code and match the style there (the folder's own
`npm test` glob picks up `test/*.test.mjs`, so `npm test` in `frontdesk/` and `web/` is red until
the bug is fixed — that is the point, not a mistake in the run).

---

## OLA-387 — the refusal counter misses common ways of saying "I cannot"

- **Bug id:** OLA-387
- **Test file:** `apps/activist-ai/frontdesk/test/faults-refusal.test.mjs`
- **Command (from `apps/activist-ai/`):** `node --test frontdesk/test/faults-refusal.test.mjs`
- **Also fine from the repo root:** `node --test apps/activist-ai/frontdesk/test/faults-refusal.test.mjs`
- **Red today:** 3 of its 4 checks fail.

**What it checks.** That `refusalOf` in `frontdesk/faults.mjs` names the five ways Ola really said
"I cannot" in November ("I don't have a way to send text messages.", "Sending texts isn't something
I can do.", "I have no way of making phone calls.", "That's outside what I can do from this
project.", "I can only work with files in this project, so I won't be able to call her.") — today
all five come back `null`, so the turn is counted as an ordinary answer and never becomes a case.
It does not pin which bucket the fix picks: it only asks that the answer is read as a refusal, one
of the fixed `KINDS`, of the `refusal` type.

It also checks the other half of the ticket: "I can't send emails myself, but here's a draft" must
not be labelled `cannot_here` — `here\b` matching "here's" makes Ola look like it blamed the place,
when it said it cannot send the email and offered a draft. And a turn with one of these answers
must reach the counter: `readTurn` and `keptKinds` have to carry the refusal in `kinds`, in a cloud
run and on a kept turn from a Mac.

Two guards keep a fix honest: the two answers `faults.test.mjs` already expects to be nothing
("…and says Bart.", "You can open it here.") must stay unlabelled, so a wider rule may not start
reading every sentence with "here" or "can" as a refusal.

**Where the fix goes:** `frontdesk/faults.mjs`, `CANT` and `REFUSALS` (lines 56–65). A lookaround
like `here\b(?!'s)` is fine in a regex literal (that is the shape the sample fix used, run and
green); the trap is in a character class, where a `-` between two characters reads as a range.

---

## OLA-376 — Files refuses a file whose name has an apostrophe or #

- **Bug id:** OLA-376
- **Test file:** `apps/activist-ai/web/test/files-names.test.mjs`
- **Command (from `apps/activist-ai/`):** `node --test web/test/files-names.test.mjs`
- **Also fine from the repo root:** `node --test apps/activist-ai/web/test/files-names.test.mjs`
- **Red today:** 2 of its 3 checks fail.

**What it checks.** That `Rosa's notes.pdf` and `Intake scan (Oct) #2.pdf` are accepted as file
names, and that one really gets uploaded: through `makeFiles().upload()` in
`web/server/files.mjs` (the same `validName` the front desk's `POST /api/files` calls at
`frontdesk/server.mjs:860`), landing in the project folder under the name it came with, listed as
`uploaded`, and readable back with `safeRelative` + `open()` — so the fix has to hold for the
upload and for opening and downloading what was just sent, not only for the first `if`. The names
that are still refused are checked too, and that nothing at all is written for them: `''`,
`.env`, `../x`, `a/b`, `/etc/passwd`, a NUL, a name with a newline, 201 characters. Those are what
the rule is really for; the fix has to get kinder, not open.

**Where the fix goes:** `web/server/files.mjs` line 15 (`NAME`) — and the same rule copied in two
other places, which the ticket's one-file fix would leave behind: `UPLOAD_NAME` in
`workspace/ws.mjs` (line 78, checked again at 804 and 1261) and `NAME` in `workspace/ola-put`
(line 19). On the Studio the upload goes through those, so a name fixed only in `files.mjs` still
fails on a real machine. Two traps: inside a character class `,-'` reads as a range and throws
"Range out of order" (this was hit while verifying), and `#` and `'` must survive the shell
quoting in `ola-put` / `ws.mjs`.

**Deliberately not pinned:** the wording of the refusal message. The ticket is right that "Rename
it with letters, digits and spaces" is wrong — hyphens, dots, underscores and brackets pass — but a
test on the sentence would stay red after a correct fix and go green after a wording change that
fixes nothing. The test file says so at the top.
