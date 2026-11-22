import Foundation
import XCTest
@testable import OlaKit

/// OLA-250, Nov 22 (Mac 0.1 (33), Ola working on the Mac, "publish it again"): the page went up and
/// the answer showed, then a card "Ola wants to run a command: Run publish.py" came up for a step
/// that had already run (its yes given by the app under Lots of permissions; a second yes for the
/// same request was answered 404 and the app showed the card anyway), the step was shown as "did not
/// finish", and the card's Yes gave "Your answer did not reach the machine. Try again." for good.
/// A card whose request has ended goes away, or says plainly it is no longer needed.
@MainActor
final class StaleCardTests: XCTestCase {
  let sid = "ses_a"

  func ev(_ type: String, _ data: [String: JSON]) -> JSON {
    var d = data
    d["sessionID"] = .string(sid)
    return ["type": .string(type), "data": .object(d)]
  }
  func asked(_ id: String, step: String?, _ command: String) -> JSON {
    var d: [String: JSON] = ["id": .string(id), "action": "shell", "resources": [.string(command)]]
    if let step { d["source"] = ["id": .string(step)] }
    return ev("permission.asked", d)
  }
  func ran(_ step: String, _ command: String) -> [JSON] {
    [ev("session.tool.input.started", ["id": .string(step), "name": "shell"]), ev("session.tool.called", ["id": .string(step), "input": ["command": .string(command)]])]
  }
  func succeeded(_ step: String) -> JSON {
    ev("session.tool.success", ["id": .string(step), "content": [["type": "text", "text": "live: https://sites.ola.cx/bart/ answers with the published page\n"]], "metadata": ["exit": 0]])
  }
  let live = "python3 /Users/x/Library/Ola/skills/publish/scripts/publish.py live https://sites.ola.cx/bart/ --expect site 2>&1"

  func conversation() -> Conversation {
    var c = Conversation(sessionID: sid)
    c.startTurn("publish it again")
    c.apply(ev("session.execution.started", [:]))
    return c
  }

  /// The Nov 22 order: the step ran and ended, then its question arrived (the app's late copy).
  func testAQuestionForAStepThatEndedIsNoCard() {
    var c = conversation()
    for e in ran("call_live", live) { c.apply(e) }
    c.apply(succeeded("call_live"))
    c.apply(asked("per_live", step: "call_live", live))
    XCTAssertNil(c.approval, "a card for a step that already ran")
    XCTAssertEqual(c.turns.last?.steps.first?.status, .done, "the step that ran was put back to waiting")
    c.apply(ev("session.execution.succeeded", [:]))
    XCTAssertEqual(c.turns.last?.steps.first?.status, .done, "a step that ran is shown as 'did not finish'")
  }

  /// A card goes when its step ends, and whatever is left goes when the run ends.
  func testTheCardGoesWhenItsStepOrTheRunEnds() {
    var c = conversation()
    for e in ran("call_1", live) { c.apply(e) }
    c.apply(asked("per_1", step: "call_1", live))
    XCTAssertEqual(c.approval?.id, "per_1")
    XCTAssertEqual(c.turns.last?.steps.first?.status, .waiting)
    c.apply(succeeded("call_1"))
    XCTAssertNil(c.approval, "the step ran: its card is over")

    for e in ran("call_2", "ls") { c.apply(e) }
    c.apply(asked("per_2", step: "call_2", "ls"))
    XCTAssertEqual(c.approval?.id, "per_2")
    c.apply(ev("session.execution.succeeded", [:]))
    XCTAssertNil(c.approval, "the run ended with a card still up")
    XCTAssertNil(c.question)
  }

  // MARK: the store, against a stand-in opencode that answers 404 to a request it no longer has

  final class Stub: @unchecked Sendable {
    let lock = NSLock()
    var pending: [JSON] = []
    var replies: [(String, Int)] = []
    /// The reply status for a request that is still waiting (500: the answer was lost on the way).
    var failWaiting = false
    func add(_ id: String, _ session: String, _ command: String) {
      lock.withLock { pending.append(.object(["id": .string(id), "sessionID": .string(session), "action": "shell", "resources": [.string(command)]])) }
    }
    func reply(_ id: String) -> Int {
      lock.withLock {
        let there = pending.contains { $0["id"].str == id }
        let status = !there ? 404 : failWaiting ? 500 : 200
        if status == 200 { pending.removeAll { $0["id"].str == id } }
        replies.append((id, status))
        return status
      }
    }
    var got: [(String, Int)] { lock.withLock { replies } }
  }

  func stub() async throws -> (MiniHTTPServer, Stub, OlaStore) {
    let st = Stub()
    let s = try MiniHTTPServer(host: "127.0.0.1", port: 0) { req, res in
      let parts = req.path.split(separator: "/").map(String.init)
      if req.method == "GET", parts.count == 4, parts[3] == "permission" {
        let mine = st.lock.withLock { st.pending.filter { $0["sessionID"].str == parts[2] } }
        return await res.send(200, JSON.object(["data": .array(mine)]).data)
      }
      if req.method == "POST", parts.count == 6, parts[5] == "reply" {
        let status = st.reply(parts[4])
        return await res.send(status, Data(status == 200 ? "{}".utf8 : #"{"message":"permission request not found"}"#.utf8))
      }
      if req.method == "GET", parts.count == 4, parts[3] == "message" || parts[3] == "form" { return await res.send(200, Data(#"{"data":[]}"#.utf8)) }
      await res.send(200, Data("{}".utf8))
    }
    let port = try await s.start()
    let store = OlaStore(config: ServerConfig(url: URL(string: "http://127.0.0.1:\(port)")!, password: "pw"))
    store.goesAhead = { action, resources in PermissionSettings.goesAhead(action: action, resources: resources) }
    await store.open(sid)
    store.handle(ev("session.inbox.enqueued", ["inboxID": "inb_1", "item": ["type": "user", "payload": ["text": "publish it again"]]]))
    store.handle(ev("session.execution.started", [:]))
    return (s, st, store)
  }

  func waitFor(_ ok: @escaping @MainActor () -> Bool) async {
    var n = 0
    while !ok(), n < 60 {
      try? await Task.sleep(nanoseconds: 50_000_000)
      n += 1
    }
  }

  /// Lots of permissions "On this Mac": the same question answered twice (the second yes gets 404,
  /// as at 18:26:12.811Z on Nov 22). No card: the request was answered and its step ran.
  func testASecondYesThatFindsTheRequestGoneShowsNoCard() async throws {
    let (server, st, store) = try await stub()
    defer { server.stop() }
    for e in ran("call_live", live) { store.handle(e) }
    st.add("per_live", sid, live)
    store.handle(asked("per_live", step: "call_live", live))
    store.handle(asked("per_live", step: "call_live", live))
    await waitFor { st.got.count >= 2 }
    try await Task.sleep(nanoseconds: 300_000_000)
    XCTAssertEqual(st.got.map(\.1).sorted(), [200, 404])
    XCTAssertNil(store.conversations[sid]?.approval, "a card for a request that was answered")
    XCTAssertNotEqual(store.conversations[sid]?.turns.last?.steps.first?.status, .waiting)
  }

  /// The answer did not get through and the request still waits: the card is shown, as before.
  func testAYesLostOnTheWayStillShowsTheCard() async throws {
    let (server, st, store) = try await stub()
    defer { server.stop() }
    st.failWaiting = true
    for e in ran("call_1", "ls") { store.handle(e) }
    st.add("per_1", sid, "ls")
    store.handle(asked("per_1", step: "call_1", "ls"))
    await waitFor { store.conversations[self.sid]?.approval != nil }
    XCTAssertEqual(store.conversations[sid]?.approval?.id, "per_1")
  }

  /// The publish card is never answered by the app, and a Yes on a card whose request is gone takes
  /// the card away with a plain sentence, never "Try again".
  func testAYesOnACardWhoseRequestEndedSaysSoAndTheCardGoes() async throws {
    let (server, st, store) = try await stub()
    defer { server.stop() }
    let publish = "ola-publish publish site --name bart --fingerprint 5130"
    for e in ran("call_pub", publish) { store.handle(e) }
    st.add("per_pub", sid, publish)
    store.handle(asked("per_pub", step: "call_pub", publish))
    try await Task.sleep(nanoseconds: 300_000_000)
    XCTAssertEqual(store.conversations[sid]?.approval?.id, "per_pub", "the publish card is the person's")
    XCTAssertTrue(st.got.isEmpty, "the app answered a publish by itself")
    // The request ends on the server without this app hearing it (the stream lost the reply).
    st.lock.withLock { st.pending.removeAll() }
    store.selectedID = sid
    await store.answer(.once, in: sid)
    XCTAssertNil(store.conversations[sid]?.approval, "the card stayed after its request ended")
    XCTAssertEqual(store.problem?.text, OlaStore.noLongerNeededText)
    XCTAssertFalse(store.problem?.text.contains("Try again") ?? true)
  }
}
