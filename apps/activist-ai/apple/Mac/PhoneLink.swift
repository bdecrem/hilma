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

  init(store: OlaStore) {
    self.store = store
    let book = PairingBook(file: LocalServer.support.appendingPathComponent("phones.json"))
    relay = MacRelay(book: book, macName: Host.current().localizedName ?? "this Mac")
    phones = book.list
  }

  var enabled: Bool { LocalSettings.defaults.bool(forKey: "ola.phone.enabled") }

  private var generation = 0

  /// Safe to call at once from several places (the toggle and launch): only the newest runs.
  func apply() async {
    generation += 1
    let mine = generation
    relay.stop()
    listening = false
    watcher?.invalidate()
    guard enabled else { status = "Off"; return }
    guard let host = Tailnet.address() else {
      status = "Tailscale is off on this Mac, so your phone cannot reach it. Turn Tailscale on, then Try Again."
      return
    }
    let name = await Task.detached { Tailnet.dnsName() }.value
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

  /// The phone follows whatever the Mac app uses, including a switch of "Where Ola works".
  func follow() {
    let c = store.config
    guard c != last else { return }
    last = c
    relay.setUpstream(c, mode: c?.url.host() == "127.0.0.1" ? "mac" : "machine")
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
    VStack(alignment: .leading, spacing: 10) {
      Toggle("Let my phone connect", isOn: $enabled)
        .onChange(of: enabled) { _, _ in Task { await link.apply() } }
      Text("Ola on your iPhone works through this app: it shows these sessions, in either place Ola works. Your phone needs Tailscale, signed in to the same account.")
        .font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
      if enabled {
        Text(link.status).font(.callout).foregroundStyle(link.listening ? Color.secondary : Color.red).fixedSize(horizontal: false, vertical: true)
        HStack {
          Button("Pair a Phone\u{2026}") { link.newPairing() }.disabled(!link.listening)
          if !link.listening || link.tailnetName == nil { Button("Try Again") { Task { await link.apply() } } }
        }
        if let p = link.pairProblem { Text(p).font(.callout).foregroundStyle(.red).fixedSize(horizontal: false, vertical: true) }
        if !link.phones.isEmpty {
          ForEach(link.phones) { p in
            HStack {
              Image(systemName: "iphone")
              VStack(alignment: .leading) {
                Text(p.label)
                Text(p.lastSeen.map { "Last seen \($0.formatted(date: .abbreviated, time: .shortened))" } ?? "Paired \(p.paired.formatted(date: .abbreviated, time: .shortened)), not used yet")
                  .font(.caption).foregroundStyle(.secondary)
              }
              Spacer()
              Button("Remove\u{2026}") { removing = p }
            }
          }
        }
      }
    }
    .onAppear { link.refresh() }
    .confirmationDialog("Remove this phone?", isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } })) {
      Button("Remove", role: .destructive) { if let p = removing { link.remove(p.id) } }
    } message: {
      Text("It loses access at once. To use it again, pair it again.")
    }
  }
}

struct CodeBox: Identifiable { var code: PairingCode; var id: String { code.secret } }

struct PairingSheet: View {
  var code: PairingCode
  var done: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      Text("Pair your phone").font(OlaFont.sans(22, .display)).foregroundStyle(Ola.ink)
      Text("In Ola on your iPhone, choose Scan the Code and point the camera here. Your phone needs Tailscale, signed in to the same account.")
        .font(OlaFont.serif(Metrics.reading - 1)).foregroundStyle(Ola.ink2).fixedSize(horizontal: false, vertical: true)
      HStack { Spacer(); qr.interpolation(.none).resizable().frame(width: 220, height: 220); Spacer() }
        .padding(12).background(Color.white, in: RoundedRectangle(cornerRadius: 6))
      Text("Or type this on the phone:").font(OlaFont.sans(Metrics.meta, .semibold)).foregroundStyle(Ola.ink2)
      Text(verbatim: "\(code.host):\(code.port)\n\(code.secret)").font(OlaFont.mono(13)).foregroundStyle(Ola.ink).textSelection(.enabled)
      Text("This code is shown once. It works until you remove the phone in Settings.").font(OlaFont.sans(Metrics.meta)).foregroundStyle(Ola.ink3)
      HStack { Spacer(); Button("Done", action: done).buttonStyle(OlaButton(kind: .primary)).keyboardShortcut(.defaultAction) }
    }
    .padding(26)
    .frame(width: 420)
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
