#if os(macOS)
import Foundation
import Security

/// "On this Mac": the Claude Code arrangement. The agent runs here, as `opencode serve` on
/// 127.0.0.1, in a folder Bart picks; only its model requests go to the Ola machine, through the
/// forwarder on the machine's Tailscale address to Ola's gateway (`bart/forward.mjs`). The app is
/// a client of this server exactly as it is of the machine's.
///
/// The config is written under Application Support, never into the project folder (the agent
/// could rewrite its own permissions there). The gateway token and the server password reach
/// opencode through its environment, never a file.
public final class LocalServer: @unchecked Sendable {
  /// Application Support/Ola. A self-test points it at a scratch folder.
  nonisolated(unsafe) public static var support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Ola")
  /// Where tools/install-local-opencode.sh puts opencode 2.3.0.
  public static var binary: URL? {
    // Always the real install, also when a self-test points `support` at a scratch folder.
    let mine = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Ola/opencode/node_modules/.bin/opencode")
    if FileManager.default.isExecutableFile(atPath: mine.path) { return mine }
    for p in ["/opt/homebrew/bin/opencode", "/usr/local/bin/opencode"] where FileManager.default.isExecutableFile(atPath: p) { return URL(fileURLWithPath: p) }
    return nil
  }
  public static let defaultModelURL = "http://100.95.51.98:4311/v1"

  public let folder: URL
  public private(set) var port: Int
  /// Where opencode keeps its config, sessions and caches (default: Application Support/Ola/local).
  public var stateBase: URL?
  /// For checks: a different HOME and the like for the child only.
  public var extraEnvironment: [String: String] = [:]
  private var process: Process?
  private var pidFile: URL?
  public private(set) var log = ""

  /// `port` 0 picks a free one at each start.
  public init(folder: URL, port: Int = 0) {
    self.folder = folder
    self.port = port
  }


  static func freePort() -> Int {
    let s = socket(AF_INET, SOCK_STREAM, 0)
    defer { close(s) }
    var addr = sockaddr_in()
    addr.sin_family = sa_family_t(AF_INET)
    addr.sin_addr.s_addr = inet_addr("127.0.0.1")
    addr.sin_port = 0
    var len = socklen_t(MemoryLayout<sockaddr_in>.size)
    _ = withUnsafePointer(to: &addr) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(s, $0, len) } }
    _ = withUnsafeMutablePointer(to: &addr) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { getsockname(s, $0, &len) } }
    return Int(UInt16(bigEndian: addr.sin_port))
  }

  /// Ends an opencode this app started earlier and did not stop, if it is still running.
  static func endOrphan(_ pidFile: URL, trace: (@Sendable (String) -> Void)?) {
    guard let text = try? String(contentsOf: pidFile, encoding: .utf8), let pid = Int32(text.trimmingCharacters(in: .whitespacesAndNewlines)) else { return }
    try? FileManager.default.removeItem(at: pidFile)
    var size = 0
    var mib: [Int32] = [CTL_KERN, KERN_PROCARGS2, pid]
    guard sysctl(&mib, 3, nil, &size, nil, 0) == 0, size > 0 else { return }
    var buf = [UInt8](repeating: 0, count: size)
    guard sysctl(&mib, 3, &buf, &size, nil, 0) == 0 else { return }
    let cmd = String(decoding: buf.prefix(size), as: UTF8.self)
    guard cmd.contains("opencode"), cmd.contains("serve") else { return }
    trace?("ending an earlier local opencode (pid \(pid))")
    kill(pid, SIGTERM)
  }

  public enum Failure: Error, LocalizedError {
    case noOpencode, didNotStart(String)
    public var errorDescription: String? {
      switch self {
      case .noOpencode: return "opencode is not installed on this Mac. Run apps/activist-ai/apple/tools/install-local-opencode.sh."
      case .didNotStart(let s): return "The local agent did not start. \(s)"
      }
    }
  }

  static func config(modelURL: String, instructionsPath: String) -> String {
    let deny = ["*GAMI*", "*hilma-*", "*ola-staging*", "*launchctl*", "*sudo *", "*.ola/*"]
      .map { #"    { "action": "shell", "resource": "\#($0)", "effect": "deny" }"# }.joined(separator: ",\n")
    return """
    // Written by the Ola Mac app for "On this Mac". Rewritten at every start.
    {
      "$schema": "https://opencode.ai/config.json",
      "providers": {
        "ola": {
          "name": "Ola",
          "env": ["OLA_GATEWAY_TOKEN"],
          "package": "@opencode/ai/providers/openai-compatible",
          "settings": { "baseURL": "\(modelURL)" },
          "models": {
            "general": { "modelID": "general", "name": "General", "capabilities": { "tools": true, "input": ["text"], "output": ["text"] }, "limit": { "context": 131072, "output": 16000 } }
          }
        }
      },
      "model": "ola/general",
      "update": "disable",
      "share": "disabled",
      "instructions": ["\(instructionsPath)"],
      "policies": [
        { "action": "provider.use", "resource": "*", "effect": "deny" },
        { "action": "provider.use", "resource": "ola", "effect": "allow" }
      ],
      "permissions": [
        { "action": "*", "resource": "*", "effect": "allow" },
        { "action": "shell", "resource": "*", "effect": "ask" },
        { "action": "bash", "resource": "*", "effect": "ask" },
        { "action": "edit", "resource": "*", "effect": "ask" },
        { "action": "write", "resource": "*", "effect": "ask" },
        { "action": "apply_patch", "resource": "*", "effect": "ask" },
        { "action": "webfetch", "resource": "*", "effect": "ask" },
        { "action": "websearch", "resource": "*", "effect": "ask" },
        { "action": "external_directory", "resource": "*", "effect": "deny" },
        { "action": "skill", "resource": "*", "effect": "deny" },
    \(deny)
      ]
    }
    """
  }

  /// Starts opencode and waits until it answers. Returns where to reach it.
  public func start(modelToken: String, modelURL: String = LocalServer.defaultModelURL, timeout: TimeInterval = 45, trace: (@Sendable (String) -> Void)? = nil) async throws -> ServerConfig {
    guard let bin = Self.binary else { throw Failure.noOpencode }
    stop()
    let fm = FileManager.default
    let base = stateBase ?? Self.support.appendingPathComponent("local")
    // A server left by an earlier run of the app (a crash or a force quit skips the clean stop)
    // would hold the port and answer with another password; it is ended first.
    let pf = base.appendingPathComponent("opencode.pid")
    pidFile = pf
    Self.endOrphan(pf, trace: trace)
    // A free port each time, so nothing else on this Mac can be in the way.
    if port == 0 { port = Self.freePort() }
    for d in ["config/opencode", "data", "state", "cache"] { try fm.createDirectory(at: base.appendingPathComponent(d), withIntermediateDirectories: true) }
    let instructions = base.appendingPathComponent("config/opencode/ola-reactions.md")
    try AgentNotes.all.write(to: instructions, atomically: true, encoding: .utf8)
    try Self.config(modelURL: modelURL, instructionsPath: instructions.path).write(to: base.appendingPathComponent("config/opencode/opencode.jsonc"), atomically: true, encoding: .utf8)
    var bytes = [UInt8](repeating: 0, count: 24)
    _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
    let password = bytes.map { String(format: "%02x", $0) }.joined()

    let p = Process()
    p.executableURL = bin
    p.arguments = ["serve", "--hostname", "127.0.0.1", "--port", String(port)]
    p.currentDirectoryURL = folder
    var env = ProcessInfo.processInfo.environment
    env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
    env["XDG_CONFIG_HOME"] = base.appendingPathComponent("config").path
    env["XDG_DATA_HOME"] = base.appendingPathComponent("data").path
    env["XDG_STATE_HOME"] = base.appendingPathComponent("state").path
    env["XDG_CACHE_HOME"] = base.appendingPathComponent("cache").path
    env["OPENCODE_PASSWORD"] = password
    // Nothing from other tools: opencode otherwise reads Claude Code's skills, agents and
    // CLAUDE.md from the home folder (2026-11-16: it loaded the algorithmic-art and
    // web-artifacts-builder skills from ~/.claude/skills/synced into a run on Bart's Mac), and a
    // project's own opencode config could loosen the permissions. The project's AGENTS.md stays.
    env["OPENCODE_DISABLE_CLAUDE_CODE"] = "1"
    env["OPENCODE_DISABLE_PROJECT_CONFIG"] = "1"
    for (k, v) in extraEnvironment { env[k] = v }
    env["OLA_GATEWAY_TOKEN"] = modelToken
    p.environment = env
    let pipe = Pipe()
    p.standardOutput = pipe
    p.standardError = pipe
    pipe.fileHandleForReading.readabilityHandler = { [weak self] h in
      let s = String(decoding: h.availableData, as: UTF8.self)
      if !s.isEmpty { trace?("opencode: \(s.trimmingCharacters(in: .newlines))") }
      self?.log = String(((self?.log ?? "") + s).suffix(4000))
    }
    trace?("starting \(bin.path) serve on 127.0.0.1:\(port) in \(folder.path)")
    try p.run()
    process = p
    if let pidFile { try? String(p.processIdentifier).write(to: pidFile, atomically: true, encoding: .utf8) }
    trace?("pid \(p.processIdentifier)")
    let config = ServerConfig(url: URL(string: "http://127.0.0.1:\(port)")!, password: password)
    let client = OpenCodeClient(config)
    let t0 = Date()
    var lastError = ""
    while Date().timeIntervalSince(t0) < timeout {
      if !p.isRunning {
        throw Failure.didNotStart("opencode stopped (exit code \(p.terminationStatus)) after \(Int(Date().timeIntervalSince(t0))) seconds. \(lastLines)")
      }
      do {
        _ = try await client.info()
        trace?("answered after \(String(format: "%.1f", Date().timeIntervalSince(t0))) s")
        return config
      } catch {
        let e = (error as? OlaError)?.detail ?? error.localizedDescription
        if e != lastError { trace?("not answering yet: \(e)") }
        lastError = e
      }
      try? await Task.sleep(nanoseconds: 300_000_000)
    }
    let alive = p.isRunning
    stop()
    throw Failure.didNotStart("opencode was \(alive ? "still running" : "no longer running") but did not answer in \(Int(timeout)) seconds (the last try said: \(lastError)). \(lastLines)")
  }

  /// opencode's last lines, for the error Bart sees.
  var lastLines: String {
    let lines = log.split(separator: "\n").suffix(4).joined(separator: " / ")
    return lines.isEmpty ? "It printed nothing." : "It printed: \(lines)"
  }

  public var isRunning: Bool { process?.isRunning ?? false }

  public func stop() {
    guard let p = process else { return }
    if p.isRunning { p.terminate() }
    p.waitUntilExit()
    process = nil
    // Only our own pid: another server of this app may have written the file since.
    if let pidFile, (try? String(contentsOf: pidFile, encoding: .utf8))?.trimmingCharacters(in: .whitespacesAndNewlines) == String(p.processIdentifier) {
      try? FileManager.default.removeItem(at: pidFile)
    }
  }

  deinit { stop() }
}

/// The gateway token for "On this Mac", in the Keychain, and the folder, in defaults.
public enum LocalSettings {
  static let service = "cx.ola.gateway-token"
  public static let modeKey = "ola.where"
  public static let folderKey = "ola.localFolder"

  /// The app's settings. A self-test uses its own suite, so it never changes Bart's.
  nonisolated(unsafe) public static var defaults = UserDefaults.standard
  /// A self-test passes the token in a file instead of the Keychain.
  nonisolated(unsafe) public static var tokenOverride: String?
  public static var onThisMac: Bool { defaults.string(forKey: modeKey) == "mac" }
  public static var folder: URL? { defaults.string(forKey: folderKey).map { URL(fileURLWithPath: $0) } }

  public static var token: String? {
    if let tokenOverride { return tokenOverride }
    let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
    var out: CFTypeRef?
    guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data else { return nil }
    return String(data: d, encoding: .utf8)
  }

  public static func saveToken(_ t: String) {
    SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service] as CFDictionary)
    SecItemAdd([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "bart",
                kSecValueData as String: Data(t.utf8), kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly] as CFDictionary, nil)
  }
}
#endif
