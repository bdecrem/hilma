# Ola: the web app

**The project page (2026-11-17, OLA-128).** The top says which project you are in ("Your projects"
to leave it, the word Project over its name). On a phone the project opens on its **conversation**,
laid in the page under three tabs: Conversation, Made by Ola, and Sources (what Ola downloaded from
the web into `sources/`, each with the address it came from, never shown as something Ola made).
Everything else (What Ola has of yours, Data, Jobs, Settings, Quality, On this machine, your
projects, your account, Sign out) is in one Menu; a laptop shows them as one quiet row of links
under the name and keeps the things with the bar at the bottom. "Lots of permissions" is one switch, and the choice stays with the project in that browser (a new conversation and a reload start from it; OLA-142).
`#/projects` always shows the list of projects, even with one, and an admin makes a new project
there (POST /api/projects, the same code as `admin.mjs create-workspace`). Screens:
`node scripts/project-shots.mjs <dir>`.

**Also yours (2026-11-20, OLA-103).** A project can link to what its people already use elsewhere:
the Adaptation Almanac in Frances's project, the MRD law library in Ian's. The admin sets them
(`node frontdesk/admin.mjs link <project> --label "…" --url https://… [--note "…"]`, `links`,
`unlink`; at most six, https only, audited); the home shows them in the laptop's row of links, as
an "Also yours" list under what Ola made (on a phone, in the Made by Ola tab) and in the Menu, each
opening in a new tab. The front desk only shows them; Ola does not fetch them. Look at them with
`OLA_DEV_LINKS=1 node scripts/project-shots.mjs <dir>`.

**The simple confidence check (2026-11-18, OLA-144).** Before a run, `precheck` (`src/lib/steps.ts`,
ported in `apple/OlaKit/.../Fallbacks.swift`) offers the "this may be a stretch" card when the
request is big (it names 8 or more of the project's files, or asks for all of them in a project
with 20 or more documents; files far past the model's context; a long build in 8 or more parts) or
is design work (a landing page, website, poster, logo to be made, or "design a..."). During a run
the stuck signals are unchanged. Every threshold is in `STRETCH_CHECKS`. Bart: "a simple heuristic
and then we'll see if in practice that's useful": watch how often "Not now" is the answer.

The only client customers get. A project opens on its **things** (documents, tables, charts,
small sites, a dashboard Bart built with them); **Ask Ola** is a bar at the bottom that opens
into a drawer with the conversation; **What Ola has of yours** is one click from the header.
Look A, "paper under the lamp" (the spec and mocks live outside the repo, in
`~/Desktop/ola-brand/app/`). The document editor is milestone 2's neighbor, not part of this one.

Vite + Solid + TypeScript, on `@opencode/client` 2.3.0. No fork of opencode's UI. No CDN, no
analytics, no third-party request of any kind; the page's CSP says `default-src 'self'` and
`check.mjs` proves it.

## Run it

```bash
cd apps/activist-ai/web
npm ci
node dev.mjs                 # http://127.0.0.1:4620/ with hot reload, a live model (Together)
node dev.mjs --fake-model    # a scripted model: no model calls, same opencode, same gateway
npm run build && node dev.mjs --dist   # the built page, served as production will serve it
npm test                     # unit tests (Node 23.6+ runs the .ts directly)
npm run typecheck
node check.mjs               # everything below, in Chromium, plus ONE real request (about a cent)
node check.mjs --no-live     # the same without the real request
```

`TOGETHER_API_KEY` comes from the environment or the repo's `.env.local`; it is handed to the
gateway's environment and never printed. Made-up data only: the workspace is the survey from
`../spike/make-survey.py`, and the project's other things are a fixture
(`server/fixture.mjs`, the eviction-report project from the mocks).

Useful addresses: `#/files` (What Ola has of yours), `#/?ask=<session id>` (the drawer on that
conversation), `?still` (no live stream: for screenshots with `scripts/ola-brand/shot.mjs`,
whose `networkidle` wait never ends while the event stream is open).

## Architecture in a page

```
browser ──── same origin only ────► front desk (dev.mjs today)
  src/App.tsx                          /api/project   project + things   server/project.mjs
  src/lib/api.ts      ───────────────► /api/files     list/upload/       server/files.mjs
                                                      download/delete
  src/lib/ola.ts      ───────────────► /oc/api/*      a short allowlist  server/proxy.mjs ──► opencode serve
  (@opencode/client)                                  + Basic auth added                     (temp folder)
                                                      server-side                              │
                                                                                               ▼
                                                                                  ../gateway/server.mjs ──► Together
                                                                                  (or server/fake-model.mjs)
```

- **The seam is HTTP, not code.** The page knows three things: `/api/project`, `/api/files`
  and `/oc/api/*`. The real front desk (sign-in, accounts, the platform database, one workspace
  VM per person via `../workspace/ws.mjs`) replaces `dev.mjs` and keeps those paths, adding a
  session cookie. Nothing in `src/` changes.
- **The door to opencode** (`server/proxy.mjs`) forwards thirteen routes (events, sessions, prompt,
  interrupt, messages, permissions, and Ola's questions: opencode's `question` tool raises a form,
  which the drawer shows as a card of choices plus the person's own words, and answers) and refuses the rest with 403 (providers, credentials,
  shells, ptys, MCP, config). It rewrites session creation and updates: the folder and the
  permission rules are decided server-side from the autonomy the page asked for ("Lots of
  permissions", `go`, or "Ask before each step", `ask`; the names Bart's apps use, OLA-139);
  `webfetch`, `websearch` and `external_directory` are always denied, last, so they win. Under
  Lots the front desk also answers a web search or download itself, with a one-time grant for
  exactly it (README, "Web search and downloads"), so nothing asks. The opencode password never
  reaches the browser.
- **Plain words** (`src/lib/steps.ts`) is the one place that knows opencode's tool names
  (`glob`, `read`, `write`, `edit`, `shell`, …) and turns a call into a sentence from the
  design's verb table, with a short result on the right ("printed 56", "57 lines"). Unknown
  tools fall through to "Used <name>", never hidden.
- **The conversation** (`src/lib/conversation.ts`) folds opencode's V2 events into turns and
  steps as pure functions, so the tests replay recorded event streams
  (`test/fixtures/*.jsonl`, from `scripts/record-events.mjs`). `turnsFromMessages` rebuilds the
  same view from opencode's stored history: used to open earlier conversations and to resync
  after a lost connection.
- **Out loud, never silent** (`src/lib/ola.ts`): a lost stream (error, `offline`, or a minute
  without keepalives) shows a banner, retries with backoff, and resyncs from the history; a
  failed request, a failed step, a refused approval and a retrying model each get a sentence,
  with the raw detail behind "Show details". Approvals are a native modal `<dialog>`; Escape
  does not answer for the person.
- **Design tokens** are CSS variables in `src/styles/tokens.css`, from the spec, with sizes
  raised so no content is under 15 px. Fonts are this app's own cut
  (`scripts/fonts.py`: Bricolage Grotesque 400–760, Literata 400–700 and italic), self-hosted in
  `public/fonts/` with their OFL licenses.

## A full machine (`full-machine.mjs`, OLA-299)

The machine runs at most four projects at once (`workspace/ws.mjs` MACHINE_FULL; the front desk
answers `503 machine_busy`). The page treats that as a wait, not an error: in place of "Opening your
project…" it says the machine is running as many projects as it can, that the project opens by
itself when one closes, and that a project nobody has used for 30 minutes closes (the front desk's
idle stop); it asks again every 10 s and opens without a reload. The drawer and the bar under the
page say the same instead of "Lost the connection", and a request typed meanwhile goes into its
turn and waits there with "so this waits here", then goes by itself once a place frees (OLA-489; it
used to stay in the box with Send dimmed and never go). Any other failure to load the project shows its problem box: the loader never
leaves the resource errored, because Solid throws an errored resource on every read, which froze
the page. `node full-machine.mjs [shots-dir]` proves it at 390 px in WebKit and Chromium against
the dev server playing a full machine (`OLA_DEV_FULL=1`, `POST /__dev/full?on=0|1`), about a minute.

**A machine that fills after the page opened** (OLA-489): the event stream is already open, so the
composer sends, and the new conversation or the request hears 503 (the front desk could not start
the project). The opencode client hides the reply's body, so the page asks `/api/project` why; on
`machine_busy` the request waits in its turn ("so this waits here"), asks again every 10 s (each ask
lets the front desk close a project idle 5 minutes to make room, OLA-412) and goes by itself; Stop
takes it back; after 15 minutes it says the machine stayed full. Never "did not reach Ola's
computer", which is for a connection that is really gone. `full-machine.mjs` plays it with
`POST /__dev/full-sends?on=0|1` after `/new`, so the request is a conversation's first.

## What `check.mjs` proves (21 checks)

The home renders its five kinds of things; both typefaces load from our origin; a request runs
end to end in the drawer with its steps in plain words and the raw command behind "Show
details"; what Ola wrote appears among the things; an approval is answered yes and then no;
a failed request is said out loud; a lost network and a stopped workspace are said out loud and
the page recovers; Escape closes the drawer and focus returns; upload, list, download (same
bytes) and delete with confirmation; a bad file name is refused with a reason; the door refuses
routes the page does not use and the page carries its CSP; a skip link and a visible focus ring;
no text under 15 px and AA contrast in the home, the drawer and the files view; no sideways
scroll at 390 px; reduced motion stops the lamp and the slides; one real request through
Together; and, across all of it, no request to another origin.

## The first-user check (`first-user.mjs`)

The suites prove each piece with a scripted model. This one uses the app as a new person would,
on a fresh copy of everything with the **real everyday model**, and is what the lead runs before
telling the owner something is ready:

```bash
# on the Mac mini, from apps/activist-ai, under the suite lock (it starts two small projects)
node web/first-user.mjs --shots ~/first-user-shots          # A, B and D in WebKit at 1280 and Chromium at 390
node web/first-user.mjs --only A --runs webkit@390            # one journey, one browser and width
OLA_FU_MODEL=<model id> node web/first-user.mjs               # another everyday model (default: Nemotron 3.5 Super VL)
```

- **A**: an invitation link, a passkey, the empty project, "a hello-world page", Open.
- **B**: a messy spreadsheet uploaded, a question whose honest answer needs a caveat, a chart and an
  Excel file under the reply, both opened, both on the project home after a reload.
- **D**: a request that needs the web: the search card and the download card (Allow once), the
  saved PDF in Files and in Data.

It fails when a step fails, when a step takes longer than its limit (`OLA_FU_SLOW=2` doubles them
on a busy machine), or when a forbidden word is on the screen (`FORBIDDEN` in the script:
workspace, gateway, VM, sandbox, front desk, opencode, token, session, container, API, exit code
and the like). The person's own requests are not scanned; Ola's replies are, and a hit there is
named "in Ola's reply". Every step leaves a screenshot and the words on the screen in `--shots`.
Its own ports (4891, 4893), state in `~/.ola-first-user`, the made-up search provider, a scripted
Claude, one real download (the made-up search's UN PDF); everything is destroyed at the end. A run
used 0.8 million tokens of the everyday model (12 cents on Together) and about 5 minutes.
The model's quality is printed, not failed on (did it name the duplicate row, did it quote Article 1).

`--only J` (OLA-87) walks the four things a first person runs into that the other journeys only
looked at, and fails on each when the person would be left wondering: **Compare with Claude** under
a finished reply, through the made-up copy (read, then sent) to the side-by-side and the verdict
left under the reply; **two tabs**, the second showing the run going on and both ending on the same
reply; **a moment offline**, said at once ("Lost the connection to Ola's computer"), gone when the
network is back, and a request then run to its end; **a 60 MB scan** (a real one-page PDF), sent in
pieces with its progress and then in Files at its size. `node web/first-user.mjs --only A,J` runs it
in both browsers in about ten minutes.

`--only C,E,F,G,H,I` adds the longer walk in `first-user-more.mjs` (six studies and a job, a
site made to look better, a drawing and a translation, every switch in Settings and every `/`
command, a second member removed mid-visit, a reload mid-run, the back button, a weird file name,
a passkey this machine does not know, a sleeping project with `OLA_FU_IDLE_MIN=1`); `OLA_FU_SPECIALISTS=<model>` and `OLA_FU_HOSTED=<model>`
turn on the specialists and the hosted open model on Together for it. What the first pass found
is in `FIRST-USER-NOTES.md`.

## Real and stubbed

| Real | Stubbed |
|---|---|
| opencode serve, the gateway, the model (Together GLM-5.3-Flash as the stand-in) | The project and its fixture things (`server/fixture.mjs`) |
| The conversation, steps, approvals, stop, errors, reconnect, earlier conversations | "3 people working on the machine" (fixture number) |
| Files: list, upload, download, delete, with the uploaded/made distinction | The "On this machine" page (static text; no outbound list, no capture report yet) |
| Things Ola makes: a `.csv` it writes becomes a table, a `.md` a document | Sign-in, accounts, teams, quotas (not in this milestone) |
| The CSP, the door's allowlist, server-side permissions | Opening a thing (no viewer yet; files download) |

## Where opencode 2.3.0 differed from the interface study

- The shell tool is **`shell`**, not `bash`; its permission action is `shell`. Writes ask as
  **`edit`** (with a unified diff in `metadata.files`), even from the `write` tool.
- `read` and `write` take **`path`**, not `filePath`; a real model passes absolute paths, so
  the page shortens them against the session's folder.
- Permissions are **per session** (`session.create({ permissions })`, `PATCH` to change), not
  only in the config, so autonomy is a session setting the front desk controls.
- `session.tool.called` carries no tool name; the name comes earlier, in
  `session.tool.input.started`. A shell step "succeeds" even when the program exits non-zero
  (`metadata.exit`); the page treats that as failed.
- Text arrives per assistant message; narration before a tool call is a separate message, so the
  page keeps the last one as the answer and the earlier ones as notes.
- `@opencode/client`'s `event.subscribe({ signal, onActivity })` takes options only, and
  keepalives reach `onActivity`. The `./solid` stores were not needed.

## Milestone 2

1. **The front desk for real**: passkey sign-in and invitations, the platform database, one
   workspace per person through `ws.mjs`, the same three paths; the `?still` mode replaced by a
   proper print view.
2. **Open a thing**: table viewer (sort, search, Excel/CSV), document view, chart view, the
   preview frame for sites ("Only you can open this").
3. **The document editor** (document-first mode with sources in the margin), sharing one
   history with the drawer.
4. **Checks after a run** ("6 of 7 passed") and the forecast slip, once the evaluation suite
   measures task kinds; feedback buttons with the record shown.
5. Upload by drag and drop and from the drawer; folders; a size limit stated up front; "replace"
   in our own dialog instead of the browser's confirm.
6. A contract test that replays `scripts/record-events.mjs` against each opencode upgrade on the
   mini before it reaches the Studio.
