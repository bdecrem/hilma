import Foundation
import XCTest
@testable import OlaKit

/// The web app's recorded opencode 2.3.0 runs (web/test/fixtures), folded by the Swift port: the
/// same events must give the same turn the web page shows.
final class FoldTests: XCTestCase {
  func fixture(_ name: String) throws -> [JSON] {
    let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../../../web/test/fixtures/\(name)").standardized
    return try String(contentsOf: url, encoding: .utf8).split(separator: "\n").compactMap { JSON.parse(String($0)) }
  }

  func testRecordedRunWithApprovals() throws {
    let lines = try fixture("glm-ask.jsonl")
    let events = lines.filter { $0["type"].str != "(message.list)" }
    let sid = events.first { $0["type"].str == "session.created" }!["data"]["sessionID"].str
    var c = Conversation(sessionID: sid)
    c.startTurn(events.first { $0["type"].str == "session.inbox.enqueued" }!["data"]["item"]["payload"]["text"].str)
    var asked: [String] = []
    for ev in events {
      c.apply(ev)
      if ev["type"].str == "permission.asked", let a = c.approval { asked.append(a.title) }
    }
    let turn = try XCTUnwrap(c.turns.last)
    XCTAssertEqual(c.turns.count, 1)
    XCTAssertEqual(turn.status, .done)
    XCTAssertNil(c.approval)
    XCTAssertEqual(asked, ["Ola wants to run a command", "Ola wants to write a file"])
    XCTAssertTrue(turn.steps.allSatisfy { $0.status == .done }, turn.steps.map { "\($0.verb) \($0.status)" }.description)
    XCTAssertTrue(turn.steps.contains { $0.verb == "Ran a short program" })
    XCTAssertTrue(turn.answer.contains("56"))

    // The stored history gives the same picture.
    if let list = lines.first(where: { $0["type"].str == "(message.list)" }) {
      let rebuilt = Conversation.turns(fromMessages: list["data"]["data"].isNull ? list["data"].array : list["data"]["data"].array, directory: c.directory)
      XCTAssertEqual(rebuilt.count, 1)
      XCTAssertEqual(rebuilt.first?.status, .done)
      XCTAssertEqual(rebuilt.first?.steps.count, turn.steps.count)
      XCTAssertEqual(rebuilt.first?.answer, turn.answer)
    }
  }

  func testRequestFromTheOtherApp() {
    var c = Conversation(sessionID: "s")
    c.apply(["type": "session.inbox.enqueued", "data": ["sessionID": "s", "inboxID": "m1", "item": ["type": "user", "payload": ["text": "from the phone"]]]])
    XCTAssertEqual(c.turns.map(\.request), ["from the phone"])
    c.startTurn("from the Mac")
    c.apply(["type": "session.inbox.enqueued", "data": ["sessionID": "s", "inboxID": "m2", "item": ["type": "user", "payload": ["text": "from the Mac"]]]])
    XCTAssertEqual(c.turns.map(\.id), ["m1", "m2"])
  }

  func testPlainWords() {
    XCTAssertEqual(Plain.describeCommand("python3 totals.py survey.csv").verb, "Ran")
    XCTAssertEqual(Plain.describeCommand("python3 totals.py survey.csv").object, "totals.py")
    XCTAssertEqual(Plain.describeCommand("ls -la").verb, "Looked through")
    // OLA-474: the agent's own checks of its code, in the web app's words.
    XCTAssertEqual(Plain.describeCommand("ola-test calc.js calc.test.js").verb, "Tested")
    XCTAssertEqual(Plain.describeCommand("/opt/ola/bin/ola-test sheet/calc.js sheet/calc.test.js").object, "calc.js")
    XCTAssertEqual(Plain.describeTool("read", input: ["path": "/Users/admin/ola-bart/a/b.csv"], dir: "/Users/admin/ola-bart").object, "a/b.csv")
    XCTAssertEqual(Plain.present("Ran a short program"), "Run a short program")
    XCTAssertEqual(Plain.shellFailed(["exit": 2]), 2)
  }
}
