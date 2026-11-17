import OlaKit
import QuickLook
import SafariServices
import SwiftUI
import UIKit
import UserNotifications

/// Notifications on the phone: Apple push, sent by the Mac app. The phone gives its push token and
/// its two switches to the Mac, and says which session is on screen (that one never notifies).
@MainActor
@Observable
final class PhonePushState: NSObject, UNUserNotificationCenterDelegate {
  static let shared = PhonePushState()
  weak var store: OlaStore?
  var token: String?
  /// A notification was tapped: the session to open.
  var openSession: String?
  var viewing: String?
  var finished: Bool { get { UserDefaults.standard.object(forKey: "ola.notify.finished") as? Bool ?? true } set { UserDefaults.standard.set(newValue, forKey: "ola.notify.finished"); Task { await register() } } }
  var needs: Bool { get { UserDefaults.standard.object(forKey: "ola.notify.needs") as? Bool ?? true } set { UserDefaults.standard.set(newValue, forKey: "ola.notify.needs"); Task { await register() } } }
  var asked: Bool { get { UserDefaults.standard.bool(forKey: "ola.notify.asked") } set { UserDefaults.standard.set(newValue, forKey: "ola.notify.asked") } }
  var allowed = false

  /// Asked once, after pairing.
  func requestPermission() async {
    asked = true
    allowed = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    if allowed { UIApplication.shared.registerForRemoteNotifications() }
  }

  func refreshAllowed() async {
    let s = await UNUserNotificationCenter.current().notificationSettings()
    allowed = s.authorizationStatus == .authorized
    if allowed { UIApplication.shared.registerForRemoteNotifications() }
  }

  /// Tells the Mac app the token and the switches.
  func register() async {
    guard let store, let token else { return }
    #if DEBUG
    let sandbox = true
    #else
    let sandbox = false
    #endif
    await store.postToMac("/ola/push", ["token": .string(token), "finished": .bool(finished), "needs": .bool(needs), "sandbox": .bool(sandbox)])
  }

  /// The session on screen (nil when none, or the app is in the background).
  func setViewing(_ id: String?) {
    viewing = id
    Task { await store?.postToMac("/ola/viewing", id.map { ["session": .string($0)] } ?? [:]) }
  }

  nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent n: UNNotification) async -> UNNotificationPresentationOptions {
    let session = n.request.content.userInfo["session"] as? String
    let looking = await MainActor.run { PhonePushState.shared.viewing }
    return session != nil && session == looking ? [] : [.banner, .sound, .list]
  }

  nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive r: UNNotificationResponse) async {
    let session = r.notification.request.content.userInfo["session"] as? String
    await MainActor.run { PhonePushState.shared.openSession = session }
  }
}

final class PhoneAppDelegate: NSObject, UIApplicationDelegate {
  func application(_ app: UIApplication, didFinishLaunchingWithOptions o: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    UNUserNotificationCenter.current().delegate = PhonePushState.shared
    return true
  }
  func application(_ app: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken token: Data) {
    let hex = token.map { String(format: "%02x", $0) }.joined()
    Task { @MainActor in
      PhonePushState.shared.token = hex
      await PhonePushState.shared.register()
    }
  }
}

struct NotificationSettingsSheet: View {
  @Bindable var push = PhonePushState.shared
  var body: some View {
    NavigationStack {
      Form {
        if push.allowed {
          Toggle("Finished", isOn: Binding(get: { push.finished }, set: { push.finished = $0 }))
          Toggle("Needs me", isOn: Binding(get: { push.needs }, set: { push.needs = $0 }))
        } else {
          Button("Allow notifications") { Task { await push.requestPermission() } }
        }
        Section {
          Text("They come only while Ola is open on your Mac.").font(.footnote).foregroundStyle(.secondary)
        }
      }
      .navigationTitle("Notifications")
      .navigationBarTitleDisplayMode(.inline)
    }
    .task { await push.refreshAllowed() }
  }
}

// MARK: View on the phone

struct ViewedItem: Identifiable { var item: ResultItem; var id: String { item.id } }

struct ResultViewer: View {
  var store: OlaStore
  var item: ResultItem
  @State private var data: Data?
  @State private var preview: URL?
  @State private var failed = false
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      Group {
        switch item.kind {
        case .page: PageView(store: store, path: item.target).ignoresSafeArea(edges: .bottom)
        case .site: if let u = URL(string: item.target) { SafariView(url: u).ignoresSafeArea() }
        default:
          if let data { content(data) } else if failed { Text("It could not be opened.").foregroundStyle(Ola.ink3) } else { ProgressView() }
        }
      }
      .navigationTitle(item.name)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
      .quickLookPreview($preview)
    }
    .task {
      guard item.kind != .page, item.kind != .site else { return }
      do { data = try await store.read(item.target) } catch { failed = true }
    }
  }

  @ViewBuilder func content(_ d: Data) -> some View {
    let ext = (item.target as NSString).pathExtension.lowercased()
    if item.kind == .image, ext != "svg", let img = UIImage(data: d) {
      ZoomImage(image: img)
    } else if ext == "svg" {
      SVGView(svg: d).background(Ola.paper)
    } else if ext == "csv" || ext == "tsv" {
      CSVTable(text: String(decoding: d, as: UTF8.self), separator: ext == "tsv" ? "\t" : ",")
    } else if ext == "md" {
      ScrollView { MarkdownView(text: String(decoding: d, as: UTF8.self)).padding(18) }.background(Ola.paper)
    } else if item.kind == .text, let s = String(data: d, encoding: .utf8) {
      ScrollView([.vertical, .horizontal]) { Text(s).font(OlaFont.mono(Metrics.mono)).textSelection(.enabled).padding(16) }.background(Ola.paper)
    } else {
      // PDF and everything else: Quick Look, which also offers Share.
      Color.clear.onAppear {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("ola-files").appendingPathComponent(item.target)
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? d.write(to: url)
        preview = url
      }
    }
  }
}

struct ZoomImage: View {
  var image: UIImage
  @State private var scale: CGFloat = 1
  @State private var last: CGFloat = 1
  var body: some View {
    GeometryReader { g in
      ScrollView([.horizontal, .vertical]) {
        Image(uiImage: image).resizable().scaledToFit()
          .frame(width: g.size.width * scale, height: g.size.height * scale)
      }
      .gesture(MagnificationGesture().onChanged { scale = max(1, min(6, last * $0)) }.onEnded { _ in last = scale })
      .onTapGesture(count: 2) { withAnimation { scale = scale > 1 ? 1 : 2.5; last = scale } }
    }
    .background(Color.black)
  }
}

struct CSVTable: View {
  var text: String
  var separator: Character
  var body: some View {
    let rows = text.split(whereSeparator: \.isNewline).prefix(500).map { $0.split(separator: separator, omittingEmptySubsequences: false).map { $0.trimmingCharacters(in: CharacterSet(charactersIn: "\" ")) } }
    ScrollView([.vertical, .horizontal]) {
      Grid(alignment: .leading, horizontalSpacing: 18, verticalSpacing: 8) {
        ForEach(Array(rows.enumerated()), id: \.offset) { i, r in
          GridRow { ForEach(Array(r.enumerated()), id: \.offset) { _, c in Text(c).font(i == 0 ? OlaFont.sans(Metrics.meta, .semibold) : OlaFont.sans(Metrics.meta)).foregroundStyle(i == 0 ? Ola.ink2 : Ola.ink).lineLimit(1) } }
        }
      }
      .padding(16)
    }
    .background(Ola.paper)
  }
}

struct SafariView: UIViewControllerRepresentable {
  var url: URL
  func makeUIViewController(context: Context) -> SFSafariViewController { SFSafariViewController(url: url) }
  func updateUIViewController(_ vc: SFSafariViewController, context: Context) {}
}
