import AppKit
import OlaKit
import SwiftUI

/// `Ola -OlaSnapshot <dir>`: draws the main views with made-up data into PNG files and exits.
/// The windows are made off screen and never shown or brought forward, and the app never becomes
/// active, so this can run while someone works at the Mac.
@MainActor
enum Snapshot {
  static var outputDirectory: URL? {
    let args = CommandLine.arguments
    guard let i = args.firstIndex(of: "-OlaSnapshot"), i + 1 < args.count else { return nil }
    return URL(fileURLWithPath: args[i + 1])
  }

  static func run(to dir: URL) {
    let app = NSApplication.shared
    app.setActivationPolicy(.prohibited)
    // Never the Keychain, never the app's own sign-in (2026-11-19: a WhereOlaWorks drawn here read
    // the real account's session and macOS asked for the Keychain on Bart's screen).
    SecretStore.disabled = true
    AccountKeeper.defaults = UserDefaults(suiteName: "cx.ola.mac.snapshot")!
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let chosen = Treatment.plain
    let shots: [(String, String, Treatment, NSAppearance.Name, CGSize)] = [
      // The chosen look.
      ("mac-conversation-light", "main", chosen, .aqua, CGSize(width: 1440, height: 900)),
      ("mac-conversation-dark", "main", chosen, .darkAqua, CGSize(width: 1440, height: 900)),
      ("mac-approval-light", "approval", chosen, .aqua, CGSize(width: 1440, height: 900)),
      ("mac-approval-dark", "approval", chosen, .darkAqua, CGSize(width: 1440, height: 900)),
      ("mac-new-session", "empty", chosen, .aqua, CGSize(width: 1200, height: 760)),
      ("mac-unreachable", "unreachable", chosen, .aqua, CGSize(width: 1200, height: 760)),
      ("mac-narrow", "approval", chosen, .aqua, CGSize(width: 900, height: 640)),
      ("mac-reactions-light", "reactions", chosen, .aqua, CGSize(width: 1440, height: 1100)),
      ("mac-view-items-light", "results", chosen, .aqua, CGSize(width: 1440, height: 1100)),
      ("mac-view-items-dark", "results", chosen, .darkAqua, CGSize(width: 1440, height: 1100)),
      ("mac-reactions-dark", "reactions", chosen, .darkAqua, CGSize(width: 1440, height: 1100)),
    ]
    let only = CommandLine.arguments.firstIndex(of: "-OlaOnly").map { CommandLine.arguments[$0 + 1] }
    for (name, fixture, treatment, appearance, size) in shots where only == nil || name.contains(only!) {
      let store = OlaStore(fixture: Fixture.named(fixture))
      let root = SnapshotFrame(store: store, treatment: treatment).environment(\.treatment, treatment)
      write(root, size: size, appearance: appearance, to: dir.appendingPathComponent("\(name).png"), titled: false)
    }
    // New Session (OLA-143): the list with both runtimes' sessions, and the chooser in its states.
    if only == nil || "mac-runtimes".contains(only!) || only == "runtimes" {
      let cloud = OlaStore(fixture: Fixture.main)
      cloud.previewAs(.cloud)
      let local = OlaStore(fixture: Fixture.named("results"))
      local.previewAs(.local)
      write(SnapshotFrame(store: cloud, treatment: chosen, peer: local).environment(\.treatment, chosen), size: CGSize(width: 1440, height: 900), appearance: .aqua, to: dir.appendingPathComponent("mac-runtimes-sessions.png"), titled: false)
      // The empty session in each runtime (OLA-207: where it works, and who else sees it).
      for r in [Runtime.cloud, .local] {
        let empty = OlaStore(fixture: Fixture.named("empty"))
        empty.previewAs(r)
        write(SnapshotFrame(store: empty, treatment: chosen).environment(\.treatment, chosen), size: CGSize(width: 1200, height: 760), appearance: .aqua, to: dir.appendingPathComponent("mac-runtimes-empty-\(r.rawValue).png"), titled: false)
      }
      let states: [(String, [Runtime: String?])] = [
        ("mac-runtimes-chooser", [.cloud: nil, .local: nil]),
        ("mac-runtimes-chooser-local-not-set-up", [.cloud: nil, .local: "Choose the folder Ola works in first."]),
      ]
      for (name, preview) in states {
        for (mode, appearance) in [("light", NSAppearance.Name.aqua), ("dark", .darkAqua)] {
          let sheet = NewSessionSheet(whereOla: WhereOlaWorks(store: cloud), done: {}, preview: preview)
          write(sheet, size: CGSize(width: 440, height: 240), appearance: appearance, to: dir.appendingPathComponent("\(name)-\(mode).png"), titled: false, fit: true)
        }
      }
    }
    // Settings, in each of its states, at the window's own width. Its own defaults suite, so the
    // app's real setting is never read or written.
    let defaults = UserDefaults(suiteName: "cx.ola.mac.snapshot")!
    // Everything below reads and writes this suite only, never the app's own settings.
    LocalSettings.defaults = defaults
    let settings: [(String, String, String?, NSAppearance.Name, SettingsLook)] = [
      ("dir-A-settings", "mac", nil, .aqua, .native),
      ("dir-B-settings", "mac", nil, .aqua, .paper),
      ("mac-settings-machine", "machine", nil, .aqua, .native),
      ("mac-settings-mac", "mac", nil, .aqua, .native),
      ("mac-settings-mac-problem", "mac", "Ola cannot read ~/Documents/court-watch. Allow it in System Settings, Privacy and Security, Files and Folders, then Try Again.", .aqua, .native),
      ("mac-settings-mac-dark", "mac", nil, .darkAqua, .native),
    ]
    for (name, mode, problem, appearance, look) in settings where only == nil || name.contains(only!) {
      defaults.set(mode == "mac" ? Runtime.local.rawValue : Runtime.cloud.rawValue, forKey: LocalSettings.shownKey)
      defaults.set(mode == "mac", forKey: "ola.phone.enabled")
      defaults.set(NSHomeDirectory() + "/Documents/court-watch", forKey: LocalSettings.folderKey)
      let store = OlaStore(fixture: Fixture.main)
      let controller = WhereOlaWorks(store: store)
      controller.problem = problem
      let view = SettingsView(store: store, whereOla: controller, phoneLink: PhoneLink(store: store), tokenKnown: true, look: look).defaultAppStorage(defaults)
      write(view, size: SettingsView.snapshotSize, appearance: appearance, to: dir.appendingPathComponent("\(name).png"), titled: false, fit: true)
    }
    // Permissions (General pane), each choice: apple-shots/permissions.
    for (name, mode) in [("mac-settings-permissions-lots", PermissionMode.lots), ("mac-settings-permissions-ask", .ask)] where only == nil || name.contains(only!) {
      defaults.set(Runtime.local.rawValue, forKey: LocalSettings.shownKey)
      defaults.set(mode.rawValue, forKey: PermissionSettings.key)
      let store = OlaStore(fixture: Fixture.main)
      var view = SettingsView(store: store, whereOla: WhereOlaWorks(store: store), tokenKnown: true)
      view.only = .general
      write(view.defaultAppStorage(defaults), size: SettingsView.snapshotSize, appearance: .aqua, to: dir.appendingPathComponent("\(name).png"), titled: false, fit: true)
    }
    defaults.removeObject(forKey: PermissionSettings.key)
    // The Cloud group (OLA-210): one status line, Connect Again only when not connected.
    for (state, fixture) in [("connected", "main"), ("not-connected", "unreachable")] {
      for (mode, appearance) in [("light", NSAppearance.Name.aqua), ("dark", .darkAqua)] {
        let name = "mac-settings-cloud-\(state)-\(mode)"
        guard only == nil || name.contains(only!) else { continue }
        // The cloud on screen, so the cloud store is the fixture's.
        defaults.set(Runtime.cloud.rawValue, forKey: LocalSettings.shownKey)
        defaults.set(NSHomeDirectory() + "/Documents/court-watch", forKey: LocalSettings.folderKey)
        let store = OlaStore(fixture: Fixture.named(fixture))
        let account = AccountController(preview: .idle, name: "Bart Decrem")
        // The fixture's store on both sides, so the Cloud group shows it whichever runtime is on screen.
        var view = SettingsView(store: store, whereOla: WhereOlaWorks(store: store, peer: store, account: account), account: account, tokenKnown: true)
        view.only = .general
        write(view.defaultAppStorage(defaults), size: SettingsView.snapshotSize, appearance: appearance, to: dir.appendingPathComponent("\(name).png"), titled: false, fit: true)
      }
    }
    // Ola's skills in Settings (apple-shots/skills), light and dark, from the bundled skills' own
    // files when the app carries them, the states made up so every kind shows.
    let other = OlaSkills.Version(hash: "0123456789abcdef", commit: "fedcba9876543210")
    let variants: [(String, NSAppearance.Name, OlaSkills.Version?)] = [("same-light", .aqua, OlaSkills.version()), ("same-dark", .darkAqua, OlaSkills.version()), ("different-light", .aqua, other), ("unknown-light", .aqua, nil)]
    for (mode, appearance, machine) in variants where only == nil || "skills-settings-\(mode)".contains(only!) || only == "skills" {
      defaults.set(Runtime.local.rawValue, forKey: LocalSettings.shownKey)
      defaults.set(false, forKey: "ola.phone.enabled")
      defaults.set(NSHomeDirectory() + "/Documents/court-watch", forKey: LocalSettings.folderKey)
      let store = OlaStore(fixture: Fixture.main)
      let skills = OlaSkills.read()
      let states: [OlaSkills.State] = skills.map { s in
        OlaSkills.State(skill: s, missing: s.name == "report" ? s.needs.filter { if case .command = $0 { return true } else { return false } } : [])
      }
      let info = SkillsInfo(preview: OlaSkills.version(), states: states, machine: OlaSkills.compare(OlaSkills.version(), machine))
      let view = SettingsView(store: store, whereOla: WhereOlaWorks(store: store), tokenKnown: true, skills: info).defaultAppStorage(defaults)
      write(view, size: SettingsView.snapshotSize, appearance: appearance, to: dir.appendingPathComponent("skills-settings-\(mode).png"), titled: false, fit: true)
    }
    // Signing in and the first run (apple-shots/signin), light and dark: every screen before the
    // window, and Settings with the Account section. Made-up names, no Keychain, no network.
    for (mode, appearance) in [("light", NSAppearance.Name.aqua), ("dark", .darkAqua)] {
      let window = CGSize(width: 1100, height: 720)
      let gates: [(String, AnyView)] = [
        ("signin-1-signed-out", AnyView(SignInScreen(account: AccountController(preview: .idle)))),
        ("signin-1b-signing-in", AnyView(SignInScreen(account: AccountController(preview: .working)))),
        ("signin-1c-wrong-password", AnyView(SignInScreen(account: AccountController(preview: .problem(AccountError.wrongPassword.errorDescription!))))),
        ("signin-1d-service-down", AnyView(SignInScreen(account: AccountController(preview: .problem(AccountError.serviceDown.errorDescription!))))),
        ("signin-2-passkey-sheet", AnyView(SignInScreen(account: AccountController(preview: .passkey)))),
        ("signin-2b-passkey-not-in-this-version", AnyView(SignInScreen(account: AccountController(preview: .problem(AccountError.passkeysNotInThisVersion.errorDescription!), passkeys: false)))),
        ("signin-2c-signed-out-no-passkeys", AnyView(SignInScreen(account: AccountController(preview: .idle, passkeys: false)))),
        ("signin-1e-passkey-used-here", AnyView(SignInScreen(account: AccountController(preview: .idle, passkeyUsed: true)))),
        ("signin-4-not-open-yet", AnyView(SignInScreen(account: AccountController(preview: .notice(AccountError.notAvailableYet.errorDescription!))))),
        ("signin-4b-failed", AnyView(SignInScreen(account: AccountController(preview: .problem(AccountError.unreachable.errorDescription!))))),
        ("signin-5-expired", AnyView(SignInScreen(account: AccountController(preview: .expired)))),
        ("signin-6-choose-folder", AnyView(FolderScreen {})),
        ("signin-7-installing", AnyView(InstallScreen(fraction: 0.42, problem: nil) {})),
        ("signin-8-install-failed", AnyView(InstallScreen(fraction: nil, problem: OpencodeInstall.Failure.download.errorDescription) {})),
      ]
      for (name, view) in gates where only == nil || name.contains(only!) {
        write(view, size: window, appearance: appearance, to: dir.appendingPathComponent("\(name)-\(mode).png"), titled: false)
      }
      let accounts: [(String, AccountController, CLIInstaller, String)] = [
        ("signin-9-settings-signed-in", AccountController(preview: .idle, name: "Bart Decrem"), CLIInstaller(result: "Installed. In Terminal, go to a folder and type ola.", installed: true), "mac"),
        ("signin-9-settings-signed-out", AccountController(preview: .idle), CLIInstaller(installed: false), "machine"),
        ("signin-9b-settings-passkey-added", AccountController(preview: .idle, name: "Bart Decrem", passkeyNote: ("Your passkey is added. Next time, sign in with Touch ID if you like.", false)), CLIInstaller(installed: true), "mac"),
        ("signin-9c-settings-passkey-not-fresh", AccountController(preview: .idle, name: "Bart Decrem", passkeyNote: (AccountError.notFresh.errorDescription!, true)), CLIInstaller(installed: true), "mac"),
      ]
      for (name, account, cli, where_) in accounts where only == nil || name.contains(only!) {
        defaults.set(where_ == "mac" ? Runtime.local.rawValue : Runtime.cloud.rawValue, forKey: LocalSettings.shownKey)
        defaults.set(false, forKey: "ola.phone.enabled")
        defaults.set(NSHomeDirectory() + "/Documents/court-watch", forKey: LocalSettings.folderKey)
        let store = OlaStore(fixture: Fixture.main)
        account.previewUsage = account.signedIn ? "You\u{2019}ve used 42% of this week\u{2019}s share. It starts again Monday." : nil
        let controller = WhereOlaWorks(store: store, account: account)
        var settings = SettingsView(store: store, whereOla: controller, phoneLink: PhoneLink(store: store), account: account, cli: cli, tokenKnown: true)
        settings.only = .account // the Account pane itself (sign-in, the passkey option, the command)
        write(settings.defaultAppStorage(defaults), size: SettingsView.snapshotSize, appearance: appearance, to: dir.appendingPathComponent("\(name)-\(mode).png"), titled: false, fit: true)
      }
    }
    // Settings as a Mac settings window (apple-shots/settings): every pane, in the two layouts
    // compared (A, a toolbar of panes, chosen; B, a sidebar), light and dark; the Models pane with
    // both fallbacks on. And the conversation with both fallbacks and the stretch card.
    for (mode, appearance) in [("light", NSAppearance.Name.aqua), ("dark", .darkAqua)] {
      for (name, fixture) in [("mac-fallbacks", "fallbacks"), ("mac-fallbacks-ask-claude", "ask-claude")] where only == nil || name.contains(only!) {
        let store = OlaStore(fixture: Fixture.named(fixture))
        write(SnapshotFrame(store: store, treatment: chosen).environment(\.treatment, chosen), size: CGSize(width: 1440, height: 1100), appearance: appearance, to: dir.appendingPathComponent("\(name)-\(mode).png"), titled: false)
      }
      // The engine pull-down beside the send button (OLA-155) with one, two and three engines on,
      // one with Claude chosen, and "Try again with" under Ola's answer (OLA-156).
      let engines: [(String, Bool, Bool, Turn.Engine)] = [
        ("mac-engines-1-ola-only", false, false, .ola), ("mac-engines-2-ola-claude", true, false, .ola),
        ("mac-engines-3-all", true, true, .ola), ("mac-engines-3-claude-chosen", true, true, .claude),
      ]
      for (name, claude, hosted, next) in engines where only == nil || name.contains(only!) {
        let store = OlaStore(fixture: Fixture.named("fallbacks"))
        store.suggestion = nil
        store.claudeOn = claude
        store.hostedOn = hosted
        store.nextEngine = next
        write(SnapshotFrame(store: store, treatment: chosen).environment(\.treatment, chosen), size: CGSize(width: 1440, height: 900), appearance: appearance, to: dir.appendingPathComponent("\(name)-\(mode).png"), titled: false)
      }
      // The working figure on the Mac: always the comma (OLA-154), on the run line and large.
      for (name, large) in [("mac-working-comma-line", false), ("mac-working-comma-large", true)] where only == nil || name.contains(only!) {
        let store = OlaStore(fixture: Fixture.named("approval"))
        if var c = store.conversation { c.approval = nil; store.previewSet("s1", c, running: true) }
        let view = SnapshotFrame(store: store, treatment: chosen).environment(\.treatment, chosen)
          .environment(\.workingClock, 2.4).environment(\.workingLarge, large)
        write(view, size: CGSize(width: 1440, height: 900), appearance: appearance, to: dir.appendingPathComponent("\(name)-\(mode).png"), titled: false)
      }
      defaults.set(Runtime.local.rawValue, forKey: LocalSettings.shownKey)
      defaults.set(true, forKey: "ola.phone.enabled")
      defaults.set(NSHomeDirectory() + "/Documents/court-watch", forKey: LocalSettings.folderKey)
      let store = OlaStore(fixture: Fixture.main)
      let account = AccountController(preview: .idle, name: "Maria L.")
      account.previewUsage = "You\u{2019}ve used 42% of this week\u{2019}s share. It starts again Monday."
      let controller = WhereOlaWorks(store: store, account: account)
      controller.hostedStatus = HostedStatus(unavailable: nil, provider: "Made-up Cloud", usedUSD: 0.03, capUSD: 20)
      let skillStates: [OlaSkills.State] = OlaSkills.read().map { s in
        OlaSkills.State(skill: s, missing: ["report", "workbook", "chart"].contains(s.name) ? s.needs.filter { if case .python = $0 { return true } else { return false } } : [])
      }
      let info = SkillsInfo(preview: OlaSkills.version(), states: skillStates, machine: OlaSkills.compare(OlaSkills.version(), OlaSkills.version()))
      for (tag, on) in [("off", FallbackSettings()), ("on", FallbackSettings(claude: true, hosted: true, stretch: .handover))] {
        let settings = SettingsView(store: store, whereOla: controller, phoneLink: PhoneLink(store: store), account: account, cli: CLIInstaller(result: "Installed. In Terminal, go to a folder and type ola.", installed: true), tokenKnown: true, skills: info, fallbacksPreview: on, keptPreview: .init(on: tag == "on", count: tag == "on" ? 12 : 0, signedIn: true))
        for pane in SettingsPane.allCases where tag == "on" || pane == .models {
          for (letter, layout) in [("A-toolbar", SettingsSnapshot.Layout.toolbar), ("B-sidebar", .sidebar)] {
            let name = "settings-\(letter)-\(pane.rawValue)\(pane == .models ? "-\(tag)" : "")-\(mode)"
            guard only == nil || name.contains(only!) || only == "settings" else { continue }
            write(SettingsSnapshot(layout: layout, pane: pane, settings: settings).defaultAppStorage(defaults), size: CGSize(width: layout == .toolbar ? SettingsView.width : SettingsView.width + 171, height: 300), appearance: appearance, to: dir.appendingPathComponent("\(name).png"), titled: false, fit: true)
          }
        }
      }
    }
    // The Models pane with a Local session and with a Cloud session on screen (OLA-220): the same
    // pane either way, each runtime's own fallbacks, read from settings as the app reads them.
    for r in Runtime.allCases {
      let name = "mac-models-\(r.rawValue)-session-light"
      guard only == nil || name.contains(only!) || only == "models" else { continue }
      defaults.set(r.rawValue, forKey: LocalSettings.shownKey)
      defaults.set(false, forKey: "ola.phone.enabled")
      defaults.set(NSHomeDirectory() + "/Documents/court-watch", forKey: LocalSettings.folderKey)
      FallbackSettings.save(FallbackSettings(claude: true), for: NSHomeDirectory() + "/Documents/court-watch")
      let store = OlaStore(fixture: Fixture.main)
      store.previewAs(r)
      let controller = WhereOlaWorks(store: store)
      controller.hostedStatus = HostedStatus(unavailable: nil, provider: "Made-up Cloud", usedUSD: 0.03, capUSD: 20)
      controller.configureClaude()
      let settings = SettingsView(store: store, whereOla: controller, tokenKnown: true)
      write(SettingsSnapshot(layout: .toolbar, pane: .models, panes: [.general, .account, .models, .skills, .phone, .advanced], settings: settings).defaultAppStorage(defaults), size: CGSize(width: SettingsView.width, height: 300), appearance: .aqua, to: dir.appendingPathComponent("\(name).png"), titled: false, fit: true)
    }
    defaults.removeObject(forKey: FallbackSettings.key)
    // The three palettes (design pass two), each on the conversation with an approval and on
    // Settings, dark and light: apple-shots/polish-2.
    let chosenPalette = Palette.current
    for palette in Palette.all where only == nil || "palette-\(palette.id)".contains(only!) {
      Palette.current = palette
      for (mode, appearance) in [("dark", NSAppearance.Name.darkAqua), ("light", .aqua)] {
        NSApplication.shared.appearance = NSAppearance(named: appearance)
        let store = OlaStore(fixture: Fixture.approval)
        write(SnapshotFrame(store: store, treatment: chosen).environment(\.treatment, chosen), size: CGSize(width: 1440, height: 900), appearance: appearance, to: dir.appendingPathComponent("palette-\(palette.id)-conversation-\(mode).png"), titled: false)
        defaults.set(Runtime.local.rawValue, forKey: LocalSettings.shownKey)
        defaults.set(true, forKey: "ola.phone.enabled")
        let s2 = OlaStore(fixture: Fixture.main)
        let view = SettingsView(store: s2, whereOla: WhereOlaWorks(store: s2), phoneLink: PhoneLink(store: s2), tokenKnown: true).defaultAppStorage(defaults)
        write(view, size: SettingsView.snapshotSize, appearance: appearance, to: dir.appendingPathComponent("palette-\(palette.id)-settings-\(mode).png"), titled: false, fit: true)
      }
    }
    Palette.current = chosenPalette
    NSApplication.shared.appearance = nil
    // The real window: MacRoot itself (NavigationSplitView, inspector, toolbar) in a titled window
    // that is never ordered in. The system's glass does not draw into a bitmap; what Ola paints does.
    let real: [(String, String, NSAppearance.Name)] = [("mac-real-light", "main", .aqua), ("mac-real-dark", "approval", .darkAqua), ("mac-real-dark-main", "main", .darkAqua), ("mac-real-light-approval", "approval", .aqua)]
    for (name, fixture, appearance) in real where only == nil || name.contains(only!) {
      let store = OlaStore(fixture: Fixture.named(fixture))
      write(MacRoot(store: store), size: CGSize(width: 1280, height: 820), appearance: appearance, to: dir.appendingPathComponent("\(name).png"), titled: true)
    }
    // The same, composited by the window server: the window is ordered in far off every display
    // (it never appears), and only this app's own window is read back.
    for (name, fixture, appearance) in real where only == nil || name.contains(only!) {
      let store = OlaStore(fixture: Fixture.named(fixture))
      writeLive(MacRoot(store: store), size: CGSize(width: 1280, height: 820), appearance: appearance, to: dir.appendingPathComponent("\(name)-composited.png"))
    }
    // The dark styles (OLA-221): the real window (the list, a conversation with its steps and
    // reply, an approval, the files a run made), composited as the window server draws it, and
    // Settings, General, with the Dark style row. `-OlaOnly dark` for these alone.
    let keptStyle = ThemeBox.shared.style
    for style in DarkStyle.allCases {
      ThemeBox.shared.use(style)
      for (name, fixture) in [("conversation", "main"), ("approval", "approval"), ("results", "results")] {
        let shot = "dark-\(style.rawValue)-mac-\(name)"
        guard only == nil || shot.contains(only!) || only == "dark" else { continue }
        // The frame as Ola paints it (the real sidebar's material does not draw off screen; in
        // Graphite and Ink the app paints this same color there, MacRoot's darkFrame).
        let store = OlaStore(fixture: Fixture.named(fixture))
        store.previewAs(.local)
        let peer = OlaStore(fixture: Fixture.named(fixture == "main" ? "results" : "main"))
        peer.previewAs(.cloud)
        write(SnapshotFrame(store: store, treatment: .plain, peer: peer).environment(\.treatment, .plain), size: CGSize(width: 1440, height: 900), appearance: .darkAqua, to: dir.appendingPathComponent("\(shot).png"), titled: false)
        // Light (the default) once, the same screens, to set beside the phone's (OLA-222).
        if style == .standard {
          write(SnapshotFrame(store: store, treatment: .plain, peer: peer).environment(\.treatment, .plain), size: CGSize(width: 1440, height: 900), appearance: .aqua, to: dir.appendingPathComponent("light-mac-\(name).png"), titled: false)
        }
      }
      let shot = "dark-\(style.rawValue)-mac-settings"
      guard only == nil || shot.contains(only!) || only == "dark" else { continue }
      defaults.set(AppearanceChoice.dark.rawValue, forKey: AppearanceChoice.key)
      defaults.set(style.rawValue, forKey: DarkStyle.key)
      defaults.set(Runtime.local.rawValue, forKey: LocalSettings.shownKey)
      defaults.set(false, forKey: "ola.phone.enabled")
      let s2 = OlaStore(fixture: Fixture.main)
      var view = SettingsView(store: s2, whereOla: WhereOlaWorks(store: s2), tokenKnown: true)
      view.only = .general
      write(view.defaultAppStorage(defaults), size: SettingsView.snapshotSize, appearance: .darkAqua, to: dir.appendingPathComponent("\(shot).png"), titled: false, fit: true)
    }
    defaults.removeObject(forKey: AppearanceChoice.key)
    defaults.removeObject(forKey: DarkStyle.key)
    ThemeBox.shared.use(keptStyle)
    // The pairing sheet, with a made-up code.
    let sample = PairingCode(host: "imac-m1.tail1234.ts.net", port: 4330, secret: "ABCD-EFGH-JKLM-NPQR-STUV-WXYZ-23", name: "Bart\u{2019}s iMac")
    write(PairingSheet(code: sample) {}, size: CGSize(width: 400, height: 560), appearance: .aqua, to: dir.appendingPathComponent("mac-pair-phone.png"), titled: false)
    print("wrote \(dir.path)")
    exit(0)
  }

  static func write<V: View>(_ view: V, size: CGSize, appearance: NSAppearance.Name, to url: URL, titled: Bool = true, fit: Bool = false) {
    let host = NSHostingView(rootView: view)
    var size = size
    if fit { size.height = max(size.height, host.fittingSize.height) }
    host.sceneBridgingOptions = [.toolbars, .title]
    let window = NSWindow(contentRect: NSRect(origin: CGPoint(x: -20_000, y: -20_000), size: size), styleMask: titled ? [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView] : [.borderless], backing: .buffered, defer: false)
    window.appearance = NSAppearance(named: appearance)
    window.contentView = host
    window.title = "Ola"
    window.isReleasedWhenClosed = false
    window.setFrame(NSRect(origin: CGPoint(x: -20_000, y: -20_000), size: size), display: false)
    // Let SwiftUI lay out, load and animate in.
    for _ in 0..<12 {
      host.layoutSubtreeIfNeeded()
      RunLoop.main.run(until: Date().addingTimeInterval(0.1))
    }
    let target = window.contentView?.superview ?? host
    guard let rep = target.bitmapImageRepForCachingDisplay(in: target.bounds) else { return }
    target.cacheDisplay(in: target.bounds, to: rep)
    try? rep.representation(using: .png, properties: [:])?.write(to: url)
    window.close()
  }

  /// A titled window ordered in at a position no display shows, so the window server draws its
  /// glass and toolbar, then read back by window number (the app's own window needs no permission).
  static func writeLive<V: View>(_ view: V, size: CGSize, appearance: NSAppearance.Name, to url: URL) {
    let host = NSHostingView(rootView: view)
    host.sceneBridgingOptions = [.toolbars, .title]
    let far = CGPoint(x: -30_000, y: -30_000)
    NSApplication.shared.appearance = NSAppearance(named: appearance)
    defer { NSApplication.shared.appearance = nil }
    let window = SnapshotWindow(contentRect: NSRect(origin: far, size: size), styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView], backing: .buffered, defer: false)
    window.appearance = NSAppearance(named: appearance)
    window.contentView = host
    window.isReleasedWhenClosed = false
    window.setFrame(NSRect(origin: far, size: size), display: false)
    NSApplication.shared.setActivationPolicy(.accessory)
    window.orderFrontRegardless()
    window.setFrameOrigin(far)
    for _ in 0..<15 {
      host.layoutSubtreeIfNeeded()
      RunLoop.main.run(until: Date().addingTimeInterval(0.1))
    }
    defer { window.orderOut(nil); window.close() }
    guard window.frame.origin.x < -10_000 else { print("live shot skipped: the window was moved on screen"); return }
    // The window's own layer tree, drawn by Core Animation into a bitmap: no screen capture, so no
    // permission is involved. Backdrop effects (the glass blur) have nothing behind them to show.
    guard let frameView = window.contentView?.superview, let layer = frameView.layer else { print("live shot: no layer"); return }
    let scale: CGFloat = 2
    let w = Int(frameView.bounds.width * scale), h = Int(frameView.bounds.height * scale)
    guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return }
    ctx.scaleBy(x: scale, y: scale)
    if !frameView.isFlipped {} else { ctx.translateBy(x: 0, y: frameView.bounds.height); ctx.scaleBy(x: 1, y: -1) }
    layer.render(in: ctx)
    guard let image = ctx.makeImage() else { return }
    try? NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:])?.write(to: url)
  }
}

/// Keeps its frame where it is put, even off every display.
final class SnapshotWindow: NSWindow {
  override func constrainFrameRect(_ frameRect: NSRect, to screen: NSScreen?) -> NSRect { frameRect }
}
