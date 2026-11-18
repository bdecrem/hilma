# Ola's skills

A skill is Ola's own written know-how for one kind of work: when to use it, the steps, the scripts
that do the mechanical parts, and the checks that prove the result. It is the part of Ola meant to
get better every week, whatever model runs underneath.

| Skill | What the person can ask | Scripts | How the result is checked | Evals |
|---|---|---|---|---|
| `chart` | "Make a chart of studies per region" | `chart.py draw` (bar, hbar, line, scatter from a CSV or a read-only query) and `chart.py check` | PNG and SVG reopened; the drawn values equal the data file; bars start at zero; missing values are gaps; the caption names the source and counts what was left out | `s1-chart-db`, `s2-chart-gaps` |
| `workbook` | "Make an Excel file I can send to the board" | `workbook.py build` and `check` | Reopened: Summary, data, Notes in order; no formulas (text starting `= + - @` stays text); headers bold, frozen and filtered; row counts match | `s3-workbook-summary`, `s4-workbook-safe-text` |
| `report` | "Write a two-page brief as a Word document" | `report.py check` and `build` (.docx with python-docx, .pdf with reportlab, no browser) | Every number or quotation has a source; cited files and pages exist; every quotation is word for word on its cited page | `s5-report-brief`, `s6-report-quotes` |
| `designer` | "Make a page for our meeting", "this page looks bad on a phone", "make it look professional"; in the Bold register (`references/bold.md`), "a fun, colorful page for our block party", "something gorgeous for our fundraiser" | `fonts.py` (ten bundled OFL families, four of them Bold display faces), `palette.py` (a tonal palette from one hue, contrast checked; `--bold`: three to five inks from a preset such as riso, or a scheme, each with the text color that reads on it), `sheet.py` (directions side by side), `look.py` (`ola-page` at 390 and 1280 px, `ola-see` on laptop, phone and a blurred view) | Everything design-pass checked (sideways scroll, things past the edge, cut-off text, contrast with the ratio, tiny text, long lines, too many fonts or sizes, outside requests), plus the decorated failures (gradients, glows, rounded cards, pills, emoji, a colored phrase in the headline, placeholder text, several accent colors), the bare ones (no size contrast, white with one blue and no picture), the first screen's order (the squint test) and the usable basics (alt text, labels, focus, reduced motion, tap targets) | `s7`, `s8`, `u1` to `u5` |
| `app-designer` | "Design three screens of our phone app", "the app feels unfinished" | `screens.py` (every screen of a clickable prototype at 393 x 852 at 2x or 1180 x 760, light and dark, and a sheet of all); `app.css`, `prototype.js`, a starter | Links to screens that do not exist, screens nothing opens, no Settings or no About with a version, contrast, tiny text, decoration, placeholder text | `u6`, `u7` |
| `sound` | "Add a chime for new messages", "a short tune for our campaign page", "calm music people can turn off", "the sounds hurt our ears" | `assets/olasound.js` (the kit: felt-marimba interface sounds in one family, a melody player, the approved pad and the chamber dub engine), `listen.py` (every sound the page plays rendered offline in the headless browser, a spectrogram and one .wav per sound) | Nothing before a click, a sound on/off switch that silences everything, interface sounds quiet (peak -12 dBFS at most), no clipping, little energy above 5 kHz, soft attacks and clean endings, one sound system; a tune in one key, with a figure that comes back, ending on the home note (a pentatonic random walk fails) | `v1` to `v6` |
| `batch-quotes` | (placeholder, hidden) | none yet | waits for `ola-batch` | the coding and PDF evals |

## The format

The open Agent Skills format, which opencode 2.3.0 reads natively (checked against
opencode.ai/docs/skills on 2026-11-16, and in a VM): one folder per skill with

- `SKILL.md`: YAML frontmatter (`name` equal to the folder, a `description` that tells the agent
  when to load it, `license`, and `metadata` with `ola/version`, `ola/evals`, `ola/specialists`,
  `ola/owner`), then the instructions, under 500 lines. The agent sees each skill's name and
  description at every step and loads one with its `skill` tool; the body and the files below
  are read only when the instructions say so.
- `scripts/` (Python run in the VM), `references/` (longer guidance), `assets/` (templates).
- `CHANGELOG.md`: one line per version: what failed, what changed, which evals moved.
- `tests/`: `test_*.py`, run inside the image by `workspace/check.mjs`.

`check.py` (run by `workspace/check.mjs`) holds the folder to these rules.

## Where they live in the image, and why nothing in a project can change them

`ws.mjs image` stages the build context with `workspace/` and each skill folder, so the image's
`/opt/ola/skills` is exactly this folder, read-only like the rest of the root, and labels the
image `ola.skills=<hash of the skill folders>` (the check proves the label equals the repo's hash).

opencode would also find skills in a project: `.opencode/skills`, `.claude/skills`,
`.agents/skills` at any level of `/work`, and any folder a `/work/opencode.json` lists. Measured
with opencode 2.3.0 and Ola's skills named in its ordinary (global) config, as the image's other
settings are: a planted `opencode.json` listing a folder with its own `chart` replaced Ola's
`chart`, and planted skills in `.opencode/skills` and `.claude/skills` were offered. So Ola's
system config, `/etc/opencode/opencode.jsonc` (from `workspace/opencode-system.jsonc`), which
opencode ranks above every global and project config and whose policies outrank all of theirs:

- names `/opt/ola/skills` in `skills` (the highest-ranked list, so an ID that collides with a
  project's loses there), and
- denies `skill.use` for every ID, then allows Ola's by name.

The image also sets `OPENCODE_DISABLE_PROJECT_CONFIG=1` (review 4); the system config does not
depend on it. `workspace/check.mjs` plants a same-ID `chart`, new skills in `.opencode`,
`.claude`, `.agents` and a subfolder, and a `/work/opencode.json` plus `/work/.opencode/opencode.json`
that list more and allow every skill, then proves opencode still offers exactly Ola's skills from
`/opt/ola/skills`, refuses to load a planted one into a session, and that neither the skills nor the
system config can be written from inside. opencode's built-in skills (its own docs, bug reports, the
desktop browser) are denied too.

## In Bart's own apps (2026-11-17)

Bart's Mac app ("On this Mac") and his server on the machine (`bart/ola-bart.sh`) offer these skills
too, and nothing else: each writes a fresh read-only copy (the Mac app from its Resources into
`~/Library/Ola/skills`, the machine with `install.py` into `~/.ola-bart/skills`), with the image's path
`/opt/ola/skills` rewritten to the copy's (which has no spaces, so the commands work as written), names
that folder in its opencode config, denies every skill by name except Ola's (policies and permissions,
as the image's system config does), lets the agent read the copy, and keeps Claude Code's skills out
(`OPENCODE_DISABLE_CLAUDE_CODE`). `ola-see` is installed with the web commands and goes through the
same forwarder and token; `ola-page` is the image's on the machine (driving Playwright's Chromium
headless shell or Chrome) and, on the Mac, `bart/ola-page-mac`, which asks the Mac app to render the
page in its own web view off screen (`Mac/PageRender.swift`). Checks: `bart/skills-check.mjs` on the
machine; on the Mac `OLA_SKILLS_CHECK=1 swift run olakit-selftest` and `Ola --render-selftest <dir>`.

**Versioned and checked (2026-11-17, later).** The Mac app carries this same folder (apple/README.md, "Ola's skills on the Mac" and "Every
release"): staged fresh at the commit by `apple/tools/skills.mjs`, a build refused if it differs,
the version (`version.mjs`: the content hash, the same one the image's `ola.skills` label carries,
and the commit) shown beside the Ola machine's. So every skill says, in its SKILL.md metadata, what
it needs beyond the standard library (`ola/needs`: `python:<module>` and `cmd:<program>`, or `none`)
and whether it works on a Mac (`ola/mac`: `yes`, or `no, <why>`); `check.py` holds every skill to
it. A skill change also needs a new image tag (`workspace/ws.mjs IMAGE`): the deploy refuses an
image whose label is not the release's skills.

## Tested like code: with and without

Every skill names at least two eval tasks (`evals/tasks/s*`, written by `evals/lib/mk_r3.py` from
`lib/r3_skills.py`; made-up data, a deterministic checker, a reference solution and plausible wrong
outputs, proved by `python3 lib/task.py selftest tasks/<id> 1 2 3`). `run.mjs --skills on|off` runs a
task in the sealed workspace with the skills offered, or with the session denied every skill; the two
arms are separate configurations whose settings carry the skill set's hash. `skills-report.mjs` puts
them side by side:

```bash
# on the mini: the evals' own gateway, then each arm (resumable; take the suite lock per chunk)
OLA_EVALS_ROOT=~/ola-sk/evals evals/start-gateway-ws.sh glmsk 4397 zai-org/GLM-5.3-Flash 4000000
node evals/run.mjs --config configs/glm-5.3-flash-ws-sk.json --tasks skill:chart --seeds 1,2,3 --skills on  --db results/skills.db --concurrency 2 --time 900 --tokens 400000
node evals/run.mjs --config configs/glm-5.3-flash-ws-sk.json --tasks skill:chart --seeds 1,2,3 --skills off --db results/skills.db --concurrency 2 --time 900 --tokens 400000
node evals/skills-report.mjs --db results/skills.db --name glm-5.3-flash-ws-sk --md /tmp/skills.md --json results/summary-skills.json
```

The difference in checks passed (with minus without) is the number that says a skill is worth
having. A skill change ships only when its tasks improve and nothing else drops.

## How to improve a skill from a failed run

1. **Label the failure.** Open the run's folder (`evals/runs/<config>/<task>-s<seed>-<stamp>/`):
   `check.json` names the failed check and its label (`numbers_wrong`, `quote_not_verbatim`,
   `assumed_silently`, `page_broken`, ...), `events.jsonl` shows which tools ran, `session.json`
   what the agent said. Decide which of three it is: the agent did not load the skill (the
   description did not match the request), it loaded it and did not follow a step (the
   instructions), or it followed them and the result was still wrong (the script or a missing check).
2. **Change the one thing that failed.** A description that did not match gets the person's words
   from the request. A skipped step gets moved earlier or said more plainly. A wrong result gets
   fixed in the script, and a check that would have caught it gets added to the script's own check,
   so it cannot happen silently again. Never fix a skill by telling it the answer of one task.
3. **Add the failing case as a test.** In the skill's `tests/test_*.py`, a small made-up input that
   reproduces the failure, failing before the change and passing after. If the evals had no task
   that shows the failure, write one (`lib/r3_skills.py`, then `lib/mk_r3.py`) with its reference
   solution and the wrong output that the run produced, and prove it with `task.py selftest`.
4. **Bump the version and say why** in the skill's `ola/version` and one `CHANGELOG.md` line:
   the label, the change, the eval.
5. **Rerun** the skill's tasks with and without (`--tasks skill:<name>`) and the rest of the skills
   tasks with the skill on. Keep the change only if its tasks improve and nothing else drops.
   Rebuild the image under a new tag so the image, the label and the scores name the same skills.

Real sessions feed nothing into this but labels. A fix is proven on made-up twins.
