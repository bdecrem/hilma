import Foundation
import Observation

/// Everything both apps show, live: the connection, the sessions, the open conversations, the
/// project's files. One event stream feeds it; every change Bart makes goes to the server, and
/// what comes back on the stream is what the screen shows, so the Mac and the phone agree.
@MainActor
@Observable
public final class OlaStore {
  public enum Connection: Equatable, Sendable {
    /// No address and password yet.
    case notSetUp
    case connecting
    case open
    /// The machine stopped answering; retrying.
    case lost(since: Date, why: String)
    /// The password was refused.
    case refused
  }

  public private(set) var connection: Connection
  public private(set) var config: ServerConfig?
  public private(set) var sessions: [SessionInfo] = []
  /// Sessions whose agent is working right now.
  public private(set) var running: Set<String> = []
  /// Sessions that finished while Bart was looking elsewhere.
  public private(set) var unseen: Set<String> = []
  public private(set) var conversations: [String: Conversation] = [:]
  public private(set) var models: [ModelInfo] = []
  public var model: ModelInfo?
  public private(set) var files: [String: [FileEntry]] = [:]
  public var problem: Problem?
  /// The session on screen; nil is a new, empty one (made on the first request, like Claude's apps).
  public var selectedID: String? {
    didSet {
      guard selectedID != oldValue, let id = selectedID else { return }
      unseen.remove(id)
      if conversations[id] == nil, client != nil { Task { await self.open(id) } }
    }
  }
  /// The app is in front (notifications only when it is not).
  public var isActive = true {
    didSet { if isActive && !oldValue { Task { await self.catchUp() } } }
  }
  /// How often a session shown as working is compared with the server (a missed event can never
  /// leave it stuck on "Working"). Tests shorten it.
  public var watchInterval: TimeInterval = 12
  private var watchdog: Task<Void, Never>?
  public var onRunEnded: ((_ session: SessionInfo, _ turn: Turn) -> Void)?
  public var onApproval: ((_ session: SessionInfo, _ approval: Approval) -> Void)?
  /// Every finish and every wait for Bart, wherever he is looking (the Mac app sends them to the phone).
  public var onNotify: ((NotifyEvent) -> Void)?

  private var client: OpenCodeClient?
  private var stream: Task<Void, Never>?
  private let live: Bool

  public init(config: ServerConfig?) {
    self.config = config
    live = true
    connection = config == nil ? .notSetUp : .connecting
    if let config { client = OpenCodeClient(config) }
  }

  /// A still picture for screenshots and previews: no network at all.
  public init(fixture: Fixture) {
    live = false
    config = ServerConfig(url: URL(string: ServerConfig.defaultAddress)!, password: "")
    connection = fixture.connection
    sessions = fixture.sessions
    running = fixture.running
    unseen = fixture.unseen
    conversations = fixture.conversations
    models = fixture.models
    model = fixture.models.first
    files = fixture.files
    selectedID = fixture.selected
    claudeOn = fixture.claudeOn
    fixtureFiles = fixture.fileData
  }

  /// A fixture store only: replaces a conversation, for frame-by-frame renders of a made-up run.
  public func previewSet(_ id: String, _ conversation: Conversation, running: Bool) {
    guard !live else { return }
    conversations[id] = conversation
    if running { self.running.insert(id) } else { self.running.remove(id) }
  }

  public var selected: SessionInfo? { sessions.first { $0.id == selectedID } }
  public var conversation: Conversation? { selectedID.flatMap { conversations[$0] } }
  public func needsYou(_ id: String) -> Bool { conversations[id]?.approval != nil }
  public var gatewayModels: [ModelInfo] { models.filter { $0.providerID == "ola" } }

  // MARK: connecting

  /// Tries the address and password; on success keeps them in the Keychain and starts.
  public func connect(_ config: ServerConfig) async throws {
    let c = OpenCodeClient(config)
    _ = try await c.info()
    try Credentials.save(config)
    stream?.cancel()
    self.config = config
    client = c
    conversations = [:]
    connection = .connecting
    start()
  }

  /// Uses a server without keeping it in the Keychain: the local one of "On this Mac", whose
  /// password is new at every start. `nil` goes back to the saved machine.
  public func attach(_ config: ServerConfig?) {
    stream?.cancel()
    stream = nil
    let target = config ?? Credentials.load()
    self.config = target
    client = target.map(OpenCodeClient.init)
    sessions = []
    conversations = [:]
    files = [:]
    models = []
    running = []
    selectedID = nil
    connection = target == nil ? .notSetUp : .connecting
    start()
  }

  public func forget() {
    stream?.cancel()
    Credentials.forget()
    client = nil
    config = nil
    sessions = []
    conversations = [:]
    connection = .notSetUp
  }

  public func start() {
    guard live, let client, stream == nil || stream!.isCancelled else { return }
    stream = Task { [weak self] in await self?.listen(client) }
    if watchdog == nil {
      watchdog = Task { [weak self] in
        while !Task.isCancelled {
          let wait = self?.watchInterval ?? 12
          try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
          await self?.watch()
        }
      }
    }
  }

  /// Retry now (after the Mac wakes, or when Bart presses Try Again).
  public func reconnect() {
    stream?.cancel()
    stream = nil
    connection = config == nil ? .notSetUp : .connecting
    start()
  }

  private func listen(_ client: OpenCodeClient) async {
    var backoff: UInt64 = 1
    var first = true
    // A listener for a server the store has moved away from must not touch its state (2026-11-16:
    // after several switches an old listener set "connecting" over the new one's "open", for good).
    func current() -> Bool { !Task.isCancelled && self.client === client }
    while current() {
      do {
        if case .lost = connection {} else { connection = .connecting }
        for try await ev in client.events() {
          guard current() else { return }
          if ev["type"].str == "server.connected" {
            connection = .open
            backoff = 1
            await refresh(resync: !first)
            first = false
            continue
          }
          handle(ev)
        }
        throw OlaError.unreachable("the event stream ended")
      } catch OlaError.unauthorized {
        if current() { connection = .refused }
        return
      } catch {
        if !current() { return }
        if case .lost = connection {} else { connection = .lost(since: .now, why: (error as? OlaError)?.detail ?? error.localizedDescription) }
        try? await Task.sleep(nanoseconds: backoff * 1_000_000_000)
        backoff = min(backoff * 2, 10)
      }
    }
  }

  /// Re-reads every open session from the server and reconciles: what the server says is
  /// finished is shown finished, with its steps and results (foreground, reconnect, stream error).
  public func catchUp() async {
    guard client != nil else { return }
    for id in conversations.keys where !claudeRunning(id) { await open(id) }
    if let a = try? await client?.active() { running = a.union(Set(claudeRuns.keys)) }
  }

  /// The light check: a session shown as working is compared with the server's own state.
  func watch() async {
    guard let client else { return }
    let shownWorking = conversations.filter { $0.value.isRunning && !claudeRunning($0.key) }.map(\.key)
    guard !shownWorking.isEmpty else { return }
    guard let active = try? await client.active() else { return }
    for id in shownWorking where !active.contains(id) { await open(id) }
    // Still running on the server: refresh its steps now and then, in case events were missed.
    watchTick += 1
    if watchTick % 3 == 0 { for id in shownWorking where active.contains(id) { await open(id) } }
  }
  private var watchTick = 0

  /// Sessions, what is running, the models, and (after an outage) the open conversation again.
  public func refresh(resync: Bool = false) async {
    guard let client else { return }
    do {
      sessions = try await client.sessions()
      running = (try? await client.active()) ?? running
      if models.isEmpty {
        models = (try? await client.models()) ?? []
        model = (try? await client.defaultModel()) ?? gatewayModels.first
      }
      let known = Set(sessions.map(\.id))
      conversations = conversations.filter { known.contains($0.key) }
      if let id = selectedID, !known.contains(id) { selectedID = nil }
      if resync { for id in conversations.keys { await open(id) } }
      else if let id = selectedID, conversations[id] == nil { await open(id) }
    } catch {
      note(error, "The list of sessions could not be loaded.")
    }
  }

  private func note(_ error: Error, _ text: String) {
    if (error as? OlaError) == .unauthorized { connection = .refused; return }
    problem = Problem(text: text, detail: (error as? OlaError)?.detail ?? error.localizedDescription)
  }

  // MARK: the stream

  private func handle(_ ev: JSON) {
    let type = ev["type"].str
    let d = ev["data"]
    let sid = d["sessionID"].str
    let at = ev["created"].date ?? .now
    switch type {
    case "session.created":
      if !sessions.contains(where: { $0.id == sid }) {
        sessions.insert(SessionInfo(id: sid, title: d["title"].string.flatMap { $0.isEmpty ? nil : $0 } ?? "New session", created: at, updated: at, directory: d["location"]["directory"].string), at: 0)
      }
    case "session.renamed":
      if let i = sessions.firstIndex(where: { $0.id == sid }) { sessions[i].title = d["title"].str }
    case "session.deleted":
      sessions.removeAll { $0.id == sid }
      conversations[sid] = nil
      running.remove(sid)
      unseen.remove(sid)
      if selectedID == sid { selectedID = nil }
    case "session.execution.started", "session.inbox.enqueued":
      running.insert(sid)
      bump(sid, at)
    case "session.execution.succeeded", "session.execution.failed", "session.execution.interrupted":
      running.remove(sid)
      bump(sid, at)
      if sid != selectedID || !isActive { unseen.insert(sid) }
    default: break
    }
    if conversations[sid] != nil {
      conversations[sid]!.apply(ev)
      if let s = sessions.first(where: { $0.id == sid }) {
        if type.hasPrefix("session.execution."), type != "session.execution.started", let t = conversations[sid]!.turns.last, let e = NotifyEvent.finished(t, session: s) { onNotify?(e) }
        if type == "permission.asked", let a = conversations[sid]!.approval { onNotify?(NotifyEvent.needsYou(a, session: s)) }
      }
      if type.hasPrefix("session.execution."), type != "session.execution.started", let s = sessions.first(where: { $0.id == sid }), let t = conversations[sid]!.turns.last {
        if !isActive || sid != selectedID { onRunEnded?(s, t) }
      }
      if type == "permission.asked", let s = sessions.first(where: { $0.id == sid }), let a = conversations[sid]!.approval {
        if !isActive || sid != selectedID { onApproval?(s, a) }
      }
    } else if type == "permission.asked" || type.hasPrefix("session.execution.") || type == "session.inbox.enqueued" {
      // A session not loaded yet: load it, so its approval and state are there when Bart looks.
      if sessions.contains(where: { $0.id == sid }) {
        Task {
          await open(sid)
          if type == "permission.asked", let s = sessions.first(where: { $0.id == sid }), let a = conversations[sid]?.approval {
            onApproval?(s, a)
            onNotify?(NotifyEvent.needsYou(a, session: s))
          }
          if type.hasPrefix("session.execution."), type != "session.execution.started", let s = sessions.first(where: { $0.id == sid }), let t = conversations[sid]?.turns.last, let e = NotifyEvent.finished(t, session: s) { onNotify?(e) }
        }
      }
    }
  }

  private func bump(_ id: String, _ at: Date) {
    guard let i = sessions.firstIndex(where: { $0.id == id }) else { return }
    sessions[i].updated = max(sessions[i].updated, at)
    sessions.sort { $0.updated > $1.updated }
  }

  // MARK: sessions

  /// Loads a session's history and any approval waiting in it.
  public func open(_ id: String) async {
    guard let client else { return }
    do {
      let info = sessions.first { $0.id == id }
      var directory = info?.directory
      if directory == nil { directory = (try? await client.session(id))?.directory }
      var c = Conversation(sessionID: id, directory: directory, turns: Conversation.turns(fromMessages: try await client.messages(id), directory: directory))
      if let p = try await client.pendingPermissions(id).first {
        let words = Plain.describeApproval(action: p["action"].str, resources: p["resources"].array.map(\.str), metadata: p["metadata"], dir: directory)
        c.approval = Approval(id: p["id"].str, sessionID: id, action: p["action"].str, title: words.title, items: words.items, stepID: p["source"]["id"].string)
      }
      if running.contains(id), var last = c.turns.last, !last.isRunning, last.status == .failed, last.error?.detail?.hasPrefix("outcome") == true {
        last.status = .working
        c.turns[c.turns.count - 1] = last
      }
      c.turns = ClaudeTurns.merge(c.turns, await storedClaudeTurns(id))
      if let live = conversations[id]?.turns.filter({ $0.engine == .claude && $0.isRunning }) { c.turns = ClaudeTurns.merge(c.turns, live) }
      conversations[id] = c
    } catch {
      note(error, "That session could not be opened.")
    }
  }

  /// Starts a fresh conversation; the session is made with the first request.
  public func newSession() { selectedID = nil }

  /// What Bart typed: a slash command, or a request for the engine chosen beside the composer.
  public func send(_ text: String) async {
    let typed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    switch SlashCommand.parse(typed) {
    case .unknown:
      problem = Problem(text: "No such command. Type / to see the commands.")
    case .command(let c, let rest):
      switch c {
      case .claude: await askClaude(rest.isEmpty ? (conversation?.turns.last?.request ?? "") : rest)
      case .ola: await sendToOla(rest)
      case .hosted: problem = Problem(text: "Not set up in this app yet.")
      case .new: newSession()
      case .stop: await stop()
      case .files: onFiles?()
      case .help: problem = Problem(text: SlashCommand.allCases.map { "/\($0.rawValue): \($0.summary)" }.joined(separator: "\n"))
      }
    case .none:
      if claudeOn, nextEngine == .claude { await askClaude(typed) } else { await sendToOla(typed) }
    }
  }

  public func sendToOla(_ text: String) async {
    let request = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !request.isEmpty, let client else { return }
    problem = nil
    var id = selectedID
    if id == nil {
      do {
        let title = request.count > 60 ? String(request.prefix(57)) + "\u{2026}" : request
        let s = try await client.createSession(title: title.replacingOccurrences(of: "\n", with: " "))
        if !sessions.contains(where: { $0.id == s.id }) { sessions.insert(s, at: 0) }
        conversations[s.id] = Conversation(sessionID: s.id, directory: s.directory)
        selectedID = s.id
        id = s.id
        if let model, model != (try? await client.defaultModel()) { try? await client.switchModel(s.id, to: model) }
      } catch {
        note(error, "The session could not be started. Nothing was sent.")
        return
      }
    }
    guard let id else { return }
    if conversations[id] == nil { conversations[id] = Conversation(sessionID: id) }
    conversations[id]!.startTurn(request)
    running.insert(id)
    do {
      try await client.prompt(id, text: request)
    } catch {
      running.remove(id)
      conversations[id]?.failLastSend(Problem(text: "Your request did not reach the machine. Nothing was done; send it again when it answers.", detail: (error as? OlaError)?.detail))
    }
  }

  public func stop() async {
    if let id = selectedID, let run = claudeRuns[id] { run.stop(); return }
    guard let id = selectedID, let client else { return }
    do { try await client.interrupt(id) } catch { note(error, "The machine did not answer the Stop. It may still be working.") }
  }

  public func answer(_ decision: OpenCodeClient.Decision, in sessionID: String? = nil) async {
    guard let id = sessionID ?? selectedID, let a = conversations[id]?.approval else { return }
    if a.engine == .claude {
      conversations[id]?.approval = nil
      if decision == .always { claudeAlways[id, default: []].insert(Plain.claudeTool(a.action)) }
      claudeRuns[id]?.answer(a.id, allow: decision != .reject, input: claudeInputs[a.id] ?? [:])
      claudeInputs[a.id] = nil
      return
    }
    guard let client else { return }
    do {
      try await client.reply(session: id, request: a.id, decision: decision)
    } catch {
      note(error, "Your answer did not reach the machine. Try again.")
    }
  }

  public func rename(_ id: String, to title: String) async {
    let t = title.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !t.isEmpty, let client else { return }
    if let i = sessions.firstIndex(where: { $0.id == id }) { sessions[i].title = t }
    do { try await client.rename(id, to: t) } catch { note(error, "The new name did not reach the machine.") }
  }

  public func delete(_ id: String) async {
    guard let client else { return }
    do {
      try await client.deleteSession(id)
      sessions.removeAll { $0.id == id }
      conversations[id] = nil
      if selectedID == id { selectedID = nil }
    } catch {
      note(error, "The session could not be deleted.")
    }
  }

  public func choose(_ m: ModelInfo) async {
    model = m
    guard let id = selectedID, let client else { return }
    do { try await client.switchModel(id, to: m) } catch { note(error, "The model could not be changed for this session.") }
  }

  // MARK: files

  public func loadFiles(_ path: String = "") async {
    guard let client else { return }
    do { files[path] = try await client.files(in: path.isEmpty ? nil : path) } catch { note(error, "The project's files could not be listed.") }
  }

  private var fixtureFiles: [String: Data] = [:]

  public func read(_ path: String) async throws -> Data {
    if let d = fixtureFiles[path] { return d }
    guard let client else { throw OlaError.unreachable("not connected") }
    return try await client.read(path)
  }

  /// The project folder as Bart says it: "~/ola-bart".
  // MARK: Fallback to Claude

  /// The switch in Settings (off by default). `/claude` works without it.
  public var claudeOn = false
  /// The choice beside the composer for the next message, when the switch is on.
  public var nextEngine: Turn.Engine = .ola
  /// Starts Claude Code for a session (the Mac app sets it; nil where Claude cannot run here).
  public var claudeLauncher: ((_ session: SessionInfo, _ request: String, _ context: String) throws -> ClaudeRun)?
  /// Why Claude cannot run here, in one sentence.
  public var claudeUnavailable: String? = "Claude runs from Ola on your Mac."
  /// Where Claude turns are kept (Application Support on the Mac); nil on the phone.
  public var claudeTurnsBase: URL?
  public var onFiles: (() -> Void)?
  /// View on a result under a reply (each app opens it its own way).
  public var onView: ((ResultItem) -> Void)?
  private var claudeRuns: [String: ClaudeRun] = [:]
  private var claudeAlways: [String: Set<String>] = [:]
  private var claudeInputs: [String: JSON] = [:]

  public func claudeRunning(_ session: String) -> Bool { claudeRuns[session] != nil }

  /// The phone tells the Mac app something (its push token, what is on screen). Only when paired.
  public func postToMac(_ path: String, _ body: JSON) async {
    guard config?.viaMac == true, let client else { return }
    try? await client.post(path, body)
  }

  /// Claude turns stored for a session: the Mac's own file, or the Mac's through the relay.
  func storedClaudeTurns(_ id: String) async -> [Turn] {
    if let base = claudeTurnsBase { return ClaudeTurns.load(id, base: base) }
    if config?.viaMac == true, let client, let data = try? await client.raw("/ola/claude/\(id)") {
      return (try? JSONDecoder().decode([Turn].self, from: data)) ?? []
    }
    return []
  }

  /// Hands one request to Claude Code ("Ask Claude instead", the Claude choice, `/claude`).
  public func askClaude(_ text: String) async {
    let request = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !request.isEmpty else { problem = Problem(text: "There is no request to hand to Claude yet."); return }
    guard let launcher = claudeLauncher, let client else { problem = Problem(text: claudeUnavailable ?? "Claude is not available here."); return }
    problem = nil
    var id = selectedID
    if id == nil {
      do {
        let title = request.count > 60 ? String(request.prefix(57)) + "\u{2026}" : request
        let s = try await client.createSession(title: title.replacingOccurrences(of: "\n", with: " "))
        if !sessions.contains(where: { $0.id == s.id }) { sessions.insert(s, at: 0) }
        conversations[s.id] = Conversation(sessionID: s.id, directory: s.directory)
        selectedID = s.id
        id = s.id
      } catch {
        note(error, "The session could not be started. Nothing was sent.")
        return
      }
    }
    guard let id, let session = sessions.first(where: { $0.id == id }) else { return }
    guard claudeRuns[id] == nil else { problem = Problem(text: "Claude is already working in this session. Wait for it, or stop it."); return }
    if conversations[id] == nil { conversations[id] = Conversation(sessionID: id, directory: session.directory) }
    let context = ClaudeTurns.context(conversations[id]!.turns)
    let turnID = "claude-\(UUID().uuidString)"
    conversations[id]!.turns.append(Turn(id: turnID, request: request, at: .now, status: .working, engine: .claude))
    running.insert(id)
    var fold = ClaudeFold(directory: session.directory)
    let update: @MainActor (JSON) -> Void = { [weak self] e in
      guard let self, let i = self.conversations[id]?.turns.firstIndex(where: { $0.id == turnID }) else { return }
      fold.apply(e, to: &self.conversations[id]!.turns[i])
    }
    do {
      let run = try launcher(session, request, context)
      claudeRuns[id] = run
      run.onEvent = { e in Task { @MainActor in update(e) } }
      run.onApproval = { [weak self] rid, tool, input in
        Task { @MainActor in
          guard let self else { return }
          if self.claudeAlways[id]?.contains(Plain.claudeTool(tool)) == true { self.claudeRuns[id]?.answer(rid, allow: true, input: input); return }
          let w = Plain.describeClaudeApproval(tool, input: input, dir: session.directory)
          self.claudeInputs[rid] = input
          var a = Approval(id: rid, sessionID: id, action: tool, title: w.title, items: w.items, stepID: nil)
          a.engine = .claude
          self.conversations[id]?.approval = a
          if let i = self.conversations[id]?.turns.firstIndex(where: { $0.id == turnID }), let s = self.conversations[id]?.turns[i].steps.lastIndex(where: { $0.status == .running }) {
            self.conversations[id]?.turns[i].steps[s].status = .waiting
          }
          if let s = self.sessions.first(where: { $0.id == id }) { self.onApproval?(s, a); self.onNotify?(NotifyEvent.needsYou(a, session: s)) }
        }
      }
      run.onEnd = { [weak self] code in
        Task { @MainActor in
          guard let self else { return }
          self.claudeRuns[id] = nil
          self.running.remove(id)
          if self.conversations[id]?.approval?.engine == .claude { self.conversations[id]?.approval = nil }
          if let i = self.conversations[id]?.turns.firstIndex(where: { $0.id == turnID }) {
            var t = self.conversations[id]!.turns[i]
            if t.isRunning {
              t.status = code == 0 ? .stopped : .failed
              t.ended = .now
              if code != 0 { t.error = Problem(text: "Claude stopped before it finished.", detail: "exit \(code)") }
            }
            for k in t.steps.indices where t.steps[k].status == .running || t.steps[k].status == .waiting { t.steps[k].status = .failed; t.steps[k].error = "This step did not finish." }
            self.conversations[id]!.turns[i] = t
            if let base = self.claudeTurnsBase {
              ClaudeTurns.save(self.conversations[id]!.turns.filter { $0.engine == .claude }, session: id, base: base)
            }
            if let s = self.sessions.first(where: { $0.id == id }) {
              self.onRunEnded?(s, t)
              if let e = NotifyEvent.finished(t, session: s) { self.onNotify?(e) }
            }
          }
        }
      }
      try run.begin()
    } catch {
      running.remove(id)
      claudeRuns[id] = nil
      if let i = conversations[id]?.turns.firstIndex(where: { $0.id == turnID }) {
        conversations[id]!.turns[i].status = .failed
        conversations[id]!.turns[i].error = Problem(text: "Claude could not start here.", detail: error.localizedDescription)
      }
    }
  }

  public var projectFolder: String {
    guard let d = sessions.first?.directory else { return "~/ola-bart" }
    return d.replacingOccurrences(of: #"^/Users/[^/]+"#, with: "~", options: .regularExpression)
  }
}
