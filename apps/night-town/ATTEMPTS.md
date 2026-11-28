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

## Attempt 3 (18:15 to 18:36, the clock stopped it)
- Ran: three rounds of six jobs in 6.1, 8.1 and 7.3 min, 17 of 18 kept (bakery, trees, smoke, birds, bell, market,
  clouds, fireflies, stars, mice, shadows, cart, windmill ...); swaps 34 to 37 s a round; the town spread over all
  three streets; earlier checks take about 0.05 s each; it stopped itself with 8 minutes left and Ola's model loaded.
- Broke: nothing stalled. The one rejection was real: "well" passed alone and failed after the round's other parts
  were merged (its own check false). But 94% kept means the jobs are too easy to teach us much.
- Changed: the mayor is told how the last round went and adjusts: at 80% kept it asks for bolder jobs (parts that use
  each other, two-step behaviors, people doing things together), at 40% or less smaller ones.

## Attempt 4 (18:37 to 19:06, through start.sh, the clock stopped it)
- Ran: the real launcher (start.sh under caffeinate); rounds of 6.2, 12.4 and 10.2 min; 12 of 15 kept. After a 6 of 6
  round the mayor asked for bolder jobs (tavern drink-then-home, a dog that chases the cat, a school, a pond, a night
  watchman) and the keep rate fell to 4 of 6, then 2 of 3: the dial works.
- Broke: no stall, no crash; swaps 34 to 36 s a round (about 5% of a round). The rejections were real conflicts:
  school and pond each passed alone and broke the tavern once merged beside it; the windmill hit the 8-minute cap.
- Changed: nothing. Ready for the night: `start.sh --until 07:00` from a fresh seed in ~/night-town.
