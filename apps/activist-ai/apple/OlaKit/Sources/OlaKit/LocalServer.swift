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
  public static let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Ola")
  /// Where tools/install-local-opencode.sh puts opencode 2.3.0.
  public static var binary: URL? {
    let mine = support.appendingPathComponent("opencode/node_modules/.bin/opencode")
    if FileManager.default.isExecutableFile(atPath: mine.path) { return mine }
    for p in ["/opt/homebrew/bin/opencode", "/usr/local/bin/opencode"] where FileManager.default.isExecutableFile(atPath: p) { return URL(fileURLWithPath: p) }
    return nil
  }
  public static let defaultModelURL = "http://100.95.51.98:4311/v1"

  public let folder: URL
  public let port: Int
  private var process: Process?
  public private(set) var log = ""

  public init(folder: URL, port: Int = 4320) {
    self.folder = folder
    self.port = port
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

  static func config(modelURL: String) -> String {
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
    \(deny)
      ]
    }
    """
  }

  /// Starts opencode and waits until it answers. Returns where to reach it.
  public func start(modelToken: String, modelURL: String = LocalServer.defaultModelURL) async throws -> ServerConfig {
    guard let bin = Self.binary else { throw Failure.noOpencode }
    stop()
    let fm = FileManager.default
    let base = Self.support.appendingPathComponent("local")
    for d in ["config/opencode", "data", "state", "cache"] { try fm.createDirectory(at: base.appendingPathComponent(d), withIntermediateDirectories: true) }
    try Self.config(modelURL: modelURL).write(to: base.appendingPathComponent("config/opencode/opencode.jsonc"), atomically: true, encoding: .utf8)
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
    env["OLA_GATEWAY_TOKEN"] = modelToken
    p.environment = env
    let pipe = Pipe()
    p.standardOutput = pipe
    p.standardError = pipe
    pipe.fileHandleForReading.readabilityHandler = { [weak self] h in
      let s = String(decoding: h.availableData, as: UTF8.self)
      self?.log = String(((self?.log ?? "") + s).suffix(4000))
    }
    try p.run()
    process = p
    let config = ServerConfig(url: URL(string: "http://127.0.0.1:\(port)")!, password: password)
    let client = OpenCodeClient(config)
    for _ in 0..<60 {
      if !p.isRunning { throw Failure.didNotStart(log.split(separator: "\n").last.map(String.init) ?? "") }
      if (try? await client.info()) != nil { return config }
      try? await Task.sleep(nanoseconds: 250_000_000)
    }
    stop()
    throw Failure.didNotStart("It did not answer within 15 seconds.")
  }

  public var isRunning: Bool { process?.isRunning ?? false }

  public func stop() {
    guard let p = process else { return }
    if p.isRunning { p.terminate() }
    p.waitUntilExit()
    process = nil
  }

  deinit { stop() }
}

/// The gateway token for "On this Mac", in the Keychain, and the folder, in defaults.
public enum LocalSettings {
  static let service = "cx.ola.gateway-token"
  public static let modeKey = "ola.where"
  public static let folderKey = "ola.localFolder"

  public static var onThisMac: Bool { UserDefaults.standard.string(forKey: modeKey) == "mac" }
  public static var folder: URL? { UserDefaults.standard.string(forKey: folderKey).map { URL(fileURLWithPath: $0) } }

  public static var token: String? {
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
