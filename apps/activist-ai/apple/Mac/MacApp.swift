import OlaKit
import SwiftUI
import UserNotifications

@main
enum Main {
  static func main() {
    OlaFont.register()
    if LocalSelfTest.requested { LocalSelfTest.run() }
    if SettingsSelfTest.requested { SettingsSelfTest.run() }
    if let dir = Snapshot.outputDirectory {
      Snapshot.run(to: dir)
      return
    }
    OlaMacApp.main()
  }
}

struct OlaMacApp: App {
  @State private var store = OlaStore(config: Credentials.load())
  @State private var whereOla: WhereOlaWorks?
  @State private var phoneLink: PhoneLink?
  @NSApplicationDelegateAdaptor private var delegate: AppDelegate

  var body: some Scene {
    WindowGroup("Ola", id: "main") {
      MacRoot(store: store)
        .frame(minWidth: 860, minHeight: 560)
        .onAppear {
          guard whereOla == nil else { return }
          let w = WhereOlaWorks(store: store)
          whereOla = w
          delegate.store = store
          delegate.whereOla = w
          Notifier.wire(store)
          w.configureClaude()
          let link = PhoneLink(store: store)
          phoneLink = link
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
      SettingsView(store: store, whereOla: whereOla, phoneLink: phoneLink)
    }
  }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
  var store: OlaStore?
  var whereOla: WhereOlaWorks?
  var phoneLink: PhoneLink?
  func applicationWillTerminate(_ notification: Notification) {
    MainActor.assumeIsolated { whereOla?.stop(); phoneLink?.stop() }
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
    if let whereOla { WhereSettings(controller: whereOla, tokenKnown: tokenKnown) }
    if let whereOla { SettingsGroup(title: "Claude") { ClaudeSettings(controller: whereOla) } }
    if let phoneLink { PhoneSettings(link: phoneLink) }
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
