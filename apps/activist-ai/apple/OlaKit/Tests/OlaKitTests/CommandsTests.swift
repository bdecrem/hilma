import XCTest
@testable import OlaKit

/// The README's "Slash commands and reactions (all surfaces)", as tests.
final class CommandsTests: XCTestCase {
  func testCommands() {
    XCTAssertEqual(SlashCommand.parse("/claude build the page"), .command(.claude, "build the page"))
    XCTAssertEqual(SlashCommand.parse("/Claude\nline two"), .command(.claude, "line two"))
    XCTAssertEqual(SlashCommand.parse("/claude"), .command(.claude, ""))
    XCTAssertEqual(SlashCommand.parse("/new"), .command(.new, ""))
    XCTAssertEqual(SlashCommand.parse("/frobnicate x"), .unknown("frobnicate"))
    XCTAssertEqual(SlashCommand.parse("please /claude this"), .none)
    XCTAssertEqual(SlashCommand.parse("/claudex do it"), .unknown("claudex"))
    XCTAssertEqual(SlashCommand.matches("/"), SlashCommand.allCases)
    XCTAssertEqual(SlashCommand.matches("/cl"), [.claude])
    XCTAssertEqual(SlashCommand.matches("/claude x"), [])
  }

  func testReactionMarker() {
    var s = Reaction.split("[[ola:react done]]\nThe page is built.")
    XCTAssertEqual(s.reaction, .done)
    XCTAssertEqual(s.text, "The page is built.")
    // Only the first line counts; a marker elsewhere is removed and ignored.
    s = Reaction.split("Here it is.\n[[ola:react party]]\nMore.")
    XCTAssertNil(s.reaction)
    XCTAssertEqual(s.text, "Here it is.\n\nMore.")
    // An unknown name: no reaction, and the marker is not shown.
    s = Reaction.split("[[ola:react fire]]\nHot.")
    XCTAssertNil(s.reaction)
    XCTAssertEqual(s.text, "Hot.")
    // Half a marker while it streams in is not shown.
    XCTAssertEqual(Reaction.split("[[ola:rea").text, "")
  }

  func testAutomaticEyesAndReactionOnly() {
    var t = Turn(id: "t", request: "great job", at: .now, status: .working)
    XCTAssertEqual(t.reaction, .eyes)                 // instant, before the model says anything
    t.answer = "[[ola:react thanks]]"
    XCTAssertEqual(t.reaction, .thanks)               // the reply's own marker replaces 👀
    t.status = .done
    XCTAssertTrue(t.reactionOnly)                     // no reply, no run line
    var u = Turn(id: "u", request: "make the chart", at: .now, status: .working)
    u.answer = "Done, it is in chart.html."
    u.status = .done
    XCTAssertEqual(u.reaction, .done)                 // no marker: ✅ when it ended well
    XCTAssertFalse(u.reactionOnly)
    u.status = .stopped
    XCTAssertNil(u.reaction)                          // removed when stopped or failed
    let sending = Turn(id: "s", request: "x", at: .now, status: .sending)
    XCTAssertNil(sending.reaction)                    // not until a run starts
  }
}
