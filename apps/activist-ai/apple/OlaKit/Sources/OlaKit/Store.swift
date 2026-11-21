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
      if selectedID != oldValue { swapPick(from: oldValue, to: selectedID) }
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
  /// A turn ended (done, failed or stopped), with the turn before it in the same conversation:
  /// for keeping conversations the person chose to share (KeptConversations, OLA-159).
  public var onTurnEnded: ((SessionInfo, Turn, Turn?) -> Void)?
  private func turnEnded(_ s: SessionInfo) {
    guard let onTurnEnded, let turns = conversations[s.id]?.turns, let t = turns.last, [.done, .failed, .stopped].contains(t.status) else { return }
    onTurnEnded(s, t, turns.count > 1 ? turns[turns.count - 2] : nil)
  }
  /// An approval that goes ahead without asking (the Mac's "Lots of permissions",
  /// PermissionSettings.wire): asked at each approval, so a change applies to the next step.
  public var goesAhead: ((_ action: String, _ resources: [String]) -> Bool)?
  /// Whether the server answers those steps itself (OLA-139: Bart's opencode on the machine keeps
  /// "Lots of permissions" and answers them there, `../bart/approver.mjs`). Then the store does not
  /// answer: it only keeps the card and the notification away, and shows them after all should the
  /// step still be waiting `serverGrace` seconds later. False: the store answers ("On this Mac").
  public var serverAnswers: () -> Bool = { false }
  public var serverGrace: TimeInterval = 4
  /// The cloud runtime's "Lots of permissions" (each app wires its switch): sent with a new cloud
  /// conversation as its autonomy, and again before a request when it changed (CloudAutonomy).
  public var cloudLots: () -> Bool = { true }
  /// The autonomy each cloud conversation was last given from here.
  private var autonomySent: [String: String] = [:]
  /// How many approvals went ahead without asking (checks).
  public private(set) var wentAhead = 0
  /// "Yes, for the rest of this session" (OLA-142): session id -> the kinds said yes to
  /// (SessionYes.kind). Kept here for every runtime, so the card stays away; answered here only
  /// where the store answers ("On this Mac"), by the machine's approver on the Ola machine.
  private var sessionYes: [String: Set<String>] = [:]
  /// The yes kinds kept for a session (checks).
  public func yesKinds(_ session: String) -> Set<String> { sessionYes[session] ?? [] }
  func covered(_ session: String, _ action: String, _ resources: [String]) -> Bool {
    sessionYes[session]?.contains(SessionYes.kind(action: action, resources: resources)) == true
  }
  /// The runtime this store works in now.
  public var runtime: Runtime? { Runtime.of(config) }

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
    config = ServerConfig(url: URL(string: ServerConfig.defaultAddress)!, password: "", viaMac: true, macName: "Bart\u{2019}s iMac")
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
    hostedOn = fixture.hostedOn
    if let p = fixture.hostedProvider { hosted = HostedStatus(unavailable: nil, provider: p, usedUSD: 0.03, capUSD: 20) }
    suggestion = fixture.suggestion
    if fixture.claudeOn { claudeUnavailable = nil }
    previews = fixture.previews
    fixtureFiles = fixture.fileData
  }

  /// A fixture store only: shows it as the given runtime (screenshots of both runtimes' lists).
  public func previewAs(_ r: Runtime) {
    guard !live else { return }
    config = r == .cloud ? ServerConfig(url: URL(string: ServerConfig.defaultAddress)!, password: "", account: true) : ServerConfig(url: URL(string: ServerConfig.defaultAddress)!, password: "", viaMac: true, macName: "Bart\u{2019}s iMac")
  }

  /// A fixture store only: replaces a conversation, for frame-by-frame renders of a made-up run.
  public func previewSet(_ id: String, _ conversation: Conversation, running: Bool) {
    guard !live else { return }
    conversations[id] = conversation
    if running { self.running.insert(id) } else { self.running.remove(id) }
  }

  public var selected: SessionInfo? { sessions.first { $0.id == selectedID } }
  public var conversation: Conversation? { selectedID.flatMap { conversations[$0] } }
  public func needsYou(_ id: String) -> Bool { conversations[id]?.approval != nil || conversations[id]?.question != nil }
  /// The words under a session's title while it waits (OLA-321): a question with choices is not a
  /// yes. A permission card waiting beside it comes first, since nothing runs until it is answered.
  public func waitingWords(_ id: String) -> String? {
    Self.waitingWords(approval: conversations[id]?.approval != nil, question: conversations[id]?.question != nil)
  }
  nonisolated public static func waitingWords(approval: Bool, question: Bool) -> String? {
    approval ? "Needs your yes" : question ? "Waits for your answer" : nil
  }
  public var gatewayModels: [ModelInfo] { models.filter { $0.providerID == "ola" && !HostedPick.isHosted($0.modelID) } }

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
  public func attach(_ config: ServerConfig?, orSaved: Bool = true) {
    stream?.cancel()
    stream = nil
    let target = config ?? (orSaved ? Credentials.load() : nil)
    self.config = target
    client = target.map(OpenCodeClient.init)
    sessions = []
    conversations = [:]
    files = [:]
    models = []
    // The other server's model is not this one's (2026-11-17: the phone switched from its Mac to
    // the Ola machine and sent its first request with the Mac's model, which the machine refused).
    model = nil
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
    guard live else { return }  // a still picture stays as it is
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
        // A cloud project rests after a while unused, and its event stream alone does not wake it
        // (as a website tab's does not). With the app in front, any other request does: the list.
        if case OlaError.server(503, _) = error, config?.account == true, isActive { _ = try? await client.sessions() }
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
    // The list too: a conversation started elsewhere on the same store (the `ola` command in a
    // terminal) shows up when Bart comes back to the app.
    if let s = try? await client?.sessions() { sessions = s }
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

  func handle(_ ev: JSON, ahead: Bool = true) {
    let type = ev["type"].str
    let d = ev["data"]
    // A form (Ola's question, OLA-301) carries its session inside it.
    let sid = d["sessionID"].string ?? d["form"]["sessionID"].str
    let at = ev["created"].date ?? .now
    // Lots of permissions: no card, no notification. Answered "once" here at once, or by the
    // server itself (serverAnswers). Should the step still wait, the card is shown after all.
    if ahead, type == "permission.asked", (goesAhead?(d["action"].str, d["resources"].array.map(\.str)) ?? false) || covered(sid, d["action"].str, d["resources"].array.map(\.str)) {
      wentAhead += 1
      let rid = d["id"].str
      if serverAnswers() {
        let grace = serverGrace
        Task { [weak self] in
          try? await Task.sleep(for: .seconds(grace))
          guard let self, let client = self.client, let list = try? await client.pendingPermissions(sid), list.contains(where: { $0["id"].str == rid }) else { return }
          self.wentAhead -= 1
          self.handle(ev, ahead: false)
        }
      } else {
        Task {
          do { try await client?.reply(session: sid, request: rid, decision: .once) } catch { _ = conversations[sid]?.apply(ev) }
        }
      }
      return
    }
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
      beginRecord(sid)
    case "session.execution.succeeded", "session.execution.failed", "session.execution.interrupted":
      running.remove(sid)
      bump(sid, at)
      endRecord(sid, interrupted: type != "session.execution.succeeded")
      if sid != selectedID || !isActive { unseen.insert(sid) }
    default: break
    }
    if conversations[sid] != nil {
      conversations[sid]!.cloudProject = config?.cloudProject
      conversations[sid]!.apply(ev)
      if let s = sessions.first(where: { $0.id == sid }) {
        if type.hasPrefix("session.execution."), type != "session.execution.started" { turnEnded(s) }
        if type.hasPrefix("session.execution."), type != "session.execution.started", let t = conversations[sid]!.turns.last, let e = NotifyEvent.finished(t, session: s) { onNotify?(e) }
        if type == "permission.asked", let a = conversations[sid]!.approval { onNotify?(NotifyEvent.needsYou(a, session: s)) }
        if type == "form.created", let q = conversations[sid]!.question, sid != selectedID || !isActive { onNotify?(NotifyEvent.asks(q, session: s)) }
      }
      if type.hasPrefix("session.execution."), type != "session.execution.started", let s = sessions.first(where: { $0.id == sid }), let t = conversations[sid]!.turns.last {
        if !isActive || sid != selectedID { onRunEnded?(s, t) }
        if hostedRuns[sid] != nil { Task { await self.finishHosted(sid) } }
        else if t.engine == .ola { Task { await self.afterOlaRun(sid, t) } }
      }
      if type == "permission.asked", let s = sessions.first(where: { $0.id == sid }), let a = conversations[sid]!.approval {
        if !isActive || sid != selectedID { onApproval?(s, a) }
      }
    } else if type == "permission.asked" || type == "form.created" || type.hasPrefix("session.execution.") || type == "session.inbox.enqueued" {
      // A session not loaded yet: load it, so its approval and state are there when Bart looks.
      if sessions.contains(where: { $0.id == sid }) {
        Task {
          await open(sid)
          if type == "permission.asked", let s = sessions.first(where: { $0.id == sid }), let a = conversations[sid]?.approval {
            onApproval?(s, a)
            onNotify?(NotifyEvent.needsYou(a, session: s))
          }
          if type == "form.created", let s = sessions.first(where: { $0.id == sid }), let q = conversations[sid]?.question { onNotify?(NotifyEvent.asks(q, session: s)) }
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
        let res = p["resources"].array.map(\.str)
        if !serverAnswers(), (goesAhead?(p["action"].str, res) ?? false) || covered(id, p["action"].str, res), (try? await client.reply(session: id, request: p["id"].str, decision: .once)) != nil {
          wentAhead += 1
        } else {
          // The same description as an approval asked while the app watched (its note and card too).
          var a = Approval(p, dir: directory, cloudProject: config?.cloudProject)
          a.sessionID = id
          c.approval = a
        }
      }
      // A question Ola is waiting on (asked before this app opened the session, or while the
      // connection was lost): shown, so the run that waits on it can go on (OLA-301).
      if let q = ((try? await client.pendingForms(id)) ?? []).lazy.compactMap({ Question(form: $0) }).first {
        c.question = q
        if let sid = q.stepID, let ti = c.turns.indices.last, let si = c.turns[ti].steps.firstIndex(where: { $0.id == sid }) { c.turns[ti].steps[si].status = .waiting }
      }
      if running.contains(id), var last = c.turns.last, !last.isRunning, last.status == .failed, last.error?.detail?.hasPrefix("outcome") == true {
        last.status = .working
        c.turns[c.turns.count - 1] = last
      }
      var stored = await storedClaudeTurns(id)
      // A Claude turn still "working" on disk with no run here: the app quit or relaunched while
      // Claude worked. It stays in the conversation, said plainly, with what it changed (OLA-224).
      var stale = false
      if claudeTurnsBase != nil, claudeRuns[id] == nil {
        for i in stored.indices where stored[i].isRunning {
          stored[i].status = .stopped
          stored[i].ended = stored[i].steps.compactMap(\.ended).max() ?? stored[i].at
          stored[i].error = Problem(text: "Ola closed while Claude was working, so Claude stopped. What it changed is kept.")
          for k in stored[i].steps.indices where stored[i].steps[k].status == .running || stored[i].steps[k].status == .waiting {
            stored[i].steps[k].status = .failed
            stored[i].steps[k].error = "This step did not finish."
          }
          stale = true
        }
      }
      c.turns = ClaudeTurns.merge(c.turns, stored)
      if let live = conversations[id]?.turns.filter({ $0.engine == .claude && $0.isRunning }) { c.turns = ClaudeTurns.merge(c.turns, live) }
      if let madeBy { MadeByTurns.assign(await madeBy.entries(session: id), to: &c.turns) }
      conversations[id] = c
      if stale { saveClaude(id) }
      if hostedRuns[id] != nil, !c.isRunning, !running.contains(id) { await finishHosted(id) }
    } catch {
      note(error, "That session could not be opened.")
    }
  }

  /// Starts a fresh conversation; the session is made with the first request. In the Mac app it
  /// starts on Ola's own model, whatever the last session was picked for (OLA-337).
  public func newSession() {
    if offersEveryChoice { picks[""] = nil }
    selectedID = nil
    if offersEveryChoice { nextChoice = .ola; nextOnly = false }
  }

  // MARK: who does a request (OLA-337, the Mac app)

  /// The Mac app: the box lists every model that can do a request here, picked or not, and every
  /// finished request offers "Try again with" (Bart, Nov 21: "make sure I can send any request on
  /// the mac app build with a try with option", then "No I want the feature for first requests and
  /// any request not just answers"). The phone keeps the switches' lists.
  public var offersEveryChoice = false
  /// The model on the hosted provider when `nextEngine` is `.hosted`: `hosted` or a pick.
  public var nextHostedModel = HostedPick.plain
  /// Each session's pick, while another is on screen ("" is the new, unsent one). A pick sticks for
  /// its session; a new session starts on Ola.
  private var picks: [String: EngineChoice] = [:]

  /// Who works on the next message, as one choice.
  public var nextChoice: EngineChoice {
    get { nextEngine == .hosted ? .hosted(nextHostedModel) : nextEngine == .claude ? .claude : .ola }
    set {
      nextEngine = newValue.engine
      if case .hosted(let m) = newValue { nextHostedModel = m } else { nextHostedModel = HostedPick.plain }
    }
  }

  /// What can do a request here, in the order the menus show it: Ola, the hosted open model and its
  /// picked choices, Claude. In the Mac app: whatever is set up and allowed here, switch or not (a
  /// pick is the person saying so, as /hosted and /claude are); elsewhere only what is switched on.
  public var choices: [EngineChoice] {
    var out: [EngineChoice] = [.ola]
    let hostedHere = offersEveryChoice ? hosted.unavailable == nil : hostedOn
    if hostedHere {
      out.append(.hosted(HostedPick.plain))
      if offersEveryChoice { out += hosted.picks.map { .hosted($0.id) } }
    }
    let claudeHere = offersEveryChoice ? claudeLauncher != nil && claudeUnavailable == nil : claudeOn
    if claudeHere { out.append(.claude) }
    return out
  }

  /// One request by the chosen model: "Try again with", and the box.
  public func ask(_ c: EngineChoice, _ text: String) async {
    switch c {
    case .ola: await sendToOla(text)
    case .hosted(let m): await askHosted(text, model: m)
    case .claude: await askClaude(text)
    }
  }

  /// The pick for the box from the keyboard (the Model menu): one not offered here says so.
  public func pick(_ c: EngineChoice) {
    guard choices.contains(c) else { problem = Problem(text: "\(c.name) is not offered here."); return }
    nextChoice = c
    nextOnly = false
  }

  /// "Try again with" for the latest finished request (the menu bar's Try Again With, and a
  /// checker's drive): nil when there is none or the choice is not offered here.
  public func tryLastAgain(with c: EngineChoice) async {
    guard choices.contains(c) else { problem = Problem(text: "\(c.name) is not offered here."); return }
    guard let t = conversation?.turns.last(where: { TryAgain.offered($0, choices: choices) }), conversation?.isRunning != true else { return }
    await ask(c, t.request)
  }

  /// A cloud project's fallbacks, from the front desk (nil elsewhere, or when it does not answer).
  public func cloudFallback() async -> JSON? {
    guard config?.account == true, let client else { return nil }
    return try? await client.fallbackInfo()
  }

  /// The pick follows the session on screen (the Mac app only).
  private func swapPick(from old: String?, to new: String?) {
    guard offersEveryChoice else { return }
    picks[old ?? ""] = nextChoice == .ola ? nil : nextChoice
    nextChoice = picks[new ?? ""] ?? .ola
    if new == nil { nextOnly = false }
  }

  /// What Bart typed: a slash command, or a request for the engine chosen beside the composer.
  public func send(_ text: String) async {
    let typed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    switch SlashCommand.parse(typed) {
    case .unknown:
      problem = Problem(text: "No such command. Type / to see the commands.")
    case .command(let c, let rest):
      switch c {
      // Alone: the previous request again with it; in a new conversation, the next message goes to it.
      case .claude:
        if rest.isEmpty, conversation?.turns.last == nil { nextOnce(.claude) } else { await askClaude(rest.isEmpty ? (conversation?.turns.last?.request ?? "") : rest) }
      case .ola: if rest.isEmpty { nextEngine = .ola; nextOnly = false } else { await sendToOla(rest) }
      case .hosted:
        if rest.isEmpty, conversation?.turns.last == nil { nextOnce(.hosted) } else { await askHosted(rest.isEmpty ? (conversation?.turns.last?.request ?? "") : rest) }
      // The Mac app's picked choice (OLA-337), the same way: alone in a new conversation the box is
      // set to it for this session; alone after a request, that request again with it.
      case .deepseek:
        guard offersEveryChoice else { problem = Problem(text: "No such command. Type / to see the commands."); return }
        let c = EngineChoice.hosted("deepseek-v4-pro")
        if rest.isEmpty, conversation?.turns.last == nil {
          guard choices.contains(c) else { problem = Problem(text: hosted.unavailable ?? "DeepSeek V4 Pro is not offered here."); return }
          nextChoice = c
          nextOnly = false
        } else {
          await askHosted(rest.isEmpty ? (conversation?.turns.last?.request ?? "") : rest, model: "deepseek-v4-pro")
        }
      case .new: newSession()
      case .stop: await stop()
      case .files: onFiles?()
      case .help: problem = Problem(text: SlashCommand.listed(picks: offersEveryChoice).map { "/\($0.rawValue): \($0.summary)" }.joined(separator: "\n"))
      }
    case .none:
      let engine = nextEngine
      if nextOnly { nextOnly = false; nextEngine = .ola }
      switch engine {
      case .claude: await askClaude(typed)
      case .hosted: await askHosted(typed, model: nextHostedModel)
      case .ola:
        // Asked for Claude in plain words: the card, never the everyday model ("I can't use Claude Code").
        if let nextOnly = ClaudeAsk.detect(typed) {
          guard claudeLauncher != nil, claudeUnavailable == nil else { problem = Problem(text: claudeUnavailable ?? "Claude is not available here."); return }
          var s = StretchSuggestion(sessionID: selectedID, request: typed, reason: .asked, target: .claude, offers: [.claude], turnID: nil)
          s.nextOnly = nextOnly
          suggestion = s
          return
        }
        // Before a run: does the request alone look like a stretch? (the web app's precheck)
        if let r = Stretch.precheck(typed, files: localFiles?() ?? []) {
          switch plan(r, sessionID: selectedID) {
          case .handover(let f): await handOver(f, typed, reason: r); return
          case .suggest(let target, let offers):
            suggestion = StretchSuggestion(sessionID: selectedID, request: typed, reason: r, target: target, offers: offers, turnID: nil)
            return
          case .nothing: break
          }
        }
        await sendToOla(typed)
      }
    }
  }

  /// `/claude` or `/hosted` alone in a new conversation: the next message goes there, once.
  func nextOnce(_ e: Turn.Engine) {
    nextEngine = e
    nextOnly = true
    problem = Problem(text: e == .claude ? "Your next message goes to Claude." : "Your next message goes to the hosted open model.")
  }
  /// The next message only (`/claude` alone), then back to Ola.
  public private(set) var nextOnly = false

  /// The session on screen, or a new one titled after the request (made with the first request).
  func sessionFor(_ request: String) async -> String? {
    if let id = selectedID { return id }
    guard let client else { return nil }
    do {
      let title = request.count > 60 ? String(request.prefix(57)) + "\u{2026}" : request
      let autonomy = config?.account == true ? CloudAutonomy.word(cloudLots()) : nil
      let s = try await client.createSession(title: title.replacingOccurrences(of: "\n", with: " "), autonomy: autonomy)
      if let autonomy { autonomySent[s.id] = autonomy }
      if !sessions.contains(where: { $0.id == s.id }) { sessions.insert(s, at: 0) }
      conversations[s.id] = Conversation(sessionID: s.id, directory: s.directory)
      // The pick made before the first request stays with the session it started (OLA-337).
      if offersEveryChoice { picks[s.id] = nextChoice == .ola ? nil : nextChoice; picks[""] = nil }
      selectedID = s.id
      if let model, model != (try? await client.defaultModel()) { try? await client.switchModel(s.id, to: model) }
      return s.id
    } catch {
      note(error, "The session could not be started. Nothing was sent.")
      return nil
    }
  }

  public func sendToOla(_ text: String) async {
    let request = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !request.isEmpty, let client else { return }
    problem = nil
    if await refusedByModelGuard(client) { return }
    guard let id = await sessionFor(request) else { return }
    if conversations[id] == nil { conversations[id] = Conversation(sessionID: id) }
    // What Claude or the hosted model did since Ola last answered, for Ola to read first (in the
    // cloud the front desk adds its own).
    let told = config?.account == true ? nil : EngineNote.note(for: conversations[id]!.turns, target: .ola)
    conversations[id]!.startTurn(request)
    running.insert(id)
    do {
      // The cloud: the conversation follows this runtime's switch, as on the website, so a change of
      // the switch (or a conversation started on the website) applies from this request on.
      if config?.account == true, autonomySent[id] != CloudAutonomy.word(cloudLots()) {
        let want = CloudAutonomy.word(cloudLots())
        if (try? await client.setAutonomy(id, want)) != nil { autonomySent[id] = want }
      }
      try await client.prompt(id, text: (told ?? "") + request)
    } catch {
      running.remove(id)
      conversations[id]?.failLastSend(Problem(text: "Your request did not reach the machine. Nothing was done; send it again when it answers.", detail: (error as? OlaError)?.detail))
    }
  }

  /// The engine on this Mac (or the phone's Mac) offers a model that is not Ola's (ModelGuard,
  /// OLA-249): the request is not sent, the person is told in one sentence, and the app stops the
  /// engine. Before every request to an opencode Ola runs itself; the cloud's route offers no choice.
  public var onForeignModels: (() -> Void)?
  func refusedByModelGuard(_ client: OpenCodeClient) async -> Bool {
    guard config?.account != true, runtime == .local else { return false }
    switch await ModelGuard.check(client) {
    case .olas: return false
    case .foreign:
      problem = Problem(text: config?.viaMac == true ? ModelGuard.stoppedPhone : ModelGuard.stopped)
      onForeignModels?()
      return true
    case .unknown(let why):
      problem = Problem(text: "Your request did not reach Ola. Nothing was done; send it again when it answers.", detail: why)
      return true
    }
  }

  public func stop() async {
    if let id = selectedID, let run = claudeRuns[id] { run.stop(); return }
    guard let id = selectedID, let client else { return }
    do { try await client.interrupt(id) } catch { note(error, "The machine did not answer the Stop. It may still be working.") }
  }

  /// The person's answer to Ola's question (OLA-301): the card's choice, or their own words.
  /// Returns whether it reached the machine; the card goes when the server says it was replied.
  @discardableResult
  public func answerQuestion(_ answer: [String: JSON], in sessionID: String? = nil) async -> Bool {
    guard let id = sessionID ?? selectedID, let q = conversations[id]?.question, let client else { return false }
    do {
      try await client.answerForm(session: q.sessionID.isEmpty ? id : q.sessionID, form: q.id, answer: answer)
      if conversations[id]?.question?.id == q.id { conversations[id]?.question = nil }
      return true
    } catch {
      note(error, "Your answer did not reach Ola. Try again.")
      return false
    }
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
    guard client != nil else { return }
    if decision == .always {
      let status = await answerForSession(session: id, request: a.id)
      if !(200..<300).contains(status) { problem = Problem(text: "Your answer did not reach Ola. Try again.", detail: "\(status)") }
      return
    }
    do {
      try await client?.reply(session: id, request: a.id, decision: decision)
    } catch {
      note(error, "Your answer did not reach the machine. Try again.")
    }
  }

  /// "Yes, for the rest of this session" to one waiting request (OLA-142), wherever it was given
  /// (this app's card, or the phone's through the relay, `MacRelay.sessionYes`). Returns an HTTP
  /// status. Never opencode's own "always" (a lasting rule for the whole project):
  /// - On this Mac (loopback): kept here by kind, answered "once", and anything else of that kind
  ///   waiting in the session too; later ones are answered as they come (`handle`).
  /// - The Mac on the Ola machine: sent to the machine's door, whose approver keeps it.
  /// - The phone: sent as `always` to its door or its Mac's relay, which keep it the same way.
  @discardableResult
  public func answerForSession(session: String, request: String) async -> Int {
    guard let client, let config else { return 503 }
    let waiting = (try? await client.pendingPermissions(session)) ?? []
    guard let p = waiting.first(where: { $0["id"].str == request }) else { return 404 }
    sessionYes[session, default: []].insert(SessionYes.kind(action: p["action"].str, resources: p["resources"].array.map(\.str)))
    do {
      if config.account || config.viaMac {
        try await client.reply(session: session, request: request, decision: .always)
      } else {
        try await client.reply(session: session, request: request, decision: .once)
        for o in waiting where o["id"].str != request && covered(session, o["action"].str, o["resources"].array.map(\.str)) {
          try? await client.reply(session: session, request: o["id"].str, decision: .once)
          wentAhead += 1
        }
      }
      return 204
    } catch OlaError.server(let s, _) {
      return s
    } catch {
      return 502
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
    // A cloud conversation belongs to the project, as on the website, which keeps them all.
    if config?.account == true {
      problem = Problem(text: "Cloud sessions stay in the project, as on the website. Rename it instead.")
      return
    }
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
    if path.isEmpty { await loadMadeBy() }
    do { files[path] = try await client.files(in: path.isEmpty ? nil : path) } catch { note(error, "The project's files could not be listed.") }
  }

  private var fixtureFiles: [String: Data] = [:]

  public func loadMadeBy() async {
    guard let madeBy else { return }
    var out: [String: MadeByEntry] = [:]
    for e in await madeBy.lastChanges() { out[e.path] = e }
    madeByFiles = out
  }

  // MARK: the record of who made each file (OLA-224)

  /// An opencode run starts (Ola's own model, or the hosted one): its files are noted.
  func beginRecord(_ sid: String) {
    guard let madeBy, recording[sid] == nil else { return }
    let turn = "oc-\(sid)-\(Int(Date().timeIntervalSince1970 * 1000))"
    recording[sid] = turn
    let hosted = hostedRuns[sid] != nil
    let m = hosted ? (hostedModelOf[sid] ?? Self.hostedModel.modelID) : (model?.modelID ?? "general")
    Task { await madeBy.begin(turn: turn, engine: hosted ? .hosted : .ola, model: m, session: sid) }
  }

  /// It ended: what it changed is recorded, and shown with the turn.
  func endRecord(_ sid: String, interrupted: Bool) {
    guard let madeBy, let turn = recording.removeValue(forKey: sid) else { return }
    Task {
      _ = await madeBy.end(turn: turn, model: nil, interrupted: interrupted)
      await self.applyRecord(sid)
    }
  }

  /// Each turn of a loaded conversation gets the files the record says it changed.
  public func applyRecord(_ sid: String) async {
    guard let madeBy else { return }
    let entries = await madeBy.entries(session: sid)
    if conversations[sid] != nil { MadeByTurns.assign(entries, to: &conversations[sid]!.turns) }
    await loadMadeBy()
  }

  /// Claude's turns so far, on disk at once (not only when Claude ends): a turn the app quits
  /// during is still in the record when it starts again (OLA-224).
  func saveClaude(_ id: String) {
    guard let base = claudeTurnsBase, let turns = conversations[id]?.turns.filter({ $0.engine == .claude }) else { return }
    ClaudeTurns.save(turns, session: id, base: base)
  }

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
  /// The record of which engine made each file (OLA-224): the folder's own on this Mac; nil elsewhere.
  public var madeBy: MadeByRecord?
  /// Each file's last change, for Files ("Last changed by Claude, 10:49 pm").
  public private(set) var madeByFiles: [String: MadeByEntry] = [:]
  /// The opencode run in each session the record is bracketing (its record turn id).
  private var recording: [String: String] = [:]
  private var claudeModels: [String: String] = [:]
  public var onFiles: (() -> Void)?
  /// The first line of each session's last reply, for the sessions list (loaded as rows appear).
  public private(set) var previews: [String: String] = [:]
  /// What the Mac app says about itself (phone only): its mode and Fallback to Claude.
  public private(set) var macHello: JSON?
  /// View on a result under a reply (each app opens it its own way).
  public var onView: ((ResultItem) -> Void)?
  private var claudeRuns: [String: ClaudeRun] = [:]
  private var claudeAlways: [String: Set<String>] = [:]
  private var claudeInputs: [String: JSON] = [:]

  public func claudeRunning(_ session: String) -> Bool { claudeRuns[session] != nil }

  /// The last reply's first line, from the loaded conversation or a light read of the history.
  public func loadPreview(_ id: String) async {
    if let c = conversations[id], let t = c.turns.last(where: { !$0.shownAnswer.isEmpty }) {
      previews[id] = Self.firstLine(t.shownAnswer)
      return
    }
    guard previews[id] == nil, let client, let msgs = try? await client.messages(id, pages: 1) else { return }
    let turns = Conversation.turns(fromMessages: msgs, directory: nil)
    previews[id] = turns.last(where: { !$0.shownAnswer.isEmpty }).map { Self.firstLine($0.shownAnswer) } ?? ""
  }

  static func firstLine(_ s: String) -> String {
    let line = s.split(separator: "\n").first { !$0.trimmingCharacters(in: .whitespaces).isEmpty }.map(String.init) ?? ""
    return line.replacingOccurrences(of: "**", with: "").replacingOccurrences(of: "`", with: "").replacingOccurrences(of: #"^#+\s*"#, with: "", options: .regularExpression)
  }

  /// Asks the Mac app about itself (phone only).
  public func loadMacHello() async {
    guard config?.viaMac == true, let client else { return }
    macHello = try? await client.hello()
  }

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
    _ = client
    guard let id = await sessionFor(request), let session = sessions.first(where: { $0.id == id }) else { return }
    guard claudeRuns[id] == nil else { problem = Problem(text: "Claude is already working in this session. Wait for it, or stop it."); return }
    if conversations[id] == nil { conversations[id] = Conversation(sessionID: id, directory: session.directory) }
    let context = ClaudeTurns.context(conversations[id]!.turns)
    let turnID = "claude-\(UUID().uuidString)"
    conversations[id]!.turns.append(Turn(id: turnID, request: request, at: .now, status: .working, engine: .claude))
    running.insert(id)
    saveClaude(id)
    await madeBy?.begin(turn: turnID, engine: .claude, model: nil, session: id)
    var fold = ClaudeFold(directory: session.directory)
    let update: @MainActor (JSON) -> Void = { [weak self] e in
      guard let self, let i = self.conversations[id]?.turns.firstIndex(where: { $0.id == turnID }) else { return }
      fold.apply(e, to: &self.conversations[id]!.turns[i])
      if let m = fold.model { self.claudeModels[turnID] = m }
      // Kept as it goes, after each step and at the end, so a quit loses nothing.
      let type = e["type"].str
      if type == "user" || type == "result" || (type == "assistant" && e["message"]["content"].array.contains { $0["type"].str == "tool_use" }) { self.saveClaude(id) }
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
            self.saveClaude(id)
            if let madeBy = self.madeBy {
              let model = self.claudeModels.removeValue(forKey: turnID)
              let interrupted = t.status != .done
              Task {
                _ = await madeBy.end(turn: turnID, model: model, interrupted: interrupted)
                await self.applyRecord(id)
                self.saveClaude(id)
              }
            }
            if let s = self.sessions.first(where: { $0.id == id }) {
              self.onRunEnded?(s, t)
              self.turnEnded(s)
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
      saveClaude(id)
      if let madeBy { Task { _ = await madeBy.end(turn: turnID, model: nil, interrupted: true) } }
    }
  }

  // MARK: Fallback to a hosted open model, and the stretch card

  /// The folder's two switches and "When a request looks like a stretch" (the app keeps them per folder).
  public var fallbacks = FallbackSettings()
  /// Called when the card's "Always in this folder" changes them (the app saves them).
  public var onFallbacksChanged: ((FallbackSettings) -> Void)?
  /// The switch in Settings (off by default). `/hosted` works without it.
  public var hostedOn = false
  /// Whether a request can be handed to the hosted open model here, and to whom.
  public var hosted = HostedStatus(unavailable: HostedStatus.notSetUp)
  /// The door lets a request for the hosted model through only while the app hands one over.
  public var hostedArm: ((Bool) -> Void)?
  /// The folder's files and sizes, for the before-run check (On this Mac only).
  public var localFiles: (() -> [(path: String, size: Int)])?
  /// The card on screen, if any.
  public var suggestion: StretchSuggestion?
  public static let hostedModel = ModelInfo(providerID: "ola", modelID: "hosted", name: "Hosted open model")
  /// Sessions where the hosted model is working, and the model to go back to after.
  private var hostedRuns: [String: ModelInfo] = [:]
  /// The model at the hosted provider each of those runs on (`hosted` or a pick).
  private var hostedModelOf: [String: String] = [:]
  /// "Not now": not asked again for the same reason in that conversation.
  private var declined: [String: Set<StretchReason>] = [:]

  public func hostedRunning(_ session: String) -> Bool { hostedRuns[session] != nil }

  /// What is set up here, the hosted open model first (as on the web).
  public var fallbacksHere: [Fallback] {
    var out: [Fallback] = []
    if hosted.unavailable == nil { out.append(.hosted) }
    if claudeLauncher != nil, claudeUnavailable == nil { out.append(.claude) }
    return out
  }

  enum Plan: Equatable { case nothing, handover(Fallback), suggest(Fallback, [Fallback]) }

  /// What to do about a stretch: nothing, hand it over without asking, or show the card.
  func plan(_ r: StretchReason, sessionID: String?) -> Plan {
    let offers = fallbacksHere
    guard !offers.isEmpty, fallbacks.stretch != .never, !(declined[sessionID ?? ""]?.contains(r) ?? false) else { return .nothing }
    if fallbacks.stretch == .handover {
      let on = offers.filter { fallbacks.isOn($0) }
      if let f = on.contains(fallbacks.stretchTo) ? fallbacks.stretchTo : on.first { return .handover(f) }
    }
    return .suggest(offers[0], offers)
  }

  /// After an Ola run: did it get stuck, by what can be seen?
  func afterOlaRun(_ id: String, _ t: Turn) async {
    guard t.engine == .ola, let r = Stretch.stuck(t) else { return }
    switch plan(r, sessionID: id) {
    case .handover(let f): await handOver(f, t.request, reason: r)
    case .suggest(let target, let offers): suggestion = StretchSuggestion(sessionID: id, request: t.request, reason: r, target: target, offers: offers, turnID: t.id)
    case .nothing: break
    }
  }

  func handOver(_ f: Fallback, _ request: String, reason: StretchReason, sentence: Bool = true) async {
    let note = FallbackWords.handoff(reason, to: f, provider: hosted.provider)
    if f == .claude { await askClaude(request) } else { await askHosted(request) }
    if sentence, let id = selectedID, let i = conversations[id]?.turns.indices.last, conversations[id]?.turns[i].engine == f.engine {
      conversations[id]?.turns[i].notes.insert(note, at: 0)
    }
  }

  /// The card's three answers. "Always in this folder" turns the switch on (the app asked first,
  /// with the consent text, when it was off) and hands such requests over from then on.
  public func answerSuggestion(_ a: StretchSuggestion.Answer) async {
    guard let s = suggestion else { return }
    suggestion = nil
    switch a {
    case .once:
      if s.nextOnly { nextOnce(.claude); return }
      if s.target == .claude { await askClaude(s.request) } else { await askHosted(s.request) }
    case .always:
      if s.target == .claude { fallbacks.claude = true; claudeOn = claudeLauncher != nil } else { fallbacks.hosted = true; hostedOn = true }
      fallbacks.stretch = .handover
      fallbacks.stretchTo = s.target
      onFallbacksChanged?(fallbacks)
      if s.nextOnly { nextEngine = .claude; nextOnly = false; problem = Problem(text: "Your messages in this folder go to Claude now. Choose Ola beside the box to go back."); return }
      if s.target == .claude { await askClaude(s.request) } else { await askHosted(s.request) }
    case .notNow:
      if s.reason == .asked { return }
      declined[s.sessionID ?? "", default: []].insert(s.reason)
      if s.turnID == nil { await sendToOla(s.request) }
    }
  }

  /// "or Claude" / "or the hosted open model" on the card.
  public func switchSuggestion() {
    guard var s = suggestion, let o = s.other else { return }
    s.target = o
    suggestion = s
  }

  /// Hands one request to the hosted open model ("Ask the hosted model instead", the Hosted choice,
  /// `/hosted`): the same opencode and the same session, with the model `hosted` for this request,
  /// then back to the model it had. The reply is marked, by the model each step names.
  public func askHosted(_ text: String, model hostedID: String = HostedPick.plain) async {
    let request = text.trimmingCharacters(in: .whitespacesAndNewlines)
    let who = HostedPick.name(hostedID) ?? "the hosted open model"
    guard !request.isEmpty else { problem = Problem(text: "There is no request to hand to \(who) yet."); return }
    if let why = hosted.unavailable { problem = Problem(text: why); return }
    if hostedID != HostedPick.plain, !hosted.picks.contains(where: { $0.id == hostedID }) { problem = Problem(text: "\(HostedPick.name(hostedID) ?? "That model") is not offered here."); return }
    guard let client else { return }
    problem = nil
    // A cloud project: the front desk switches the conversation, sends the request and switches it
    // back, as for the website's hosted runs (OLA-337).
    if config?.account == true { await askHostedInCloud(request, model: hostedID, client: client); return }
    if await refusedByModelGuard(client) { return }
    guard let id = await sessionFor(request) else { return }
    if conversations[id]?.isRunning == true || claudeRuns[id] != nil { problem = Problem(text: "Ola is still working in this session. Wait for it, or stop it."); return }
    let back = model ?? gatewayModels.first ?? ModelInfo(providerID: "ola", modelID: "general", name: "General")
    hostedArm?(true)
    do {
      try await client.switchModel(id, to: Self.hostedModelInfo(hostedID))
    } catch {
      hostedArm?(false)
      note(error, "\(who.prefix(1).uppercased() + who.dropFirst()) could not be chosen here. Nothing was sent.")
      return
    }
    hostedRuns[id] = back
    hostedModelOf[id] = hostedID
    if conversations[id] == nil { conversations[id] = Conversation(sessionID: id) }
    let told = config?.account == true ? nil : EngineNote.note(for: conversations[id]!.turns, target: .hosted)
    conversations[id]!.startTurn(request)
    if let i = conversations[id]!.turns.indices.last { conversations[id]!.turns[i].engine = .hosted; conversations[id]!.turns[i].model = hostedID }
    running.insert(id)
    do {
      try await client.prompt(id, text: (told ?? "") + request)
    } catch {
      running.remove(id)
      await finishHosted(id)
      conversations[id]?.failLastSend(Problem(text: "Your request did not reach Ola. Nothing was done; send it again when it answers.", detail: (error as? OlaError)?.detail))
    }
  }

  /// The model id opencode knows the hosted open model or a pick by (`ola/hosted`, `ola/deepseek-v4-pro`).
  public static func hostedModelInfo(_ id: String) -> ModelInfo {
    id == HostedPick.plain ? hostedModel : ModelInfo(providerID: "ola", modelID: id, name: HostedPick.name(id) ?? id)
  }

  /// In a cloud project: one request handed over through the front desk (POST /api/hosted/run on
  /// the device route), just this once when the project's switch is off and the person owns it.
  func askHostedInCloud(_ request: String, model hostedID: String, client: OpenCodeClient) async {
    guard let id = await sessionFor(request) else { return }
    if conversations[id]?.isRunning == true { problem = Problem(text: "Ola is still working in this session. Wait for it, or stop it."); return }
    if conversations[id] == nil { conversations[id] = Conversation(sessionID: id) }
    conversations[id]!.startTurn(request)
    if let i = conversations[id]!.turns.indices.last { conversations[id]!.turns[i].engine = .hosted; conversations[id]!.turns[i].model = hostedID }
    running.insert(id)
    do {
      try await client.hostedRun(session: id, request: request, model: hostedID, once: hosted.once)
    } catch {
      running.remove(id)
      var words = "Your request did not reach Ola. Nothing was done; send it again when it answers."
      if case .server(_, let m)? = error as? OlaError, !m.isEmpty { words = m }
      conversations[id]?.failLastSend(Problem(text: words, detail: (error as? OlaError)?.detail))
    }
  }

  /// The hosted run ended: the session goes back to Ola's own model, and the door closes again.
  func finishHosted(_ id: String) async {
    hostedModelOf[id] = nil
    guard let back = hostedRuns.removeValue(forKey: id) else { return }
    hostedArm?(false)
    try? await client?.switchModel(id, to: back)
  }

  public var projectFolder: String { Self.projectFolder(firstSession: sessions.first?.directory, configFolder: config?.folder) }

  /// The folder as Bart says it: the sessions' own, else the folder the engine on this Mac was
  /// started in (an empty new folder, OLA-341: it said ~/ola-bart), else the machine's ~/ola-bart.
  nonisolated public static func projectFolder(firstSession: String?, configFolder: String?) -> String {
    guard let d = firstSession ?? configFolder else { return "~/ola-bart" }
    return d.replacingOccurrences(of: #"^/Users/[^/]+"#, with: "~", options: .regularExpression)
  }
}
