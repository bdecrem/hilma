# Ola: the web app

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
- **The door to opencode** (`server/proxy.mjs`) forwards eleven routes (events, sessions, prompt,
  interrupt, messages, permissions) and refuses the rest with 403 (providers, credentials,
  shells, ptys, MCP, config). It rewrites session creation and updates: the folder and the
  permission rules are decided server-side from the autonomy the page asked for ("Go ahead" or
  "Ask me first"); `webfetch`, `websearch` and `external_directory` are always denied, last, so
  they win. The opencode password never reaches the browser.
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
