import AppKit
import OlaKit
import Security
import SwiftUI

/// Apple push for the phone, sent by this Mac app. The team's push key is imported once, from a
/// file Bart confirms in the open panel, into the Keychain; the file is never read again, and the
/// key is never logged or shown.
@MainActor
@Observable
final class PhonePush {
  static let teamID = "274T5WCVD2"
  static let topic = "cx.ola.phone"
  /// Set when the key went into the Keychain, so Settings can say so without reading it.
  static let readyKey = "ola.push.ready"
  let link: PhoneLink
  let filter = NotifyFilter()
  private(set) var ready = LocalSettings.defaults.bool(forKey: PhonePush.readyKey)
  var problem: String?

  init(link: PhoneLink) { self.link = link }

  /// (p8 text, key id) from the Keychain: read when the first notification is sent, not before.
  static func loadKey() -> (String, String)? {
    guard let item = SecretStore.item(.pushKey), let kid = item.note, !kid.isEmpty else { return nil }
    return (item.value, kid)
  }

  /// Keeps the key (Set Up, and `Ola --import-secret push-key --key-id <id>`).
  @discardableResult
  static func keep(p8: String, keyID: String) -> Bool {
    let ok = SecretStore.save(.pushKey, p8, note: keyID)
    LocalSettings.defaults.set(ok, forKey: readyKey)
    return ok
  }

  /// Set up: the open panel, prefilled to the key's file; read once, checked, kept in the Keychain.
  func setUp() {
    let panel = NSOpenPanel()
    panel.directoryURL = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Desktop")
    panel.nameFieldStringValue = "AuthKey_RYMP5N694Z.p8"
    panel.allowedContentTypes = [.data]
    panel.message = "Choose the Apple push key (AuthKey_….p8). Ola keeps it in your Keychain and does not read this file again."
    panel.prompt = "Use This Key"
    guard panel.runModal() == .OK, let url = panel.url else { return }
    problem = nil
    let name = url.deletingPathExtension().lastPathComponent
    guard name.hasPrefix("AuthKey_"), let p8 = try? String(contentsOf: url, encoding: .utf8) else { problem = "That is not an Apple key file (AuthKey_….p8)."; return }
    let kid = String(name.dropFirst("AuthKey_".count))
    guard (try? APNs(p8: p8, keyID: kid, teamID: Self.teamID, topic: Self.topic, host: APNs.sandbox)) != nil else { problem = "That file is not a key Ola can use."; return }
    ready = Self.keep(p8: p8, keyID: kid)
    if !ready { problem = "The Keychain did not take the key." }
  }

  /// One event to every phone that wants it.
  func notify(_ e: NotifyEvent) {
    guard let (p8, kid) = Self.loadKey() else { return }
    for p in link.relay.book.list {
      guard let token = p.pushToken else { continue }
      let phone = NotifyFilter.Phone(finished: p.notifyFinished ?? true, needsYou: p.notifyNeeds ?? true, viewing: p.viewing, viewingAt: p.viewingAt)
      guard filter.shouldSend(e, to: phone, phoneID: p.id) else { continue }
      guard let apns = try? APNs(p8: p8, keyID: kid, teamID: Self.teamID, topic: Self.topic, host: p.pushSandbox == false ? APNs.production : APNs.sandbox) else { continue }
      Task.detached { _ = await apns.send(e, device: token) }
    }
  }
}

struct PushSettings: View {
  var push: PhonePush
  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack {
        Text(push.ready ? "Phone notifications are set up." : "Phone notifications are not set up.")
        Spacer()
        Button(push.ready ? "Set Up Again\u{2026}" : "Set Up\u{2026}") { push.setUp() }
      }
      Text("They come only while Ola is open on this Mac.").font(.callout).foregroundStyle(.secondary)
      if let p = push.problem { Text(p).font(.callout).foregroundStyle(.red) }
    }
  }
}

/// View on a result: a page in the page window, a website in the browser, anything else in Quick Look.
@MainActor
enum MacViewer {
  static func open(_ item: ResultItem, store: OlaStore, openWindow: OpenWindowAction, preview: @escaping (URL) -> Void) {
    switch item.kind {
    case .page: openWindow(id: "page", value: item.target)
    case .site: if let u = URL(string: item.target) { NSWorkspace.shared.open(u) }
    default:
      Task {
        guard let data = try? await store.read(item.target) else { return }
        let url = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("ola-files").appendingPathComponent(item.target)
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: url)
        preview(url)
      }
    }
  }
}
