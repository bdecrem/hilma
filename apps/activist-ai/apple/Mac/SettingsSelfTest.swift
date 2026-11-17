import AppKit
import OlaKit
import SwiftUI

/// `Ola --settings-selftest --folder <dir> --token-file <file>`: the Settings window's controls,
/// driven the way its buttons drive them, in a hidden instance (run it with tools/settings-selftest.sh,
/// `open -n -g`). Its own settings suite, its own scratch Application Support, its own relay port
/// (4339), no Keychain: it changes nothing of the app Bart has open. The Settings view is drawn in
/// a window that is never shown. One PASS or FAIL line per check.
@MainActor
enum SettingsSelfTest {
  static var requested: Bool { CommandLine.arguments.contains("--settings-selftest") }

  static func run() -> Never {
    let args = CommandLine.arguments
    func after(_ f: String) -> String? { args.firstIndex(of: f).flatMap { $0 + 1 < args.count ? args[$0 + 1] : nil } }
    let t0 = Date()
    var failures = 0
    func say(_ s: String) { print(String(format: "%6.2f  ", Date().timeIntervalSince(t0)) + s); fflush(stdout) }
    func check(_ ok: Bool, _ what: String, _ note: String = "") { if !ok { failures += 1 }; say("\(ok ? "PASS" : "FAIL")  \(what)\(note.isEmpty ? "" : "  (\(note))")") }
    guard let folderPath = after("--folder"), let tokenFile = after("--token-file"),
          let token = try? String(contentsOfFile: tokenFile, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines) else {
      say("usage: --settings-selftest --folder <dir> --token-file <file>"); exit(2)
    }
    NSApplication.shared.setActivationPolicy(.prohibited)
    let scratch = FileManager.default.temporaryDirectory.appendingPathComponent("ola-settings-check-\(getpid())")
    LocalServer.support = scratch.appendingPathComponent("Ola")
    let suite = "cx.ola.mac.selftest.\(getpid())"
    LocalSettings.defaults = UserDefaults(suiteName: suite)!
    LocalSettings.tokenOverride = token
    Credentials.disabled = true
    PairingWindow.offscreen = true
    let d = LocalSettings.defaults
    d.set("mac", forKey: LocalSettings.modeKey)
    d.set((folderPath as NSString).expandingTildeInPath, forKey: LocalSettings.folderKey)
    d.set(4339, forKey: "ola.phone.port")
    d.set(false, forKey: "ola.phone.enabled")

    let store = OlaStore(config: nil)
    let whereOla = WhereOlaWorks(store: store)
    let link = PhoneLink(store: store)
    func settle(_ s: Double = 0.5) { let end = Date().addingTimeInterval(s); while Date() < end { RunLoop.main.run(until: Date().addingTimeInterval(0.05)) } }
    func children() -> [(pid: Int32, port: Int)] {
      let p = Process()
      p.executableURL = URL(fileURLWithPath: "/bin/ps")
      p.arguments = ["-o", "pid=,ppid=,args=", "-A"]
      let out = Pipe()
      p.standardOutput = out
      try? p.run()
      let text = String(decoding: out.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
      p.waitUntilExit()
      return text.split(separator: "\n").compactMap { line in
        let f = line.split(separator: " ", omittingEmptySubsequences: true)
        guard f.count > 3, Int32(f[1]) == getpid(), line.contains("opencode"), line.contains("serve"), let i = f.firstIndex(of: "--port"), i + 1 < f.count, let port = Int(f[i + 1]) else { return nil }
        return (Int32(f[0]) ?? 0, port)
      }
    }

    Task { @MainActor in
      settle()
      var tt = Date()
      let named = Tailnet.dnsName()
      say("this Mac's Tailscale name: \(named ?? "none") in \(String(format: "%.1f", Date().timeIntervalSince(tt))) s")
      tt = Date()
      // 1. Phone: turn it on, pair, and the code and its window are there.
      d.set(true, forKey: "ola.phone.enabled")
      await link.apply()
      // The view's own toggle may have applied too; wait for whichever is newest.
      for _ in 0..<120 where !link.listening { settle(0.5) }
      say("phone setting applied in \(String(format: "%.1f", Date().timeIntervalSince(tt))) s")
      check(link.listening, "Let my phone connect starts the relay", Tailnet.address().map { "on \($0):4339" } ?? "Tailscale is off")
      check(link.tailnetName?.hasSuffix(".ts.net") == true, "this Mac's Tailscale name is known", link.tailnetName ?? "none")
      check(!link.status.contains(Tailnet.address() ?? "\u{0}"), "the status names the Mac, never an IP address", link.status)
      let code = link.newPairing()
      settle(1)
      check(code?.host.hasSuffix(".ts.net") == true, "Pair a Phone makes a code with the Mac's Tailscale name", code.map { "\($0.host):\($0.port)" } ?? (link.pairProblem ?? "no code"))
      let shown = NSApp.windows.first { $0.identifier?.rawValue == PairingWindow.id && $0.isVisible }
      check(shown != nil, "the pairing code's window is open, in the app's window list", shown.map { "\(Int($0.frame.width))x\(Int($0.frame.height))" } ?? "no window")
      PairingWindow.close()
      link.pending = nil
      settle()

      let host = NSHostingView(rootView: SettingsView(store: store, whereOla: whereOla, phoneLink: link).defaultAppStorage(d))
      // Ordered in, so a sheet can attach to it, but far outside every display and fully
      // transparent; the app never becomes active, so nothing appears on Bart's screen.
      let window = OffscreenWindow(contentRect: NSRect(x: -20_000, y: -20_000, width: 600, height: 900), styleMask: [.titled], backing: .buffered, defer: false)
      window.contentView = host
      window.isReleasedWhenClosed = false
      window.alphaValue = 0
      window.ignoresMouseEvents = true
      window.orderBack(nil)
      settle()
      check(window.contentView != nil, "the Settings view draws with the phone on and the agent on this Mac")
      // 2. One local agent, tracked, through launch, the Phone toggle, two mode switches and Save.
      async let a: Void = whereOla.apply()   // launch
      async let b: Void = whereOla.apply()   // and Settings applying at the same moment
      _ = await (a, b)
      d.set(false, forKey: "ola.phone.enabled"); await link.apply()
      d.set(true, forKey: "ola.phone.enabled"); await link.apply()
      d.set("machine", forKey: LocalSettings.modeKey); await whereOla.apply()
      d.set("mac", forKey: LocalSettings.modeKey); await whereOla.apply()
      d.set("machine", forKey: LocalSettings.modeKey); await whereOla.apply()
      d.set("mac", forKey: LocalSettings.modeKey); await whereOla.apply()
      await whereOla.apply()                  // Save
      settle(1)
      let kids = children()
      check(kids.count == 1, "exactly one local agent is running", kids.map { "pid \($0.pid) port \($0.port)" }.joined(separator: ", "))
      check(kids.first?.port == store.config?.url.port, "the app uses that agent", "store port \(store.config?.url.port ?? 0)")
      var info: JSON?
      if let c = store.config { info = try? await OpenCodeClient(c).info() }
      check(info?["version"].str == "2.3.0", "and it answers", info?["version"].str ?? "no answer")
      // Wait by yielding the main actor (spinning the run loop here would starve the listener).
      for _ in 0..<120 where store.connection != .open { try? await Task.sleep(nanoseconds: 250_000_000) }
      check(store.connection == .open, "the app is connected to it", "\(store.connection)")
      check(whereOla.localState.hasPrefix("Running"), "Settings says the agent on this Mac is running, with no address", whereOla.problem ?? whereOla.localState)

      // 3. Back to the machine: the agent stops.
      d.set("machine", forKey: LocalSettings.modeKey); await whereOla.apply()
      settle(1)
      check(children().isEmpty, "switching to the Ola machine stops the local agent")

      link.stop()
      UserDefaults.standard.removePersistentDomain(forName: suite)
      try? FileManager.default.removeItem(at: scratch)
      say(failures == 0 ? "ALL PASSED" : "\(failures) FAILED")
      exit(failures == 0 ? 0 : 1)
    }
    NSApplication.shared.run()
    exit(1)
  }
}

/// Stays where it is put, even off every display.
final class OffscreenWindow: NSWindow {
  override func constrainFrameRect(_ frameRect: NSRect, to screen: NSScreen?) -> NSRect { frameRect }
}
