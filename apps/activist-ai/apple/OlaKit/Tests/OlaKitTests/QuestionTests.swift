import Foundation
import XCTest
@testable import OlaKit

/// Ola's questions (OLA-301): opencode's `question` tool raises a form. The apps showed only
/// "Used question" with a spinner and the run waited forever; the form must become a card that
/// can be answered, the same events the web app folds (web/test/conversation.test.ts).
final class QuestionTests: XCTestCase {
  let form: JSON = ["id": "frm_1", "sessionID": "s", "title": "Questions", "metadata": ["kind": "question", "tool": ["id": "call_q"]],
                    "fields": [["key": "q0", "title": "Page", "description": "What should the page say?", "type": "string",
                                "options": [["value": "Just Bart", "label": "Just Bart", "description": "One word"], ["value": "Hello, Bart", "label": "Hello, Bart"]], "custom": true]]]

  func running() -> Conversation {
    var c = Conversation(sessionID: "s")
    c.startTurn("make a page that says Bart and publish it on ola")
    c.apply(["type": "session.execution.started", "data": ["sessionID": "s"]])
    c.apply(["type": "session.tool.input.started", "data": ["sessionID": "s", "id": "call_q", "name": "question"]])
    c.apply(["type": "session.tool.called", "data": ["sessionID": "s", "id": "call_q", "input": ["questions": [["question": "What should the page say?", "header": "Page"]]]]])
    return c
  }

  func testTheFormBecomesACardAndTheAnswerLetsTheRunGoOn() throws {
    var c = running()
    XCTAssertEqual(c.turns.last?.steps.first?.verb, "Asked you")
    XCTAssertEqual(c.turns.last?.steps.first?.object, "What should the page say?")
    // The form's session is inside the form, not at the top of the event.
    XCTAssertTrue(c.apply(["type": "form.created", "data": ["form": form]]))
    let q = try XCTUnwrap(c.question)
    XCTAssertEqual(q.id, "frm_1")
    XCTAssertTrue(q.single)
    XCTAssertEqual(q.fields.first?.text, "What should the page say?")
    XCTAssertEqual(q.fields.first?.options.map(\.label), ["Just Bart", "Hello, Bart"])
    XCTAssertEqual(q.fields.first?.options.first?.description, "One word")
    XCTAssertEqual(c.turns.last?.steps.first?.status, .waiting)
    // A form for another session leaves this one alone.
    var other = form
    if case .object(var o) = other { o["id"] = "frm_2"; o["sessionID"] = "other"; other = .object(o) }
    XCTAssertFalse(c.apply(["type": "form.created", "data": ["form": other]]))
    XCTAssertEqual(c.question?.id, "frm_1")
    // Answered (here or on the other app): the card goes, the step runs on.
    XCTAssertTrue(c.apply(["type": "form.replied", "data": ["id": "frm_1", "sessionID": "s", "answer": ["q0": "Just Bart"]]]))
    XCTAssertNil(c.question)
    XCTAssertEqual(c.turns.last?.steps.first?.status, .running)
  }

  func testCancelledAndStoppedClearTheCard() {
    var c = running()
    c.apply(["type": "form.created", "data": ["form": form]])
    c.apply(["type": "form.cancelled", "data": ["id": "frm_1", "sessionID": "s"]])
    XCTAssertNil(c.question)
    c.apply(["type": "form.created", "data": ["form": form]])
    c.apply(["type": "session.execution.interrupted", "data": ["sessionID": "s", "reason": "user"]])
    XCTAssertNil(c.question)
  }

  func testTheAnswerOpencodeTakes() throws {
    let q = try XCTUnwrap(Question(form: form))
    XCTAssertEqual(q.answer(picked: ["q0": ["Just Bart"]], typed: [:]), ["q0": .string("Just Bart")])
    // Own words win over a pick.
    XCTAssertEqual(q.answer(picked: ["q0": ["Just Bart"]], typed: ["q0": " Bart, big "]), ["q0": .string("Bart, big")])
    XCTAssertEqual(q.answer(words: "  only Bart  "), ["q0": .string("only Bart")])
    XCTAssertNil(q.answer(words: "   "))
    XCTAssertFalse(Question.complete(q.answer(picked: [:], typed: [:])))

    let multi = try XCTUnwrap(Question(form: ["id": "frm_3", "sessionID": "s", "fields": [
      ["key": "a", "title": "Colors", "type": "multiselect", "options": [["value": "red"], ["value": "blue"]]],
      ["key": "b", "title": "Name", "type": "string", "custom": false, "options": [["value": "x", "label": "X"]]],
      ["key": "c", "type": "boolean"],
    ]]))
    XCTAssertFalse(multi.single)
    XCTAssertEqual(multi.fields.map(\.key), ["a", "b"], "a field the app cannot show is left out, as on the web")
    XCTAssertEqual(multi.fields[0].options.map(\.label), ["red", "blue"], "an option without a label shows its value")
    XCTAssertFalse(multi.fields[1].custom)
    let a = multi.answer(picked: ["a": ["red", "blue"], "b": ["x"]], typed: [:])
    XCTAssertEqual(a, ["a": .array([.string("red"), .string("blue")]), "b": .string("x")])
    XCTAssertTrue(Question.complete(a))
    // The box answers the whole card, however many questions (OLA-320, the website's rule).
    XCTAssertEqual(multi.answer(words: "red"), ["a": .array([.string("red")]), "b": .string("red")])
  }

  func testAQuestionWaitingWhenTheSessionOpensIsShown() throws {
    XCTAssertNil(Question(form: ["id": "frm_9", "fields": []]), "a form with nothing to show is not a card")
    XCTAssertNil(Question(form: ["fields": [["key": "q0", "type": "string"]]]), "no id, no card")
  }

  func testThePhoneCanAnswerThroughTheMac() {
    XCTAssertTrue(MacRelay.allowed("GET", "/api/session/ses_abc/form"))
    XCTAssertTrue(MacRelay.allowed("POST", "/api/session/ses_abc/form/frm_1/reply"))
    XCTAssertFalse(MacRelay.allowed("DELETE", "/api/session/ses_abc/form/frm_1"))
    XCTAssertFalse(MacRelay.allowed("POST", "/api/session/ses_abc/form"))
  }

  func testTheNotification() {
    let q = Question(form: form)!
    let e = NotifyEvent.asks(q, session: SessionInfo(id: "s", title: "Bart page", created: .now, updated: .now, directory: nil))
    XCTAssertEqual(e.kind, .needsYou)
    XCTAssertEqual(e.body, "Ola asks: What should the page say?")
  }
}
