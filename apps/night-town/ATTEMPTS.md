# Trial attempts before the night (Nov 27)

Each attempt is a real run of the whole loop for about 30 minutes from a fresh seed (`--minutes 30`), in its own
folder on the Studio (`~/nt-attempt-<n>`).

## Attempt 1 (17:44, stopped at 17:49)
- Ran: the loop started, Qwen came up in 16 s, Ola's own model came back in 20 s.
- Broke: the mayor spent all 16,000 tokens thinking (209 s) and wrote no answer; round 2 would have done the same.
- Changed: the call asks for `reasoning_effort: 'low'` (probe: 58 s, 4,100 thinking tokens, precise jobs; with
  thinking off it took 9 s but its jobs were vaguer and one asked to edit people.js from a new file).
