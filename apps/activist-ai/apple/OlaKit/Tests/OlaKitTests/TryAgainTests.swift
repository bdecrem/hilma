import Foundation
import XCTest

@testable import OlaKit

/// OLA-337 (Bart, Nov 21): DeepSeek V4 Pro under "Try again with" in the Mac app; every request in
/// the Mac app can be sent with a choice, "for first requests and any request not just answers".
@MainActor
final class TryAgainTests: XCTestCase {
  let deepseek = EngineChoice.hosted("deepseek-v4-pro")
  let usage: JSON = ["hosted": ["provider": "Made-up Cloud", "picks": [["id": "deepseek-v4-pro", "name": "DeepSeek V4 Pro"], ["id": "not-known-here", "name": "Other"]]], "hosted_month": ["granted": true, "cost_micro_usd": 0, "cap_micro_usd": 20_000_000]]

  func testTheChoiceListsOnTheMacAndThePhone() {
    let store = OlaStore(fixture: Fixture.main)
    // The phone (no offersEveryChoice): the switches' list, unchanged; no DeepSeek there.
    XCTAssertEqual(store.choices, [.ola])
    store.hosted = HostedStatus.from(usage: usage)
    XCTAssertEqual(store.choices, [.ola], "the phone lists the hosted model only with its switch")
    store.hostedOn = true
    XCTAssertEqual(store.choices, [.ola, .hosted("hosted")], "and never a picked choice")
    // The Mac app: everything that can do a request here, switch or not.
    store.hostedOn = false
    store.offersEveryChoice = true
    XCTAssertEqual(store.choices, [.ola, .hosted("hosted"), deepseek], "only the picks this app knows")
    XCTAssertEqual(store.choices.map(\.name), ["Ola", "Hosted", "DeepSeek V4 Pro"])
    store.claudeUnavailable = nil
    store.claudeLauncher = { _, _, _ in throw OlaError.unreachable("not in a test") }
    XCTAssertEqual(store.choices.map(\.name), ["Ola", "Hosted", "DeepSeek V4 Pro", "Claude"])
    store.hosted = HostedStatus(unavailable: HostedStatus.notForYou, provider: "Made-up Cloud", picks: [HostedPick(id: "deepseek-v4-pro", name: "DeepSeek V4 Pro")])
    XCTAssertEqual(store.choices, [.ola, .claude], "not allowed here: neither the hosted model nor its picks")
  }

  func testWhatTheGatewayAndTheFrontDeskSay() {
    let s = HostedStatus.from(usage: usage)
    XCTAssertNil(s.unavailable)
    XCTAssertEqual(s.picks, [HostedPick(id: "deepseek-v4-pro", name: "DeepSeek V4 Pro")])
    // A cloud project: on, the owner with the switch off (just this once), a member with it off.
    let on = HostedStatus.from(fallback: ["hosted": ["configured": true, "enabled": true, "canChange": false, "provider": "Made-up Cloud", "picks": [["id": "deepseek-v4-pro", "name": "DeepSeek V4 Pro"]], "month": ["used": .number(0.5), "cap": 20]]])
    XCTAssertEqual([on.unavailable == nil, on.once, on.picks.count == 1], [true, false, true])
    let owner = HostedStatus.from(fallback: ["hosted": ["configured": true, "enabled": false, "canChange": true, "provider": "Made-up Cloud", "picks": [["id": "deepseek-v4-pro", "name": "DeepSeek V4 Pro"]]]])
    XCTAssertEqual([owner.unavailable == nil, owner.once], [true, true])
    let member = HostedStatus.from(fallback: ["hosted": ["configured": true, "enabled": false, "canChange": false, "provider": "Made-up Cloud"]])
    XCTAssertNotNil(member.unavailable)
    XCTAssertNotNil(HostedStatus.from(fallback: ["hosted": ["configured": false, "unavailable": "Not set up."]]).unavailable)
    XCTAssertNotNil(HostedStatus.from(fallback: nil).unavailable)
  }

  /// Every kind of finished request offers it; only a running one does not.
  func testTryAgainIsOnEveryFinishedRequest() {
    let all: [EngineChoice] = [.ola, .hosted("hosted"), deepseek]
    func turn(_ status: Turn.Status, engine: Turn.Engine = .ola, _ edit: (inout Turn) -> Void = { _ in }) -> Turn {
      var t = Turn(id: UUID().uuidString, request: "make a page that says Hello", at: .now, status: status, engine: engine)
      edit(&t)
      return t
    }
    let kinds: [(String, Turn)] = [
      ("a short answer", turn(.done) { $0.answer = "Done." }),
      ("a long answer", turn(.done) { $0.answer = String(repeating: "A long answer. ", count: 400) }),
      ("one that failed", turn(.failed) { $0.error = Problem(text: "The model server had a problem.") }),
      ("one that never reached Ola", turn(.failed) { $0.error = Problem(text: "Your request did not reach Ola.") }),
      ("one that was stopped", turn(.stopped)),
      ("one with files", turn(.done) { $0.answer = "Wrote hello.html."; $0.changed = ["hello.html", "style.css"] }),
      ("one after a question card", turn(.done) { $0.answer = "Thanks, I used the blue one."; $0.notes = ["I asked which color you wanted."] }),
      ("a thank-you", turn(.done) { $0.answer = "[[ola:react thanks]]" }),
      ("one by Claude", turn(.done, engine: .claude) { $0.answer = "Done." }),
      ("one by DeepSeek V4 Pro", turn(.done, engine: .hosted) { $0.answer = "Done."; $0.model = "deepseek-v4-pro" }),
    ]
    for (what, t) in kinds { XCTAssertTrue(TryAgain.offered(t, choices: all), what) }
    XCTAssertFalse(TryAgain.offered(turn(.working), choices: all), "not while it runs")
    XCTAssertFalse(TryAgain.offered(turn(.sending), choices: all), "not while it is sent")
    XCTAssertEqual(EngineChoice.of(kinds.last!.1), deepseek)
  }

  func testTheBoxSaysThePickAndThatItSticks() {
    XCTAssertEqual(EngineChoice.ola.boxLabel(nextOnly: false), "Ola")
    XCTAssertEqual(deepseek.boxLabel(nextOnly: false), "DeepSeek V4 Pro, this session")
    XCTAssertEqual(EngineChoice.claude.boxLabel(nextOnly: true), "Claude, next message only")
    let store = OlaStore(fixture: Fixture.main)
    store.offersEveryChoice = true
    store.nextChoice = deepseek
    XCTAssertEqual([store.nextEngine == .hosted, store.nextHostedModel == "deepseek-v4-pro"], [true, true])
    store.newSession()
    XCTAssertEqual(store.nextChoice, .ola, "a new session starts on Ola")
  }

  /// A reply by DeepSeek V4 Pro says so: the mark, the line under it, the files it changed, and the
  /// note the next engine reads.
  func testItsRepliesSayWhoMadeThem() {
    var c = Conversation(sessionID: "s")
    c.startTurn("make a page that says Hello")
    c.apply(["type": "session.execution.started", "data": ["sessionID": "s"]])
    c.apply(["type": "session.step.started", "data": ["sessionID": "s", "model": ["id": "deepseek-v4-pro", "providerID": "ola"]]])
    XCTAssertEqual([c.turns.last?.engine.rawValue, c.turns.last?.model], ["hosted", "deepseek-v4-pro"])
    let history: [JSON] = [
      ["id": "u1", "type": "user", "text": "make a page", "time": ["created": 1]],
      ["id": "a1", "type": "assistant", "model": ["id": "deepseek-v4-pro", "providerID": "ola"], "time": ["created": 2], "content": [["type": "text", "text": "Wrote hello.html."]]],
      ["id": "u2", "type": "user", "text": "again", "time": ["created": 3]],
      ["id": "a2", "type": "assistant", "model": ["id": "hosted", "providerID": "ola"], "time": ["created": 4], "content": [["type": "text", "text": "Done."]]],
    ]
    let turns = Conversation.turns(fromMessages: history, directory: nil)
    XCTAssertEqual(turns.map(\.model), ["deepseek-v4-pro", "hosted"])
    XCTAssertEqual(FallbackWords.hostedAnswered("Together AI", model: "deepseek-v4-pro"), "Answered by DeepSeek V4 Pro, an outside open model at Together AI, not Ola\u{2019}s own model.")
    XCTAssertEqual(FallbackWords.hostedAnswered("Together AI", model: "hosted"), "Answered by the hosted open model at Together AI, outside Ola.")
    XCTAssertEqual(MadeByWords.turn(["hello.html"], by: .hosted, model: "deepseek-v4-pro"), "DeepSeek V4 Pro changed hello.html.")
    XCTAssertEqual(MadeByWords.turn(["hello.html"], by: .hosted, model: "hosted"), "The hosted open model changed hello.html.")
    XCTAssertEqual(MadeByWords.file(MadeByEntry(path: "hello.html", how: "created", engine: "hosted", model: "deepseek-v4-pro", at: "2026-11-21T10:00:00Z")).hasPrefix("Made by DeepSeek V4 Pro, an outside open model, "), true)
    XCTAssertTrue(HostedPick.isHosted("deepseek-v4-pro") && HostedPick.isHosted("hosted") && !HostedPick.isHosted("general"))
  }

  // MARK: the store, against a made-up opencode (On this Mac) and a made-up front desk (a cloud project)

  final class Fake: @unchecked Sendable {
    let lock = NSLock()
    var calls: [String] = []
    var model = "general"
    var prompts = 0
    var served = 0
    let sid = "ses_pick1"
    let t0 = Date().timeIntervalSince1970 * 1000
    /// The cloud project's front desk: its routes beside `/oc`.
    let prefix: String
    init(prefix: String = "") { self.prefix = prefix }
  }

  func makeFake(_ f: Fake, account: Bool = false) async throws -> (MiniHTTPServer, ServerConfig) {
    let s = try MiniHTTPServer(host: "127.0.0.1", port: 0) { req, res in
      let (sid, t0) = (f.sid, f.t0)
      func json(_ j: JSON) async { await res.send(200, j.data) }
      var path = req.path
      if !f.prefix.isEmpty {
        if path == "\(f.prefix)/api/hosted/run" {
          // The front desk: the conversation on the chosen model, the request sent, back after.
          let body = JSON.parse(req.body)
          f.lock.withLock { f.calls.append("RUN \(String(decoding: req.body, as: UTF8.self))"); f.model = body?["model"].str ?? "hosted"; f.prompts += 1 }
          await json(["ok": true])
          return
        }
        path = path.hasPrefix(f.prefix + "/oc") ? String(path.dropFirst(f.prefix.count + 3)) : path
      }
      let session: JSON = ["id": .string(sid), "title": "Pick test", "time": ["created": .number(t0), "updated": .number(t0)], "location": ["directory": "/tmp/p"]]
      if req.method == "POST" { f.lock.withLock { f.calls.append("\(path) \(String(decoding: req.body, as: UTF8.self))") } }
      switch path {
      case "/api/info": await json(["version": "2.3.0"])
      case "/api/session": await json(req.method == "POST" ? ["data": session] : ["data": []])
      case "/api/session/active": await json(["data": [:]])
      case "/api/model": await json(["data": [["providerID": "ola", "id": "general", "name": "General"]]])
      case "/api/model/default": await json(["data": ["providerID": "ola", "id": "general", "name": "General"]])
      case "/api/session/\(sid)": await json(["data": session])
      case "/api/session/\(sid)/permission", "/api/session/\(sid)/form": await json(["data": []])
      case "/api/session/\(sid)/message": await json(["data": []])
      case "/api/session/\(sid)/model":
        let m = JSON.parse(req.body)?["model"]["id"].str ?? ""
        f.lock.withLock { f.model = m }
        await json(["data": true])
      case "/api/session/\(sid)/prompt":
        f.lock.withLock { f.prompts += 1 }
        await json(["data": true])
      case "/api/event":
        _ = await res.head(200, ["Content-Type": "text/event-stream"])
        _ = await res.write(Data("data: {\"type\":\"server.connected\",\"data\":{}}\n\n".utf8))
        // Each request sent: its run, a step on the model the session has, its reply, its end.
        while true {
          let next: (Int, String)? = f.lock.withLock { f.prompts > f.served ? (f.served + 1, f.model) : nil }
          guard let (n, m) = next else { try? await Task.sleep(nanoseconds: 50_000_000); continue }
          f.lock.withLock { f.served = n }
          for e in [
            "{\"type\":\"session.execution.started\",\"data\":{\"sessionID\":\"\(sid)\"}}",
            "{\"type\":\"session.step.started\",\"data\":{\"sessionID\":\"\(sid)\",\"model\":{\"id\":\"\(m)\",\"providerID\":\"ola\"}}}",
            "{\"type\":\"session.text.ended\",\"data\":{\"sessionID\":\"\(sid)\",\"assistantMessageID\":\"a\(n)\",\"text\":\"Wrote hello.html (\(n)).\"}}",
            "{\"type\":\"session.execution.succeeded\",\"data\":{\"sessionID\":\"\(sid)\"}}",
          ] { _ = await res.write(Data("data: \(e)\n\n".utf8)) }
          if !f.prefix.isEmpty { f.lock.withLock { f.model = "general" } } // the front desk switches it back
        }
      default: await res.json(404, "no")
      }
    }
    let port = try await s.start()
    return (s, ServerConfig(url: URL(string: "http://127.0.0.1:\(port)\(f.prefix.isEmpty ? "" : f.prefix + "/oc")")!, password: "pw", account: account))
  }

  func waitDone(_ store: OlaStore, turns n: Int, _ f: Fake) async throws {
    for _ in 0..<100 {
      if let c = store.conversation, c.turns.count >= n, c.turns.last?.status == .done, !store.hostedRunning(f.sid) { return }
      try await Task.sleep(nanoseconds: 100_000_000)
    }
    XCTFail("turn \(n) did not finish: \(store.conversation?.turns.map(\.status.rawValue) ?? [])")
  }

  /// On this Mac: DeepSeek V4 Pro picked in the box before the very first request of a new session,
  /// a later request in it (the pick sticks), "Try again with" Ola on an answer, a new session on Ola.
  func testThePickInTheBoxFromTheFirstRequestOnThisMac() async throws {
    let f = Fake()
    let (server, config) = try await makeFake(f)
    defer { server.stop() }
    let store = OlaStore(config: config)
    store.offersEveryChoice = true
    store.hosted = HostedStatus.from(usage: usage)
    let armed = Armed()
    store.hostedArm = { armed.log.append($0) }
    store.start()
    for _ in 0..<50 where store.connection != .open { try await Task.sleep(nanoseconds: 100_000_000) }
    XCTAssertNil(store.selectedID, "a new session, nothing sent yet")
    XCTAssertTrue(store.choices.contains(deepseek))
    store.nextChoice = deepseek
    await store.send("make a page that says Hello")
    try await waitDone(store, turns: 1, f)
    let first = try XCTUnwrap(store.conversation?.turns.last)
    XCTAssertEqual([first.engine.rawValue, first.model, first.shownAnswer], ["hosted", "deepseek-v4-pro", "Wrote hello.html (1)."])
    XCTAssertEqual(store.selectedID, f.sid)
    XCTAssertEqual(store.nextChoice, deepseek, "the pick sticks for the session it started")
    var calls = f.lock.withLock { f.calls }
    XCTAssertTrue(calls.contains { $0.hasPrefix("/api/session ") }, "the session was made with the first request")
    let models = calls.filter { $0.contains("/model ") }
    XCTAssertEqual(models.count, 2, calls.joined(separator: "\n"))
    XCTAssertTrue(models[0].contains("\"deepseek-v4-pro\"") && models[1].contains("\"general\""), "on DeepSeek V4 Pro for the request, back to Ola's model after")
    XCTAssertEqual(armed.log, [true, false], "the door opened for that run only")
    // A later request in the same session: DeepSeek V4 Pro again.
    await store.send("make it blue")
    try await waitDone(store, turns: 2, f)
    XCTAssertEqual(store.conversation?.turns.last?.model, "deepseek-v4-pro")
    // "Try again with" Ola on that answer: Ola's own model, the same request.
    await store.ask(.ola, "make it blue")
    try await waitDone(store, turns: 3, f)
    let again = try XCTUnwrap(store.conversation?.turns.last)
    XCTAssertEqual([again.engine.rawValue, again.request], ["ola", "make it blue"])
    calls = f.lock.withLock { f.calls }
    XCTAssertTrue(calls.last?.contains("/prompt") == true && !calls.suffix(1).contains { $0.contains("/model ") }, "no switch for Ola's own model")
    // A pick that is not offered here: one sentence, nothing sent.
    let before = f.lock.withLock { f.calls.count }
    await store.ask(.hosted("not-known-here"), "make it red")
    XCTAssertEqual(store.problem?.text, "That model is not offered here.")
    XCTAssertEqual(f.lock.withLock { f.calls.count }, before)
    // A new session starts on Ola.
    store.newSession()
    XCTAssertEqual(store.nextChoice, .ola)
  }

  /// A cloud project: "Try again with" DeepSeek V4 Pro goes through the front desk's hosted run on
  /// the device route, just this once for the owner with the switch off; the reply says who made it.
  func testTryAgainWithDeepSeekInACloudProject() async throws {
    let f = Fake(prefix: "/api/device/w/demo")
    let (server, config) = try await makeFake(f, account: true)
    defer { server.stop() }
    let store = OlaStore(config: config)
    store.offersEveryChoice = true
    store.hosted = HostedStatus.from(fallback: ["hosted": ["configured": true, "enabled": false, "canChange": true, "provider": "Made-up Cloud", "picks": [["id": "deepseek-v4-pro", "name": "DeepSeek V4 Pro"]]]])
    store.start()
    for _ in 0..<50 where store.connection != .open { try await Task.sleep(nanoseconds: 100_000_000) }
    XCTAssertEqual(store.choices, [.ola, .hosted("hosted"), deepseek])
    await store.ask(deepseek, "make a page that says Hello")
    try await waitDone(store, turns: 1, f)
    let t = try XCTUnwrap(store.conversation?.turns.last)
    XCTAssertEqual([t.engine.rawValue, t.model, t.request], ["hosted", "deepseek-v4-pro", "make a page that says Hello"])
    let run = try XCTUnwrap(f.lock.withLock { f.calls.first { $0.hasPrefix("RUN ") } })
    let body = try XCTUnwrap(JSON.parse(Data(run.dropFirst(4).utf8)))
    XCTAssertEqual([body["model"].str, body["request"].str, body["conversation"].str], ["deepseek-v4-pro", "make a page that says Hello", f.sid])
    XCTAssertEqual(body["once"].bool, true, "the owner, with the switch off: just this once")
    XCTAssertFalse(f.lock.withLock { f.calls.contains { $0.contains("/model ") } }, "the front desk switches the model, not the app")
  }

  final class Armed { var log: [Bool] = [] }
}
