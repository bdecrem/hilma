import Foundation

// What the agent did, in plain words. A port of web/src/lib/steps.ts: keep the two in step, so the
// web app and Bart's apps say the same thing. The one place that knows opencode's tool names and
// arguments (2.3.0: glob, grep, read, write, edit, apply_patch, shell, todowrite, task, webfetch,
// websearch). A new tool falls through to "Used <name>": less well said, never hidden.

public enum StepIcon: String, Sendable, Codable { case look, read, write, change, run, check, search, think, other }

public struct Words: Equatable, Sendable {
  public var icon: StepIcon
  public var verb: String
  public var object: String
}

/// An error said out loud: one sentence, and the raw detail behind "Show details".
public struct Problem: Equatable, Sendable, Codable {
  public var text: String
  public var detail: String?
  public init(text: String, detail: String? = nil) {
    self.text = text
    self.detail = detail
  }
}

public enum Plain {
  /// A path as Bart knows it: relative to the project folder, or the bare name.
  public static func shortPath(_ p: String, dir: String?) -> String {
    if p.isEmpty { return "" }
    if let dir {
      let d = dir.hasSuffix("/") ? dir : dir + "/"
      if p.hasPrefix(d) { return String(p.dropFirst(d.count)) }
      if p == dir { return "the project folder" }
    }
    if p.hasPrefix("/") { return p.split(separator: "/").last.map(String.init) ?? p }
    return p.hasPrefix("./") ? String(p.dropFirst(2)) : p
  }

  static func pathOf(_ input: JSON) -> String {
    for k in ["path", "filePath", "file"] { if let s = input[k].string, !s.isEmpty { return s } }
    return ""
  }

  private static func matches(_ s: String, _ pattern: String) -> Bool {
    s.range(of: pattern, options: .regularExpression) != nil
  }

  private static func firstMatch(_ s: String, _ pattern: String, group: Int) -> String? {
    guard let re = try? NSRegularExpression(pattern: pattern), let m = re.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)),
          let r = Range(m.range(at: group), in: s) else { return nil }
    return String(s[r])
  }

  /// A shell command, said plainly.
  public static func describeCommand(_ command: String) -> Words {
    let c = command.trimmingCharacters(in: .whitespacesAndNewlines)
    // Ola's own web commands read as what they do, not as "Ran ola-search".
    if let w = WebAsk.request(WebAsk.stripRedirects(c)) {
      switch w.kind {
      case .search: return Words(icon: .search, verb: "Searched the web for", object: w.item.map { "\u{201C}\($0)\u{201D}" } ?? "")
      case .lookup: return Words(icon: .search, verb: "Looked up", object: w.item.map { "\u{201C}\($0)\u{201D}" } ?? "a paper")
      case .fetch: return Words(icon: .read, verb: "Downloaded", object: w.item ?? "a document")
      }
    }
    if let script = firstMatch(c, #"^(?:python3?|node|Rscript|bash|sh)\s+(?!-)([\w./-]+\.(?:py|js|mjs|R|sh))"#, group: 1) {
      return Words(icon: .run, verb: "Ran", object: script.split(separator: "/").last.map(String.init) ?? script)
    }
    if matches(c, #"^(python3?|node|Rscript)\s+-[ce]\b"#) || matches(c, #"^(python3?|node)\s*<<"#) { return Words(icon: .run, verb: "Ran a short program", object: "") }
    if matches(c, #"^(awk|sed|perl|jq)\b"#) { return Words(icon: .run, verb: "Ran a short program", object: "") }
    if matches(c, #"^(pip3?|npm|uv)\s+install\b"#) { return Words(icon: .run, verb: "Tried to install a tool", object: "") }
    if matches(c, #"^(ls|find|tree)\b"#) { return Words(icon: .look, verb: "Looked through", object: "the project folder") }
    if matches(c, #"^(cat|head|tail|less|wc)\b"#) {
      let file = c.split(whereSeparator: \.isWhitespace).dropFirst().first { !$0.hasPrefix("-") }.map(String.init)
      return Words(icon: .read, verb: c.hasPrefix("wc") ? "Counted the lines in" : "Read", object: file.map { $0.split(separator: "/").last.map(String.init) ?? $0 } ?? "a file")
    }
    if matches(c, #"^(grep|rg)\b"#) { return Words(icon: .search, verb: "Searched the files", object: "") }
    if matches(c, #"\b(test|pytest|check)\b"#) { return Words(icon: .check, verb: "Checked the work", object: "") }
    if matches(c, #"^(mkdir|cp|mv|touch)\b"#) { return Words(icon: .change, verb: "Arranged files", object: "") }
    let first = c.split(whereSeparator: \.isWhitespace).first.map(String.init) ?? ""
    return !first.isEmpty && first.count <= 24 ? Words(icon: .run, verb: "Ran", object: first) : Words(icon: .run, verb: "Ran a command", object: "")
  }

  public static func describeTool(_ tool: String, input: JSON, dir: String?) -> Words {
    switch tool {
    case "glob":
      let pattern = input["pattern"].str
      let bare = pattern.replacingOccurrences(of: #"^(\*\*/)+"#, with: "", options: .regularExpression)
      if pattern.isEmpty || matches(pattern, #"^\**/?\*?$"#) || bare == "*" { return Words(icon: .look, verb: "Looked through", object: "the project folder") }
      if !matches(bare, #"[*?\[\]{}]"#) { return Words(icon: .look, verb: "Looked for", object: bare) }
      return Words(icon: .look, verb: "Looked through", object: "files like \(bare)")
    case "list", "ls":
      let p = shortPath(pathOf(input), dir: dir)
      return Words(icon: .look, verb: "Looked through", object: p.isEmpty ? "the project folder" : p)
    case "grep":
      return Words(icon: .search, verb: "Searched the files for", object: "\u{201C}\(input["pattern"].str)\u{201D}")
    case "read":
      let p = shortPath(pathOf(input), dir: dir)
      return Words(icon: .read, verb: "Read", object: p.isEmpty ? "a file" : p)
    case "write":
      let p = shortPath(pathOf(input), dir: dir)
      return Words(icon: .write, verb: "Wrote", object: p.isEmpty ? "a file" : p)
    case "edit", "patch", "apply_patch", "multiedit":
      let p = shortPath(pathOf(input), dir: dir)
      return Words(icon: .change, verb: "Changed", object: p.isEmpty ? "a file" : p)
    case "shell", "bash":
      return describeCommand(input["command"].str)
    case "todowrite", "todoread":
      return Words(icon: .think, verb: "Planned the next steps", object: "")
    case "task":
      return Words(icon: .think, verb: "Handed part of the work to a helper", object: input["description"].str)
    case "webfetch":
      return Words(icon: .search, verb: "Opened a web page", object: input["url"].str)
    case "websearch":
      return Words(icon: .search, verb: "Searched the web for", object: "\u{201C}\(input["query"].str)\u{201D}")
    case "skill":
      return Words(icon: .think, verb: "Looked up how to do this", object: "")
    case "question":
      // Ola's question to the person (OLA-301), said as the web app says it.
      let first = input["questions"].array.first
      return Words(icon: .think, verb: "Asked you", object: first?["question"].string ?? first?["header"].str ?? "")
    default:
      return Words(icon: .other, verb: "Used", object: tool)
    }
  }

  static func plural(_ n: Int, _ one: String, _ many: String? = nil) -> String {
    let f = NumberFormatter()
    f.numberStyle = .decimal
    f.locale = Locale(identifier: "en_US")
    return "\(f.string(from: NSNumber(value: n)) ?? String(n)) \(n == 1 ? one : (many ?? one + "s"))"
  }

  /// The short result on the right of a finished step, or nil.
  public static func describeResult(_ tool: String, input: JSON, output: String, metadata: JSON) -> String? {
    if tool == "glob", let n = metadata["count"].int { return plural(n, "file") }
    if tool == "grep", let n = metadata["matches"].int { return plural(n, "match", "matches") }
    if tool == "read" {
      let lines = output.split(separator: "\n", omittingEmptySubsequences: false)
      let numbered = lines.filter { matches(String($0), #"^\s*\d+[:|\t]"#) }.count
      let n = numbered > 0 ? numbered : lines.count
      if let limit = input["limit"].int { return "the first \(plural(min(n, limit), "line"))" }
      return plural(n, "line")
    }
    if tool == "shell" || tool == "bash" {
      let out = output.trimmingCharacters(in: .whitespacesAndNewlines)
      if !out.isEmpty && !out.contains("\n") && out.count <= 32 { return "printed \(out)" }
      if !out.isEmpty { return plural(out.split(separator: "\n", omittingEmptySubsequences: false).count, "line") + " of output" }
      return "done"
    }
    return nil
  }

  /// Did a shell step really work? opencode reports success even when the program exited non-zero.
  public static func shellFailed(_ metadata: JSON) -> Int? {
    if let exit = metadata["exit"].int, exit != 0 { return exit }
    return nil
  }

  static func firstLine(_ s: String, max: Int = 160) -> String {
    let line = s.split(separator: "\n").first { !$0.trimmingCharacters(in: .whitespaces).isEmpty }.map(String.init) ?? ""
    return line.count > max ? String(line.prefix(max - 1)) + "\u{2026}" : line
  }

  /// Why a step failed, in one plain sentence.
  public static func stepProblem(_ error: JSON) -> Problem {
    let m = error["message"].str
    let has = { (p: String) in m.range(of: p, options: [.regularExpression, .caseInsensitive]) != nil }
    if has("Invalid arguments for tool") { return Problem(text: "Ola asked for this the wrong way and can try again.", detail: m) }
    if has("declined") { return Problem(text: "You said no, so Ola did not do this.", detail: m) }
    if has("rejected|denied|not allowed") { return Problem(text: "Not allowed here, so Ola did not do it.", detail: m) }
    if has("no such file|ENOENT|not found") { return Problem(text: "The file was not there.", detail: m) }
    if has("timed? ?out") { return Problem(text: "This took too long and was stopped.", detail: m) }
    let f = firstLine(m)
    return Problem(text: f.isEmpty ? "This step did not work." : f, detail: m.isEmpty ? nil : m)
  }

  /// The week's allowance of Ola's model is used up (OLA-205): whose it is and the moment it
  /// starts again, in the reader's own time zone ("Your weekly allowance of Ola's model is used up.
  /// It starts again on Sunday, November 22, at 4 pm."). The moment is the instant in the
  /// gateway's message when it carries one, else the gateway's rule: weeks start Monday 00:00 UTC.
  /// A person's own computer hears "Your", a project's workspace "This project's". The same words
  /// as the web app (web/src/lib/steps.ts quotaProblem). No token counts, no settings, no names.
  public static func quotaProblem(_ message: String, now: Date = Date(), timeZone: TimeZone = .current) -> String {
    let has = { (p: String) in message.range(of: p, options: [.regularExpression, .caseInsensitive]) != nil }
    let whose = has("your weekly allowance") ? "Your" : has("project|this week's quota") ? "This project's" : "Your"
    var at = nextWeekStart(now)
    if let r = message.range(of: #"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z"#, options: .regularExpression) {
      let iso = ISO8601DateFormatter()
      let frac = ISO8601DateFormatter()
      frac.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
      let s = String(message[r])
      if let d = frac.date(from: s) ?? iso.date(from: s) { at = d }
    }
    return "\(whose) weekly allowance of Ola's model is used up. It starts again \(when(at, timeZone))."
  }

  static func nextWeekStart(_ now: Date) -> Date {
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = TimeZone(identifier: "UTC")!
    let today = cal.startOfDay(for: now)
    let fromMonday = (cal.component(.weekday, from: today) + 5) % 7 // Monday = 0
    return cal.date(byAdding: .day, value: 7 - fromMonday, to: today)!
  }

  static func when(_ d: Date, _ tz: TimeZone) -> String {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = tz
    f.dateFormat = "EEEE, MMMM d"
    let day = f.string(from: d)
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = tz
    let h = cal.component(.hour, from: d), m = cal.component(.minute, from: d)
    if h == 0 && m == 0 { return "at the start of \(day)" }
    let time = "\(h % 12 == 0 ? 12 : h % 12)\(m == 0 ? "" : String(format: ":%02d", m)) \(h < 12 ? "am" : "pm")"
    return "on \(day), at \(time)"
  }

  /// Why a whole request failed, in plain words, from opencode's structured error.
  public static func runProblem(_ error: JSON) -> Problem {
    let m = error["message"].str
    let status = error["status"].int
    let detail = [error["type"].string, status.map(String.init), m.isEmpty ? nil : m].compactMap { $0 }.joined(separator: " \u{00B7} ")
    let d = detail.isEmpty ? nil : detail
    let has = { (p: String) in m.range(of: p, options: [.regularExpression, .caseInsensitive]) != nil }
    if status == 429 || has("quota|insufficient_quota|weekly allowance") { return Problem(text: quotaProblem(m), detail: d) }
    if status == 401 || status == 403 { return Problem(text: "Ola's model did not accept this computer's sign-in. Sign out and sign in again in Settings, Account.", detail: d) }
    if status == 503 || status == 504 || has("overloaded|timeout") { return Problem(text: "The model is busy or did not answer in time. Nothing was lost; try again in a minute.", detail: d) }
    if let s = status, s >= 500 { return Problem(text: "The model server had a problem. Nothing was lost; try again in a minute.", detail: d) }
    if let s = status, s >= 400 { return Problem(text: "The model could not take this request. Try saying it another way, or in smaller steps.", detail: d) }
    let f = firstLine(m, max: 120)
    return Problem(text: f.isEmpty ? "It stopped before it finished." : "It stopped: \(f)", detail: d)
  }

  /// The step words are past tense ("Ran"); a question about the future needs the plain form.
  public static func present(_ verb: String) -> String {
    let table: [(String, String)] = [("^Ran\\b", "Run"), ("^Looked\\b", "Look"), ("^Counted\\b", "Count"), ("^Searched\\b", "Search"), ("^Checked\\b", "Check"), ("^Arranged\\b", "Arrange"), ("^Tried to install\\b", "Install")]
    return table.reduce(verb) { $0.replacingOccurrences(of: $1.0, with: $1.1, options: .regularExpression) }
  }

  /// For a web question, the line under it: what leaves the machine. nil for anything else.
  public static func webNote(action: String, resources: [String]) -> String? {
    guard action == "shell" || action == "bash", let w = WebAsk.question(resources) else { return nil }
    return WebAsk.leaves(w.first)
  }

  /// The publish (or take-down) yes for a permission request, described by cards.mjs (OLA-325),
  /// or nil for any other request. For the Mac's own command (Ola working on the Mac) the files
  /// are read from the folder here; in a cloud project the command names them.
  public static func publishCard(action: String, resources: [String], dir: String?, cloudProject: String? = nil) -> PublishCard? {
    guard action == "shell" || action == "bash", resources.count == 1, resources[0].contains("ola-publish") else { return nil }
    var files: [String]? = nil
    if let p = Cards.localPublish(resources[0]) {
      let folder = p.folder.hasPrefix("/") ? p.folder : dir.map { ($0 as NSString).appendingPathComponent(p.folder) }
      files = folder.map(listFolder) ?? []
    }
    return Cards.publish(action: action, resources: resources, address: cloudProject.map { "sites.ola.cx/\($0)/" }, files: files)
  }

  /// The files ola-publish sends from a folder, as it lists them: hidden parts, node_modules and
  /// __pycache__ are skipped (ola-publish names them only), sorted.
  static func listFolder(_ path: String) -> [String] {
    guard let e = FileManager.default.enumerator(atPath: path) else { return [] }
    var out: [String] = []
    while let rel = e.nextObject() as? String {
      let parts = rel.split(separator: "/").map(String.init)
      if parts.contains(where: { $0.hasPrefix(".") || $0 == "node_modules" || $0 == "__pycache__" }) { continue }
      var isDir: ObjCBool = false
      if FileManager.default.fileExists(atPath: (path as NSString).appendingPathComponent(rel), isDirectory: &isDir), !isDir.boolValue { out.append(rel) }
    }
    return out.sorted()
  }

  /// A permission request as a question Bart can answer.
  public static func describeApproval(action: String, resources: [String], metadata: JSON, dir: String?, cloudProject: String? = nil) -> (title: String, items: [ApprovalItem]) {
    let files = metadata["files"].array
    // A web search, download or lookup: the question says exactly what would leave the machine,
    // as in the web app (web/src/lib/steps.ts).
    // The exact command stays one tap away ("View") when it holds more than the web command.
    if action == "shell" || action == "bash", let w = WebAsk.question(resources) {
      return (WebAsk.title(w.first), w.webs.map { r in
        ApprovalItem(label: WebAsk.label(r), detail: r.item == nil || w.extra ? resources.joined(separator: "\n") : nil, isCommand: r.item == nil)
      })
    }
    // Publishing, or taking pages down (OLA-230, OLA-267): the card's words from cards.mjs, the
    // same as the website's; the files that go public and the address (the cloud project's,
    // sites.ola.cx/<project>/, when known: OLA-267 #8), never the command (OLA-325).
    if let c = publishCard(action: action, resources: resources, dir: dir, cloudProject: cloudProject) {
      return (c.title, c.files.map { ApprovalItem(label: $0, detail: nil, isCommand: false) })
    }
    if action == "shell" || action == "bash" {
      return ("Ola wants to run a command", resources.map { cmd in
        let w = describeCommand(cmd)
        return ApprovalItem(label: present(w.verb) + (w.object.isEmpty ? "" : " \(w.object)"), detail: cmd, isCommand: true)
      })
    }
    if action == "edit" || action == "write" || action == "apply_patch" {
      let items = !files.isEmpty
        ? files.map { f in ApprovalItem(label: "\(f["status"].str == "added" ? "Make a new file:" : "Change") \(shortPath(f["file"].str, dir: dir))", detail: f["patch"].string, isCommand: false) }
        : resources.map { ApprovalItem(label: "Change \(shortPath($0, dir: dir))", detail: nil, isCommand: false) }
      return (items.count == 1 ? "Ola wants to write a file" : "Ola wants to write \(items.count) files", items)
    }
    if action == "webfetch" { return ("Ola wants to open a web page", resources.map { ApprovalItem(label: $0, detail: nil, isCommand: false) }) }
    return ("Ola wants to \(action.replacingOccurrences(of: "_", with: " "))", resources.map { ApprovalItem(label: $0, detail: nil, isCommand: false) })
  }
}
