# Jambot native (iOS + Mac Catalyst) — build/run playbook

Read `DESIGN.md` first (architecture, bridge contract, screens) and
`PROGRESS.md` (what's done, what's next). This file is the mechanical
how-to; those two are the source of truth for what the app should do.

## Setup

```bash
cd apps/jamnative
cp Jambot/Secrets.swift.example Jambot/Secrets.swift   # gitignored; defaults to https://jambot.to
xcodegen generate
```

`project.yml` is the source of truth; `.xcodeproj` is generated and
committed like Feynd's. Re-run `xcodegen generate` after adding/removing
files or changing `project.yml`.

## Build

```bash
# iOS Simulator
xcodebuild -project Jambot.xcodeproj -scheme Jambot \
  -destination 'platform=iOS Simulator,name=iPhone 16' build

# Mac Catalyst
xcodebuild -project Jambot.xcodeproj -scheme Jambot \
  -destination 'platform=macOS,variant=Mac Catalyst' build

# Device/signing sanity (arm64-specific issues the simulator misses)
xcodebuild -project Jambot.xcodeproj -scheme Jambot \
  -destination 'generic/platform=iOS' build
```

Must print `** BUILD SUCCEEDED **` before declaring anything done.

## Simulator run loop

```bash
xcrun simctl boot "iPhone 16"                     # skips if already booted
xcrun simctl install "iPhone 16" <DerivedData>/Build/Products/Debug-iphonesimulator/Jambot.app
xcrun simctl launch "iPhone 16" com.bartdecrem.Jambot
xcrun simctl io "iPhone 16" screenshot apps/jamnative/.shots/whatever.png
```

`<DerivedData>` — find it with:
```bash
xcodebuild -project Jambot.xcodeproj -scheme Jambot -showBuildSettings \
  -destination 'platform=iOS Simulator,name=iPhone 16' 2>/dev/null | grep -m1 BUILT_PRODUCTS_DIR
```

Screenshots go under `apps/jamnative/.shots/` (gitignored) — never outside
this folder.

## Rules (see also the top-level task brief this project was scaffolded from)

- Never name an app-bundle subfolder "Resources" — breaks device codesign.
- `ENABLE_DEBUG_DYLIB: NO` always — Bart's phone runs an iOS beta where the
  debug-dylib stub launch path black-screens at startup.
- Run `./bump-build.sh` before any build that lands on a device.
- Backend is **production** (`jambot.to`). Only sign in as `jamtest` /
  `jamtest1` from the simulator or a dev build — never Bart's own account
  (`bart`) from anything but the shipped, reviewed app.
- Don't touch `../../public/jam/jambot-web.js` from this app — it's hilma's
  committed engine bundle, referenced by path in `project.yml`. If it needs
  to change, that happens in hilma (`pnpm jam:build`), not here.

## Where the engine bundle comes from

`Jambot/Engine/` holds `engine.html` + `engine-bridge.js`, loaded into a
hidden `WKWebView` alongside `jambot-web.js` — which `project.yml`
references directly from `../../public/jam/jambot-web.js` (hilma's build
output) rather than copying it in. After any jambot change that should reach
this app, someone runs `pnpm jam:build` in hilma, commits the refreshed
bundle, and the next Jambot native build picks it up automatically (no
change needed here).

## Verify checklist (full detail in `DESIGN.md` → "Verify")

1. `xcodegen generate`
2. iOS Simulator build succeeds
3. Catalyst build succeeds
4. Simulator: launch shows the placeholder/real screen for whatever stage is
   current; screenshot to `.shots/`
5. Once the real engine + screens land (stage 3): sign in as `jamtest`, open
   "SEQ TEST techno copy", Play, move a fader, send a chat message
6. Background-audio go/no-go: start playback, background the app, confirm
   audio continues; trigger a render while backgrounded and confirm it
   completes
