import Foundation
import XCTest
@testable import OlaKit

/// Each Keychain item is read at most once per launch, and only when asked for.
final class SecretStoreTests: XCTestCase {
  override func tearDown() {
    SecretStore.resetForTests(backend: KeychainBackend())
    super.tearDown()
  }

  func testEachKindIsReadOnceAndOnlyWhenAsked() {
    let mem = MemorySecrets([SecretKind.machinePassword.service: SecretItem(value: "pw"), SecretKind.modelToken.service: SecretItem(value: "tok")])
    SecretStore.resetForTests(backend: mem)
    let d = UserDefaults(suiteName: "ola.test.secrets.\(UUID().uuidString)")!
    LocalSettings.defaults = d
    defer { LocalSettings.defaults = .standard }
    XCTAssertEqual(mem.reads, 0, "nothing is read before it is needed")
    XCTAssertFalse(SecretStore.isKnown(.machinePassword))
    for _ in 0..<5 { XCTAssertEqual(SecretStore.value(.machinePassword), "pw") }
    for _ in 0..<5 { XCTAssertEqual(LocalSettings.token, "tok") }
    for _ in 0..<3 { XCTAssertNil(SecretStore.value(.account)) }
    XCTAssertEqual(SecretStore.readCount(.machinePassword), 1)
    XCTAssertEqual(SecretStore.readCount(.modelToken), 1)
    XCTAssertEqual(SecretStore.readCount(.account), 1, "a missing item is remembered as missing")
    XCTAssertEqual(SecretStore.readCount(.pushKey), 0)
    XCTAssertEqual(mem.reads, 3)
    // A write updates memory: no new read.
    SecretStore.save(.modelToken, "tok2")
    XCTAssertEqual(LocalSettings.token, "tok2")
    SecretStore.remove(.machinePassword)
    XCTAssertNil(SecretStore.value(.machinePassword))
    XCTAssertEqual(mem.reads, 3)
  }

  func testDisabledNeverTouchesTheBackend() {
    let mem = MemorySecrets([SecretKind.machinePassword.service: SecretItem(value: "pw")])
    SecretStore.resetForTests(backend: mem)
    Credentials.disabled = true
    defer { Credentials.disabled = false }
    XCTAssertNil(Credentials.load())
    XCTAssertNil(SecretStore.value(.machinePassword))
    XCTAssertEqual(mem.reads, 0)
  }

  func testImportTakesStdinAndNeverPrintsTheValue() {
    let mem = MemorySecrets()
    SecretStore.resetForTests(backend: mem)
    let d = UserDefaults(suiteName: "ola.test.import.\(UUID().uuidString)")!
    let secret = "s3cret-value-\(UUID().uuidString)"
    var (code, line) = SecretImport.run(["Ola", "--import-secret", "machine-password"], input: { secret + "\n" }, isTTY: false, defaults: d)
    XCTAssertEqual(code, 0, line)
    XCTAssertFalse(line.contains(secret))
    XCTAssertEqual(d.string(forKey: "ola.serverAddress"), ServerConfig.defaultAddress)
    SecretStore.resetForTests()
    XCTAssertEqual(SecretStore.value(.machinePassword), secret, "stored without the newline")
    (code, line) = SecretImport.run(["Ola", "--import-secret", "machine-password"], input: { "x" }, isTTY: true, defaults: d)
    XCTAssertEqual(code, 2, "typing a secret at a terminal is refused")
    (code, line) = SecretImport.run(["Ola", "--import-secret", "model-token"], input: { "  \n" }, isTTY: false, defaults: d)
    XCTAssertEqual(code, 1)
    (code, line) = SecretImport.run(["Ola", "--import-secret", "nonsense"], input: { "x" }, isTTY: false, defaults: d)
    XCTAssertEqual(code, 2)
    (code, line) = SecretImport.run(["Ola", "--import-secret", "push-key"], input: { "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----" }, isTTY: false, defaults: d)
    XCTAssertEqual(code, 2, "push-key needs its key id")
    (code, line) = SecretImport.run(["Ola", "--import-secret", "push-key", "--key-id", "ABCDE12345"], input: { "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----" }, isTTY: false, defaults: d)
    XCTAssertEqual(code, 0, line)
    XCTAssertEqual(SecretStore.item(.pushKey)?.note, "ABCDE12345")
    XCTAssertTrue(d.bool(forKey: "ola.push.ready"))
    (code, line) = SecretImport.run(["Ola", "--import-secret", "account"], input: { "not json" }, isTTY: false, defaults: d)
    XCTAssertEqual(code, 1)
    let session = AccountSession(token: "t", expiresAt: Date(timeIntervalSince1970: 2_000_000_000), person: .init(handle: "bart", name: "Bart", admin: true), device: .init(id: "d1", name: "iMac", kind: "mac"))
    (code, line) = SecretImport.run(["Ola", "--import-secret", "account"], input: { session.encoded() }, isTTY: false, defaults: d)
    XCTAssertEqual(code, 0, line)
    XCTAssertEqual(AccountSession.decode(SecretStore.value(.account)!), session)
  }

  /// The real Keychain, under a throwaway name, with no dialog possible: a write, a read by this
  /// process, a change in place, a removal.
  func testKeychainRoundTripUnderAThrowawayName() {
    SecretStore.servicePrefix = "cx.ola.throwaway-test-\(getpid())."
    SecretStore.resetForTests(backend: KeychainBackend())
    defer {
      SecretStore.remove(.modelToken)
      SecretStore.servicePrefix = nil
    }
    XCTAssertNil(SecretStore.value(.modelToken))
    XCTAssertTrue(SecretStore.save(.modelToken, "one"))
    SecretStore.resetForTests()
    XCTAssertEqual(SecretStore.value(.modelToken), "one")
    XCTAssertTrue(SecretStore.save(.modelToken, "two"), "changed in place")
    SecretStore.resetForTests()
    XCTAssertEqual(SecretStore.value(.modelToken), "two")
    SecretStore.remove(.modelToken)
    SecretStore.resetForTests()
    XCTAssertNil(SecretStore.value(.modelToken))
  }
}
