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
  iOS/               the iPhone app (cx.ola.phone)
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
answering just now", and an account that asks for its passkey too goes on to the browser below (the
window says so). Under the form: "Sign in with your browser instead", and **"Use my own Ola machine
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

## Sign in with an Ola account in the browser (2026-11-17, now the passkey way)

Bart: "do the new login system for macos app ... so i can use the app on my other computer by
logging in as bart (or any user)". Each person signs in with their own Ola account and reaches the
model through `https://app.ola.cx` (one constant, `AccountAPI.address`; `OLA_ACCOUNT_BASE` or the
`ola.accountBase` default points checks at a stand-in, never shown). No Tailscale, no pasted token.

- **Sign-in** (`OlaKit/SignIn.swift`): a random secret S; a listener on 127.0.0.1, a free port; first a
  credential-free `GET /api/device/me` (401 means sign-in exists, 404 "not open yet", so the browser
  never opens on a missing page); then the default browser at
  `<base>/#/device?challenge=<b64url(sha256(S))>&port=<port>&name=<this Mac, ≤60>&kind=mac|cli`. The
  listener answers one well-formed code (`[A-Za-z0-9._~-]{8,512}`) with a small page in the app's
  look and no outside loads, then closes; 5 minutes, then "took too long" and Try Again.
  `POST /api/device/token` (code as bearer, `{"verifier": S}`) gives the sign-in, kept as one
  Keychain item (`SecretKind.account`); the name is also in plain settings so the app can say who is
  signed in without reading the Keychain.
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
- **Screens**: `OLA_ONLY=signin tools/build.sh mac <dir>` (signed out, waiting for the browser, not
  open yet, took too long, failed, signed out by the server, choose a folder, getting ready, its
  failure, Settings signed in and out; light and dark): `~/Desktop/ola-brand/apple-shots/signin/`.

Matched to the server as built (`../README.md`, "Signing in from the Mac app and the command line"):

- **Signed out is any 401** on `/api/device/*`: the front desk's `{"error":"signed_out"}` or the door's
  401 HTML page with `WWW-Authenticate: Basic`. Never retried: ten refused passes in 15 minutes block
  the person's whole address, the web app included. Left to itself URLSession answers that Basic
  challenge by sending the request again (measured: two requests per refusal), so every request to
  app.ola.cx cancels the challenge and keeps the 401 it came with (`NoCredentials`, and the door's
  `Upstream`); no credential store is consulted. The door then answers every later request itself
  (`ModelDoor.isSignedOut`), the app forgets the sign-in and shows "You've been signed out on this Mac",
  and the `ola` command forgets it at once. `swift test` proves one request per 401 for the door (four
  requests in, one out), who-am-I, usage and the probe.
- **Cancel** on the account's page lands on `/?error=cancelled`: the listener answers "Sign-in was
  cancelled. You can close this window.", the app goes back to its signed-out screen with no error
  tone, and `ola login` prints one line, "Sign-in was cancelled.", and exits 1.
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
permissions (commands and edits ask), web commands and config, from the same OlaKit code
(`OlaKit/OlaCLI.swift`): the app's own executable in a mode that never starts the interface
(`Ola.app/Contents/MacOS/Ola --cli …`, checked before anything from AppKit or SwiftUI), so it has the
app's signature and reads the Keychain with no question; `ola` itself is a three-line launcher.

```bash
ola                    # the conversation, in this terminal (opencode 2.3.0's own interface, on Ola's server)
ola "a request"        # one request, the reply printed; also: ola run "…" (exit code: whether it worked)
ola -c                 # pick up the last conversation
ola login | logout | whoami | status | --help
```

- It starts its own `opencode serve --stdio` (it ends when the command does, a kill included) and a
  door, then opencode's interface (`opencode --server <it>`) in the terminal's foreground group
  (posix_spawn: Foundation's Process puts a child in a background group, where the interface stopped
  at once), so keys, Ctrl-C and resizing go to it. A small watcher ends the interface and the agent
  if the command itself is killed outright.
- A one-shot run cannot ask, so opencode refuses commands and edits there and says so; the
  conversation asks (Allow once / Always allow / Reject).
- **Sessions are shared with the app**: two opencode servers on one data folder were measured (a
  session made by one listed by the other; 40 writes from both at once, all kept), so the command
  uses the app's "On this Mac" store and its own config folder (the config names its door). The app
  refreshes its list when it comes to the front. The command keeps no pid file, so the app can never
  take its server for one it left behind, or end it.
- **Install**: `tools/build.sh install-mac` also runs `Ola --install-cli`, which writes the launcher
  into the first writable folder among `~/.local/bin`, `/opt/homebrew/bin`, `/usr/local/bin` that a
  login shell has on its PATH (never over someone else's `ola`) and prints where; Settings, Account,
  The ola command, Install does the same.
- **Check**: `tools/cli-selftest.sh <Ola.app>` runs it end to end against `tools/stub-ola.py` (a
  stand-in for app.ola.cx with a fake model) and `tools/stub-browser.sh`, beside the real app without
  touching it (own settings suite, scratch Application Support, throwaway Keychain names): 19 checks,
  from "not signed in" through login, whoami, status, a printed reply, the account token upstream and
  never the door key, a refused command in a one-shot run, the shared store, the interface in a
  pseudo-terminal (draws, redraws on resize, Ctrl-C ends it, a command asks and waits), a SIGKILL
  that leaves nothing running, logout, Cancel in the browser, and a sign-in the server ended: at most
  one request there, then forgotten. **Live, once the server is deployed:**
  `tools/cli-selftest.sh /Applications/Ola.app https://app.ola.cx` (the browser opens once for a
  passkey; the stand-in-only checks are skipped).

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
OlaPalette` for the chosen one), then relaunch; on the phone the same key in `cx.ola.phone`.
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
the same pose; `defaults write cx.ola.mac OlaWorking hop` (or `cx.ola.phone`) forces one, `defaults
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

## Phone notifications and inline View (2026-11-16, late)

**Notifications** go to the phone for two things only: a run finished (done, or stopped by itself) and
a run waiting for Bart (an approval). The Mac app sends them through Apple push (`OlaKit/Notify.swift`:
an ES256 token from the team's key, `cx.ola.phone` as the topic, Apple's sandbox host for debug
builds); the phone gives its push token and its two switches (Finished, Needs me) to the Mac through
the relay, and says which session is on screen (that one does not notify). The key is imported once in
Mac Settings, Phone notifications, Set Up (an open panel at the key file), and kept in the Keychain.
They come only while Ola is open on the Mac. **Blocked by Apple, not code:** the push capability
needs Push Notifications on the App ID `cx.ola.phone`, and Xcode cannot add it until Bart accepts the
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
deny the `skill` tool. What stays: the project's own `AGENTS.md` and its files. Proof:
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
  Shell commands and edits ask, as on the machine. These sessions live on the Mac; the phone does
  not see them.

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
