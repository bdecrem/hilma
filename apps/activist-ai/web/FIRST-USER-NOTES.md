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
| C six studies → page 2 → job | answer and citation whole after fix 4; the job: see B6 and B10 | not walked | 8 s answer | the job never ran end to end in this pass |
| D web search → download → Files, Data | whole | whole | 38 to 86 s | |
| E site → "make it look better" | whole after fix 1 | not walked | 9 s site, 217 s design pass | before and after shots shown in the conversation |
| F drawing; translation | whole | not walked | 11 to 18 s; 8 s | the law kept all five article numbers |
| G Settings, commands, compliment, Compare | switches whole; /help, /files whole; the rest not reached (the walk's own fault, fixed) | not walked | | |
| H a second member, removed | whole, with B11 | not walked | | |
| I reload, tabs, offline, too big, wrong passkey, sleep | broken at its first step by B12 | not walked | | |

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
  **It now breaks journeys:** in the last run (Chromium at 390) the model searched three times
  with `glob`, all three failed, and the stretch rule (three failed steps in a row) stopped the run
  after 1.6 s with no answer. The final run: A and D whole in both browsers, B whole in WebKit and
  stopped by this in Chromium (21 of 24 steps). Fix the image first; until then the stretch rule
  could leave out steps that failed for this reason.
- **B9, open (image).** The agent's own check screenshots (`shots/hello-390.png`, from `ola-page`,
  as `AGENTS.md` asks) show on the project home under "Other files" as things "Ola made". To a
  first person they are noise. Either `AGENTS.md` saves them under a hidden folder, or the home
  leaves `shots/` out (the design-pass skill keeps before/after shots on purpose, so the second
  needs a decision).

- **B10, fixed (feedback).** Asked to run a question over every study, the model wrote the job down
  and then kept the conversation "Working" for five minutes, checking on the job and sleeping
  ("Set up a job", "Ran sleep", fourteen times), never saying the person starts it under Jobs (its
  instructions say to). The conversation now says it the moment a job is written down: "Ola wrote
  down a job. It runs only when you start it, under Jobs: a trial on a few documents first, then
  the rest." Job steps and `sleep` are said in plain words ("Checked on the job", "Waited").
- **B11, fixed (words) and open.** A member removed while the project is open sees nothing change
  until they reload; then "That project is not one of yours, or it is closed. Here are the ones you
  can open." sat above "no project is shared with you yet". The sentence now stops at "closed"
  when there is none to open. Saying it without a reload (the event stream is cut at once; the page
  only retries) is open.
- **B12, open.** Right after a member was removed (which gives the project new secrets and
  restarts it), the owner sent a request in a new conversation: the drawer stayed empty and
  "ready", with no error, and the request turned up only under "2 earlier conversations". The
  request was taken; the page lost it from view. Steps: owner's project open; `admin.mjs
  remove-member <team> <member>`; within 15 s, New conversation and send.

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
| Not your project, none left | "…or it is closed. Here are the ones you can open." above "no project is shared with you yet" | "That project is not one of yours, or it is closed." |
| A job, its steps | "Set up a job" ×14, "Ran sleep" | "Wrote down a job", "Checked on the job", "Waited" |
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

Settings: the four switches turned on and off cleanly; both fallbacks ask first with their full
consent text; a member sees the two fallback switches disabled and can change web access.

Fast: a hello-world page in 3 to 7 s, a chart and an Excel file in 13 to 15 s, a web search and a
PDF download in 38 to 86 s, a drawing in 18 s. Right where it could check itself (Article 1 quoted
from the downloaded PDF, 4.2 million on page 2). Wrong on the caveat that mattered: it named the
two blank counts but counted the duplicate row both times (North 15 households, not 11). It used
the skills' scripts and `ola-page` unprompted. Writes em dashes in replies. It ignored one
standing instruction (B10: it kept polling a job instead of handing it to the person). Never needed
the fallback in these journeys. Spend: about $0.60 in all on Together for the whole pass (about 4.5
million tokens in at $0.15 a million, 0.1 million out at $0.50; the specialists and the hosted model
barely used).

## Could not test

- Safari itself (WebKit is Playwright's build) and a real passkey (a software passkey stands in;
  the cookie and everything after it are the browser's own).
- A 60 MB upload on a slow connection (WebKit has no network throttling; Chromium's is per page);
  the size limit and its message were tested instead.
- Closing a laptop, two tabs, the back button, offline, a 60 MB file, a passkey this machine does
  not know: written into `first-user-more.mjs` (journey I) but not reached in this pass (B12 stopped
  it at its first step). The compliment, the remaining `/` commands and Compare with Claude (G) were
  not reached either.
- The hosted open model and Claude were only switched on and off, never used.
