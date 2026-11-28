# Trial attempts before the night (Nov 27)

Each attempt is a real run of the whole loop for about 30 minutes from a fresh seed (`--minutes 30`), in its own
folder on the Studio (`~/nt-attempt-<n>`).

## Attempt 1 (17:44, stopped at 17:49)
- Ran: the loop started, Qwen came up in 16 s, Ola's own model came back in 20 s.
- Broke: the mayor spent all 16,000 tokens thinking (209 s) and wrote no answer; round 2 would have done the same.
- Changed: the call asks for `reasoning_effort: 'low'` (probe: 58 s, 4,100 thinking tokens, precise jobs; with
  thinking off it took 9 s but its jobs were vaguer and one asked to edit people.js from a new file).

## Attempt 2 (17:51 to 18:15, stopped early once the lessons were clear)
- Ran: round 1 in 7 min, 6 of 6 kept (fountain, lamps, chat, cat, shop, smoke); round 2 in 13.7 min, 3 of 6 kept
  (garden, ducks, fireflies); swaps about 35 s a round, the mayor 35 to 81 s at low effort.
- Broke: all three rejections were the same kept check, "smoke" (`particles.length > 0` after 10 hours), turned false
  because the new part drew from the town's one shared random stream and so changed when smoke puffed. Bell and busker
  ran the full 8 minutes. A round 3 started with 8 minutes left and could build nothing. Everything was built along one street; the fountain went on the crossroads.
- Changed: one random stream per part (a new part cannot change an old part's luck); the mayor is told checks must
  not hinge on one random draw and that nothing goes on a road; a seed check that the town still lives; two more
  streets in the seed so the town spreads; the mayor gets a second try per visit; a crash still puts Ola's model back; no new round with under 12 minutes left.
