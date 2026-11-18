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
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let chosen = Treatment.desk
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
    let settings: [(String, String, String?, NSAppearance.Name, SettingsLook)] = [
      ("dir-A-settings", "mac", nil, .aqua, .native),
      ("dir-B-settings", "mac", nil, .aqua, .paper),
      ("mac-settings-machine", "machine", nil, .aqua, .native),
      ("mac-settings-mac", "mac", nil, .aqua, .native),
      ("mac-settings-mac-problem", "mac", "Ola cannot read ~/Documents/court-watch. Allow it in System Settings, Privacy and Security, Files and Folders, then Try Again.", .aqua, .native),
      ("mac-settings-mac-dark", "mac", nil, .darkAqua, .native),
    ]
    for (name, mode, problem, appearance, look) in settings where only == nil || name.contains(only!) {
      defaults.set(mode, forKey: LocalSettings.modeKey)
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
      defaults.set("mac", forKey: LocalSettings.modeKey)
      defaults.set(mode.rawValue, forKey: PermissionSettings.key)
      let store = OlaStore(fixture: Fixture.main)
      var view = SettingsView(store: store, whereOla: WhereOlaWorks(store: store), tokenKnown: true)
      view.only = .general
      write(view.defaultAppStorage(defaults), size: SettingsView.snapshotSize, appearance: .aqua, to: dir.appendingPathComponent("\(name).png"), titled: false, fit: true)
    }
    defaults.removeObject(forKey: PermissionSettings.key)
    // Ola's skills in Settings (apple-shots/skills), light and dark, from the bundled skills' own
    // files when the app carries them, the states made up so every kind shows.
    let other = OlaSkills.Version(hash: "0123456789abcdef", commit: "fedcba9876543210")
    let variants: [(String, NSAppearance.Name, OlaSkills.Version?)] = [("same-light", .aqua, OlaSkills.version()), ("same-dark", .darkAqua, OlaSkills.version()), ("different-light", .aqua, other), ("unknown-light", .aqua, nil)]
    for (mode, appearance, machine) in variants where only == nil || "skills-settings-\(mode)".contains(only!) || only == "skills" {
      defaults.set("mac", forKey: LocalSettings.modeKey)
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
        ("signin-1-signed-out", AnyView(SignInScreen(account: AccountController(preview: .idle), useOwnSetup: {}))),
        ("signin-1b-signing-in", AnyView(SignInScreen(account: AccountController(preview: .working), useOwnSetup: {}))),
        ("signin-1c-wrong-password", AnyView(SignInScreen(account: AccountController(preview: .problem(AccountError.wrongPassword.errorDescription!)), useOwnSetup: {}))),
        ("signin-1d-service-down", AnyView(SignInScreen(account: AccountController(preview: .problem(AccountError.serviceDown.errorDescription!)), useOwnSetup: {}))),
        ("signin-2-passkey-sheet", AnyView(SignInScreen(account: AccountController(preview: .passkey)))),
        ("signin-2b-passkey-not-in-this-version", AnyView(SignInScreen(account: AccountController(preview: .problem(AccountError.passkeysNotInThisVersion.errorDescription!), passkeys: false), useOwnSetup: {}))),
        ("signin-2c-signed-out-no-passkeys", AnyView(SignInScreen(account: AccountController(preview: .idle, passkeys: false), useOwnSetup: {}))),
        ("signin-1e-passkey-used-here", AnyView(SignInScreen(account: AccountController(preview: .idle, passkeyUsed: true), useOwnSetup: {}))),
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
        defaults.set(where_, forKey: LocalSettings.modeKey)
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
    let savedDefaults = LocalSettings.defaults
    LocalSettings.defaults = defaults
    for (mode, appearance) in [("light", NSAppearance.Name.aqua), ("dark", .darkAqua)] {
      for (name, fixture) in [("mac-fallbacks", "fallbacks"), ("mac-fallbacks-ask-claude", "ask-claude")] where only == nil || name.contains(only!) {
        let store = OlaStore(fixture: Fixture.named(fixture))
        write(SnapshotFrame(store: store, treatment: chosen).environment(\.treatment, chosen), size: CGSize(width: 1440, height: 1100), appearance: appearance, to: dir.appendingPathComponent("\(name)-\(mode).png"), titled: false)
      }
      defaults.set("mac", forKey: LocalSettings.modeKey)
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
        let settings = SettingsView(store: store, whereOla: controller, phoneLink: PhoneLink(store: store), account: account, cli: CLIInstaller(result: "Installed. In Terminal, go to a folder and type ola.", installed: true), tokenKnown: true, skills: info, fallbacksPreview: on)
        for pane in SettingsPane.allCases where tag == "on" || pane == .models {
          for (letter, layout) in [("A-toolbar", SettingsSnapshot.Layout.toolbar), ("B-sidebar", .sidebar)] {
            let name = "settings-\(letter)-\(pane.rawValue)\(pane == .models ? "-\(tag)" : "")-\(mode)"
            guard only == nil || name.contains(only!) || only == "settings" else { continue }
            write(SettingsSnapshot(layout: layout, pane: pane, settings: settings).defaultAppStorage(defaults), size: CGSize(width: layout == .toolbar ? SettingsView.width : SettingsView.width + 171, height: 300), appearance: appearance, to: dir.appendingPathComponent("\(name).png"), titled: false, fit: true)
          }
        }
      }
    }
    LocalSettings.defaults = savedDefaults
    // The three palettes (design pass two), each on the conversation with an approval and on
    // Settings, dark and light: apple-shots/polish-2.
    let chosenPalette = Palette.current
    for palette in Palette.all where only == nil || "palette-\(palette.id)".contains(only!) {
      Palette.current = palette
      for (mode, appearance) in [("dark", NSAppearance.Name.darkAqua), ("light", .aqua)] {
        NSApplication.shared.appearance = NSAppearance(named: appearance)
        let store = OlaStore(fixture: Fixture.approval)
        write(SnapshotFrame(store: store, treatment: chosen).environment(\.treatment, chosen), size: CGSize(width: 1440, height: 900), appearance: appearance, to: dir.appendingPathComponent("palette-\(palette.id)-conversation-\(mode).png"), titled: false)
        defaults.set("mac", forKey: LocalSettings.modeKey)
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
    // The connect sheet on its own.
    let connect = ConnectForm(store: OlaStore(config: nil)).frame(width: 400)
    write(connect, size: CGSize(width: 400, height: 330), appearance: .aqua, to: dir.appendingPathComponent("mac-connect.png"), titled: false)
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
