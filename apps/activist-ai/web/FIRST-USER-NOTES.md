# The first-user pass (2026-11-17)

One person, never seen Ola before, no patience, walked the whole web app on a fresh copy of
everything on the Mac mini (own gateway, front desk and sealed projects; the everyday model real:
Nemotron 3.5 Super VL on Together; Claude and the search provider made up; the specialists on
Muse Glimmer 30B for the documents). Browsers: WebKit (Playwright's build, not Safari itself) at
1280 px first, then Chromium at 390 px. Made-up data only: a food bank's visit log with a duplicate
row and two blanks, six made-up studies (one scanned, one two-column), a made-up Spanish law.

The repeatable part is `first-user.mjs` (journeys A, B, D); the longer walk is
`first-user-more.mjs`. Screenshots: `~/Desktop/ola-brand/web-shots/fu/` on the iMac.

Status words: **fixed** (in this pass, with a check), **open** (written up, not changed here).

## The five worst

1. **"Make it look better" stopped at once** (E). The design skill tells the agent to read its own
   reference files, which live in the image outside the project folder; the session's rules denied
   every read outside the folder, so three reads failed ("Not allowed here"), the stretch card
   offered to hand the job to Claude, and the run ended "It stopped: Step interrupted". **Fixed**:
   the session may read `/opt/ola/skills/*` (nothing new: the shell could already print them);
   `web/test/webask.test.mjs`.
2. **What a run made with a program had no Open under the reply** (B). A chart drawn by Python and
   an Excel file written by Python are not "Wrote" steps, so the reply listed only the CSV the
   model wrote with its own tool. **Fixed**: when a run ends, the files Ola made since it started
   are listed under the reply (pictures shown, the rest with Open); `first-user.mjs` B.
3. **A job could get stuck with no way forward** (C). The agent set a job going before anyone said
   yes; the gateway refused it at once, and Jobs showed "Paused: No job is approved to run for this
   project now. A person starts a job, or its trial, under Jobs in the app." with only a Resume
   button, which the front desk refuses for a job no one approved. **Fixed**: a job no person ever
   approved and that has read nothing is shown as the proposal it is, with the trial button;
   `frontdesk/test/unit.test.mjs`.
4. **A citation was plain text when the file name had spaces** (C). Uploads keep their names
   ("study 1 water board.pdf"), and the citation rule refused a space. The answer was right
   (4.2 million, page 2) but the link to the page was missing. **Fixed**; `web/test/cite.test.ts`.
5. **The opened drawer hid what Ola had just made** (A, B). When a run ended, the Open button and
   the pictures appeared under the reply, below the composer's edge, with no scroll. **Fixed**:
   brought into view when the run ends (unless the person scrolled up).

## Journeys, end to end

| Journey | WebKit 1280 | Chromium 390 | Time (model) | Notes |
|---|---|---|---|---|
| A invite → hello page → Open | whole | whole | 3 to 7 s | |
| B spreadsheet → chart + Excel | whole after fix 2 | whole after fix 2 | 13 to 15 s | the duplicate row missed both times |
| C six studies → page 2 → job | answer right; citation fixed; job fixed (not yet rerun end to end) | not walked | 3 s answer, 83 s job setup | |
| D web search → download → Files, Data | whole | whole | 38 to 86 s | |
| E site → "make it look better" | broken before fix 1 | not walked | 9 s site | |
| F drawing; translation | drawing whole | not walked | 18 s | |

## Bugs (exact steps)

- **B1, fixed.** Ask for a page in a fresh project, wait for the reply: the "Open index.html"
  button is under the composer and the drawer does not scroll to it.
- **B2, fixed.** Upload a CSV, ask for "a bar chart as a PNG and an Excel file": the chart and the
  `.xlsx` are on the project home but not under the reply.
- **B3, fixed.** Any reply with a Markdown table (the model writes them for every summary) showed
  as one paragraph of pipes: "| Site | Households served | Visits | |------|…".
- **B4, fixed.** A list item in bold around code, `**\`pantry-october-households.xlsx\`**`, showed
  the backticks.
- **B5, fixed.** Six PDFs, one named "study 1 water board.pdf": the reply's
  `[study 1 water board.pdf, p. 2](doc:study 1 water board.pdf#page=2)` was not a link.
- **B6, fixed.** Ask "for every study … run it as a job": the job sits Paused with a note that sends
  the person to Jobs, where Resume cannot work.
- **B7, fixed.** "Make it look better" after a site: reads of the design skill's files refused.
- **B8, open (image).** opencode's file search (`glob`) fails inside the project with "ripgrep
  execution failed", twice in most runs (B and C). The model recovers with a plain listing, but every
  such run shows two failed steps and ends "3 did not work". Probably ripgrep cannot run on the
  read-only root (a cache or temp path) or is missing from the image. Needs an image change, which
  this pass may not make.
- **B9, open (image).** The agent's own check screenshots (`shots/hello-390.png`, from `ola-page`,
  as `AGENTS.md` asks) show on the project home under "Other files" as things "Ola made". To a
  first person they are noise. Either `AGENTS.md` saves them under a hidden folder, or the home
  leaves `shots/` out (the design-pass skill keeps before/after shots on purpose, so the second
  needs a decision).

## Words rewritten (machine words and long sentences)

| Where | Was | Now |
|---|---|---|
| A project waking | "Waking your workspace…" (page and front desk) | "Waking your project. This takes a few seconds…" |
| On this machine | "could read a session while it runs" | "could read a conversation while it runs" |
| A run cut by a restart | "Ola’s computer restarted the workspace, so this stopped." | "Ola’s computer restarted your project, so this stopped. Ask again to carry on." |
| A step Ola ran | "Ran ola-page" (and every `ola-*` command by name) | "Looked at how the page shows index.html", "Read the scanned pages of …", "Translated …", "Drew a picture", "Set up a job", … |
| A failed step | "ripgrep execution failed" (the tool's own message) | "This step did not work. Ola can try another way." (the message under Show details) |
| A failed program | "The program stopped with an error (exit code 1)." | "The program stopped with an error. What it printed is under Show details." |
| A run cut short | "It stopped: Step interrupted" | "This stopped before it finished. What Ola did so far stays as it is." |
| Every other view | "Back to one thing" (the count of things, in a project of 20 files) | "Back to the project" |

## Still open (small)

- Jobs speaks in tokens: "Model use: 2.1 million tokens", "Budget for this job, in tokens",
  "I approve a budget of 1,000,000 tokens." A first person cannot judge a number of tokens. The
  proposal already shows "Of a week of this project’s use: about 3%"; the budget could be set in
  that unit (a share of the week, or a multiple of the estimate), with tokens under Show details.
  Not changed here: the budget field's unit is the job's contract with the gateway.
- "0 people working on the machine" while you are the one working: the count is the last whole
  5-minute window, so a first person always reads 0. Either count the viewer's own team now, or
  hide the line at 0.
- Data at 390 px hides "Came from" (the site and the date a document was downloaded): the
  provenance is the point of that column.
- The approval sheet at 390 px slides over the conversation with the text behind it for about
  half a second; fine once settled.
- The search card names "Brave Search" even on a machine set up with another provider (the page
  reads `searchProvider` from the front desk's own setting, not the gateway's).

## The everyday model (Nemotron 3.5 Super VL, Together)

Fast: a hello-world page in 3 to 7 s, a chart and an Excel file in 13 to 15 s, a web search and a
PDF download in 38 to 86 s, a drawing in 18 s. Right where it could check itself (Article 1 quoted
from the downloaded PDF, 4.2 million on page 2). Wrong on the caveat that mattered: it named the
two blank counts but counted the duplicate row both times (North 15 households, not 11). It used
the skills' scripts and `ola-page` unprompted. Writes em dashes in replies. Never needed the
fallback in these journeys. Spend: about $0.40 in all on Together for the whole pass.

## Could not test

- Safari itself (WebKit is Playwright's build) and a real passkey (a software passkey stands in;
  the cookie and everything after it are the browser's own).
- A 60 MB upload on a slow connection (WebKit has no network throttling; Chromium's is per page);
  the size limit and its message were tested instead.
- Closing a laptop: a sleeping project was forced with a one-minute idle limit instead.
