import Foundation

/// Permissions, "Lots of permissions" on or off (2026-11-17; OLA-133, then OLA-139). Bart: "add a
/// Lots Of Permissions options in the settings on the cli and macos app: too many nags", then "All
/// apps and all modes should have a toggle to remove most permission requests."
///
/// - **Lots of permissions** (on, the default for Bart's own Ola): Ola goes ahead with the steps that
///   used to ask first: a command, a new or changed file, and so a web search or download through
///   Ola's own commands (`ola-search`, `ola-fetch`, `ola-lookup`, shell commands like any other).
/// - **Ask before each step** (off): as before.
///
/// What is refused stays refused either way (opencode's own web fetch and search, code mode, files
/// outside the folder, skills not Ola's, models not Ola's). One name everywhere: the Mac app (both
/// modes), the iPhone (both modes), `ola settings permissions`, and the web app's project switch.
///
/// Where it is applied: on the machine for Bart's opencode (`../bart/approver.mjs`, the choice kept
/// there and read and set through its phone door, `MachinePermissions`), so the phone alone, the Mac
/// off, gets no question; on this Mac by the app itself ("On this Mac"); by `ola` in its config.
public enum PermissionMode: String, CaseIterable, Sendable {
  case lots, ask

  public var label: String {
    switch self {
    case .lots: "Lots of permissions: Ola goes ahead without asking"
    case .ask: "Ask before each step"
    }
  }

  /// The one line under the switch, the same on the Mac and the phone.
  public var note: String {
    switch self {
    case .lots: "Ola runs commands, changes files, searches the web and downloads without asking. It never works outside its folder."
    case .ask: "Ola asks before every command, every new or changed file, and every web search or download."
    }
  }
}

public enum PermissionSettings {
  /// opencode's ask-first steps: these, and only these, go ahead under Lots. The same list as the
  /// machine's (`../bart/approver.mjs` LOTS_ACTIONS).
  public static let askFirstActions: Set<String> = ["shell", "bash", "edit", "write", "apply_patch", "patch"]
  /// Ola's own web commands (shell commands: under Lots they go ahead like any other).
  public static let webCommands = ["ola-search", "ola-fetch", "ola-lookup"]

  /// Whether an opencode approval goes ahead without asking under Lots (the caller checks the mode).
  public static func goesAhead(action: String, resources: [String]) -> Bool {
    askFirstActions.contains(action)
  }

  #if os(macOS)
  public static let key = "ola.permissions"

  /// This Mac's copy of the choice (the app and `ola`). With the Ola machine set up, the machine's
  /// is the one that counts: the app reads it from there and writes every change there too (`set`).
  public static var mode: PermissionMode {
    get { LocalSettings.defaults.string(forKey: key).flatMap(PermissionMode.init(rawValue:)) ?? .lots }
    set { LocalSettings.defaults.set(newValue.rawValue, forKey: key) }
  }

  public static var lots: Bool { mode == .lots }

  /// The app's store: under Lots the ask-first steps go ahead. "On this Mac" the store answers them
  /// itself, "once", as they come; on the Ola machine the machine answers them and the store only
  /// keeps the card away (`OlaStore.serverAnswers`).
  @MainActor public static func wire(_ store: OlaStore) {
    store.goesAhead = { action, resources in lots && goesAhead(action: action, resources: resources) }
    store.serverAnswers = { [weak store] in store?.config.map { $0.url.host() != "127.0.0.1" } ?? false }
  }

  /// The Ola machine this Mac knows (the saved address and password), as its phone door, or nil.
  public static var machine: ServerConfig? { Credentials.load().map(MachinePermissions.door(for:)) }

  /// Changes the choice here and on the Ola machine. Returns a line to show when the machine did
  /// not take it (nil when it did, or when no machine is set up).
  @discardableResult
  public static func set(_ m: PermissionMode) async -> String? {
    mode = m
    // A self-test's own settings suite never reaches the real machine.
    guard LocalSettings.defaults === UserDefaults.standard, let machine else { return nil }
    do {
      _ = try await MachinePermissions.set(m, machine)
      return nil
    } catch {
      return "Changed on this Mac. The Ola machine didn\u{2019}t answer, so it keeps its own setting for now."
    }
  }

  /// Takes the machine's choice (at launch, and when Settings opens). Quiet when it does not answer.
  public static func pull() async {
    // A self-test runs on its own settings suite and never takes the machine's choice.
    guard LocalSettings.defaults === UserDefaults.standard else { return }
    guard let machine, let m = try? await MachinePermissions.get(machine) else { return }
    if m != mode { mode = m }
  }

  // MARK: Claude Code (Fallback to Claude)

  /// Claude Code's tools that read or write one path (in `file_path`, `notebook_path` or `path`).
  static let claudeFileTools: Set<String> = ["Read", "Write", "Edit", "MultiEdit", "NotebookEdit", "Glob", "Grep", "LS"]
  /// Claude Code's tools that only run or watch a command in the folder.
  static let claudeShellTools: Set<String> = ["Bash", "BashOutput", "KillShell", "KillBash"]

  /// Under Lots, a Claude Code question that goes ahead without asking: what acceptEdits allows
  /// (reading and writing files inside the folder) plus commands that name no path outside it.
  /// Anything else asks as before: a file outside the folder, a command that names one (an absolute
  /// path, `~`, `..`), sudo, Claude Code's own web fetches and searches, other tools.
  public static func claudeGoesAhead(tool: String, input: JSON, folder: URL) -> Bool {
    if tool == "TodoWrite" { return true }
    if claudeFileTools.contains(tool) {
      let p = [input["file_path"], input["notebook_path"], input["path"]].compactMap(\.string).first { !$0.isEmpty }
      guard let p else { return true }   // Glob and Grep without a path search the folder
      return inside(p, folder)
    }
    if claudeShellTools.contains(tool) {
      guard tool == "Bash" else { return true }
      return commandStaysIn(input["command"].str, folder)
    }
    return false
  }

  /// Whether `path` (absolute, or relative to `folder`) is the folder or inside it, symlinks resolved.
  static func inside(_ path: String, _ folder: URL) -> Bool {
    let expanded = (path as NSString).expandingTildeInPath
    let u = expanded.hasPrefix("/") ? URL(fileURLWithPath: expanded) : folder.appendingPathComponent(expanded)
    let p = u.standardizedFileURL.resolvingSymlinksInPath().path
    let f = folder.standardizedFileURL.resolvingSymlinksInPath().path
    return p == f || p.hasPrefix(f.hasSuffix("/") ? f : f + "/")
  }

  /// A command that names nothing outside the folder: every word that looks like a path outside it
  /// (starting with / or ~, or holding ..) makes it ask, and so do sudo and a `$` variable (Ola's
  /// web commands go ahead, as they do for opencode under Lots). A check of the words, not a wall (as opencode's own patterns are).
  static func commandStaysIn(_ command: String, _ folder: URL) -> Bool {
    let c = command.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !c.isEmpty else { return false }
    let words = c.split(whereSeparator: { " \t\n;&|()<>`\"'=".contains($0) }).map(String.init)
    for w in words {
      // sudo, and a variable that could name anywhere ($HOME/…).
      if w == "sudo" || w.contains("$") { return false }
      if w == "/dev/null" { continue }
      if w.hasPrefix("/") || w.hasPrefix("~") || w.contains("..") {
        if !inside(w, folder) { return false }
      }
    }
    return true
  }
  #endif
}

/// The Ola machine's own choice (Bart's opencode, `../bart/approver.mjs`), read and set through its
/// phone door: `GET|PUT /ola/permissions`, `{ "mode": "lots" | "ask" }`. The phone on the machine
/// uses its Ola device key there; the phone through its Mac asks the Mac's relay, which answers with
/// the Mac's choice and passes a change on; the Mac uses the machine's password.
public enum MachinePermissions {
  /// The phone door's port beside Bart's opencode (`OLA_BART_PHONE_PORT`).
  public static let doorPort = 4312

  /// Where to ask, for a server config: the phone's own configs as they are (the door, or the Mac's
  /// relay); the Mac's Basic-auth config for opencode moved to the door's port on the same host.
  public static func door(for c: ServerConfig) -> ServerConfig {
    guard !c.account, !c.viaMac, var u = URLComponents(url: c.url, resolvingAgainstBaseURL: false) else { return c }
    u.port = doorPort
    u.path = ""
    return ServerConfig(url: u.url ?? c.url, password: c.password)
  }

  public static func get(_ c: ServerConfig) async throws -> PermissionMode {
    try parse(try await OpenCodeClient(c).json("GET", "/ola/permissions"))
  }

  @discardableResult
  public static func set(_ m: PermissionMode, _ c: ServerConfig) async throws -> PermissionMode {
    try parse(try await OpenCodeClient(c).json("PUT", "/ola/permissions", body: ["mode": .string(m.rawValue)]))
  }

  static func parse(_ j: JSON) throws -> PermissionMode {
    guard let m = PermissionMode(rawValue: j["mode"].str) else { throw OlaError.badReply("permissions: \(j["mode"].str)") }
    return m
  }
}
