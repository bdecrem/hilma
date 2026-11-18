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

  func testTheDoorIsATailscaleNameAndCanBePointedElsewhere() {
    XCTAssertEqual(PhoneWhere.door.host, "admins-mac-mini.tailde799a.ts.net")
    XCTAssertEqual(PhoneWhere.door.port, 4312)
    PhoneWhere.environment = ["OLA_MACHINE_DOOR": "http://127.0.0.1:4999"]
    XCTAssertEqual(PhoneWhere.door.port, 4999)
  }

  func testTheDeviceKeyGoesAsABearerAndNeverAsTheMachinePassword() {
    let c = OpenCodeClient(PhoneWhere.machineConfig(token: "olap1.abcdefgh"))
    XCTAssertEqual(c.request("GET", "/api/session").value(forHTTPHeaderField: "Authorization"), "Bearer olap1.abcdefgh")
    let mac = OpenCodeClient(ServerConfig(url: URL(string: "http://m.ts.net:4310")!, password: "pw"))
    XCTAssertTrue(mac.request("GET", "/api/session").value(forHTTPHeaderField: "Authorization")!.hasPrefix("Basic "))
  }

  func testWords() {
    XCTAssertEqual(PhoneWhere.unreachableLine(tailscaleOn: false), "Turn on Tailscale on this phone.")
    XCTAssertTrue(PhoneWhere.unreachableLine(tailscaleOn: true).hasPrefix("It isn\u{2019}t answering"))
    XCTAssertTrue(PhoneWhere.words(AccountError.unreachable).contains("this phone"))
    XCTAssertTrue(PhoneWhere.words(AccountError.passkeysNotInThisVersion).contains("Ola on the phone can\u{2019}t use passkeys yet"))
    XCTAssertEqual(PhoneWhere.words(AccountError.wrongPassword), AccountError.wrongPassword.errorDescription)
    // Nothing Bart reads names the plumbing.
    for line in [PhoneWhere.unreachableLine(tailscaleOn: true), PhoneWhere.notAllowed, PhoneWhere.passkeyWords, PhoneWhere.words(AccountError.unreachable)] {
      for word in ["relay", "opencode", "made-up", "Tailscale name"] { XCTAssertFalse(line.contains(word), line) }
    }
  }
}
