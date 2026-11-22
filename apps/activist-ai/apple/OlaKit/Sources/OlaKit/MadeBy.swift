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

/// What the model connection says served one person's requests (GET /v1/served?steps=1, gateway
/// design.mjs): every chat step as [when it finished, conversation, name], and the design model's id.
public struct ServedSteps: Equatable, Sendable {
  public struct Step: Equatable, Sendable {
    public var at: Double // ms since 1970, the gateway's clock
    public var session: String
    public var name: String
    public init(at: Double, session: String, name: String) { self.at = at; self.session = session; self.name = name }
  }
  public var steps: [Step]
  public var designModel: String?
  public init(steps: [Step], designModel: String? = nil) { self.steps = steps; self.designModel = designModel }

  /// The gateway's answer, or nil when it is not one.
  public static func parse(_ j: JSON) -> ServedSteps? {
    guard j["object"].string == "served" else { return nil }
    let steps = j["steps"].array.compactMap { r -> Step? in
      let a = r.array
      guard a.count >= 3, let at = a[0].double, let s = a[1].string, let n = a[2].string else { return nil }
      return Step(at: at, session: s, name: n)
    }
    return ServedSteps(steps: steps, designModel: j["design_model"].string)
  }
}

/// Which model made one change (OLA-303, with Ola working on the Mac). The design model serves Ola's
/// steps once the designer skill is loaded, and only the model connection knows which step it served:
/// until Nov 22 the Mac recorded every Ola turn as `general`, so a page the design model made (41 of
/// its 44 steps) was "created by Ola's own open model (model general)" and Ola said so. The same rule
/// as the cloud's front desk (frontdesk/madeby.mjs attributeChange): the last step at or before the
/// file's time decides; steps of two conversations within a few seconds are too close to tell.
public enum MadeByAttribution {
  public static let clockSlackMs: Double = 1000
  public static let tooCloseMs: Double = 3000

  /// `design:<id>` (as the record keeps it, and `ola-made-by` prints as an outside model).
  public static func designModel(_ id: String?) -> String {
    let t = (id ?? "").trimmingCharacters(in: .whitespaces)
    return "design:" + (t.isEmpty ? "thinkingmachines/Inkling-2-Small" : t)
  }

  /// The model for a change made at `mtimeMs` in conversation `session`: `design:<id>`, "unknown"
  /// (two conversations, one of them design), or nil (Ola's own model, or no step before it).
  public static func model(for mtimeMs: Double, session: String, served: ServedSteps) -> String? {
    let before = served.steps.filter { $0.at <= mtimeMs + clockSlackMs }.sorted { $0.at < $1.at }
    guard let latest = before.last?.at else { return nil }
    var last: [String: ServedSteps.Step] = [:]
    for s in before { last[s.session] = s }
    let cands = last.values.filter { $0.at >= latest - tooCloseMs }
    let design = { (s: ServedSteps.Step) in s.name == "design" }
    if cands.count == 1 { return design(cands[0]) ? designModel(served.designModel) : nil }
    if cands.allSatisfy(design) { return designModel(served.designModel) }
    if !cands.contains(where: design) { return nil }
    return "unknown"
  }
}

#if os(macOS)
/// On this Mac: the record in the folder's project.db, through the app's own copy of `ola-db`.
public final class LocalMadeBy: MadeByRecord, @unchecked Sendable {
  public let folder: URL
  public let tools: URL
  private let queue = DispatchQueue(label: "ola.madeby")
  /// Asks the model connection which names served this person's steps since a moment (ms), for one
  /// conversation (ModelDoor.served). nil: no model is named beyond the one the turn began with.
  public var served: (@Sendable (_ session: String, _ sinceMs: Int) async -> ServedSteps?)?
  /// The open turns: their conversation, engine and when they began (for the served query).
  private var open: [String: (session: String?, engine: Turn.Engine, began: Date)] = [:]
  private let lock = NSLock()
  /// How far before a turn began its steps are read (a change can come from a step just before it).
  static let stepsBack: TimeInterval = 15 * 60

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
    lock.withLock { open[turn] = (session, engine, Date()) }
    _ = await run(a)
  }

  public func end(turn: String, model: String?, interrupted: Bool) async -> [String] {
    var a = ["end", "--turn", turn]
    if let model { a += ["--model", model] }
    if interrupted { a.append("--interrupted") }
    let t = lock.withLock { open.removeValue(forKey: turn) }
    guard let d = await run(a), let j = JSON.parse(d) else { return [] }
    let files = j["files"].array
    // Ola's own turn: which model made each change, from the model connection (OLA-303).
    if let t, t.engine == .ola, model == nil, let sid = t.session, !sid.isEmpty, let served,
       let s = await served(sid, Int((t.began.timeIntervalSince1970 - Self.stepsBack) * 1000)) {
      await attribute(turn: turn, session: sid, files: files, served: s)
    }
    return files.map { $0["path"].str }
  }

  /// Each changed file's row gets the model that made it, when that was not Ola's own (`fix`).
  func attribute(turn: String, session: String, files: [JSON], served: ServedSteps) async {
    var groups: [String: [String]] = [:]
    for f in files where f["how"].string != "deleted" {
      guard let m = f["mtime"].double, let path = f["path"].string,
            let model = MadeByAttribution.model(for: m * 1000, session: session, served: served) else { continue }
      groups[model, default: []].append(path)
    }
    for (model, paths) in groups {
      for i in stride(from: 0, to: paths.count, by: 20) {
        _ = await run(["fix", "--turn", turn] + paths[i..<min(i + 20, paths.count)] + ["--model", model])
      }
    }
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

/// The record kept from the local runtime's own events, the way the Mac app's store keeps it while
/// it shows a conversation (OlaStore beginRecord/endRecord): each opencode run is bracketed, Ola's own
/// open model by default. For a runtime with no window: the request tests' local runtime
/// (olakit-selftest OLA_SERVE_LOCAL) had no record at all, so "who made that page?" there tested
/// something no Mac does (design-who-made-local, Nov 22: "there's no record of who made ...").
public final class LocalTurnRecorder: @unchecked Sendable {
  let record: LocalMadeBy
  let client: OpenCodeClient
  private var turns: [String: String] = [:]
  private let lock = NSLock()
  private var task: Task<Void, Never>?

  public init(record: LocalMadeBy, client: OpenCodeClient) {
    self.record = record
    self.client = client
  }

  /// Follows the event stream (again after a drop) until stopped.
  public func start() {
    task = Task { [weak self] in
      while !Task.isCancelled, let self {
        do { for try await ev in self.client.events() { await self.handle(ev) } } catch {}
        try? await Task.sleep(nanoseconds: 500_000_000)
      }
    }
  }

  public func stop() { task?.cancel() }

  func handle(_ ev: JSON) async {
    let type = ev["type"].str
    let sid = ev["data"]["sessionID"].str
    guard !sid.isEmpty else { return }
    switch type {
    case "session.execution.started", "session.inbox.enqueued":
      let turn: String? = lock.withLock {
        guard turns[sid] == nil else { return nil }
        let t = "oc-\(sid)-\(Int(Date().timeIntervalSince1970 * 1000))"
        turns[sid] = t
        return t
      }
      if let turn { await record.begin(turn: turn, engine: .ola, model: "general", session: sid) }
    case "session.execution.succeeded", "session.execution.failed", "session.execution.interrupted":
      if let turn = lock.withLock({ turns.removeValue(forKey: sid) }) {
        _ = await record.end(turn: turn, model: nil, interrupted: type != "session.execution.succeeded")
      }
    default: break
    }
  }
}
#endif
