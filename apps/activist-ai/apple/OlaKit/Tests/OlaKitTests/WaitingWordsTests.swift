import XCTest
@testable import OlaKit

/// OLA-321: the sidebar said "Needs your yes" while Ola's question card (choices, not a yes) waited.
final class WaitingWordsTests: XCTestCase {
  func testAQuestionWaitsForAnAnswer() {
    XCTAssertEqual(OlaStore.waitingWords(approval: false, question: true), "Waits for your answer")
  }

  func testAPermissionNeedsAYes() {
    XCTAssertEqual(OlaStore.waitingWords(approval: true, question: false), "Needs your yes")
    XCTAssertEqual(OlaStore.waitingWords(approval: true, question: true), "Needs your yes")
  }

  func testNothingWaiting() {
    XCTAssertNil(OlaStore.waitingWords(approval: false, question: false))
  }
}
