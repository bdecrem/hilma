import Foundation
import XCTest
@testable import OlaKit

/// A run whose end the client never hears about must still end up shown finished, within 15 s:
/// (a) the relay's upstream stream is killed mid-run; (b) the client's stream goes silent (as a
/// suspended phone's would) while the run finishes. A fake opencode behind the real Mac relay.
@MainActor
final class StreamDropTests: XCTestCase {
  /// The fake server's state: one session, running until `finished`.
  final class Fake: @unchecked Sendable {
    let lock = NSLock()
    var finished = false
    var killStreams = false
    var silent = false
    var streams = 0
    let sid = "ses_test1"
    let t0 = Date().timeIntervalSince1970 * 1000
  }

  func makeFake(_ f: Fake) async throws -> (MiniHTTPServer, ServerConfig) {
    let s = try MiniHTTPServer(host: "127.0.0.1", port: 0) { req, res in
      let (finished, sid, t0) = f.lock.withLock { (f.finished, f.sid, f.t0) }
      func json(_ j: JSON) async { await res.send(200, j.data) }
      switch req.path {
      case "/api/info": await json(["version": "2.3.0"])
      case "/api/session":
        await json(["data": [["id": .string(sid), "title": "Drop test", "time": ["created": .number(t0), "updated": .number(t0)], "location": ["directory": "/tmp/p"]]]])
      case "/api/session/active": await json(["data": .object(finished ? [:] : [sid: ["type": "running"]])])
      case "/api/model", "/api/model/default": await json(["data": []])
      case "/api/session/\(sid)": await json(["data": ["id": .string(sid), "title": "Drop test", "time": ["created": .number(t0), "updated": .number(t0)], "location": ["directory": "/tmp/p"]]])
      case "/api/session/\(sid)/permission": await json(["data": []])
      case "/api/session/\(sid)/message":
        var msgs: [JSON] = [["id": "m1", "type": "user", "text": "make it", "time": ["created": .number(t0 + 1)]]]
        if finished {
          msgs.append(["id": "m2", "type": "assistant", "time": ["created": .number(t0 + 2)], "content": [
            ["type": "tool", "id": "c1", "name": "write", "state": ["status": "completed", "input": ["path": "/tmp/p/cat.svg"], "content": [["type": "text", "text": "ok"]]], "time": ["created": .number(t0 + 3), "completed": .number(t0 + 4)]],
            ["type": "text", "text": "[[ola:react done]]\nDrew the cat."],
          ]])
          msgs.append(["id": "m3", "type": "idle", "outcome": "succeeded", "time": ["created": .number(t0 + 5)]])
        }
        await json(["data": .array(msgs.reversed())])
      case "/api/event":
        f.lock.withLock { f.streams += 1 }
        _ = await res.head(200, ["Content-Type": "text/event-stream"])
        _ = await res.write(Data("data: {\"type\":\"server.connected\",\"data\":{}}\n\n".utf8))
        _ = await res.write(Data("data: {\"type\":\"session.execution.started\",\"data\":{\"sessionID\":\"\(sid)\"}}\n\n".utf8))
        // Then nothing more about the run; heartbeats unless silent; ends when killed.
        while true {
          try? await Task.sleep(nanoseconds: 300_000_000)
          let (kill, silent) = f.lock.withLock { (f.killStreams, f.silent) }
          if kill { break }
          if !silent { _ = await res.write(Data(": heartbeat\n\n".utf8)) }
        }
        res.end()
      default: await res.json(404, "no")
      }
    }
    let port = try await s.start()
    return (s, ServerConfig(url: URL(string: "http://127.0.0.1:\(port)")!, password: "pw"))
  }

  func run(_ scenario: (Fake) -> Void) async throws -> (Turn.Status?, [String], TimeInterval) {
    let f = Fake()
    let (server, upstream) = try await makeFake(f)
    defer { server.stop() }
    let book = PairingBook(file: nil)
    let secret = PairingCode.newSecret()
    book.add(secret: secret)
    let relay = MacRelay(book: book, macName: "test")
    let port = try await relay.start(host: "127.0.0.1", port: 0)
    defer { relay.stop() }
    relay.setUpstream(upstream, mode: "machine")
    let store = OlaStore(config: PairingCode(host: "127.0.0.1", port: Int(port), secret: secret, name: "test").config)
    // The real interval (12 s): the client must end right within 15 s.
    store.start()
    store.selectedID = f.sid
    // The run is going: shown as working.
    for _ in 0..<50 where store.conversation?.isRunning != true { try await Task.sleep(nanoseconds: 100_000_000) }
    XCTAssertEqual(store.conversation?.isRunning, true, "shown as working")
    let t0 = Date()
    f.lock.withLock { f.finished = true }
    scenario(f)
    while Date().timeIntervalSince(t0) < 15, store.conversation?.turns.last?.status != .done {
      try await Task.sleep(nanoseconds: 200_000_000)
    }
    let t = store.conversation?.turns.last
    return (t?.status, t.map { ResultItem.derive($0).map(\.target) } ?? [], Date().timeIntervalSince(t0))
  }

  func testUpstreamKilledMidRun() async throws {
    let (status, items, secs) = try await run { $0.killStreams = true }
    XCTAssertEqual(status, .done, "finished within 15 s (took \(Int(secs)) s)")
    XCTAssertEqual(items, ["cat.svg"], "with its results")
  }

  func testClientSideGoesSilent() async throws {
    let (status, items, secs) = try await run { $0.silent = true }
    XCTAssertEqual(status, .done, "finished within 15 s (took \(Int(secs)) s)")
    XCTAssertEqual(items, ["cat.svg"])
  }
}
