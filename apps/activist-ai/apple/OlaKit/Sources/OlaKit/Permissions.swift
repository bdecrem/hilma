#if os(macOS)
import Foundation

/// Permissions (Mac Settings, General; `ola settings permissions`), 2026-11-17. Bart: "add a Lots Of
/// Permissions options in the settings on the cli and macos app: too many nags".
///
/// - **Lots of permissions** (the default): Ola goes ahead with the steps that used to ask first
///   (a command, a new or changed file) without asking.
/// - **Ask before each step**: as before.
///
/// What is refused stays refused either way (opencode's own web fetch and search, code mode, files
/// outside the folder, skills not Ola's, models not Ola's), and a web search or download through
/// Ola's own commands (`ola-search`, `ola-fetch`, `ola-lookup`) still asks: what leaves the Mac is
/// Bart's call each time. One value for the app and the `ola` command (the same executable, the same
/// defaults).
public enum PermissionMode: String, CaseIterable, Sendable {
  case lots, ask

  public var label: String {
    switch self {
    case .lots: "Lots of permissions: Ola goes ahead without asking"
    case .ask: "Ask before each step"
    }
  }
}

public enum PermissionSettings {
  public static let key = "ola.permissions"

  public static var mode: PermissionMode {
    get { LocalSettings.defaults.string(forKey: key).flatMap(PermissionMode.init(rawValue:)) ?? .lots }
    set { LocalSettings.defaults.set(newValue.rawValue, forKey: key) }
  }

  public static var lots: Bool { mode == .lots }

  /// opencode's ask-first steps: these, and only these, go ahead under Lots.
  public static let askFirstActions: Set<String> = ["shell", "bash", "edit", "write", "apply_patch"]
  /// Ola's own web commands: asked about either way.
  public static let webCommands = ["ola-search", "ola-fetch", "ola-lookup"]

  /// Whether an opencode approval goes ahead without asking under Lots (the caller checks `lots`).
  public static func goesAhead(action: String, resources: [String]) -> Bool {
    guard askFirstActions.contains(action) else { return false }
    return !resources.contains { r in webCommands.contains { r.contains($0) } }
  }

  /// The app's store: under Lots, opencode's ask-first steps are answered "once" as they come, so a
  /// change applies to the next step, on this Mac's agent and on the Ola machine's alike.
  @MainActor public static func wire(_ store: OlaStore) {
    store.goesAhead = { action, resources in lots && goesAhead(action: action, resources: resources) }
  }

  // MARK: Claude Code (Fallback to Claude)

  /// Claude Code's tools that read or write one path (in `file_path`, `notebook_path` or `path`).
  static let claudeFileTools: Set<String> = ["Read", "Write", "Edit", "MultiEdit", "NotebookEdit", "Glob", "Grep", "LS"]
  /// Claude Code's tools that only run or watch a command in the folder.
  static let claudeShellTools: Set<String> = ["Bash", "BashOutput", "KillShell", "KillBash"]

  /// Under Lots, a Claude Code question that goes ahead without asking: what acceptEdits allows
  /// (reading and writing files inside the folder) plus commands that name no path outside it.
  /// Anything else asks as before: a file outside the folder, a command that names one (an absolute
  /// path, `~`, `..`), sudo, Ola's web commands, web fetches and searches, other tools.
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
  /// (starting with / or ~, or holding ..) makes it ask, and so do sudo, a `$` variable and Ola's
  /// web commands. A check of the words, not a wall (as opencode's own patterns are).
  static func commandStaysIn(_ command: String, _ folder: URL) -> Bool {
    let c = command.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !c.isEmpty else { return false }
    if webCommands.contains(where: { c.contains($0) }) { return false }
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
}
#endif
