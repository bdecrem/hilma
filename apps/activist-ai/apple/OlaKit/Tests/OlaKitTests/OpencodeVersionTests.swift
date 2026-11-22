import XCTest
@testable import OlaKit

/// OLA-239: About Ola names the opencode inside, and it is the same release the app installs and the
/// branded fork is built from. A version bump that misses one of the three fails here.
final class OpencodeVersionTests: XCTestCase {
  static let apple = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../..").standardizedFileURL

  func testAboutCreditsNameTheInstalledOpencode() throws {
    let credits = try String(contentsOf: Self.apple.appendingPathComponent("Mac/Credits.rtf"), encoding: .isoLatin1)
    XCTAssertTrue(credits.contains("opencode \(OpencodeInstall.version)"), "Mac/Credits.rtf (About Ola) must say opencode \(OpencodeInstall.version)")
  }

  func testForkUpstreamIsTheInstalledOpencode() throws {
    let upstream = try String(contentsOf: Self.apple.appendingPathComponent("../opencode-fork/UPSTREAM"), encoding: .utf8)
    XCTAssertTrue(upstream.contains("tag=v\(OpencodeInstall.version)\n"), "opencode-fork/UPSTREAM must be tag=v\(OpencodeInstall.version)")
  }
}
