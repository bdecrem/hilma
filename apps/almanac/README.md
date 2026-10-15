# Adaptation Almanac

A research agent over the GAMI corpus for Frances (Fran) Moore, UC Davis, started 2026-10-14. A landing page, a chat
with an agent that queries the database and reads the papers, and a collection of artifacts it makes (charts, tables
as Excel/CSV, documents, web pages, coding-run results). Background on the corpus: `../gami/README.md`.

- **Live:** https://almanac.tunn3l.sh/almanac/ and http://localhost:3920/almanac/ on the Mac mini. Two accounts, Frances and
  Bart, each with its own passcode, set in `~/.almanac.env` on the mini as `ALMANAC_USERS="Frances:…,Bart:…"` (the
  name is matched without regard to case; add an account by adding a pair and restarting). Everyone sees every
  conversation and artifact; a conversation records who started it.
- **The agent** is Claude Code through the Agent SDK, logged in with Bart's Max plan (`CLAUDE_CODE_OAUTH_TOKEN`, the
  same token as Token Surfers; `ANTHROPIC_API_KEY` is removed from the child env). Opus 5.5 at high effort
  (`ALMANAC_MODEL`, `ALMANAC_EFFORT`). It has no built-in tools (`tools: []`, no shell, no files, `settingSources: []`),
  only the in-process MCP server in `lib/tools.mjs`: `sql`, `search`, `read_paper`, `save_table`, `save_chart`,
  `save_page`, `save_document`, `list_artifacts`, `read_artifact`, `code_papers`, `job_status`, `cancel_job`,
  `resume_job`. The system prompt (`lib/prompt.mjs`) carries Fran's project, the schema and the coded value lists read
  from the database at start-up. Each user message is one `query()` resuming the chat's session.
- **Reads, never writes, the corpus.** Every query runs in a short-lived child process (`lib/sqlworker.mjs`) opened
  read-only, with the app's own db attached read-only as `almanac`, one statement, and a time limit (killed after
  30 s; a worker thread could not be stopped mid-query).
- **Coding runs** (`lib/jobs.mjs`): a coding sheet (fields: text / category / number / boolean, per paper or one
  sheet per item found, e.g. each adaptation decision) applied to many papers, one SDK call per paper with
  structured output (Sonnet 5.5 by default, 3 at a time). Every value carries the exact quote and page; each quote
  is checked against the page text (`quote_found` 1 on that page, 2 elsewhere in the paper, 0 not found). Results:
  table `codings` and, at the end, a `coding` artifact (one row per paper or item, with PDF links). Over 25 papers
  needs `confirmed: true`, which the agent only sends after the user agrees. A usage-limit error pauses the run;
  unfinished runs resume when the server starts.
- **Live updates** are long-polls (`GET /api/chats/:id/events?after=N&wait=25`), because tunn3l holds a streamed
  response until it ends. Text deltas are batched every 120 ms and kept in memory only; everything else is stored.

## Files

| Path | What |
|---|---|
| `server.mjs` | HTTP server: the app under `/almanac`, the JSON API, PDFs (`/almanac/papers/<id>.pdf`), artifact files (`/almanac/a/<id>/<file>`; agent-written HTML is served with a sandbox CSP) |
| `lib/agent.mjs` | conversations: SDK query per message, event log, long-poll |
| `lib/tools.mjs`, `lib/prompt.mjs` | the agent's tools and system prompt |
| `lib/jobs.mjs` | coding runs |
| `lib/artifacts.mjs` | tables (CSV + Excel via exceljs), charts (Vega-Lite rendered to SVG with vega, PNG with sharp, so a broken spec fails at save time), pages, documents |
| `lib/db.mjs`, `lib/sqlworker.mjs` | read-only corpus access |
| `lib/store.mjs` | the app's state: `~/almanac/almanac.db` (chats, events, artifacts, jobs, job_papers, codings) |
| `public/` | the web app (vanilla JS, hash routes), fonts from `src/fonts` |
| `install.sh`, `update.sh` | launchd jobs `sh.almanac.server` + `sh.tunn3l.almanac`, and the deploy |
| `check/shots.mjs` | Playwright: sign in, screenshot home, a chat, the gallery, an artifact, desktop + phone |

Data on the mini: `~/GAMI/gami.db` and `~/GAMI/papers/` (read), `~/almanac/` (state, `artifacts/`, `workspace/` = the
agent's empty cwd, so it picks up no CLAUDE.md). Logs: `~/Library/Logs/almanac/`.

## Deploy

Push, then `ssh admin@171.66.240.175 'bash ~/hilma-deploy/apps/almanac/update.sh'`. First time on a machine: write
`~/.almanac.env` (chmod 600), then `bash ~/hilma-deploy/apps/almanac/install.sh`.

## Run it elsewhere (development)

```bash
cd apps/almanac && npm install
ALMANAC_USERS=Bart:… ALMANAC_SECRET=… GAMI_DIR=~/Desktop/GAMI ALMANAC_DATA=/tmp/almanac-dev ALMANAC_PORT=3921 node server.mjs
node check/shots.mjs <out-dir> http://localhost:3921 <Bart's passcode>
```
Without `CLAUDE_CODE_OAUTH_TOKEN` the SDK uses the machine's own Claude Code login.
