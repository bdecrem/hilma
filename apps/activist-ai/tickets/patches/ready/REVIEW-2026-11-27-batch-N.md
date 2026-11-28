# Review of batch N: OLA-521 and OLA-385 (Nov 27)

Nothing was applied to the main checkout, committed, pushed or deployed. The checks ran in a throwaway worktree of origin/main (09556348), since removed. Both corrected patches apply to today's origin/main, alone or together.

## Verdicts

1. **OLA-521 (click-through log quotes button labels): MERGE WITH THIS CHANGE.** The three tries are the same code, and all three fix the leak at its cause. All three also drop one useful fact that is not content: whether a script error came when the page loaded or when a control was pressed. The corrected patch is try 2 with that fact put back: `review-ola-521.diff`.
2. **OLA-385 ("Used execute"): MERGE WITH THIS CHANGE.** Try 3 is the right fix and the narrowest one. But the same rule is copied in Bart's Mac and iPhone apps (`apple/OlaKit/Sources/OlaKit/Steps.swift`, which says "a port of web/src/lib/steps.ts: keep the two in step"), and no try touched it. The corrected patch is try 3 plus the Swift copy plus the README line: `review-ola-385.diff`.

## 1. OLA-521: `frontdesk/poke.mjs` deadWord

**Cause.** `deadWord` wrote each dead control's label, clipped to 24 characters, into the front desk log. That is the only place the line is built. `server.mjs` logs `pokeLine` and `pokeNoteLine` and nothing else from a poke. `workspaces.poke` (in `workspace/ws.mjs`) logs nothing, and the `say` sentences go to the page and the model, not to the log.

**The tries.** All three change `deadWord` to `button N of M` / `field N of M` / `script error N of M`, where N is the place in the dead list and M is how many are dead. They differ only in comments. Try 1 has one very long comment line. Try 3 says the same thing twice. Try 2 is the cleanest. Each one passes all 162 frontdesk tests with Qwen's two files added. On main, Qwen's files pass 14 of 21.

**What it loses.**
- Main said `script error on load` (no control) or `script error on '<label>'`. Every try makes both `script error 3 of 3`, so the reader can no longer tell an error on load from an error on pressing. That fact holds no content, and it is the first thing you want to know about a dead page. The corrected patch says `script error 3 of 3 (on load)` or `(on a control)`.
- The reader can no longer tell *which* control on the page was dead. "button 1 of 3" means the first of three dead things, not the first button on the page. The ticket's "button 3 of 11" (a place on the page) cannot be done in the front desk: `workspace/ola-poke` does not report a control's place. Doing it means changing ola-poke and bumping the workspace image. That is not worth it for a trace whose job is "did it run, which page, what kinds of things were dead". The person still gets the full sentences with the labels on their own page, so nothing is lost for them. This is acceptable under the no-content rule.

**OLA-522's newer lines.** The patch's base is e5217deb's poke.mjs, which is today's main, so it applies cleanly. `pokeNoteLine` logs only an event and a count, never a label. The patch updates the OLA-522 test's expected line ("1 dead: button 1 of 1"). That was right, since the line itself changed.

**Existing test changed.** `test/poke.test.mjs` compared whole lines with quoted labels. Changing it is required (Qwen's TESTS.json said so), and each try changed exactly those two lines.

**The corrected patch** (`review-ola-521.diff`): try 2, plus `(on load)` / `(on a control)` on script errors, a comment that says what is logged, the matching line in poke.test.mjs, and Qwen's `test/pokedead.test.mjs` and `test/pokedead.held.test.mjs`. Both test files end in `.test.mjs`, so `node --test test/*.test.mjs` picks them up. Result: 162 of 162. Sample line: `3 dead: button 1 of 3, script error 2 of 3 (on a control), script error 3 of 3 (on load)`.

## 2. OLA-385: `web/src/lib/steps.ts` describeTool default

**Cause.** `describeTool`'s last case returned `{ verb: 'Used', object: tool }`, so any tool without words printed its own name ("Used execute"). Claude Code's unknown names go through the same function. The rebuilt tab (`turnsFromMessages`) and the live run (`applyEvent`) both use it too, so one line fixes the web app.

**The tries.** All three pass all 136 web tests with Qwen's files added. On main, 7 fail.
- **Try 3 (pick).** The default becomes `verb: 'Used a tool', object: ''`. `present()` gets `Used → Use`, so a Claude approval for an unknown tool reads "Claude wants to use a tool" (before, it read "Claude wants to used SlashCommand"). `conversation.test.ts:145` changes from 'Used' to 'Used a tool', as Qwen predicted it must.
- **Try 1.** Same idea, as `verb 'Used', object 'a tool'`. It also rewrites two approval paths, and this is too broad. Every unknown permission title goes through describeTool ("Ola wants to use a tool"), and the Claude approval's item label stops showing the tool name. These are approvals the person must decide on. That is a different question from this ticket, and vaguer words there are not clearly better.
- **Try 2.** Try 3 plus a fixed "Ola wants to use a tool" for every unknown approval, the same over-reach as try 1. It does update the README line, which is good, and that line is in the corrected patch.

**Other copies of the rule.**
- `apple/OlaKit/Sources/OlaKit/Steps.swift:147` has the identical `Words(icon: .other, verb: "Used", object: tool)`, and its `present()` table lacks `Used`. Bart's Ola apps would still print "Used execute". This is the earlier review's "copied in another part" flaw. It is fixed in the corrected patch, and `swift build --target OlaKit` succeeds. No Swift test pins "Used".
- `web/README.md:95` still said unknown tools "fall through to 'Used <name>'". Fixed.
- `tickets/ten-bugs.txt` mentions it as history. Left as is.

**What it loses.** Nothing for the person: the call is still under Show details, and `step.tool` is still recorded (Qwen's test checks both). Three Code Mode calls now read as three identical "Used a tool" lines. That is plainer but not very informative. Words for what `execute`'s code did would be better, but that is a different, bigger change.

**The corrected patch** (`review-ola-385.diff`): try 3, plus the Swift default, the Swift `present()` row and comment, the README line, and Qwen's `test/stepwords.test.ts` and `test/stepwords.held.test.ts`. Both end in `.test.ts`, so `npm test` picks them up. Result: 136 of 136.

## Qwen's tests

- **OLA-521: good.** They use many different labels (names, an address, duplicates, long ones) and pin the rest of the line exactly, so a phrase-fitted or too-broad fix would fail. They missed one thing: none of them checks that "on load" survives, and that is why all three tries dropped it.
- **OLA-385: good.** They test four unknown names, not just `execute`, plus Claude's names, a failed step, the step before its arguments arrive, and the rebuilt tab. An `execute`-only fix would fail them, and so would a fix that broke known tools. They cannot see the Swift copy, and they do not cover approval titles.

## Still open after these merge

- **Approvals still show raw names (same kind of leak, not this ticket).** An unknown permission's title is `Ola wants to ${action}` (steps.ts:299, Steps.swift:329). A Claude approval's item label is the raw Claude tool name (steps.ts:355, Claude.swift:42). It needs its own ticket, with a decision on what an approval for an unknown thing should say.
- **OLA-521, which control on the page.** If the log should name a control's place on the page ("button 3 of 11"), ola-poke has to report each control's index, and that needs an image bump. Not needed for the ticket.
