# Ola for Bart: the Mac and iPhone apps

The Mac and iPhone apps of Ola. Two runtimes: **Cloud** is the signed-in person's project on
app.ola.cx, the same sessions the website shows (since OLA-150; before, a separate opencode of Bart's,
`../bart/`); **Local** is opencode in a folder on the Mac, which the paired phone follows.

```
apple/
  project.yml        XcodeGen: the source of truth (Ola.xcodeproj is generated, not committed)
  OlaKit/            Swift package shared by both apps
    Client.swift       opencode 2.3.0 V2 API: sessions, prompt, interrupt, permissions, models, files, the event stream
    Conversation.swift the event stream folded into turns, steps and approvals (port of web/src/lib/conversation.ts)
    Steps.swift        the plain words for each step and approval (port of web/src/lib/steps.ts)
    Store.swift        the live state both apps show (@Observable)
    Keychain.swift     every secret (SecretStore: read once per launch, never a dialog) and the machine's address
    Fixture.swift      made-up sessions for screenshots
    olakit-selftest    a command-line check against the real server
  Shared/            SwiftUI used by both apps: theme, Markdown, the conversation, approvals, connect, pages
  Mac/               the Mac app (cx.ola.mac)
  iOS/               the iPhone app (cx.ola.mac)
  tools/             build.sh, the icon and the fonts
```

**Keep the words in step with the web app.** `Steps.swift` and `Conversation.swift` are ports of
`web/src/lib/steps.ts` and `conversation.ts`; change both together. `swift test` in `OlaKit` folds the
web app's recorded runs (`web/test/fixtures/*.jsonl`) and checks the result.

## Two runtimes: New Session picks one, settings follow it (2026-11-18, OLA-142, OLA-143)

Bart's words: "four products across two different runtimes", "settings ... should always try to
follow the runtime, not the product". The products are the web app, `ola`, the Mac app and the
iPhone app; the runtimes are **cloud** (the Ola machine) and **local** (this Mac; for the phone,
through its Mac). `OlaKit/Runtime.swift` has the words every screen uses.

- **New Session** (the Mac's sidebar button and Cmd-N, the phone's pencil) opens a chooser: Cloud or
  Local, one line each, the last choice ticked. A runtime that is not set up says so and offers the
  setup. `Mac/NewSession.swift`, `iOS/PhoneWhereViews.swift` (`PhoneNewSessionSheet`).
- **Both runtimes are live at once.** Each app holds two stores: the runtime on screen and the other
  one (`WhereOlaWorks.store/peer`, `PhoneWhereState.peer`). The session list has a section per
  runtime; opening a session of the other runtime brings it on screen (a swap, no restart).
- **Settings keeps only the setup**: the folder on the Mac; the sign-in and the pairing on the
  phone. No "Where Ola works" choice there any more.
- **Cloud in Settings is one status line** (OLA-210, Bart: "it should just show status and
  'connect again' if the status is Not Connected"): "Connected as Bart" or "Not connected", and
  Connect Again… only when not connected (Sign In… when signed out). No address field and no Forget
  This Machine (since OLA-150 the cloud is the account's: "One cloud" below); the phone's Cloud
  section is the same line, with its own Sign Out. Screens: `OLA_ONLY=settings-cloud tools/build.sh mac <dir>`.
- **Lots of permissions is one switch per runtime.** Cloud: each app's own, sent as the
  conversation's autonomy as the website does (OLA-150). Local: this Mac's (`ola.permissions`), used by
  the app, `ola` and the phone through this Mac. Every product shows the switch of each runtime.
- **"Yes, for the rest of this session"** is kept per session and by kind by whoever answers for the
  runtime (`SessionYes`, `OlaStore.answerForSession`, the approver), never sent to opencode as its
  own lasting "always". A web step (a search, a download, a lookup, however wrapped) is one kind,
  so one yes covers the session's later web steps.
- **Checks:** `swift test` (`SessionYesTests`), `node ../bart/permissions-check.mjs` (the machine),
  `tools/permissions-selftest.sh` (the Mac, real requests; `OLA_MODEL_URL` reaches the model
  through an ssh tunnel on a Mac without Tailscale), `Ola -OlaSnapshot <dir> -OlaOnly runtimes`
  (the chooser and the two-section list), and on the phone `-OlaFixture main -OlaBoth` with
  `-OlaNewSession` or `-OlaTab settings`.

## Build

```bash
apps/activist-ai/apple/tools/build.sh mac [shots-dir]   # Mac app, signed with a stable identity; with a dir, renders its views to PNGs off screen
apps/activist-ai/apple/tools/build.sh install-mac       # copies it to /Applications/Ola.app (does not open it)
apps/activist-ai/apple/tools/build.sh sim               # iPhone app for the simulator
apps/activist-ai/apple/tools/build.sh device            # iPhone app for a device (automatic signing)
cd apps/activist-ai/apple/OlaKit && swift test          # the fold, on the web app's recordings
OLA_PASSWORD_FILE=<file> swift run olakit-selftest      # against the real server (see below)
```

Simulator runs (`tools/sim-shots.sh`, `phone-app-shots.sh`, `sim-dark-shots.sh`, `xcodebuild test` on a
Simulator) happen on the Mac mini, never on Bart's 8 GB iMac: `.claude/hooks/sim-guard.py` refuses them
on any Mac with 8 GB or less (OLA-215). Run them as `ssh admin@100.95.51.98 'cd ~/ola-ship/apple && tools/build.sh sim && tools/sim-shots.sh /tmp/ola-shots'`
(rsync the branch's `apple/` there first, as `ship-via-mini.sh` does) and scp the PNGs back; `build.sh sim` alone is fine here.

Every builder shares one Xcode build folder, `~/Library/Developer/Xcode/DerivedData/ola-shared` (the default in `build.sh`, the shot scripts and `ship-via-mini.sh`; leave `OLA_DERIVED` unset): on the iMac `.claude/hooks/disk-guard.py` refuses a `-derivedDataPath` in a scratchpad or worktree, refuses builds and big copies under 5 GB free, and everything but cleanup under 1 GB (OLA-226).

## Using the apps as a checker (OLA-237, 2026-11-20)

`tools/drive.sh` uses the Mac app or the iPhone app the way a person does, on the Mac mini, with no
window on anyone's screen: it signs in as a made-up person, opens a project, types a sentence, answers
the yes card, waits for the answer and reads it from the screen. A picture of every step and
`transcript.json` (each sentence, each card and what was answered, the answer as read from the screen,
the answer as the app holds it, timings, the build and the bundle it drove) land in `--out`.

```bash
ssh admin@171.66.240.175
export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH
cd <a copy of this branch's apps/activist-ai/apple on the mini>      # e.g. rsync apple/ to ~/ola-drive/src/apple
tools/drive.sh mac|phone --where cloud|local --say "<sentence>" [--say "<next sentence>"] \
    [--card yes|any|no] [--wait <seconds>] [--app <Ola.app>] --out <dir>
```

- **Exit 0 only when every sentence got a finished answer on the screen** (and a card came, with
  `--card yes`). Anything else is exit 1 with one line, `DRIVE FAIL  <why>`, and the picture of where
  it stopped (`NN-stopped-here.png`): the app not opening, a sign-in refused, the app signing itself
  out, the sentence not taken, an error on the screen, a turn that failed or stopped, no card when one
  was required, a card when `--card no`, the answer not on the screen, a wait longer than `--wait`.
- `--card yes`: a card must come and is answered "Yes, this once"; `any` (default): any card is
  answered yes; `no`: a card fails the run. `--wait`: seconds per answer (default 600).
- Ola's questions (its `question` tool; OLA-301) show as their own card with the choices as buttons,
  Command-1 to Command-9 on the Mac. The Mac drive answers one with its first choice (Command-1), or
  types "Yes, go ahead." in the box when it has no choices; `transcript.json` lists them under
  `questions`. They are not yes cards: `--card` does not count them.
- **The made-up person** is `appdriver` with its one project `appdriver` on the live test server
  (`tools/drive-account.mjs`, made with the live release's `frontdesk/admin.mjs` the first time).
  Each run gives it a fresh password nobody sees, in a file with mode 600 that the app reads (never
  on a command line, never printed), empties the project's folder, and at the end takes its pages
  down, signs it out everywhere and stops the project's computer. Not `askcases`: an asks run resets
  that one's password and signs it out at its end.
- **The machine's turn**: a cloud run uses the project's computer, so it waits for and holds the test
  turn (`ops/turn.mjs` of the live release; deploys go first). One drive at a time (`~/ola-drive/lock`).

**The five checks of OLA-237, as commands** (from the copy of `apple/` on the mini; pictures under
`~/ola-drive/checks/`):

```bash
# 1. cloud-mac: the sentence in a cloud project, the yes card answered, twice (two conversations)
tools/drive.sh mac --where cloud --card yes --say "make a page that says Hello and publish it on ola" --out ~/ola-drive/checks/1a
tools/drive.sh mac --where cloud --card yes --say "make a page that says Hello and publish it on ola" --out ~/ola-drive/checks/1b
# 2. cloud-phone: the same in the iPhone app in the simulator
tools/drive.sh phone --where cloud --card yes --say "make a page that says Hello and publish it on ola" --out ~/ola-drive/checks/2
# 3. local-mac: Ola working on the Mac, in a scratch folder; --file fails the run unless the page is in it
#    (the folder is copied to <out>/folder, its files listed in transcript.json "filesInFolder")
tools/drive.sh mac --where local --say "make a page that says Hello" --file index.html --out ~/ola-drive/checks/3
# 4. local-phone: not built yet (see below)
# 5. a failure must fail: an answer that takes a minute, with 5 seconds to wait
tools/drive.sh mac --where cloud --wait 5 --say "make a page that says Hello and publish it on ola" --out ~/ola-drive/checks/5; echo "exit $?"
```

**The Mac app** (`mac`): by default the published download (`https://ola.cx/ola-site/mac/latest.json`),
installed once per build in `~/ola-drive/apps/Ola-<version>-<build>/` (never `/Applications`); `--app`
drives another build. It runs as a second copy through LaunchServices in the background (`open -n -g`),
with its own settings domain (`cx.ola.mac.drive`, emptied at each start and deleted after), its own home
for Application Support (`CFFIXED_USER_HOME`) and its secrets in memory only, so it never reads or
changes the settings or Keychain of an Ola someone uses on the mini.

- **Why the app drives itself.** macOS lets a program click and type in another app only with
  Automation Mode (XCUITest) or the Accessibility permission, and on the mini both need an
  administrator's password at the screen. Measured 2026-11-20: a macOS UI test there stops with
  "Timed out while enabling automation mode", and a process started over ssh is not trusted for
  Accessibility. So the Mac app has a launch option, `-OlaDrive <script.json>` (`Mac/MacDrive.swift`),
  that uses its own real window: key events into the window for typing (one per character, Return
  as a Return key), a mouse click at a text field's center that the window's hit-testing delivers
  (a covered field fails the run), buttons by their keyboard shortcuts as the app hands a key on
  (Return for Sign In, Start and the card's "Yes, this once"; Command-N for New Session; a disabled
  button takes nothing and the run stops), and the answer read from the window's picture with text
  recognition (Vision), compared word by word with the end of the answer.
- **What the Mac drive does not exercise**: the window server's input path (real hardware, focus
  between apps, another app's window on top), and mouse clicks on buttons: SwiftUI gives a program
  in the same process no place for a button (its accessibility tree stays empty until an assistive
  app asks, which needs the permission above), so buttons are pressed by their shortcuts. The window
  is opaque and far off every display (a transparent one counts as hidden, and SwiftUI then stops
  drawing the conversation), never under the mini's mouse.
- **Builds 0.1 (25) and older have no drive mode.** `drive.sh mac` asks a build first
  (`Ola --drive-probe`) and refuses one without it, so a check on "the Mac app as shipped" needs a
  download shipped after this change; until then `--app` points at a build of this branch.

**The iPhone app** (`phone`, `tools/drive-phone.sh`): built from the live release's commit
(`~/ola-staging/deployed.json`, from `~/ola-staging/current`) once per release into
`~/ola-drive/phone/<commit>/`, installed fresh with an empty Keychain into a simulator of its own
("Ola drive", booted headless, shut down after), and driven by XCUITest (`drive/`, a project of its own
that knows the app only by its bundle id): real taps and the simulator's keyboard. A button that is
not on the screen, covered or disabled cannot be tapped, and the run fails there. Pictures are at the
phone's size. The mini has no Homebrew xcodegen; the driver uses a private copy in
`~/ola-drive/xcodegen/` (copy `/opt/homebrew/Cellar/xcodegen/<version>/` there from any Mac that has it).

The simulator build is signed ad hoc (`CODE_SIGN_IDENTITY=-`): an unsigned one has no Keychain, and the
app then says "This phone couldn't keep the sign-in".

**The phone through the Mac app** (check 4, built Nov 21): `tools/drive.sh phone --where local --say
'make a page that says Hello' --file index.html [--app <Mac build>] --out <dir>`. The Mac copy (the
download, or `--app`) signs in, turns on Let my phone connect on port 4338 and makes a code as Pair a
Phone does (written to a file, mode 600); the phone, fresh in its simulator, taps Pair with your Mac,
types the code, taps Pair, answers the app's notification question with Not now, starts a Local
session and types the sentence; afterwards the Mac copy opens the newest sessions and the run passes
only when the phone's sentence and a finished answer are in the Mac's window too (pictures of the Mac in
`<dir>/mac`). The Mac copy listens on 127.0.0.1 for this, not on the Tailscale address: a Network
framework listener bound to the Tailscale address accepts a connection from the same Mac but never
completes it (measured on the mini with a bare `NWListener`; the same symptom as "a Mac cannot reach its
own Tailscale address" below, which is the listener, not Tailscale: a node listener on that address
answers). So the Tailscale leg is the one part of a real phone's path this does not use
(`PhoneLink.driveHost`, set only by the drive).

Two things the first runs found (Nov 21): the Mac copy hung for minutes writing its pictures under
`~/Library/Logs` and LaunchServices refused a log file there (-10810), so both apps now write into the
run's folder and drive.sh copies to `<dir>`; and the phone driver passed a run whose screen showed "The
model could not take this request" (the model account was out of credit, a 402): it now fails on the
error line (`ola-problem` in builds after Nov 21, and the error sentences of `Steps.runProblem` before).

**Measured 2026-11-20 on the mini** (pictures under `~/ola-b237/runs/`): Mac cloud, the publish card
answered, 3 of 3 passed (`cloud-mac-1..3`); iPhone cloud 2 of 2 after the signing fix (`cloud-phone-2,3`);
Mac local with `--file index.html` passed (`local-mac-5`); `--wait 5` failed with exit 1 and the
picture of where it stopped, on both apps (`cloud-mac-fail`, `cloud-phone-fail`). Fresh sign-ins of the Mac app sometimes sign themselves out or crash
(OLA-252); the tool reports that as a failure.

## Shipping: TestFlight for the phone, a signed download for the Mac (2026-11-17)

`testflight/README.md`: `bump-build.sh`, then `testflight/asc-setup.mjs` once and
`testflight/ship-via-mini.sh [ios|mac|both]` (archived on the mini's release Xcode). The iPhone app
goes to TestFlight's internal group; the Mac app cannot (TestFlight on the Mac needs the App Sandbox,
and in it the agent cannot run git, Python, Node, scripts or Claude Code: measured, the table is in
that README), so it ships as a Developer ID signed, notarized disk image on ola.cx with an update
check (Settings, General, Check for Updates…). Both wait on Bart accepting Apple's updated Program License Agreement.

## Every release

The standard steps for any build that leaves this Mac (a download, TestFlight, or /Applications).
The scripts enforce the skills part; a build that breaks it does not come out.

1. **Commit first.** Ola's skills go into the Mac app from `apps/activist-ai/skills` as committed:
   `tools/skills.mjs stage` (run by `tools/build.sh` and `testflight/ship-via-mini.sh`) copies them
   fresh into `build/OlaSkills` with `VERSION.json` (the commit and the content hash, the same hash
   the workspace image is labeled with) and **refuses** when the skills folder has uncommitted
   changes.
2. **Build or ship.** `tools/build.sh mac` (and `install-mac`) and `ship-via-mini.sh mac` check the
   built or archived app with `tools/skills.mjs verify`: its `Resources/OlaSkills` must hash to the
   skills at HEAD, or the build is refused ("Not shipping that build").
3. **Bump and ship** as in `testflight/README.md` (`bump-build.sh`, commit, `ship-via-mini.sh`).
4. **The Ola machine.** `node ops/ola.mjs deploy` records the skills version it installs
   (`deployed.json` `skills`, and `release.json` beside the release, which the front desk gives a
   signed-in Mac at `GET /api/device/version`); it refuses when the workspace image's `ola.skills`
   label is not the release's skills. A skills change needs a new image tag
   (`workspace/ws.mjs IMAGE`). Mac and machine compare in Settings, Ola's skills, and `ola status`.
5. **Check:** `cd OlaKit && swift test`, `tools/skills.mjs verify <Ola.app>/Contents/Resources/OlaSkills`,
   and one skill end to end: `tools/skill-check.py <Ola.app> <scratch>` (after `ola skills setup`
   in that scratch support folder; see "Ola's skills on the Mac").

## Ola's skills on the Mac (2026-11-17)

"On this Mac" and the `ola` command use Ola's own skills, the same folder the Ola machine's sealed
box gets (`apps/activist-ai/skills`, `/opt/ola/skills` there), bundled in the app (`OlaSkills/`,
see "Every release"). Personal Claude skills stay blocked (`OPENCODE_DISABLE_CLAUDE_CODE`, and in
the config every skill ID is denied but Ola's; a project's own `.opencode/skills` or `.claude/skills`
with the same name is not used: `tools/skill-check.py` plants both).

- **At each start** (`LocalServer.prepare`, so the app and the command alike): the bundle is copied
  fresh and read-only to `~/Library/Ola/skills` (`installSkills`, with `/opt/ola/skills` made that
  folder, and `VERSION.json` beside the skills); the config names that folder (`skills`) and allows
  only the skills that can run here.
- **What each skill needs** is in its SKILL.md (`ola/needs`: `python:<module>`, `cmd:<program>`;
  `ola/mac`: yes, or no and why; `skills/check.py` requires both). Before a start they are checked
  with the agent's own PATH; a skill that lacks something is not offered, and the agent is told in
  its instructions what is missing and how to get it, and to say so instead of improvising.
  What works here: **chart, workbook, report** (with their Python libraries; report also needs
  poppler, `brew install poppler`); **designer** and **app-designer** (their `ola-page` is the app's
  own web view, so in the `ola` command only while the Ola app is open, and they say so);
  **batch-quotes** is a placeholder.
- **The Python libraries** go into Ola's own folder, never the system's: `ola skills setup`, or
  Settings, Ola's skills, Get Python Libraries, makes `Application Support/Ola/python` (a virtual
  environment from this Mac's python3) and installs matplotlib, pillow, openpyxl, python-docx and
  reportlab (about 150 MB); it is first on the agent's PATH from then on. Asked for, never automatic.
- **The version** (the content hash and the commit) shows in Settings, Ola's skills, and in
  `ola status` / `ola skills`, with one sentence comparing it with the Ola machine's (from the
  front desk, for a signed-in Mac): the same, different (one of the two is newer), or not known.
- `ola` without an account, on the owner's own setup (a gateway token pasted in Settings, Where Ola
  works), uses that token through the machine's forwarder, as the app does.

## The planted-text note on the Mac (OLA-228, 2026-11-20)

The local runtime loads the same `ola-planted` plugin as the sealed image (OLA-88: when text a
tool returned, or a text file in the folder, speaks to an AI and tells it to do something, one note
is added to that tool result). One file for both: the app carries `../workspace/plugins` itself as a
folder reference (`project.yml`, `Resources/plugins`), and `tools/build.sh` and
`ship-via-mini.sh` refuse a build whose copy is not `workspace/plugins` at HEAD
(`tools/plugins-verify.sh`). At each start `LocalServer.prepare` installs it read-only to
`~/Library/Ola/plugins/ola-planted` (`installPlugins`), names it in the config (`plugins`), and
gives it the folder (`OLA_PLANTED_WORK`, the image's `/work`) and Ola's own folders to leave alone
(`OLA_PLANTED_OURS`: the skills, plugins, config and web commands). Proof:
`swift test --filter LocalPlantedTests`: the real opencode 2.3.0 in a scratch HOME, against a fake
model (`tools/planted-model.py`) that reads a planted CSV; the read result it gets back carries the
note, and without the plugin it does not.

## Why macOS used to ask again after every build (fixed 2026-11-17)

Bart: the "Ola wants to use your confidential information stored in "cx.ola.opencode"" dialog came
twice after every new build, then a folder permission question. **Cause:** `build.sh mac` signed ad
hoc, so the app's designated requirement was its cdhash, which changes with every build. The login
keychain's "Always Allow" and macOS's folder permissions (TCC) both remember the app by that
requirement, so each build was a stranger. The question came twice for one read: once to let the
new build read the item, and once more to add it to the item's list of allowed apps (Always Allow).
The app also read that item at every launch, even in "On this Mac", which does not use it.

**The fix.** `build.sh mac` signs with `OLA_SIGN_IDENTITY`, else the first "Apple Development"
identity on the Mac (here `Apple Development: Bart Decrem (D94XEN3QQU)`), with no provisioning
profile and no new entitlements, prints the designated requirement (`identifier "cx.ola.mac" and
anchor apple generic and certificate leaf[subject.CN] = …`), and fails if a signed build's
requirement still names a cdhash. Measured with throwaway items: a rebuilt binary with the same
identity reads an item silently; a rebuilt ad-hoc binary is refused; deleting another build's item
is refused (it would ask), changing its value is not. So `OlaKit/Keychain.swift` (`SecretStore`):
every secret is read at most once per launch, only when the current mode needs it (no machine
password in "On this Mac", no push key until a notification is sent, Settings never reads one to
draw), always with `kSecUseAuthenticationUIFail` (a read macOS would ask about counts as no item);
items have the account `ola`, so items older ad-hoc builds made are never touched; writes change the
value in place.

**Putting a secret in without a dialog** (right after installing the first signed build, so the items
belong to the new signature): the app's own executable, the value on standard input, one line out,
never the value, no window:

```bash
ssh admin@100.95.51.98 'bash ~/.ola-bart/src/apps/activist-ai/bart/ola-bart.sh password' | /Applications/Ola.app/Contents/MacOS/Ola --import-secret machine-password
ssh admin@100.95.51.98 'bash ~/.ola-bart/src/apps/activist-ai/bart/ola-bart.sh model-token' | /Applications/Ola.app/Contents/MacOS/Ola --import-secret model-token
/Applications/Ola.app/Contents/MacOS/Ola --import-secret push-key --key-id <ID> < AuthKey_<ID>.p8
/Applications/Ola.app/Contents/MacOS/Ola --secret-status      # saved / not saved, per kind, never a dialog
/Applications/Ola.app/Contents/MacOS/Ola --forget-secret <kind>
```

Kinds: `machine-password`, `model-token`, `account` (the sign-in, JSON), `push-key`. The old items
(`cx.ola.opencode` and so on with other account names) stay in the login keychain unused; Keychain
Access can delete them. An unknown `--option` makes the executable exit with a line, never open the
window.

**Folder permission:** with a stable signature macOS keeps the answer across builds. The one change
of signature (ad hoc to signed) makes it ask once more for a protected folder (Documents, Desktop,
iCloud Drive); that cannot be avoided. The app asks only in "On this Mac", right after a folder is
picked (and at launch for that folder, silently once answered). **A Mac with no signing identity**
gets an ad-hoc build and a printed warning: macOS will ask after every build until one exists (Xcode,
Settings, Accounts, add the Apple ID, Manage Certificates, +, Apple Development).

## One cloud (OLA-150, 2026-11-19)

Bart: "my cloud sessions are not showing ... Clean all that up so there's one user bart and he's an
admin, and he has local sessions on a Mac that the connected phones also see, and cloud sessions that
I can see from the website or the apps." The apps' Cloud was Bart's own opencode on the mini
(`../bart/`: an address and a password on the Mac, a Tailscale-only phone door on the phone), never the
website's projects. Now:

- **Signing in is all it takes.** The Cloud is the person's project on app.ola.cx through the front
  desk's device routes (`OlaKit/Cloud.swift`, `OlaCloud`; the server's half: `../README.md`, "One
  cloud"), with the account's own device key: no address, no second password, no Tailscale. A
  `ServerConfig` with `account: true` is `https://app.ola.cx/api/device/w/<project>/oc`.
- **Which project:** the remembered one (`ola.cloud.project`), else the first; asked again at each
  launch and sign-in (`WhereOlaWorks.refreshCloud`, `PhoneWhereState.refreshCloud`). Settings shows a
  Project picker only when the account has more than one. No project: "Your account has no project on
  Ola yet."
- **Lots of permissions in the cloud** is each app's own switch, sent as the conversation's autonomy
  (`go` or `ask`) when it is made and again before a request when the switch changed, as the website
  does (`OlaStore.cloudLots`, `CloudAutonomy`). "Yes, for the rest of this session" goes to the front
  desk as `always`, which keeps it for the conversation.
- **The same as the website:** the model is the project's (no picker), files are the project's own list
  and downloads, and a cloud session cannot be deleted from the apps (the website keeps them all).
- **Gone from the apps:** the connect sheet (address and password), "Use my own Ola machine instead",
  the phone door and every "Turn on Tailscale" line for the cloud. A signed-in Mac forgets the old
  machine address and password at launch. Local, and the phone through its Mac (Tailscale), are as before.
- **Bart's sessions moved** (2026-11-19, on the mini): his two sessions in his own opencode ("hi", "Hey")
  were exported (`opencode session export`) and imported into his project `hello`, so they are in his
  one list beside his website sessions; the files of `~/ola-bart` are in the project's `earlier-cloud/`.
  Backups beside the originals: `~/.ola-bart/data/opencode/opencode.db.before-ola150`,
  `/work/.ola/data/opencode/opencode.db.before-ola150` inside `hello`, and
  `~/.ola-frontdesk/platform.db.before-ola150`.

**The check, all three paths** (a made-up account only): on the mini, from a copy of the branch,
`ssh -t -L 4796:127.0.0.1:4796 admin@100.95.51.98 'cd <copy>/apps/activist-ai && node frontdesk/test/cloud-stage.mjs'`
(its own gateway with the scripted model, a made-up admin and project; Ctrl-C ends it and destroys the
project), then here, with the password file it names copied over:
`OLA_CLOUD_CHECK=1 OLA_ACCOUNT_BASE=http://localhost:4796 OLA_HANDLE=cloudadmin OLA_ACCOUNT_PASSWORD_FILE=<file> swift run olakit-selftest`.
It lists the cloud sessions through the website's path (cookie, `/oc/api/session`), the Mac's
(`OlaCloud.resolve`, the store) and the phone's (`PhoneWhere.signIn`, `config(.machine)`, the store),
shows the three are the same before and after one session is made from each, that each app's switch
reached its conversation, and that a signed-out key lists nothing. 2026-11-19: 11 of 11, twice.

## Sign in with a name and password (2026-11-17, the Mac app for anyone with a login)

The first screen on a Mac with nothing set up is **Sign in to Ola**: the account's name and password,
straight in the app (`AccountAPI.login`, `POST /api/device/login`), which gives this Mac its own key
(the server's side: `../README.md`, "The Mac app for anyone with a login"). Words for every refusal:
wrong name or password (one sentence for both), the server's own wait after too many tries, "Ola isn't
answering just now", each one plain line under the fields. An account that asks for its passkey too
gets the system's passkey sheet in this window (below, "Passkeys in the app"); nothing ever opens a
browser (2026-11-17: "normal means you'd never leave the app"). Under the form: "Sign in with a
passkey" (only in a build that can use passkeys). Since OLA-150 there is no "Use my own Ola machine
instead": the sign-in reaches both runtimes (Cloud is the account's project, "One cloud" above); only a
Mac working On this Mac with the owner's pasted model token skips this screen. After signing in, "On
this Mac" works through the model door with the Mac's key. Settings, Account, Sign In… opens the same screen
(Cancel goes back). The Mac keeps a known-device token from the server in plain settings
(`ola.account.known`): it signs nobody in, it only spares this Mac the wait a stranger's guesses put on
the name. Screens: `OLA_ONLY=signin tools/build.sh mac <dir>` (signin-1 to 1d are new).

**End to end against a front desk** (from this iMac, a made-up account; the password in a file, never
printed): `OLA_ACCOUNT_CHECK=1 OLA_ACCOUNT_BASE=<front desk> OLA_HANDLE=<handle>
OLA_ACCOUNT_PASSWORD_FILE=<file> OLA_LOCAL_FOLDER=<scratch> swift run olakit-selftest`: a wrong
password refused, a right one gives a key, opencode on this Mac answers one tiny request through the
door with Ola's model, the share sentence, then Sign Out and the door's next request is 401 and the
key works nowhere. Run 2026-11-17 against a front desk and gateway of this branch on the mini
(GLM-5.3-Flash on Together): 7 of 7.

## Passkeys in the app (2026-11-17)

Bart: "i was expecting a normal login experience with the option at the end to add a passkey ...
normal means you'd never leave the app." The browser way (`SignIn.swift`, the loopback listener) is
gone from the app and the `ola` command; the server keeps `/api/device/grant` and `/token` for older
builds.

- **Signing in** (`OlaKit/NativePasskey.swift`, `AccountAPI.login`, `loginPasskey`, `passkeyCeremony`):
  for an account with "Ask for my passkey too", a right password gives a ceremony for that person's
  passkeys; the app shows the system's passkey sheet (ASAuthorizationPlatformPublicKeyCredentialProvider
  for app.ola.cx) and sends the answer to `POST /api/device/login/passkey`. The sign-in screen is a
  name, a password and Sign In (Bart, 2026-11-17: "passkey can be optional"); a quiet "Use a passkey
  instead" link does the same for any of the person's passkeys, with no name or password, and shows
  only on a Mac that has used a passkey for Ola before (`ola.account.passkeyUsed`, set when a passkey
  signs in or is added here).
- **A passkey is an option in Settings (Account)**, never a step after signing in: "Add a Passkey",
  "Optional. Sign in on this Mac with Touch ID instead of your password." The passkey is made by the
  sheet and saved with this Mac's key (`/api/device/passkey/options`, `/verify`, only in the first 15
  minutes after this Mac signed in; later it says so in plain words).
- **What Apple must allow first.** An app may use a site's passkeys only when it is signed with the
  associated domain `webcredentials:app.ola.cx` (`Mac/Ola.entitlements`) and the site serves
  `/.well-known/apple-app-site-association` naming it (the front desk does, `274T5WCVD2.cx.ola.mac`).
  That permission needs a provisioning profile with Associated Domains, which Xcode cannot make until
  Bart accepts Apple's latest Program License Agreement. Until then builds go without it:
  `NativePasskey.available` is false (read from the app's own signature), "Use a passkey instead" and
  Settings' "Add a Passkey" are hidden, and an account that asks for its passkey says "this version
  of Ola can't use passkeys yet ... turn off Ask for my passkey too in your account on the web".
  Never a browser.
- **After the agreement**, in order: (1) `OLA_PASSKEY=1 tools/build.sh mac` (automatic signing with
  `-allowProvisioningUpdates`; Xcode adds Associated Domains to the App ID and makes the profile);
  (2) the front desk and TLS front deployed with this change, then from any Mac
  `curl -s https://app.ola.cx/.well-known/apple-app-site-association` prints the JSON;
  (3) `swcutil dl -d app.ola.cx` (or `sudo swcutil show` after a launch) shows the app approved for
  webcredentials; Apple's CDN may take up to a day to fetch the file; (4) one live sign-in on the
  built app: Settings, Add a Passkey after a password sign-in, sign out, "Use a passkey instead" with
  Touch ID.
  Ship that build as the download (`~/Desktop/Ola/mac-download/Ola.zip`).

Each person signs in with their own Ola account and reaches the model through `https://app.ola.cx`
(one constant, `AccountAPI.address`; `OLA_ACCOUNT_BASE` or the `ola.accountBase` default points checks
at a stand-in, never shown). The sign-in is kept as one Keychain item (`SecretKind.account`); the name
is also in plain settings so the app can say who is signed in without reading the Keychain.
- **The model door** (`OlaKit/ModelDoor.swift`): the agent never holds the account token. The app (or
  the `ola` command) listens on loopback with a random key for this launch, forwards `/<rest>` to
  `<base>/api/device/gw/<rest>` with the account token, streams the answer chunk by chunk, closes
  the upstream request when opencode drops the connection (Stop), never follows a redirect, and
  turns a 401 into "signed out" (the app shows "You've been signed out on this Mac"). opencode's
  provider base and the web commands' `OLA_GATEWAY_HOSTPORT`/`BOX_API_KEY` point at the door and its
  key. The agent's environment is now a short list (HOME, USER, SHELL, TMPDIR, LANG, …), not
  whatever started it.
- **The app**: a Mac with nothing set up shows one screen, "Sign in to Ola"; after signing in it goes
  to "On this Mac": choose a folder, and on a Mac without opencode the app fetches it itself
  (`OlaKit/OpencodeInstall.swift`: the pinned 2.3.0 package for this processor from the npm
  registry, checked against the sha512 `package-lock.json` pins (a test keeps the two equal),
  unpacked into `Application Support/Ola/opencode/bin`, asked for its version; no Node, no npm, no
  admin password). Settings has an Account section (name, "Signed in on this Mac", the share used
  as a sentence when the server gives a fraction, Sign Out, the `ola` command). A Mac that already
  works with the Ola machine or a pasted token is not asked to sign in. The pasted model token keeps
  working only when not signed in; it is marked "DELETE once account sign-in is live" in
  `LocalServer.swift`, `WhereOlaWorks.swift` and `Keychain.swift`. "On the Ola machine" is unchanged.
- **Screens**: `OLA_ONLY=signin tools/build.sh mac <dir>` (signed out, wrong password, the passkey
  sheet, passkeys not in this version, "Use a passkey instead" on a Mac that used one, not open yet,
  failed, signed out by the server, choose a folder, getting ready, its failure, Settings signed in
  and out, a passkey added there and refused there; light and dark).

Matched to the server as built (`../README.md`, "Signing in from the Mac app and the command line"):

- **Signed out is any 401** on `/api/device/*`: the front desk's `{"error":"signed_out"}` or the door's
  401 HTML page with `WWW-Authenticate: Basic`. Never retried: ten refused passes in 15 minutes block
  the person's whole address, the web app included. Left to itself URLSession answers that Basic
  challenge by sending the request again (measured: two requests per refusal), so every request to
  app.ola.cx cancels the challenge and keeps the 401 it came with (`NoCredentials`, and the door's
  `Upstream`); no credential store is consulted. The door then answers every later request itself
  (`ModelDoor.isSignedOut`), the app forgets the sign-in and shows "You've been signed out on this Mac",
  and the `ola` command forgets it at once. `swift test` proves one request per 401 for the door (four
  requests in, one out), who-am-I and usage.
- **Usage** is the gateway's own reply: `fraction_used` (0 to 1) of the week's share and `resets_at`,
  said as "You've used 42% of this week's share. It starts again Monday."
- `device.id` is a number (a string is taken too); codes and tokens are passes (`olap1.…`, about 150
  characters of `[A-Za-z0-9_.-]`, inside the listener's accepted `[A-Za-z0-9._~-]{8,512}`).
- **Silence before the first byte**: the door allows 15 minutes between bytes (the gateway asks the
  model for a whole reply first; its own limit is 10 minutes).
- The probe (`GET /api/device/me`, no credential): 401 open, 404 not open yet.

`tools/stub-ola.py` answers in these shapes (pass-shaped codes and tokens, a numeric device id, the
gateway's usage reply, the door's HTML 401 for a pass it does not know, `{"error":"signed_out"}` for a
revoked one).

## The `ola` command ("On this Mac" in a terminal)

`ola` in any folder works there the way "On this Mac" does, with the same account, door,
permissions (the app's Permissions setting, below), web commands and config, from the same OlaKit code
(`OlaKit/OlaCLI.swift`): the app's own executable in a mode that never starts the interface
(`Ola.app/Contents/MacOS/Ola --cli …`, checked before anything from AppKit or SwiftUI), so it has the
app's signature and reads the Keychain with no question; `ola` itself is a three-line launcher.

```bash
ola                    # the conversation, in this terminal (opencode 2.3.0's interface with Ola's wordmark, on Ola's server)
ola "a request"        # one request, the reply printed; also: ola run "…" (exit code: whether it worked)
ola -c                 # pick up the last conversation
ola login | logout | whoami | status | --help
```

- **Which opencode:** Ola's own build, carried inside the app (`Contents/Helpers/ola-opencode-<processor>`,
  `LocalServer.bundledBinary`; `../opencode-fork/README.md`): the pinned release with Ola's wordmark and
  wording, nothing else changed. "On this Mac" in the app runs the same one.
- It starts its own `opencode serve --stdio` (it ends when the command does, a kill included) and a
  door, then opencode's interface (`opencode --server <it>`) in the terminal's foreground group
  (posix_spawn: Foundation's Process puts a child in a background group, where the interface stopped
  at once), so keys, Ctrl-C and resizing go to it. A small watcher ends the interface and the agent
  if the command itself is killed outright.
- Under "Ask before each step", a one-shot run cannot ask, so opencode refuses commands and edits
  there and says so; the conversation asks (Allow once / Always allow / Reject). Under "Lots of
  permissions" (the default) both go ahead.
- **Sessions are shared with the app**: two opencode servers on one data folder were measured (a
  session made by one listed by the other; 40 writes from both at once, all kept), so the command
  uses the app's "On this Mac" store and its own config folder (the config names its door). The app
  refreshes its list when it comes to the front. The command keeps no pid file, so the app can never
  take its server for one it left behind, or end it.
- **Install**: `tools/build.sh install-mac` also runs `Ola --install-cli`, which writes the launcher
  into the first writable folder among `~/.local/bin`, `/opt/homebrew/bin`, `/usr/local/bin` that a
  login shell has on its PATH (never over someone else's `ola`) and prints where; Settings, Account,
  The ola command, Install does the same.
- **`ola login`** asks "Name:" then "Password:" (nothing shown as it is typed; Ctrl-C puts the
  terminal back), then "Signed in as bart." Without a terminal it reads the two lines from standard
  input. An account that asks for its passkey too: "This account asks for a passkey; sign in from the
  Ola app." (the command shares the app's sign-in). Never a browser.
- **Check**: `tools/cli-selftest.sh <Ola.app>` runs it end to end against `tools/stub-ola.py` (a
  stand-in for app.ola.cx with a fake model), beside the real app without touching it (own settings
  suite, scratch Application Support, throwaway Keychain names): from "not signed in" through a wrong
  password, the passkey account sent to the app, login on standard input and in a pseudo-terminal
  (`tools/login-pty.py`: the password never on screen), whoami, status, a printed reply, the account
  token upstream and never the door key, a refused command in a one-shot run, the shared store, the
  interface in a pseudo-terminal, a SIGKILL that leaves nothing running, logout, and a sign-in the
  server ended: at most one request there, then forgotten. Against another server:
  `OLA_HANDLE=<made-up> OLA_ACCOUNT_PASSWORD_FILE=<file> tools/cli-selftest.sh <Ola.app> <base>`.

## The self-test (against the real server)

Connects (and checks a wrong password gets 401), checks the only models are Ola's gateway's, makes a
session, asks for five words and waits for the streamed reply, has the agent write `olakit-check.txt`
and approves the write once, asks for `ls ~/GAMI` and checks it is refused without asking, rebuilds the
history from the server, renames and deletes the session. One PASS or FAIL line per step.

## Design

**The Mac looks like a Mac (OLA-207, 2026-11-19).** Bart on 0.1 (16): "a little... odd. something
kinda of big or square ... the dark-grey on darker-grey mode is obviously a dark mode where i would
expect a light mode." What changed on the Mac only (the phone keeps the brand below):
- **Light by default**: Settings, General, Appearance: Light / Dark / Match this Mac
  (`Mac/Appearance.swift`, `ola.appearance`, applied before the first window draws).
- **The palette `N`** (`Palette.native`): a white page (#1e1e1e in dark, as Notes and Mail), neutral
  grays, label-contrast text; the brand blue stays the accent. A, B, C are still selectable.
- **One family**: the system's San Francisco for everything (`OlaFont` maps to it on macOS); reading
  14 at about 1.45 line height in a 600-point column, interface 13, titles 17.
- **No box in a box**: `Treatment.plain` lays the conversation edge to edge; the files are the
  system's inspector. The sidebar is the system's source list (`List(.sidebar)` with collapsible
  Cloud and Local sections); toolbar buttons are plain symbols (no glass capsule on macOS 26+).
- **References, not earlier versions**: `~/Desktop/Ola/mac-redesign/` has one sheet per mode, ours
  beside Notes, Mail, Claude and ChatGPT.

"Paper under the lamp" (`~/Desktop/ola-brand/app/spec.md`): what you read is paper laid on the room;
lamp yellow only for what is running; vermilion only for what needs Bart (an approval, a failed step,
a session that finished unseen). Bricolage Grotesque for the interface, Literata for what Ola writes,
IBM Plex Mono for details, bundled from Google Fonts (OFL) as static instances
(`tools/instance-fonts.py`).

**The palette (design pass two, 2026-11-16, `Palette` in `Shared/Theme.swift`).** Bart, on the
evening-blue room and black page: "the black and blue are unsophisticated". Tone now does the work,
not hue: one warm, low-chroma ramp per mode (the frame: sidebar and title bar; the page one step
lifted from it; hairlines; three levels of text), one accent, one "needs you" color, every value named
by its role. Ola's text on the page is 16.2:1 in light, 13.4:1 in dark. The brand's blue survives as
the accent only (the Yes button, links), never as a surface; vermilion is smaller and calmer. The
title bar is the frame's tone in each mode, so the system draws the title in the right ink (the old
dark-blue bar made it dark gray on blue in light mode). Three palettes were drawn
(`~/Desktop/ola-brand/apple-shots/polish-2/palettes.png`): A ink and paper (the accent is the ink), B
paper with the blue accent (chosen), C a slate frame with the blue accent. A and C stay selectable
without a rebuild: `defaults write cx.ola.mac OlaPalette A` (or `C`; `defaults delete cx.ola.mac
OlaPalette` for the chosen one), then relaunch; on the phone the same key in `cx.ola.mac`.
Snapshot renders all three (`OLA_ONLY=palette`).

**Scale (2026-11-16 design pass, `Shared/Theme.swift`).** On the Mac the interface is the system's
own size and only what Ola writes sits a step above it. Type: title 20 (Bricolage display), heading
15, reading 15 (Literata, about 1.58 line height, a 620-point column, about 80 characters), interface
13, secondary 11, mono 12. Space: 4, 8, 12, 16, 24, 32. Sidebar rows 28 points, buttons 26, file rows
24. Nothing outside these (`Metrics`, `Space`); the phone keeps its own larger set under the same names.
Text buttons (Copy, Show details, Open) underline on hover; rows and buttons have hover and pressed
shades; fields draw the system's focus ring color.

**The window: one sheet on the room.** The conversation and the files are one sheet of paper laid on
the blue room, the files as its ruled right margin (`Treatment.desk`). Drawn against two sheets side
by side (`Treatment.sheet`, kept): `~/Desktop/ola-brand/apple-shots/polish/compare-conversation.png`.
**Settings** is the system's grouped form with Ola's marks and status colors (`SettingsLook.native`),
drawn against the same rows on paper (`.paper`): `polish/compare-settings.png`. Each choice is a
short label with a line of explanation under it, so nothing truncates; status is a colored dot and
words. The Phone section uses the same pieces (`SettingsGroup`, `SettingNote`, `StatusLine`).

The Mac screenshots come from `Ola -OlaSnapshot <dir>` (`tools/build.sh mac <dir>`, `OLA_ONLY=<part
of a name>` for some): the app draws its own views (the sidebar, conversation and files panel, with a
drawn title line in place of the real toolbar, since the system's glass sidebar and toolbar do not
draw off screen) into PNGs, with made-up data, and exits; it never shows a window or becomes active.
It also draws Settings in four states (its own defaults suite, never the Keychain) and the real
`MacRoot` twice: `mac-real-*.png` with `cacheDisplay`, and `mac-real-*-composited.png` from the
window's own Core Animation layer tree while it is ordered in far off every display (no screen
capture, no permission). Neither shows the NavigationSplitView sidebar or the inspector (blank: they
are drawn by the window server's glass), so the sidebar and files in the drawn frame are the app's own
views but not proof of how the system frames them. The iPhone app takes
`-OlaFixture <main|approval|empty|unreachable>` and `-OlaOpen` for simulator screenshots.

## Working indicator: the Hop (2026-11-20, OLA-225)

While Ola works, a coral ball hops across three faint dots ("Hop, skip", the design in
`misc/ola-working-hop.zip`): 48 by 24 pt beside "Working for … · N steps" on the run line, 32 by 16
beside a running session in the Mac's sidebar and the phone's session list. One view for both apps,
`Shared/OlaHop.swift`; when the work ends it finishes the hop in the air, Reduce Motion gets a still
frame (the middle dot lit). It replaced the four drawn characters of 2026-11-17, the large figure under
a quiet run, the lamp dot and the `OlaWorking` defaults; the phone's Settings no longer has a
"Working animation" picker. The numbers, the colors per dark style and the checks are in `MOTION.md`.

## Plain HTTP over Tailscale (App Transport Security)

The machine is reached by plain HTTP over the tailnet (WireGuard encrypts it). Both apps allow plain
HTTP only to local addresses (`NSAllowsLocalNetworking`) and to Tailscale names (`*.ts.net`,
`NSExceptionDomains` with `NSExceptionAllowsInsecureHTTPLoads`); everything else still needs HTTPS.
ATS cannot name an IP address: in the simulator `http://100.95.51.98:4310` was refused and the
Tailscale name worked, so the connect sheet is prefilled with
`http://admins-mac-mini.tailde799a.ts.net:4310` (the same server). On the Studio, type its name.

## The phone pairs with the Mac app (since 2026-11-16, evening)

Bart's correction: "the iphone app must connect to the mac app - just like claude code in the app."
The Mac app is the hub. Settings, Phone, **Let my phone connect** (off by default) starts the relay
(`OlaKit/Relay.swift`, owned by `Mac/PhoneLink.swift`): an HTTP server on this Mac's **Tailscale
address only** (found at runtime from the network interfaces, 100.64.0.0/10; port 4330; if Tailscale
is off the section says so), in front of whichever server the Mac app uses now: the Ola machine, or
its own local opencode in "On this Mac". **Pair a Phone** shows a QR code and the same thing as text:
this Mac's name, its Tailscale name and port, and a 130-bit random secret. Nothing else; the phone
never sees the machine's password or the local server's. The Mac keeps only the secret's SHA-256
(`~/Library/Application Support/Ola/phones.json`, 600). Paired phones are listed with when they were
last seen; **Remove** ends that phone's access at once, its open event stream included.

The relay checks the secret in constant time against every phone, refuses an address for a minute
after 8 wrong tries, forwards only the opencode routes the apps use (`MacRelay.allowList`; anything
else is 403), passes on only `Content-Type` and `Accept` from the phone and replaces its
`Authorization` with the server's own. When "Where Ola works" switches, the relay's server changes and
every open event stream ends, so the phone reconnects to the new one without pairing again.

The phone's first run is **Pair with your Mac** (scan the code, camera permission in plain words,
or type it). When the Mac app is not running or the Mac sleeps it says "Your Mac is not reachable.
Ola on your phone works through the Mac app." with Try again. The old address-and-password form is
no longer on the phone's path (`ConnectForm` remains for the Mac's own connection to the machine).

Proved 2026-11-16: `swift test` (relay: allow-list, pairing code round trip, through to server A with
A's credentials, typed secret, 403 off the list, wrong and missing secret 401, mode switch to server
B with the same secret, removed phone 401, too many tries 429); `OLA_VIA_RELAY=1 swift run
olakit-selftest`, all 15 steps through a relay in front of the machine; a headless relay
(`swift run olakit-relay`) bound to this iMac's Tailscale address, reached **from the mini over
Tailscale**: 401 without the secret, 200 with it, 403 for `/api/config`, nothing on this Mac's
loopback; and the iPhone app in the simulator paired with a relay on loopback. A Mac cannot reach its
own Tailscale address (the request times out), so the simulator, which shares this Mac's network,
used loopback: that proves pairing, the relay and the app, not the phone's Tailscale route, which is
the same route the mini used.

## Where Ola works, on the phone (2026-11-17)

**Superseded for the cloud by "One cloud" (OLA-150):** the phone's Cloud is the person's project on
app.ola.cx, over the internet; the phone door and Tailscale below are history.

Bart: "the same 'where Ola works' switch from the macOS app should also be in the iPhone app - so
not just the mirroring of the Mac app." Settings, **Where Ola works** (`iOS/PhoneWhereViews.swift`,
`OlaKit/PhoneWhere.swift`):

- **Through my Mac**: the pairing above, unchanged. The phone shows whatever the Mac is doing,
  "On this Mac" sessions included.
- **On the Ola machine**: the phone works with Bart's opencode on the machine directly (the same
  `~/ola-bart` server, so the same sessions the Mac sees in its own "On the Ola machine"), with the
  Mac off. It signs in in the app with an Ola name and password (`AccountAPI.login`, kind `phone`; the
  server lists it under Your devices), no passkey step. An account that asks for its passkey too is
  told to turn that off on the web (the phone build has no passkey permission yet).

How the phone reaches the machine: **over Tailscale, through the machine's phone door**
(`../bart/phone-door.mjs`, port 4312 on the Tailscale address, started by `cx.ola.bart` beside
opencode and the model forwarder). The door lets a request through only with an Ola device key whose
person is on its list (`OLA_BART_PHONE_HANDLES`, default `bart`), checked with the front desk's
`/api/device/me` (kept a minute, so a phone removed under Your devices or signed out stops within a
minute, open event streams too), only on the relay's route list, and adds opencode's password, which
the phone never holds. Why not through `app.ola.cx`: Bart's opencode runs with his full privileges on
the machine (a shell as `admin`); putting it behind the public address would make his account
password the only thing between the internet and that shell. The Mac's path is Tailscale plus the
machine password; the phone's is Tailscale plus a revocable sign-in, so nothing new is public and no
route skips the front desk's sign-in. When Tailscale is off on the phone, the sign-in screen and the
session list say "Turn on Tailscale on this phone." (`PhoneWhere.tailscaleOn`: a 100.64.0.0/10
address on any interface).

**Defaults:** a phone paired before this version stays "Through my Mac" (`PhoneWhere.mode` is `mac`
when a pairing is saved and nothing was chosen). A fresh install's first screen offers both: "Pair
with your Mac" and "Sign in to the Ola machine", each with a link to the other. **Switching** attaches
the store to the other place at once (`OlaStore.attach(_:orSaved: false)`), so the session list
reloads from there; choosing a place not set up yet opens its pairing or sign-in in a sheet and
switches when that succeeds. Signing out of the machine goes back to the Mac if paired; forgetting the
Mac goes to the machine if signed in. Notifications and Fallback to Claude stay Mac-only and are
hidden on the machine.

Checks: `swift test --filter PhoneWhereTests`. In the simulator, `-OlaWhere mac|machine|none`, the
sign-in from `SIMCTL_CHILD_OLA_SIGNIN_HANDLE`/`_PASSWORD` (a made-up staging account, never Bart's),
`SIMCTL_CHILD_OLA_MACHINE_DOOR` for a scratch door, `-OlaAsk "<request>"` (a new session with it) and
`-OlaSwitchAfter <s> <mac|machine>` (the Settings switch). Proved 2026-11-17 against a scratch door
on the mini admitting only the made-up account, in front of `~/ola-bart`, and a headless relay on
loopback for the Mac side: screens in `~/Desktop/Ola/phone-modes/`.

**Without Tailscale on the phone (a later version, design note only):** a small relay on the Ola
machine with a public HTTPS name; the Mac app keeps one outbound connection to it, the phone another;
the two do an end-to-end key exchange bound to the pairing code (for example Noise or an X25519
handshake keyed by the QR secret), so the relay only moves ciphertext and cannot read or forge
anything; the relay authenticates both by keys made at pairing and holds no opencode credential.

## Fallback to Claude, slash commands, reactions (2026-11-16, night)

**Fallback to Claude** (Mac Settings, Claude, off by default) runs Claude Code itself, headless, in
the session's folder, with Bart's own Claude login on this Mac (`OlaKit/ClaudeRunner.swift`: the
binary found in `~/.local/bin`, `~/.claude/local`, Homebrew, npm or a login shell; any
`ANTHROPIC_API_KEY` removed from its environment; `--setting-sources project --strict-mcp-config` so
his own hooks and MCP servers stay out). Writes and commands pause in the same approval panel through
Claude Code's own permission prompt (`--permission-mode manual --permission-prompt-tool stdio`), as in
the web app's builder. Its stream is said in the same words as Ola's (`Claude.swift`, ported from
`web/src/lib/steps.ts`). Stop interrupts it and then ends every process it started (they are tracked
while it runs). Claude turns are kept per session in `~/Library/Application Support/Ola/claude/` and
merged by time; the phone reads them through the relay (`/ola/claude/<session>`). With the switch on:
a small grey "Ola ⌄" pull-down inside the composer, left of the send button (OLA-155), a small "Try
again with ⌄" pull-down under a finished Ola reply (OLA-156; both `QuietMenu`), and a "Claude"
mark on every Claude turn. **Only in "On this Mac" for now**; on the Ola machine the switch is
disabled ("Not yet on the Ola machine"), and the phone shows Claude turns but cannot start one.

**Slash commands and reactions** follow `../README.md`, "Slash commands and reactions (all
surfaces)" (`OlaKit/Commands.swift`). The reaction rules reach opencode as an `instructions` file in
both configs (machine and this Mac) and Claude Code through its system prompt.

Proved: `swift test` 10 of 10 (commands, the marker on the first line only, unknown names,
reaction-only replies, 👀 then ✅; Stop with a stand-in for Claude Code leaves nothing running);
`OLA_CLAUDE=1 swift run olakit-selftest` against the real Claude Code, four tiny requests (a streamed
reply; a write asked and allowed; a write asked and refused; Stop during a long command: in that run
the command outlived Claude Code, which led to the process tracking proved by the stand-in test);
the self-test on the machine, 14 of 14 including "a compliment gets a reaction and no reply" (🙏, no
text); `tools/settings-selftest.sh` 15 of 15 including the Claude switch.

## Both fallbacks on the Mac and in `ola`, and Settings as panes (2026-11-17)

Bart: "in the cli and the mac app, can i now switch to claude code" and "do we have that setting for
switching to open weight models if local inference is not good enough". The web app's rules, ported
(`OlaKit/Fallbacks.swift`; keep the words and thresholds in step with `web/src/lib/steps.ts` and
`StretchCard.tsx`):

- **Commands, the same in both:** `/claude <request>` (Claude Code on this Mac, in the folder, its
  steps in Ola's words, writes and commands asked first), `/hosted <request>` (the same opencode, with
  the model `hosted` for that one request, then back; the reply is marked "Hosted open model" and
  "Answered by the hosted open model at <provider>, outside Ola."), `/ola`, `/help`. Alone in a new
  conversation, `/claude` or `/hosted` sends the next message there. In `ola`: `ola /claude "…"`,
  `ola /hosted "…"`; in the terminal conversation, `/hosted` and `/ola` are opencode commands with
  their own model, and `/claude` says how to reach Claude Code.
- **Settings, Models:** "Fallback to Claude" and "Fallback to the hosted open model", both off,
  **per folder** (`FallbackSettings`, keyed by the folder's path; "machine" for the Ola machine),
  consent asked when one is turned on; "When a request looks like a stretch" (suggest, hand over
  without asking, never) and where a handover goes. `ola settings` shows them; `ola settings hosted
  on|off`, `claude on|off`, `stretch suggest|handover|never`, `stretch-to hosted|claude`.
- **The stretch card:** before a run (`Stretch.precheck`: the text files the request names, against
  On this Mac's folder) and after one (`Stretch.stuck`), with Just this once / Always in this folder /
  Not now; in `ola`, a one-line question with the same three. Asking in plain words ("hey can you use
  claude code for this next thing?", `ClaudeAsk`) shows the Claude card instead of sending it to the
  everyday model; when it only asks for the next thing, Just this once applies to the next message.
  The agents are told the same (`AgentNotes.claude`, `bart/ola-bart.sh`, `workspace/AGENTS.md`).
- **Who may use the hosted model:** the gateway serves `hosted` to a person's own caller `p-<id>`
  only when the admin let them (`admin.mjs app-hosted <handle> on [--cap-usd 20]`, people.app_hosted,
  off by default), within their monthly ceiling and on their weekly allowance (the gateway counts
  hosted tokens there too). The owner's own pasted-token setup is caller `bart`, listed by
  `OLA_FD_HOSTED_CALLERS=bart` in the front desk's env. The app learns what is set up from the
  caller's own `GET /v1/usage` (`hosted`, `hosted_month`). The model door refuses `"model":"hosted"`
  unless the app opened it for a request it hands over (`HostedGate`); `ola` opens it for the
  person's own `/hosted`. Claude on a Mac is the person's own Claude login, never Ola's.
- **Not yet:** on the Ola machine (Bart's opencode in `~/ola-bart`) the hosted switch says "Not yet on
  the Ola machine", as Claude's does; the phone shows hosted turns but does not start them.

**Settings** is a standard Mac settings window: a toolbar of panes (General, Account, Models, Skills,
Phone), each a short grouped form (`Mac/SettingsPanes.swift`); Skills shows one line per skill with a
dot and one Get Python Libraries button, placeholders hidden. Two layouts were drawn and compared
(`settings-A-toolbar-*`, `settings-B-sidebar-*` from `Ola -OlaSnapshot`); the toolbar was chosen, as
most Mac apps' settings are.

Proofs: `swift test` (FallbacksTests: the commands, the web app's rules, settings per folder, the
gateway's answer read, the fold's hosted mark, a hosted run that switches the session's model for one
request and back, the card's choices, Bart's sentence; DoorHostedGateTests); `gateway/test.mjs`
(a caller's own usage names the provider); `frontdesk/test/unit.test.mjs` (the grants file for people
and standing callers); `frontdesk/check.mjs` (a device refused until app-hosted, then served and
counted, refused again after off).

## Phone notifications and inline View (2026-11-16, late)

**Notifications** go to the phone for two things only: a run finished (done, or stopped by itself) and
a run waiting for Bart (an approval). The Mac app sends them through Apple push (`OlaKit/Notify.swift`:
an ES256 token from the team's key, `cx.ola.mac` as the topic, Apple's sandbox host for debug
builds); the phone gives its push token and its two switches (Finished, Needs me) to the Mac through
the relay, and says which session is on screen (that one does not notify). The key is imported once in
Mac Settings, Phone notifications, Set Up (an open panel at the key file), and kept in the Keychain.
They come only while Ola is open on the Mac. **Blocked by Apple, not code:** the push capability
needs Push Notifications on the App ID `cx.ola.mac`, and Xcode cannot add it until Bart accepts the
latest Program License Agreement at developer.apple.com. So the iPhone build signs without push by
default; after he accepts, `OLA_PUSH=1 tools/build.sh device` builds it with push. A real test
notification: `OLA_PUSH_SEND=1 swift run olakit-selftest` (only with Bart watching).

**View**: under a reply, what the run made (from its own file steps, as the web app's "Open <page>"
does, and the address a deploy command printed): pictures inline (up to three; SVG drawn as an image,
with no scripts or loads), then name, kind and View for the rest (four, then "and N more"). View opens
pages in the page viewer, websites in the in-app browser (phone) or the browser (Mac), pictures full
size with zoom, tables as a table, Markdown and text rendered, anything else in Quick Look.

## Kit: voice meetings and notes (phone, admins only, 2026-11-17)

Bart: "proper full duplex voice meetings with you or leave you voice notes", like Dodo's voice mode.
`iOS/Kit/`: `KitScreen(api:)` is the whole tab (Talk to Kit, Leave a note, the last few of each,
tap one to read it back), built to drop into the admin-only `KitRootView` with the app token:
`KitScreen(api: KitAPI(token: { <the token from the Keychain> }))`. The server is hilma's
`/api/venture/phone` (`src/lib/venture/phone.ts`); `OlaKit/KitAPI.swift` is its client.

- **A meeting** (`KitMeetingScreen`) runs on ElevenLabs' Swift SDK 3.3.1 with LiveKit pinned at
  2.17.0, the pair the Dodo app ships (`ElevenKitTransport.swift`). Its states and every way it ends
  are `OlaKit/KitMeeting.swift`: connecting, live (listening, thinking, speaking), one reconnect into
  the same meeting, then ended: by End, by four minutes of silence (the engine), the forty-minute cap,
  a lost connection, a phone call (the audio interruption). Each exit closes the connection, which
  frees the ElevenLabs slot, and tells the server once. Cutting in is ElevenLabs' barge-in; the
  transcript keeps what Kit actually got to say. `UIBackgroundModes: audio` (a plain Info.plist key,
  no capability) keeps a meeting going with the screen locked. Kit's voice is the eyes from "Ola is
  working" (`KitVoiceFigure`), on a disc that lights and swells with Kit's voice.
- **A note** (`KitNoteScreen`, `KitNoteRecorder`): tap to record, tap to stop (one-handed, no
  holding), a level meter, five minutes with a countdown in the last thirty seconds, Send or Discard,
  then "Kit has your note" with the words. AAC, 24 kHz mono; the file is deleted once sent.
- Proof without a real call: `swift test --filter KitMeetingTests` (a fake connection and server;
  every exit closes and reports once). Screens: `-KitShots <dir>` on a simulator debug build draws
  every state, light and dark, with made-up words, and exits (`~/Desktop/ola-brand/apple-shots/kit-voice/`).

## Ola ignores other tools' skills (2026-11-16)

On Bart's Mac, a request for an abstract painting loaded Claude's `algorithmic-art` and
`web-artifacts-builder` skills from `~/.claude/skills/synced/…` (read from the local session database):
opencode 2.3.0 reads Claude Code's skills, agents and `CLAUDE.md` unless `OPENCODE_DISABLE_CLAUDE_CODE`
is set, and a project's own opencode config unless `OPENCODE_DISABLE_PROJECT_CONFIG` is. Both servers
(the local one the Mac app starts, and `bart/ola-bart.sh` on the machine) now set both, run with their
own config folder (`XDG_CONFIG_HOME`, so no `~/.config/opencode` agents, commands or AGENTS.md), and
deny the `skill` tool. (Since 2026-11-17 the Mac offers Ola's own skills, and only those: "Ola's
skills on the Mac".) What stays: the project's own `AGENTS.md` and its files. Proof:
`OLA_SKILLS_CHECK=1 OLA_MODEL_TOKEN_FILE=<file> swift run olakit-selftest` plants skills that say
"write HIJACKED" where Bart's are, in a temporary home folder, and asks once for "a simple abstract
painting": no skill offered or loaded, no HIJACKED, `abstract-painting.svg` made (4 of 4).

**Ola's own skills, and nothing else (2026-11-17).** The skill tool is back on, for Ola's skills
only. The app carries `apps/activist-ai/skills` in its Resources and, at each start of "On this Mac",
writes a fresh read-only copy to `~/Library/Ola/skills` (`LocalServer.installSkills`: no spaces in the
path, so the skills' commands work as written; the image's `/opt/ola/skills` rewritten to it). The
config names that folder, denies every skill by name except Ola's (in `policies` and `permissions`, as
the sealed image does), and lets the agent's file tools read the copy; Claude Code's skills stay out
(`OPENCODE_DISABLE_CLAUDE_CODE`). The machine's server does the same (`../bart/README.md`).
**Looking at pages here:** `ola-see` is installed with the web commands (same forwarder, same token)
and `ola-page` is `../bart/ola-page-mac`: it asks this app to render the page off screen in its own web
view (`Mac/PageRender.swift`: a request file in `Application Support/Ola/render/in`, a window ordered in
far off every display, a scheme that serves only the page's folder and a content rule that blocks every
other load, only pages inside the project folder), runs the image's measurements in it and saves the
picture, at any width, at 2x, in dark mode. Checks: `OLA_SKILLS_CHECK=1 OLA_MODEL_TOKEN_FILE=<file>
[OLA_MODEL_URL=...] swift run olakit-selftest` (planted skills in `~/.claude`, `~/.agents`,
`~/.config/opencode` and the project are never offered or loaded; exactly Ola's are, from the copy;
the painting is still an SVG with no HIJACKED; "Design a landing page for a book club." loads
`designer`) and `open -n -g -W --stdout <log> Ola.app --args --render-selftest <dir>` (12 steps: the
commands and skills install from Resources, a page renders at 390 and 1280 px, 2x and dark through the
app, a request to another address is reported, a page outside the project is refused, the designer
skill's `look.py` runs through it).

## The phone app's shape (2026-11-17)

`iOS/PhoneShell.swift`: a tab bar with **Sessions** (large title, search, swipe to rename or delete,
pull to refresh, New in the top bar; each row shows the title, a line of the last reply, the time, and
"Needs your OK" or "Working"), **Kit** (only when signed in as an admin) and **Settings** (My Mac,
Notifications, Working animation with a live preview, Appearance, Fallback to Claude as the Mac
reports it, Admin, About). The tab bar hides inside a conversation. A gear on Sessions instead of a tab
bar is kept as `-OlaLayout gear` (both were drawn: `apple-shots/phone-app/`).

**Admin sign-in**: Settings, Admin, Sign In, with the name and password of the app.kochitolabs.com
account. The site's `/api/kochito/app-token` checks them with the same accounts and wrong-try limits
and returns a token for 30 days (`src/lib/kochito/app-auth.ts`), kept in the Keychain
(`OlaKit/Admin.swift`); Sign Out removes it, and a token the site no longer accepts asks again.
**`KitRootView`** (in `iOS/PhoneShell.swift`) is the admin-only screen: for now a note that voice is
coming and the Kit page's voice links, opened in the in-app browser. The voice feature replaces it.

Screens: `tools/phone-app-shots.sh <dir>` (every screen, light and dark, made-up data).

## Web search in Bart's apps (2026-11-17)

Both servers (the machine's, `bart/README.md` "Web search", and "On this Mac") search through Ola's
gateway with Ola's own commands, never opencode's built-in web search (no provider here: it
waited a minute and said "Web search cancelled") or page fetch (both turned off). On this Mac the
app carries `ola-search`, `ola-fetch`, `ola-lookup`, `ola-db`, `olaspec.py` and `olatext.py` from
`../workspace` in its Resources (project.yml), copies them to `Application Support/Ola/web-tools`
at each start (`LocalServer.installWebTools`) and puts that folder first on the agent's PATH, with
`OLA_GATEWAY_HOSTPORT` set to the machine's forwarder (port 4311, which passes every route, `/web/*`
too, byte for byte) and the same `bart` token; downloads land in the project's `sources/`. The two
lines the agent is told are `AgentNotes.web`.

The question reads as a web search, word for word the web app's (`OlaKit/WebAsk.swift`, a port of
`web/server/webask.mjs`): "Ola wants to search the web for: …", a line saying what leaves the
machine, and the usual three answers. The open model often wraps the command however it is told
(`ola-search "…" 2>&1; head -50`, a `which ola-search` first); output plumbing like that is still
asked as the web question, with the exact command under View. A step reads "Searched the web for
“…”".

**A failed run gets no ✅** (`Turn.endedWell`): no reaction when every step failed, or when some
failed and the run neither replied nor changed a file (the README's reaction rule).

**Check**, one real search each (Brave), both modes:
`OLA_WEB_CHECK=1 OLA_MODEL_TOKEN_FILE=<bart token> swift run olakit-selftest` (On this Mac) and
`OLA_WEB_CHECK=1 OLA_SERVER=http://100.95.51.98:4310 OLA_PASSWORD_FILE=<file> swift run olakit-selftest`
(the machine); `OLA_WEB_GATEWAY=host:port` points the local commands at another gateway. On
2026-11-17 both passed against a private copy of the gateway at this commit with the machine's
search key (loopback on the mini, removed after), since the staging gateway reads the `bart`
grant only once this commit is deployed.

## Who made this file (OLA-224, 2026-11-19)

Three engines can work in one project (Ola's open model, the hosted model, Claude), so each project's
`project.db` keeps a record of which engine created, changed or deleted each file, with the model and
the time (names and times only, never contents): `ola-db made-by begin|end` around every turn, read
with `ola-made-by [file]`. The apps record every Ola, hosted and Claude turn (`MadeBy.swift`,
`LocalMadeBy` on the Mac), show it ("Claude wrote index.html" in the steps, "Last changed by Claude,
10:49 pm" in Files), and start the next request to the open model with a short `<ola-engines>` note of
what the others did, hidden when the request is shown. Claude turns are saved as they go; one cut off
by a quit is ended at the next launch and shown as stopped, its file changes kept.

The lookup is never asked about: `ola-made-by` and `true` are allowed in both configs (the model
liked to add `|| true`), and the instruction says to run it alone, with nothing piped (a `| head`
made it ask). **Check**, the real open model: `OLA_MADEBY_CHECK=1 OLA_MODEL_TOKEN_FILE=<bart token>
swift run olakit-selftest` records Claude writing index.html in a scratch project, asks "Who made
index.html?" with no note, and passes when the model ran `ola-made-by`, nothing was asked, the answer
names Claude and claims nothing. 5 of 5 on 2026-11-19 after the two fixes (3 of 5 before).

## Publish to Ola's address (OLA-223)

On this Mac, signed in, the agent can put a folder on `https://sites.ola.cx/<name>/` (the `publish`
skill; the rules and who owns a name are in `../README.md`, "Publish from a Mac"). The app carries
`../bart/ola-publish` in its Resources (project.yml, beside `ola-page-mac`) and installs it with the
web commands; it reaches Ola through the model door with the door's key, and the door
(`AccountAPI.gateway`) sends `sites…` to the front desk's `/api/device/sites…` with the account's
token, which the agent never sees. Not signed in (or the pasted token through the machine's
forwarder), it sends nothing and says how to sign in. `ola-publish publish` and `ola-publish
unpublish` always ask, "Lots of permissions" or not: the app never answers them itself
(`PermissionSettings.alwaysAsks`), and the config written for `ola` asks for them after its allow
rules. Preview and status go ahead like any command.

## Where Ola works (Mac Settings)

One setting for the whole app:

- **On the Ola machine** (default): the agent and the files are on the machine; the phone follows.
- **On this Mac**: the Claude Code arrangement. The app starts its own `opencode serve` on
  `127.0.0.1:4320` in a folder Bart picks (`OlaKit/LocalServer.swift`) and stops it when the app
  quits or the setting changes. Only model requests leave the Mac, to the machine's forwarder
  (`http://100.95.51.98:4311/v1`, see `../bart/README.md`) with the `bart` gateway token from the
  Keychain. The config is written to `~/Library/Application Support/Ola/local/config/` (never into the
  project folder), the token and a fresh server password reach opencode only through its environment.
  Shell commands and edits follow Permissions (below). These sessions live on the Mac; the phone
  does not see them.

**The Settings check** (keep it): `tools/settings-selftest.sh <Ola.app> <folder> <token-file>` runs
`--settings-selftest` in a hidden second instance with its own settings suite, scratch Application
Support, relay port 4339 and no Keychain. It turns on Let my phone connect, checks the Mac's
Tailscale name is known and no IP address is shown, presses Pair a Phone and checks the code carries
the `*.ts.net` name and its window is open; then applies "Where Ola works" twice at once (launch and
Settings), toggles the phone setting, switches modes twice and saves, and checks exactly one local
agent is alive, the app uses it, it answers, the app is connected and Settings says "Running" with
no address; then switches back and checks the agent stopped. 12 of 12 on 2026-11-16.

**The Models check** (OLA-220, keep it): `tools/models-selftest.sh <Ola.app>` runs `--models-selftest`
the same hidden way against `tools/stub-ola.py`, on settings made like Bart's on build 0.1 (18) (the
old `ola.where = machine`, Local as the last New Session choice, a folder). The Models pane's
fallbacks follow the runtime, not what is on screen: Local has its two switches, the cloud says it
has none yet. The check proves the first launch moves the runtime on screen to `ola.runtime.shown`
and removes `ola.where`, both Local switches are enabled, ask for consent, turn on, reach the store,
survive a cloud session on screen and a relaunch. 19 of 19 on 2026-11-19.

**The check from the real app** (keep it; it is the proof for this mode):
`tools/local-selftest.sh <Ola.app> <folder> [token-file]` launches a second, background instance of
the app through LaunchServices (`open -n -g`, no window), so macOS treats it as when Bart opens it,
and the app runs `--local-selftest <folder>`: it starts opencode exactly as the setting does, prints
every step and what opencode printed, checks `/api/info`, stops it and exits 0 or 1 (`--fresh` uses
empty opencode state, as on a first start). It never uses the app's own state folder, so it cannot
end the server of an app that is open. 2026-11-16: a folder in `~` and one in `~/Documents`, with
warm and with empty state, 4 of 4, answering in 0.3 to 2.3 s.

The server starts on a free port each time, ends a server an earlier run of the app left behind
(its pid is kept in the state folder), waits up to 45 seconds with "Starting" shown, and on failure
says whether opencode was still running and its last lines, with Try Again. Right after the folder
is picked the app reads it itself, so a macOS privacy question about that folder comes up then.

opencode for this mode: the app fetches it itself the first time (see "Sign in with an Ola
account"); `tools/install-local-opencode.sh` (npm, the same pinned 2.3.0, into
`~/Library/Application Support/Ola/opencode`) still works and is found too. Proved with
`OLA_LOCAL_FOLDER=<scratch> OLA_MODEL_TOKEN_FILE=<file> swift run olakit-selftest` (14 of 14).

## Permissions: "Lots of permissions" (2026-11-17; everywhere since OLA-139)

Bart: "add a Lots Of Permissions options in the settings on the cli and macos app: too many nags",
then "All apps and all modes should have a toggle to remove most permission requests." One switch
with one name everywhere, **Lots of permissions** (on, the default for Bart's own Ola; off is "Ask
before each step"): Mac Settings, General (both places Ola works), the iPhone's Settings (both
places), `ola settings permissions lots|ask`, and the web app's switch in each conversation
(`../README.md`, "Web search and downloads").

Under Lots the ask-first steps go ahead: shell, bash, edit, write, apply_patch, patch, and so Ola's
web commands (`ola-search`, `ola-fetch`, `ola-lookup`: shell commands like any other). Everything
refused stays refused (opencode's webfetch, websearch, code mode `execute`, `external_directory`, so
work stays in its folder; skills not Ola's; models not Ola's; the shell patterns naming what serves
real people), because a refusal is never asked.

**Where it is applied, and where it is kept** (`OlaKit/Permissions.swift`):

- **On the Ola machine** (Bart's opencode, `../bart/`): kept and applied on the machine. The phone
  door's process watches opencode's events and answers each of those steps "once" under Lots
  (`../bart/approver.mjs`; the choice in `~/.ola-bart/permissions`, no file is Lots), so the phone
  alone, the Mac off, gets no card. The apps read and set it through the door, `GET|PUT
  /ola/permissions` (`MachinePermissions`): the phone with its Ola device key, the Mac with the
  machine's password at the same host, port 4312. The apps never answer these steps here: under Lots
  they keep the card and the notification away (`OlaStore.serverAnswers`) and show them after all if
  the step is still waiting 4 s later.
- **On this Mac**: the app answers them itself, "once", as they come (`OlaStore.goesAhead`), so a
  change applies to the next step with no restart; the config keeps "ask".
- **`ola`** writes the choice into its own config at each start (`LocalServer.askFirst`: the six
  rules become allow), since a one-shot run cannot ask and the terminal interface is opencode's.
- **The phone through its Mac**: the Mac's relay answers `/ola/permissions` with the Mac's choice
  and takes a change (`MacRelay.permissions`); the Mac's agent or the machine answers the steps.

**One value:** the Mac keeps a copy (`ola.permissions`, shared with `ola`). With the Ola machine set
up (its saved address and password), a change from the Mac, `ola settings permissions` or the phone
through its Mac goes to the machine too (`PermissionSettings.set`), and the Mac takes the machine's
value at launch, when it comes to the front and when Settings opens (`pull`). A self-test's own
settings suite never reads or writes the machine's.

- **Claude Code** (Fallback to Claude, `ClaudeRunner.goesAhead`): still `--permission-mode manual`;
  under Lots the runner answers itself, at each question, what acceptEdits would allow (Read, Write,
  Edit, Glob, Grep... on a path inside the folder) plus commands that name nothing outside it (no
  absolute path, `~`, `..` or `$` outside the folder, no sudo); Ola's web commands go ahead too.
  Anything else asks as before. A check of the words, not a wall, as opencode's own patterns are.

Proofs: `swift test --filter PermissionsTests` (the rules, both configs, the machine's door address,
the phone reading and setting it through a relay, a stand-in Claude Code under both settings);
`node bart/permissions-check.mjs` (the machine: real opencode 2.3.0, the scripted model, no app
open; Lots answers a command, a file and a web search, Ask leaves the step waiting, back to Lots
answers it, 14 of 14); `tools/permissions-selftest.sh <Ola.app> <scratch folder> <token-file>
[shots]`, a hidden instance with real requests "On this Mac" (11 of 11, 2026-11-17, shots in
`~/Desktop/Ola/permissions/`). The phone, both places, Mac app not running: shots in
`~/Desktop/Ola/permissions-all/`.

## Pages the agent built

"Open" on an `.html` file shows it in a web view that loads only through the `ola-page://` scheme:
each file the page asks for is read from the project on the machine with the saved password. A
content rule blocks every other load (http, https, websockets, file URLs) and navigation away is
refused; the page's own JavaScript runs.

## Keeping OlaKit in step with the web app (Fallback to Claude, 2026-11-16)

`web/src/lib/steps.ts` and `conversation.ts` gained Claude Code's side; the Swift ports in
`OlaKit/Sources/OlaKit/Steps.swift` and `Conversation.swift` were not changed and do not have it yet:

- `steps.ts`: `claudeTool` / `claudeInput` / `describeClaudeTool` (Claude Code's tool names, such as
  `Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`, and its `file_path` argument, said with Ola's own
  verbs), `describeClaudeApproval` (titles "Claude wants to write a file", "Claude wants to run code
  in your project"), and `stuckReason` / `STUCK_WORDS` (the observable "Ola got stuck" signals and
  the one sentence the person reads).
- `conversation.ts`: `Turn` has `engine` (`ola` or `claude`), `run` and `handoff`;
  `startClaudeTurn`, `applyClaudeEvent` (folds the front desk's NDJSON: its `ola` lines `started`,
  `approval`, `answered`, `ended`, and Claude Code's `assistant`, `user`, `result`,
  `system/api_retry`), `turnFromClaudeRun` (a run from `GET /api/claude/turns`) and `contextOf`
  (the conversation so far, sent to Claude as context). `applyEvent` now leaves a Claude turn alone.
- A Claude reply is marked "Claude, outside this machine"; its approvals use the same three
  answers as Ola's.

The apps talk to Bart's own opencode, not the front desk, so they have no Claude runs today; port
these when they do.

## Ola's cards, described once (OLA-325, 2026-11-21)

The question card and the publish (or take-down) yes are not ported: `web/server/cards.mjs`
describes them (every sentence, the choices, the buttons, and what words typed in the box do), the
web app imports it, and OlaKit runs the same file in JavaScriptCore (`Cards.swift`; the script is
`CardsJS.swift`, generated). After changing `cards.mjs`, `webask.mjs` or `publishask.mjs`, run
`node apple/tools/cards-js.mjs`: `swift test` (CardsTests) and the web check both refuse a stale
copy. The fixtures `web/test/cards.fixtures.json` hold every card kind with the lines it must show;
the web check draws each with the web app's own components in Chromium and WebKit, and CardsTests
checks the fields `QuestionPanel` and `ApprovalPanel` draw, in their order (the SwiftUI views
themselves are not rendered by a test). Typed words answer any question card
(two questions, pick several) in every client; a publish yes lists the files and the address,
never the command, also with Ola working on the Mac (the files read from the folder here).
Still ported, not described once: the other approvals (commands, file changes, web searches).

**Dark styles** (OLA-221, 2026-11-19): Settings, Appearance (on the Mac, General) offers a Dark
style while the app is dark: Standard (as before), Graphite (a near-black frame, the page lifted two
steps above it to read on, hairlines only) and Ink (the ola.cx letter page: its blue as the page, its
navy as the frame, cream text, the vermilion comma as the one accent). Light never changes. The
values are tokens in `Shared/DarkStyle.swift` (each style replaces the dark half of every palette
role in `Shared/Theme.swift`, so both apps use the same ones); `ThemeBox` is observed, so a change
redraws at once. `python3 tools/contrast.py` measures every pair a person reads (body text at least
7:1). Shots: `Ola -OlaSnapshot <dir> -OlaOnly dark` on the Mac; `tools/sim-dark-shots.sh` on the
Mac mini for the phone (it boots a simulator: never on Bart's iMac). Sheets beside Claude, ChatGPT,
Linear and Ivory in dark: ~/Desktop/Ola/dark-themes/.

**The phone matches the Mac** (OLA-222, 2026-11-19): the same San Francisco type and relative scale
(on iOS's own default sizes, following Dynamic Type), the same native palette, Light by default with
the same Appearance and Dark style choices, the same steps, code blocks, approval cards, file rows
and input box (Shared/). Sheets: ~/Desktop/Ola/phone-matches-mac/. What is left different is the
platform's own convention, nothing else:
- Navigation: a tab bar, a pushed conversation and a sessions list on the phone; a sidebar, a toolbar and an inspector on the Mac.
- Touch: controls at least 44 points high with more padding, and the approval's three answers stacked full width when the screen is narrow.
- Sizes: iOS Dynamic Type (body 17) on the phone; the Mac's fixed system sizes (13 and 14) there.

The phone's Cloud and Local headers hide and show their sessions with a tap or a double tap (the
chevron included), at least 44 points high, kept in the same keys as the Mac's
(`ola.sessions.hidden.cloud` / `.local`); VoiceOver says "collapsed" or "expanded".
`tools/sim-sections-check.sh` proves it on the mini's simulator (hide, relaunch, still hidden, show).
