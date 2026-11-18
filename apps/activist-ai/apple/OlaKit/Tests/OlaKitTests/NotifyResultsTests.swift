import CryptoKit
import Foundation
import XCTest
@testable import OlaKit

final class NotifyResultsTests: XCTestCase {
  let session = SessionInfo(id: "ses_1", title: "Dancing cat", created: .now, updated: .now)

  func testWhichEventsNotify() {
    var t = Turn(id: "u1", request: "deploy the cat", at: .now, status: .done, answer: "[[ola:react done]]\nDeployed the **dancing cat**.")
    XCTAssertEqual(NotifyEvent.finished(t, session: session)?.body, "Done: Deployed the dancing cat.")
    t.status = .stopped
    XCTAssertNil(NotifyEvent.finished(t, session: session), "his own Stop is not news")
    t.error = Problem(text: "The server restarted, so this stopped.")
    XCTAssertEqual(NotifyEvent.finished(t, session: session)?.body, "Didn't finish: The server restarted, so this stopped.")
    t.status = .working
    XCTAssertNil(NotifyEvent.finished(t, session: session), "nothing while it runs")
    let thanks = Turn(id: "u2", request: "great job", at: .now, status: .done, answer: "[[ola:react thanks]]")
    XCTAssertNil(NotifyEvent.finished(thanks, session: session), "a thank-you's reaction is not news")
    let a = Approval(id: "per_1", sessionID: "ses_1", action: "shell", title: "Ola wants to run a command", items: [], stepID: nil)
    XCTAssertEqual(NotifyEvent.needsYou(a, session: session).body, "Needs your OK: run a command")
  }

  func testFilter() {
    let f = NotifyFilter()
    let done = NotifyEvent.finished(Turn(id: "u1", request: "x", at: .now, status: .done, answer: "Done."), session: session)!
    let ask = NotifyEvent.needsYou(Approval(id: "per_1", sessionID: "ses_1", action: "edit", title: "Ola wants to write a file", items: [], stepID: nil), session: session)
    let on = NotifyFilter.Phone(finished: true, needsYou: true)
    XCTAssertTrue(f.shouldSend(done, to: on, phoneID: "p"))
    XCTAssertFalse(f.shouldSend(done, to: on, phoneID: "p"), "once per event")
    XCTAssertTrue(f.shouldSend(done, to: on, phoneID: "q"), "each phone gets its own")
    XCTAssertFalse(f.shouldSend(ask, to: NotifyFilter.Phone(finished: true, needsYou: false), phoneID: "p"), "its switch is off")
    let looking = NotifyFilter.Phone(finished: true, needsYou: true, viewing: "ses_1", viewingAt: .now)
    XCTAssertFalse(f.shouldSend(ask, to: looking, phoneID: "r"), "he is looking at that session")
    let stale = NotifyFilter.Phone(finished: true, needsYou: true, viewing: "ses_1", viewingAt: Date(timeIntervalSinceNow: -300))
    XCTAssertTrue(f.shouldSend(ask, to: stale, phoneID: "r"), "an old 'looking' does not count")
  }

  /// The push request, against a fake push server on loopback, with a throwaway key.
  func testPushRequest() async throws {
    let key = P256.Signing.PrivateKey()
    var received: HTTPRequest?
    let server = try MiniHTTPServer(host: "127.0.0.1", port: 0) { req, res in
      received = req
      await res.send(200, Data())
    }
    let port = try await server.start()
    defer { server.stop() }
    let apns = try APNs(p8: key.pemRepresentation, keyID: "KEYID12345", teamID: "274T5WCVD2", topic: "cx.ola.mac", host: URL(string: "http://127.0.0.1:\(port)")!)
    let e = NotifyEvent.needsYou(Approval(id: "per_9", sessionID: "ses_1", action: "shell", title: "Ola wants to run a command", items: [], stepID: nil), session: session)
    let (status, _) = await apns.send(e, device: "abc123")
    XCTAssertEqual(status, 200)
    let r = try XCTUnwrap(received)
    XCTAssertEqual(r.path, "/3/device/abc123")
    XCTAssertEqual(r.header("apns-topic"), "cx.ola.mac")
    XCTAssertEqual(r.header("apns-push-type"), "alert")
    let body = try XCTUnwrap(JSON.parse(r.body))
    XCTAssertEqual(body["aps"]["alert"]["title"].str, "Dancing cat")
    XCTAssertEqual(body["aps"]["alert"]["body"].str, "Needs your OK: run a command")
    XCTAssertEqual(body["aps"]["thread-id"].str, "ses_1")
    XCTAssertEqual(body["session"].str, "ses_1")
    // The token: ES256 with our key id, issued by the team, and its signature verifies.
    let jwt = try XCTUnwrap(r.header("authorization")?.replacingOccurrences(of: "bearer ", with: ""))
    let parts = jwt.split(separator: ".").map(String.init)
    XCTAssertEqual(parts.count, 3)
    func dec(_ s: String) -> Data { var b = s.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/"); while b.count % 4 != 0 { b += "=" }; return Data(base64Encoded: b)! }
    let header = try XCTUnwrap(JSON.parse(dec(parts[0])))
    let claims = try XCTUnwrap(JSON.parse(dec(parts[1])))
    XCTAssertEqual(header["alg"].str, "ES256")
    XCTAssertEqual(header["kid"].str, "KEYID12345")
    XCTAssertEqual(claims["iss"].str, "274T5WCVD2")
    XCTAssertNotNil(claims["iat"].int)
    let sig = try P256.Signing.ECDSASignature(rawRepresentation: dec(parts[2]))
    XCTAssertTrue(key.publicKey.isValidSignature(sig, for: Data("\(parts[0]).\(parts[1])".utf8)))
  }

  func step(_ id: String, _ tool: String, _ icon: StepIcon, _ object: String, input: String = "", output: String = "") -> Step {
    Step(id: id, tool: tool, words: Words(icon: icon, verb: "x", object: object), status: .done, input: input, output: output, started: .now)
  }

  func testResultItemsFromSteps() throws {
    // The web app's recorded run: it wrote rows.md.
    let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../../../web/test/fixtures/glm-ask.jsonl").standardized
    let lines = try String(contentsOf: url, encoding: .utf8).split(separator: "\n").compactMap { JSON.parse(String($0)) }
    let sid = lines.first { $0["type"].str == "session.created" }!["data"]["sessionID"].str
    var c = Conversation(sessionID: sid, directory: lines.first { $0["type"].str == "session.created" }!["data"]["location"]["directory"].string)
    c.startTurn("count")
    for e in lines where e["type"].str != "(message.list)" { c.apply(e) }
    XCTAssertEqual(ResultItem.derive(c.turns.last!).map(\.target), ["rows.md"])
    XCTAssertEqual(ResultItem.derive(c.turns.last!).first?.kind, .document)

    // A page, an image, a table, a deploy, a failed write and an absolute path.
    var bad = step("s5", "write", .write, "broken.html"); bad.status = .failed
    let t = Turn(id: "t", request: "x", at: .now, status: .done, steps: [
      step("s1", "write", .write, "site/index.html"),
      step("s2", "write", .write, "map.png"),
      step("s3", "edit", .change, "totals.csv"),
      step("s3b", "edit", .change, "totals.csv"),
      bad,
      step("s6", "write", .write, "/etc/hosts"),
      step("s7", "read", .read, "notes.md"),
      step("s4", "shell", .run, "vercel", input: "npx vercel deploy --prod --yes", output: "Inspect: https://vercel.com/bart/cat/abc\nProduction: https://dancing-cat.vercel.app [3s]"),
    ])
    let items = ResultItem.derive(t)
    XCTAssertEqual(items.map(\.target), ["site/index.html", "map.png", "totals.csv", "https://dancing-cat.vercel.app"])
    XCTAssertEqual(items.map(\.kind), [.page, .image, .table, .site])
    XCTAssertEqual(items.last?.name, "dancing-cat.vercel.app")
  }
}
