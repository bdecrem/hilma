# The speed check (OLA-456)

Bart, Nov 25: "OLA NEEDS TO BE GIVE OR TAKE OPENCODE. SO IT NEEDS TO PRODUCE THE THING IN 5
MINUTES." A fix for Ola's slowness was tried on one page request and called done; a toy then took
15 min 22 s on Ola against 4 min 58 s on plain OpenCode. This check makes that comparison every time
Ola's instructions, skills or tools change, on more than one kind of request.

Each request in `requests.json` (a page, a toy, an app) is made twice on the machine's own model:

- **plain OpenCode**: OpenCode at the image's version in an empty folder, no instructions, no skills,
  no Ola tools, straight to the model the gateway calls `general` (what `spike/plain/run-plain.sh`
  does by hand on the Studio);
- **Ola**: typed into app.ola.cx on a phone-size screen by a made-up person in a new project
  (`web/bart-test.mjs`), timed from Send to the finished reply, every question answered the first way.

Ola passes a request when it finishes with a page within **twice** plain OpenCode's time. One
failed request fails the run.

```
node evals/speed/run.mjs                 # all requests (on the test server or the Studio, as Ola's account)
node evals/speed/run.mjs --only toy      # one request (not written to speed.json)
node evals/speed/run.mjs --fresh         # measure plain OpenCode again
node evals/speed/test.mjs                # its rules, no model, no VM (an update suite, "speed")
```

- **When it runs by itself:** every update that serves starts it in the background (`ops/ola.mjs`),
  and it runs when the update changed `workspace/`, `skills/`, `gateway/`, `frontdesk/examples.mjs`
  or this folder (`lib.mjs` TRIGGERS), or when the update could not say what changed. Log
  `~/ola-speed/run-<release>.log`. `OLA_SPEED_AFTER_DEPLOY=0` leaves it out.
- **Plain OpenCode's times** are kept a week per model, OpenCode version and request
  (`~/ola-speed/plain.json`): a change to Ola does not change them.
- **Results:** `~/ola-staging/speed.json` (the last full run), one line per run in
  `~/ola-speed/history.log`, the pages, logs and screenshots in `~/ola-speed/runs/<time>/` (last ten kept).
- Each Ola walk holds the machine's test turn (`ops/turn.mjs`) and gives it back after; its made-up
  person is suspended and its project's computer destroyed when the walk ends.
