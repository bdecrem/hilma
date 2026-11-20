import Foundation

// Fallback to Claude: Claude Code itself, headless, as a second engine beside Ola's opencode.
// The plain words for its tools are the web app's (web/src/lib/steps.ts, "Claude Code"): each
// Claude Code tool is said with the verb of its opencode counterpart. Keep the two in step.

extension Plain {
  static let claudeTools: [String: String] = [
    "Read": "read", "Write": "write", "Edit": "edit", "MultiEdit": "multiedit", "NotebookEdit": "edit",
    "Bash": "shell", "Glob": "glob", "Grep": "grep", "LS": "list", "Task": "task", "Agent": "task",
    "TodoWrite": "todowrite", "Skill": "skill", "ToolSearch": "skill", "WebFetch": "webfetch", "WebSearch": "websearch",
  ]
  /// opencode's name for a Claude Code tool (unknown ones keep their own name).
  public static func claudeTool(_ name: String) -> String { claudeTools[name] ?? name }
  /// Claude Code's arguments, with the file argument where describeTool looks for it.
  public static func claudeInput(_ input: JSON) -> JSON {
    var o = input.object
    if o["path"] == nil, let f = input["file_path"].string { o["path"] = .string(f) }
    if o["path"] == nil, let f = input["notebook_path"].string { o["path"] = .string(f) }
    return .object(o)
  }
  public static func describeClaudeTool(_ name: String, input: JSON, dir: String?) -> Words {
    if name == "EnterPlanMode" || name == "ExitPlanMode" { return Words(icon: .think, verb: "Planned the next steps", object: "") }
    return describeTool(claudeTool(name), input: claudeInput(input), dir: dir)
  }
  /// Claude Code's permission question (can_use_tool) as a question Bart can answer.
  public static func describeClaudeApproval(_ name: String, input: JSON, dir: String?) -> (title: String, action: String, items: [ApprovalItem]) {
    let tool = claudeTool(name)
    let a = claudeInput(input)
    if tool == "shell" {
      let cmd = a["command"].str
      let w = describeCommand(cmd)
      return ("Claude wants to run a command", "shell", [ApprovalItem(label: present(w.verb) + (w.object.isEmpty ? "" : " \(w.object)"), detail: cmd, isCommand: true)])
    }
    if tool == "write" || tool == "edit" || tool == "multiedit" {
      let file = shortPath(a["path"].str, dir: dir)
      let edits = a["edits"].array.map { "- \($0["old_string"].str)\n+ \($0["new_string"].str)" }.joined(separator: "\n\n")
      let detail = tool == "write" ? a["content"].str : (!edits.isEmpty ? edits : (a["old_string"].str.isEmpty && a["new_string"].str.isEmpty ? "" : "- \(a["old_string"].str)\n+ \(a["new_string"].str)"))
      return ("Claude wants to write a file", "edit", [ApprovalItem(label: "\(tool == "write" ? "Write" : "Change") \(file.isEmpty ? "a file" : file)", detail: detail.isEmpty ? nil : detail, isCommand: false)])
    }
    let w = describeClaudeTool(name, input: input, dir: dir)
    return ("Claude wants to \(present(w.verb).lowercased())\(w.object.isEmpty ? "" : " \(w.object)")", tool, [ApprovalItem(label: name, detail: input.pretty, isCommand: false)])
  }
}

/// Folds Claude Code's stream-json events into a Turn, the way Conversation folds opencode's.
public struct ClaudeFold: Sendable {
  public var directory: String?
  /// The model Claude Code said it runs (its first event), for the record of who made a file.
  public var model: String?
  var message: String?
  public init(directory: String?) { self.directory = directory }

  public mutating func apply(_ e: JSON, to turn: inout Turn) {
    let at = Date()
    switch e["type"].str {
    case "system":
      if turn.status == .sending { turn.status = .working }
      if let m = e["model"].string, !m.isEmpty { model = m }
      if e["subtype"].str == "api_retry" { turn.notice = "Claude did not answer. Trying again (attempt \(e["attempt"].int ?? 2))." }
    case "stream_event":
      let ev = e["event"]
      if ev["type"].str == "message_start" {
        let id = ev["message"]["id"].string
        if id != message {
          let prior = turn.answer.trimmingCharacters(in: .whitespacesAndNewlines)
          if !prior.isEmpty { turn.notes.append(prior) }
          turn.answer = ""
          message = id
        }
      }
      if ev["type"].str == "content_block_delta", ev["delta"]["type"].str == "text_delta" {
        turn.answer += ev["delta"]["text"].str
        turn.status = .working
        turn.notice = nil
      }
    case "assistant":
      turn.status = .working
      let id = e["message"]["id"].string
      var text = ""
      for c in e["message"]["content"].array {
        if c["type"].str == "text" { text += c["text"].str }
        if c["type"].str == "tool_use", !turn.steps.contains(where: { $0.id == c["id"].str }) {
          let name = c["name"].str
          let input = c["input"]
          let shell = name == "Bash"
          turn.steps.append(Step(id: c["id"].str, tool: Plain.claudeTool(name), words: Plain.describeClaudeTool(name, input: input, dir: directory), status: .running,
                                 input: shell ? input["command"].str : input.pretty, started: at))
        }
      }
      if !text.isEmpty {
        if id != message {
          let prior = turn.answer.trimmingCharacters(in: .whitespacesAndNewlines)
          if !prior.isEmpty { turn.notes.append(prior) }
          message = id
        }
        turn.answer = text
      }
    case "user":
      for c in e["message"]["content"].array where c["type"].str == "tool_result" {
        guard let i = turn.steps.firstIndex(where: { $0.id == c["tool_use_id"].str }) else { continue }
        let out = c["content"].string ?? c["content"].array.map { $0["text"].str }.joined(separator: "\n")
        turn.steps[i].output = String(out.prefix(8000))
        turn.steps[i].ended = at
        if c["is_error"].bool == true {
          turn.steps[i].status = .failed
          turn.steps[i].error = Plain.stepProblem(["message": .string(out)]).text
        } else {
          turn.steps[i].status = .done
          if turn.steps[i].tool == "shell" { turn.steps[i].result = Plain.describeResult("shell", input: [:], output: out, metadata: [:]) }
        }
      }
    case "result":
      turn.ended = at
      turn.notice = nil
      if e["is_error"].bool == true || (e["subtype"].str != "success" && !e["subtype"].str.isEmpty) {
        turn.status = .failed
        turn.error = Problem(text: "Claude stopped before it finished.", detail: e["subtype"].str)
      } else {
        turn.status = .done
        if turn.answer.isEmpty, let r = e["result"].string { turn.answer = r }
      }
      for i in turn.steps.indices where turn.steps[i].status == .running || turn.steps[i].status == .waiting {
        turn.steps[i].status = .failed
        turn.steps[i].error = turn.steps[i].error ?? "This step did not finish."
      }
    default:
      break
    }
  }
}

/// Claude turns live beside opencode's sessions (opencode does not know them): one small JSON file
/// per session, merged into the conversation by time.
public enum ClaudeTurns {
  public static func file(_ session: String, base: URL) -> URL {
    base.appendingPathComponent("claude").appendingPathComponent("\(session.filter { $0.isLetter || $0.isNumber || $0 == "_" || $0 == "-" }).json")
  }
  public static func load(_ session: String, base: URL) -> [Turn] {
    guard let d = try? Data(contentsOf: file(session, base: base)) else { return [] }
    return (try? JSONDecoder().decode([Turn].self, from: d)) ?? []
  }
  public static func save(_ turns: [Turn], session: String, base: URL) {
    let f = file(session, base: base)
    try? FileManager.default.createDirectory(at: f.deletingLastPathComponent(), withIntermediateDirectories: true)
    if let d = try? JSONEncoder().encode(turns) { try? d.write(to: f, options: .atomic) }
  }
  /// Ola's turns and Claude's, in the order they were asked.
  public static func merge(_ ola: [Turn], _ claude: [Turn]) -> [Turn] {
    let ids = Set(ola.map(\.id))
    return (ola + claude.filter { !ids.contains($0.id) }).sorted { $0.at < $1.at }
  }
  /// The conversation so far, as text, for Claude's context.
  public static func context(_ turns: [Turn]) -> String {
    turns.suffix(12).map { t in
      let who = t.engine == .claude ? "Claude" : t.engine == .hosted ? "The hosted open model" : "Ola"
      let answer = t.answer.count > 4000 ? String(t.answer.prefix(4000)) + "\u{2026}" : t.answer
      let files = (t.changed ?? []).isEmpty ? "" : "\n(\(who) changed: \((t.changed ?? []).joined(separator: ", ")))"
      return "Bart: \(t.request)\n\(who): \(answer.isEmpty ? "(no answer)" : answer)\(files)"
    }.joined(separator: "\n\n")
  }
}

/// One Claude run, as the store sees it (ClaudeRunner on the Mac).
public protocol ClaudeRun: AnyObject {
  var onEvent: @Sendable (JSON) -> Void { get set }
  var onApproval: @Sendable (String, String, JSON) -> Void { get set }
  var onEnd: @Sendable (Int32) -> Void { get set }
  func begin() throws
  func answer(_ requestID: String, allow: Bool, input: JSON)
  func stop()
}
