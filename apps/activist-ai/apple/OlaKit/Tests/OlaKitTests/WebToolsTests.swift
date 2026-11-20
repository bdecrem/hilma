import Foundation
import XCTest
@testable import OlaKit

/// The commands a run from the repo installs are the ones the app carries (OLA-250). The asks'
/// local runtime and every check installs Ola's commands from the repo (workspace/ and bart/); the
/// app from its Resources, which project.yml fills. On Nov 20 a cloud `ola-publish` was added to
/// workspace/ beside the Mac's in bart/; the repo run picked the cloud's, so "publish it on ola"
/// failed in the request tests with a command no Mac app carries. Each installed command must be
/// byte for byte the one file project.yml puts in the app under that name.
final class WebToolsTests: XCTestCase {
  static let apple = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../..").standardizedFileURL

  /// project.yml's WebTools sources: folder (relative to apple/) -> the files it includes.
  static func bundled() throws -> [(dir: String, files: [String])] {
    let yml = try String(contentsOf: apple.appendingPathComponent("project.yml"), encoding: .utf8)
    let lines = yml.components(separatedBy: "\n")
    var out: [(String, [String])] = []
    for (i, l) in lines.enumerated() {
      let t = l.trimmingCharacters(in: .whitespaces)
      guard t.hasPrefix("- path: ../"), i + 1 < lines.count else { continue }
      let next = lines[i + 1].trimmingCharacters(in: .whitespaces)
      guard next.hasPrefix("includes: ["), let close = next.firstIndex(of: "]") else { continue }
      let inner = next[next.index(next.startIndex, offsetBy: "includes: [".count)..<close]
      out.append((String(t.dropFirst("- path: ".count)), inner.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }))
    }
    return out
  }

  func testEveryInstalledCommandIsTheOneTheAppCarries() throws {
    let sources = try Self.bundled()
    XCTAssertTrue(sources.contains { $0.dir == "../bart" && $0.files.contains("ola-publish") }, "project.yml carries the Mac's ola-publish from bart/")
    let tools = FileManager.default.temporaryDirectory.appendingPathComponent("ola-webtools-\(getpid())")
    defer { try? FileManager.default.removeItem(at: tools) }
    let was = LocalServer.webToolsSource
    defer { LocalServer.webToolsSource = was }
    LocalServer.webToolsSource = Self.apple.appendingPathComponent("../workspace").standardizedFileURL
    XCTAssertTrue(LocalServer.installWebTools(into: tools), "every command is in the repo")
    for name in LocalServer.webToolNames {
      let file = LocalServer.webToolFrom[name] ?? name
      // The app's Resources are flat: a file is named by its last part (lib/olatext.py is olatext.py).
      let from = sources.flatMap { s in s.files.filter { ($0 as NSString).lastPathComponent == file }.map { (s.dir, $0) } }
      XCTAssertEqual(from.count, 1, "\(name): project.yml must put exactly one \(file) in the app, it puts \(from.map { "\($0.0)/\($0.1)" })")
      guard let (dir, rel) = from.first else { continue }
      let want = try Data(contentsOf: Self.apple.appendingPathComponent(dir).appendingPathComponent(rel))
      let got = try Data(contentsOf: tools.appendingPathComponent(name))
      XCTAssertEqual(got, want, "\(name): a run from the repo installs a different file than \(dir)/\(rel), the one the app carries")
    }
  }
}
