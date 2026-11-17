import XCTest
@testable import OlaKit

/// Ola's skills on the Mac (README, "Ola's skills on the Mac"): the repo's skills read as the app
/// reads its bundle, installed with this Mac's paths, checked, and offered only when they can run.
final class SkillsTests: XCTestCase {
  let repo = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../../../skills").standardized

  func testEverySkillDeclaresWhatItNeeds() {
    let skills = OlaSkills.read(at: repo)
    XCTAssertEqual(skills.map(\.name), ["app-designer", "batch-quotes", "chart", "designer", "report", "workbook"])
    let chart = skills.first { $0.name == "chart" }!
    XCTAssertEqual(chart.needs, [.python("matplotlib"), .python("PIL")])
    XCTAssertNil(chart.notOnMac)
    XCTAssertEqual(skills.first { $0.name == "designer" }!.needs, [.command("ola-page")])
    XCTAssertNotNil(skills.first { $0.name == "batch-quotes" }!.notOnMac)
    XCTAssertTrue(skills.first { $0.name == "batch-quotes" }!.hidden)
    XCTAssertEqual(skills.first { $0.name == "report" }!.needs, [.python("docx"), .python("reportlab"), .command("pdfinfo"), .command("pdftotext")])
  }

  func testWhatIsMissingIsSaidPlainly() {
    let report = OlaSkills.read(at: repo).first { $0.name == "report" }!
    let s = OlaSkills.State(skill: report, missing: report.needs)
    XCTAssertFalse(s.ready)
    XCTAssertEqual(s.line, "report: needs the Python libraries python-docx and reportlab, and poppler (pdfinfo, pdftotext); get it with ola skills setup, or in Ola, Settings, Ola\u{2019}s skills, Get Python Libraries; get it with brew install poppler")
    XCTAssertEqual(OlaSkills.State(skill: report, missing: []).line, "report: ready")
    let design = OlaSkills.read(at: repo).first { $0.name == "batch-quotes" }!
    XCTAssertTrue(OlaSkills.State(skill: design, missing: []).line.hasPrefix("batch-quotes: not on this Mac; "))
    let designer = OlaSkills.read(at: repo).first { $0.name == "designer" }!
    XCTAssertEqual(OlaSkills.State(skill: designer, missing: designer.needs).line, "designer: needs the Ola app, open (on this Mac it draws the pages ola-page looks at); open the Ola app")
    // Only the ready ones are offered; the agent is told about the rest and how to get them.
    let notes = OlaSkills.notes([OlaSkills.State(skill: report, missing: report.needs), OlaSkills.State(skill: design, missing: [])], dir: "/x/skills")
    XCTAssertTrue(notes.contains("None is ready here yet"))
    XCTAssertTrue(notes.contains("brew install poppler"))
    XCTAssertTrue(notes.contains("do not improvise it"))
  }

  func testTheConfigOffersOnlyOlasReadySkills() {
    let c = LocalServer.config(modelURL: "http://127.0.0.1:1/v1", instructionsPath: "/i.md", skills: ["chart", "workbook"], skillsPath: "/s/skills")
    XCTAssertTrue(c.contains(#""skills": ["/s/skills"]"#), c)
    XCTAssertTrue(c.contains(#"{ "action": "skill.use", "resource": "*", "effect": "deny" }"#))
    XCTAssertTrue(c.contains(#"{ "action": "skill.use", "resource": "chart", "effect": "allow" }"#))
    XCTAssertFalse(c.contains(#""resource": "report", "effect": "allow""#))
    XCTAssertTrue(c.contains(#"{ "action": "external_directory", "resource": "/s/skills/*", "effect": "allow" }"#))
  }

  func testTheInstalledCopyCarriesItsVersion() throws {
    let fm = FileManager.default
    let t = fm.temporaryDirectory.appendingPathComponent("ola-skills-test-\(getpid())")
    defer {
      if let all = fm.enumerator(atPath: t.path) { for case let rel as String in all { try? fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: t.appendingPathComponent(rel).path) } }
      try? fm.removeItem(at: t)
    }
    let src = t.appendingPathComponent("bundle")
    try fm.createDirectory(at: src.appendingPathComponent("chart"), withIntermediateDirectories: true)
    try "python3 /opt/ola/skills/chart/scripts/chart.py".write(to: src.appendingPathComponent("chart/SKILL.md"), atomically: true, encoding: .utf8)
    try #"{"hash":"aaaa","commit":"c0ffee","skills":["chart"]}"#.write(to: src.appendingPathComponent("VERSION.json"), atomically: true, encoding: .utf8)
    let was = LocalServer.skillsSource
    LocalServer.skillsSource = src
    defer { LocalServer.skillsSource = was }
    let dir = t.appendingPathComponent("home/skills")
    XCTAssertEqual(LocalServer.installSkills(into: dir), ["chart"])
    XCTAssertEqual(try String(contentsOf: dir.appendingPathComponent("chart/SKILL.md"), encoding: .utf8), "python3 \(dir.path)/chart/scripts/chart.py")
    XCTAssertEqual(OlaSkills.version(at: dir)?.label, "aaaa (commit c0ffee)")
  }

  func testComparedWithTheOlaMachine() {
    let v = OlaSkills.Version(hash: "aaaa", commit: "c1")
    XCTAssertEqual(OlaSkills.compare(v, OlaSkills.Version(hash: "aaaa", commit: "c2")), "The same as the Ola machine\u{2019}s.")
    XCTAssertTrue(OlaSkills.compare(v, OlaSkills.Version(hash: "bbbb", commit: "c3")).hasPrefix("Different from the Ola machine\u{2019}s (bbbb (commit c3))"))
    XCTAssertTrue(OlaSkills.compare(v, nil).contains("not known"))
  }
}
