import Foundation

/// Made-up sessions for screenshots and previews (the `-OlaFixture <name>` launch argument).
/// Everything here is invented: people, numbers, files.
public struct Fixture: Sendable {
  public var connection: OlaStore.Connection = .open
  public var sessions: [SessionInfo]
  public var running: Set<String> = []
  public var unseen: Set<String> = []
  public var conversations: [String: Conversation] = [:]
  public var models: [ModelInfo] = [ModelInfo(providerID: "ola", modelID: "general", name: "General")]
  public var files: [String: [FileEntry]] = [:]
  public var selected: String?
  public var claudeOn = false

  static let dir = "/Users/admin/ola-bart"
  static let t0 = Date(timeIntervalSince1970: 1_794_870_000)

  static func t(_ s: Double) -> Date { t0.addingTimeInterval(s) }

  static let sessionList: [SessionInfo] = [
    SessionInfo(id: "s1", title: "Volunteer survey totals", created: t(-600), updated: t(110), directory: dir),
    SessionInfo(id: "s2", title: "Court-watch page, first draft", created: t(-90_000), updated: t(-3_000), directory: dir),
    SessionInfo(id: "s3", title: "Glossary of crop terms", created: t(-200_000), updated: t(-86_000), directory: dir),
    SessionInfo(id: "s4", title: "Clean up the hearing dates", created: t(-400_000), updated: t(-300_000), directory: dir),
    SessionInfo(id: "s5", title: "Compare two drafts of the letter", created: t(-700_000), updated: t(-600_000), directory: dir),
  ]

  static let projectFiles: [FileEntry] = [
    FileEntry(path: "court-watch/", isDirectory: true),
    FileEntry(path: "check.py", isDirectory: false),
    FileEntry(path: "survey.csv", isDirectory: false),
    FileEntry(path: "summary.md", isDirectory: false),
    FileEntry(path: "totals.py", isDirectory: false),
  ]

  static let answer = """
  **48 people answered, and 31 of them want to keep volunteering next spring.** I dropped 8 rows that \
  were exact repeats, so the totals below count each person once.

  | City | People | Hours |
  |---|---:|---:|
  | Oakland | 21 | 164 |
  | Fresno | 15 | 98 |
  | Stockton | 12 | 71 |

  Two things to know before you use these numbers:

  - Three people left the hours blank. I counted them as people but not as hours.
  - "Stockton" was also spelled "Stokton" four times; I treated those as the same city.

  The program that made the totals is in `totals.py`. To run it again on a new export:

  ```python
  python3 totals.py survey.csv --out summary.md
  ```
  """

  static func doneTurn() -> Turn {
    Turn(id: "u1", request: "Go through survey.csv and tell me how many people want to keep volunteering, by city. Write it up in summary.md.", at: t(0), status: .done, steps: [
      Step(id: "c1", tool: "glob", words: Words(icon: .look, verb: "Looked through", object: "the project folder"), result: "4 files", status: .done, input: "{\n  \"pattern\" : \"*\"\n}", output: "survey.csv\ncheck.py", started: t(2), ended: t(3)),
      Step(id: "c2", tool: "read", words: Words(icon: .read, verb: "Read", object: "survey.csv"), result: "57 lines", status: .done, input: "{\n  \"path\" : \"survey.csv\"\n}", started: t(4), ended: t(5)),
      Step(id: "c3", tool: "shell", words: Words(icon: .run, verb: "Ran a short program", object: ""), status: .failed, error: "The program stopped with an error (exit code 1).", input: "python3 -c \"import csv; print(len(list(csv.reader(open('survey.csv')))))\"", output: "Traceback (most recent call last):\n  UnicodeDecodeError: 'utf-8' codec can't decode byte 0xe9", started: t(8), ended: t(10)),
      Step(id: "c4", tool: "write", words: Words(icon: .write, verb: "Wrote", object: "totals.py"), status: .done, input: "{\n  \"path\" : \"totals.py\"\n}", started: t(30), ended: t(41)),
      Step(id: "c5", tool: "shell", words: Words(icon: .run, verb: "Ran", object: "totals.py"), result: "printed 48 people, 31 yes", status: .done, input: "python3 totals.py survey.csv --out summary.md", output: "48 people, 31 yes", started: t(60), ended: t(62)),
      Step(id: "c6", tool: "write", words: Words(icon: .write, verb: "Wrote", object: "summary.md"), status: .done, input: "{\n  \"path\" : \"summary.md\"\n}", started: t(80), ended: t(96)),
    ], answer: answer, notes: ["The file is not UTF-8. I will read it as Latin-1 and try again."], ended: t(108))
  }

  static func workingTurn() -> Turn {
    Turn(id: "u2", request: "Now make a small chart of hours by city and save it as chart.html.", at: t(200), status: .working, steps: [
      Step(id: "d1", tool: "read", words: Words(icon: .read, verb: "Read", object: "summary.md"), result: "18 lines", status: .done, started: t(203), ended: t(204)),
      Step(id: "d2", tool: "write", words: Words(icon: .write, verb: "Wrote", object: "chart.html"), status: .waiting, input: "{\n  \"path\" : \"chart.html\"\n}", started: t(210)),
    ], notes: [])
  }

  static let pendingApproval = Approval(id: "p1", sessionID: "s1", action: "edit", title: "Ola wants to write a file", items: [
    ApprovalItem(label: "Make a new file: chart.html", detail: "@@ -0,0 +1,24 @@\n+<!doctype html>\n+<title>Hours by city</title>\n+<style>body { font: 15px system-ui; }</style>\n+<svg viewBox=\"0 0 320 120\">\n+  <rect x=\"0\" y=\"10\" width=\"164\" height=\"24\"/>\n+  <rect x=\"0\" y=\"46\" width=\"98\" height=\"24\"/>\n+  <rect x=\"0\" y=\"82\" width=\"71\" height=\"24\"/>\n+</svg>", isCommand: false),
  ], stepID: "d2")

  /// A finished session, open on the Mac.
  public static var main: Fixture {
    var f = Fixture(sessions: sessionList)
    f.conversations["s1"] = Conversation(sessionID: "s1", directory: dir, turns: [doneTurn()])
    f.unseen = ["s3"]
    f.running = ["s2"]
    f.files[""] = projectFiles
    f.selected = "s1"
    return f
  }

  /// The same session, now working, with an approval waiting.
  public static var approval: Fixture {
    var f = main
    f.conversations["s1"] = Conversation(sessionID: "s1", directory: dir, turns: [doneTurn(), workingTurn()], approval: pendingApproval)
    f.running = ["s1", "s2"]
    return f
  }

  /// A new, empty session.
  public static var empty: Fixture {
    var f = main
    f.selected = nil
    return f
  }

  /// The machine does not answer.
  public static var unreachable: Fixture {
    var f = main
    f.connection = .lost(since: t(-40), why: "Could not connect to the server.")
    return f
  }

  /// Reactions on Bart's messages: ✅ (finished, no marker), a Claude turn, 🙏 for a thank-you
  /// (no reply at all), and 👀 on the one that is running.
  public static var reactions: Fixture {
    var f = main
    var first = doneTurn()
    first.answer = "[[ola:react done]]\n" + answer
    let claude = Turn(id: "c1", request: "Add a line for Fresno's average hours per person.", at: t(140), status: .done, steps: [
      Step(id: "k1", tool: "read", words: Words(icon: .read, verb: "Read", object: "summary.md"), result: "18 lines", status: .done, started: t(142), ended: t(143)),
      Step(id: "k2", tool: "edit", words: Words(icon: .change, verb: "Changed", object: "summary.md"), status: .done, started: t(150), ended: t(152)),
    ], answer: "Fresno's 15 people gave 98 hours, about **6.5 hours each**. I added that line under the table in `summary.md`.", ended: t(160), engine: .claude)
    let thanks = Turn(id: "u3", request: "This is great, thank you!", at: t(200), status: .done, answer: "[[ola:react thanks]]", ended: t(203))
    var working = workingTurn()
    working.id = "u4"
    working.at = t(260)
    f.conversations["s1"] = Conversation(sessionID: "s1", directory: dir, turns: [first, claude, thanks, working])
    f.running = ["s1"]
    f.claudeOn = true
    return f
  }

  public static func named(_ name: String) -> Fixture {
    switch name {
    case "reactions": return reactions
    case "approval": return approval
    case "empty": return empty
    case "unreachable": return unreachable
    case "notset":
      var f = Fixture(sessions: [])
      f.connection = .notSetUp
      return f
    default: return main
    }
  }
}
