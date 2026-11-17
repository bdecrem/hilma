#if os(macOS)
import Foundation

/// Puts the `ola` command on this Mac: a two-line launcher that runs the app's own executable in
/// its command mode (`Ola --cli …`), so the command has the app's signature and reads the app's
/// Keychain item with no question. It goes into the first writable folder among ~/.local/bin,
/// /opt/homebrew/bin and /usr/local/bin that a login shell has on its PATH.
public enum CLIInstall {
  static let marker = "# ola: Ola in this folder. Installed by the Ola app"

  public static func launcher(for app: URL) -> String {
    let exe = app.path.replacingOccurrences(of: "\"", with: "\\\"")
    return """
    #!/bin/sh
    \(marker) (Settings, Install the ola Command).
    if [ ! -x "\(exe)" ]; then echo "ola: the Ola app is not where it was. Open Ola, then Settings, Install the ola Command." >&2; exit 1; fi
    exec "\(exe)" --cli "$@"

    """
  }

  static var home: String { FileManager.default.homeDirectoryForCurrentUser.path }
  public static var candidates: [String] { [home + "/.local/bin", "/opt/homebrew/bin", "/usr/local/bin"] }

  /// The PATH a login shell starts with (Terminal opens one), from the person's own shell.
  public static func loginPath() -> [String] {
    let shell = ProcessInfo.processInfo.environment["SHELL"].flatMap { FileManager.default.isExecutableFile(atPath: $0) ? $0 : nil } ?? "/bin/zsh"
    let p = Process()
    p.executableURL = URL(fileURLWithPath: shell)
    p.arguments = ["-l", "-c", "printf '%s' \"$PATH\""]
    let out = Pipe()
    p.standardOutput = out
    p.standardError = FileHandle.nullDevice
    p.standardInput = FileHandle.nullDevice
    guard (try? p.run()) != nil else { return [] }
    let deadline = Date().addingTimeInterval(8)
    while p.isRunning, Date() < deadline { usleep(50_000) }
    if p.isRunning { p.terminate(); return [] }
    let text = String(decoding: out.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
    return text.split(separator: ":").map { String($0).replacingOccurrences(of: "~", with: home) }
  }

  /// Where an `ola` made by this app is, if anywhere.
  public static func installedPath(in dirs: [String] = candidates) -> String? {
    for d in dirs {
      let f = d + "/ola"
      if let t = try? String(contentsOfFile: f, encoding: .utf8), t.contains(marker) { return f }
    }
    return nil
  }

  public struct Result: Equatable, Sendable {
    public var path: String?
    /// For Settings: plain words, no paths.
    public var message: String
    /// For a terminal: where it went.
    public var detail: String
  }

  /// Installs (or refreshes) the launcher. `appExecutable` is the app's own executable.
  public static func install(appExecutable: URL?, dirs: [String] = candidates, path: [String]? = nil) -> Result {
    guard let exe = appExecutable else { return Result(path: nil, message: "Ola couldn\u{2019}t find itself to make the command.", detail: "no app executable") }
    let onPath = Set(path ?? loginPath())
    let fm = FileManager.default
    var skipped: [String] = []
    for d in dirs where onPath.contains(d) {
      let f = d + "/ola"
      if fm.fileExists(atPath: f), let t = try? String(contentsOfFile: f, encoding: .utf8), !t.contains(marker) {
        skipped.append(f)
        continue
      }
      if !fm.fileExists(atPath: d) { try? fm.createDirectory(atPath: d, withIntermediateDirectories: true) }
      guard fm.isWritableFile(atPath: d) else { continue }
      let tmp = d + "/.ola-\(getpid())"
      do {
        try launcher(for: exe).write(toFile: tmp, atomically: false, encoding: .utf8)
        try fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: tmp)
        if fm.fileExists(atPath: f) { try fm.removeItem(atPath: f) }
        try fm.moveItem(atPath: tmp, toPath: f)
        return Result(path: f, message: "Installed. In Terminal, go to a folder and type ola.", detail: "installed the ola command at \(f)")
      } catch {
        try? fm.removeItem(atPath: tmp)
      }
    }
    if !skipped.isEmpty {
      return Result(path: nil, message: "Another program called ola is already installed, so Ola left it alone.", detail: "left alone (not Ola's): \(skipped.joined(separator: ", "))")
    }
    return Result(path: nil, message: "Ola couldn\u{2019}t find a place for the command that Terminal looks in.",
                  detail: "none of \(dirs.joined(separator: ", ")) is both writable and on a login shell's PATH; add \(home)/.local/bin to PATH and install again")
  }
}
#endif
