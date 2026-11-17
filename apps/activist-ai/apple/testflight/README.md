# Shipping Ola: the iPhone app on TestFlight, the Mac app as a signed download

Set up 2026-11-17. Bart: "create a test flight setup, and test flight builds for the macOS and the iOS
apps", once he has accepted Apple's updated Program License Agreement.

## The one command

```bash
apps/activist-ai/apple/bump-build.sh && git commit -am "ola apple: build N"   # every ship takes a new build number
node apps/activist-ai/apple/testflight/asc-setup.mjs                             # first time only; safe to rerun
apps/activist-ai/apple/testflight/ship-via-mini.sh both                          # or ios, or mac
DRY=1 apps/activist-ai/apple/testflight/ship-via-mini.sh both                    # everything that needs no Apple server
```

- **`asc-setup.mjs`** (App Store Connect API, key `748UX45NAP` on this iMac): registers `cx.ola.phone`
  and `cx.ola.mac`, turns on Push Notifications for the phone, makes the app record "Ola" (SKU
  `cx-ola-phone`, English (U.S.); if the name is taken, "Ola: private AI agent"), the internal group
  "Ola internal" (every build) with the Account Holder in it, and mints the IOS_APP_STORE profile
  "ola phone appstore m1" for this iMac's Apple Distribution certificate, after push is on. One line
  per step: OK, MADE, WAITING, REFUSED (with Apple's words) or TODO. If the API will not create the app
  record, it prints the web form's fields; fill them once and rerun.
- **`ship-via-mini.sh`** checks the mini has 10 GB free, syncs `apple/` (with the generated
  `Ola.xcodeproj`, since the mini has no xcodegen) and `workspace/` to `~/ola-ship`, archives there
  unsigned with the release Xcode (26.3; App Store Connect refuses this iMac's beta SDK), copies the
  archive back, checks the build number, `ITSAppUsesNonExemptEncryption = false` and the privacy
  manifest, and then:
  - **ios**: signs the app here with Apple Distribution and the release entitlements (push:
    `production`), exports with the profile and uploads, then `asc-submit.mjs` waits for processing
    (usually 5 to 20 minutes) and confirms the build is in "Ola internal". Internal testers need no
    beta review. Bart installs it from the TestFlight app on his phone.
  - **mac**: signs with Developer ID and the hardened runtime, makes `Ola-<version>-<build>.dmg`,
    notarizes it (usually 2 to 10 minutes), staples it, checks Gatekeeper accepts it, and publishes it
    with `latest.json` to `public/ola-site/mac/` (commit and push; live at
    `https://ola.cx/ola-site/mac/Ola-<version>-<build>.dmg` about 3 minutes later). The app's Ola menu,
    Check for Updates… reads `latest.json` (`Mac/UpdateCheck.swift`), and the app looks once a day on
    its own, speaking only when a newer build is out.
- **Export compliance:** both apps use only HTTPS and the system's encryption, so both Info.plists say
  `ITSAppUsesNonExemptEncryption = false` and App Store Connect asks nothing per build.
- **Privacy manifest:** `Shared/PrivacyInfo.xcprivacy` (no tracking; UserDefaults for the app's own
  settings, CA92.1). ElevenLabs and LiveKit carry their own.
- **The build number** shows in the phone's Settings, About and in the Mac's Ola menu, About Ola.

## Why the Mac app is not on TestFlight

TestFlight and the Mac App Store take only sandboxed apps. Measured 2026-11-17 with a sandboxed probe
app signed the way the App Store build would be (app sandbox, user-selected files, network client and
server; opencode 2.3.0 inside the bundle, signed to inherit the sandbox, JIT allowed), given a folder
the way a picked folder arrives:

| What "On this Mac" needs | In the sandbox |
|---|---|
| opencode, bundled in the app | runs (`opencode v2.3.0`) |
| read and write the picked folder, from the agent's shell | works |
| `ls`, `awk`, `zsh`, `curl` (outgoing network) | work |
| `git`, `python3` (Xcode's command-line tools) | refused: `xcrun: error: cannot be used within an App Sandbox.` |
| Homebrew's `node`, anything in `/opt/homebrew` | refused: `Operation not permitted` |
| `claude` (Claude Code in `~/.local/bin`, "Fallback to Claude") | refused: `Operation not permitted` |
| run a script by its path, even one already in the person's folder (`./build.sh`) | refused: `bad interpreter: Operation not permitted` |
| a script the app writes and runs (Ola's web commands: `ola-search`, `ola-fetch`, … in Python) | refused |
| the `ola` command in `~/.local/bin` | cannot be written |

So inside the sandbox the agent could only read and edit files: no git, no Python, no Node, no
scripts, no web search, no Claude fallback. That is not "On this Mac". Developer tools of this kind
(Claude Code, Cursor, VS Code) ship as a signed, notarized download for the same reason, and that is
what `ship-via-mini.sh mac` makes. A sandboxed Mac build for TestFlight would be possible only as a
client of the Ola machine, with "On this Mac", Fallback to Claude and the `ola` command removed; not
built, since it would weaken the app.

**Licenses, if opencode is ever bundled:** opencode is MIT (`@opencode/cli-darwin-arm64`, a 224 MB
single executable with the Bun runtime inside, also MIT). Today the app fetches it on first use into
Application Support (`OlaKit/OpencodeInstall.swift`), which a Developer ID app may do; nothing to bundle.

## What Apple refused on 2026-11-17

Every App Store Connect API call, reads included, returned `403
FORBIDDEN.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED` ("This request requires an in-effect agreement that has
not been signed or has expired"): bundle ids, push, the app record, users, certificates, profiles. So the
group, the tester and the profile wait too. The export (`xcodebuild -exportArchive`, automatic
provisioning with the key) stops at "Unable to process request - PLA Update available" and "No profiles
for 'cx.ola.phone' were found"; the notary service answers 403 "A required agreement is missing or has
expired". Accepting the
agreement (developer.apple.com, Account, the "Program License Agreement" banner, as the Account Holder)
clears all of it; then run the commands above.

**What did pass on 2026-11-17 (`DRY=1 … both`):** both apps archive on the mini's Xcode 26.3 (after
two fixes the older compiler and xcodegen needed: an expression in `Shared/WorkingArt.swift` split up,
and the version strings driven by `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION`, which were fixed at
1.0 (1)); the iPhone app signs with Apple Distribution and verifies, with `aps-environment =
production`, its icon and the privacy manifest; the Mac app signs with the hardened runtime, makes a
3.7 MB disk image, and the release build starts and draws all 61 of its screens off screen.

**After the agreement (2026-11-17, afternoon).** Apple's API took a few minutes to follow Bart's
acceptance (calls were refused, then half refused, then all through). The API cannot create an app
record ("The resource 'apps' does not allow 'CREATE'"): Bart makes it once with the fields above.
The Mac download shipped as 0.1 (2): Developer ID through Xcode's cloud certificate (no click), with
passkeys (`webcredentials:app.ola.cx`, a Developer ID profile the export makes), the app and the disk
image each notarized and stapled; the disk image has no signature of its own, so the script checks its
ticket (`stapler validate`) and Gatekeeper checks the app inside. The stapled app is also zipped to
`~/Desktop/Ola/mac-download/Ola.zip`. The script syncs every `../<dir>` project.yml names (`bart/`
for `ola-page-mac`) and stages the bundled skills; it refuses an archive whose skills are not HEAD's,
so do not commit while a Mac ship runs.

**The Developer ID certificate:** this iMac has none. Without one, the `mac` ship signs through Xcode's
cloud-managed Developer ID (Bart's Apple ID is in Xcode-beta here), which needs no click. If that is
refused, once: Xcode, Settings, Accounts, Manage Certificates, +, Developer ID Application; the script
then finds and uses it.
