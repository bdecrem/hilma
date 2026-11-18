# Ola for Bart: the Mac and iPhone apps

Bart's own front end to the opencode agent on the Ola machine (Part I: full privileges, no sealed VM).
Both apps are clients of one `opencode serve` on the machine (`../bart/`), so sessions live there:
the phone shows the Mac's sessions live, and the Mac need not be on.

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

## Build

```bash
apps/activist-ai/apple/tools/build.sh mac [shots-dir]   # Mac app, signed with a stable identity; with a dir, renders its views to PNGs off screen
apps/activist-ai/apple/tools/build.sh install-mac       # copies it to /Applications/Ola.app (does not open it)
apps/activist-ai/apple/tools/build.sh sim               # iPhone app for the simulator
apps/activist-ai/apple/tools/build.sh device            # iPhone app for a device (automatic signing)
cd apps/activist-ai/apple/OlaKit && swift test          # the fold, on the web app's recordings
OLA_PASSWORD_FILE=<file> swift run olakit-selftest      # against the real server (see below)
```

## Shipping: TestFlight for the phone, a signed download for the Mac (2026-11-17)

`testflight/README.md`: `bump-build.sh`, then `testflight/asc-setup.mjs` once and
`testflight/ship-via-mini.sh [ios|mac|both]` (archived on the mini's release Xcode). The iPhone app
goes to TestFlight's internal group; the Mac app cannot (TestFlight on the Mac needs the App Sandbox,
and in it the agent cannot run git, Python, Node, scripts or Claude Code: measured, the table is in
that README), so it ships as a Developer ID signed, notarized disk image on ola.cx with an update
check (Ola, Check for Updates…). Both wait on Bart accepting Apple's updated Program License Agreement.

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

## Sign in with a name and password (2026-11-17, the Mac app for anyone with a login)

The first screen on a Mac with nothing set up is **Sign in to Ola**: the account's name and password,
straight in the app (`AccountAPI.login`, `POST /api/device/login`), which gives this Mac its own key
(the server's side: `../README.md`, "The Mac app for anyone with a login"). Words for every refusal:
wrong name or password (one sentence for both), the server's own wait after too many tries, "Ola isn't
answering just now", each one plain line under the fields. An account that asks for its passkey too
gets the system's passkey sheet in this window (below, "Passkeys in the app"); nothing ever opens a
browser (2026-11-17: "normal means you'd never leave the app"). Under the form: "Sign in with a
passkey" (only in a build that can use passkeys), and **"Use my own Ola machine
instead"**: the owner's setup (the machine's address and password, the pasted model token over his
private network, the phone's pairing), which is untouched: a Mac that already has a machine address or
a pasted token never sees this screen, and its settings are not changed by the update. After signing
in, "On this Mac" works through the model door with the Mac's key; "On the Ola machine" shows "Not
yet" for anyone signed in without the owner's setup. Settings, Account, Sign In… opens the same screen
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

## Working animations (2026-11-17)

While Ola works, the run line shows one of four small characters drawn in code in place of the lamp
dot (`Shared/WorkingArt.swift`, placed by `Shared/Working.swift`): **swing** (the icon's tag on its
string), **hop** (the coral comma hopping on its tail), **machine** (the sidebar's datacenter box), and
**eyes** (the 👀, drawn). One per run, by the run's id, so the Mac and the phone show the same one in
the same pose; `defaults write cx.ola.mac OlaWorking hop` (or `cx.ola.mac`) forces one, `defaults
delete` undoes it. A rare special beat every 20 to 40 s; a new step gets a small acknowledging beat;
waiting for a yes, it stops and looks down at the approval; done and failed get a short goodbye. After
20 s with nothing new, a 120-point version comes out under the run and tucks back when something
arrives. Reduce Motion gets a still pose that breathes slowly (`defaults write cx.ola.mac
OlaWorkingMotion full` animates anyway). 30 fps on the run line, 60 for the large one. Paused when scrolled away, in the background, and once a wait
has settled. Numbers for the web: `MOTION.md`. Videos: `tools/motion.sh <dir>` (frames rendered off
screen by `Ola -OlaMotion`, encoded with ffmpeg); CPU: `Ola -OlaMotionCPU <figure|plain|lamp> <s>
[-OlaLarge] [-OlaCalm]`.

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
"Ola | Claude" beside the composer, "Ask Claude instead" under a finished Ola reply, and a "Claude"
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

## Permissions: "Lots of permissions" (2026-11-17)

Bart: "add a Lots Of Permissions options in the settings on the cli and macos app: too many nags".
Settings, General, **Permissions**: "Ask before each step" or "Lots of permissions: Ola goes ahead
without asking" (**the default**). One value for the Mac app and `ola` (the same executable and
defaults: `ola.permissions`, `OlaKit/Permissions.swift`); `ola settings` shows it and
`ola settings permissions lots|ask` changes it.

Under Lots only the ask-first steps go ahead: shell, bash, edit, write, apply_patch. Everything
refused stays refused (opencode's webfetch, websearch, code mode `execute`, `external_directory`, so
"On this Mac" still works only in its folder; skills not Ola's; models not Ola's), and a web search
or download through Ola's own commands (`ola-search`, `ola-fetch`, `ola-lookup`) still asks.

- **The app** answers those approvals itself (`OlaStore.goesAhead`, wired by
  `PermissionSettings.wire`): "once", at once, with no card and no notification, asked at each
  approval, so a change applies to the next step with no restart. The config keeps "ask". This
  works the same against the app's agent on this Mac and against **Bart's opencode on the
  machine** (`../bart/`): its config is unchanged, the Mac app's store answers for it while it is
  connected. The phone alone (Mac app not running) still gets the card.
- **`ola`** writes the choice into its own config at each start (`LocalServer.askFirst`: the five
  rules become allow, the three web commands ask), since a one-shot run cannot ask and the terminal
  interface is opencode's. A change applies the next time `ola` starts.
- **Claude Code** (Fallback to Claude, `ClaudeRunner.goesAhead`): still `--permission-mode manual`;
  under Lots the runner answers itself, at each question, what acceptEdits would allow (Read, Write,
  Edit, Glob, Grep... on a path inside the folder) plus commands that name nothing outside it (no
  absolute path, `~`, `..` or `$` outside the folder, no sudo, no Ola web command). Anything else
  asks as before. A check of the words, not a wall, as opencode's own patterns are.

Proofs: `swift test --filter PermissionsTests` (the rules, both configs, a stand-in Claude Code under
both settings); `tools/permissions-selftest.sh <Ola.app> <scratch folder> <token-file> [shots]`, a
hidden instance with real requests: Lots, a folder and three files, 5 steps, no card at any moment;
Ask, the card ("Ola wants to write a file"), allowed once; Lots again in the same session, no card
(11 of 11, 2026-11-17, shots in `~/Desktop/Ola/permissions/`). `ola run` under Lots wrote the three
files with no terminal; under Ask it refused. `ola /claude` with no terminal: wrote its file under
Lots, refused under Ask.

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
