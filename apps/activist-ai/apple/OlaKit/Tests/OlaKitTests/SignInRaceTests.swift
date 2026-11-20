import Foundation
import XCTest
@testable import OlaKit

/// OLA-252: a fresh sign-in on the Mac was forgotten a second later ("You've been signed out on this
/// Mac"), or the app crashed in AccountController.route(), when a server answer about an earlier
/// sign-in came back after it. A 401 says something only about the token its request was sent with.
final class SignInRaceTests: XCTestCase {
  final class Box: @unchecked Sendable {
    let lock = NSLock()
    var value: String
    init(_ v: String) { value = v }
    func get() -> String { lock.withLock { value } }
    func set(_ v: String) { lock.withLock { value = v } }
  }

  /// The model door, with a request on its way under sign-in A when the person signs in again as B:
  /// A's 401 is that request's answer only. The door is not closed for good, the app is not told
  /// "signed out", and the next request goes through with B. (Before the fix: the door refused
  /// everything from then on and told the app, which forgot the new sign-in.)
  func testA401AboutAnEarlierSignInLeavesTheNewOneAlone() async throws {
    let gateway = try MiniHTTPServer(host: "127.0.0.1", port: 0) { req, res in
      let bearer = (req.header("authorization") ?? "").replacingOccurrences(of: "Bearer ", with: "")
      if bearer == "token-A" {
        // A was ended on the server (a newer sign-in, a reset password); the answer arrives late.
        try? await Task.sleep(nanoseconds: 600_000_000)
        return await res.send(401, JSON.object(["error": "signed_out"]).data)
      }
      if bearer == "token-B" { return await res.send(200, JSON.object(["object": "list", "data": .array([])]).data) }
      return await res.send(401, JSON.object(["error": "signed_out"]).data)
    }
    let port = try await gateway.start()
    defer { gateway.stop() }
    let current = Box("token-A")
    let door = ModelDoor(api: AccountAPI(base: URL(string: "http://127.0.0.1:\(port)")!)) { current.get() }
    let told = Counter()
    door.onSignedOut = { told.add() }
    try await door.start()
    defer { door.stop() }
    @Sendable func models() async throws -> Int {
      var r = URLRequest(url: URL(string: "http://127.0.0.1:\(door.port)/v1/models")!)
      r.setValue("Bearer \(door.key)", forHTTPHeaderField: "Authorization")
      let (_, res) = try await URLSession(configuration: .ephemeral).data(for: r)
      return (res as? HTTPURLResponse)?.statusCode ?? 0
    }
    async let first = models()
    try await Task.sleep(nanoseconds: 200_000_000)
    current.set("token-B")   // the person signed in again while A's request was on its way
    let firstStatus = try await first
    XCTAssertEqual(firstStatus, 401, "the old request itself is refused")
    XCTAssertFalse(door.isSignedOut, "the door closed for good on an answer about an earlier sign-in")
    XCTAssertEqual(told.value, 0, "the app was told \"signed out\" about an earlier sign-in")
    let secondStatus = try await models()
    XCTAssertEqual(secondStatus, 200, "the new sign-in's request did not go through")

    // A 401 about the sign-in it holds now still ends it, once.
    current.set("token-A")
    let third = try await models()
    XCTAssertEqual(third, 401)
    XCTAssertTrue(door.isSignedOut)
    XCTAssertEqual(told.value, 1)
  }

  /// Which sign-in a refused request was about: only the one kept now counts.
  func testOnlyTheSignInKeptNowIsCurrent() {
    let saved = (SecretStore.backend, AccountKeeper.defaults)
    defer { (SecretStore.backend, AccountKeeper.defaults) = saved }
    SecretStore.backend = MemorySecrets()
    let suite = "ola.signin-race.\(getpid())"
    AccountKeeper.defaults = UserDefaults(suiteName: suite)!
    defer { UserDefaults().removePersistentDomain(forName: suite) }
    func session(_ t: String) -> AccountSession { AccountSession(token: t, expiresAt: nil, person: .init(handle: "appdriver", name: "Made up", admin: false), device: .init(id: "1", name: "Test Mac", kind: "mac")) }
    XCTAssertFalse(AccountKeeper.isCurrent("token-A"), "nothing kept")
    XCTAssertTrue(AccountKeeper.keep(session("token-A")))
    XCTAssertTrue(AccountKeeper.isCurrent("token-A"))
    XCTAssertTrue(AccountKeeper.keep(session("token-B")))
    XCTAssertFalse(AccountKeeper.isCurrent("token-A"), "an earlier sign-in's token")
    XCTAssertTrue(AccountKeeper.isCurrent("token-B"))
    XCTAssertFalse(AccountKeeper.isCurrent(nil))
    XCTAssertFalse(AccountKeeper.isCurrent(""))
  }
}
