# Handoff — iMac M1 leaves Stanford, M4 iMac arrives (2026-09-10)

Written by the Claude session on the **iMac M1** in Bart's Stanford (CASBS) office,
minutes before that machine goes home and the **M4 iMac** takes its place at the
same desk. If you are the agent on the M4: this is what the M1 knew that isn't in
the code.

The Mac mini and the Macintosh Plus **stay in the Stanford office**. Everything
below is about reconnecting to them from the new machine.

---

## 1. Repo state — what was committed on the way out

**hilma** — clean and pushed. Last commits from the M1:

| commit | what |
|---|---|
| `ee9d2ba` | two long-floating fixes: Mini vMac `build.sh` `set +u` guard, Amber noon ticker layout |
| `9cf2b11` | Macinclaude Code: hero wordmark is MACINCLAUDE / CODE on two lines |
| `5d84375` | Macinclaude Code: solid robot as the boot-screen hero + a real CSI parser |
| `59f24d3` | `apps/macplus/tools/plus-screen-mock.mjs` — pixel-exact Plus screen mock |
| `5c24e8e` | Macinclaude Code: robot title card instead of the cluttered boot dump |

**Still untracked in hilma, deliberately left alone** (all from 2026-05-06 except
where noted; they have survived many sessions untracked, so don't sweep them in
without asking Bart):
`.claude/hooks/` + `.claude/settings.json` (the Discord-reply Stop hook — note this
is **not** committed, so the M4 will not enforce that rule until it is),
`apps/design-agent/art-output/` + `eval-output/` (~5 MB of generated output),
`public/art-judge/`, `src/app/amber/{dodge,late-pass,pasture}/` (dodge and late-pass
are pieces Bart rejected), `public/amber/tracks/*.m4a` (4 MB), `docs/amber-morning-email.md`,
`docs/moltbook-integration.md`, `scripts/{add-princess.ts,moltbook-sanitize.ts}`,
`scripts/loop/` (2026-09-03), `tunnel.log`.

### vibeceo — resolved: remote won

`../vibeceo` on the M1 was 7 ahead / 22 behind. Bart's call: **the remote version
of Jambot wins.** Local `main` was reset hard to `origin/main` and the full suite
(`node jambot/tests/run-tests.js`) passes there, including the 67 effects/routing
checks. Nothing to merge — on the M4 just `git pull` and work from origin/main.

The 7 discarded commits are kept on `origin/imac-m1-handoff-2026-09-10` (tip
`d33b506c0`) purely as an archive: an `INVENTORY.md` + `tests/inventory.js`, an
FFT/spectral analyzer pass, a `jbs-node.js` pattern-length fix, a JT90 step-timing
fix, an sms-bot Dockerfile `npm ci` fix, and three `hallman-*.js` scripts. Some of
that may have been fixed independently on the remote side. Cherry-pick from it only
if something turns out to be missing; don't merge it wholesale.

---

## 2. The Mac mini (stays in the office)

- **`admin@171.66.240.175`** on the CASBS network. NOT the `192.168.7.50` that
  `apps/macplus/*.md` still says — that's the pre-move address.
- SSH: the mini's `authorized_keys` holds two keys, `mave@imac-m1` (the departing
  machine) and **`bartdecrem@Barts-iMac-2.local`** — if that second one is the M4,
  SSH already works; test with `ssh admin@171.66.240.175 'hostname'` first thing.
  If not, copy the M4's `~/.ssh/id_*.pub` onto the mini's `authorized_keys`.
- **Deploy a backend/agent change:** push to `main`, then
  ```
  ssh admin@171.66.240.175 'export PATH=/opt/homebrew/bin:$PATH; bash ~/hilma-deploy/apps/macplus/backend/update.sh'
  ```
  **The `PATH` export is required.** A non-interactive ssh shell has no `node`, so
  without it `update.sh` dies at `== deps ==` — the `git pull` still lands, but no
  secret sync and no service kickstart, and you'll think it worked.
- **Check an agent is live from any LAN machine:** `nc -w 10 171.66.240.175 2324 </dev/null`
  prints the Macinclaude Code boot banner. Ports are in `apps/macplus/BACKEND.md`.
- The mini has the **full Retro68 toolchain** at `~/mac-plus-apps/Retro68-build/toolchain`,
  so it can build Plus apps itself.

## 3. The Macintosh Plus (stays in the office)

- **Shipping a new build is over The Bridge, not the SD card:**
  ```
  scp <App>.bin admin@171.66.240.175:~/bridge-outbox/
  ssh admin@171.66.240.175 'tail -f ~/macplus-logs/all.log'
  ```
  Watch for `Bridge: receiving app` → `Bridge: app installed` (~45 s). The Plus only
  receives **while The Bridge app is open on it** — the file just sits in the outbox
  otherwise, then moves to `sent/` once delivered.
- **⚠️ There is a delivery pending right now.** `Macinclaude.bin` (commit `9cf2b11`,
  the two-line MACINCLAUDE / CODE wordmark) is sitting in `~/bridge-outbox/` waiting
  for Bart to open The Bridge on the Plus. If the log shows `app installed` after
  ~21:19 on 2026-09-09, it landed; otherwise it's still queued.
- Networking: CASBS wifi blocks client-to-client, so the Plus is on the **mini's
  Internet-Sharing AP "861 clara"** (ch 11, 2.4 GHz), static `192.168.7.40`, reachable
  from the mini via `bridge100`. **You cannot ping the Plus from the iMac** — the M1
  couldn't either. Go through the mini. Test with the Quote app, never HelloWiFi.
  Full detail: `apps/macplus/CLAUDE.md` and the `macplus-casbs-network` memory.

## 4. Toolchains — what the M1 had that the M4 may not

- **Retro68** (`~/mac-plus-apps/Retro68-build/toolchain`) was built on the M1 on
  2026-08-28. If the M4 lacks it, either build it (`~/mac-plus-apps/Retro68/` source
  clone is **not** on the M1 — re-clone from GitHub; it's a long build) **or just
  build on the mini**, which already has it. Each app's `build.sh` honors
  `RETRO68_TOOLCHAIN`.
- **Mini vMac**: the patched arm64 raw-serial build was at `~/mac-plus-apps/mctest/minivmac.app`
  on the M1. Note it can only test the **serial** apps — Macinclaude Code now uses
  MacTCP/DaynaPORT, so it can't be driven end-to-end in the emulator any more. For
  Macinclaude UI work, use `apps/macplus/tools/plus-screen-mock.mjs` (pixel-exact
  512×342 / Monaco-9 mock, run from the hilma root) and then ship to the real Plus.
- **`~/mac-plus-apps/sdcard-archive/`** (the verified SD-card restore archive) was
  already missing on the M1 — still worth recovering from the card or the old machine.
- **Xcode / iOS**: Bart's iPhone ("Bart iPhone Air", UDID `00008150-000038820EFB801C`)
  was paired to the **M1**, and the M1 had the Apple ID signed into Xcode-beta. The
  M4 will need its own pairing + signing before any Dodo/Loci/Peri device build.
  See `~/.claude/CLAUDE.md` on the M1 for the exact verified flow.
- **Vercel CLI** was logged in on the M1 as `bartdecrem-8925`. If `vercel whoami`
  fails on the M4, run `vercel login` **yourself in the terminal** (`! vercel login`)
  — an agent-run login hangs on the prompt and mails Bart a code.

## 5. Scheduled work — nothing is running right now

- **`CronList` on the M1 was empty.** The Amber 4:07 PM PT daily escalation post is a
  *session* cron — it only exists inside a live Claude Code REPL and dies with it.
  **Nothing will post until some machine's session re-creates it.** Run
  `/amber-schedule`, then confirm with `CronList`. See the "Amber Daily Creations"
  section of the root `CLAUDE.md`; it also auto-expires after 7 days.
- The M1 also hosts LaunchAgents that **travel home with it** and are not the M4's
  problem: `sh.tunn3l.tunnel{,.kochi,.ssh}` (tunn3l tunnels, one currently serving
  `https://fathom.tunn3l.sh`), `com.tokentank.{auto-tweet,goodmorning,morning-tweet}`,
  `ai.openclaw.gateway`, `ai.kochi.caffeinate`. If any of those are supposed to be
  office-side, they need re-installing on the M4.
- GolemBot: **Strays** runs on the Mac mini (`com.golembot.strays`) and is unaffected
  by the machine swap. **Bang** runs on the home iMac.

## 6. Where the docs are

- `apps/macplus/CLAUDE.md` — the canonical Plus guide (app catalog, hardware, network).
- `apps/macplus/BACKEND.md` — the mini's launchd services, ports, deploy verbs.
- `apps/macplus/STANFORD.md` — the move to this office and what must stay reachable.
- Root `CLAUDE.md` — the repo rules, Amber, Jam, deploying.
- The public mirror is generated: `bash apps/macplus/publish/publish.sh` regenerates
  `../macinclaude` and pushes to github.com/bdecrem/Macinclaude. On a fresh machine
  **`git clone` that repo into `../macinclaude` first** — otherwise `publish.sh`
  git-inits an orphan tree and the push is rejected with "fetch first".

---

*Anything in `~/.claude/CLAUDE.md` on the M1 is device-specific to that machine and
does not describe the M4 — treat it as a checklist of things to re-verify, not as fact.*
