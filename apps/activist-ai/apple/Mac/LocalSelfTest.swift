import Foundation
import OlaKit

/// `Ola --local-selftest <folder> [--token-file <file>]`: starts "On this Mac" exactly as the app
/// does (same binary, same LocalServer, launched as the app), prints every step and what opencode
/// printed, asks it for /api/info, stops it, and exits 0 or 1. No window. Without --token-file
/// the model token comes from the app's Keychain item. Run it through LaunchServices so the app is
/// the responsible process, as when Bart clicks it:
///   open -n -g -W --stdout <log> --stderr <log> Ola.app --args --local-selftest <folder>
enum LocalSelfTest {
  static var requested: Bool { CommandLine.arguments.contains("--local-selftest") }

  static func run() -> Never {
    let args = CommandLine.arguments
    func after(_ flag: String) -> String? { args.firstIndex(of: flag).flatMap { $0 + 1 < args.count ? args[$0 + 1] : nil } }
    let t0 = Date()
    func say(_ s: String) {
      print(String(format: "%6.2f  ", Date().timeIntervalSince(t0)) + s)
      fflush(stdout)
    }
    guard let folderPath = after("--local-selftest") else { say("usage: --local-selftest <folder> [--token-file <file>]"); exit(2) }
    let folder = URL(fileURLWithPath: (folderPath as NSString).expandingTildeInPath)
    let token = after("--token-file").flatMap { try? String(contentsOfFile: $0, encoding: .utf8) }?.trimmingCharacters(in: .whitespacesAndNewlines) ?? LocalSettings.token
    guard let token, !token.isEmpty else { say("FAIL  no model token (--token-file, or the Keychain)"); exit(1) }
    say("app: \(Bundle.main.bundlePath), pid \(getpid()), parent \(getppid())")
    say("opencode: \(LocalServer.binary?.path ?? "NOT FOUND")")
    let sem = DispatchSemaphore(value: 0)
    var ok = false
    Task.detached {
      let server = LocalServer(folder: folder)
      // --fresh: opencode's own state in a new empty folder, as on the very first start.
      if args.contains("--fresh") {
        server.stateBase = FileManager.default.temporaryDirectory.appendingPathComponent("ola-fresh-\(getpid())")
        say("fresh opencode state in \(server.stateBase!.path)")
      } else {
        // Never the app's own state folder, so a check cannot end the app's running server.
        server.stateBase = LocalServer.support.appendingPathComponent("selftest")
      }
      do {
        let c = try await server.start(modelToken: token, trace: { say($0) })
        let info = try await OpenCodeClient(c).info()
        say("PASS  local opencode \(info["version"].str) answers in \(folder.path)")
        ok = true
      } catch {
        say("FAIL  \(error.localizedDescription)")
      }
      server.stop()
      say("stopped")
      sem.signal()
    }
    sem.wait()
    exit(ok ? 0 : 1)
  }
}
