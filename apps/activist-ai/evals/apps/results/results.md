# App problems: results

One run per cell, scored by the problem's check (passed sub-checks of all; the name in brackets is the first one that failed). Rebuilt by `node run.mjs report`. The Claude Code column ran on Bart's default model that day (Ola's `/claude` passes none). Screenshots and the built folders are on the iMac under `~/Library/Caches/ola-eval/runs-apps/`.

| Problem | open weights (Nemotron 3.5 Super VL) | Claude Code | local |
|---|---|---|---|
| crossword (real request) | 1 of 7, fail (grid_5x5), 7 min | 7 of 7, pass, 2 min, Fable 5.2 | from Dec, when the Studio serves the model |
| tip-split | 6 of 6, pass, 3 min | 6 of 6, pass, 49 s, Fable 5.2 | from Dec, when the Studio serves the model |
| countdown | 2 of 5, fail (shows_10_days), 10 min | 5 of 5, pass, 50 s, Fable 5.2 | from Dec, when the Studio serves the model |
| signup-sheet | 5 of 5, pass, 70 s | not run (Claude runs capped at four problems) | from Dec, when the Studio serves the model |
| todo-due | 4 of 5, fail (shows_due_date), 25 s | not run (Claude runs capped at four problems) | from Dec, when the Studio serves the model |
| memory-game | 6 of 7, fail (face_down_start), 23 s | 7 of 7, pass, 37 s, Fable 5.2 | from Dec, when the Studio serves the model |
| unit-converter | 2 of 6, fail (temperature), 14 s | not run (Claude runs capped at four problems) | from Dec, when the Studio serves the model |

The requests, word for word:

- **crossword**: "build me a smart app that uses ai to generate a crossword puzzle on demand"
- **tip-split**: "make me a tip calculator that splits the bill between a group of people"
- **countdown**: "make a countdown page for our neighborhood rally on March 14, 2027 at 10am, with a button so people can share it"
- **signup-sheet**: "make a sign-up sheet page for our volunteer park cleanup where people add their name and it remembers everyone who signed up"
- **todo-due**: "build me a to-do app where each task has a due date"
- **memory-game**: "make a simple memory game where you flip tiles to find matching pairs"
- **unit-converter**: "make a unit converter for distance, weight and temperature"
