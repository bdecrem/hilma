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
    let shots: [(String, String, Treatment, NSAppearance.Name, CGSize)] = [
      ("mac-A-sheet-light", "main", .sheet, .aqua, CGSize(width: 1440, height: 900)),
      ("mac-B-flush-light", "main", .flush, .aqua, CGSize(width: 1440, height: 900)),
      ("mac-B-flush-approval", "approval", .flush, .aqua, CGSize(width: 1440, height: 900)),
      // The chosen look, A.
      ("mac-conversation-light", "main", .sheet, .aqua, CGSize(width: 1440, height: 900)),
      ("mac-conversation-dark", "main", .sheet, .darkAqua, CGSize(width: 1440, height: 900)),
      ("mac-approval-light", "approval", .sheet, .aqua, CGSize(width: 1440, height: 900)),
      ("mac-approval-dark", "approval", .sheet, .darkAqua, CGSize(width: 1440, height: 900)),
      ("mac-new-session", "empty", .sheet, .aqua, CGSize(width: 1200, height: 760)),
      ("mac-unreachable", "unreachable", .sheet, .aqua, CGSize(width: 1200, height: 760)),
    ]
    let only = CommandLine.arguments.firstIndex(of: "-OlaOnly").map { CommandLine.arguments[$0 + 1] }
    for (name, fixture, treatment, appearance, size) in shots where only == nil || name.contains(only!) {
      let store = OlaStore(fixture: Fixture.named(fixture))
      let root = SnapshotFrame(store: store, treatment: treatment).environment(\.treatment, treatment)
      write(root, size: size, appearance: appearance, to: dir.appendingPathComponent("\(name).png"), titled: false)
    }
    // The connect sheet on its own.
    let connect = ConnectForm(store: OlaStore(config: nil)).frame(width: 440)
    write(connect, size: CGSize(width: 440, height: 470), appearance: .aqua, to: dir.appendingPathComponent("mac-connect.png"), titled: false)
    print("wrote \(dir.path)")
    exit(0)
  }

  static func write<V: View>(_ view: V, size: CGSize, appearance: NSAppearance.Name, to url: URL, titled: Bool = true) {
    let host = NSHostingView(rootView: view)
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
}
