import OlaKit
import SwiftUI
import UserNotifications

@main
enum Main {
  static func main() {
    OlaFont.register()
    if LocalSelfTest.requested { LocalSelfTest.run() }
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
      SettingsView(store: store, whereOla: whereOla)
    }
  }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
  var store: OlaStore?
  var whereOla: WhereOlaWorks?
  func applicationWillTerminate(_ notification: Notification) {
    MainActor.assumeIsolated { whereOla?.stop() }
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

struct SettingsView: View {
  var store: OlaStore
  var whereOla: WhereOlaWorks?
  @State private var connecting = false

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      if let whereOla { WhereSettings(controller: whereOla) }
      Divider()
      LabeledContent("Machine", value: store.config?.url.absoluteString ?? "Not connected")
      LabeledContent("Status", value: statusText)
      HStack {
        Button("Connect Again\u{2026}") { connecting = true }
        Button("Forget This Machine", role: .destructive) { store.forget() }
      }
    }
    .padding(24)
    .frame(width: 580)
    .sheet(isPresented: $connecting) { ConnectForm(store: store) { connecting = false }.frame(width: 440) }
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
