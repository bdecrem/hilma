import Foundation
import XCTest
@testable import OlaKit

/// Which engine made each file (OLA-224): the record (workspace/ola-db made-by, through the app's
/// own copy), the words, the note the open model reads, and a Claude turn (a stand-in for Claude
/// Code, no request spent) recorded, shown and told. Made-up files in a scratch folder only.
@MainActor
final class MadeByTests: XCTestCase {
  static let workspace = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../../../workspace").standardizedFileURL

  func scratch(_ name: String) throws -> (folder: URL, tools: URL) {
    let base = FileManager.default.temporaryDirectory.appendingPathComponent("ola-madeby-\(name)-\(getpid())")
    try? FileManager.default.removeItem(at: base)
    let folder = base.appendingPathComponent("project"), tools = base.appendingPathComponent("tools")
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    LocalServer.webToolsSource = Self.workspace
    XCTAssertTrue(LocalServer.installWebTools(into: tools) || FileManager.default.isExecutableFile(atPath: tools.appendingPathComponent("ola-db").path))
    XCTAssertTrue(FileManager.default.isExecutableFile(atPath: tools.appendingPathComponent("ola-made-by").path), "ola-made-by is one of the app's commands")
    return (folder, tools)
  }

  func testTheRecordSaysWhichEngineMadeEachFile() async throws {
    let (folder, tools) = try scratch("record")
    let r = LocalMadeBy(folder: folder, tools: tools)
    await r.begin(turn: "t1", engine: .ola, model: "general", session: "s1")
    try "<p>hi</p>".write(to: folder.appendingPathComponent("index.html"), atomically: true, encoding: .utf8)
    let first = await r.end(turn: "t1", model: nil, interrupted: false)
    XCTAssertEqual(first, ["index.html"])
    try await Task.sleep(nanoseconds: 1_100_000_000)
    await r.begin(turn: "t2", engine: .claude, model: nil, session: "s1")
    try "<p>hello, rewritten</p>".write(to: folder.appendingPathComponent("index.html"), atomically: true, encoding: .utf8)
    // Ola quits mid-turn: the next launch ends it, and the change is still Claude's.
    let stale = await r.endStale()
    XCTAssertEqual(stale["t2"], ["index.html"])
    let last = await r.lastChanges()
    XCTAssertEqual(last.first?.engine, "claude")
    XCTAssertEqual(last.first?.interrupted, 1)
    let all = await r.entries(session: "s1")
    XCTAssertEqual(all.map(\.engine), ["ola", "claude"])
    XCTAssertEqual(all.map(\.how), ["created", "changed"])
    // What the agent reads: names the engine, and never "you".
    let out = shell(tools.appendingPathComponent("ola-made-by").path, ["index.html"], folder: folder, tools: tools)
    XCTAssertTrue(out.contains("changed by Claude"), out)
    XCTAssertTrue(out.contains("created by Ola's own open model (model general)"), out)
    XCTAssertTrue(shell(tools.appendingPathComponent("ola-made-by").path, ["nothing.txt"], folder: folder, tools: tools).contains("Say you do not know"))
    // Names and times only: no file contents in the database.
    let db = try Data(contentsOf: folder.appendingPathComponent("project.db"))
    XCTAssertNil(db.range(of: Data("rewritten".utf8)), "the record never holds what is in a file")
  }

  /// OLA-303 check #5, Nov 22 (Mac 0.1 (32), Ola on the Mac): the gateway served 41 of the page's 44
  /// steps with the design model, the Mac recorded the page as `general`, and Ola answered "I made it
  /// ... created by this model (general)". The record now asks the model connection which name served
  /// each change, as the cloud's front desk does.
  func testOnTheMacTheDesignModelIsNamedForTheChangesItMade() async throws {
    let (folder, tools) = try scratch("design")
    let r = LocalMadeBy(folder: folder, tools: tools)
    let asked = Asked()
    // The made-up model connection: design steps until a moment ago, in this conversation.
    r.served = { sid, since in
      await asked.add(sid, since)
      let now = Date().timeIntervalSince1970 * 1000
      return ServedSteps(steps: [.init(at: now - 4000, session: "ses_a", name: "general"), .init(at: now - 500, session: "ses_a", name: "design")], designModel: "thinkingmachines/Inkling-2-Small")
    }
    await r.begin(turn: "t1", engine: .ola, model: "general", session: "ses_a")
    try "<h1>Block party</h1>".write(to: folder.appendingPathComponent("index.html"), atomically: true, encoding: .utf8)
    let ended = await r.end(turn: "t1", model: nil, interrupted: false)
    XCTAssertEqual(ended, ["index.html"])
    let calls = await asked.calls
    XCTAssertEqual(calls.map(\.0), ["ses_a"], "asked once, for this conversation")
    XCTAssertLessThan(Double(calls[0].1), Date().timeIntervalSince1970 * 1000 - 14 * 60 * 1000, "steps from a while before the turn began")
    let afterDesign = await r.lastChanges()
    XCTAssertEqual(afterDesign.first?.model, "design:thinkingmachines/Inkling-2-Small")
    let out = shell(tools.appendingPathComponent("ola-made-by").path, ["index.html"], folder: folder, tools: tools)
    XCTAssertTrue(out.contains("Inkling-2-Small, an outside open model that Ola uses for design work (not Ola's own model)"), out)
    XCTAssertFalse(out.contains("(model general)"), out)

    // Ola's own model made the next change: no model is put on it.
    r.served = { _, _ in ServedSteps(steps: [.init(at: Date().timeIntervalSince1970 * 1000 - 300, session: "ses_a", name: "general")], designModel: "x/Inkling-2-Small") }
    try await Task.sleep(nanoseconds: 1_100_000_000)
    await r.begin(turn: "t2", engine: .ola, model: "general", session: "ses_a")
    try "<h1>Block party, Saturday</h1>".write(to: folder.appendingPathComponent("index.html"), atomically: true, encoding: .utf8)
    _ = await r.end(turn: "t2", model: nil, interrupted: false)
    let afterOwn = await r.lastChanges()
    XCTAssertEqual(afterOwn.first?.model, "general")
    // A model connection that cannot be asked names no model: never a guess.
    r.served = { _, _ in nil }
    try await Task.sleep(nanoseconds: 1_100_000_000)
    await r.begin(turn: "t3", engine: .ola, model: "general", session: "ses_a")
    try "<h1>Block party, 2 pm</h1>".write(to: folder.appendingPathComponent("index.html"), atomically: true, encoding: .utf8)
    _ = await r.end(turn: "t3", model: nil, interrupted: false)
    let afterNone = await r.lastChanges()
    XCTAssertEqual(afterNone.first?.model, "general")
  }

  /// The rule, as the cloud's (frontdesk/madeby.mjs attributeChange): the last step at or before the change.
  func testWhichStepMadeAChange() {
    let s = ServedSteps(steps: [.init(at: 1000, session: "a", name: "design"), .init(at: 9000, session: "a", name: "general"),
                                .init(at: 20000, session: "a", name: "design"), .init(at: 21000, session: "b", name: "general")], designModel: "t/Inkling-2-Small")
    XCTAssertEqual(MadeByAttribution.model(for: 2000, session: "a", served: s), "design:t/Inkling-2-Small")
    XCTAssertNil(MadeByAttribution.model(for: 9500, session: "a", served: s), "Ola's own model's step")
    XCTAssertEqual(MadeByAttribution.model(for: 8500, session: "a", served: s), nil, "within the clock slack of the general step")
    XCTAssertEqual(MadeByAttribution.model(for: 21500, session: "a", served: s), "unknown", "two conversations a second apart, one design")
    XCTAssertNil(MadeByAttribution.model(for: -100, session: "a", served: s), "no step before it (beyond the clock slack)")
    XCTAssertEqual(MadeByAttribution.designModel(nil), "design:thinkingmachines/Inkling-2-Small")
    let j = JSON.parse(#"{"object":"served","caller":"p-16","names":{"design":41,"general":3},"design_model":"thinkingmachines/Inkling-2-Small","steps":[[1763832480000,"ses_x","design"],[1,"",""],["bad"]]}"#)!
    XCTAssertEqual(ServedSteps.parse(j), ServedSteps(steps: [.init(at: 1763832480000, session: "ses_x", name: "design"), .init(at: 1, session: "", name: "")], designModel: "thinkingmachines/Inkling-2-Small"))
    XCTAssertNil(ServedSteps.parse(["error": "x"]))
  }

  /// The Mac's notes say what the cloud's say about design work, word for word (OLA-303).
  func testTheMacNotesNameTheDesignModelAsTheCloudsDo() throws {
    let agents = try String(contentsOf: Self.workspace.appendingPathComponent("AGENTS.md"), encoding: .utf8)
    XCTAssertTrue(agents.contains(AgentNotes.designWork), "workspace/AGENTS.md and AgentNotes.designWork differ")
    XCTAssertTrue(AgentNotes.opencode.contains(AgentNotes.designWork))
    // And about questions before making something (check #5's try 1: four questions, no page).
    XCTAssertTrue(agents.contains(AgentNotes.questions), "workspace/AGENTS.md and AgentNotes.questions differ")
    XCTAssertTrue(AgentNotes.opencode.contains(AgentNotes.questions))
  }

  /// The door passes opencode's conversation id on (the gateway keeps which model served it by it).
  func testTheDoorPassesTheConversationID() {
    XCTAssertTrue(ModelDoor.isSessionID("ses_1a2B-x"))
    XCTAssertFalse(ModelDoor.isSessionID(""))
    XCTAssertFalse(ModelDoor.isSessionID("ses 1"))
    XCTAssertFalse(ModelDoor.isSessionID("ses_é"))
    XCTAssertFalse(ModelDoor.isSessionID(String(repeating: "a", count: 81)))
    XCTAssertEqual(ModelDoor.sessionHeaders, ["x-session-id", "x-session-affinity"])
  }

  func testWords() {
    let e = MadeByEntry(path: "index.html", how: "changed", engine: "claude", at: "2026-11-20T06:49:15Z")
    XCTAssertTrue(MadeByWords.file(e, now: e.date!).hasPrefix("Last changed by Claude, "), MadeByWords.file(e, now: e.date!))
    XCTAssertTrue(MadeByWords.file(e, now: e.date!).hasSuffix("pm") || MadeByWords.file(e, now: e.date!).hasSuffix("am"))
    let step = Step(id: "s", tool: "edit", words: Plain.describeTool("edit", input: ["path": "index.html"], dir: nil), status: .done, started: .now)
    XCTAssertEqual(MadeByWords.step(step, by: .claude).map { $0 + " " + step.object }, "Claude changed index.html")
    XCTAssertEqual(MadeByWords.turn(["index.html", "site/sun.svg"], by: .hosted), "The hosted open model changed index.html and sun.svg.")
  }

  func testTheNoteTellsTheOpenModelWhatOthersDidAndIsNotShown() {
    var t1 = Turn(id: "a", request: "make a page", at: Date(timeIntervalSince1970: 1), status: .done, engine: .ola)
    t1.changed = ["index.html"]
    var t2 = Turn(id: "b", request: "make it beautiful", at: Date(timeIntervalSince1970: 2), status: .stopped, engine: .claude)
    t2.changed = ["index.html", "site/a.css"]
    XCTAssertNil(EngineNote.note(for: [t1], target: .ola), "nothing to tell when Ola answered last")
    let note = EngineNote.note(for: [t1, t2], target: .ola) ?? ""
    XCTAssertTrue(note.hasPrefix("<ola-engines>") && note.contains("Claude, asked \"make it beautiful\", changed index.html, site/a.css (it was stopped"), note)
    XCTAssertTrue(note.contains("never say you did their work"))
    XCTAssertEqual(EngineNote.strip(note + "who made index.html?"), "who made index.html?")
    XCTAssertEqual(EngineNote.strip("plain request"), "plain request")
    // The history opencode keeps shows the person's words only.
    let history: [JSON] = [["id": "m1", "type": "user", "text": .string(note + "who made it?"), "time": ["created": 5]]]
    XCTAssertEqual(Conversation.turns(fromMessages: history, directory: nil).first?.request, "who made it?")
  }

  /// Cloud: the app sends the person's words, the front desk puts its note in front (frontdesk/madeby.mjs
  /// engineNote, copied here byte for byte), and opencode echoes the noted text on the stream and in
  /// the history. Neither shows the note, and the echo still matches the turn the app started.
  func testTheCloudNoteIsNotShown() {
    let note = "<ola-engines>Before this request, other engines worked in this conversation (not you): Claude, asked \"make it beautiful\", changed index.html. Never say you did their work; ola-made-by <file> shows who made a file.</ola-engines>\n\n"
    var c = Conversation(sessionID: "ses_1", directory: nil)
    c.startTurn("who made index.html?")
    c.apply(["type": "session.inbox.enqueued", "data": ["sessionID": "ses_1", "inboxID": "in_1", "item": ["type": "user", "payload": ["text": .string(note + "who made index.html?")]]]])
    XCTAssertEqual(c.turns.count, 1, "the echo is the turn the app started, not a second one")
    XCTAssertEqual(c.turns.first?.id, "in_1")
    XCTAssertEqual(c.turns.first?.request, "who made index.html?")
    // Sent from another device (the website): shown without the note too.
    c.apply(["type": "session.inbox.enqueued", "data": ["sessionID": "ses_1", "inboxID": "in_2", "item": ["type": "user", "payload": ["text": .string(note + "and the css?")]]]])
    XCTAssertEqual(c.turns.last?.request, "and the css?")
    let history: [JSON] = [["id": "m1", "type": "user", "text": .string(note + "who made index.html?"), "time": ["created": 5]]]
    XCTAssertEqual(Conversation.turns(fromMessages: history, directory: nil).first?.request, "who made index.html?")
  }

  func testAssignByTurnAndTime() {
    var turns = [Turn(id: "x", request: "a", at: Date(timeIntervalSince1970: 100), status: .done, engine: .ola),
                 Turn(id: "claude-1", request: "b", at: Date(timeIntervalSince1970: 200), status: .done, engine: .claude),
                 Turn(id: "y", request: "c", at: Date(timeIntervalSince1970: 300), status: .done, engine: .ola)]
    MadeByTurns.assign([MadeByEntry(path: "a.txt", how: "created", engine: "ola", turn: "oc-1", at: "1970-01-01T00:02:30Z"),
                        MadeByEntry(path: "b.txt", how: "created", engine: "claude", turn: "claude-1", at: "1970-01-01T00:03:20Z"),
                        MadeByEntry(path: "c.txt", how: "created", engine: "ola", turn: "oc-2", at: "1970-01-01T00:05:10Z")], to: &turns)
    XCTAssertEqual(turns.map { $0.changed ?? [] }, [["a.txt"], ["b.txt"], ["c.txt"]])
  }

  // MARK: a Claude turn in the store, end to end

  final class Fake: @unchecked Sendable {
    let lock = NSLock()
    var prompts: [String] = []
    let sid = "ses_madeby1"
    let t0 = Date().timeIntervalSince1970 * 1000
    var dir = ""
  }

  func serve(_ f: Fake) async throws -> (MiniHTTPServer, Int) {
    let s = try MiniHTTPServer(host: "127.0.0.1", port: 0) { req, res in
      let (sid, t0, dir) = (f.sid, f.t0, f.dir)
      func json(_ j: JSON) async { await res.send(200, j.data) }
      let session: JSON = ["id": .string(sid), "title": "Made by", "time": ["created": .number(t0), "updated": .number(t0)], "location": ["directory": .string(dir)]]
      switch req.path {
      case "/api/info": await json(["version": "2.3.0"])
      case "/api/session": await json(["data": [session]])
      case "/api/session/active": await json(["data": [:]])
      case "/api/model": await json(["data": [["providerID": "ola", "id": "general", "name": "General"]]])
      case "/api/model/default": await json(["data": ["providerID": "ola", "id": "general", "name": "General"]])
      case "/api/session/\(sid)": await json(["data": session])
      case "/api/session/\(sid)/permission", "/api/session/\(sid)/message": await json(["data": []])
      case "/api/session/\(sid)/prompt":
        f.lock.withLock { f.prompts.append(JSON.parse(req.body)?["text"].str ?? "") }
        await json(["data": true])
      case "/api/event":
        _ = await res.head(200, ["Content-Type": "text/event-stream"])
        _ = await res.write(Data("data: {\"type\":\"server.connected\",\"data\":{}}\n\n".utf8))
        while true { try? await Task.sleep(nanoseconds: 300_000_000); _ = await res.write(Data(": heartbeat\n\n".utf8)) }
      default: await res.json(404, "no")
      }
    }
    return (s, Int(try await s.start()))
  }

  func testAClaudeTurnIsRecordedShownAndToldToOla() async throws {
    let (folder, tools) = try scratch("store")
    let f = Fake()
    f.dir = folder.path
    let (s, port) = try await serve(f)
    defer { s.stop() }

    // Claude Code's stand-in: says its model, writes index.html with its Write tool, answers.
    let fake = folder.deletingLastPathComponent().appendingPathComponent("claude")
    try """
    #!/bin/bash
    read -r first
    echo '{"type":"system","subtype":"init","model":"claude-stand-in"}'
    echo '{"type":"assistant","message":{"id":"m1","content":[{"type":"tool_use","id":"t1","name":"Write","input":{"file_path":"index.html","content":"x"}}]}}'
    echo '<p>Claude was here</p>' > index.html
    echo '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":"ok"}]}}'
    echo '{"type":"assistant","message":{"id":"m2","content":[{"type":"text","text":"I rewrote index.html."}]}}'
    echo '{"type":"result","subtype":"success","result":"I rewrote index.html."}'
    while read -r line; do :; done
    """.write(to: fake, atomically: true, encoding: .utf8)
    chmod(fake.path, 0o755)

    let store = OlaStore(config: ServerConfig(url: URL(string: "http://127.0.0.1:\(port)")!, password: "pw"))
    let base = folder.deletingLastPathComponent().appendingPathComponent("support")
    store.claudeTurnsBase = base
    store.madeBy = LocalMadeBy(folder: folder, tools: tools)
    store.claudeUnavailable = nil
    store.claudeLauncher = { _, request, context in
      let r = ClaudeRunner(binary: fake, folder: folder, request: request, context: context)
      r.goesAhead = { _, _ in true }
      return r
    }
    store.start()
    for _ in 0..<50 where store.connection != .open || store.sessions.isEmpty { try await Task.sleep(nanoseconds: 100_000_000) }
    store.selectedID = f.sid
    for _ in 0..<50 where store.conversation == nil { try await Task.sleep(nanoseconds: 100_000_000) }

    await store.askClaude("make the page beautiful")
    for _ in 0..<100 where store.conversation?.turns.last?.changed == nil || store.madeByFiles.isEmpty || ClaudeTurns.load(f.sid, base: base).last?.changed == nil { try await Task.sleep(nanoseconds: 100_000_000) }
    let t = try XCTUnwrap(store.conversation?.turns.last)
    XCTAssertEqual(t.engine, .claude)
    XCTAssertEqual(t.changed, ["index.html"], "the turn knows what it changed")
    XCTAssertEqual(store.madeByFiles["index.html"]?.engine, "claude")
    XCTAssertEqual(store.madeByFiles["index.html"]?.model, "claude-stand-in", "the model Claude said it was")
    XCTAssertEqual(t.steps.first.flatMap { MadeByWords.step($0, by: t.engine) }, "Claude wrote")
    XCTAssertEqual(ClaudeTurns.load(f.sid, base: base).last?.changed, ["index.html"], "kept with the turn on disk")

    // The next request to Ola carries what Claude did, and the person's words are shown alone.
    await store.sendToOla("who made index.html?")
    let sent = f.lock.withLock { f.prompts.last } ?? ""
    XCTAssertTrue(sent.hasPrefix("<ola-engines>") && sent.contains("Claude, asked \"make the page beautiful\", changed index.html"), sent)
    XCTAssertTrue(sent.hasSuffix("who made index.html?"))
    XCTAssertEqual(store.conversation?.turns.last?.request, "who made index.html?")
  }

  func testAClaudeTurnTheAppQuitDuringIsKept() async throws {
    let (folder, _) = try scratch("stale")
    let base = folder.deletingLastPathComponent().appendingPathComponent("support")
    // What the app had saved when it quit: Claude working, one step running.
    var t = Turn(id: "claude-x", request: "rewrite the page", at: .now, status: .working, engine: .claude)
    t.steps = [Step(id: "s1", tool: "write", words: Plain.describeTool("write", input: ["path": "index.html"], dir: nil), status: .running, started: .now)]
    let f = Fake()
    f.dir = folder.path
    ClaudeTurns.save([t], session: f.sid, base: base)
    let (s, port) = try await serve(f)
    defer { s.stop() }
    let store = OlaStore(config: ServerConfig(url: URL(string: "http://127.0.0.1:\(port)")!, password: "pw"))
    store.claudeTurnsBase = base
    store.start()
    for _ in 0..<50 where store.connection != .open || store.sessions.isEmpty { try await Task.sleep(nanoseconds: 100_000_000) }
    store.selectedID = f.sid
    for _ in 0..<50 where store.conversation?.turns.isEmpty ?? true { try await Task.sleep(nanoseconds: 100_000_000) }
    let shown = try XCTUnwrap(store.conversation?.turns.first)
    XCTAssertEqual(shown.request, "rewrite the page", "the turn is still in the conversation")
    XCTAssertEqual(shown.status, .stopped)
    XCTAssertEqual(shown.error?.text, "Ola closed while Claude was working, so Claude stopped. What it changed is kept.")
    XCTAssertEqual(ClaudeTurns.load(f.sid, base: base).first?.status, .stopped, "and saved that way")
  }

  func shell(_ cmd: String, _ args: [String], folder: URL, tools: URL) -> String {
    let p = Process()
    p.executableURL = URL(fileURLWithPath: cmd)
    p.arguments = args
    p.currentDirectoryURL = folder
    var env = ProcessInfo.processInfo.environment
    env["OLA_WORK"] = folder.path
    env["OLA_LIB"] = tools.path
    env["PATH"] = tools.path + ":/usr/bin:/bin"
    p.environment = env
    let out = Pipe()
    p.standardOutput = out
    p.standardError = out
    try? p.run()
    let d = out.fileHandleForReading.readDataToEndOfFile()
    p.waitUntilExit()
    return String(decoding: d, as: UTF8.self)
  }
}

/// What the made-up model connection was asked.
actor Asked {
  var calls: [(String, Int)] = []
  func add(_ s: String, _ since: Int) { calls.append((s, since)) }
}
