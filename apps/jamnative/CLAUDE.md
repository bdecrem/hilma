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

## Headless verification (no screen control)

Everything is driven with launch arguments; nothing needs a tap. The shell side is
`tooling/sim-run.sh <tag> <launch args…>` (installs the last simulator build on
"iPhone 16", launches, services the `shot:<name>` handshake into `.shots/<tag>/`,
prints the script log) and `tooling/catalyst-run.sh` for the Mac build.

```bash
# Studio: open a track and run steps (full vocabulary at the top of UI/StudioScript.swift)
tooling/sim-run.sh s-seq -autoLogin jamtest jamtest1 -openTrack "SEQ TEST techno copy" \
  -studioScript "play;wait:3;controls;tab:seq;seq:inst:jt90;seq:section:1;seq:tap:kick:2;pattern:jt90:1;shot:kick2;scope;closeControls;bounce:wav;back"
# Library: duplicate/delete, catalog + public player + remix, About (UI/LibraryScript.swift)
tooling/sim-run.sh s-lib -autoLogin jamtest jamtest1 \
  -libraryScript "list;duplicate:SEQ TEST techno copy;deleteLast;openCatalog:Exp1;player:play;wait:3;remix;closeStudio;deleteLast;about;shot:about"
```

Launch args: `-autoLogin <user> <pass>`, `-openTrack "<title>"`, `-openControls`,
`-studioScript "<steps>"`, `-libraryScript "<steps>"`, `-studioScriptLog <file>`,
`-studioShotDir <dir>`, `-studioExportDir <dir>` (where `bounce:wav|aac` writes),
`-openAbout`, `-openCatalogTrack "<title>"`, `-previewBounce`, `-mockEngine`.
Standalone harnesses (each replaces the app UI): `-engineSmoke` (+`-engineSmokeAgent`
/ `-engineSmokeBackground` / `-engineSmokeSeq`), `-seqPreview` (+`-seqScript`,
`-seqShotDir`), `-panelsPreview` (+`-panelsPreviewOpen <id|none>`, `-panelsPreviewKnob`),
`-audioSmoke`, `-exportSmoke` (+`-exportSmokeDir <dir>`; check the files with `afinfo`).

Timing evidence lives in the unified log:
`xcrun simctl spawn "iPhone 16" log show --predicate 'subsystem == "com.bartdecrem.Jambot"' --last 5m --style compact`
(categories `studio`, `cache`, `engine`, `audio`, `script`, `library`).

Catalyst window screenshots need Screen Recording access for the terminal
(`screencapture -l <window id>` otherwise says "could not create image from window");
`tooling/catalyst-run.sh` still runs the script and prints the log, and the window
bounds can be checked with a `CGWindowListCopyWindowInfo` one-liner.

## What the app does (stage 10)

Login → Library (your tracks with "…" Duplicate/Delete, "+ New track", the public
catalog "FROM EVERYONE" → read-only player with Play + Remix, gear → About) → Studio
(header: back · Share · Publish/Unpublish over the tap-to-rename title; chat with the
agent; transport: Play/Stop, "bar n/N" or "section k · bar n/N", LED strip, Bounce
(WAV / AAC share sheet), Controls). Controls sheet: Faders · Panels · Seq (remembered
in UserDefaults `jam.controlsMode`); Panels = per-synth panels with hit LEDs polled from
the engine each 16th while the tab is up; Seq = the step sequencer with section
audition ("Loop section" → `render(.section)`), edits re-render in 300 ms, autosave, and
a coalesced `[controls]` note for the next message. Renders are cached on device
(`Caches/renders/<trackId>.pcm`, keyed by session JSON + engine stamp) so reopening an
unchanged track plays instantly; the lock screen shows the track (Now Playing +
remote play/pause). Keyboard: Space play/stop, ⌘↩ send, ⌘K controls, ⌘, About.

## Device install (no Apple ID in Xcode on this Mac)

Profiles are minted through the App Store Connect API, same as Tap Tap Dodo:

```bash
python3 scripts/ios/asc-dev-profile.py com.bartdecrem.Jambot "Jambot dev" 00008150-000038820EFB801C   # once per year / new device
./bump-build.sh
xcodebuild -project Jambot.xcodeproj -scheme Jambot -destination 'generic/platform=iOS' \
  -derivedDataPath build-device CODE_SIGN_STYLE=Manual "PROVISIONING_PROFILE_SPECIFIER=Jambot dev" \
  "CODE_SIGN_IDENTITY=Apple Development" build
xcrun devicectl device install app --device 9FBCF85E-F1E3-5646-93DC-F51E897B1C27 build-device/Build/Products/Debug-iphoneos/Jambot.app
xcrun devicectl device process launch --device 9FBCF85E-F1E3-5646-93DC-F51E897B1C27 com.bartdecrem.Jambot   # phone must be unlocked
```

Bundle id `A43853Z8U5`, profile "Jambot dev" (expires 2027-09-06), certificate `9AYMK558AW` (the keychain's Apple Development: Bart Decrem). `build-device/` is gitignored.

## Branding (app icon, launch screen)

`branding/make_icon.py` (Pillow — `python3 -c "import PIL"` to check) generates the
1024×1024 source icon and every `AppIcon.appiconset` size: putty enamel background
(`#e3e4dc` with a subtle top-left light gradient + a hairline inset border), "JAMBOT"
in DIN Condensed Bold (falls back to Helvetica Bold if that font is missing), a raised
909-orange (`#ff5a1f`) glowing LED disc after the T (never a period — offset toward
cap-height, not sitting on the baseline), and a 16-step LED strip motif (orange /
cobalt / ink rows) below the wordmark. Re-run `python3 branding/make_icon.py` after
any icon tweak — it overwrites both `branding/icon-1024.png` (source of truth) and
`Jambot/Assets.xcassets/AppIcon.appiconset/icon-*.png`, plus `branding/preview-{60,120,180}.png`
for eyeballing legibility at small sizes before committing.

`Jambot/Assets.xcassets/LaunchBackground.colorset` already carries the putty light
value / near-black dark value used by `UILaunchScreen` in `project.yml` — no image,
just the background colour.

## Catalyst + keyboard shortcuts (wired in stage 10)

- `Jambot/UI/CatalystSupport.swift` — `View.catalystWindowChrome(title:)` sets the Mac
  window's min size (390×700) and a one-time default size (430×860) via
  `UIWindowScene.sizeRestrictions`; no-op on iOS/iPadOS. `View.columnWidth(_:)` /
  `ColumnWidth` centres content in a max-720pt column on regular-width layouts
  (iPad landscape, wide Catalyst window), matching `jam.css`'s wide-viewport rule.
  Applied: `.catalystWindowChrome()` on `RootView`, `.columnWidth()` on Studio and the
  Library. The default size is requested with `requestGeometryUpdate(.Mac(systemFrame:))`
  (setting the UIWindow frame did nothing on Catalyst) plus a 0.6 s retry because AppKit's
  window restoration can land after the first appearance.
- `Jambot/UI/KeyboardShortcuts.swift` — `View.jambotSendShortcut(action:)` (⌘↩),
  `.jambotControlsShortcut(action:)` (⌘K), `.jambotAboutShortcut(action:)` (⌘,),
  `.jambotPlayStopShortcut(action:)` (Space — attach only where a focused text field
  isn't competing for Space). Each is a zero-size hidden button carrying the shortcut.
  Wired: Space + ⌘K + ⌘↩ in `StudioView` (Space only while the composer isn't focused),
  ⌘, in `LibraryView`.
- `Theme.swift` gained `JBTheme.PanelPalette` (`.jb202/.jt30/.jt10/.jt90/.jb01/.fx`) —
  exact port of `src/app/jam/alt/panels-mobile.css` `[data-skin]` colours
  (`background`/`accent`/`dim`/`rule`/`label`) for whoever builds the Panels tab.

Verifying the Catalyst window visually from the shell hit a wall: `System Events`
enumerates 0 windows for the running Catalyst process even with "UI elements enabled"
true system-wide — likely Terminal itself lacks an Accessibility grant, which would
need an interactive permission prompt (out of scope — no screen control). The Catalyst
*build* is verified (`** BUILD SUCCEEDED **`) and the process launches and stays
running; the window-chrome sizing itself is unverified visually pending someone with
Accessibility access to Terminal, or a future stage's screenshot from an actual
attached window id.
