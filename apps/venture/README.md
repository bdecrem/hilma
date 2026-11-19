# Venture

Started 2026-11-13. Bart's brief: Claude comes up with a business idea and then
executes it, with whatever tools it needs. This folder is the project's home;
the business itself gets its own section here once it is chosen.

## Step 1: the founding interview (voice)

Bart asked for the clarifying questions over voice. The call is a page:

    https://ola.cx/venture/interview?k=<key>

The link is the access (only the key's SHA-256 is in the repo, in
`src/lib/venture/interview.ts`; the key itself is in the session that made it
and in Bart's terminal history). The page opens a WebRTC call to OpenAI
Realtime (`gpt-realtime-2.1`, voice cedar, semantic VAD at low eagerness so
pauses are waited out). The interviewer's brief is Claude's question list
(`BRIEF` in the same file): seven required topics (the point, who decides,
money, time, legal and payments, identity, acting in the world), eight more as
time allows, a recap, and a `finish_interview` tool call that ends the call.

Every finished turn, both sides, is posted to `/api/venture/interview/turn`
and stored in `venture_interview_turns` (schema `schema/001_interview.sql`,
Supabase project sms-bot) as it happens. A dropped or hung-up call resumes
from the stored transcript ("Pick the call back up"): the transcript so far
goes into the brief and the interviewer continues with the first topic not
covered.

| What | Where |
|---|---|
| Brief, key check, mint, storage | `src/lib/venture/interview.ts` |
| Routes | `src/app/api/venture/interview/{session,turn}/route.ts` |
| Page | `src/app/venture/interview/`, on the shared `src/app/venture/Call.tsx` (the face is `drawMe` from `src/app/claude/drawing.ts`) |
| Read the transcript | `node scripts/venture/transcript.mjs` (`--list`, `<session>`, `--wait`) |
| Test call, no human | `VENTURE_KEY=<key> node scripts/venture/interview-check.mjs <outDir> [base]` |

The check runs headless Chromium with a fake microphone playing one answer
spoken by macOS `say`, against `next dev -p 3288` (or `https://ola.cx`, where
the dev-only typed-turn hook is absent and the goodbye step is skipped). It
marks its session `test`; `--wait` ignores those.

## After the interview: calls and documents

The repo is public, so what Claude and Bart say to each other about the
business is not in it. Two tables hold it (`schema/002_calls_docs.sql`), both
served only behind the key:

- **Calls.** Bart asked for one ten-minute voice call a day in place of
  dashboards. A call is a row in `venture_calls`: Claude writes an agenda
  (what to tell him, what to ask, what he has to do), he opens
  `ola.cx/venture/call/<slug>?k=…`, and the transcript comes back like the
  interview's (`call` column on the turns). The house rules every call shares
  are `HOUSE` in `src/lib/venture/interview.ts`.
- **Documents.** `ola.cx/venture/doc/<slug>?k=…` renders a markdown row of
  `venture_docs` (the charter, the ideas, reports). Links to `/venture/…`
  inside a document keep the key.

Sources live in `apps/venture/private/` (gitignored) and are published with
`node scripts/venture/put.mjs doc|call <slug> <file.md>`; no deploy needed.
`node scripts/venture/transcript.mjs --wait <call>` blocks until that call has
ended. `node scripts/venture/shot.mjs <url> <png> [full]` is a phone-size
screenshot.
`VENTURE_KEY=<key> node scripts/venture/call-listen.mjs <slug>` joins a call
with a silent microphone and prints how it opens (marks the session `test`).

`apps/venture/private/` on the iMac holds the key (`KEY`), the charter, the
ideas, the call agendas, the interview transcript and the research notes. None
of it is in git; the published copies are the database rows.

## The open conversation (voice mode)

Added 2026-11-13, when Bart asked to discuss the ideas instead of answering an
agenda: "an open ended voice conversation, like voice mode, where I give
comments and you react."

    https://ola.cx/venture/talk?k=<key>

A fork of the call with the two halves pulled apart. OpenAI Realtime is only
the ears and the mouth: voice activity detection, transcription, and reading
text aloud (`create_response: false`, so it never answers by itself). Every
reply is written by Claude (`claude-opus-5-5`, effort low, the system prompt
cached), with every row of `venture_docs` loaded as its notes; the row `now`
(source `private/NOW.md`, "where things stand") goes first, so update and
republish it before a conversation.

1. Bart stops talking; the transcript of his turn arrives on the data channel.
2. The page posts it to `/api/venture/talk/reply`, which stores it and streams
   Claude's reply back as plain text.
3. The page hands the text to the voice a sentence or two at a time
   (`response.create` with `conversation: 'none'` and the text in `<line>`
   tags), so the first sentence is heard while the rest is still being
   written. About three seconds from the end of his turn to the first sound.
4. Talking over Claude stops it: the stream is aborted, the audio buffer
   cleared, and the stored turn keeps only as much as he can have heard
   (playback time at about 2.7 words a second), followed by an `interrupted`
   event that Claude sees on its next reply.

Turns land in `venture_interview_turns` with `call = 'talk'`; "End the call"
writes the `ended` marker, so `transcript.mjs --wait talk` returns at once.

| What | Where |
|---|---|
| Claude's side (persona, notes, messages, the reader voice's mint) | `src/lib/venture/talk.ts` |
| Routes | `src/app/api/venture/talk/{session,reply}/route.ts` (turns still go to `interview/turn`) |
| Page | `src/app/venture/talk/`, `src/app/venture/Talk.tsx` |
| Test call, no human | `VENTURE_KEY=<key> node scripts/venture/talk-check.mjs <outDir> [base]` |

The check plays one spoken comment through a fake microphone, then (on a dev
server, through `window.__talk`) compares what the voice said with what it was
given, types a turn, talks over the reply and checks the cut. Run it against
`next dev -p 3288` only when no other dev server shares the checkout: two of
them fight over `.next` and API routes 404 on the first try.

## The runner: work goes on when no terminal is open

Bart, 2026-11-14: "runner yes". On the Mac mini, launchd `sh.venture.runner`
runs `node scripts/venture/runner.mjs tick` every five minutes from its own
checkout, `~/hilma-venture`. A tick starts no model unless there is something
to do:

- an interactive session is open (the `imsg.mjs --wait` and `mail.mjs --wait`
  watchers write a heartbeat to `venture_state`, schema 008; fresh for ten
  minutes) → idle;
- a run is already going → idle;
- nothing new and no work block due → idle;
- otherwise (a text or voice note from Bart, mail from a customer, a sign-up, a
  finished voice conversation, or three hours since the last run between 6 am
  and 10 pm): `git pull`, `sync.mjs pull`, Claude Code headless with
  `apps/venture/runner/PROMPT.md` and the reasons, thirty minutes at most, then
  `sync.mjs push`.

The unattended session reads, writes the private notes, researches, answers
people who wrote to us and texts Bart when he needs to know; it cannot commit,
push, spend or write to a stranger (the tool list in `runner.mjs`, and the
prompt). Its Claude login is `CLAUDE_CODE_OAUTH_TOKEN` in `~/.venture-runner.env`
on the mini, like the Almanac's; the four venture keys are in the checkout's
`.env.local`.

    node scripts/venture/runner.mjs status            # from any machine
    ssh admin@100.95.51.98 'tail -20 ~/Library/Logs/venture-runner/runner.log'
    ssh admin@100.95.51.98 'bash ~/hilma-venture/apps/venture/runner/install.sh'   # install or update
    ssh admin@100.95.51.98 'launchctl bootout gui/501/sh.venture.runner'            # stop it

Each run's own output is a file in `~/Library/Logs/venture-runner/` on the
mini. `tick --dry` prints the decision, `tick --force "why"` runs now, `probe`
starts Claude Code once read-only. A new session takes over with step 0 of the
`/venture` skill (status, then `sync.mjs pull`).

## The project's home page

    https://app.kochitolabs.com

Behind a login since 2026-11-14 (before that it was `kochitolabs.com/kit?k=<key>`,
which now sends you here): a name and a passcode, then a signed cookie that
lasts a year. The accounts are `KOCHITO_APP_USERS` (`name:passcode,…`) and the
cookie is signed with `KOCHITO_APP_SECRET`, both in `.env.local` and on Vercel,
never in this repo; the code is `src/lib/kochito/app-auth.ts`. Wrong tries are
counted (`kochito_logins`, schema 007): 5 an hour per address, 30 a day in all.
`node scripts/venture/app-check.mjs <dir> [https://app.kochitolabs.com]` walks
the whole sign-in and takes pictures; `--unlock` clears a lockout.

Bart, 2026-11-14: "a landing page for this project on kochitolabs, that
includes your profile pic/avatar as well as a journal with stuff you've done
recently and a link to our 3 different voice systems (memos, interviews,
conversations)". The agent's persona is **Kit, a beaver** (he chose "a critter"
over a non-gendered person or a robot); `src/app/kochito/Kit.tsx` holds three
drawings (A mark, B seal, C portrait) and `FACE` in
`src/app/kochito/kit/page.tsx` says which one was signed off (null = the page
shows all three and asks). The page is behind the venture key and never
indexed. It links voice notes (`/venture/memo`), the open conversation
(`/venture/talk`) and a standing five-minute interview
(`/venture/call/checkin`, agenda in `private/call-checkin.md`), lists what is
waiting on Bart, and renders the journal: the `venture_docs` row `journal`,
source `private/JOURNAL.md` ("## Now", "## Waiting on you", then one "## day"
section per day with `- **time** what`), so it changes with a `sync.mjs push`
and no deploy.

### The board, round three: a working tool (2026-11-18, OLA-162 to 164)

Bart: "less cute and more functional ... I want it to actually be an issue
tracker ... This is where I live." The design is the private note
`BOARD-DESIGN-2026-11-18` (his words at the top). Five pages, one menu item
each, the page heading the same words as the item, nothing listed twice:

| Page | Address on app.kochitolabs.com | Page file | View |
| --- | --- | --- | --- |
| Home | `/` | `src/app/kochito/kit/page.tsx` | `views/Home.tsx` (Needs you, Now, Health, this week, Learning; fits 1440 x 900) |
| Issue Tracker | `/issues`, `/issues/OLA-150` (or `/issues/150`), `/issues/new` | `issues/page.tsx`, `issues/[id]/`, `issues/new/` | `views/Tracker.tsx`, `IssueView.tsx`, `NewIssue.tsx` |
| Plan | `/plan` | `plan/page.tsx` | `views/Plan.tsx` |
| Notes | `/notes`, `/notes/<slug>`, `/overview` (Ola in one page) | `notes/`, `overview/` | `views/Notes.tsx` |
| Learning | `/learning` (`/numbers` redirects) | `learning/page.tsx` | `views/Learning.tsx` |

The frame and the menu (with Talk to Kit and Quick links under a rule, and
the machine's reading in compact form at the top) are `Shell.tsx`; the links
out are `links.ts` (the Mac app's address is read from
`https://ola.cx/ola-site/mac/latest.json`); the status panel is `health.tsx`;
Learning is `views/Learning.tsx` (see "Learning and the daily sweep" below).
**Styles: `src/app/kochito/kit/board.css`**, the design rules at its top. The
look is Lamp, which Bart picked on Nov 18 from two tried on the real board
(OLA-170): Ola's "paper under the lamp" colors, Instrument Sans for everything a
person reads, JetBrains Mono only for identifiers, lamp yellow for work in
progress and vermilion for what waits on him, used for nothing else. The public
company pages' CSS is not used by the board. `next.config.ts` rewrites
`/issues`, `/notes`, `/plan`, `/learning`, `/overview` on that host.

**Learning and the daily sweep** (2026-11-18, OLA-171; it replaced the Numbers
page). Bart: "a new daily 'agentic sweep' where the agent (you) take a look at
all the things that happened that day and, from that, improves its memory and
other systems". The page shows three headline figures (Kit: the share of his
corrections that were new, not repeats; Ola: its own model's score as a share of
Claude's; the weaknesses guarded and holding), the weaknesses table, then one
dated update per day, then the measures with their history.
The two percentages are venture_state `learning` (`scripts/venture/learning.mjs`,
run by every `sync.mjs push`). The updates are venture_state `sweeps`, written by
`node scripts/venture/sweep.mjs post <entry.json>`; **the procedure an agent
follows is `apps/venture/SWEEP.md`** (`sweep.mjs gather` prints everything that
happened that day; `sweep.mjs due` names the days owed). A terminal session is
told by the prompt hook when a day is owed; the runner on the mini does it after
9 pm when no session did. A day with no entry shows on the page in amber.

**The weaknesses ledger** (the same evening; Bart: "a system that gets smarter and
better each day by studying what it did wrong, how to prevent that same
mistake/weakness, and what else can be learned, generalized, built"). Every
correction and every fault a sweep finds is filed under one named weakness, for
Kit or for Ola, in `apps/venture/private/data/weaknesses.json` (shape and the
status rule in `scripts/venture/_weak.mjs`): how often it was seen, its guards,
and whether the newest enforced guard has held (`guarded`), was followed by
another occurrence (`back`), or does not exist yet (`open`). `learning.mjs` puts
the ledger in venture_state `learning` and says when a correction is not filed;
the page's third headline figure is "weaknesses guarded and holding, of all
known". Each sweep files its findings there, writes the day's pattern, and names
the one thing to build next (`build`).

**Daily ideas** (2026-11-18, OLA-179). Bart: "daily loop for kit and Ola each to
think of one idea or improvement to make the overall system and the code engine
work better. Notify me each day when that happened. Document on the learning
page". Every sweep entry carries `ideas: { kit, ola }`, each `{ text, why,
issue }` with a ticket of its own; `sweep.mjs post` refuses an entry without
them, or with a ticket that was already an idea, and on the day's first post
texts Bart the two (`ideas.told` records it; a repost sends nothing, `--no-text`
skips it). The Learning page lists them by day under "Daily ideas" with each
ticket's status (`Ideas` in `views/Learning.tsx`).

**What keeps the rules in use** (2026-11-19; Bart: "25 out of 30 does not sound
great"). (1) `.claude/hooks/venture-rules.py` (SessionStart, via
`venture-rules.sh`) prints a digest of the private RULES.md, every rule's number
and bold lead sentence: Claude Code gives a session at most 10,000 characters
from a hook and shows the first 2,000 of anything longer, which is what happened
to the whole file once it reached 34,000. `sync.mjs push` runs
`venture-rules.py --size` and refuses to save when the digest is over 9,000
characters or a rule has no lead sentence (OLA-183). (2) `bart-done.py`
(UserPromptSubmit) adds the five weaknesses corrected most in the last three
days, each with its `now` line from `data/weaknesses.json`. (3)
`.claude/hooks/reply-check.py` (Stop) sends a reply back once when it breaks the
limits in `scripts/venture/reply-rules.json`; `imsg.mjs send` refuses such a
text (`--long` when he asked for a full answer) (OLA-180). (4) `sync.mjs push`
keeps the version it replaces in the bucket `venture-history`, one per file per
hour; `sync.mjs history <file> [stamp]` lists and prints (OLA-184). (5) From Nov
19 to Nov 25 a sweep entry must carry `learning`, one improvement to the
learning system made that day, and the Nov 26 entry `learningReview` (`TRIAL` in
`sweep.mjs`, OLA-182).

**Bart's writes on the tracker reach an agent** (OLA-172): a ticket he creates,
reopens or comments on is listed by `issues.mjs inbox` until it is marked read.
Every session runs `issues.mjs --wait` beside the other watchers and sees unread
items in front of every prompt (the hook); the runner wakes on them when no
session is open (`runner.mjs`, `runner/PROMPT.md`, "Bart wrote on the tracker").

**Look at it without signing in**: `pnpm dev -p 3377`, then
`http://localhost:3377/kochito/kit/mock` and the same paths under it
(`/mock/issues?tab=done`, `/mock/issues/OLA-210`, `/mock/plan` ...), made-up
data from `fixture.ts`, nothing saved. Pictures of every page at 1440 and 390:
`node scripts/venture/board-pages.mjs <dir>` (mock) or, signed in against a dev
server started with a made-up account (`KOCHITO_APP_USERS=dev:<passcode>
KOCHITO_APP_SECRET=<32 chars>` in that shell only, next to the loaded
`.env.local`), `BOARD_PASS=<passcode> node scripts/venture/board-pages.mjs <dir>
http://localhost:3377/kochito/kit --real`. A dev server with no `VENTURE_KEY`
works; the voice links then carry no key.

**The tracker writes.** On an issue's page Bart edits the title and the
description by clicking them, changes Status (Done asks for a line of proof),
Priority, Area, Who and Plan week, and comments (Cmd-Return); New issue makes
one. Every write goes through `src/app/api/kochito/app/issues/` (POST new,
PATCH `<id>`, POST `<id>/comments`), which checks the board's session cookie
and the origin, and is recorded as the signed-in account by
`src/lib/venture/issue-writes.ts`. Each change adds a line to the issue's
Activity: table `venture_issue_activity`, `schema/012_issue_activity.sql`
(applied 2026-11-18 with the same management-API command as 011 below, from
the M1 iMac where the ops vault is). What a board account writes is new for
Kit until Kit reads it:

    node scripts/venture/issues.mjs inbox            # what Bart wrote that Kit has not read
    node scripts/venture/issues.mjs inbox --mark     # mark those read: the page then says "seen by Kit"
    node scripts/venture/issues.mjs --wait           # exits when something new arrives (like imsg.mjs --wait)
    node scripts/venture/issues.mjs comment OLA-150 "the answer"
    node scripts/venture/issues.mjs show OLA-150     # the issue and its whole thread

`.claude/hooks/bart-done.py` lists the unread items before every prompt
(`issues.mjs hook`, one call, cached two minutes). The CLI's own status
changes and edits are recorded in the thread too, already read. Without the
table the page says "Comments are not set up yet" and fields still save.
`scripts/venture/tracker-check.mjs <dir>` walks every write as a signed-in
person on a throwaway "TEST (delete me)" issue, takes pictures, then drops it
and deletes its rows.

**The status panel (OLA-164).** One reading, one time. The old corner said
"the mini's disk is almost full" beside 73 GB free: the watcher took its alarm
sentences from `state.active`, and the disk entry left there before disk texts
were turned off (Nov 17) was never cleared, because the disk no longer reached
`decide()`. `apps/activist-ai/ops/watch.mjs` now builds the sentences from the
run's own readings and forgets that entry (test in `ops/watch-test.mjs`; live
with the next deploy on the mini), and the board's `alarmSays()` in
`src/lib/venture/board.ts` never shows a sentence its reading contradicts.

### The board, built around Ola, and the issue tracker (2026-11-17)

Round three above replaced this page's layout; what follows is still true of
the data, the tracker's tables and the commands.

Bart: "reorganize app.kochitolabs.com, to center the project, OLA ... make it a
better more useful dashboard", "make sure it is updated at least every few
hours", and "there should be the equivalent of an issue tracker so i can see
everything that was done yesterday". The page now reads, top to bottom: the
project (its name, the first sentence of the journal's Now, when Kit last wrote,
and the mini's live readout), **On the plate** (doing, next up, waiting on you),
**Independence**, **The plan** (the 30-day plan as a road of days, with what was
done each day), **Done** (the tracker by day, today and yesterday open, search
and filters, each item opens to its proof and commits, Kit's day notes folded
under each day), Decided and To be decided, Numbers and the live status, and
the voice links. Code: `src/lib/venture/board.ts` (everything it reads),
`src/app/kochito/kit/Board.tsx`, `Done.tsx`, `IssueRow.tsx`; the design note is
the board's section in `src/app/kochito/company.css`. To design with made-up
data, `next dev` and `/kochito/kit/mock` (`?v=b` is the front-page layout that
lost to the rail), pictures with `node scripts/venture/board-shots.mjs`.

**Round two (2026-11-17)**, Bart: "key links in the sidebar; a way to view
closed / resolved issues ... think like a product manager". The plan is the
private note `BOARD-PLAN-2026-11-17` (his jobs on the page, what each needs,
what was cut). Every page now sits in one frame (`Shell.tsx`): a left column on
a wide screen, Menu on a phone, with the health readout and every link he opens
(public ones in `src/app/kochito/kit/links.ts`; the notes are the journal's
"Active project" links plus the newest review and the builders' rules). The
overview starts with **Needs you** (waiting on Bart, To be decided, the
check-in list) and a count. The tracker is `app.kochitolabs.com/issues`
(status tabs with counts, area / priority / who / week filters, search, sort;
the filters are the address), each issue has its own page `/issues/OLA-n`
(proof, dates, commits linked to GitHub), and a note opens inside the board at
`/notes/<slug>`, behind the same sign-in (`next.config.ts` rewrites the three
paths on that host).

**Ola in one page** (OLA-132): a card on the overview and its own page,
`app.kochitolabs.com/overview`, render `apps/activist-ai/OVERVIEW.md` (read from
the deployment's files; `next.config.ts` traces it into those routes). Its red
"stale" badge follows `scripts/venture/overview-check.mjs`'s rule: Vercel has
no git, so `src/lib/venture/overview.ts` asks GitHub's public API for Ola's
commits on main since the page's "Last checked against" hash, cached 15
minutes; when GitHub cannot be read the card says "not checked" and why.

**The issue tracker** is the record of work and the source of the plate (the
journal's "On my plate" is no longer read by anything; the journal keeps Now,
Decided, To be decided, Check-in list and the day notes). Tables
`venture_issues` and `venture_commits`, `schema/011_issues.sql`, applied
2026-11-17 through the Supabase management API with the ops vault's token:

    ( set -a; . ~/.config/ops/vault.env; set +a; python3 -c 'import json,sys; print(json.dumps({"query": open(sys.argv[1]).read()}))' apps/venture/schema/011_issues.sql | curl -s -X POST https://api.supabase.com/v1/projects/tqniseocczttrfwtpbdr/database/query -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H 'Content-Type: application/json' --data-binary @- )

The lead and every builder keep it current with `scripts/venture/issues.mjs`:

    node scripts/venture/issues.mjs add "The web app's sign-in fails in Safari" --area web --pri P0 --what "why" --start
    node scripts/venture/issues.mjs start OLA-142 --who builder-2
    node scripts/venture/issues.mjs done OLA-142 --proof "402 checks" --commit 1a2b3c4
    node scripts/venture/issues.mjs wait OLA-143          # waiting on Bart
    node scripts/venture/issues.mjs list --day yesterday   # or today, 2026-11-16; --status, --area
    node scripts/venture/issues.mjs plate | unsorted | show OLA-142 | place <sha> <OLA-n|none>

Titles are for Bart, in plain words, never internal names (say the model
connection, sign-in, a project's sealed box, the practice copy on the mini).
Areas: web, apps, model, security, ops, voice, design, board. **Commits find
their issue by themselves**: put `[OLA-142]` in the subject or body. The cron
`/api/venture/commits/sync` (Vercel, every 30 minutes, no token: the repo is
public) files new commits on main; an Ola commit that names no issue shows on
the board as "Unsorted commits" until the lead places it. November 15 to 17
were backfilled from the commits and the journal (OLA-1 to OLA-76 done, OLA-77
onward the plate as of that morning).

**Freshness.** The mini's alarm (`apps/activist-ai/ops/watch.mjs`) also pushes
a compact status every 10 minutes to `/api/venture/status` (venture_state
`ola_status`); the board marks it stale after 30 minutes. It goes live on the
mini with the next deploy of the practice copy (`node ops/ola.mjs deploy`, from
`~/ola-staging`). The narrative is Kit's: the header says when Kit last wrote,
and when that is more than three hours ago between 7 am and 11 pm Pacific, the
runner wakes with "the board is stale" and refreshes the journal from the
tracker, the commits and the status (`runner.mjs`, `runner/PROMPT.md`). The
runner picks this up after its checkout pulls; to load it at once:
`ssh admin@100.95.51.98 'cd ~/hilma-venture && git pull --ff-only && launchctl kickstart -k gui/501/sh.venture.runner'`.
`node scripts/venture/app-check.mjs <dir> https://app.kochitolabs.com` checks
the sign-in and the board (plate, Independence, the road, today's and
yesterday's Done, a fresh status).

## Kit in the Ola iPhone app: voice meetings and notes (2026-11-17)

Bart: "proper full duplex voice meetings with you or leave you voice notes",
in the Ola app, admins only, "like the voice mode in the dodo app". The app's
Kit tab signs in with the page's accounts (`/api/kochito/app-token`) and calls
`/api/venture/phone/*` with that token; the code is `src/lib/venture/phone.ts`.

- **A meeting** is Dodo's ElevenLabs + Claude engine with Kit's words: the
  ElevenLabs Speech Engine **"Kit"** (Angela, calm; `KIT_ENGINE_ID`, made by
  `node scripts/venture/kit-engine.mjs`, which touches that engine only; one
  conversation at a time, a token required, ends after four minutes of
  silence or forty in all) points at the voice bridge's existing `/ws/prod`
  path, so its turns reach `/api/f2/eleven/turn` like Dodo's; ids that start
  with `kit-` are handed to `kitTurn()` before anything of Dodo's runs. No
  bridge deploy or Railway variable. Claude answers with the talk page's
  persona and notes (`talkSystem`), the greeting is fixed so it is instant,
  and the system prompt is cached while the call connects. Turns are stored as
  they happen under `call = 'phone'`: `node scripts/venture/transcript.mjs`
  shows them and the runner wakes on them like any call. A token is minted
  only by a start (a person pressing Talk to Kit), at most one every 15 s and
  ten an hour.
- **A note** is the memo page's path: the phone records AAC (up to five
  minutes, 4 MB), the server transcribes it (`transcribe` in `memo.ts`) and
  stores it as a voice note in `venture_messages`; the audio is not kept.
- Tests with stand-ins for everything: `npx tsx --test scripts/venture/phone-test.ts`.

### Every voice call becomes notes (2026-11-17)

Bart: "when we have voice mode I need those conversations to go into your memory and decisions
to be acted on, always." An idea he was exploring ("Make it a choice.") had been answered "Got
it" and recorded as decided.

- **In the call** (the persona in `talk.ts`, shared by the talk page and the phone): voice is where
  he thinks out loud; Kit asks "Decided, or thinking out loud?" once when something sounds like a
  decision, never says "got it, I'll do that" to an idea, and recaps when he says goodbye.
- **Minutes** (`src/lib/venture/minutes.ts`, table `venture_minutes`, schema 010): one Claude call
  for every meeting that is over (an end marker, or quiet for five minutes), every voice note
  (phone or memo page) and the talk page. Since 2026-11-19 (OLA-186) the call runs on the Mac
  mini on the Claude login, the Max plan, never the API key: `scripts/venture/minutes.ts --sweep`
  once a minute (launchd `sh.venture.minutes`, `apps/venture/runner/`), so minutes appear within
  about two minutes. The Vercel server reads them and stores his corrections; it cannot write them.
  `decided` holds only what he confirmed, with his words quoted (a quote that is not in his own
  lines makes it `to_decide`), then `to_decide`, `kit_will_do`, `facts`, a summary. He corrects
  them from the phone; a corrected line is marked his and the minutes count as unread again.
- **Who reads them**: `transcript.mjs --minutes [session]`; `--wait phone` prints them after a call
  or a note; the runner wakes on unread minutes, gets them in its prompt with the order to put
  them on the board (`## Decided`, `## To be decided`) and do `kit_will_do`.
  `npx tsx scripts/venture/minutes.ts --session <id> | --note <id> [--force]` rewrites one by hand.

## Independence: the steer count and the replay suite

Bart, 2026-11-16: "each time i steer, that's a failure of sorts, and you then
learn from that... i want some sort of metric about if you're getting better
and better at that. a number or some such." Two measures, both private in
their content (his words, the rubric and the cases live in `private/` and
Supabase, never in this repo):

- **The steer rate.** `node scripts/venture/steers.mjs [--day D | --backfill
  FROM TO] [--dry] [--collect]` collects every message he wrote on a day
  (Pacific): what he typed into this project's Claude Code sessions on the iMac
  (`origin.kind "human"` lines, mid-turn messages included; tool results,
  reminders, notifications, hook output, compaction summaries and slash-command
  boilerplate left out), his texts and voice notes (`venture_messages`), and his
  turns on the voice calls (`venture_interview_turns`, test calls left out). An
  independent Claude Opus 5.5 labels each against the rule titles in
  `private/RULES.md`, the dated corrections in `private/CORRECTIONS.md` and the
  feedback lessons in the session memory: steer, maybe or not, with a class and
  "repeat" when the class was already covered before that message. Steer rate =
  (steers + repeats) per 100 of his messages. Stored in `venture_state`
  "steers" (a map by date) and `private/STEERS.md`. launchd
  `apps/venture/runner/sh.venture.steers.plist` runs it on the iMac at 9:40 for
  yesterday (the transcripts are only there); `morning.mjs` puts one line in
  the 10 am text; app.kochitolabs.com shows the "Independence" block. The
  grader runs on the machine's Claude login, the Max plan, not the API key
  (`scripts/venture/_claude.mjs`, since 2026-11-19, OLA-186: one headless
  Claude Code call with no tools, no settings and an empty folder).
- **The replay suite.** `node scripts/venture/steer-replay.mjs [--tries N]
  [--only ids] [--dry]` turns past steers into tests
  (`private/steer-cases/*.json`: the situation just before the mistake and a
  must / must-not rubric), gives each to a fresh Opus 5.5 three times with
  RULES.md and three times without, and grades each answer (all on the Claude
  login, the Max plan, through `_claude.mjs`, four calls at a time). Pass rate with the
  rules says whether the learning is written down well enough; the lift over
  no rules says whether the rules do the work. Cases that fail with the rules
  name the rules that are too weak. Stored in `venture_state` "steer_replay"
  and the "# Replay" section of `private/STEERS.md`. A run costs about $4.

## Mail on the company's domains

kochitolabs.com, clerkpdf.com and appadopt.com send and receive through
SendGrid (set up 2026-11-14 with a full-access key that lives only in the ops
vault as `SENDGRID_FULL_API_KEY`; day-to-day sending uses the send-only
`SENDGRID_API_KEY`).

- **Out.** Each domain is authenticated (three CNAMEs and a DMARC record;
  Namecheap records added with `node scripts/domains/nc-hosts.mjs`, which keeps
  the existing ones; kochitolabs.com is on Vercel DNS).
  `node scripts/venture/mail.mjs send --from hello@clerkpdf.com --to … --subject … --file body.txt`
  sends plain text and stores the message. **Its guard has no override:** it
  sends only to an address that has written to us, signed up on a page, or is
  listed in `private/approved-recipients.txt`, where a stranger's address goes
  only with Bart's yes quoted beside it.
- **In.** Each domain's MX is `mx.sendgrid.net`; SendGrid Inbound Parse posts
  every message to `/api/kochito/mail/in?t=<KOCHITO_MAIL_TOKEN>`
  (`src/lib/kochito/mail.ts`), which stores it in `kochito_mail`
  (`schema/006_kochito_mail.sql`). `mail.mjs inbox` reads what no session has
  read; `mail.mjs --wait` is the watcher; `mail.mjs thread <address>` shows one
  correspondence.
  Attachments are kept in the private bucket `kochito-files` with a row each in
  `kochito_files` (`schema/009_kochito_files.sql`): `node scripts/venture/files.mjs`
  lists them, `get <id>` downloads one, `delivered <id>` starts the 30 days the
  service page promises, `purge` deletes what is due (the runner does it on every
  run). Since the evening of 2026-11-14 SendGrid posts each message first to a
  Supabase function (`supabase/functions/kochito-mail-in`, project sms-bot, deployed
  with `supabase functions deploy kochito-mail-in --no-verify-jwt --use-api`; secrets
  `KOCHITO_MAIL_TOKEN` and `KOCHITO_MAIL_FORWARD`), because the site's webhook cannot
  take a request over about 4 MB: the function stores the attachments and passes the
  rest on to `/api/kochito/mail/in`. Checked with a real 7 MB email and a 26 MB post.
  To undo, point the three Inbound Parse settings back at the site's webhook.
- **Watching agenda pages:** `node scripts/venture/watch.mjs check | newest | volume [months]` lists what the
  public bodies in `private/data/watch.json` have posted (Legistar's API and meeting pages, CivicPlus Agenda
  Center, CivicClerk): what is new since the last run, each body's newest agenda, and a year's meetings, files
  and pages. It names no body itself, spaces its requests a second apart per site, and counts pages with
  poppler's `pdfinfo` from a pipe. Its header documents the config and the output columns.
- **Fixing one document:** `node scripts/venture/fix.mjs <url-or-file> <folder under private/>`
  runs the private PDF pipeline on it (installed on the iMac and, since 2026-11-14, on the
  Mac mini: a uv venv at `private/pdf-proof/.venv`, plus veraPDF, poppler and ocrmypdf from
  Homebrew) and prints PASS or DOES NOT PASS by the pipeline's own rule. It prints READY only when the result passes and the pipeline
  flagged nothing to read (`--twice` also fixes it a second time from nothing and compares the
  two transcripts); PASSES, READ FIRST means a terminal session reads it before it goes anywhere.
  It keeps a daily cap
  on what the model calls cost (`FIX_CAP_USD`, default 3, shared by all machines through
  `venture_state`; `fix.mjs --spent`) and a page limit per run. The runner may use it only on
  a document a customer sent.

## Voice notes

Bart, 2026-11-14: "a permanent conversation URL I can bookmark... a URL where I
can leave you voice notes."

    https://ola.cx/venture/memo?k=<key>

Record, then stop and send (or discard). The browser records with
`MediaRecorder` at 32 kbit/s, one upload per note, nine minutes at most; the
server transcribes it (`gpt-4o-transcribe`) and stores it in the text thread,
`venture_messages`, marked `(voice note)`. So the watcher the working session
already runs (`imsg.mjs --wait`) wakes on it, and he never has to say a note
exists. Nothing answers on the page; the list under the button shows each note
and when the session read it.

| What | Where |
|---|---|
| Transcribe, store, list | `src/lib/venture/memo.ts`, route `src/app/api/venture/memo/route.ts` |
| Page | `src/app/venture/memo/`, `src/app/venture/Memo.tsx` |
| Test, no human | `node scripts/venture/memo-check.mjs <outDir> [base]` (a fake microphone plays one note; sent as a test, so it is stored as read and deleted after) |

## iMessage

Bart, 2026-11-13: "you can/should communicate with me using iMessage; we have
an iMessage bridge running on the Mac mini." Both directions go through the
plumbing Dodo and Onething already use (see "iMessage — one inbox" in the root
CLAUDE.md); the thread is the table `venture_messages`
(`schema/003_messages.sql`).

- **Out.** `node scripts/venture/imsg.mjs send "…"` posts to
  `/api/venture/imsg` (behind the key), which sends through `sendIMessage` to
  the phone handle paired to the f2 account `bart` and stores the row. Every
  text starts with `✴️` (`VENTURE_MARK`); the webhook drops from-me echoes that
  carry it.
- **In.** A text from one of Bart's paired handles that starts with `v` or
  `venture` is Venture's: `dispatchInbound` hands it to
  `src/lib/venture/messages.ts` before Onething or Dodo see it. It is stored;
  the server does not answer it. Since 2026-11-19 (OLA-187) the answer is
  written on the Mac mini on the Claude login, the Max plan, never the API key:
  `scripts/venture/text-reply.ts` (launchd `sh.venture.texts`, always running)
  looks every 5 seconds, gives Opus 5.5 the instructions in
  `src/lib/venture/texter.ts`, the loaded `venture_docs` notes and the last 40
  messages, and sends the answer through `imsg.mjs send --reply`, so his limits
  for a text are checked first. About ten seconds from his text to the answer;
  several texts in a row get one answer; an acknowledgment gets none. `--try
  "text"` prints an answer and its timings without sending; `--dry` runs the
  job without sending. Log on the mini: `~/Library/Logs/venture-runner/texts.log`.
  That reply cannot act; the working session reads the thread when it runs
  (`imsg.mjs inbox`, or `imsg.mjs --wait` as a background task).

## The company's site: kochitolabs.com

Bart asked (2026-11-14) for demand exploration before picking an idea: landing
pages and a small ad campaign. The pages are the company's site,
`src/app/kochito/` (kochitolabs.com through host rewrites; the domain is
registered at Vercel): `/pdf` and `/apps`, one form each.

| What | Where |
|---|---|
| Pages, the form, the visit counter | `src/app/kochito/` (`LeadForm.tsx`, `Track.tsx`, `kochito.css`) |
| Storage (events without cookies, sign-ups) | `src/lib/kochito/store.ts`, `schema/004_kochito.sql`, routes `/api/kochito/{event,lead}` |
| The numbers: people per page and source; new sign-ups | `node scripts/venture/leads.mjs` (`--all`, `--since <day>`, `--wait`) |
| Form check, as a visitor from an ad | `node scripts/venture/kochito-check.mjs [base]` (its sign-ups use `@kochito-check.test`, never counted, deleted after) |
| One fixed document shown to its owner, `kochitolabs.com/s/<slug>` | `src/app/kochito/s/[slug]/`, `schema/005_kochito_samples.sql`, `node scripts/venture/kochito-sample.mjs put <slug> [--publish] \| unpublish <slug> \| list` (reads a private fixing run; refuses a file that does not pass the checker) |
| Look at every page; rebuild the share images | `kochito-shots.mjs <dir> [base]`, `kochito-og.mjs` (both against a dev server; pass `https://kochitolabs.com` to look at the live site) |

The design and the rule it is held to are at the top of `kochito.css`: the
third version, after Bart called the first "ai slop" and the second "too
plain". Each page has one explanatory picture (`DocVisual.tsx`,
`PrVisual.tsx`); change the design by comparing two directions side by side.

Ad links carry `utm_source`, `utm_campaign` and `utm_term`; the page remembers
the first ones a browser arrived with, so a sign-up counts for the ad that
brought the visitor. What the pages claim (dates, prices, what is offered) is
sourced in the private notes; correct it there first, then here.

## Persistence: a session is not the business

Bart, same evening: "we need to save this session as a skill or agent or
whatever so that when this computer restarts or this terminal closes, we can
resume your work." Nothing that matters is kept only in a conversation:

| What | Where |
|---|---|
| The procedure for resuming (read state, catch up on Bart, restart watchers, work, checkpoint) | the project skill `.claude/skills/venture/SKILL.md`: type `/venture` in any session |
| Where things stand and the next actions | `private/NOW.md` (doc `now`), rewritten at every checkpoint |
| What happened and what Bart said, dated | `private/LOG.md` (doc `log`), append only |
| The rules | `private/CHARTER.md` (doc `charter`) |
| A copy of every private document off this disk | `venture_docs`, with the file name in `source`; `node scripts/venture/sync.mjs push | pull | status` |
| Everything Bart said by voice or text | `venture_interview_turns`, `venture_messages` |
| The standing rules, each distilled from a correction Bart had to make, with the checklists to run before he or a customer sees anything | `private/RULES.md` (doc `rules`). On this machine a SessionStart hook (`.claude/hooks/venture-rules.sh`, untracked like the rest of `.claude/hooks`) injects it into every session in the repo, also after compaction; the voice and the texting Claude get it right after `now` |
| Every correction, in his words, with the cause, the rule and the generalization | `private/CORRECTIONS.md` (doc `corrections`) |
| What has proved true and wrong (how he works, ideas, customers, tools, mistakes), read at every start and written at every result | `private/LESSONS.md` (doc `lessons`) |
| Every test's prediction, written before its result, then the result and the gap; the calibration so far | `private/BETS.md` (doc `bets`) |
| Data files (`private/data/` lead lists and scans, `private/pdf-proof/` samples) | the private storage bucket `venture-private`, by the same `sync.mjs push / pull` |
| The few rules every Claude session must know | the memory file `project_venture.md` |

Later the same day he made it stricter: "every time I correct something, that's a
failure... update your memory so that you don't make that same mistake again...
can I generalize additional learnings from this?... make sure that those
memories are always part of your context." The protocol is in the skill (step
3b) and at the top of RULES.md.

Bart asked on 2026-11-14 for the agent to learn as well as remember ("so that
it can inform and you can improve your work over time"). The skill makes every
session read LESSONS and BETS first, write a prediction before every test,
close it with the result, add a lesson whenever he corrects or decides
something, and review the whole file at the end of each weekly cycle.

`sync.mjs pull` on another machine (with the repo and `.env.local`) rebuilds
the private folder, so the mini or the laptop can pick the work up. The access
key is in `private/KEY` and as `VENTURE_KEY` in `.env.local`; it is not in
Supabase, but every link texted to Bart carries it. Not built yet: a scheduled
headless session that works with no terminal open.

