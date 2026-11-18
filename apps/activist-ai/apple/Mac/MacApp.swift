import OlaKit
import SwiftUI
import UserNotifications

@main
enum Main {
  static func main() {
    // Modes that never start the interface come first, before anything from AppKit or SwiftUI:
    // the `ola` command (--cli, --install-cli), then the Keychain tools.
    OlaCLI.runIfRequested()
    refuseUnknownOptions()
    SecretImport.runIfRequested()
    OlaFont.register()
    if LocalSelfTest.requested { LocalSelfTest.run() }
    if SettingsSelfTest.requested { SettingsSelfTest.run() }
    if PermissionsSelfTest.requested { MainActor.assumeIsolated { PermissionsSelfTest.run() } }
    if RenderSelfTest.requested { MainActor.assumeIsolated { RenderSelfTest.run() } }
    if MotionRender.cpuRequested { MotionRender.measureCPU() }
    if let dir = MotionRender.outputDirectory { MotionRender.run(to: dir) }
    if let dir = Snapshot.outputDirectory {
      Snapshot.run(to: dir)
      return
    }
    OlaMacApp.main()
  }

  /// The options the executable knows. Anything else that starts with "--" (a typo, or a flag an
  /// older build does not have) exits with a line instead of opening the app's window.
  static let knownOptions: Set<String> = ["--local-selftest", "--settings-selftest", "--render-selftest", "--import-secret", "--secret-status", "--forget-secret",
                                          "--permissions-selftest", "--shots", "--token-file", "--model-url", "--folder", "--fresh", "--key-id", "--cli", "--install-cli"]

  static func refuseUnknownOptions() {
    let args = Array(CommandLine.arguments.dropFirst())
    for a in args where a.hasPrefix("--") && !knownOptions.contains(a) {
      FileHandle.standardError.write(Data("Ola: unknown option \(a); the app was not opened.\n".utf8))
      exit(2)
    }
  }
}

struct OlaMacApp: App {
  /// The machine's password is read only when Ola works on the machine (once per launch).
  /// The runtime on screen; `peer` holds the other one's sessions (WhereOlaWorks, OLA-143).
  @State private var store = OlaStore(config: LocalSettings.onThisMac || Credentials.savedAddress == nil ? nil : Credentials.load())
  @State private var peer = OlaStore(config: nil)
  @State private var whereOla: WhereOlaWorks?
  @State private var phoneLink: PhoneLink?
  @State private var phonePush: PhonePush?
  /// Who is signed in comes from plain settings; the token is read only when a request needs it.
  @State private var account = AccountController()
  @State private var cli = CLIInstaller()
  @State private var skills = SkillsInfo()
  @NSApplicationDelegateAdaptor private var delegate: AppDelegate

  var body: some Scene {
    WindowGroup("Ola", id: "main") {
      MacGate(store: store, account: account, whereOla: whereOla)
        .frame(minWidth: 860, minHeight: 560)
        .onAppear {
          guard whereOla == nil else { return }
          // ola-page for the agent "On this Mac" (bart/ola-page-mac): rendered here, off screen.
          PageRender.shared.start()
          let w = WhereOlaWorks(store: store, peer: peer, account: account)
          whereOla = w
          account.onSignedIn = { [weak w] in
            // A Mac set up for nothing else goes straight to working here.
            if Credentials.savedAddress == nil { LocalSettings.defaults.set("mac", forKey: LocalSettings.modeKey) }
            Task { await w?.apply() }
          }
          if account.signedIn { account.refreshUsage() }
          delegate.store = store
          delegate.peer = peer
          delegate.whereOla = w
          // Both runtimes, live: notifications, and Lots of permissions, each store by its own
          // runtime's switch (answered here "On this Mac", by the machine itself in the cloud,
          // whose switch this Mac reads at launch).
          for s in [store, peer] {
            Notifier.wire(s)
            PermissionSettings.wire(s)
          }
          Task { await PermissionSettings.pull() }
          w.configureClaude()
          let link = PhoneLink(store: store, whereOla: w)
          phoneLink = link
          let push = PhonePush(link: link)
          phonePush = push
          store.onNotify = { e in push.notify(e) }
          peer.onNotify = { e in push.notify(e) }
          delegate.phoneLink = link
          Task { await link.apply() }
          store.start()
          Task { await w.apply() }
        }
    }
    .defaultSize(width: 1280, height: 820)
    .commands { OlaCommands(store: store, chooser: NewSessionChooser.shared) }

    WindowGroup("Page", id: "page", for: String.self) { $path in
      if let path { PageWindow(store: store, path: path) }
    }
    .defaultSize(width: 1000, height: 760)

    Settings {
      SettingsView(store: store, whereOla: whereOla, phoneLink: phoneLink, phonePush: phonePush, account: account, cli: cli, skills: skills)
    }
  }
}

/// The window: sign in, choose a folder, get ready, or the conversation.
struct MacGate: View {
  var store: OlaStore
  var account: AccountController
  var whereOla: WhereOlaWorks?
  @AppStorage(LocalSettings.modeKey) private var mode = "machine"
  @AppStorage(LocalSettings.folderKey) private var folder = ""
  @AppStorage(LocalSettings.tokenSavedKey) private var pastedToken = false
  @AppStorage("ola.serverAddress") private var machineAddress = ""
  /// The owner chose his own setup on the first-run screen (before the machine's address was saved).
  @AppStorage("ola.ownSetup") private var ownSetup = false

  var body: some View {
    Group {
      if needsSignIn {
        // The first-run choice: the owner's own setup (the machine directly) is offered only while
        // this Mac has no other way to work; it opens the machine's connect sheet, as before.
        SignInScreen(account: account, useOwnSetup: account.wantsGate ? nil : { ownSetup = true; mode = "machine" })
      } else if mode == "mac", folder.isEmpty {
        FolderScreen { whereOla?.chooseFolder() }
      } else if mode == "mac", let w = whereOla, w.installing || w.installProblem != nil {
        InstallScreen(fraction: w.installFraction, problem: w.installProblem) { Task { await w.apply() } }
      } else {
        MacRoot(store: store, whereOla: whereOla)
      }
    }
    .animation(.easeOut(duration: 0.18), value: needsSignIn)
  }

  /// Sign in first, unless this Mac already has another way to work (the Ola machine, or the
  /// pasted model token, both from before sign-in existed). A sign-in the server ended asks again.
  var needsSignIn: Bool {
    if account.phase == .expired { return true }
    // The passkey sheet finishing a sign-in stays on this screen.
    if account.inPasskeyStep { return true }
    if account.signedIn { return false }
    // Settings asked for it on a Mac that works another way (Cancel goes back).
    if account.wantsGate { return true }
    // Started from this screen: it stays until the sign-in finishes or is cancelled.
    if account.fromGate, account.phase != .idle { return true }
    // The owner's setup from before sign-in (the machine's address, or the pasted token) never
    // asks: his app works exactly as it did, and his settings are untouched by this update.
    return machineAddress.isEmpty && !pastedToken && !ownSetup
  }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
  var store: OlaStore?
  var peer: OlaStore?
  var whereOla: WhereOlaWorks?
  var phoneLink: PhoneLink?
  func applicationDidFinishLaunching(_ notification: Notification) {
    // Not in the snapshot, self-test or `ola` modes (they never show a window); not before the
    // first download exists (the feed answers 404 and the quiet check says nothing).
    let args = ProcessInfo.processInfo.arguments.dropFirst()
    guard !args.contains(where: { $0.hasPrefix("-Ola") || $0.hasPrefix("--") }) else { return }
    MainActor.assumeIsolated { UpdateCheck.atLaunch() }
  }
  func applicationWillTerminate(_ notification: Notification) {
    MainActor.assumeIsolated { whereOla?.stop(); phoneLink?.stop() }
    // whereOla.stop() also closes the model door (AccountController.stop).
  }
  func applicationDidBecomeActive(_ notification: Notification) {
    MainActor.assumeIsolated {
      for s in [store, peer].compactMap({ $0 }) {
        s.isActive = true
        if case .lost = s.connection { s.reconnect() }
      }
    }
    // A change made on the phone shows here when Bart comes back.
    Task { await PermissionSettings.pull() }
  }
  func applicationDidResignActive(_ notification: Notification) {
    MainActor.assumeIsolated { store?.isActive = false; peer?.isActive = false }
  }
}

/// A notification when a run ends, or asks for an approval, while the app is not in front.
@MainActor
enum Notifier {
  static func wire(_ store: OlaStore) {
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
    store.onRunEnded = { s, t in
      let body: String
      switch t.status {
      case .done: body = t.answer.isEmpty ? t.summary() : String(t.answer.prefix(160))
      case .failed: body = t.error?.text ?? "It stopped before it finished."
      default: body = "Stopped."
      }
      post(id: "run-\(s.id)", title: t.status == .done ? s.title : "\(s.title): did not finish", body: body)
    }
    store.onApproval = { s, a in
      post(id: "ask-\(s.id)", title: "Ola asks: \(a.title)", body: s.title)
    }
  }

  static func post(id: String, title: String, body: String) {
    let c = UNMutableNotificationContent()
    c.title = title
    c.body = body.replacingOccurrences(of: "**", with: "")
    c.sound = .default
    UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: c, trigger: nil))
  }
}

struct OlaCommands: Commands {
  var store: OlaStore
  var chooser: NewSessionChooser
  @FocusedValue(\.olaDraft) private var draft

  var body: some Commands {
    CommandGroup(after: .appInfo) {
      Button("Check for Updates…") { Task { await UpdateCheck.check(userAsked: true) } }
    }
    CommandGroup(replacing: .newItem) {
      // Where the session works is chosen first: cloud or local (OLA-143).
      Button("New Session\u{2026}") { chooser.shown = true }.keyboardShortcut("n")
    }
    CommandMenu("Session") {
      Button("Send") {
        if let d = draft, !d.wrappedValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
          let t = d.wrappedValue
          d.wrappedValue = ""
          Task { await store.send(t) }
        }
      }
      .keyboardShortcut(.return, modifiers: .command)
      .disabled(store.conversation?.isRunning ?? false)
      Button("Stop") { Task { await store.stop() } }
        .keyboardShortcut(".", modifiers: .command)
        .disabled(!(store.conversation?.isRunning ?? false))
      Divider()
      Button("Yes, This Once") { Task { await store.answer(.once) } }.disabled(store.conversation?.approval == nil)
      Button("Yes, for the Rest of This Session") { Task { await store.answer(.always) } }.disabled(store.conversation?.approval == nil)
      Button("No") { Task { await store.answer(.reject) } }.disabled(store.conversation?.approval == nil)
      Divider()
      Button("Reconnect") { store.reconnect() }.keyboardShortcut("r", modifiers: [.command, .shift])
    }
  }
}

struct DraftKey: FocusedValueKey { typealias Value = Binding<String> }
extension FocusedValues {
  var olaDraft: Binding<String>? {
    get { self[DraftKey.self] }
    set { self[DraftKey.self] = newValue }
  }
}

