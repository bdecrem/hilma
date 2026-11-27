import Foundation

// opencode's event stream folded into what a conversation shows: turns, steps in plain words, the
// answer, an approval waiting for Bart. A port of web/src/lib/conversation.ts, plus one thing the
// web page does not need: a request sent from the other app (the phone, the Mac) arrives as
// `session.inbox.enqueued` and starts a turn here too, so both apps show the same conversation live.

public struct Step: Identifiable, Equatable, Sendable, Codable {
  public enum Status: String, Sendable, Codable { case preparing, running, waiting, done, failed }
  public var id: String
  public var tool: String
  public var icon: StepIcon
  public var verb: String
  public var object: String
  public var result: String?
  public var status: Status
  public var error: String?
  public var input: String
  public var output: String
  public var started: Date
  public var ended: Date?

  public init(id: String, tool: String, words: Words, result: String? = nil, status: Status, error: String? = nil, input: String = "", output: String = "", started: Date, ended: Date? = nil) {
    self.id = id
    self.tool = tool
    icon = words.icon
    verb = words.verb
    object = words.object
    self.result = result
    self.status = status
    self.error = error
    self.input = input
    self.output = output
    self.started = started
    self.ended = ended
  }

  mutating func apply(_ w: Words) {
    icon = w.icon
    verb = w.verb
    object = w.object
  }
}

public struct ApprovalItem: Equatable, Sendable, Hashable {
  public var label: String
  public var detail: String?
  public var isCommand: Bool
  public init(label: String, detail: String?, isCommand: Bool) {
    self.label = label
    self.detail = detail
    self.isCommand = isCommand
  }
}

public struct Approval: Identifiable, Equatable, Sendable {
  public var engine: Turn.Engine = .ola
  public var id: String
  public var sessionID: String
  public var action: String
  public var title: String
  public var items: [ApprovalItem]
  public var stepID: String?
  /// One line under the question (a web search: what leaves the machine).
  public var note: String?
  /// A publish or a take-down: the card as cards.mjs describes it (OLA-325); the panel draws its
  /// words and its two buttons (the yes is for this list, once).
  public var card: PublishCard?
  /// A cloud publish whose files the front desk could not look at: why, in its words.
  public var publishProblem: String?
  /// The front desk is looking at those files now (the card shows its `checking` line, no yes yet).
  public var lookingAtFiles = false
  public init(id: String, sessionID: String, action: String, title: String, items: [ApprovalItem], stepID: String?) {
    self.id = id
    self.sessionID = sessionID
    self.action = action
    self.title = title
    self.items = items
    self.stepID = stepID
  }

  init(_ d: JSON, dir: String?, cloudProject: String? = nil) {
    let words = Plain.describeApproval(action: d["action"].str, resources: d["resources"].array.map(\.str), metadata: d["metadata"], dir: dir, cloudProject: cloudProject)
    self.init(id: d["id"].str, sessionID: d["sessionID"].str, action: d["action"].str, title: words.title, items: words.items, stepID: d["source"]["id"].string)
    note = Plain.webNote(action: d["action"].str, resources: d["resources"].array.map(\.str))
    card = Plain.publishCard(action: d["action"].str, resources: d["resources"].array.map(\.str), dir: dir, cloudProject: cloudProject)
  }
}

/// A question Ola asks and waits on (OLA-301): opencode's `question` tool raises a form, with
/// choices and room for the person's own words. Described by the web app's own cards.mjs
/// (`Cards.question`, OLA-325): every sentence on the card comes from there, as on the website.
public struct Question: Identifiable, Equatable, Sendable {
  public struct Option: Equatable, Sendable, Hashable {
    public var value: String
    public var label: String
    public var description: String?
    public init(value: String, label: String, description: String? = nil) {
      self.value = value
      self.label = label
      self.description = description
    }
  }

  public struct Field: Equatable, Sendable, Identifiable {
    public var key: String
    public var title: String
    public var text: String
    public var options: [Option]
    /// Whether the person may answer in their own words (opencode's default).
    public var custom: Bool
    public var multiple: Bool
    /// The own-words field's placeholder on the card.
    public var placeholder: String
    public var id: String { key }
    public init(key: String, title: String, text: String, options: [Option], custom: Bool = true, multiple: Bool = false, placeholder: String? = nil) {
      self.key = key
      self.title = title
      self.text = text
      self.options = options
      self.custom = custom
      self.multiple = multiple
      self.placeholder = placeholder ?? (options.isEmpty ? "Your answer" : "Or say it in your own words")
    }
  }

  public var id: String
  public var sessionID: String
  public var fields: [Field]
  /// The step it belongs to (the `question` tool call), if known.
  public var stepID: String?
  /// The card's words, from cards.mjs: the line over it, the line that says the box answers it,
  /// the Send button (nil when a tap on a choice is the answer), and the line once it is sent.
  public var kicker: String
  public var boxNote: String
  public var sendLabel: String?
  public var sent: String
  /// The description as cards.mjs made it (for `answer(words:)` and `Cards.lines`).
  public var card: JSON

  /// A question made in code (fixtures, tests): its words from cards.mjs, as for a form.
  public init(id: String, sessionID: String, fields: [Field], stepID: String? = nil) {
    let form: JSON = .object(["id": .string(id), "sessionID": .string(sessionID), "fields": .array(fields.map { f in
      .object(["key": .string(f.key), "type": .string(f.multiple ? "multiselect" : "string"), "title": .string(f.title), "description": .string(f.text), "custom": .bool(f.custom),
               "options": .array(f.options.map { o in .object(["value": .string(o.value), "label": .string(o.label), "description": o.description.map { .string($0) } ?? .null]) })])
    })])
    self.init(card: Cards.question(form), id: id, sessionID: sessionID, fields: fields, stepID: stepID)
  }

  init(card: JSON, id: String, sessionID: String, fields: [Field], stepID: String?) {
    self.id = id
    self.sessionID = sessionID
    self.fields = fields
    self.stepID = stepID
    self.card = card
    kicker = card["kicker"].str
    boxNote = card["boxNote"].str
    sendLabel = card["send"].string
    sent = card["sent"].str
  }

  /// One field, one choice: a tap on an option is the whole answer.
  public var single: Bool { card["tapAnswers"].bool ?? (fields.count == 1 && !fields[0].multiple) }

  /// A form from opencode as the question the app shows, or nil when it is not one we can show.
  public init?(form f: JSON) {
    let c = Cards.question(f)
    guard c["kind"].str == "question" else { return nil }
    let fields: [Field] = c["fields"].array.map { x in
      Field(key: x["key"].str, title: x["title"].str, text: x["text"].str,
            options: x["options"].array.map { o in Option(value: o["value"].str, label: o["label"].str, description: o["description"].string.flatMap { $0.isEmpty ? nil : $0 }) },
            custom: x["custom"].bool != false, multiple: x["multiple"].bool == true, placeholder: x["placeholder"].string)
    }
    self.init(card: c, id: c["id"].str, sessionID: c["sessionID"].str, fields: fields, stepID: c["stepID"].string)
  }

  /// The answer opencode takes (`{ answer: { key: value } }`): for each field the typed words
  /// when there are some, else the choices picked (a list for a multiselect, the first otherwise).
  public func answer(picked: [String: [String]], typed: [String: String]) -> [String: JSON] {
    var a: [String: JSON] = [:]
    for f in fields {
      let t = (typed[f.key] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
      let chosen = picked[f.key] ?? []
      if f.multiple { a[f.key] = .array((chosen + (t.isEmpty ? [] : [t])).map { .string($0) }) }
      else { a[f.key] = .string(t.isEmpty ? (chosen.first ?? "") : t) }
    }
    return a
  }

  /// Every field has something.
  public static func complete(_ a: [String: JSON]) -> Bool {
    a.values.allSatisfy { v in
      if case .array(let l) = v { return !l.isEmpty }
      return !v.str.isEmpty
    }
  }

  /// Words typed in the conversation's box as the answer to the whole card, however many
  /// questions it has (OLA-320; the website's rule since OLA-311, from cards.mjs): every question
  /// gets them. Nil when there are no words.
  public func answer(words: String) -> [String: JSON]? { Cards.answer(card, words: words) }
}

public struct Turn: Identifiable, Equatable, Sendable, Codable {
  public enum Status: String, Sendable, Codable { case sending, working, done, failed, stopped }
  /// Who did the work: Ola (opencode on open models), Claude (Claude Code, Fallback to Claude) or
  /// the hosted open model (the same opencode with the model `hosted`, Fallback to a hosted open model).
  public enum Engine: String, Sendable, Codable { case ola, claude, hosted }
  public var id: String
  public var request: String
  public var at: Date
  public var status: Status
  public var steps: [Step]
  public var answer: String
  /// Earlier texts in the same turn ("Let me check the file first."), shown among the steps.
  public var notes: [String]
  public var error: Problem?
  /// Set while opencode is retrying the model.
  public var notice: String?
  public var ended: Date?
  public var engine: Engine = .ola
  /// The model at the hosted provider, when `engine` is `.hosted`: `hosted`, or a picked choice
  /// (`deepseek-v4-pro`, OLA-337), from the model each step names.
  public var model: String?
  /// The files this turn created, changed or deleted, from the project's record (MadeBy), so a
  /// change made by a shell command, or by a turn the app quit during, is shown and told too.
  public var changed: [String]?
  /// OLA-479: Ola's own one nudge to its model (a test before handing over), not the person's words.
  public var nudge: Bool?
  /// OLA-479: replies of this turn the model's length limit cut off.
  public var cutOff: Int?

  public init(id: String, request: String, at: Date, status: Status, steps: [Step] = [], answer: String = "", notes: [String] = [], error: Problem? = nil, notice: String? = nil, ended: Date? = nil, engine: Engine = .ola) {
    self.engine = engine
    self.id = id
    self.request = request
    self.at = at
    self.status = status
    self.steps = steps
    self.answer = answer
    self.notes = notes
    self.error = error
    self.notice = notice
    self.ended = ended
  }

  public var isRunning: Bool { status == .sending || status == .working }

  /// Everything that changes how tall a turn is drawn once it is on screen: its run ending (then
  /// "Try again with", the files it made, the line saying who made them appear), its answer, steps,
  /// notes, error. The conversation scrolls to its end whenever the last turn's changes (OLA-337:
  /// "Try again with" under the latest answer stayed hidden behind the box).
  public var heightKey: String {
    "\(id)|\(status.rawValue)|\(answer.count)|\(steps.count)|\(steps.filter { $0.status == .running }.count)|\(notes.count)|\(changed?.count ?? -1)|\(error == nil ? 0 : 1)|\(notice == nil ? 0 : 1)|\(engine.rawValue)|\(model ?? "")"
  }

  /// How many files the run wrote or changed.
  public var changedFiles: Int { Set(steps.filter { ($0.icon == .write || $0.icon == .change) && $0.status == .done }.map(\.object)).count }

  /// "Worked for 1 min 48 s · 6 steps · changed 3 files"
  public func summary(now: Date = .now) -> String {
    let secs = max(0, Int(((ended ?? now).timeIntervalSince(at)).rounded()))
    let time = secs < 60 ? "\(secs) s" : secs < 3600 ? "\(secs / 60) min \(secs % 60) s" : "\(secs / 3600) h \((secs % 3600) / 60) min"
    let changed = changedFiles
    var parts = ["\(isRunning ? "Working" : "Worked") for \(time)", "\(steps.count) \(steps.count == 1 ? "step" : "steps")"]
    if changed > 0 { parts.append("changed \(changed) \(changed == 1 ? "file" : "files")") }
    let failed = steps.filter { $0.status == .failed }.count
    if failed > 0 { parts.append("\(failed) did not work") }
    return parts.joined(separator: " \u{00B7} ")
  }
}

public struct Conversation: Equatable, Sendable {
  public var sessionID: String
  /// The project folder, used to shorten paths.
  public var directory: String?
  /// The cloud project the conversation is in (nil on the Mac's own runtime): names the address on a publish card.
  public var cloudProject: String?
  public var turns: [Turn] = []
  public var approval: Approval?
  /// A question Ola asked and waits on (OLA-301).
  public var question: Question?
  /// The assistant message whose text is the current answer.
  var answerMessage: String?

  public init(sessionID: String, directory: String? = nil, turns: [Turn] = [], approval: Approval? = nil) {
    self.sessionID = sessionID
    self.directory = directory
    self.turns = turns
    self.approval = approval
  }

  public var isRunning: Bool { turns.last?.isRunning ?? false }

  /// A request sent from this app: shown at once, before the server confirms it.
  public mutating func startTurn(_ request: String, at: Date = .now) {
    let n = Escalate.nudgeOf(request)
    var t = Turn(id: "local-\(at.timeIntervalSince1970)", request: n.request, at: at, status: .sending)
    if n.nudge { t.nudge = true }
    turns.append(t)
    answerMessage = nil
  }

  public mutating func failLastSend(_ problem: Problem) {
    guard var t = turns.last, t.status == .sending else { return }
    t.status = .failed
    t.ended = .now
    t.error = problem
    turns[turns.count - 1] = t
  }

  private func outputText(_ content: JSON) -> String {
    content.array.map { c in
      c["type"].str == "text" ? c["text"].str : c["type"].str == "file" ? "[file \(c["name"].string ?? c["uri"].str)]" : ""
    }.joined(separator: "\n")
  }

  /// OLA-488: a test run whose own last line says it failed ("0 passed, 0 failed, 1 error") is a failed step.
  func markFailedTest(_ step: inout Step) {
    guard step.status == .done, Escalate.testOutcome(step) == .failed else { return }
    step.status = .failed
    step.result = nil
    step.error = "The test did not pass. What it printed is under Show details."
  }

  private func finish(_ step: inout Step, ok: Bool, at: Date, output: String, metadata: JSON, problem: Problem?) {
    step.output = output
    step.ended = at
    let exit = ok ? Plain.shellFailed(metadata) : nil
    if ok && exit == nil {
      step.status = .done
      step.result = Plain.describeResult(step.tool, input: JSON.parse(step.input) ?? .object([:]), output: output, metadata: metadata)
      markFailedTest(&step)
    } else {
      step.status = .failed
      step.error = exit.map { "The program stopped with an error (exit code \($0))." } ?? problem?.text ?? "This step did not work."
    }
  }

  private static func settle(_ turn: inout Turn, at: Date) {
    for i in turn.steps.indices where turn.steps[i].status != .done && turn.steps[i].status != .failed {
      turn.steps[i].status = .failed
      turn.steps[i].error = turn.steps[i].error ?? "This step did not finish."
      turn.steps[i].ended = at
    }
  }

  /// Folds one event in. Events for other sessions are ignored. Returns true if anything changed.
  @discardableResult
  public mutating func apply(_ ev: JSON) -> Bool {
    let type = ev["type"].str
    let d = ev["data"]
    let at = ev["created"].date ?? .now
    // A form (Ola's question to the person) carries its session inside it.
    guard (d["sessionID"].string ?? d["form"]["sessionID"].str) == sessionID else { return false }
    if type == "session.created" {
      directory = d["location"]["directory"].string ?? directory
      return true
    }
    if type == "session.inbox.enqueued", d["item"]["type"].str == "user" {
      let n = Escalate.nudgeOf(EngineNote.strip(d["item"]["payload"]["text"].str))
      let text = n.request
      if let i = turns.lastIndex(where: { $0.status == .sending && $0.request == text }) {
        turns[i].id = d["inboxID"].str
      } else if !turns.contains(where: { $0.id == d["inboxID"].str }) {
        // Sent from the other app.
        var t = Turn(id: d["inboxID"].str, request: text, at: at, status: .sending)
        if n.nudge { t.nudge = true }
        turns.append(t)
        answerMessage = nil
      }
      return true
    }
    guard !turns.isEmpty else { return false }
    let ti = turns.count - 1
    var turn = turns[ti]
    defer { turns[ti] = turn }
    func step(_ id: String) -> Int? { turn.steps.firstIndex { $0.id == id } }

    switch type {
    case "session.inbox.delivered", "session.execution.started":
      if turn.status == .sending { turn.status = .working }
      if type == "session.inbox.delivered", turn.id.hasPrefix("local-"), let inbox = d["inboxID"].string { turn.id = inbox }
      return true
    case "session.tool.input.started":
      if step(d["id"].str) != nil { return false }
      turn.steps.append(Step(id: d["id"].str, tool: d["name"].str, words: Plain.describeTool(d["name"].str, input: .object([:]), dir: directory), status: .preparing, started: at))
      if turn.status == .sending { turn.status = .working }
      return true
    case "session.tool.called":
      guard let i = step(d["id"].str) else { return false }
      let input = d["input"]
      turn.steps[i].apply(Plain.describeTool(turn.steps[i].tool, input: input, dir: directory))
      let shell = turn.steps[i].tool == "shell" || turn.steps[i].tool == "bash"
      turn.steps[i].input = shell ? (input["command"].string ?? input.pretty) : input.pretty
      if turn.steps[i].status == .preparing { turn.steps[i].status = .running }
      return true
    case "session.tool.success":
      guard let i = step(d["id"].str) else { return false }
      var s = turn.steps[i]
      // Shell steps keep the command as their input; describeResult wants the arguments.
      let rawInput = s.input
      if s.tool == "shell" || s.tool == "bash" { s.input = JSON.object(["command": .string(rawInput)]).pretty }
      finish(&s, ok: true, at: at, output: outputText(d["content"]), metadata: d["metadata"], problem: nil)
      if s.tool == "shell" || s.tool == "bash" { s.input = rawInput }
      turn.steps[i] = s
      // Its step ran, so its question was answered (OLA-250): no card for it is left behind.
      if approval?.stepID == s.id { approval = nil }
      return true
    case "session.tool.failed":
      guard let i = step(d["id"].str) else { return false }
      let problem = Plain.stepProblem(d["error"])
      finish(&turn.steps[i], ok: false, at: at, output: [outputText(d["content"]), d["error"]["message"].str].filter { !$0.isEmpty }.joined(separator: "\n"), metadata: d["metadata"], problem: problem)
      if approval?.stepID == turn.steps[i].id { approval = nil }
      return true
    case "permission.asked":
      let a = Approval(d, dir: directory, cloudProject: cloudProject)
      // OLA-250, Nov 22: a yes the app had already given came back as a card after its step had
      // run ("Run publish.py", the step then shown as "did not finish", the card unanswerable). A
      // question for a step that has ended is over: never a card, never a step put back to waiting.
      if let sid = a.stepID, let i = step(sid), turn.steps[i].status == .done || turn.steps[i].status == .failed { return false }
      approval = a
      if let sid = a.stepID, let i = step(sid) { turn.steps[i].status = .waiting }
      return true
    case "permission.replied":
      if approval?.id == d["requestID"].str { approval = nil }
      if let i = turn.steps.firstIndex(where: { $0.status == .waiting }) {
        if d["reply"].str == "reject" {
          turn.steps[i].status = .failed
          turn.steps[i].error = "You said no, so Ola did not do this."
          turn.steps[i].ended = at
        } else {
          turn.steps[i].status = .running
        }
      }
      return true
    case "form.created":
      guard let q = Question(form: d["form"]) else { return false }
      question = q
      if let sid = q.stepID, let i = step(sid) { turn.steps[i].status = .waiting }
      return true
    case "form.replied", "form.cancelled":
      guard let q = question, q.id == d["id"].str else { return false }
      question = nil
      let i = q.stepID.flatMap { step($0) } ?? turn.steps.firstIndex { $0.status == .waiting }
      if let i, turn.steps[i].status == .waiting { turn.steps[i].status = .running }
      return true
    case "session.text.delta":
      if answerMessage != d["assistantMessageID"].string {
        let prior = turn.answer.trimmingCharacters(in: .whitespacesAndNewlines)
        if !prior.isEmpty { turn.notes.append(prior) }
        turn.answer = ""
        answerMessage = d["assistantMessageID"].string
      }
      turn.answer += d["delta"].str
      if turn.status == .sending { turn.status = .working }
      return true
    case "session.text.ended":
      if answerMessage != d["assistantMessageID"].string {
        let prior = turn.answer.trimmingCharacters(in: .whitespacesAndNewlines)
        if !prior.isEmpty { turn.notes.append(prior) }
        answerMessage = d["assistantMessageID"].string
      }
      turn.answer = d["text"].string ?? turn.answer
      return true
    case "session.retry.scheduled":
      let secs = max(0, Int(((d["at"].date ?? at).timeIntervalSince(at)).rounded()))
      turn.notice = "The model did not answer. Trying again\(secs > 0 ? " in \(secs) s" : "") (attempt \(d["attempt"].int ?? 2))."
      return true
    case "session.step.started":
      turn.notice = nil
      // Each step names its model: a step by the hosted open model marks the reply as outside Ola.
      if HostedPick.isHosted(d["model"]["id"].string) { turn.engine = .hosted; turn.model = d["model"]["id"].str }
      return true
    case "session.step.failed":
      turn.error = Plain.runProblem(d["error"])
      return true
    case "session.step.ended":
      // OLA-479: a reply the model's length limit cut off, counted by Ola (not the model).
      guard d["finish"].str == "length" else { return false }
      turn.cutOff = (turn.cutOff ?? 0) + 1
      return true
    case "session.execution.succeeded":
      // The run ended: whatever it asked is no longer waiting (OLA-250), whether or not this turn
      // was still shown as running. (A Claude run's card is its own runner's, not opencode's.)
      if approval?.engine != .claude { approval = nil }
      question = nil
      if !turn.isRunning { return true }
      turn.status = .done
      turn.ended = at
      turn.notice = nil
      Self.settle(&turn, at: at)
      return true
    case "session.execution.failed":
      turn.status = .failed
      turn.error = Plain.runProblem(d["error"])
      turn.ended = at
      turn.notice = nil
      approval = nil
      question = nil
      Self.settle(&turn, at: at)
      return true
    case "session.execution.interrupted":
      turn.status = .stopped
      turn.ended = at
      turn.notice = nil
      approval = nil
      question = nil
      if let reason = d["reason"].string, reason != "user" {
        turn.error = Problem(text: reason == "shutdown" ? "The server restarted, so this stopped." : "This stopped before it finished.", detail: "interrupted: \(reason)")
      }
      Self.settle(&turn, at: at)
      return true
    default:
      return false
    }
  }

  /// The turns rebuilt from opencode's stored history (`GET /api/session/:id/message`, newest
  /// first). Used when a session opens and after a lost connection comes back, so what Bart sees
  /// is what the server has, not what this app happened to hear.
  public static func turns(fromMessages messages: [JSON], directory: String?) -> [Turn] {
    let ordered = messages.sorted { ($0["time"]["created"].double ?? 0) < ($1["time"]["created"].double ?? 0) }
    var turns: [Turn] = []
    let scratch = Conversation(sessionID: "")
    for m in ordered {
      let type = m["type"].str
      if type == "user" {
        let n = Escalate.nudgeOf(EngineNote.strip(m["text"].str))
        var t = Turn(id: m["id"].str, request: n.request, at: m["time"]["created"].date ?? .distantPast, status: .working)
        if n.nudge { t.nudge = true }
        turns.append(t)
        continue
      }
      guard !turns.isEmpty else { continue }
      var turn = turns.removeLast()
      if type == "assistant" {
        if HostedPick.isHosted(m["model"]["id"].string) { turn.engine = .hosted; turn.model = m["model"]["id"].str }
        var text = ""
        for part in m["content"].array {
          if part["type"].str == "text" { text += part["text"].str }
          if part["type"].str == "tool" {
            let input = part["state"]["input"]
            let name = part["name"].str
            let started = part["time"]["created"].date ?? m["time"]["created"].date ?? .distantPast
            var step = Step(id: part["id"].str, tool: name, words: Plain.describeTool(name, input: input, dir: directory), status: .running,
                            input: name == "shell" || name == "bash" ? input["command"].str : input.pretty, started: started, ended: part["time"]["completed"].date)
            let st = part["state"]["status"].str
            if st == "completed" {
              let raw = step.input
              if name == "shell" || name == "bash" { step.input = input.pretty }
              scratch.finish(&step, ok: true, at: step.ended ?? started, output: scratch.outputText(part["state"]["content"]), metadata: part["state"]["metadata"], problem: nil)
              step.input = raw
              scratch.markFailedTest(&step)
            } else if st == "error" {
              scratch.finish(&step, ok: false, at: step.ended ?? started, output: part["state"]["error"]["message"].str, metadata: part["state"]["metadata"], problem: Plain.stepProblem(part["state"]["error"]))
            }
            turn.steps.append(step)
          }
        }
        if !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
          let prior = turn.answer.trimmingCharacters(in: .whitespacesAndNewlines)
          if !prior.isEmpty { turn.notes.append(prior) }
          turn.answer = text
        }
        if !m["error"].isNull { turn.error = Plain.runProblem(m["error"]) }
        // OLA-479: a reply the model's length limit cut off, counted by Ola.
        if m["finish"].str == "length" { turn.cutOff = (turn.cutOff ?? 0) + 1 }
      }
      if type == "idle" {
        let outcome = m["outcome"].str
        turn.status = outcome == "succeeded" ? .done : outcome == "interrupted" ? .stopped : .failed
        turn.ended = m["time"]["created"].date
        if turn.status == .failed && turn.error == nil { turn.error = Problem(text: "It stopped before it finished.", detail: "outcome: \(outcome)") }
        settle(&turn, at: turn.ended ?? .now)
      }
      turns.append(turn)
    }
    return turns
  }
}
