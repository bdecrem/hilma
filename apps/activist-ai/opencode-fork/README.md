# Ola's opencode: the terminal interface with Ola's name on it

`ola` in a terminal shows opencode's own interface. Stock opencode draws its logo and says "OpenCode" there;
this folder builds the same program with Ola's wordmark, window title and a few sentences (2026-11-17, Bart:
"I like the idea of using OLA logo and wording"). Tracker: OLA-113.

**The fork is cosmetic and stays cosmetic.** Everything Ola does differently (the account, the door, skills,
permissions, which models) is config and OlaKit, never a change here. A behavior change in this folder turns
an hour of upkeep per opencode release into a real fork; put it in config or ask upstream instead.

There is no copy of opencode's source in this repo. The fork is a few small files:

| File | What |
|---|---|
| `UPSTREAM` | the opencode release Ola is built from: repo, tag, the tag's commit, the npm package |
| `rebrand.mjs` | every change, as exact text to replace and how many times it must appear (the logo in `packages/tui/src/logo.ts`, the window title, "Tell Ola what to do differently", "close Ola", "restart Ola", "Ola crashed"). If upstream reworded or moved one it stops with `patches no longer apply: <file>: <text>` |
| `build.sh` | fresh checkout of the pinned commit, the bun version opencode's `package.json` names, `rebrand.mjs`, opencode's own build → `dist/<target>/opencode` with `LICENSE` and `BUILD` |
| `stage.sh` | hands the built programs to the Mac app's build, and checks a built app carries them |
| `check-upstream.sh` | the daily check (below) |

```bash
./build.sh                          # this Mac's architecture, about four minutes the first time
./build.sh darwin-arm64 darwin-x64  # both Macs
dist/darwin-arm64/opencode --version
```

Source and bun live under `~/Library/Caches/ola-opencode-fork` (`OLA_OPENCODE_CACHE`), about 2 GB; safe to
delete. `dist/` is not committed (a 220 MB binary per target). The build refuses a tag whose commit is not the
one in `UPSTREAM`, and checks that the binary carries Ola's words.

**License.** opencode is MIT. `dist/<target>/LICENSE` is its notice and travels with the binary; when the
binary goes into the Mac app, the notice goes into the bundle and the app's credits: About Ola shows it
(`apple/Mac/Credits.rtf`, opencode's text word for word; update it if their LICENSE changes. An RTF with no color table, so the panel's own text color applies in light and dark: the HTML version before it came out black on near-black in dark mode in the 0.1 (4) check on another Mac, though white on this M4 under macOS 27. `Ola\'92s` is the apostrophe in the file's cp1252), and `ola --version`
names opencode and its license.

**Which Ola this is (2026-11-18, OLA-152).** The home screen's corner shows "Ola 0.1 (11)" where opencode
shows its own version, and `/version` says "Ola 0.1 (11), built on opencode 2.3.2". Both read `OLA_VERSION`,
which the `ola` command sets from the app's version and build (`OlaCLI.versionText`); `ola --version` prints
the same. Display only: the one command added here does nothing but show that line.

Left as opencode on purpose: internal ids (`opencode.settings`, the theme named `opencode`), the provider
names "OpenCode Go" / "OpenCode Console" (their products), the update dialog, the `opencode` binary name and
its `--help`. The line printed when a conversation ends says `Continue  ola -c`.

## In the Mac app (since 2026-11-17)

The app carries both programs in `Contents/Helpers` (`ola-opencode-arm64`, `ola-opencode-x86_64`, about
230 MB each) and runs the one for its processor from there (`OlaKit LocalServer.bundledBinary`), for "On this
Mac" and for the `ola` command; nothing is downloaded on first run any more. opencode's MIT notice and the
tag, commit and rebrand hash ride in `Contents/Resources` (`opencode-LICENSE.txt`, `opencode-source.txt`).
The copy the app used to download into Application Support is still the fallback when OlaKit runs outside
the app (self-tests, `swift run`).

- `stage.sh stage <dir>` puts the two programs and the notes where the build picks them up
  (`apple/build/OlaOpencode`), building first if `dist/` is missing or was made from another tag or another
  `rebrand.mjs`; `stage.sh verify <Ola.app>` refuses an app that carries anything else. `apple/tools/build.sh
  mac` and `apple/testflight/ship-via-mini.sh` do both, so the first build on a machine takes about eight
  minutes longer and the later ones a copy.
- **The signed download.** Under the hardened runtime a Bun program needs entitlements of its own
  (`apple/Mac/OlaOpencode.entitlements`: JIT, unsigned executable memory, library validation off). The ship
  script signs each program with them before it signs the app, and after the Developer ID export checks that
  each still has the hardened runtime and the entitlements and that this Mac's one starts. Proven with
  0.1 (3) on 2026-11-17: the Developer ID export kept the entitlements, Apple notarized and stapled the app
  and the disk image, no workaround. The disk image is 233 MB with the two programs inside.
- `apple/tools/cli-selftest.sh <Ola.app>` passes against a build that carries it (21 of 21, 2026-11-17).

## The daily check

```bash
apps/activist-ai/opencode-fork/check-upstream.sh
```

One line, and an exit code: `0` up to date; `1` a new release and Ola's changes apply to it cleanly; `2` a new
release and they no longer apply (the line names the sentence); `3` could not check. It reads the version from
npm and, only when there is a new one, fetches that tag and dry-runs `rebrand.mjs`. It builds nothing.

## Moving to a new release

Ola pins one opencode version everywhere (`apps/activist-ai/package.json`, the workspace image, this folder),
so moving is one decision for all of them, not something the daily check does by itself.

1. `check-upstream.sh` says a release is out. Read opencode's `CHANGELOG.md` for it.
2. Exit 2: fix the named line in `rebrand.mjs` (find the sentence's new home or wording in the new source).
   Also grep the new `packages/tui/src` for `OpenCode` in text a person reads and add what is new.
3. Put the new tag and its commit (`git ls-remote --tags <repo> v<version>`) in `UPSTREAM`, run `./build.sh`,
   look at the interface in a terminal.
4. Move the rest of Ola to the same version (the lead's call: `package.json`, the image tag, the suites), then
   `apple/tools/cli-selftest.sh` against an app that carries the new binary.
