import AppKit
import OlaKit
import SwiftUI

/// `Ola --permissions-selftest --folder <dir> --token-file <file> [--shots <dir>] [--model-url <url>]`: Permissions
/// (Settings, General) as Bart meets them, in a hidden instance with its own settings suite and
/// scratch Application Support (run it through LaunchServices: tools/permissions-selftest.sh).
/// "On this Mac" in <dir>, the app's own store wired the way the app wires it, real requests to the
/// real model:
///   1. Lots of permissions: a multi-step request (a folder and three files) runs start to finish
///      with no approval card at any moment.
///   2. Ask before each step: the next request shows the card; allowed once, it finishes.
///   3. Back to Lots in the same session, no restart: the next step goes ahead again.
/// With --shots, the window at each point (MacRoot, drawn off screen). One PASS or FAIL per check.
@MainActor
enum PermissionsSelfTest {
  static var requested: Bool { CommandLine.arguments.contains("--permissions-selftest") }

  static func run() -> Never {
    let args = CommandLine.arguments
    func after(_ f: String) -> String? { args.firstIndex(of: f).flatMap { $0 + 1 < args.count ? args[$0 + 1] : nil } }
    let t0 = Date()
    var failures = 0
    func say(_ s: String) { print(String(format: "%6.1f  ", Date().timeIntervalSince(t0)) + s); fflush(stdout) }
    func check(_ ok: Bool, _ what: String, _ note: String = "") { if !ok { failures += 1 }; say("\(ok ? "PASS" : "FAIL")  \(what)\(note.isEmpty ? "" : "  (\(note))")") }
    guard let folderPath = after("--folder"), let tokenFile = after("--token-file"),
          let token = try? String(contentsOfFile: tokenFile, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines) else {
      say("usage: --permissions-selftest --folder <dir> --token-file <file> [--shots <dir>]"); exit(2)
    }
    let folder = URL(fileURLWithPath: (folderPath as NSString).expandingTildeInPath)
    let shots = after("--shots").map { URL(fileURLWithPath: ($0 as NSString).expandingTildeInPath) }
    if let shots { try? FileManager.default.createDirectory(at: shots, withIntermediateDirectories: true) }
    NSApplication.shared.setActivationPolicy(.prohibited)
    let scratch = FileManager.default.temporaryDirectory.appendingPathComponent("ola-permissions-check-\(getpid())")
    LocalServer.support = scratch.appendingPathComponent("Ola")
    let suite = "cx.ola.mac.permcheck.\(getpid())"
    LocalSettings.defaults = UserDefaults(suiteName: suite)!
    LocalSettings.tokenOverride = token
    // --model-url <http://host:port/v1>: another way to the model (a Mac without Tailscale reaches
    // the machine's model door through an ssh tunnel).
    if let u = after("--model-url") { LocalSettings.modelURLOverride = u }
    Credentials.disabled = true
    let d = LocalSettings.defaults
    d.set(Runtime.local.rawValue, forKey: LocalSettings.shownKey)
    d.set(folder.path, forKey: LocalSettings.folderKey)
    d.set(false, forKey: "ola.phone.enabled")

    let store = OlaStore(config: nil)
    let whereOla = WhereOlaWorks(store: store)
    PermissionSettings.wire(store)
    var cardsShown = 0
    store.onApproval = { _, _ in cardsShown += 1 }

    func shot(_ name: String) {
      guard let shots else { return }
      Snapshot.write(MacRoot(store: store).defaultAppStorage(d), size: CGSize(width: 1280, height: 820), appearance: .aqua, to: shots.appendingPathComponent("\(name).png"), titled: true)
      say("shot \(name).png")
    }

    /// Waits for the selected session's last turn to end, noting whether a card was ever up.
    func waitForEnd(seconds: Double, stopAtCard: Bool = false) async -> (ended: Bool, sawCard: Bool) {
      var saw = false
      let end = Date().addingTimeInterval(seconds)
      while Date() < end {
        if store.conversation?.approval != nil { saw = true; if stopAtCard { return (false, true) } }
        if let t = store.conversation?.turns.last, !t.isRunning, t.status != .sending, !store.running.contains(store.selectedID ?? "") { return (true, saw) }
        try? await Task.sleep(nanoseconds: 100_000_000)
      }
      return (false, saw)
    }

    Task { @MainActor in
      PermissionSettings.mode = .lots
      check(PermissionSettings.mode == .lots, "Lots of permissions is the default")
      await whereOla.apply()
      for _ in 0..<200 where store.connection != .open { try? await Task.sleep(nanoseconds: 250_000_000) }
      check(store.connection == .open, "the app is connected to its agent on this Mac", whereOla.problem ?? "\(store.connection)")
      guard store.connection == .open else { finish() }
      let notes = folder.appendingPathComponent("notes")
      try? FileManager.default.removeItem(at: notes)

      // 1. Lots: a multi-step request, start to finish, no card.
      store.newSession()
      await store.sendToOla("Make a folder called notes here, and write three short files in it: one.md, two.md and three.md. Each one says, in two sentences, a different reason tenants form a union. Then list the notes folder.")
      let r1 = await waitForEnd(seconds: 420)
      let t1 = store.conversation?.turns.last
      check(r1.ended && t1?.status == .done, "Lots: the request ran to the end", t1.map { "\($0.status), \($0.steps.count) steps" } ?? "no turn")
      let made = ["one.md", "two.md", "three.md"].filter { FileManager.default.fileExists(atPath: notes.appendingPathComponent($0).path) }
      check(made.count == 3, "Lots: the folder and its three files are there", made.joined(separator: ", "))
      check(!r1.sawCard && cardsShown == 0, "Lots: no approval card at any moment", "cards \(cardsShown)")
      check(store.wentAhead >= 2, "Lots: the ask-first steps went ahead without asking", "\(store.wentAhead) went ahead")
      shot("1-lots-done")

      // 2. Ask: the card comes back for the next request, no restart.
      PermissionSettings.mode = .ask
      let before = store.wentAhead
      await store.sendToOla("Write a file called ask-check.txt here containing just the word hello.")
      let r2 = await waitForEnd(seconds: 300, stopAtCard: true)
      check(r2.sawCard, "Ask: the approval card is shown", store.conversation?.approval?.title ?? "no card")
      shot("2-ask-card")
      if r2.sawCard {
        await store.answer(.once)
        let r2b = await waitForEnd(seconds: 300)
        check(r2b.ended && FileManager.default.fileExists(atPath: folder.appendingPathComponent("ask-check.txt").path), "Ask: allowed once, the file is written")
      }
      check(store.wentAhead == before, "Ask: nothing went ahead without asking")

      // 3. Back to Lots in the same session: the next step goes ahead again.
      PermissionSettings.mode = .lots
      cardsShown = 0
      await store.sendToOla("Now write a file called lots-again.txt here containing just the word world.")
      let r3 = await waitForEnd(seconds: 300)
      check(r3.ended && !r3.sawCard && cardsShown == 0 && FileManager.default.fileExists(atPath: folder.appendingPathComponent("lots-again.txt").path), "Lots again: the next step went ahead, no card, no restart", "went ahead \(store.wentAhead - before)")
      shot("3-lots-again")
      finish()
    }

    func finish() -> Never {
      whereOla.stop()
      UserDefaults.standard.removePersistentDomain(forName: suite)
      try? FileManager.default.removeItem(at: scratch)
      say(failures == 0 ? "ALL PASSED" : "\(failures) FAILED")
      exit(failures == 0 ? 0 : 1)
    }
    NSApplication.shared.run()
    exit(1)
  }
}
