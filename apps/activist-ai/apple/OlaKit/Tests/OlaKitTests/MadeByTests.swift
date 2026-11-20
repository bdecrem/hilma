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
