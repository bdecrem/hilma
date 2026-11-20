import Foundation
import XCTest
@testable import OlaKit

/// OLA-142: "yes for the rest of this session" covers the session's later web steps (a search, a
/// download, a lookup, however wrapped) and nothing else, is never opencode's own lasting "always",
/// and goes to whoever answers for the runtime; and "Lots of permissions" is one switch per runtime.
/// The machine's side is `bart/permissions-check.mjs` (real opencode).
@MainActor
final class SessionYesTests: XCTestCase {
  var saved: UserDefaults!
  let suite = "cx.ola.sessionyes.test.\(getpid())"

  override func setUp() async throws {
    saved = LocalSettings.defaults
    LocalSettings.defaults = UserDefaults(suiteName: suite)!
  }

  override func tearDown() async throws {
    UserDefaults.standard.removePersistentDomain(forName: suite)
    LocalSettings.defaults = saved
    MachinePermissions.doorPortOverride = nil
  }

  func testTheKinds() {
    // The open model's wrappings of a web step are all one kind.
    XCTAssertEqual(SessionYes.kind(action: "shell", resources: ["ola-search \"rent strike\" 2>&1", "head -20"]), "web")
    XCTAssertEqual(SessionYes.kind(action: "shell", resources: ["ola-fetch \"https://example.org/a.pdf\" 2>&1", "tail -5"]), "web")
    XCTAssertEqual(SessionYes.kind(action: "bash", resources: ["ola-lookup \"doi:10.1/x\""]), "web")
    // A web command beside a real one is a command, not a web step.
    XCTAssertEqual(SessionYes.kind(action: "shell", resources: ["ola-search x", "rm -rf notes"]), "shell")
    XCTAssertEqual(SessionYes.kind(action: "shell", resources: ["ls"]), "shell")
    XCTAssertEqual(SessionYes.kind(action: "edit", resources: ["a.md"]), "edit")
  }

  /// A stand-in opencode: the waiting requests per session, and every answer it got.
  final class Stub: @unchecked Sendable {
    let lock = NSLock()
    var pending: [JSON] = []
    var replies: [(String, String)] = []
    func reply(_ id: String, _ d: String) { lock.withLock { replies.append((id, d)); pending.removeAll { $0["id"].str == id } } }
    var got: [(String, String)] { lock.withLock { replies } }
    func add(_ id: String, _ session: String, _ action: String, _ resources: [String]) {
      lock.withLock { pending.append(.object(["id": .string(id), "sessionID": .string(session), "action": .string(action), "resources": .array(resources.map(JSON.string))])) }
    }
  }

  func stub() async throws -> (MiniHTTPServer, Stub, UInt16) {
    let st = Stub()
    let s = try MiniHTTPServer(host: "127.0.0.1", port: 0) { req, res in
      let parts = req.path.split(separator: "/").map(String.init)
      if req.method == "GET", parts.count == 4, parts[3] == "permission" {
        let mine = st.lock.withLock { st.pending.filter { $0["sessionID"].str == parts[2] } }
        return await res.send(200, JSON.object(["data": .array(mine)]).data)
      }
      if req.method == "POST", parts.count == 6, parts[5] == "reply" {
        st.reply(parts[4], (JSON.parse(req.body) ?? .null)["decision"].str)
        return await res.send(200, Data("{}".utf8))
      }
      await res.send(200, Data("{}".utf8))
    }
    return (s, st, try await s.start())
  }

  func asked(_ id: String, _ session: String, _ action: String, _ resources: [String]) -> JSON {
    ["type": "permission.asked", "data": .object(["id": .string(id), "sessionID": .string(session), "action": .string(action), "resources": .array(resources.map(JSON.string))])]
  }

  func waitFor(_ ok: @escaping @MainActor () -> Bool) async {
    var n = 0
    while !ok(), n < 50 {
      try? await Task.sleep(nanoseconds: 50_000_000)
      n += 1
    }
  }

  /// "On this Mac": the store keeps the yes and answers "once", never "always".
  func testOnThisMacTheYesCoversTheSessionsWebStepsOnly() async throws {
    let (server, st, port) = try await stub()
    defer { server.stop() }
    PermissionSettings.mode = .ask
    let store = OlaStore(config: ServerConfig(url: URL(string: "http://127.0.0.1:\(port)")!, password: "pw"))
    PermissionSettings.wire(store)
    XCTAssertEqual(store.runtime, .local)
    st.add("per_1", "ses_a", "shell", ["ola-search \"tenant union\" 2>&1", "head -20"])
    let status = await store.answerForSession(session: "ses_a", request: "per_1")
    XCTAssertEqual(status, 204)
    XCTAssertEqual(st.got.map(\.1), ["once"], "opencode heard once, never always")
    XCTAssertEqual(store.yesKinds("ses_a"), ["web"])

    // A download and a lookup later in the same session: answered here, no card.
    st.add("per_2", "ses_a", "shell", ["ola-fetch \"https://example.org/a.pdf\" 2>&1", "tail -5"])
    store.handle(asked("per_2", "ses_a", "shell", ["ola-fetch \"https://example.org/a.pdf\" 2>&1", "tail -5"]))
    st.add("per_3", "ses_a", "bash", ["ola-lookup \"doi:10.1/x\""])
    store.handle(asked("per_3", "ses_a", "bash", ["ola-lookup \"doi:10.1/x\""]))
    await waitFor { st.got.count >= 3 }
    // per_2 and per_3 are answered at once, so they can reach the server in either order.
    XCTAssertEqual(st.got.map(\.0).sorted(), ["per_1", "per_2", "per_3"])
    XCTAssertEqual(st.got.map(\.1), ["once", "once", "once"])

    // A command in that session, and a web step in another session: not covered.
    store.handle(asked("per_4", "ses_a", "shell", ["rm -rf notes"]))
    store.handle(asked("per_5", "ses_b", "shell", ["ola-search \"x\""]))
    try await Task.sleep(nanoseconds: 400_000_000)
    XCTAssertEqual(st.got.count, 3, "a command or another session's search was answered")
  }

  /// The Mac on the Ola machine: the yes goes to the machine's door (its approver keeps it),
  /// never to opencode directly.
  func testTheMacOnTheMachineSendsTheYesToTheDoor() async throws {
    let (oc, ocStub, ocPort) = try await stub()
    let (door, doorStub, doorPort) = try await stub()
    defer { oc.stop(); door.stop() }
    MachinePermissions.doorPortOverride = Int(doorPort)
    // "localhost", not 127.0.0.1: the machine as seen from the Mac (the cloud runtime).
    let store = OlaStore(config: ServerConfig(url: URL(string: "http://localhost:\(ocPort)")!, password: "pw"))
    XCTAssertEqual(store.runtime, .cloud)
    ocStub.add("per_1", "ses_a", "shell", ["ola-search \"x\""])
    let status = await store.answerForSession(session: "ses_a", request: "per_1")
    XCTAssertEqual(status, 204)
    XCTAssertEqual(doorStub.got.map(\.1), ["always"], "the door got the session yes")
    XCTAssertTrue(ocStub.got.isEmpty, "opencode was answered directly")
  }

  /// The phone through its Mac: the relay hands the session yes to the Mac app; anything else
  /// goes through to the server as before.
  func testTheRelayKeepsThePhonesYesForTheMac() async throws {
    let (up, upStub, upPort) = try await stub()
    defer { up.stop() }
    let book = PairingBook(file: nil)
    let secret = PairingCode.newSecret()
    book.add(secret: secret)
    let relay = MacRelay(book: book, macName: "Test Mac")
    let got = Calls()
    relay.sessionYes = { s, r in got.add("\(s) \(r)"); return 204 }
    let port = try await relay.start(host: "127.0.0.1", port: 0)
    defer { relay.stop() }
    relay.setUpstream(ServerConfig(url: URL(string: "http://127.0.0.1:\(upPort)")!, password: "pw"), mode: "mac")
    let phone = OpenCodeClient(ServerConfig(url: URL(string: "http://127.0.0.1:\(port)")!, password: secret, viaMac: true))
    try await phone.reply(session: "ses_a", request: "per_1", decision: .always)
    XCTAssertEqual(got.all, ["ses_a per_1"])
    XCTAssertTrue(upStub.got.isEmpty, "the always went to opencode")
    try await phone.reply(session: "ses_a", request: "per_2", decision: .once)
    XCTAssertEqual(upStub.got.map(\.1), ["once"])
  }

  final class Calls: @unchecked Sendable {
    let lock = NSLock()
    var list: [String] = []
    func add(_ s: String) { lock.withLock { list.append(s) } }
    var all: [String] { lock.withLock { list } }
  }

  /// One "Lots of permissions" per runtime: a store goes by its own runtime's switch, and changing
  /// the local one leaves the cloud one alone.
  func testOneSwitchPerRuntime() async {
    PermissionSettings.mode = .ask
    PermissionSettings.cloudMode = .lots
    let local = OlaStore(config: ServerConfig(url: URL(string: "http://127.0.0.1:1")!, password: "x"))
    let cloud = OlaStore(config: ServerConfig(url: URL(string: "http://admins-mac-mini.tailde799a.ts.net:4310")!, password: "x"))
    PermissionSettings.wire(local)
    PermissionSettings.wire(cloud)
    XCTAssertEqual(local.goesAhead?("shell", ["ls"]), false)
    XCTAssertEqual(cloud.goesAhead?("shell", ["ls"]), true)
    XCTAssertFalse(local.serverAnswers())
    XCTAssertTrue(cloud.serverAnswers())
    await PermissionSettings.set(.lots)
    XCTAssertEqual(local.goesAhead?("shell", ["ls"]), true)
    PermissionSettings.cloudMode = .ask
    XCTAssertEqual(cloud.goesAhead?("shell", ["ls"]), false)
    XCTAssertEqual(PermissionSettings.mode, .lots, "the cloud switch moved the local one")
    XCTAssertEqual(PermissionSettings.mode(.cloud), .ask)
    // The runtime of each kind of server.
    XCTAssertEqual(Runtime.of(ServerConfig(url: URL(string: "http://x.ts.net:4312")!, password: "k", account: true)), .cloud)
    XCTAssertEqual(Runtime.of(ServerConfig(url: URL(string: "http://imac.ts.net:4330")!, password: "s", viaMac: true)), .local)
  }
}
