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
  static let knownOptions: Set<String> = ["--local-selftest", "--settings-selftest", "--import-secret", "--secret-status", "--forget-secret",
                                          "--token-file", "--folder", "--fresh", "--key-id", "--cli", "--install-cli"]

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
  @State private var store = OlaStore(config: LocalSettings.onThisMac ? nil : Credentials.load())
  @State private var whereOla: WhereOlaWorks?
  @State private var phoneLink: PhoneLink?
  @State private var phonePush: PhonePush?
  /// Who is signed in comes from plain settings; the token is read only when a request needs it.
  @State private var account = AccountController()
  @State private var cli = CLIInstaller()
  @NSApplicationDelegateAdaptor private var delegate: AppDelegate

  var body: some Scene {
    WindowGroup("Ola", id: "main") {
      MacGate(store: store, account: account, whereOla: whereOla)
        .frame(minWidth: 860, minHeight: 560)
        .onAppear {
          guard whereOla == nil else { return }
          let w = WhereOlaWorks(store: store, account: account)
          whereOla = w
          account.onSignedIn = { [weak w] in
            // A Mac set up for nothing else goes straight to working here.
            if Credentials.savedAddress == nil { LocalSettings.defaults.set("mac", forKey: LocalSettings.modeKey) }
            Task { await w?.apply() }
          }
          if account.signedIn { account.refreshUsage() }
          delegate.store = store
          delegate.whereOla = w
          Notifier.wire(store)
          w.configureClaude()
          let link = PhoneLink(store: store)
          phoneLink = link
          let push = PhonePush(link: link)
          phonePush = push
          store.onNotify = { e in push.notify(e) }
          delegate.phoneLink = link
          Task { await link.apply() }
          if LocalSettings.onThisMac { Task { await w.apply() } } else { store.start() }
        }
    }
    .defaultSize(width: 1280, height: 820)
    .commands { OlaCommands(store: store) }

    WindowGroup("Page", id: "page", for: String.self) { $path in
      if let path { PageWindow(store: store, path: path) }
    }
    .defaultSize(width: 1000, height: 760)

    Settings {
      SettingsView(store: store, whereOla: whereOla, phoneLink: phoneLink, phonePush: phonePush, account: account, cli: cli)
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
        MacRoot(store: store)
      }
    }
    .animation(.easeOut(duration: 0.18), value: needsSignIn)
  }

  /// Sign in first, unless this Mac already has another way to work (the Ola machine, or the
  /// pasted model token, both from before sign-in existed). A sign-in the server ended asks again.
  var needsSignIn: Bool {
    if account.phase == .expired { return true }
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
      store?.isActive = true
      if case .lost = store?.connection { store?.reconnect() }
    }
  }
  func applicationDidResignActive(_ notification: Notification) {
    MainActor.assumeIsolated { store?.isActive = false }
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
  @FocusedValue(\.olaDraft) private var draft

  var body: some Commands {
    CommandGroup(after: .appInfo) {
      Button("Check for Updates…") { Task { await UpdateCheck.check(userAsked: true) } }
    }
    CommandGroup(replacing: .newItem) {
      Button("New Session") { store.newSession() }.keyboardShortcut("n")
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

/// Settings: one pane in groups (where Ola works, the phone, and the machine when Ola works there).
/// Short labels, a line of explanation under each choice, status as a colored dot and words.
struct SettingsView: View {
  var store: OlaStore
  var whereOla: WhereOlaWorks?
  var phoneLink: PhoneLink?
  var phonePush: PhonePush? = nil
  var account: AccountController? = nil
  var cli: CLIInstaller? = nil
  var tokenKnown: Bool? = nil
  var look: SettingsLook = .native
  @State private var connecting = false
  @AppStorage(LocalSettings.modeKey) private var mode = "machine"
  static let width: CGFloat = 520

  var body: some View {
    Group {
      switch look {
      case .native:
        Form { groups }.formStyle(.grouped).scrollDisabled(true).fixedSize(horizontal: false, vertical: true)
      case .paper:
        VStack(alignment: .leading, spacing: Space.xl) { groups }
          .font(OlaFont.sans(Metrics.ui)).padding(Space.xl).background(Ola.paper)
      }
    }
    .environment(\.settingsLook, look)
    .frame(width: Self.width)
    .sheet(isPresented: $connecting) { ConnectForm(store: store) { connecting = false }.frame(width: 400) }
  }

  @ViewBuilder var groups: some View {
    if let account { AccountSettings(account: account, cli: cli) }
    if let whereOla { WhereSettings(controller: whereOla, tokenKnown: tokenKnown) }
    if let whereOla { SettingsGroup(title: "Claude") { ClaudeSettings(controller: whereOla) } }
    if let phoneLink { PhoneSettings(link: phoneLink) }
    if let phonePush { SettingsGroup(title: "Phone notifications") { PushSettings(push: phonePush) } }
    // The machine's rows only when Ola works there; the local agent's state is under Where Ola works.
    if mode != "mac" {
      SettingsGroup(title: "Ola machine") {
        LabeledContent("Address") {
          Text(store.config?.url.host() ?? "Not connected").foregroundStyle(.secondary)
            .lineLimit(1).truncationMode(.middle).textSelection(.enabled).help(store.config?.url.absoluteString ?? "")
        }
        LabeledContent("Status") { StatusLine(kind: statusKind, text: statusText) }
        HStack {
          Button("Forget This Machine", role: .destructive) { store.forget() }
          Spacer()
          Button("Connect Again\u{2026}") { connecting = true }
        }
      }
    }
  }

  static let snapshotSize = CGSize(width: width, height: 300)

  var statusKind: StatusLine.Kind {
    switch store.connection {
    case .open: .ok
    case .connecting: .busy
    case .lost, .refused: .problem
    case .notSetUp: .off
    }
  }

  var statusText: String {
    switch store.connection {
    case .open: "Connected"
    case .connecting: "Connecting"
    case .lost: "Not answering"
    case .refused: "Password refused"
    case .notSetUp: "Not set up"
    }
  }
}
