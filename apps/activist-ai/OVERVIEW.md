# Ola in one page

Last checked against: `e7d422f2` (2026-11-20)

This is the map. Every agent reads it first; the detail lives in the docs it points to. When Ola
code changes, check this page against it and update the line above (procedure at the end).

## What Ola is, and for whom

Ola is a private AI agent service for **activists and community groups** (settled 2026-11-17, not
to be reopened). It works with a group's documents and data and writes the code to do it, the way
Claude Code does, but on open models and on one computer in Bart's office that never shares the
work. The promise on the landing page: you always know where your stuff is, you can see all of it,
and you can delete it anytime. The first users are **Frances** (the Adaptation Almanac) and
**Ian** (the MRD law library), in December. Their existing services stay where they are; a project
home links to them.

## Four products, two runtimes

Bart's words (2026-11-18), used everywhere from now on. The **four products** are the web app, the
`ola` command, the Mac app and the iPhone app. The **two runtimes** are where the agent and the
files are: the **cloud runtime** (the Ola machine) and the **local runtime** (your Mac; for the
iPhone, through your Mac). Settings about the work follow the runtime, the same in every product
there ("Lots of permissions" is one switch per runtime); things about the person (sign-in,
appearance, notifications) follow the person. In the Mac and iPhone apps the runtime is chosen in
**New Session**; Settings keeps only the setup.

## Where people use it

| Surface | What it is | Code | State |
|---|---|---|---|
| **Web app**, `https://app.ola.cx` | The main client, cloud runtime only. A project opens on its things (documents, tables, charts, pages); **Ask Ola** is a drawer with the conversation; Files, Data, Jobs, Settings. A page Ola made has **Publish** (the owner only). On a phone the project opens on its conversation, under three tabs (Conversation, Made by Ola, Sources) with one Menu; Ola's questions show as a card. Look A, "paper under the lamp" | `web/` (Vite + Solid on `@opencode/client`), served by `frontdesk/` | live on the staging machine, made-up data |
| **Mac app** | SwiftUI. Both runtimes live at once: **New Session** (Cmd-N) asks Cloud (on the Ola machine) or Local (on this Mac: opencode runs in a chosen folder; only model and web requests go to the Ola machine), and the sidebar lists sessions under each. Bundles Ola's opencode build and skills | `apple/Mac`, `apple/OlaKit`, `apple/Shared` | 0.1 (build 25), a Developer ID signed, notarized download that updates itself (GitHub releases of hilma). Native Mac look, Light by default, two dark styles; the Hop is the one working indicator |
| **iPhone app** | Cloud: signs in with a name and password and works in the person's project on app.ola.cx, the same sessions as the website and the Mac (Mac off, no Tailscale; OLA-150). Local: pairs with the Mac app by QR code over Tailscale. The pencil opens New Session with the same choice; sessions are listed under each runtime. Also the Kit tab (voice, admins only) | `apple/iOS` | TestFlight, internal group, bundle ID `cx.ola.mac` (shared with the Mac app's App Store record since 2026-11-17) |
| **`ola` command** | opencode's terminal interface with Ola's wordmark, "On this Mac" in a terminal; the Mac app's own executable in CLI mode | `apple/OlaKit/OlaCLI.swift`, `opencode-fork/` | ships inside the Mac app |
| **Landing page**, `https://ola.cx` | Bart's letter beside a drawing of the "datacenter", and **How Ola works** at `ola.cx/architecture` (the public architecture page, linked from the letter; keep it true when this page changes). Static, no JavaScript, no third-party requests | `site/` → `public/ola-site/` (Vercel) | live |

**One cloud** (OLA-150, 2026-11-19): the apps' Cloud is the signed-in person's project on app.ola.cx
through the front desk's device routes (`/api/device/projects`, `/api/device/w/<project>/`), the same
sessions the website shows; signing in is all it takes. Bart's own server, **Bart's opencode**
(`bart/`, Tailscale only), is no longer used by the apps; its sessions were moved into his project.

**Publishing** (OLA-209, OLA-223, OLA-230; 2026-11-19 and 20): a page Ola made goes public at
`https://sites.ola.cx/<project>/` (a separate Vercel project fed from a git repository, with a
sandbox policy). In a cloud project: the Publish button on the website, or asked in the
conversation ("publish it", "publish it again", "take it down"), each after one yes that names
the exact files; secrets are refused; an admin can take any page down. A signed-in Mac publishes a
folder at `sites.ola.cx/<name>/` through the device routes. The agent in the VM never reaches the
network: the front desk reads the files out and publishes. **Where it is proven:** on the website
in a cloud project, by a checker (Nov 20). Not checked: the Mac app and the iPhone app. Asked in
chat with Ola working on the Mac it failed in the request test's first run. What may be said about
it is what `node scripts/venture/issues.mjs say OLA-230` prints. README, "Publish".

**Where a feature has to work.** Two runtimes (a cloud project, the Mac), three places to use
them (the website, the Mac app, the iPhone app), and two ways (asked in chat, done on a screen):
ten places in all. A feature is checked in each, or the place is skipped with a reason, on its
ticket (`issues.mjs check <id>`). `evals/asks/abilities.json` (OLA-232) is the one list of what
Ola can be asked to do in each runtime; what Ola is told about its own abilities comes from it.

## How a request travels

```
person ─ HTTPS ─► app.ola.cx (ngrok, TLS passed through) ─► ops/tls.mjs (TLS ends on our machine)
   ─► front desk (frontdesk/server.mjs): sign-in, membership, files, audit log
        ─► the project's sealed VM: opencode 2.3.2 serve, reached through its desk socket
             ─► the door (one unix socket, the VM's only way out) ─► model gateway (gateway/server.mjs)
                  ─► the open model (Together stand-in today; a local MLX server on the Studio)
                  ─► Claude Code or the hosted open model, only when the project's owner allows it
```

1. **Sign-in, at the front desk.** A name (handle) and a password, by invitation. Wrong passwords
   slow that name down, not the whole address. A passkey is an option added in Your account. Sessions are server-side cookies. The Mac app and `ola` sign in with
   the same name and password inside the app and get a device pass kept in the Keychain.
2. **The workspace.** Each project is one sealed Linux VM (Apple `container`) with `--network none`,
   a read-only root, no capabilities, and its own volume at `/work` holding its files and its own
   database (`/work/project.db`). opencode 2.3.2 runs inside. Idle projects stop after 30 minutes
   and wake on the next request. At most 4 run at once. Three things run in every project: a note
   to the person when a file or a tool result carries text that tells an AI what to do (the
   `ola-planted` plugin, also in the Mac's local runtime), a record of which engine made each
   file (`ola-db made-by`), which Ola reads before saying who made something, and, for a request to
   make an app, page or game, the closest kept worked example in the model's instructions for that
   request (the `ola-examples` plugin, also on the Mac: test requests, and in a cloud project also that
   project's own requests that ended well, kept only in its volume by `frontdesk/examples.mjs` and
   `ola-db examples`, taken out on "This was wrong" or a handover to /claude; the gateway's log line
   says `example: project|library`, and `GATEWAY_EXAMPLES=off` turns it off everywhere; OLA-181).
3. **The model gateway.** The one address a workspace can reach. It holds the model keys, checks the
   caller's token (bound to that workspace's door), caps size, concurrency, time and weekly tokens,
   rebuilds every reply from an allowlist, and logs one line per request with no content. It also
   makes every web search and download (the VM has no network; downloads refuse Stanford's own
   networks), and serves the specialists. When a model server keeps refusing, a request goes once
   to that name's backup model.
4. **The models.** Ola's own open model first: the everyday model is `general` (NVIDIA Nemotron 3.5
   Super VL today); specialists `see`, `ocr`, `read`, `translate` and others (Muse Glimmer 30B
   today). Both are rented on Together with made-up data until the Mac Studio serves them locally.
   Two fallbacks, both off by default and turned on per project by its owner: **Claude Code**
   itself, run inside the same sealed VM, and a **hosted open model**. `/claude` and `/hosted` hand
   one request over; the "this may be a stretch" card suggests it: during a run when Ola is
   stuck, and before a run when the request is big (many documents, files past the context, a
   long build) or is design work (the simple confidence check, `web/src/lib/steps.ts` precheck).
   The ladder is local inference, then a hosted open model, then Claude, each only when the
   cheaper one is not good enough. Local inference is stubbed on Together until the Studio.
5. **Permissions.** "Lots of permissions" (on by default) lets Ola run commands, change files,
   search the web and download without asking; off, it asks before each step, and "yes, for the
   rest of this session" covers that kind of step for the session (a web step is one kind). It
   never works outside its folder or project either way.

## The parts

| Part | Code | Runs on | Main doc |
|---|---|---|---|
| Front desk (sign-in, platform database, roles, audit, files, the opencode door to each VM) | `frontdesk/` | the staging machine, launchd `cx.ola.frontdesk`, 127.0.0.1:4700 | README, "The front desk" |
| Web app | `web/` | built into `web/dist`, served by the front desk | `web/README.md` |
| Sealed workspaces (image, `ws.mjs`, door, desk, the `ola-*` tools inside) | `workspace/` | VMs on the staging machine, image `ola-workspace:2.3.2-64` (`workspace/ws.mjs` IMAGE) | README, "The workspace" |
| Model gateway (callers, caps, web search, specialists, fallbacks, batch lane) | `gateway/` | launchd `cx.ola.gateway`, 127.0.0.1:4180 and one socket per workspace | README, "The gateway" |
| The address and TLS | `ops/tls.mjs`, `ops/cert.mjs`, `ops/dns.mjs`, `ops/tunnel.mjs` | `cx.ola.tls`, `cx.ola.tunnel` on the staging machine; certificate renewal job on the iMac | README, "The address: app.ola.cx" |
| Skills (chart, workbook, report, designer, app-designer, sound, publish, batch-quotes) | `skills/` | read-only in the image at `/opt/ola/skills`; bundled in the Mac app | `skills/README.md` |
| Evaluations (checkable tasks, Claude baseline on the Max login, with and without skills; `evals/apps`: real "build me ..." requests scored per model) | `evals/` | the iMac and the staging machine | `evals/README.md` |
| The asks: real requests sent again as chat after every deploy, and the one list of everything Ola can be asked to do, by place (`evals/asks/abilities.json`; Ola's instructions about its abilities are written from it: the end of `workspace/AGENTS.md` and OlaKit `Abilities.swift`) | `evals/asks/` | the staging machine, after every deploy | README, "The asks" (OLA-231, OLA-232) |
| The asks: every request of a person that failed, kept as a case and sent again as chat after every update, in a cloud project and on the Mac (22 cases) | `evals/asks/` | the staging machine, started by each update that serves; results in `~/ola-staging/asks-latest.json` and on the board | README, "The asks" |
| Publishing | `frontdesk/sites.mjs`, `skills/publish/`, `web/src/components/PublishSheet.tsx` | the front desk; pages served at sites.ola.cx | README, "Publish" |
| Learning from use: conversations kept only with the person's switch (off by default), every switch to Claude labeled and counted, every "I can't", failed step and stopped request counted by kind (labels only), and "This was wrong" under an answer on the website keeps that request as a test case with the person's yes (OLA-235) | `frontdesk/` | the staging machine; the largest group on the board's Learning page | README, "Learning from every switch to Claude" |
| Compare with Claude, batch jobs, reading real documents | `frontdesk/compare.mjs`, `frontdesk/jobs.mjs`, `workspace/` | inside each project's VM | README, those sections |
| Mac and iPhone apps, OlaKit | `apple/` | Bart's Mac and phone; TestFlight; the download | `apple/README.md`, `apple/testflight/README.md` |
| Ola's opencode build (cosmetic fork, a patch set) | `opencode-fork/` | built here, carried in the Mac app | `opencode-fork/README.md` |
| Bart's opencode | `bart/` | launchd `cx.ola.bart`, Tailscale only | `bart/README.md` |
| Landing page | `site/` | Vercel, ola.cx | `site/README.md` |
| Operations (deploy, status, the alarm) | `ops/` | the staging machine | README, "Deploying staging", "When something breaks" |

**Where it runs.** Today everything runs on the **Mac mini, as staging**: made-up data only, models
rented on Together, staging in its own clone `~/ola-staging`. The **Mac Studio** (M5 Max, 128 GB)
arrives about December 1. It becomes the Ola machine, with the models served on it, disk encryption
on, and a separate account that owns the workspaces. The mini then stays the test machine and
never holds user data. The install list, and the check that says which of it is done:
`node ops/studio.mjs check` (README, "The Studio's install list").

## Deploy and operations

- **Deploy:** `node ~/ola-staging/current/apps/activist-ai/ops/ola.mjs deploy [commit]` on the
  staging machine. It unpacks the commit into its own release, runs its suites (the test turn,
  gateway, workspace, web, front desk, backup, checks, signers, TLS, restart), and switches
  `current` only if all pass. A failed suite touches nothing that runs. Only the jobs whose code
  changed restart, and the front desk finishes what is in flight first (OLA-94; measured 0 of 602
  requests failed, but a checker lost one request sent 0.2 s after the restart: the ticket is
  open). An update that serves then starts the asks in the background. An update is refused while
  three projects are in use (OLA-240, open). It checks commit signatures, or a signed approval tag `ola-deploy/<commit12>`
  made on Bart's Mac by `ops/signers.mjs approve` (`--unsigned` overrides, and the log says so).
  A rollback is a deploy of the older commit. README, "Deploying staging".
- **Automatic checks:** `cx.ola.ci` checks every change to main once (OLA-84, `ops/ci.mjs`): a
  deploy's result counts, a younger commit waits 20 minutes for its deploy, anything else gets
  `ola.mjs check` (the deploy's suites plus OlaKit's swift test, nothing served). The result is the
  GitHub commit status `ola/checks` and "Checks on main" on the board; a newly failing main opens a
  P1 issue for the runner. README, "Deploying staging".
- **One test turn:** everything that starts VMs to test (the workspace and front desk checks, the
  live scripts, the evals) waits for the machine's one turn, `ops/turn.mjs`; a deploy goes before
  every waiting builder and holds the turn through its suites. `node ops/turn.mjs status` shows it.
- **Status:** `node ops/ola.mjs status` shows every job, the deployed commit and each workspace.
- **The disk:** every deploy that serves ends with `ops/clean.mjs` (old workspace images, releases
  beyond the current and the previous, the image builder over 15 GB, builders' leftovers on a
  written allowlist); `node ops/ola.mjs clean [--dry]` runs it by hand. README, "Deploying staging".
- **Backups:** `ops/backup.mjs` (OLA-86): nightly at 3:30 every project, the platform database and
  the gateway's records, encrypted with age, onto the backup drive plugged in (the SanDisk; a second
  drive swapped weekly from Bart's home); 14 days plus 8 weekly copies kept; a restore test on
  Sundays that decrypts, checks every checksum and loads one project into a new workspace.
  README, "Encrypted backups".
- **The alarm:** `ops/watch.mjs` every 2 minutes (`cx.ola.watch`) texts Bart when the disk, memory,
  a service, the public address or the certificate fails, and pushes a status to the board every 10
  minutes. README, "When something breaks".
- **TLS:** a Let's Encrypt certificate by DNS-01, key made on the staging machine, renewed by
  `ops/cert.mjs` from the iMac (daily job `cx.ola.cert`). README, "The address: app.ola.cx".
- **Apps:** `apple/bump-build.sh`, then `apple/testflight/ship-via-mini.sh [ios|mac|both]`. The M1 iMac can ship both; the M4 only the iPhone app (the Mac download's Developer ID signature needs the M1's Xcode account): `apple/testflight/README.md`, "Shipping from the M4 iMac".
  Every release stages the committed skills and refuses a build whose skills differ.
- **Tracking:** every Ola commit names its issue, `[OLA-n]`; the tracker is
  `node scripts/venture/issues.mjs`, shown at app.kochitolabs.com. Since 2026-11-20 nobody closes
  their own ticket: its checks are written before the work (what Bart does and sees, per place), a
  builder ends with `issues.mjs ready`, a checker who did not build it does each check on the live
  thing (`apps/venture/CHECKER.md`), and `done` refuses until all have passed.
- **The Studio's install:** `ops/studio/setup.sh admin|ola [--check]`, script first; then
  `node ops/studio.mjs check`.
- **Bart's iMac (8 GB):** no iOS simulator there and no build when the disk is nearly full (guards
  in `.claude/hooks`); simulators run on the mini.

## Decided, not to be reopened

- **2026-11-15** The name is Ola, at ola.cx; the service is at app.ola.cx.
- **2026-11-15** Build on opencode 2 (2.3.0); a model gateway sits between every workspace and every model.
- **2026-11-16** One sealed VM per project, with no network; one database per project, inside its VM.
- **2026-11-16** Encryption ends only on our own machine (the tunnel passes TLS through).
- **2026-11-16** Web search is a required feature; the gateway makes every web request.
- **2026-11-16** Two fallbacks, Claude Code and a hosted open model, off by default, turned on by the project's owner; every use is marked and logged.
- **2026-11-16** Slash commands and reactions behave the same on web, Mac and iPhone.
- **2026-11-16** The iPhone app pairs with the Mac app, the way Claude Code's does.
- **2026-11-16** The app icon is "the tag". The web app's look is A, "paper under the lamp".
- **2026-11-16** The north star is Startup Grade by December 16.
- **2026-11-17** Ola is for activists and community groups.
- **2026-11-17** Sign-in is a name and a password; passkeys are optional, only in Your account or Settings.
- **2026-11-17** No site password on app.ola.cx.
- **2026-11-17** The Mac app works for anyone with a login, on request; it ships as a signed download that updates itself, on GitHub releases, not TestFlight.
- **2026-11-17** The iPhone app ships on TestFlight.
- **2026-11-17** Ola's skills ship inside the Mac app and `ola`, version-checked on every release.
- **2026-11-17** The opencode fork stays cosmetic: behavior changes go in config and OlaKit.
- **2026-11-17** Closing the gap to Claude through the harness and the skills is the top priority.
- **2026-11-18** Four products, two runtimes; settings follow the runtime, personal things follow the person.
- **2026-11-18** The runtime is chosen in New Session in the Mac and iPhone apps; Settings keeps only the setup.
- **2026-11-18** The ladder: local inference, then a hosted open model, then Claude. The card in the conversation is the main way to the cloud; the setting is the gate behind it.
- **2026-11-18** No Chinese model goes into Ola without Bart's explicit yes, every time. (To be decided before launch: whether the ladder needs a Chinese rung; the hosted fallback is GLM-5.3 today, from before the rule.)
- **2026-11-19** Publishing: Ola hosts a cloud project's published pages at sites.ola.cx/<project>; for hosting elsewhere Ola recommends Vercel with GitHub; no GitHub Pages.
- **2026-11-20** A request that fails for a person becomes a permanent test, written from the stored conversation of what they typed when there is one.
- **2026-11-20** After a failure: learn from it, make the system better so the next round works, then fix the one case.

## Live now, and next

**Live now:** ola.cx; app.ola.cx in public with a normal sign-in; the web app on staging with
made-up data; the Mac app download and the iPhone app on TestFlight; the `ola` command; web search;
both fallbacks; skills; batch jobs; Compare with Claude; the alarm; one cloud in the apps;
encrypted nightly backups, kept in a folder on the mini's own disk until a backup drive is set up (OLA-286; no offsite copy yet); automatic checks on every
change; publishing on the website in a cloud project (the apps and the Mac's local runtime: see
"Publishing" above).

**Next:** the Mac Studio as the Ola machine (about December 1), then Frances and Ian in December;
the backup drives on the Studio; deploys only from signed commits; the
open-model quality gap (app requests, design); a way for a checker to use the Mac and iPhone apps
(OLA-237); the "This was wrong" link in the Mac and iPhone apps (OLA-350); the phone's local runtime without
Tailscale. The
tracker holds the full list: `node scripts/venture/issues.mjs list --status open`.

## Keeping this page current

`node scripts/venture/overview-check.mjs` says `current`, or `stale: N Ola commits since <date>`
(exit 1). When it is stale: read those commits (`git log <hash>..origin/main -- apps/activist-ai`),
change what they changed here, set the line at the top to the newest commit on origin/main and its
date, and commit OVERVIEW.md on its own. The board at app.kochitolabs.com shows this page with a
red "stale" badge when it is behind.
