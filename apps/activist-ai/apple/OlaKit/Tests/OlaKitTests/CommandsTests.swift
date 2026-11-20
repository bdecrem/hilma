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

  /// "Ended well" (2026-11-17, Bart's news-site run: four web searches, all failed, a reply that
  /// said it could not search, and a ✅).
  func testNoCheckMarkForARunThatFailed() {
    func step(_ id: String, _ icon: StepIcon, _ status: Step.Status, _ object: String = "x") -> Step {
      Step(id: id, tool: "shell", words: Words(icon: icon, verb: "Did", object: object), status: status, started: .now)
    }
    let reply = "I wasn't able to fetch real-time news, so I can't verify five genuine AI stories."
    // Every step failed: no reaction, even with a reply.
    var t = Turn(id: "t", request: "Build me a news site", at: .now, status: .done, steps: (1...4).map { step("s\($0)", .search, .failed) }, answer: reply)
    XCTAssertFalse(t.endedWell)
    XCTAssertNil(t.reaction)
    // Some failed, no reply, no file changed: no reaction.
    t = Turn(id: "t", request: "x", at: .now, status: .done, steps: [step("a", .read, .done), step("b", .run, .failed)])
    XCTAssertNil(t.reaction)
    // Some failed, but it replied: ✅.
    t.answer = "The totals are in."
    XCTAssertEqual(t.reaction, .done)
    // Some failed, no reply, but a file was written: ✅.
    t = Turn(id: "t", request: "x", at: .now, status: .done, steps: [step("a", .write, .done, "page.html"), step("b", .run, .failed)])
    XCTAssertEqual(t.reaction, .done)
    // Nothing failed (and a turn with no steps at all): ✅.
    t = Turn(id: "t", request: "x", at: .now, status: .done, steps: [step("a", .read, .done)], answer: "Here.")
    XCTAssertEqual(t.reaction, .done)
    t = Turn(id: "t", request: "x", at: .now, status: .done, answer: "Here.")
    XCTAssertEqual(t.reaction, .done)
    // The reply's own marker still wins, also on a failed run.
    t = Turn(id: "t", request: "x", at: .now, status: .done, steps: [step("a", .search, .failed)], answer: "[[ola:react think]]\nShall I try another way?")
    XCTAssertEqual(t.reaction, .think)
    // While it works: 👀.
    t.answer = ""
    t.status = .working
    XCTAssertEqual(t.reaction, .eyes)
  }

  /// Publish from a cloud project's conversation (OLA-230): the question names every file.
  func testCloudPublishQuestion() {
    let a = Plain.describeApproval(action: "shell", resources: ["ola-publish site --files index.html,style.css"], metadata: .null, dir: nil)
    XCTAssertEqual(a.title, "Ola wants to publish these 2 files on the web, at sites.ola.cx")
    XCTAssertEqual(a.items.map(\.label), ["index.html", "style.css", "Publish from site"])
    XCTAssertEqual(a.items.last?.detail, "ola-publish site --files index.html,style.css")
    // The Mac's own ola-publish (local runtime) and anything else stay commands.
    XCTAssertEqual(Plain.describeApproval(action: "shell", resources: ["ola-publish publish site --name x --fingerprint abc"], metadata: .null, dir: nil).title, "Ola wants to run a command")
    XCTAssertNil(Plain.cloudPublish("ola-publish site --files a | cat"))
    XCTAssertNil(Plain.cloudPublish("ola-publish status"))
  }

  /// Ola's web commands ask the web app's question, not "run a command".
  func testWebQuestions() {
    let a = Plain.describeApproval(action: "shell", resources: [#"ola-search "AI news this week""#], metadata: .null, dir: nil)
    XCTAssertEqual(a.title, "Ola wants to search the web for: AI news this week")
    XCTAssertEqual(a.items, [ApprovalItem(label: "Search for \u{201C}AI news this week\u{201D}", detail: nil, isCommand: false)])
    XCTAssertEqual(Plain.webNote(action: "shell", resources: [#"ola-search "AI news""#]), "The words of the search go to Brave Search. Nothing from your files is sent.")
    let f = Plain.describeApproval(action: "shell", resources: ["ola-fetch https://www.example.org/report.pdf"], metadata: .null, dir: nil)
    XCTAssertEqual(f.title, "Ola wants to download: https://www.example.org/report.pdf")
    XCTAssertEqual(Plain.webNote(action: "shell", resources: ["ola-fetch https://www.example.org/report.pdf"]), "Ola asks example.org for this one address. Nothing from your files is sent.")
    XCTAssertEqual(WebAsk.request("ola-search --count 3 'flood maps'"), WebAsk.Request(kind: .search, item: "flood maps"))
    XCTAssertEqual(WebAsk.request("ola-lookup --json \"10.1038/nature12373\""), WebAsk.Request(kind: .lookup, item: "10.1038/nature12373"))
    // Not simple (a pipe): shown as the exact command, still as a web question.
    let piped = Plain.describeApproval(action: "shell", resources: [#"ola-search "x" | head"#], metadata: .null, dir: nil)
    XCTAssertEqual(piped.title, "Ola wants to search the web for: something")
    XCTAssertEqual(piped.items.first?.detail, #"ola-search "x" | head"#)
    XCTAssertEqual(WebAsk.request("ola-fetch http://example.org"), WebAsk.Request(kind: .fetch, item: nil))
    // What the open model does however it is told (2026-11-17): output plumbing around ola-search
    // is still a web question, the exact command under View.
    let chained = [#"ola-search "Brave Search API" 2>&1"#, "head -50"]
    let c = Plain.describeApproval(action: "shell", resources: chained, metadata: .null, dir: nil)
    XCTAssertEqual(c.title, "Ola wants to search the web for: Brave Search API")
    XCTAssertEqual(c.items, [ApprovalItem(label: "Search for \u{201C}Brave Search API\u{201D}", detail: chained.joined(separator: "\n"), isCommand: false)])
    XCTAssertNotNil(Plain.webNote(action: "shell", resources: chained))
    XCTAssertEqual(Plain.describeCommand(#"ola-search "Brave Search API" 2>&1"#).object, "\u{201C}Brave Search API\u{201D}")
    // Plumbing that names a file or a program is not plumbing.
    XCTAssertEqual(Plain.describeApproval(action: "shell", resources: ["ola-search x", "cat secrets.txt"], metadata: .null, dir: nil).title, "Ola wants to run a command")
    XCTAssertEqual(Plain.describeApproval(action: "shell", resources: ["ola-search x", "rm -rf y"], metadata: .null, dir: nil).title, "Ola wants to run a command")
    XCTAssertEqual(Plain.describeApproval(action: "shell", resources: ["head -5"], metadata: .null, dir: nil).title, "Ola wants to run a command")
    // Anything else is a command, as before.
    XCTAssertEqual(Plain.describeApproval(action: "shell", resources: ["ls"], metadata: .null, dir: nil).title, "Ola wants to run a command")
    XCTAssertNil(Plain.webNote(action: "shell", resources: ["ola-search x", "ls"]))
    // The step reads as a web search, never as "Checked the work" (the word "test" in the words).
    let w = Plain.describeCommand(#"ola-search "Ola test phrase""#)
    XCTAssertEqual(w.verb, "Searched the web for")
    XCTAssertEqual(w.object, "\u{201C}Ola test phrase\u{201D}")
  }
}
