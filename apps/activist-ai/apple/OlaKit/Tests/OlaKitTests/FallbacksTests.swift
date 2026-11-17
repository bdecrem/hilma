import Foundation
import XCTest
@testable import OlaKit

/// The two fallbacks and the stretch card on the Mac and in `ola` (Fallbacks.swift): the web app's
/// rules (steps.ts precheck and stuckReason), the settings per folder, the hosted run in the store,
/// and the model door's gate.
@MainActor
final class FallbacksTests: XCTestCase {
  func testCommandsAreLive() {
    XCTAssertEqual(SlashCommand.parse("/hosted count the rows"), .command(.hosted, "count the rows"))
    XCTAssertEqual(SlashCommand.parse("/ola"), .command(.ola, ""))
    XCTAssertEqual(SlashCommand.hosted.summary, "Hand this request to the hosted open model")
    XCTAssertFalse(SlashCommand.allCases.map(\.summary).joined().contains("not set up"))
  }

  func testPrecheckIsTheWebAppsRule() {
    XCTAssertNil(Stretch.precheck("Count the rows in survey.csv", files: [("survey.csv", 2_000)]))
    // The files a request names, together, past three contexts (131,072 tokens at 4 bytes each).
    let big = 3 * 131_072 * 4 + 8
    XCTAssertEqual(Stretch.precheck("Summarize data/minutes.txt", files: [("data/minutes.txt", big)]), .bigFiles)
    XCTAssertNil(Stretch.precheck("Summarize minutes.pdf", files: [("minutes.pdf", big)]), "a PDF's bytes are not its words")
    XCTAssertNil(Stretch.precheck("Summarize the minutes", files: [("minutes.txt", big)]), "only files the request names")
    // A long build in many parts.
    let parts = (1...8).map { "\($0). Make part \($0) of the site with its own page, its own data and a short note about it." }.joined(separator: "\n")
    let build = "Build a site for the tenants' union with these parts:\n" + parts + "\n" + String(repeating: "Keep it plain and fast. ", count: 10)
    XCTAssertGreaterThanOrEqual(build.count, 800)
    XCTAssertEqual(Stretch.precheck(build, files: []), .longBuild)
    XCTAssertNil(Stretch.precheck(String(build.prefix(500)), files: []), "too short")
  }

  func testStuckIsWhatCanBeSeen() {
    func step(_ id: String, _ status: Step.Status) -> Step { Step(id: id, tool: "shell", words: Words(icon: .run, verb: "Ran", object: "x"), status: status, started: .now) }
    var t = Turn(id: "t", request: "x", at: .now, status: .done)
    XCTAssertNil(Stretch.stuck(t))
    t.steps = [step("a", .failed), step("b", .failed), step("c", .failed)]
    XCTAssertEqual(Stretch.stuck(t), .tools)
    t.steps = [step("a", .failed), step("b", .done), step("c", .failed)]
    XCTAssertNil(Stretch.stuck(t), "not three in a row")
    t.status = .failed
    XCTAssertEqual(Stretch.stuck(t), .error)
    t.error = Problem(text: "It stopped.", detail: "the maximum steps for one request")
    XCTAssertEqual(Stretch.stuck(t), .budget)
    XCTAssertEqual(StretchReason.longBuild.why, "This is a long build in many parts.")
  }

  func testSettingsArePerFolderAndOffByDefault() throws {
    let suite = "ola-fallbacks-test-\(UUID().uuidString)"
    let d = try XCTUnwrap(UserDefaults(suiteName: suite))
    defer { d.removePersistentDomain(forName: suite) }
    XCTAssertEqual(FallbackSettings.load("/tmp/a", defaults: d), FallbackSettings())
    XCTAssertFalse(FallbackSettings().claude || FallbackSettings().hosted)
    XCTAssertEqual(FallbackSettings().stretch, .suggest)
    FallbackSettings.save(FallbackSettings(hosted: true, stretch: .handover), for: "/tmp/a", defaults: d)
    XCTAssertEqual(FallbackSettings.load("/tmp/a", defaults: d).hosted, true)
    XCTAssertEqual(FallbackSettings.load("/tmp/b", defaults: d), FallbackSettings(), "another folder keeps its own")
    // The old app-wide Claude switch carries over to a folder with nothing of its own.
    d.set(true, forKey: "ola.claude.enabled")
    XCTAssertTrue(FallbackSettings.load("/tmp/c", defaults: d).claude)
    XCTAssertFalse(FallbackSettings.load("/tmp/a", defaults: d).claude)
  }

  func testHostedStatusFromTheGateway() {
    XCTAssertEqual(HostedStatus.from(usage: nil).unavailable, HostedStatus.unknown)
    XCTAssertEqual(HostedStatus.from(usage: ["tokens_used": 5]).unavailable, HostedStatus.notSetUp)
    let off = HostedStatus.from(usage: ["hosted": ["provider": "Made-up Cloud"], "hosted_month": ["granted": false, "cost_micro_usd": 0]])
    XCTAssertEqual(off.unavailable, HostedStatus.notForYou)
    XCTAssertEqual(off.provider, "Made-up Cloud")
    let on = HostedStatus.from(usage: ["hosted": ["provider": "Made-up Cloud"], "hosted_month": ["granted": true, "cost_micro_usd": 30_000, "cap_micro_usd": 20_000_000]])
    XCTAssertNil(on.unavailable)
    XCTAssertEqual(on.monthLine, "$0.03 of $20.00 this month")
    let spent = HostedStatus.from(usage: ["hosted": ["provider": "Made-up Cloud"], "hosted_month": ["granted": true, "cost_micro_usd": 3_000_000, "cap_micro_usd": 3_000_000]])
    XCTAssertTrue(spent.unavailable?.hasPrefix("You have used this month") == true)
    XCTAssertEqual(FallbackWords.question(.hosted, provider: "Made-up Cloud"), "This may be a stretch for Ola\u{2019}s own model. Hand it to the hosted open model at Made-up Cloud?")
    XCTAssertEqual(FallbackWords.hostedAnswered("Made-up Cloud"), "Answered by the hosted open model at Made-up Cloud, outside Ola.")
  }

  func testTheFoldMarksTheHostedModelsReply() {
    var c = Conversation(sessionID: "s")
    c.startTurn("count the rows")
    c.apply(["type": "session.execution.started", "data": ["sessionID": "s"]])
    XCTAssertEqual(c.turns.last?.engine, .ola)
    c.apply(["type": "session.step.started", "data": ["sessionID": "s", "model": ["id": "hosted", "providerID": "ola"]]])
    XCTAssertEqual(c.turns.last?.engine, .hosted)
    let history: [JSON] = [
      ["id": "u1", "type": "user", "text": "count", "time": ["created": 1]],
      ["id": "a1", "type": "assistant", "model": ["id": "hosted", "providerID": "ola"], "time": ["created": 2], "content": [["type": "text", "text": "37 rows."]]],
      ["id": "u2", "type": "user", "text": "thanks", "time": ["created": 3]],
      ["id": "a2", "type": "assistant", "model": ["id": "general", "providerID": "ola"], "time": ["created": 4], "content": [["type": "text", "text": "[[ola:react thanks]]"]]],
    ]
    XCTAssertEqual(Conversation.turns(fromMessages: history, directory: nil).map(\.engine), [.hosted, .ola])
  }

  // MARK: the store, against a made-up opencode

  final class Fake: @unchecked Sendable {
    let lock = NSLock()
    var calls: [String] = []
    var model = "general"
    var ended = false
    let sid = "ses_hosted1"
    let t0 = Date().timeIntervalSince1970 * 1000
  }

  func makeFake(_ f: Fake) async throws -> (MiniHTTPServer, ServerConfig) {
    let s = try MiniHTTPServer(host: "127.0.0.1", port: 0) { req, res in
      let (sid, t0) = (f.sid, f.t0)
      func json(_ j: JSON) async { await res.send(200, j.data) }
      if req.method == "POST" { f.lock.withLock { f.calls.append("\(req.path) \(String(decoding: req.body, as: UTF8.self))") } }
      switch req.path {
      case "/api/info": await json(["version": "2.3.0"])
      case "/api/session":
        await json(["data": [["id": .string(sid), "title": "Hosted test", "time": ["created": .number(t0), "updated": .number(t0)], "location": ["directory": "/tmp/p"]]]])
      case "/api/session/active": await json(["data": .object(f.lock.withLock { f.ended } ? [:] : [:])])
      case "/api/model":
        await json(["data": [["providerID": "ola", "id": "general", "name": "General"], ["providerID": "ola", "id": "hosted", "name": "Hosted"]]])
      case "/api/model/default": await json(["data": ["providerID": "ola", "id": "general", "name": "General"]])
      case "/api/session/\(sid)": await json(["data": ["id": .string(sid), "title": "Hosted test", "time": ["created": .number(t0), "updated": .number(t0)], "location": ["directory": "/tmp/p"]]])
      case "/api/session/\(sid)/permission": await json(["data": []])
      case "/api/session/\(sid)/message": await json(["data": []])
      case "/api/session/\(sid)/model":
        let m = JSON.parse(req.body)?["model"]["id"].str ?? ""
        f.lock.withLock { f.model = m }
        await json(["data": true])
      case "/api/session/\(sid)/prompt": await json(["data": true])
      case "/api/event":
        _ = await res.head(200, ["Content-Type": "text/event-stream"])
        _ = await res.write(Data("data: {\"type\":\"server.connected\",\"data\":{}}\n\n".utf8))
        // Once the prompt is in: the run, its step on the model the session has, its reply, its end.
        while !f.lock.withLock({ f.calls.contains { $0.contains("/prompt") } }) { try? await Task.sleep(nanoseconds: 50_000_000) }
        let m = f.lock.withLock { f.model }
        for e in [
          "{\"type\":\"session.execution.started\",\"data\":{\"sessionID\":\"\(sid)\"}}",
          "{\"type\":\"session.step.started\",\"data\":{\"sessionID\":\"\(sid)\",\"model\":{\"id\":\"\(m)\",\"providerID\":\"ola\"}}}",
          "{\"type\":\"session.text.ended\",\"data\":{\"sessionID\":\"\(sid)\",\"assistantMessageID\":\"a1\",\"text\":\"There are 37 rows.\"}}",
          "{\"type\":\"session.execution.succeeded\",\"data\":{\"sessionID\":\"\(sid)\"}}",
        ] { _ = await res.write(Data("data: \(e)\n\n".utf8)) }
        f.lock.withLock { f.ended = true }
        while true { try? await Task.sleep(nanoseconds: 300_000_000); _ = await res.write(Data(": heartbeat\n\n".utf8)) }
      default: await res.json(404, "no")
      }
    }
    let port = try await s.start()
    return (s, ServerConfig(url: URL(string: "http://127.0.0.1:\(port)")!, password: "pw"))
  }

  func testAHostedRunSwitchesTheModelForOneRequestAndBack() async throws {
    let f = Fake()
    let (server, config) = try await makeFake(f)
    defer { server.stop() }
    let store = OlaStore(config: config)
    store.start()
    for _ in 0..<50 where store.connection != .open || store.sessions.isEmpty { try await Task.sleep(nanoseconds: 100_000_000) }
    store.selectedID = f.sid
    for _ in 0..<50 where store.conversation == nil { try await Task.sleep(nanoseconds: 100_000_000) }
    XCTAssertEqual(store.gatewayModels.map(\.modelID), ["general"], "the model menu never offers the hosted model")
    // Not set up here: one sentence, nothing sent.
    await store.send("/hosted count the rows")
    XCTAssertEqual(store.problem?.text, HostedStatus.notSetUp)
    XCTAssertTrue(f.lock.withLock { f.calls.isEmpty })
    // Set up: the door opens for this run only.
    store.hosted = HostedStatus(unavailable: nil, provider: "Made-up Cloud")
    let armed = Armed()
    store.hostedArm = { armed.log.append($0) }
    await store.send("/hosted count the rows")
    for _ in 0..<80 where !(store.conversation?.turns.last.map { $0.status == .done } ?? false) || store.hostedRunning(f.sid) { try await Task.sleep(nanoseconds: 100_000_000) }
    let t = try XCTUnwrap(store.conversation?.turns.last)
    XCTAssertEqual(t.request, "count the rows", "the command word is never sent")
    XCTAssertEqual(t.engine, .hosted)
    XCTAssertEqual(t.shownAnswer, "There are 37 rows.")
    let calls = f.lock.withLock { f.calls }
    XCTAssertEqual(calls.count, 3, calls.joined(separator: "\n"))
    XCTAssertTrue(calls[0].contains("/model") && calls[0].contains("\"hosted\""), calls[0])
    XCTAssertTrue(calls[1].contains("/prompt") && calls[1].contains("count the rows") && !calls[1].contains("/hosted"), calls[1])
    XCTAssertTrue(calls[2].contains("/model") && calls[2].contains("\"general\""), "back to Ola's model: \(calls[2])")
    XCTAssertEqual(armed.log, [true, false])
  }

  final class Armed { var log: [Bool] = [] }

  func testTheCardFollowsTheSetting() async throws {
    let store = OlaStore(fixture: Fixture.main)
    store.hosted = HostedStatus(unavailable: nil, provider: "Made-up Cloud")
    XCTAssertEqual(store.plan(.longBuild, sessionID: "x"), .suggest(.hosted, [.hosted]), "the card shows even with the switch off")
    store.fallbacks.stretch = .never
    XCTAssertEqual(store.plan(.longBuild, sessionID: "x"), .nothing)
    store.fallbacks = FallbackSettings(hosted: true, stretch: .handover)
    XCTAssertEqual(store.plan(.longBuild, sessionID: "x"), .handover(.hosted))
    store.fallbacks = FallbackSettings(hosted: false, stretch: .handover)
    XCTAssertEqual(store.plan(.longBuild, sessionID: "x"), .suggest(.hosted, [.hosted]), "handover with nothing on asks")
    store.hosted = HostedStatus(unavailable: HostedStatus.notSetUp)
    XCTAssertEqual(store.plan(.longBuild, sessionID: "x"), .nothing, "nothing set up here: no card")
    // Not now: not asked again for the same reason in that conversation.
    store.hosted = HostedStatus(unavailable: nil, provider: "Made-up Cloud")
    store.fallbacks = FallbackSettings()
    store.suggestion = StretchSuggestion(sessionID: "x", request: "r", reason: .longBuild, target: .hosted, offers: [.hosted], turnID: "t1")
    await store.answerSuggestion(.notNow)
    XCTAssertNil(store.suggestion)
    XCTAssertEqual(store.plan(.longBuild, sessionID: "x"), .nothing)
    XCTAssertEqual(store.plan(.tools, sessionID: "x"), .suggest(.hosted, [.hosted]))
  }
}

/// The model door lets a request for the hosted model through only while the app hands one over.
final class DoorHostedGateTests: XCTestCase {
  func testTheDoorRefusesTheHostedModelUnlessOpened() async throws {
    let stub = StubOla()
    try await stub.start()
    defer { stub.stop() }
    let api = AccountAPI(base: stub.base, session: URLSession(configuration: .ephemeral))
    let s = try await api.login(handle: "bart", password: "right password here", deviceName: "Mac", kind: "mac")
    let door = ModelDoor(api: api) { s.token }
    try await door.start()
    defer { door.stop() }
    func chat(_ model: String) async throws -> Int {
      var r = URLRequest(url: door.url.appendingPathComponent("v1/chat/completions"))
      r.httpMethod = "POST"
      r.setValue("Bearer \(door.key)", forHTTPHeaderField: "Authorization")
      r.setValue("application/json", forHTTPHeaderField: "Content-Type")
      r.httpBody = JSON.object(["model": .string(model), "stream": true, "messages": [["role": "user", "content": "hi"]]]).data
      let (_, res) = try await URLSession(configuration: .ephemeral).data(for: r)
      return (res as? HTTPURLResponse)?.statusCode ?? 0
    }
    let before = stub.lock.withLock { stub.gatewayPaths.count }
    let refused = try await chat("hosted")
    XCTAssertEqual(refused, 403)
    XCTAssertEqual(stub.lock.withLock { stub.gatewayPaths.count }, before, "a refused request reached the server")
    let everyday = try await chat("general")
    XCTAssertEqual(everyday, 200)
    let open = Flag()
    door.allowHosted = { open.on }
    open.on = true
    let allowed = try await chat("hosted")
    XCTAssertEqual(allowed, 200)
  }

  final class Flag: @unchecked Sendable { var on = false }
}
