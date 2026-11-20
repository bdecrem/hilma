import Foundation
import XCTest
@testable import OlaKit

/// The iPhone's "Where Ola works": which place a phone starts in, how the machine is reached, and
/// the words a person reads.
final class PhoneWhereTests: XCTestCase {
  var suite: UserDefaults!
  var suiteName = ""

  override func setUp() {
    suiteName = "phone-where-\(UUID().uuidString)"
    suite = UserDefaults(suiteName: suiteName)!
    PhoneWhere.defaults = suite
    PhoneWhere.environment = [:]
    AccountKeeper.defaults = suite
  }

  override func tearDown() {
    suite.removePersistentDomain(forName: suiteName)
    PhoneWhere.defaults = .standard
    PhoneWhere.environment = ProcessInfo.processInfo.environment
    AccountKeeper.defaults = .standard
  }

  func testFreshInstallChoosesNothing() {
    XCTAssertNil(PhoneWhere.mode)
    XCTAssertFalse(PhoneWhere.ready(.mac))
    XCTAssertFalse(PhoneWhere.ready(.machine))
  }

  func testAPhonePairedBeforeKeepsItsMac() {
    suite.set("http://imac.tail1234.ts.net:4330", forKey: Credentials.addressKey)
    XCTAssertEqual(PhoneWhere.mode, .mac)
    XCTAssertTrue(PhoneWhere.ready(.mac))
  }

  func testTheChoiceIsKeptAndSignInIsReadWithoutTheKeychain() {
    suite.set("http://imac.tail1234.ts.net:4330", forKey: Credentials.addressKey)
    PhoneWhere.mode = .machine
    XCTAssertEqual(PhoneWhere.mode, .machine)
    XCTAssertFalse(PhoneWhere.ready(.machine))
    suite.set("phonetest", forKey: AccountKeeper.handleKey)
    XCTAssertTrue(PhoneWhere.ready(.machine))
    PhoneWhere.mode = .mac
    XCTAssertEqual(PhoneWhere.mode, .mac)
  }

  /// The cloud is the website's project, over the internet (OLA-150): no machine address, no
  /// Tailscale, the device key as a Bearer token, never the machine's password.
  func testTheCloudIsTheProjectOnTheAccountsServer() {
    let c = OlaCloud.config(token: "olap1.abcdefgh", project: "hello", base: URL(string: "https://app.ola.cx")!)
    XCTAssertEqual(c.url.absoluteString, "https://app.ola.cx/api/device/w/hello/oc")
    XCTAssertTrue(c.account)
    XCTAssertEqual(Runtime.of(c), .cloud)
    let client = OpenCodeClient(c)
    XCTAssertEqual(client.request("GET", "/api/session").value(forHTTPHeaderField: "Authorization"), "Bearer olap1.abcdefgh")
    XCTAssertEqual(client.url("/api/session").absoluteString, "https://app.ola.cx/api/device/w/hello/oc/api/session")
    // The project's files are the website's, beside its opencode.
    XCTAssertEqual(client.url("/project/api/files").absoluteString, "https://app.ola.cx/api/device/w/hello/api/files")
    XCTAssertEqual(OlaCloud.project(of: c), "hello")
    let mac = OpenCodeClient(ServerConfig(url: URL(string: "http://m.ts.net:4310")!, password: "pw"))
    XCTAssertTrue(mac.request("GET", "/api/session").value(forHTTPHeaderField: "Authorization")!.hasPrefix("Basic "))
    XCTAssertEqual(mac.url("/project/api/files").absoluteString, "http://m.ts.net:4310/project/api/files")
  }

  func testThePhonesCloudIsTheRememberedProjectOnceSignedIn() {
    XCTAssertNil(PhoneWhere.config(.machine))
    OlaCloud.defaults = suite
    defer { OlaCloud.defaults = .standard }
    OlaCloud.chosen = "hello"
    XCTAssertNil(PhoneWhere.config(.machine), "not signed in")
  }

  func testWords() {
    XCTAssertFalse(PhoneWhere.unreachableLine.contains("Tailscale"))
    XCTAssertTrue(PhoneWhere.words(AccountError.unreachable).contains("this phone"))
    XCTAssertTrue(PhoneWhere.words(AccountError.passkeysNotInThisVersion).contains("Ola on the phone can\u{2019}t use passkeys yet"))
    XCTAssertEqual(PhoneWhere.words(AccountError.wrongPassword), AccountError.wrongPassword.errorDescription)
    // Nothing Bart reads names the plumbing.
    for line in [PhoneWhere.unreachableLine, OlaCloud.noProject, PhoneWhere.passkeyWords, PhoneWhere.words(AccountError.unreachable)] {
      for word in ["relay", "opencode", "made-up", "Tailscale", "device/w"] { XCTAssertFalse(line.contains(word), line) }
    }
  }
}
