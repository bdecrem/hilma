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

  /// The simple confidence check (OLA-144): the web app's cases, word for word.
  func testConfidenceCheckManyDocumentsAndDesign() {
    let docs = (1...24).map { (path: "reports/report-\($0).pdf", size: 200_000) }
    XCTAssertEqual(Stretch.precheck("Go through every report and list the landlords named in each", files: docs), .manyFiles)
    XCTAssertEqual(Stretch.precheck("Summarize all the PDFs", files: docs), .manyFiles)
    XCTAssertNil(Stretch.precheck("Summarize all the PDFs", files: Array(docs.prefix(19))), "nineteen documents are not many")
    let eight = docs.prefix(8).map { String($0.path.split(separator: "/").last!) }.joined(separator: ", ")
    XCTAssertEqual(Stretch.precheck("Compare \(eight)", files: Array(docs.prefix(8))), .manyFiles)
    XCTAssertNil(Stretch.precheck("Compare report-1.pdf and report-2.pdf", files: docs), "two files named")
    XCTAssertNil(Stretch.precheck("Design a landing page for the tenants\u{2019} union", files: []), "a design request goes to Ola and the design model, no card (OLA-168)")
    XCTAssertNil(Stretch.precheck("Make a poster for the block party on Saturday", files: []), "a design request goes to Ola and the design model, no card (OLA-168)")
    XCTAssertNil(Stretch.precheck("Build me a personal homepage", files: []), "a design request goes to Ola and the design model, no card (OLA-168)")
    XCTAssertNil(Stretch.precheck("What does the design of this survey miss?", files: []), "asked about, not asked to make")
    XCTAssertNil(Stretch.precheck("Make a chart of answers by city", files: []))
    XCTAssertEqual(StretchReason(rawValue: "many_files"), .manyFiles)
  }

  /// Kept conversations (OLA-159): what is sent for a finished turn, and the switch mark (OLA-157).
  func testKeptTurnBody() {
    let session = SessionInfo(id: "ses_1", title: "Crossword", created: .now, updated: .now)
    let step = Step(id: "a", tool: "write", words: Words(icon: .write, verb: "Wrote", object: "index.html"), status: .done, started: .now)
    var ola = Turn(id: "m1", request: "build me a crossword app", at: Date(timeIntervalSince1970: 1_800_000_000), status: .done, steps: [step], answer: "Here.")
    ola.ended = ola.at.addingTimeInterval(41)
    let a = KeptConversations.body(ola, previous: nil, session: session, runtime: .local, product: "mac", model: "ola/general")
    XCTAssertEqual(a["engine"].str, "ola")
    XCTAssertEqual(a["model"].str, "ola/general")
    XCTAssertEqual(a["seconds"].double, 41)
    XCTAssertEqual(a["steps"].array.first?["words"].str, "Wrote index.html")
    XCTAssertTrue(a["switched_from"].isNull, "the first try is not a switch")
    var claude = Turn(id: "m2", request: "build me a crossword app", at: .now, status: .done, answer: "A working one.")
    claude.engine = .claude
    let b = KeptConversations.body(claude, previous: ola, session: session, runtime: .local, product: "mac", model: "ola/general")
    XCTAssertEqual(b["switched_from"].str, "ola", "Claude after Ola's own model: a switch")
    XCTAssertTrue(b["model"].isNull, "Ola's model name is not Claude's")
    let c = KeptConversations.body(ola, previous: claude, session: session, runtime: .cloud, product: "iphone", model: nil)
    XCTAssertTrue(c["switched_from"].isNull, "back to Ola is not a fallback")
    XCTAssertEqual(c["runtime"].str, "cloud")
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

  /// Bart, 2026-11-17: "hey can you use claude code for this next thing?" got "I can't use Claude
  /// Code" from the everyday model. Now it is the Claude card, and nothing goes to Ola.
  func testAskingForClaudeInPlainWordsShowsTheCard() async throws {
    XCTAssertEqual(ClaudeAsk.detect("hey can you use claude code for this next thing?"), true)
    XCTAssertEqual(ClaudeAsk.detect("Ask Claude to rewrite the intro of letter.md"), false)
    XCTAssertEqual(ClaudeAsk.detect("have Claude do this: count the rows"), false)
    XCTAssertNil(ClaudeAsk.detect("Count the rows in survey.csv"))
    XCTAssertNil(ClaudeAsk.detect("Write a note about Claude Monet's water lilies"))
    let store = OlaStore(fixture: Fixture.main)
    store.claudeUnavailable = "Claude Code is not installed on this Mac."
    await store.send("hey can you use claude code for this next thing?")
    XCTAssertEqual(store.problem?.text, "Claude Code is not installed on this Mac.", "not installed: one plain line")
    XCTAssertNil(store.suggestion)
    store.claudeUnavailable = nil
    store.claudeLauncher = { _, _, _ in throw OlaError.unreachable("not in a test") }
    let before = store.conversation?.turns.count
    await store.send("hey can you use claude code for this next thing?")
    let s = try XCTUnwrap(store.suggestion)
    XCTAssertEqual([s.question, s.whyLine], ["Hand this to Claude Code?", "You asked for Claude Code for your next request. Ola has not started on anything."])
    XCTAssertTrue(s.nextOnly)
    XCTAssertEqual(store.conversation?.turns.count, before, "nothing went to Ola")
    await store.answerSuggestion(.once)
    XCTAssertEqual(store.nextEngine, .claude, "Just this once: the next request goes to Claude")
    XCTAssertTrue(store.nextOnly)
  }

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

  /// OLA-479 on the Mac and the phone: the web app's ESCALATE, the same settings and the same counts.
  func testOlaCountsWhatCanBeSeen() {
    XCTAssertEqual([Escalate.to, "\(Escalate.failedTestRounds)", "\(Escalate.sameSteps)", "\(Escalate.lengthHits)"], ["thinkingmachines/Inkling-2-Small", "2", "3", "2"])
    func step(_ id: String, _ tool: String, _ input: String, _ status: Step.Status = .done) -> Step { Step(id: id, tool: tool, words: Words(icon: .run, verb: "Ran", object: "x"), status: status, input: input, started: .now) }
    var t = Turn(id: "t", request: "make me a tip calculator", at: .now, status: .done)
    XCTAssertNil(Escalate.escalation(t))
    XCTAssertFalse(Escalate.testRan(t))
    t.steps = [step("a", "shell", "ola-test calc.test.js", .failed), step("b", "write", "calc.js"), step("c", "shell", "ola-test calc.test.js", .failed)]
    XCTAssertTrue(Escalate.testRan(t))
    XCTAssertEqual(Escalate.escalation(t), .tests)
    t.steps = [step("a", "shell", "ls"), step("b", "shell", "ls"), step("c", "shell", "ls")]
    XCTAssertEqual(Escalate.escalation(t), .loop)
    t.steps = [step("a", "shell", "ls"), step("b", "shell", "ls"), step("w", "write", "{\"content\":\"x\"}"), step("c", "shell", "ls")]
    XCTAssertNil(Escalate.escalation(t), "a file changed in between")
    t.steps = [step("a", "write", "same"), step("b", "write", "same"), step("c", "write", "same")]
    XCTAssertEqual(Escalate.escalation(t), .loop, "a file written again with the same words counts")
    t.steps = []
    t.cutOff = 2
    XCTAssertEqual(Escalate.escalation(t), .length)
    XCTAssertTrue(Stretch.has(Escalate.computes, "Build a budget spreadsheet for the union"))
    XCTAssertFalse(Stretch.has(Escalate.computes, "Make a page that shows this poem"), "a page that only shows things")
    XCTAssertTrue(Stretch.has(Escalate.test, "python3 test_calc.py"))
    // OLA-474, chk479-b: `ola-test … | tail` exits 0, so ola-test's summary line decides; naming it is not running it.
    let piped = "cd /work && cat > t.test.js <<'EOF'\ncheck('a', 1, 1)\nEOF\nola-test sheet.js t.test.js 2>&1 | tail -10"
    t.cutOff = 0
    func ran(_ id: String, _ output: String) -> Step { Step(id: id, tool: "shell", words: Words(icon: .run, verb: "Ran", object: "x"), status: .done, input: piped, output: output, started: .now) }
    t.steps = [ran("a", "ola-test: ran sheet.js\n  ERROR: sheet.js line 482\n0 passed, 0 failed, 1 error\n"), ran("b", "2 passed, 1 failed\n")]
    XCTAssertTrue(Escalate.testRan(t))
    XCTAssertEqual(Escalate.escalation(t), .tests, "two failed rounds behind a pipe")
    t.steps = [ran("a", "  no check ran\n0 passed, 0 failed\n"), ran("b", "8 passed, 0 failed\n")]
    XCTAssertNil(Escalate.escalation(t), "one failed round then a pass")
    t.steps = [step("a", "shell", "ls -la /work && which ola-test ola-page"), step("b", "shell", "cat /opt/ola/bin/ola-test"), step("c", "shell", "cat > t.py <<'EOF'\nimport unittest\nEOF")]
    XCTAssertFalse(Escalate.testRan(t), "naming ola-test, or a heredoc's words, is not a test")
    XCTAssertEqual(StretchReason.tests.why, "Ola\u{2019}s own model\u{2019}s tests of its work failed 2 times.")
    XCTAssertEqual(StretchReason(rawValue: "untested"), .untested)
  }

  /// OLA-488: a test whose own last line fails reads as a failed step though the command exited 0, live and from the history.
  func testAFailedTestRunIsAFailedStep() {
    let cmd = "cd /work && ola-test calc.js calc.test.js 2>&1 | tail -5"
    let bad = "ola-test: ran calc.js\n  ERROR: calc.js line 12\n0 passed, 0 failed, 1 error\n"
    var c = Conversation(sessionID: "s")
    c.startTurn("make me a tip calculator")
    for (id, out) in [("t1", bad), ("t2", "8 passed, 0 failed\n")] {
      c.apply(["type": "session.tool.input.started", "data": ["sessionID": "s", "id": .string(id), "name": "shell"]])
      c.apply(["type": "session.tool.called", "data": ["sessionID": "s", "id": .string(id), "input": ["command": .string(cmd)]]])
      c.apply(["type": "session.tool.success", "data": ["sessionID": "s", "id": .string(id), "content": [["type": "text", "text": .string(out)]], "metadata": ["exit": 0]]])
    }
    let steps = c.turns.last?.steps ?? []
    XCTAssertEqual(steps.map(\.status), [.failed, .done], "a test that printed an error shows a check mark")
    XCTAssertEqual("\(steps.first?.verb ?? "") \(steps.first?.object ?? "")", "Tested calc.js")
    let turns = Conversation.turns(fromMessages: [
      ["type": "user", "id": "u1", "text": "make me a tip calculator", "time": ["created": 1]],
      ["type": "assistant", "id": "a1", "content": [["type": "tool", "id": "p1", "name": "shell", "state": ["status": "completed", "input": ["command": .string(cmd)], "content": [["type": "text", "text": .string(bad)]], "metadata": ["exit": 0]], "time": ["created": 2]]], "time": ["created": 2]],
    ], directory: nil)
    XCTAssertEqual(turns.first?.steps.first?.status, .failed, "from the stored history too")
  }

  /// OLA-479: after "Not now", Ola's own model finishes the request in a turn marked Ola's.
  func testNotNowHasOlasModelFinish() {
    XCTAssertEqual(Escalate.nudgeOf(Escalate.finish).request, Escalate.finishRequest)
    XCTAssertTrue(Escalate.nudgeOf(Escalate.finish).nudge)
    XCTAssertTrue(Escalate.finish.contains("does not work or was not tested"))
    var c = Conversation(sessionID: "s")
    c.startTurn(Escalate.finish)
    XCTAssertEqual(c.turns.last?.nudge, true)
    XCTAssertEqual(c.turns.last?.request, Escalate.finishRequest)
  }

  func testTheNudgeIsOlasTurnAndCutOffsAreCounted() {
    var c = Conversation(sessionID: "s")
    c.startTurn("make me a tip calculator")
    c.startTurn(Escalate.nudge)
    XCTAssertEqual(c.turns.last?.nudge, true)
    XCTAssertEqual(c.turns.last?.request, "Ola asked its model to run a test of the logic before handing it over.")
    c.apply(["type": "session.inbox.enqueued", "data": ["sessionID": "s", "inboxID": "in2", "item": ["type": "user", "payload": ["text": .string(Escalate.nudge)]]]])
    XCTAssertEqual(c.turns.count, 2, "the server's copy of the nudge is the same turn")
    XCTAssertEqual(c.turns.last?.id, "in2")
    c.apply(["type": "session.step.ended", "data": ["sessionID": "s", "finish": "length"]])
    c.apply(["type": "session.step.ended", "data": ["sessionID": "s", "finish": "stop"]])
    XCTAssertEqual(c.turns.last?.cutOff, 1)
    let turns = Conversation.turns(fromMessages: [
      ["type": "user", "id": "u1", "text": .string(Escalate.nudge), "time": ["created": 1]],
      ["type": "assistant", "id": "a1", "finish": "length", "content": [], "time": ["created": 2]],
    ], directory: nil)
    XCTAssertEqual(turns.first?.nudge, true)
    XCTAssertEqual(turns.first?.cutOff, 1)
  }

  func testWhatOlaCountedGoesOnlyToTheNamedModel() async throws {
    let store = OlaStore(fixture: Fixture.main)
    store.hosted = HostedStatus(unavailable: nil, provider: "Made-up Cloud", model: "some-other/model")
    XCTAssertEqual(store.plan(.tests, sessionID: "x"), .nothing, "never a model the setting does not name")
    store.hosted.model = Escalate.to
    XCTAssertEqual(store.plan(.tests, sessionID: "x"), .suggest(.hosted, [.hosted]))
    store.hostedOn = true
    XCTAssertEqual(store.plan(.loop, sessionID: "x"), .handover(.hosted), "the switch on: it just hands over")
    store.hostedOn = false
    // The nudge's turn, handed over untested again: the card, for the person's own request.
    let id = try XCTUnwrap(store.selectedID)
    store.conversations[id]?.startTurn("make me a tip calculator")
    store.conversations[id]?.startTurn(Escalate.nudge)
    var t = try XCTUnwrap(store.conversations[id]?.turns.last)
    t.status = .done
    await store.afterOlaRun(id, t)
    let s = try XCTUnwrap(store.suggestion)
    XCTAssertEqual([s.request, s.reason.rawValue], ["make me a tip calculator", "untested"])
    // A page that only shows things: untouched.
    store.suggestion = nil
    store.conversations[id]?.startTurn("make a page that shows this poem")
    t = try XCTUnwrap(store.conversations[id]?.turns.last)
    t.status = .done
    await store.afterOlaRun(id, t)
    XCTAssertNil(store.suggestion)
    XCTAssertEqual(store.conversations[id]?.turns.last?.request, "make a page that shows this poem", "no nudge")
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
