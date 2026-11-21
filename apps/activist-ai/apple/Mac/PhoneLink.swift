import AppKit
import CoreImage.CIFilterBuiltins
import OlaKit
import SwiftUI

/// The phone pairs with this Mac app and sees what it sees. The relay (OlaKit/Relay.swift) listens
/// on this Mac's Tailscale address only, port 4330, and passes the phone's requests to whichever
/// server the app uses now (the Ola machine, or the agent on this Mac), with that server's real
/// credentials. The phone holds only its pairing secret.
@MainActor
@Observable
final class PhoneLink {
  /// 4330; a check runs on another port (`ola.phone.port`) so it never meets the app's own relay.
  static var port: UInt16 { UInt16(LocalSettings.defaults.integer(forKey: "ola.phone.port")).nonZero ?? 4330 }
  let store: OlaStore
  let relay: MacRelay
  private(set) var phones: [PairingBook.Phone] = []
  private(set) var status = "Off"
  private(set) var listening = false
  private(set) var tailnetName: String?
  /// The code on screen in the pairing sheet (set by Pair a Phone; the sheet follows it).
  var pending: PairingCode?
  /// A pairing could not be made; said under the button.
  private(set) var pairProblem: String?
  private var watcher: Timer?
  private var last: ServerConfig?

  /// Both runtimes (the app's); nil in checks that drive one store.
  weak var whereOla: WhereOlaWorks?
  /// The runtime the relay serves now, for the routes answered off the main actor.
  private let served = RuntimeBox()

  init(store: OlaStore, whereOla: WhereOlaWorks? = nil) {
    self.store = store
    self.whereOla = whereOla
    let book = PairingBook(file: LocalServer.support.appendingPathComponent("phones.json"))
    relay = MacRelay(book: book, macName: Host.current().localizedName ?? "this Mac")
    relay.claudeBase = LocalServer.support
    // The phone's Permissions switch through its Mac: the switch of the runtime the relay serves
    // (OLA-142: one per runtime), changed there.
    let served = served
    relay.permissions = { PermissionSettings.mode(served.get).rawValue }
    relay.setPermissions = { m in
      let r = served.get
      let mode = PermissionMode(rawValue: m) ?? .ask
      if r == .cloud { await PermissionSettings.setCloud(mode) } else { await PermissionSettings.set(mode) }
      return PermissionSettings.mode(r).rawValue
    }
    // "Yes, for the rest of this session" from the phone: kept by the store on the relay's server.
    relay.sessionYes = { [weak self] s, r in await self?.sessionYes(s, r) ?? 503 }
    phones = book.list
  }

  func sessionYes(_ session: String, _ request: String) async -> Int {
    guard let s = whereOla?.store(on: last) ?? (store.config == last ? store : nil) else { return 503 }
    return await s.answerForSession(session: session, request: request)
  }

  /// What the relay serves: the local runtime when this Mac has one running ("Local: through your
  /// Mac" on the phone), else the Ola machine, this Mac's only runtime then.
  var upstream: ServerConfig? {
    guard let w = whereOla else { return store.config }
    return w.localConfig ?? w.store(.cloud).config
  }

  var enabled: Bool { LocalSettings.defaults.bool(forKey: "ola.phone.enabled") }

  /// Only for a driven copy (MacDrive, the phone through this Mac in the simulator on the same Mac):
  /// listen here and put this in the code instead of the Tailscale address and name. A listener bound
  /// to the Tailscale address accepts a connection from the same Mac but never completes it (measured
  /// on the mini Nov 21 with a bare NWListener: accepted, the client timed out), so a simulator on
  /// that Mac cannot use the real route. Nil in the app as people run it.
  nonisolated(unsafe) static var driveHost: String?

  private var generation = 0

  /// Safe to call at once from several places (the toggle and launch): only the newest runs.
  func apply() async {
    generation += 1
    let mine = generation
    relay.stop()
    listening = false
    watcher?.invalidate()
    guard enabled else { status = "Off"; return }
    guard let host = Self.driveHost ?? Tailnet.address() else {
      status = "Tailscale is off on this Mac, so your phone cannot reach it. Turn Tailscale on, then Try Again."
      return
    }
    let name = Self.driveHost != nil ? Self.driveHost : await Task.detached { Tailnet.dnsName() }.value
    guard mine == generation else { return }
    tailnetName = name
    do {
      _ = try await relay.start(host: host, port: Self.port)
      guard mine == generation else { return }
      listening = true
      // Never an IP address: the phone reaches the Mac by its Tailscale name (*.ts.net).
      status = tailnetName.map { "Your phone can reach this Mac at \($0), on Tailscale only." }
        ?? "Tailscale is on, but this Mac's Tailscale name is not known. Turn on MagicDNS in Tailscale, then Try Again."
      follow()
      watcher = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in Task { @MainActor in self.follow() } }
    } catch {
      status = "This Mac could not open the way in for your phone (\(error.localizedDescription))."
    }
  }

  /// The phone follows the Mac's local runtime (and the machine on a Mac without one).
  func follow() {
    let c = upstream
    // The Claude line of the runtime the relay serves (its own store), not of the one on screen.
    let s = whereOla?.store(Runtime.of(c) ?? .cloud) ?? store
    relay.setClaudeLine(s.claudeOn ? "On" : (s.claudeUnavailable == nil ? "Off" : (s.claudeUnavailable!.hasPrefix("Not yet") ? "Not available on the Ola machine yet" : "Off")))
    guard c != last else { return }
    last = c
    served.set(Runtime.of(c) ?? .cloud)
    relay.setUpstream(c, mode: Runtime.of(c) == .local ? "mac" : "machine")
  }

  /// Pair a Phone: a new secret, and the code on screen. Says why when it cannot.
  @discardableResult
  func newPairing() -> PairingCode? {
    pairProblem = nil
    guard listening else { pairProblem = "Turn on Let my phone connect first."; return nil }
    guard let name = tailnetName else { pairProblem = "This Mac's Tailscale name is not known, so the phone could not find it. Turn on MagicDNS in Tailscale, then Try Again."; return nil }
    let secret = PairingCode.newSecret()
    relay.book.add(secret: secret)
    phones = relay.book.list
    let code = PairingCode(host: name, port: Int(Self.port), secret: secret, name: relay.macName)
    pending = code
    PairingWindow.show(code) { [weak self] in self?.pending = nil; self?.refresh() }
    return code
  }

  func remove(_ id: String) {
    relay.book.remove(id)
    relay.cut(phone: id)
    phones = relay.book.list
  }

  func refresh() { phones = relay.book.list }

  func stop() { relay.stop() }
}

struct PhoneSettings: View {
  var link: PhoneLink
  @AppStorage("ola.phone.enabled") private var enabled = false
  @State private var removing: PairingBook.Phone?

  var body: some View {
    SettingsGroup(title: "Phone") {
      VStack(alignment: .leading, spacing: 2) {
        Toggle("Let my phone connect", isOn: $enabled)
          .onChange(of: enabled) { _, _ in Task { await link.apply() } }
        SettingNote("Your iPhone shows these sessions through this app. It needs Tailscale, on the same account.")
      }
      .onAppear { link.refresh() }
      .confirmationDialog("Remove this phone?", isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } })) {
        Button("Remove", role: .destructive) { if let p = removing { link.remove(p.id) } }
      } message: {
        Text("It loses access at once. To use it again, pair it again.")
      }
      if enabled {
        VStack(alignment: .leading, spacing: 6) {
          HStack(alignment: .firstTextBaseline, spacing: Space.s) {
            StatusLine(kind: link.listening ? .ok : link.status == "Off" ? .off : .problem, text: link.status)
            Spacer(minLength: Space.s)
            if !link.listening || link.tailnetName == nil { Button("Try Again") { Task { await link.apply() } } }
            Button("Pair a Phone\u{2026}") { link.newPairing() }.disabled(!link.listening)
          }
          if let p = link.pairProblem { StatusLine(kind: .problem, text: p) }
        }
        ForEach(link.phones) { p in
          HStack(spacing: 10) {
            Image(systemName: "iphone").font(.system(size: 15)).foregroundStyle(.secondary).frame(width: 18)
            VStack(alignment: .leading, spacing: 1) {
              Text(p.label)
              Text(p.lastSeen.map { "Last seen \($0.formatted(date: .abbreviated, time: .shortened))" } ?? "Paired \(p.paired.formatted(date: .abbreviated, time: .shortened)), not used yet")
                .font(.system(size: 11)).foregroundStyle(.secondary).monospacedDigit()
            }
            Spacer()
            Button("Remove\u{2026}") { removing = p }
          }
        }
      }
    }
  }
}

struct CodeBox: Identifiable { var code: PairingCode; var id: String { code.secret } }

struct PairingSheet: View {
  var code: PairingCode
  var done: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: Space.m) {
      Text("Pair your phone").font(OlaFont.sans(Metrics.title, .display)).foregroundStyle(Ola.ink)
      Text("In Ola on your iPhone, choose Scan the Code and point the camera here. Your phone needs Tailscale, signed in to the same account.")
        .font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.ink2).lineSpacing(2).fixedSize(horizontal: false, vertical: true)
      HStack { Spacer(); qr.interpolation(.none).resizable().frame(width: 200, height: 200); Spacer() }
        .padding(Space.m).background(Color.white, in: RoundedRectangle(cornerRadius: 6))
        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Ola.rule, lineWidth: 1))
      Text("Or type this on the phone:").font(OlaFont.sans(Metrics.meta, .semibold)).foregroundStyle(Ola.ink2)
      Text(verbatim: "\(code.host):\(code.port)\n\(code.secret)").font(OlaFont.mono(Metrics.mono)).foregroundStyle(Ola.ink).lineSpacing(2).textSelection(.enabled)
      Text("This code is shown once. It works until you remove the phone in Settings.").font(OlaFont.sans(Metrics.meta)).foregroundStyle(Ola.ink3)
      HStack { Spacer(); Button("Done", action: done).buttonStyle(OlaButton(kind: .primary)).keyboardShortcut(.defaultAction) }
    }
    .padding(Space.xl)
    .frame(width: 400)
    .background(Ola.paper)
  }

  var qr: Image {
    let f = CIFilter.qrCodeGenerator()
    f.message = Data(code.text.utf8)
    f.correctionLevel = "M"
    guard let out = f.outputImage?.transformed(by: CGAffineTransform(scaleX: 12, y: 12)), let cg = CIContext().createCGImage(out, from: out.extent) else { return Image(systemName: "qrcode") }
    return Image(nsImage: NSImage(cgImage: cg, size: NSSize(width: out.extent.width, height: out.extent.height)))
  }
}

extension UInt16 { var nonZero: UInt16? { self == 0 ? nil : self } }

/// A runtime read from any thread (the relay's routes run off the main actor).
final class RuntimeBox: @unchecked Sendable {
  private let lock = NSLock()
  private var r: Runtime = .cloud
  var get: Runtime { lock.withLock { r } }
  func set(_ v: Runtime) { lock.withLock { r = v } }
}

/// The pairing code in a window of its own, brought to the front (a sheet on the Settings window
/// is not something the app could check was showing). A self-test opens it off every display.
@MainActor
enum PairingWindow {
  static let id = "ola.pairing"
  static var offscreen = false
  private static var window: NSWindow?

  static func show(_ code: PairingCode, done: @escaping () -> Void) {
    close()
    let w = OffscreenAwareWindow(contentRect: NSRect(x: 0, y: 0, width: 420, height: 640), styleMask: [.titled, .closable], backing: .buffered, defer: false)
    w.identifier = NSUserInterfaceItemIdentifier(id)
    w.title = "Pair a Phone"
    w.isReleasedWhenClosed = false
    w.contentView = NSHostingView(rootView: PairingSheet(code: code) { close(); done() })
    if offscreen {
      w.free = true
      w.setFrameOrigin(NSPoint(x: -20_000, y: -20_000))
      w.alphaValue = 0
      w.orderBack(nil)
    } else {
      w.center()
      w.level = .floating
      w.makeKeyAndOrderFront(nil)
      NSApp.activate()
    }
    window = w
  }

  static func close() {
    window?.close()
    window = nil
  }
}

final class OffscreenAwareWindow: NSWindow {
  var free = false
  override func constrainFrameRect(_ frameRect: NSRect, to screen: NSScreen?) -> NSRect { free ? frameRect : super.constrainFrameRect(frameRect, to: screen) }
}
