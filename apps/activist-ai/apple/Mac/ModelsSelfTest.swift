import AppKit
import OlaKit
import SwiftUI

/// `Ola --models-selftest --folder <dir> --token-file <file> --model-url <url>`: the Models pane's two
/// fallback switches on a Mac set up the way Bart's was when he said "the models toggle in my
/// settings ... doesn't work" (OLA-220): the old "Where Ola works" key saying the machine
/// (`ola.where = machine`), Local as the last New Session choice, a local folder. Both switches must
/// be usable in Local, ask for consent, turn on, reach the store, and stay on after a relaunch; and
/// they must stay usable with a cloud session on screen. Run it through tools/models-selftest.sh
/// (a hidden second instance, `open -n -g`, against tools/stub-ola.py): its own settings suite,
/// its own scratch Application Support, no Keychain, no window on screen. One PASS or FAIL per check.
@MainActor
enum ModelsSelfTest {
  static var requested: Bool { CommandLine.arguments.contains("--models-selftest") }

  static func run() -> Never {
    let args = CommandLine.arguments
    func after(_ f: String) -> String? { args.firstIndex(of: f).flatMap { $0 + 1 < args.count ? args[$0 + 1] : nil } }
    let t0 = Date()
    var failures = 0
    func say(_ s: String) { print(String(format: "%6.2f  ", Date().timeIntervalSince(t0)) + s); fflush(stdout) }
    func check(_ ok: Bool, _ what: String, _ note: String = "") { if !ok { failures += 1 }; say("\(ok ? "PASS" : "FAIL")  \(what)\(note.isEmpty ? "" : "  (\(note))")") }
    guard let folderPath = after("--folder"), let tokenFile = after("--token-file"), let modelURL = after("--model-url"),
          let token = try? String(contentsOfFile: tokenFile, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines) else {
      say("usage: --models-selftest --folder <dir> --token-file <file> --model-url <url>"); exit(2)
    }
    NSApplication.shared.setActivationPolicy(.prohibited)
    let scratch = FileManager.default.temporaryDirectory.appendingPathComponent("ola-models-check-\(getpid())")
    LocalServer.support = scratch.appendingPathComponent("Ola")
    let suite = "cx.ola.mac.modelscheck.\(getpid())"
    LocalSettings.defaults = UserDefaults(suiteName: suite)!
    LocalSettings.tokenOverride = token
    LocalSettings.modelURLOverride = modelURL
    Credentials.disabled = true
    let d = LocalSettings.defaults
    let folder = URL(fileURLWithPath: (folderPath as NSString).expandingTildeInPath)
    try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    // Bart's settings on build 0.1 (18), as `defaults read cx.ola.mac` showed them.
    d.set("machine", forKey: LocalSettings.legacyModeKey)
    d.set(Runtime.local.rawValue, forKey: RuntimeChoice.key)
    d.set(folder.path, forKey: LocalSettings.folderKey)
    d.set(false, forKey: "ola.phone.enabled")

    func cleanUp() {
      UserDefaults.standard.removePersistentDomain(forName: suite)
      try? FileManager.default.removeItem(at: scratch)
    }

    Task { @MainActor in
      // 1. The first launch of the new build: the old key is read once and removed.
      LocalSettings.migrate()
      check(LocalSettings.shown == .local, "first launch: Local on screen, from the last New Session choice", LocalSettings.shown.rawValue)
      check(d.object(forKey: LocalSettings.legacyModeKey) == nil, "the old \"Where Ola works\" key is gone")

      // 2. The app's two stores, wired as MacApp wires them, and the local agent started.
      let store = OlaStore(config: nil)
      let peer = OlaStore(config: nil)
      let whereOla = WhereOlaWorks(store: store, peer: peer)
      await whereOla.apply()
      for _ in 0..<200 where store.connection != .open { try? await Task.sleep(nanoseconds: 250_000_000) }
      check(store.connection == .open && store.runtime == .local, "the local agent is running and on screen", whereOla.problem ?? "\(store.connection)")
      for _ in 0..<80 where whereOla.hostedStatus.unavailable != nil { try? await Task.sleep(nanoseconds: 250_000_000) }
      check(whereOla.hostedStatus.unavailable == nil, "the gateway says the hosted open model is there for this Mac", whereOla.hostedStatus.unavailable ?? whereOla.hostedStatus.provider ?? "")

      // 3. The pane's switches: enabled, ask first, then on, and the store follows.
      let sw = FallbackSwitches(controller: whereOla, runtime: .local)
      check(!sw.f.claude && !sw.f.hosted, "both fallbacks start off")
      check(sw.enabled(.claude), "Fallback to Claude is enabled in Local", sw.why(.claude) ?? "")
      check(sw.enabled(.hosted), "Fallback to the hosted open model is enabled in Local", sw.why(.hosted) ?? "")
      sw.set(.claude, true)
      check(sw.asking == .claude && !sw.f.claude && !store.claudeOn, "turning Claude on asks for consent first, and nothing is on yet")
      sw.accept()
      check(sw.f.claude && store.claudeOn && store.claudeLauncher != nil, "consent given: Claude is on, and the store offers it", store.claudeUnavailable ?? "")
      sw.set(.hosted, true)
      check(sw.asking == .hosted && !store.hostedOn, "turning the hosted model on asks for consent first")
      sw.accept()
      check(sw.f.hosted && store.hostedOn, "consent given: the hosted open model is on, and the store offers it", store.hosted.unavailable ?? "")
      let saved = FallbackSettings.load(folder.standardizedFileURL.path, defaults: d)
      check(saved.claude && saved.hosted, "both are saved for this folder")

      // 4. A cloud session on screen does not change Local's switches; the cloud says why it has none.
      whereOla.show(.cloud)
      let sw2 = FallbackSwitches(controller: whereOla, runtime: .local)
      check(sw2.enabled(.claude) && sw2.enabled(.hosted) && sw2.f.claude && sw2.f.hosted, "with a cloud session on screen, Local's switches stay on and usable")
      check(whereOla.store(.local).claudeOn && whereOla.store(.local).hostedOn, "and the local runtime's store keeps both")
      check(!store.claudeOn && !store.hostedOn && whereOla.claudeUnavailable(.cloud) != nil, "the cloud session offers neither, and says why", whereOla.claudeUnavailable(.cloud) ?? "")
      whereOla.show(.local)
      // Off asks nothing and takes effect at once.
      sw.set(.hosted, false)
      check(sw.asking == nil && !store.hostedOn, "turning one off needs no consent")
      sw.set(.hosted, true); sw.accept()
      whereOla.stop()

      // 5. A relaunch: a new controller and new stores over the same settings.
      LocalSettings.migrate()
      check(LocalSettings.shown == .local, "after a relaunch Local is still on screen")
      let s2 = OlaStore(config: nil)
      let w2 = WhereOlaWorks(store: s2, peer: OlaStore(config: nil))
      await w2.apply()
      for _ in 0..<80 where w2.hostedStatus.unavailable != nil { try? await Task.sleep(nanoseconds: 250_000_000) }
      let sw3 = FallbackSwitches(controller: w2, runtime: .local)
      check(sw3.f.claude && sw3.f.hosted, "after a relaunch both switches are still on")
      check(s2.claudeOn && s2.hostedOn, "and the store offers both", "claude \(s2.claudeOn), hosted \(s2.hostedOn)")
      w2.stop()

      cleanUp()
      say(failures == 0 ? "ALL PASSED" : "\(failures) FAILED")
      exit(failures == 0 ? 0 : 1)
    }
    NSApplication.shared.run()
    exit(1)
  }
}
