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
/// outside the folder, skills not Ola's, models not Ola's). One name everywhere: the Mac app, the
/// iPhone, `ola settings permissions`, and the web app's project switch.
///
/// **One switch per runtime** (OLA-142, meeting of 2026-11-18: "settings follow the runtime, not the
/// product"). The cloud runtime's is kept and applied on the machine (`../bart/approver.mjs`, read
/// and set through its phone door, `MachinePermissions`), so the phone alone, the Mac off, gets no
/// question. The local runtime's is this Mac's (`ola.permissions`): applied by the app itself ("On
/// this Mac"), by `ola` in its config, and through the relay for the phone. Every product shows and
/// changes the switch of the runtime it is in.
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
  /// The local runtime's choice ("On this Mac", the `ola` command, the phone through this Mac).
  public static let key = "ola.permissions"
  /// This Mac's copy of the cloud runtime's choice, which is kept on the Ola machine
  /// (`../bart/approver.mjs`): read from there (`pullCloud`), changed there (`setCloud`).
  public static let cloudKey = "ola.permissions.cloud"

  /// The local runtime's choice. Since OLA-142 one per runtime (meeting of 2026-11-18: "settings
  /// follow the runtime, not the product"); before, one value for both.
  public static var mode: PermissionMode {
    get { LocalSettings.defaults.string(forKey: key).flatMap(PermissionMode.init(rawValue:)) ?? .lots }
    set { LocalSettings.defaults.set(newValue.rawValue, forKey: key) }
  }

  public static var lots: Bool { mode == .lots }

  /// The cloud runtime's choice as last read from the machine (Lots until it answers, its default).
  public static var cloudMode: PermissionMode {
    get { LocalSettings.defaults.string(forKey: cloudKey).flatMap(PermissionMode.init(rawValue:)) ?? .lots }
    set { LocalSettings.defaults.set(newValue.rawValue, forKey: cloudKey) }
  }

  public static func mode(_ r: Runtime) -> PermissionMode { r == .cloud ? cloudMode : mode }

  /// A store: under its runtime's Lots the ask-first steps go ahead. "On this Mac" the store answers
  /// them itself, "once", as they come; on the Ola machine the machine answers them and the store
  /// only keeps the card away (`OlaStore.serverAnswers`).
  @MainActor public static func wire(_ store: OlaStore) {
    store.goesAhead = { [weak store] action, resources in
      (store?.runtime == .cloud ? cloudMode : mode) == .lots && goesAhead(action: action, resources: resources)
    }
    store.serverAnswers = { [weak store] in store?.runtime == .cloud }
  }

  /// The Ola machine this Mac knows (the saved address and password), as its phone door, or nil.
  public static var machine: ServerConfig? { Credentials.load().map(MachinePermissions.door(for:)) }

  /// Changes the local runtime's choice (this Mac, `ola`, the phone through this Mac). Never the
  /// machine's. Returns nil (a line to show, for symmetry with `setCloud`).
  @discardableResult
  public static func set(_ m: PermissionMode) async -> String? {
    mode = m
    return nil
  }

  /// Changes the cloud runtime's choice, on the Ola machine. Returns a line to show when the
  /// machine did not take it.
  @discardableResult
  public static func setCloud(_ m: PermissionMode) async -> String? {
    // A self-test's own settings suite never reaches the real machine (it names its own door).
    guard let machine = testMachine ?? (LocalSettings.defaults === UserDefaults.standard ? machine : nil) else {
      return "The Ola machine isn\u{2019}t set up on this Mac."
    }
    do {
      cloudMode = try await MachinePermissions.set(m, machine)
      return nil
    } catch {
      return "The Ola machine didn\u{2019}t answer, so it keeps its own setting for now."
    }
  }

  /// A self-test's stand-in for the Ola machine's door (never the real one).
  nonisolated(unsafe) public static var testMachine: ServerConfig?

  /// Reads the cloud runtime's choice from the machine (at launch, in front, when Settings opens).
  /// Quiet when it does not answer. Never touches the local runtime's.
  public static func pull() async {
    guard let machine = testMachine ?? (LocalSettings.defaults === UserDefaults.standard ? machine : nil),
          let m = try? await MachinePermissions.get(machine) else { return }
    if m != cloudMode { cloudMode = m }
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
  /// A check's scratch door on another port (never set by the apps).
  nonisolated(unsafe) public static var doorPortOverride: Int?

  /// Where to ask, for a server config: the phone's own configs as they are (the door, or the Mac's
  /// relay); the Mac's Basic-auth config for opencode moved to the door's port on the same host.
  public static func door(for c: ServerConfig) -> ServerConfig {
    guard !c.account, !c.viaMac, var u = URLComponents(url: c.url, resolvingAgainstBaseURL: false) else { return c }
    u.port = doorPortOverride ?? doorPort
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
