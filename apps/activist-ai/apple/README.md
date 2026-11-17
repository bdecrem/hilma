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

"Paper under the lamp" (`~/Desktop/ola-brand/app/spec.md`): the window is the evening-blue room, and
what you read is paper laid on it; lamp yellow only for what is running; vermilion only for what needs
Bart (an approval, a failed step, a session that finished unseen). Bricolage Grotesque for the
interface, Literata for what Ola writes, IBM Plex Mono for details, bundled from Google Fonts (OFL)
as static instances (`tools/instance-fonts.py`). Dark mode keeps the room and turns the paper into
lamp-lit dark paper. Two looks were drawn side by side (`mac-A-sheet-*` and `mac-B-flush-*` in
`~/Desktop/ola-brand/apple-shots/`): A, paper sheets on the room, was chosen; B, a flush native split,
is kept as `Treatment.flush` in `Mac/MacRoot.swift`.

The Mac screenshots come from `Ola -OlaSnapshot <dir>`: the app draws its own views (the sidebar,
conversation and files panel, with a drawn title line in place of the real toolbar, since the system's
glass sidebar and toolbar do not draw off screen) into PNGs, with made-up data, and exits; it never
shows a window or becomes active. The iPhone app takes `-OlaFixture <main|approval|empty|unreachable>`
and `-OlaOpen` for simulator screenshots.

## Plain HTTP over Tailscale (App Transport Security)

The machine is reached by plain HTTP over the tailnet (WireGuard encrypts it). Both apps allow plain
HTTP only to local addresses (`NSAllowsLocalNetworking`) and to Tailscale names (`*.ts.net`,
`NSExceptionDomains` with `NSExceptionAllowsInsecureHTTPLoads`); everything else still needs HTTPS.
ATS cannot name an IP address: in the simulator `http://100.95.51.98:4310` was refused and the
Tailscale name worked, so the connect sheet is prefilled with
`http://admins-mac-mini.tailde799a.ts.net:4310` (the same server). On the Studio, type its name.

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
