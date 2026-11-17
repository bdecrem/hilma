import Foundation
import OlaKit

/// OLA_WEB_CHECK=1: web search works in Bart's apps, the way they run it. One request to the agent,
/// "search the web for the Ola test phrase and tell me one result", answered as Bart would: the
/// web question is answered "Yes, this once" (and must read as a web search, not "run a command");
/// anything else asked is answered No. One real search through Ola's gateway (Brave).
///
///   On this Mac: OLA_WEB_CHECK=1 OLA_MODEL_TOKEN_FILE=<bart gateway token> swift run olakit-selftest
///     (opencode started here as the Mac app starts it; the web commands from ../workspace;
///      OLA_WEB_GATEWAY=host:port sends them to another gateway, for a check before a deploy)
///   The machine: OLA_WEB_CHECK=1 OLA_SERVER=http://100.95.51.98:4310 OLA_PASSWORD_FILE=<file> swift run olakit-selftest
///   OLA_WEB_PAGE_CHECK=1 also asks for one page with opencode's own page fetch (webfetch).
enum WebCheck {
  static let phrase = "Brave Search API"
  static let request = "Search the web for the Ola test phrase, \u{201C}\(phrase)\u{201D}, and tell me one result: its title and its address."

  static func go(env: [String: String], _ line: (Bool, String, String) -> Void) async {
    let fm = FileManager.default
    var server: LocalServer?
    let config: ServerConfig
    let t = fm.temporaryDirectory.appendingPathComponent("ola-web-\(getpid())")
    defer { server?.stop(); try? fm.removeItem(at: t) }
    if let s = env["OLA_SERVER"] {
      guard let pf = env["OLA_PASSWORD_FILE"], let pw = try? String(contentsOfFile: pf, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines) else { line(false, "set OLA_PASSWORD_FILE", ""); return }
      config = ServerConfig(url: URL(string: s)!, password: pw)
      line(true, "the machine's opencode", s)
    } else {
      guard let tf = env["OLA_MODEL_TOKEN_FILE"], let token = try? String(contentsOfFile: tf, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines) else { line(false, "set OLA_MODEL_TOKEN_FILE", ""); return }
      // The web commands as the app carries them: here, straight from the repo's workspace/.
      LocalServer.webToolsSource = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../../../workspace").standardized
      LocalServer.support = t.appendingPathComponent("support")
      let project = t.appendingPathComponent("project")
      try? fm.createDirectory(at: project, withIntermediateDirectories: true)
      let s = LocalServer(folder: project)
      s.stateBase = t.appendingPathComponent("state")
      if let g = env["OLA_WEB_GATEWAY"] { s.extraEnvironment["OLA_GATEWAY_HOSTPORT"] = g }
      do { config = try await s.start(modelToken: token) } catch { line(false, "the local agent starts", error.localizedDescription); return }
      server = s
      let tools = (try? fm.contentsOfDirectory(atPath: LocalServer.support.appendingPathComponent("web-tools").path)) ?? []
      line(Set(LocalServer.webToolNames).isSubset(of: tools), "the web commands are next to opencode, on its PATH", tools.sorted().joined(separator: ", "))
    }
    let client = OpenCodeClient(config)

    // 1. A search: the web question is answered "Yes, this once"; a command that only looks (the
    // open model sometimes checks that ola-search exists first) too, as Bart would; anything else, No.
    let box = Asked()
    let looks: Set<String> = ["which", "ls", "echo", "type", "command", "pwd", "true", "grep", "head"]
    guard let turn = await run(client, request, answer: { a in
      let web = a.note != nil
      box.add(a, web: web)
      if web { return .once }
      let harmless = a.action == "shell" && a.items.allSatisfy { i in
        (i.detail ?? "").split(whereSeparator: { ";|&\n".contains($0) }).allSatisfy { looks.contains($0.split(separator: " ").first.map(String.init) ?? "") }
      }
      return harmless ? .once : .reject
    }) else { line(false, "a run", "no turn"); return }
    let steps = turn.steps.map { "\($0.verb) \($0.object) [\($0.status.rawValue)]" }.joined(separator: "; ")
    line(!turn.steps.contains { $0.tool == "websearch" }, "opencode's own web search is not used", steps)
    let said = box.asked.map { "\($0.title) / \($0.note ?? "")" } + box.refused.map { "answered No: \($0.title) \($0.items.map { $0.detail ?? $0.label }.joined(separator: "; "))" }
    line(box.asked.contains { $0.title.hasPrefix("Ola wants to search the web for:") && $0.title.contains(phrase) }, "the question reads as a web search", said.joined(separator: " | "))
    let search = turn.steps.first { $0.verb == "Searched the web for" && $0.tool != "websearch" }
    line(search?.status == .done, "ola-search ran through the gateway", search.map { "\($0.object): \($0.status.rawValue)\($0.error.map { " \($0)" } ?? "")" } ?? "no ola-search step")
    let resultOK = search.map { $0.output.contains("Web results for:") && $0.output.contains("1. ") } ?? false
    line(resultOK, "the gateway's results reached the agent", search.map { String($0.output.prefix(200)).replacingOccurrences(of: "\n", with: " | ") } ?? "")
    line(turn.shownAnswer.contains("http"), "the reply names one result with its address", String(turn.shownAnswer.prefix(240)).replacingOccurrences(of: "\n", with: " "))
    line(turn.reaction == .done || Reaction.split(turn.answer).reaction != nil, "the reaction follows the rule", "\(turn.reaction.map { $0.rawValue } ?? "none") (\(turn.status.rawValue), \(turn.summary()))")

    // 2. (OLA_WEB_PAGE_CHECK=1) opencode's own page fetch, for an address the agent already has.
    if env["OLA_WEB_PAGE_CHECK"] == "1" {
      let pages = Asked()
      let t2 = await run(client, "Open the page https://example.com with your web page tool and tell me its title.", answer: { a in
        pages.add(a, web: a.action == "webfetch")
        return a.action == "webfetch" ? .once : .reject
      })
      let open = t2?.steps.first { $0.tool == "webfetch" }
      let asked = (pages.asked + pages.refused).map(\.title).joined(separator: " | ")
      line(open?.status == .done && (t2?.shownAnswer.contains("Example Domain") ?? false), "opencode's own page fetch reads a page",
           "\(asked); \(open.map { "\($0.status.rawValue)\($0.error.map { " \($0)" } ?? "")" } ?? "no webfetch step"); \(String((t2?.shownAnswer ?? "").prefix(120)))")
    }
  }

  final class Asked: @unchecked Sendable {
    private let lock = NSLock()
    private var a: [Approval] = [], r: [Approval] = []
    func add(_ x: Approval, web: Bool) { lock.lock(); if web { a.append(x) } else { r.append(x) }; lock.unlock() }
    var asked: [Approval] { lock.lock(); defer { lock.unlock() }; return a }
    var refused: [Approval] { lock.lock(); defer { lock.unlock() }; return r }
  }

  /// One request in a new session, every event folded as the apps fold them; approvals answered by `answer`.
  static func run(_ client: OpenCodeClient, _ text: String, answer: @escaping @Sendable (Approval) -> OpenCodeClient.Decision) async -> Turn? {
    guard let session = try? await client.createSession(title: "web check") else { return nil }
    var convo = Conversation(sessionID: session.id, directory: session.directory)
    convo.startTurn(text)
    let start = convo
    let stream = client.events()
    let watcher = Task { () -> Conversation in
      var c = start
      do {
        for try await ev in stream {
          c.apply(ev)
          if let t = c.turns.last, !t.isRunning, ev["data"]["sessionID"].str == session.id, ev["type"].str.hasPrefix("session.execution.") { break }
          if let a = c.approval, a.sessionID == session.id {
            try? await client.reply(session: session.id, request: a.id, decision: answer(a))
            c.approval = nil
          }
        }
      } catch {}
      return c
    }
    try? await Task.sleep(nanoseconds: 1_000_000_000)
    do { try await client.prompt(session.id, text: text) } catch { watcher.cancel(); return nil }
    let timeout = Task { try? await Task.sleep(nanoseconds: 300_000_000_000); watcher.cancel() }
    let done = await watcher.value
    timeout.cancel()
    try? await client.deleteSession(session.id)
    return done.turns.last
  }
}
