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
  public var isActive = true
  public var onRunEnded: ((_ session: SessionInfo, _ turn: Turn) -> Void)?
  public var onApproval: ((_ session: SessionInfo, _ approval: Approval) -> Void)?

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
    while !Task.isCancelled {
      do {
        if case .lost = connection {} else { connection = .connecting }
        for try await ev in client.events() {
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
        connection = .refused
        return
      } catch {
        if Task.isCancelled { return }
        if case .lost = connection {} else { connection = .lost(since: .now, why: (error as? OlaError)?.detail ?? error.localizedDescription) }
        try? await Task.sleep(nanoseconds: backoff * 1_000_000_000)
        backoff = min(backoff * 2, 10)
      }
    }
  }

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
          if type == "permission.asked", let s = sessions.first(where: { $0.id == sid }), let a = conversations[sid]?.approval { onApproval?(s, a) }
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
      conversations[id] = c
    } catch {
      note(error, "That session could not be opened.")
    }
  }

  /// Starts a fresh conversation; the session is made with the first request.
  public func newSession() { selectedID = nil }

  public func send(_ text: String) async {
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
    guard let id = selectedID, let client else { return }
    do { try await client.interrupt(id) } catch { note(error, "The machine did not answer the Stop. It may still be working.") }
  }

  public func answer(_ decision: OpenCodeClient.Decision, in sessionID: String? = nil) async {
    guard let id = sessionID ?? selectedID, let a = conversations[id]?.approval, let client else { return }
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

  public func read(_ path: String) async throws -> Data {
    guard let client else { throw OlaError.unreachable("not connected") }
    return try await client.read(path)
  }

  /// The project folder as Bart says it: "~/ola-bart".
  public var projectFolder: String {
    guard let d = sessions.first?.directory else { return "~/ola-bart" }
    return d.replacingOccurrences(of: #"^/Users/[^/]+"#, with: "~", options: .regularExpression)
  }
}
