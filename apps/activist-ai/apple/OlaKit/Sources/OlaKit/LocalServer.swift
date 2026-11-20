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
  /// Ola's own build of opencode, carried inside the Mac app (Contents/Helpers, one per processor;
  /// apps/activist-ai/opencode-fork: the same program with Ola's name in its terminal interface).
  /// Nothing to download, and the `ola` command shows Ola's wordmark. Nil when this code runs
  /// outside the app (a self-test, `swift run`), which then uses the installed one below.
  public static var bundledBinary: URL? {
    #if arch(arm64)
    let name = "ola-opencode-arm64"
    #else
    let name = "ola-opencode-x86_64"
    #endif
    let u = Bundle.main.bundleURL.appendingPathComponent("Contents/Helpers/\(name)")
    return FileManager.default.isExecutableFile(atPath: u.path) ? u : nil
  }
  /// opencode 2.3.0: the one inside the app (`bundledBinary`), else where the app installed it
  /// itself (`OpencodeInstall`), else where tools/install-local-opencode.sh put it. Always the
  /// real install, also when a self-test points `support` at a scratch folder. (Not Homebrew's:
  /// another version would not read this config.)
  public static var binary: URL? {
    let fm = FileManager.default
    if let b = bundledBinary { return b }
    let mine = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Ola/opencode")
    for c in [OpencodeInstall.destination, mine.appendingPathComponent("node_modules/.bin/opencode")] where fm.isExecutableFile(atPath: c.path) { return c }
    return nil
  }
  public static let defaultModelURL = "http://100.95.51.98:4311/v1"

  /// Ola's web commands (ola-search, ola-fetch, ola-lookup and what they need), the same files as
  /// in the customers' sealed image (workspace/). The Mac app carries them in its Resources; a check
  /// run from the repo points this at workspace/. Copied next to opencode at each start and put
  /// first on the agent's PATH; they reach the gateway through the machine's forwarder.
  /// ola-see (a model that looks at a picture) and ola-page (a page rendered and measured, here by
  /// this app's own web view: bart/ola-page-mac, with the sealed image's ola-page beside it as
  /// olapage.py for its measurements and its words) are what Ola's designer skills look with.
  public static let webToolNames = ["ola-search", "ola-fetch", "ola-lookup", "ola-db", "olaspec.py", "olatext.py", "ola-see", "ola-page", "olapage.py"]
  /// The file each tool is copied from, when its name in the app's Resources or the repo differs.
  static let webToolFrom = ["ola-page": "ola-page-mac", "olapage.py": "ola-page"]
  nonisolated(unsafe) public static var webToolsSource: URL? = Bundle.main.resourceURL.flatMap { r in
    FileManager.default.fileExists(atPath: r.appendingPathComponent("ola-search").path) ? r : nil
  }

  /// Copies the web commands into `dir` (made fresh), executable. Returns false if any is missing.
  @discardableResult
  public static func installWebTools(into dir: URL) -> Bool {
    let fm = FileManager.default
    guard let src = webToolsSource else { return false }
    try? fm.removeItem(at: dir)
    try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
    var ok = true
    for name in webToolNames {
      // In the repo, olatext.py is in workspace/lib/; in the app, everything is side by side.
      let file = webToolFrom[name] ?? name
      // In the repo the Mac's ola-page is bart/ola-page-mac, beside workspace/.
      guard let from = [src.appendingPathComponent(file), src.appendingPathComponent("lib/\(file)"), src.appendingPathComponent("../bart/\(file)")].first(where: { fm.fileExists(atPath: $0.path) }) else { ok = false; continue }
      let to = dir.appendingPathComponent(name)
      do {
        try fm.copyItem(at: from, to: to)
        try fm.setAttributes([.posixPermissions: name.hasSuffix(".py") ? 0o644 : 0o755], ofItemAtPath: to.path)
      } catch { ok = false }
    }
    return ok
  }

  /// Ola's own skills (apps/activist-ai/skills as committed, with VERSION.json; tools/skills.mjs
  /// stages them): in the app's Resources (OlaSkills.bundled), or the repo for a check.
  nonisolated(unsafe) public static var skillsSource: URL? = OlaSkills.bundled
  /// Where they are installed for opencode: written fresh by this app at each start, read-only, and
  /// named in the config as the only skills. No spaces in the path, so the commands in the skills
  /// work as written (Application Support has one).
  nonisolated(unsafe) public static var skillsHome = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Ola/skills")

  /// Copies every skill folder into `dir` (made fresh), rewrites the sealed image's path
  /// /opt/ola/skills to `dir` in the text files, and makes the copy read-only, as
  /// skills/install.py does on the machine. Returns the skills' names (empty when none were found).
  @discardableResult
  public static func installSkills(into dir: URL) -> [String] {
    let fm = FileManager.default
    guard let src = skillsSource, !dir.path.contains(" ") else { return [] }
    if let all = fm.enumerator(atPath: dir.path) {
      for case let rel as String in all { try? fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: dir.appendingPathComponent(rel).path) }
      try? fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: dir.path)
    }
    try? fm.removeItem(at: dir)
    guard (try? fm.createDirectory(at: dir, withIntermediateDirectories: true)) != nil else { return [] }
    let names = ((try? fm.contentsOfDirectory(atPath: src.path)) ?? []).filter { !$0.hasPrefix(".") && fm.fileExists(atPath: src.appendingPathComponent("\($0)/SKILL.md").path) }.sorted()
    let text: Set<String> = ["md", "py", "html", "css", "js", "txt", "json", "jsonc"]
    for n in names {
      guard (try? fm.copyItem(at: src.appendingPathComponent(n), to: dir.appendingPathComponent(n))) != nil else { return [] }
    }
    // Which version this is (OlaSkills.version): the commit and the content hash.
    try? fm.copyItem(at: src.appendingPathComponent("VERSION.json"), to: dir.appendingPathComponent("VERSION.json"))
    var files: [String] = []
    if let all = fm.enumerator(atPath: dir.path) { for case let rel as String in all { files.append(rel) } }
    for rel in files {
      let u = dir.appendingPathComponent(rel)
      var isDir: ObjCBool = false
      fm.fileExists(atPath: u.path, isDirectory: &isDir)
      if !isDir.boolValue, text.contains(u.pathExtension), let t = try? String(contentsOf: u, encoding: .utf8), t.contains("/opt/ola/skills") {
        try? t.replacingOccurrences(of: "/opt/ola/skills", with: dir.path).write(to: u, atomically: false, encoding: .utf8)
      }
    }
    for rel in files.sorted(by: >) {
      let u = dir.appendingPathComponent(rel)
      var isDir: ObjCBool = false
      fm.fileExists(atPath: u.path, isDirectory: &isDir)
      try? fm.setAttributes([.posixPermissions: (isDir.boolValue || u.pathExtension == "py") ? 0o555 : 0o444], ofItemAtPath: u.path)
    }
    try? fm.setAttributes([.posixPermissions: 0o555], ofItemAtPath: dir.path)
    return names
  }

  public let folder: URL
  public private(set) var port: Int
  /// Where opencode keeps its config, sessions and caches (default: Application Support/Ola/local).
  public var stateBase: URL?
  /// This server's own config folder (default: `<stateBase>/config`). The `ola` command keeps its
  /// own, since the config names its launch's model door, and shares the sessions.
  public var configBase: URL?
  /// The pid file that lets a later run end a server this one left behind; nil keeps none.
  public var pidFileName: String? = "opencode.pid"
  /// opencode ends when this process does, however it ends (`--stdio`; the `ola` command).
  public var tiedToThisProcess = false
  /// The agent's environment from the last start (the `ola` command gives its interface the same).
  public private(set) var environment: [String: String] = [:]
  /// Ola's skills at the last start: where they are, their version, and each one's state here.
  public private(set) var skillsDir: URL?
  public private(set) var skillStates: [OlaSkills.State] = []
  /// For checks: a different HOME and the like for the child only.
  public var extraEnvironment: [String: String] = [:]
  /// Commands and edits ask first in the config (the app: it answers them itself under Lots).
  public var askFirst = true
  private var process: Process?
  private var lifeline: Pipe?
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
      case .noOpencode: return "Ola isn\u{2019}t set up to work on this Mac yet."
      case .didNotStart(let s): return "The local agent did not start. \(s)"
      }
    }
  }

  /// `askFirst` false is "Lots of permissions" written into the config (the `ola` command, whose
  /// one-shot runs cannot ask): commands, edits and so Ola's web commands allowed (OLA-139). The app
  /// keeps it true and answers those approvals itself (OlaStore.goesAhead), so its setting applies
  /// to the next step without a restart.
  static func config(modelURL: String, instructionsPath: String, skills: [String] = [], skillsPath: String = "", askFirst: Bool = true) -> String {
    let first = askFirst ? "ask" : "allow"
    let allow = { (action: String) in skills.map { #"    { "action": "\#(action)", "resource": "\#($0)", "effect": "allow" },"# }.joined(separator: "\n") }
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
            "general": { "modelID": "general", "name": "General", "capabilities": { "tools": true, "input": ["text"], "output": ["text"] }, "limit": { "context": 131072, "output": 16000 } },
            // Fallback to a hosted open model: chosen only for a request handed to it (the app's
            // /hosted and the card, the terminal's /hosted command below), never as the default.
            "hosted": { "modelID": "hosted", "name": "Hosted open model", "capabilities": { "tools": true, "input": ["text"], "output": ["text"] }, "limit": { "context": 1000000, "output": 16000 } }
          }
        }
      },
      "model": "ola/general",
      // The slash commands in the terminal's conversation (the `ola` command): /hosted hands that one
      // request to the hosted open model, /ola to Ola's own; /claude says how to reach Claude Code.
      "commands": {
        "hosted": { "template": "$ARGUMENTS", "description": "Hand this request to the hosted open model", "model": "ola/hosted" },
        "ola": { "template": "$ARGUMENTS", "description": "Use Ola's own model for this request", "model": "ola/general" },
        "claude": { "template": "Reply with exactly this one line and nothing else: To hand a request to Claude Code, leave this conversation (Ctrl-C twice) and type: ola /claude followed by your request", "description": "Hand a request to Claude Code (from the shell: ola /claude and your request)", "model": "ola/general" }
      },
      "update": "disable",
      "share": "disabled",
      "instructions": ["\(instructionsPath)"],
      // Ola's own skills and nothing else (installSkills): the folder is named here, and every
      // skill is denied by name except Ola's. OPENCODE_DISABLE_CLAUDE_CODE keeps Claude's out.
      "skills": [\(skills.isEmpty ? "" : "\"\(skillsPath)\"")],
      "policies": [
        { "action": "skill.use", "resource": "*", "effect": "deny" },
    \(allow("skill.use"))
        { "action": "provider.use", "resource": "*", "effect": "deny" },
        { "action": "provider.use", "resource": "ola", "effect": "allow" }
      ],
      "permissions": [
        { "action": "*", "resource": "*", "effect": "allow" },
        // Commands and edits: asked first, or allowed under Lots of permissions (PermissionSettings).
        { "action": "shell", "resource": "*", "effect": "\(first)" },
        { "action": "bash", "resource": "*", "effect": "\(first)" },
        { "action": "edit", "resource": "*", "effect": "\(first)" },
        { "action": "write", "resource": "*", "effect": "\(first)" },
        { "action": "apply_patch", "resource": "*", "effect": "\(first)" },
        // opencode's own web search has no provider here (it waits a minute, then says "Web search
        // cancelled"); its page fetch works, but the model reached for it instead of searching (a
        // search engine's results page, a guessed address). The web goes through Ola's gateway:
        // ola-search and ola-fetch, asked as web questions (README, "Web search in Bart's apps").
        { "action": "webfetch", "resource": "*", "effect": "deny" },
        // opencode's code-mode tool ran code on the Mac without asking, and the model reached for
        // fetch() in it instead of ola-search (M4, Nov 17): off; the shell (asked first) is the way.
        { "action": "execute", "resource": "*", "effect": "deny" },
        { "action": "websearch", "resource": "*", "effect": "deny" },
        { "action": "external_directory", "resource": "*", "effect": "deny" },
        { "action": "skill", "resource": "*", "effect": "deny" },
    \(allow("skill"))
        { "action": "external_directory", "resource": "\(skillsPath.isEmpty ? "__ola_none__" : skillsPath)/*", "effect": "allow" },
    \(deny)
      ]
    }
    """
  }

  /// The pasted-token path: the machine's forwarder and the `bart` gateway token in the agent's
  /// environment. Kept: the owner's own setup (his private network); his app must keep working exactly as it does (2026-11-17).
  public func start(modelToken: String, modelURL: String = LocalServer.defaultModelURL, timeout: TimeInterval = 45, trace: (@Sendable (String) -> Void)? = nil) async throws -> ServerConfig {
    try await start(route: .pasted(token: modelToken, modelURL: modelURL), timeout: timeout, trace: trace)
  }

  /// Only these reach the agent from whoever started it (a terminal's environment can hold other
  /// tools' keys; the app's and the `ola` command's agents get the same, short list).
  static let passedEnvironment = ["HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "LANG", "LC_ALL", "LC_CTYPE", "__CF_USER_TEXT_ENCODING", "SSH_AUTH_SOCK"]

  /// Writes the config and the web commands, and makes the agent's environment: the one setup both
  /// the app and the `ola` command use. `configBase` holds this server's own config (it names this
  /// launch's model door); `base` holds the shared sessions, state and caches.
  public func prepare(route: ModelRoute, password: String, trace: (@Sendable (String) -> Void)? = nil) throws -> [String: String] {
    let fm = FileManager.default
    let base = stateBase ?? Self.support.appendingPathComponent("local")
    let config = configBase ?? base.appendingPathComponent("config")
    try fm.createDirectory(at: config.appendingPathComponent("opencode"), withIntermediateDirectories: true)
    for d in ["data", "state", "cache"] { try fm.createDirectory(at: base.appendingPathComponent(d), withIntermediateDirectories: true) }
    let instructions = config.appendingPathComponent("opencode/ola-reactions.md")
    let webTools = Self.support.appendingPathComponent("web-tools")
    let haveWeb = Self.installWebTools(into: webTools)
    trace?(haveWeb ? "web commands in \(webTools.path)" : "web commands NOT found (ola-search will be missing)")
    // The agent's PATH: Ola's web commands, then the skills' own Python (once set up), then the usual.
    let python = OlaSkills.pythonBin
    let path = webTools.path + (fm.isExecutableFile(atPath: python.appendingPathComponent("python3").path) ? ":" + python.path : "") + ":/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
    // Ola's skills: the app's bundled copy, installed fresh; each checked for what it needs here
    // (OlaSkills), and only the ones that can run offered. The agent is told about the rest.
    let skillsDir = Self.skillsHome
    let installed = Self.installSkills(into: skillsDir)
    self.skillsDir = installed.isEmpty ? nil : skillsDir
    skillStates = installed.isEmpty ? [] : OlaSkills.check(OlaSkills.read(at: skillsDir), path: path)
    var notes = AgentNotes.opencode
    if installed.isEmpty {
      trace?("Ola's skills NOT found (none offered)")
    } else {
      notes += "\n\n" + OlaSkills.notes(skillStates, dir: skillsDir.path)
      trace?("Ola's skills \(OlaSkills.version(at: skillsDir)?.label ?? "(no version)") in \(skillsDir.path): " + skillStates.map(\.line).joined(separator: "; "))
    }
    try notes.write(to: instructions, atomically: true, encoding: .utf8)
    let offered = installed.isEmpty ? [] : skillStates.filter(\.ready).map(\.skill.name)
    try Self.config(modelURL: route.baseURL, instructionsPath: instructions.path, skills: offered, skillsPath: skillsDir.path, askFirst: askFirst).write(to: config.appendingPathComponent("opencode/opencode.jsonc"), atomically: true, encoding: .utf8)

    var env: [String: String] = [:]
    let mine = ProcessInfo.processInfo.environment
    for k in Self.passedEnvironment { if let v = mine[k] { env[k] = v } }
    env["PATH"] = path
    // Where the web commands go: the same way as the model (the door, or the machine's forwarder);
    // downloads land in the project's sources/.
    env["OLA_GATEWAY_HOSTPORT"] = route.hostPort
    env["OLA_WORK"] = folder.path
    env["OLA_LIB"] = webTools.path
    // ola-page asks this app to render a page in its own web view (PageRender in the Mac app).
    env["OLA_RENDER_DIR"] = Self.support.appendingPathComponent("render").path
    env["XDG_CONFIG_HOME"] = config.path
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
    env["OPENCODE_DISABLE_AUTOUPDATE"] = "1"
    for (k, v) in extraEnvironment { env[k] = v }
    // What the agent holds for the model and the web: the door's key for this launch when signed
    // in (it works only on this Mac's loopback, only while the app or command runs).
    env["OLA_GATEWAY_TOKEN"] = route.token
    env["BOX_API_KEY"] = route.token
    return env
  }

  /// Starts opencode and waits until it answers. Returns where to reach it.
  public func start(route: ModelRoute, timeout: TimeInterval = 45, trace: (@Sendable (String) -> Void)? = nil) async throws -> ServerConfig {
    guard let bin = Self.binary else { throw Failure.noOpencode }
    stop()
    let base = stateBase ?? Self.support.appendingPathComponent("local")
    // A server left by an earlier run of the app (a crash or a force quit skips the clean stop)
    // would hold the port and answer with another password; it is ended first. The `ola` command
    // keeps no pid file (its server ends with it), so it can never be taken for, or end, this one.
    if let name = pidFileName {
      let pf = base.appendingPathComponent(name)
      pidFile = pf
      Self.endOrphan(pf, trace: trace)
    }
    // A free port each time, so nothing else on this Mac can be in the way.
    if port == 0 { port = Self.freePort() }
    var bytes = [UInt8](repeating: 0, count: 24)
    _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
    let password = bytes.map { String(format: "%02x", $0) }.joined()
    let env = try prepare(route: route, password: password, trace: trace)
    environment = env

    let p = Process()
    p.executableURL = bin
    // Tied to this process: with --stdio opencode ends when its standard input closes, which
    // happens when this process ends in any way, a kill included.
    p.arguments = ["serve", "--hostname", "127.0.0.1", "--port", String(port)] + (tiedToThisProcess ? ["--stdio"] : [])
    p.currentDirectoryURL = folder
    p.environment = env
    if tiedToThisProcess {
      let input = Pipe()
      p.standardInput = input
      lifeline = input
    }
    let pipe = Pipe()
    p.standardOutput = pipe
    p.standardError = pipe
    pipe.fileHandleForReading.readabilityHandler = { [weak self] h in
      let s = String(decoding: h.availableData, as: UTF8.self)
      if !s.isEmpty { trace?("opencode: \(s.trimmingCharacters(in: .newlines))") }
      self?.appendLog(s)
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
  public var pid: Int32? { process?.processIdentifier }

  private let logLock = NSLock()
  func appendLog(_ s: String) { logLock.withLock { log = String((log + s).suffix(4000)) } }

  public func stop() {
    guard let p = process else { return }
    if p.isRunning { p.terminate() }
    try? lifeline?.fileHandleForWriting.close()
    lifeline = nil
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
  /// The runtime on screen in the Mac app: which of its two stores holds which runtime, and what
  /// opens at launch. Written only when a session of the other runtime is brought on screen
  /// (`WhereOlaWorks.show`). It is not a setting: what a session may do follows that session's own
  /// runtime (Settings shows each runtime's own switches, OLA-142, OLA-220).
  public static let shownKey = "ola.runtime.shown"
  /// Before OLA-220: the old "Where Ola works" setting ("mac" or "machine"). Settings stopped
  /// writing it with OLA-143, the fallbacks kept reading it, and a Mac working in Local sessions
  /// was treated as in the cloud. Read once, by `migrate`, then removed.
  public static let legacyModeKey = "ola.where"
  public static let folderKey = "ola.localFolder"

  /// The runtime on screen (the cloud until anything says otherwise).
  public static var shown: Runtime {
    get { defaults.string(forKey: shownKey).flatMap(Runtime.init(rawValue:)) ?? .cloud }
    set { defaults.set(newValue.rawValue, forKey: shownKey) }
  }

  /// At launch, before anything reads `shown`: the first time, the runtime on screen is the one last
  /// chosen in New Session, else what the old setting said, else Local when a folder is set up; the
  /// old key is removed either way.
  public static func migrate() {
    let old = defaults.string(forKey: legacyModeKey)
    if defaults.string(forKey: shownKey) == nil {
      let fromOld: Runtime? = old == "mac" ? .local : old == "machine" ? .cloud : nil
      if let r = RuntimeChoice.last(defaults) ?? fromOld ?? (folder != nil ? .local : nil) { shown = r }
    }
    if old != nil { defaults.removeObject(forKey: legacyModeKey) }
  }

  /// The app's settings. A self-test uses its own suite, so it never changes Bart's.
  nonisolated(unsafe) public static var defaults = UserDefaults.standard
  /// A self-test passes the token in a file instead of the Keychain.
  nonisolated(unsafe) public static var tokenOverride: String?
  /// A self-test's stand-in model (with `tokenOverride`), never set by the app.
  nonisolated(unsafe) public static var modelURLOverride: String?
  public static var folder: URL? { defaults.string(forKey: folderKey).map { URL(fileURLWithPath: $0) } }

  /// The pasted gateway token (before account sign-in), read once per launch and only when needed.
  /// The owner's own setup, kept (2026-11-17): this, `saveToken`, Settings' Model token row and
  /// `SecretKind.modelToken` are the pasted-token path.
  public static var token: String? {
    if let tokenOverride { return tokenOverride }
    return SecretStore.value(.modelToken)
  }

  public static func saveToken(_ t: String) {
    SecretStore.save(.modelToken, t)
    defaults.set(true, forKey: tokenSavedKey)
  }

  /// Whether a pasted token was saved, without reading the Keychain (Settings shows "Saved").
  public static let tokenSavedKey = "ola.modelTokenSaved"
}

/// How the agent on this Mac reaches the model and the web: where (opencode's provider base and the
/// web commands' host:port) and with what it holds.
public struct ModelRoute: Equatable, Sendable {
  public var baseURL: String
  public var hostPort: String
  public var token: String

  /// Signed in: this launch's model door and its key (the account token stays in the app).
  public static func door(_ d: ModelDoor) -> ModelRoute {
    ModelRoute(baseURL: d.url.absoluteString + "/v1", hostPort: d.hostPort, token: d.key)
  }

  /// The pasted `bart` gateway token through the machine's forwarder: the owner's own setup over his
  /// private network, kept as it is (2026-11-17). Everyone else signs in (`door`).
  public static func pasted(token: String, modelURL: String = LocalServer.defaultModelURL) -> ModelRoute {
    let u = URL(string: modelURL)
    let hp = u.flatMap { u in u.host().map { "\($0):\(u.port ?? 80)" } } ?? ""
    return ModelRoute(baseURL: modelURL, hostPort: hp, token: token)
  }
}
#endif
