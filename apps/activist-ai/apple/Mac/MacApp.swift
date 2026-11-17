import OlaKit
import SwiftUI
import UserNotifications

@main
enum Main {
  static func main() {
    OlaFont.register()
    if let dir = Snapshot.outputDirectory {
      Snapshot.run(to: dir)
      return
    }
    OlaMacApp.main()
  }
}

struct OlaMacApp: App {
  @State private var store = OlaStore(config: Credentials.load())
  @NSApplicationDelegateAdaptor private var delegate: AppDelegate

  var body: some Scene {
    WindowGroup("Ola", id: "main") {
      MacRoot(store: store)
        .frame(minWidth: 860, minHeight: 560)
        .onAppear {
          delegate.store = store
          Notifier.wire(store)
          store.start()
        }
    }
    .defaultSize(width: 1280, height: 820)
    .commands { OlaCommands(store: store) }

    WindowGroup("Page", id: "page", for: String.self) { $path in
      if let path { PageWindow(store: store, path: path) }
    }
    .defaultSize(width: 1000, height: 760)

    Settings {
      SettingsView(store: store)
    }
  }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
  var store: OlaStore?
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
  @State private var connecting = false
  @AppStorage("ola.where") private var whereMode = "machine"

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      Picker("Where Ola works", selection: $whereMode) {
        Text("On the Ola machine: the agent and the files are there, and the phone can follow").tag("machine")
        Text("On this Mac, in a folder you pick (not yet)").tag("mac").disabled(true)
      }
      .pickerStyle(.radioGroup)
      Divider()
      LabeledContent("Machine", value: store.config?.url.absoluteString ?? "Not connected")
      LabeledContent("Status", value: statusText)
      HStack {
        Button("Connect Again\u{2026}") { connecting = true }
        Button("Forget This Machine", role: .destructive) { store.forget() }
      }
    }
    .padding(24)
    .frame(width: 460)
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
