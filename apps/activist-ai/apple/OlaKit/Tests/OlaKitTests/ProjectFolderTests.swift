import XCTest
@testable import OlaKit

/// OLA-341: an empty new session on this Mac named ~/ola-bart, the machine's folder, instead of the
/// folder Ola works in here.
final class ProjectFolderTests: XCTestCase {
  func testEmptyLocalFolderIsNamed() {
    XCTAssertEqual(OlaStore.projectFolder(firstSession: nil, configFolder: "/Users/bart/Documents/notes"), "~/Documents/notes")
  }

  func testSessionsFolderWins() {
    XCTAssertEqual(OlaStore.projectFolder(firstSession: "/Users/admin/ola-bart", configFolder: "/Users/bart/x"), "~/ola-bart")
  }

  func testTheMachineWithNoSessions() {
    XCTAssertEqual(OlaStore.projectFolder(firstSession: nil, configFolder: nil), "~/ola-bart")
  }

  func testConfigCarriesTheFolderAndStaysEqualWithout() {
    var c = ServerConfig(url: URL(string: "http://127.0.0.1:1")!, password: "x")
    XCTAssertNil(c.folder)
    XCTAssertEqual(c, ServerConfig(url: URL(string: "http://127.0.0.1:1")!, password: "x"))
    c.folder = "/Users/bart/f"
    XCTAssertEqual(c.folder, "/Users/bart/f")
  }
}
