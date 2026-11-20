import XCTest
@testable import OlaKit

/// OLA-205: the allowance used up, in plain words with the moment it starts again.
final class QuotaWordsTests: XCTestCase {
  let pacific = TimeZone(identifier: "America/Los_Angeles")!
  let thursday = ISO8601DateFormatter().date(from: "2026-11-19T20:00:00Z")!

  func testPersonOnTheirOwnComputer() {
    let p = Plain.runProblem((["status": 429, "message": "Your weekly allowance of Ola's model is used up. It starts again on Sunday, November 22, at 4 pm Pacific time."] as JSON))
    XCTAssertTrue(p.text.hasPrefix("Your weekly allowance of Ola's model is used up. It starts again "), p.text)
    XCTAssertNil(p.text.range(of: "gateway|setting|raise|token|share|Bart", options: [.regularExpression, .caseInsensitive]), p.text)
  }

  func testOldGatewayWordsForAPersonStillReadPlain() {
    let s = Plain.quotaProblem("Your weekly allowance on Ola is used up. It starts again on Monday.", now: thursday, timeZone: pacific)
    XCTAssertEqual(s, "Your weekly allowance of Ola's model is used up. It starts again on Sunday, November 22, at 4 pm.")
  }

  func testAProjectWithTheInstantInTheMessage() {
    let s = Plain.quotaProblem("this week's quota of 100 tokens is used up; it resets at 2026-11-23T00:00:00.000Z", now: thursday, timeZone: pacific)
    XCTAssertEqual(s, "This project's weekly allowance of Ola's model is used up. It starts again on Sunday, November 22, at 4 pm.")
  }

  func testNoInstantFallsOnNextMondayUTC() {
    let utc = TimeZone(identifier: "UTC")!
    XCTAssertEqual(Plain.quotaProblem("insufficient_quota", now: thursday, timeZone: utc), "Your weekly allowance of Ola's model is used up. It starts again at the start of Monday, November 23.")
    let ny = TimeZone(identifier: "America/New_York")!
    XCTAssertEqual(Plain.quotaProblem("insufficient_quota", now: thursday, timeZone: ny), "Your weekly allowance of Ola's model is used up. It starts again on Sunday, November 22, at 7 pm.")
    // On a Monday itself, the next week's start, not today's.
    let monday = ISO8601DateFormatter().date(from: "2026-11-23T09:00:00Z")!
    XCTAssertEqual(Plain.quotaProblem("insufficient_quota", now: monday, timeZone: utc), "Your weekly allowance of Ola's model is used up. It starts again at the start of Monday, November 30.")
  }

  func testRefusedSignInHasNoMachineWords() {
    let p = Plain.runProblem((["status": 401, "message": "unauthorized"] as JSON))
    XCTAssertNil(p.text.range(of: "gateway|token|ola-bart", options: [.regularExpression, .caseInsensitive]), p.text)
  }
}
