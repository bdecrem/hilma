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
    Keychain.swift     the address (defaults) and password (Keychain, this device only)
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
apps/activist-ai/apple/tools/build.sh mac [shots-dir]   # Mac app, ad-hoc signed; with a dir, renders its views to PNGs off screen
apps/activist-ai/apple/tools/build.sh install-mac       # copies it to /Applications/Ola.app (does not open it)
apps/activist-ai/apple/tools/build.sh sim               # iPhone app for the simulator
apps/activist-ai/apple/tools/build.sh device            # iPhone app for a device (automatic signing)
cd apps/activist-ai/apple/OlaKit && swift test          # the fold, on the web app's recordings
OLA_PASSWORD_FILE=<file> swift run olakit-selftest      # against the real server (see below)
```

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
OlaWorkingMotion full` animates anyway). Paused when scrolled away, in the background, and once a wait
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

opencode for this mode: `tools/install-local-opencode.sh` (the pinned 2.3.0, user-level, into
`~/Library/Application Support/Ola/opencode`). Proved with
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
