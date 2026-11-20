import AppKit
import OlaKit
import SwiftUI

/// `Ola -OlaMotion <dir>`: renders the Hop (Shared/OlaHop.swift) frame by frame at 60 fps, two
/// loops, light and dark, into PNG folders (tools/motion.sh turns them into MP4s and GIFs). Off
/// screen like Snapshot: no window, the app never becomes active.
/// `Ola -OlaMotionCPU <seconds>`: runs a live Hop at the run line's size in a window ordered in far
/// off every display and prints this process's CPU. `-OlaLarge` for 360 wide.
@MainActor
enum MotionRender {
  static func arg(_ name: String, _ n: Int = 1) -> String? {
    let a = CommandLine.arguments
    guard let i = a.firstIndex(of: name), i + n < a.count else { return nil }
    return a[i + n]
  }
  static var outputDirectory: URL? { arg("-OlaMotion").map { URL(fileURLWithPath: $0) } }
  static var cpuRequested: Bool { CommandLine.arguments.contains("-OlaMotionCPU") }

  static func run(to dir: URL) {
    NSApplication.shared.setActivationPolicy(.prohibited)
    for (name, dark, back) in [("hop-light", false, Color.white), ("hop-dark", true, Color(red: 0x25 / 255, green: 0x25 / 255, blue: 0x28 / 255))] {
      let out = dir.appendingPathComponent("frames/\(name)")
      try? FileManager.default.removeItem(at: out)
      try? FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
      let count = Int(2 * HopMotion.loop * 60)
      for i in 0..<count {
        let r = ImageRenderer(content: OlaHop(width: 360).environment(\.hopClock, Double(i) / 60).environment(\.colorScheme, dark ? .dark : .light)
          .frame(width: 360, height: 180).background(back))
        r.scale = 1
        if let img = r.cgImage {
          try? NSBitmapImageRep(cgImage: img).representation(using: .png, properties: [:])?.write(to: out.appendingPathComponent(String(format: "%05d.png", i + 1)))
        }
      }
      print("\(name): \(count) frames")
    }
    exit(0)
  }

  static func measureCPU() {
    let seconds = Double(arg("-OlaMotionCPU") ?? "20") ?? 20
    let width: CGFloat = CommandLine.arguments.contains("-OlaLarge") ? 360 : Metrics.hopLine
    let view = VStack { OlaHop(width: width) }
      .frame(width: 400, height: 200).background(Ola.paper)
      .environment(\.scenePhase, .active)
    let host = NSHostingView(rootView: view)
    let far = CGPoint(x: -30_000, y: -30_000)
    let window = SnapshotWindow(contentRect: NSRect(origin: far, size: CGSize(width: 400, height: 200)), styleMask: [.borderless], backing: .buffered, defer: false)
    window.contentView = host
    window.isReleasedWhenClosed = false
    NSApplication.shared.setActivationPolicy(.accessory)
    window.orderFrontRegardless()
    window.setFrameOrigin(far)
    func cpu() -> Double { var u = rusage(); getrusage(RUSAGE_SELF, &u); return Double(u.ru_utime.tv_sec) + Double(u.ru_utime.tv_usec) / 1e6 + Double(u.ru_stime.tv_sec) + Double(u.ru_stime.tv_usec) / 1e6 }
    // On the app's own event loop, as in real use: settle 2 s, then measure.
    Timer.scheduledTimer(withTimeInterval: 2, repeats: false) { _ in
      let c0 = cpu(), w0 = Date()
      Timer.scheduledTimer(withTimeInterval: seconds, repeats: false) { _ in
        let wall = Date().timeIntervalSince(w0)
        print(String(format: "hop at %.0f pt: CPU %.2f%% of one core over %.0f s", width, (cpu() - c0) / wall * 100, wall))
        MainActor.assumeIsolated { window.orderOut(nil) }
        exit(0)
      }
    }
    NSApplication.shared.run()
  }
}
