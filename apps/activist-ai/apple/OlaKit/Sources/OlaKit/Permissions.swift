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
/// product"). The cloud runtime's (OLA-150: the person's project on app.ola.cx) is each app's own
/// switch, sent as the conversation's autonomy the way the website sends its switch (`CloudAutonomy`):
/// the front desk then answers web steps itself, so the phone alone, the Mac off, gets no question.
/// The local runtime's is this Mac's (`ola.permissions`): applied by the app itself ("On
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

  /// What always asks, Lots or not (OLA-223): putting something on the public web, or taking it
  /// down. `ola-publish preview` and `status` change nothing and go ahead like any command.
  public static let alwaysAsk = ["publish", "unpublish"]

  /// Whether a command runs `ola-publish publish|unpublish`, however it is written (a path to the
  /// command, a `cd` before it, extra spaces, quotes).
  public static func alwaysAsks(_ command: String) -> Bool {
    if isRefusedFilesForm(command) { return false }
    let words = command.split(whereSeparator: { " \t\n;&|()'\"".contains($0) }).map(String.init)
    for (i, w) in words.enumerated() where (w as NSString).lastPathComponent == "ola-publish" {
      if i + 1 < words.count, alwaysAsk.contains(words[i + 1]) { return true }
    }
    return false
  }

  /// `ola-publish publish|unpublish … --files …`, one command and nothing else: the cloud project's
  /// form, which the Mac's own ola-publish (../bart/ola-publish) refuses without sending anything
  /// (any `--files` keeps it off its publish and unpublish paths) and answers with the Mac's two
  /// steps. Asking a yes for it showed a raw "Ola wants to run a command" box for a step that
  /// publishes nothing (OLA-250, request test publish-bart@local-mac:chat try 4 on f9dc1cc2a90e);
  /// under Lots it now goes ahead, and the real publish that follows asks as always.
  /// Anything chained (; & | $( ` or a line break) is never this form, so still asks.
  static func isRefusedFilesForm(_ whole: String) -> Bool {
    var command = whole.trimmingCharacters(in: .whitespaces)
    // One `cd <folder> &&` before it, as the model often writes it (the folder: no spaces or marks).
    if let cd = command.range(of: #"^cd\s+[^\s;&|`$()<>'"]+\s*&&\s*"#, options: .regularExpression) { command.removeSubrange(cd) }
    if command.hasSuffix(" 2>&1") { command = String(command.dropLast(5)) }
    if command.contains(where: { ";&|`\n<>".contains($0) }) || command.contains("$(") { return false }
    let words = command.split(whereSeparator: { " \t".contains($0) }).map { $0.trimmingCharacters(in: CharacterSet(charactersIn: "'\"")) }
    guard let first = words.first, (first as NSString).lastPathComponent == "ola-publish",
          words.count >= 3, alwaysAsk.contains(words[1]) else { return false }
    return words.dropFirst(2).contains("--files")
  }

  /// Whether an opencode approval goes ahead without asking under Lots (the caller checks the mode).
  public static func goesAhead(action: String, resources: [String]) -> Bool {
    askFirstActions.contains(action) && !resources.contains(where: alwaysAsks)
  }

  #if os(macOS)
  /// The local runtime's choice ("On this Mac", the `ola` command, the phone through this Mac).
  public static let key = "ola.permissions"
  /// The cloud runtime's choice on this Mac (OLA-150): sent with each cloud conversation as its
  /// autonomy (`OlaStore.cloudLots`), as the website sends its own switch.
  public static let cloudKey = "ola.permissions.cloud"

  /// The local runtime's choice. Since OLA-142 one per runtime (meeting of 2026-11-18: "settings
  /// follow the runtime, not the product"); before, one value for both.
  public static var mode: PermissionMode {
    get { LocalSettings.defaults.string(forKey: key).flatMap(PermissionMode.init(rawValue:)) ?? .lots }
    set { LocalSettings.defaults.set(newValue.rawValue, forKey: key) }
  }

  public static var lots: Bool { mode == .lots }

  /// The cloud runtime's choice (Lots by default, as on the website).
  public static var cloudMode: PermissionMode {
    get { LocalSettings.defaults.string(forKey: cloudKey).flatMap(PermissionMode.init(rawValue:)) ?? .lots }
    set { LocalSettings.defaults.set(newValue.rawValue, forKey: cloudKey) }
  }

  public static func mode(_ r: Runtime) -> PermissionMode { r == .cloud ? cloudMode : mode }

  /// A store: under its runtime's Lots the ask-first steps go ahead. "On this Mac" the store answers
  /// them itself, "once", as they come; in the cloud the conversation's autonomy lets them run and
  /// the front desk answers web steps, so the store only keeps the card away (`serverAnswers`).
  @MainActor public static func wire(_ store: OlaStore) {
    store.goesAhead = { [weak store] action, resources in
      (store?.runtime == .cloud ? cloudMode : mode) == .lots && goesAhead(action: action, resources: resources)
    }
    store.serverAnswers = { [weak store] in store?.runtime == .cloud }
    store.cloudLots = { cloudMode == .lots }
  }

  /// Changes the local runtime's choice (this Mac, `ola`, the phone through this Mac). Returns nil
  /// (a line to show, for symmetry with `setCloud`).
  @discardableResult
  public static func set(_ m: PermissionMode) async -> String? {
    mode = m
    return nil
  }

  /// Changes the cloud runtime's choice: the next request in a cloud conversation carries it.
  @discardableResult
  public static func setCloud(_ m: PermissionMode) async -> String? {
    cloudMode = m
    return nil
  }

  /// Kept for the callers of the time the machine held the cloud's choice: it is this Mac's now.
  public static func pull() async {}

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

/// The Mac's local switch, as the phone through its Mac reads and sets it: the Mac's relay answers
/// `GET|PUT /ola/permissions`, `{ "mode": "lots" | "ask" }`, with the Mac's choice and keeps a change.
/// (The cloud's switch is each app's own since OLA-150, `CloudAutonomy`.)
public enum MachinePermissions {
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
