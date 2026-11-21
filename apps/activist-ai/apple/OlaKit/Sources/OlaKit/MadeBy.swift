import Foundation

// Which engine made each file (OLA-224). Bart, Nov 19: "the ola agent should know about this
// concept, and know which model built stuff." Three engines can change a project's files: Ola's own
// open model, the hosted open model and Claude. The record is the project's own (project.db, tables
// made_by and made_by_open, written by `ola-db made-by`, workspace/ola-db): every turn is bracketed
// (begin, end), and what it created, changed or deleted is recorded with its engine, whatever tool did
// it. Names, engines, models and times only, never what is in a file. The agent reads it with
// `ola-made-by` (AgentNotes.madeBy); the conversation and Files show it in plain words.

/// One line of the record: a file one engine created, changed or deleted.
public struct MadeByEntry: Codable, Equatable, Sendable {
  public var path: String
  public var how: String
  public var engine: String
  public var model: String?
  public var session: String?
  public var turn: String?
  public var at: String
  public var interrupted: Int?
  public init(path: String, how: String, engine: String, model: String? = nil, session: String? = nil, turn: String? = nil, at: String, interrupted: Int? = 0) {
    self.path = path; self.how = how; self.engine = engine; self.model = model; self.session = session; self.turn = turn; self.at = at; self.interrupted = interrupted
  }
  public var date: Date? { ISO8601DateFormatter().date(from: at) }
  public var who: Turn.Engine { Turn.Engine(rawValue: engine) ?? .ola }
}

/// Where the record is kept for a runtime: the Mac app's own folder (On this Mac) runs `ola-db`.
public protocol MadeByRecord: AnyObject, Sendable {
  /// A turn starts in the folder (its files' names, times and sizes are noted).
  func begin(turn: String, engine: Turn.Engine, model: String?, session: String?) async
  /// The turn ended: the files it created, changed or deleted, now recorded.
  func end(turn: String, model: String?, interrupted: Bool) async -> [String]
  /// Turns left open (the app quit mid-turn) ended as interrupted: turn id to its files.
  func endStale() async -> [String: [String]]
  /// Every file's last change.
  func lastChanges() async -> [MadeByEntry]
  /// Every change recorded in one conversation, oldest first.
  func entries(session: String) async -> [MadeByEntry]
}

public enum MadeByTurns {
  /// Each turn's files, from a conversation's record: a change belongs to the turn of its engine
  /// that was asked last before the file changed.
  public static func assign(_ entries: [MadeByEntry], to turns: inout [Turn]) {
    guard !entries.isEmpty else { return }
    let order = turns.indices.sorted { turns[$0].at < turns[$1].at }
    var found: [Int: [String]] = [:]
    for e in entries {
      guard let d = e.date else { continue }
      // Turn ids in the record are the turn's own for Claude; by time for opencode's.
      if let i = turns.firstIndex(where: { $0.id == e.turn }) { found[i, default: []].append(e.path); continue }
      if let i = order.last(where: { turns[$0].engine == e.who && turns[$0].at <= d.addingTimeInterval(2) }) { found[i, default: []].append(e.path) }
    }
    for (i, files) in found {
      var seen = Set<String>()
      turns[i].changed = files.filter { seen.insert($0).inserted }
    }
  }
}

/// Plain words for the record.
public enum MadeByWords {
  /// "Ola", "Claude", "The hosted open model": who did a step.
  public static func name(_ e: Turn.Engine) -> String {
    switch e {
    case .ola: "Ola"
    case .claude: "Claude"
    case .hosted: "The hosted open model"
    }
  }
  /// "DeepSeek V4 Pro" for a picked choice at the hosted provider (OLA-337), else as `name`.
  public static func name(_ e: Turn.Engine, model: String?) -> String { e == .hosted ? (HostedPick.name(model) ?? name(e)) : name(e) }
  /// For the agent's note: "Claude", "the hosted open model", "DeepSeek V4 Pro, an outside open model".
  static func lower(_ e: Turn.Engine, model: String? = nil) -> String {
    if e == .hosted, let n = HostedPick.name(model) { return "\(n), an outside open model" }
    return e == .hosted ? "the hosted open model" : name(e)
  }

  /// A step that wrote or changed a file, with its engine: "Claude changed index.html".
  public static func step(_ s: Step, by e: Turn.Engine) -> String? {
    guard s.icon == .write || s.icon == .change, !s.verb.isEmpty else { return nil }
    return "\(name(e)) \(s.verb.prefix(1).lowercased() + s.verb.dropFirst())"
  }

  /// "Last changed by Claude, 10:49 pm" (or "Made by Ola, 5:58 pm" when that was its only change).
  public static func file(_ e: MadeByEntry, now: Date = .now) -> String {
    let what = e.how == "created" ? "Made" : e.how == "deleted" ? "Deleted" : "Last changed"
    return "\(what) by \(lower(e.who, model: e.model)), \(when(e.date, now: now))"
  }

  /// "10:49 pm" today, "Nov 18, 10:49 pm" before.
  public static func when(_ d: Date?, now: Date = .now) -> String {
    guard let d else { return "at an unknown time" }
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US")
    f.dateFormat = Calendar.current.isDate(d, inSameDayAs: now) ? "h:mm a" : "MMM d, h:mm a"
    return f.string(from: d).replacingOccurrences(of: "AM", with: "am").replacingOccurrences(of: "PM", with: "pm")
  }

  /// "Claude changed index.html and sun.svg." for a turn's recorded files (shell commands included).
  public static func turn(_ files: [String], by e: Turn.Engine, model: String? = nil) -> String? {
    guard !files.isEmpty else { return nil }
    let names = files.map { ($0 as NSString).lastPathComponent }
    let list = names.count <= 3 ? ListFormatter.localizedString(byJoining: names) : "\(names.prefix(2).joined(separator: ", ")) and \(names.count - 2) other files"
    return "\(name(e, model: model)) changed \(list)."
  }
}

/// What the open model is told about other engines' turns, so the conversation it reads is true
/// whichever engine answers next. It goes before the person's request, between <ola-engines> marks,
/// and the apps strip it when they show the request.
public enum EngineNote {
  static let open = "<ola-engines>"
  static let close = "</ola-engines>"

  /// The note for a request to `target` (the open model, or the hosted one, which read opencode's
  /// conversation): every turn since `target` last answered that another engine did. nil if none.
  public static func note(for turns: [Turn], target: Turn.Engine) -> String? {
    let last = turns.lastIndex { $0.engine == target && !$0.isRunning } ?? -1
    let others = turns.suffix(from: last + 1).filter { $0.engine != target && !$0.isRunning && $0.status != .sending }
    guard !others.isEmpty else { return nil }
    let lines = others.suffix(6).map { t -> String in
      let asked = t.request.count > 80 ? String(t.request.prefix(80)) + "\u{2026}" : t.request
      let files = t.changed ?? t.steps.filter { ($0.icon == .write || $0.icon == .change) && $0.status == .done }.map(\.object)
      let did = files.isEmpty ? "changed no files" : "changed " + Array(Set(files)).sorted().joined(separator: ", ")
      let end = t.status == .done ? "" : t.status == .stopped ? " (it was stopped before it finished)" : " (it did not finish)"
      return "- \(MadeByWords.name(t.engine, model: t.model)), asked \"\(asked)\", \(did)\(end)."
    }
    return open + "Before this request, other engines worked in this conversation, not you:\n" + lines.joined(separator: "\n")
      + "\nTheir replies in this conversation are theirs, not yours: never say you did their work. `ola-made-by <file>` shows who made a file." + close + "\n\n"
  }

  /// The request as the person typed it: a leading note is removed.
  public static func strip(_ text: String) -> String {
    guard text.hasPrefix(open), let r = text.range(of: close) else { return text }
    return String(text[r.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
  }
}

#if os(macOS)
/// On this Mac: the record in the folder's project.db, through the app's own copy of `ola-db`.
public final class LocalMadeBy: MadeByRecord, @unchecked Sendable {
  public let folder: URL
  public let tools: URL
  private let queue = DispatchQueue(label: "ola.madeby")

  public init(folder: URL, tools: URL = LocalServer.support.appendingPathComponent("web-tools")) {
    self.folder = folder
    self.tools = tools
  }

  /// Runs `ola-db made-by <args>` in the folder; its output (JSON), or nil.
  func run(_ args: [String]) async -> Data? {
    await withCheckedContinuation { (c: CheckedContinuation<Data?, Never>) in
      queue.async { [folder, tools] in
        let db = tools.appendingPathComponent("ola-db")
        guard FileManager.default.isExecutableFile(atPath: db.path) else { c.resume(returning: nil); return }
        let p = Process()
        p.executableURL = db
        p.arguments = ["made-by"] + args
        p.currentDirectoryURL = folder
        var env = ProcessInfo.processInfo.environment
        env["OLA_WORK"] = folder.path
        env["OLA_LIB"] = tools.path
        p.environment = env
        let out = Pipe()
        p.standardOutput = out
        p.standardError = FileHandle.nullDevice
        guard (try? p.run()) != nil else { c.resume(returning: nil); return }
        let d = out.fileHandleForReading.readDataToEndOfFile()
        p.waitUntilExit()
        c.resume(returning: p.terminationStatus == 0 ? d : nil)
      }
    }
  }

  public func begin(turn: String, engine: Turn.Engine, model: String?, session: String?) async {
    var a = ["begin", "--turn", turn, "--engine", engine.rawValue]
    if let model { a += ["--model", model] }
    if let session { a += ["--session", session] }
    _ = await run(a)
  }

  public func end(turn: String, model: String?, interrupted: Bool) async -> [String] {
    var a = ["end", "--turn", turn]
    if let model { a += ["--model", model] }
    if interrupted { a.append("--interrupted") }
    guard let d = await run(a), let j = JSON.parse(d) else { return [] }
    return j["files"].array.map { $0["path"].str }
  }

  public func endStale() async -> [String: [String]] {
    guard let d = await run(["end", "--stale"]), let j = JSON.parse(d) else { return [:] }
    var out: [String: [String]] = [:]
    for t in j.array { out[t["turn"].str] = t["files"].array.map { $0["path"].str } }
    return out
  }

  public func lastChanges() async -> [MadeByEntry] {
    guard let d = await run(["--json", "--limit", "2000"]) else { return [] }
    return (try? JSONDecoder().decode([MadeByEntry].self, from: d)) ?? []
  }

  public func entries(session: String) async -> [MadeByEntry] {
    guard let d = await run(["--json", "--session", session]) else { return [] }
    return (try? JSONDecoder().decode([MadeByEntry].self, from: d)) ?? []
  }
}
#endif
