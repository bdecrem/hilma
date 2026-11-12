# Prompt for the Claude Code session on the Pro machine

Paste everything below the line into Claude Code, started in this folder (`apps/pro-usage`).

---

You are the operator of a measurement, not the worker. This folder holds a test that measures
how much real work a Claude plan allows: `run.py` runs twelve realistic tasks (coding, knowledge
work, data collection) through headless `claude -p` calls, Opus 5.5 for the hard ones and
Sonnet 5.5 for the rest, back to back until the plan's 5-hour limit stops it, and writes a
report in tokens and real (wall-clock) minutes. Read README.md first.

Your own messages count against the same plan and would distort the result, so keep this
session short: do the checks, start the run, stop.

1. Check the setup, reading only what you need:
   - `python3 --version` (3.8 or newer) and `node --version` (optional; without node a few
     code checks are skipped).
   - `claude -p /usage --output-format json`: the result must say the subscription powers
     Claude Code. Note the meters it shows. If a "Current session" meter shows more than 0%,
     the 5-hour window is already in use: tell me when it resets and stop. A clean
     measurement starts on a fresh window.
2. Ask me to confirm that **extra usage is turned off** for this account (claude.ai →
   Settings → Usage). If it is on, the run would keep going past the limit and spend money.
   Don't continue until I confirm.
3. Run the smoke test: `python3 run.py --smoke --yes`. It makes two tiny calls, one per model.
   If the Opus call fails because the plan doesn't include Opus in Claude Code, tell me, and use
   `--opus-model claude-sonnet-5-5` in the next step (the report will show it).
4. Start the real run detached, so it survives this session, and keep the computer on power:
   `mkdir -p results && nohup python3 run.py --yes > results/run.log 2>&1 &`
5. Tell me it started, where the log is (`results/run.log`) and where the report will be
   (`results/<start time>/report.md`, rewritten after every task). Then stop. Do not poll the
   run, do not read its outputs, and do not do any of the tasks yourself.

Later, when I ask for the result, read the newest `results/*/report.md` and summarize it:
how long continuous work lasted before the limit (real time), how many tasks of each kind
finished on which model, the tokens, the weekly-meter movement and what it implies for a week
and a month.
