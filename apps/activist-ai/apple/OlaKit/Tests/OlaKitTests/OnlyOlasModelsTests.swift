import XCTest
@testable import OlaKit

/// OLA-249: the engine on this Mac answers only with Ola's models, whatever happens to its settings
/// file. The real opencode 2.3.0, started as the Mac app and `ola` start it (LocalServer), in a
/// scratch HOME, under sandbox-exec with every outbound connection but loopback refused (DNS too),
/// against a stand-in for Ola's model connection that counts the requests it gets
/// (tools/planted-model.py). Each case: the settings file deleted before the start, deleted while
/// it runs, damaged before the start and while it runs, and a planted settings file that allows
/// opencode's own provider; then only `ola/*` is listed, the default is `ola/general`, and one
/// request reaches the stand-in. A planted file that brings another provider with its own address
/// (as one in /Library/Application Support/opencode would, which outranks Ola's) trips the check:
/// at the start, before a request (the app's store), and while it runs (the engine's own watch);
/// the person gets the one sentence, and that provider's stand-in gets nothing.
final class OnlyOlasModelsTests: XCTestCase {
  let stub = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../../tools/planted-model.py").standardized

  // MARK: the verdict, without an engine

  func testOlasTwoModelsPassAndAnyOtherProviderDoesNot() {
    let general = ModelInfo(providerID: "ola", modelID: "general", name: "General")
    let hosted = ModelInfo(providerID: "ola", modelID: "hosted", name: "Hosted open model")
    let pickle = ModelInfo(providerID: "opencode", modelID: "big-pickle", name: "Big Pickle")
    // Both of Ola's (the hosted open model is the person's own fallback): not one exact name.
    XCTAssertEqual(ModelGuard.verdict(models: [general, hosted], defaultModel: general), .olas)
    XCTAssertEqual(ModelGuard.verdict(models: [general, hosted], defaultModel: hosted), .olas)
    XCTAssertEqual(ModelGuard.verdict(models: [], defaultModel: nil), .olas)
    XCTAssertEqual(ModelGuard.verdict(models: [general, pickle], defaultModel: general), .foreign(["opencode/big-pickle"]))
    XCTAssertEqual(ModelGuard.verdict(models: [general], defaultModel: pickle), .foreign(["opencode/big-pickle"]))
    XCTAssertEqual(ModelGuard.verdict(models: [pickle], defaultModel: pickle), .foreign(["opencode/big-pickle"]))
  }

  func testTheEngineGetsItsSettingsInItsEnvironmentAndNoFreeModels() throws {
    let fm = FileManager.default
    let t = fm.temporaryDirectory.appendingPathComponent("ola-only-env-\(getpid())")
    let saved = (LocalServer.support, LocalServer.skillsHome, LocalServer.skillsSource, LocalServer.webToolsSource, LocalServer.pluginsSource, LocalServer.pluginsHome)
    defer { (LocalServer.support, LocalServer.skillsHome, LocalServer.skillsSource, LocalServer.webToolsSource, LocalServer.pluginsSource, LocalServer.pluginsHome) = saved; try? fm.removeItem(at: t) }
    (LocalServer.support, LocalServer.skillsHome, LocalServer.skillsSource, LocalServer.webToolsSource, LocalServer.pluginsSource, LocalServer.pluginsHome) = (t.appendingPathComponent("support"), t.appendingPathComponent("skills"), nil, nil, nil, t.appendingPathComponent("plugins"))
    let s = LocalServer(folder: t)
    s.stateBase = t.appendingPathComponent("state")
    // A check cannot loosen them either.
    s.extraEnvironment = ["OPENCODE_DISABLE_FREE_MODELS": "0", "OPENCODE_CONFIG_CONTENT": "{}"]
    let env = try s.prepare(route: .pasted(token: "made-up", modelURL: "http://127.0.0.1:1/v1"), password: "pw")
    let file = try String(contentsOf: t.appendingPathComponent("state/config/opencode/opencode.jsonc"), encoding: .utf8)
    XCTAssertEqual(env["OPENCODE_CONFIG_CONTENT"], file)
    XCTAssertTrue(file.contains(#""model": "ola/general""#))
    XCTAssertEqual(env["OPENCODE_DISABLE_FREE_MODELS"], "1")
    XCTAssertEqual(env["OPENCODE_DISABLE_MODELS_FETCH"], "1")
  }

  // MARK: the real engine, no network

  enum Plant { case none, opencodeAllowed, otherProvider }
  enum Change { case none, deleteBeforeStart, damageBeforeStart, deleteWhileRunning, damageWhileRunning, plantWhileRunning }

  func testSettingsFileDeletedBeforeTheStart() async throws { try await onlyOla(.deleteBeforeStart) }
  func testSettingsFileDeletedWhileItRuns() async throws { try await onlyOla(.deleteWhileRunning) }
  func testSettingsFileDamagedBeforeTheStart() async throws { try await onlyOla(.damageBeforeStart) }
  func testSettingsFileDamagedWhileItRuns() async throws { try await onlyOla(.damageWhileRunning) }
  func testPlantedFileAllowingOpencodesOwnProviderFindsNoModelThere() async throws { try await onlyOla(.deleteBeforeStart, plant: .opencodeAllowed) }

  /// Another provider planted before the start: the engine is stopped before anything is sent.
  func testPlantedProviderAtTheStartStopsTheEngine() async throws {
    try XCTSkipIf(LocalServer.binary == nil, "no opencode 2.3.0 on this Mac (tools/install-local-opencode.sh)")
    let r = try await Rig.make(self, plant: .otherProvider, plantAtStart: true)
    defer { r.end() }
    r.server.afterPrepare = { try FileManager.default.removeItem(at: r.settingsFile) }
    do {
      _ = try await r.server.start(modelToken: "made-up-token", modelURL: "http://127.0.0.1:\(r.ola.port)/v1")
      XCTFail("the engine started with another provider's model on offer")
    } catch let LocalServer.Failure.notOlasModels(names) {
      XCTAssertTrue(names.contains { $0.hasPrefix("other/") }, "\(names)")
      XCTAssertEqual(LocalServer.Failure.notOlasModels(names).errorDescription, ModelGuard.stopped)
    }
    XCTAssertFalse(r.server.isRunning)
    do { let got = try await r.other.count(); XCTAssertEqual(got, 0) }
    do { let got = try await r.ola.count(); XCTAssertEqual(got, 0) }
  }

  /// Another provider planted while it runs, the engine's watch slowed down: the app's store
  /// refuses the request with the sentence and asks for the engine to be stopped.
  @MainActor
  func testPlantedProviderWhileItRunsIsRefusedBeforeTheRequest() async throws {
    try XCTSkipIf(LocalServer.binary == nil, "no opencode 2.3.0 on this Mac (tools/install-local-opencode.sh)")
    let r = try await Rig.make(self, plant: .otherProvider, plantAtStart: false)
    defer { r.end() }
    r.server.watchEvery = 3600
    let config = try await r.server.start(modelToken: "made-up-token", modelURL: "http://127.0.0.1:\(r.ola.port)/v1")
    try r.plantNow(deletingOlas: true)
    let client = OpenCodeClient(config)
    try await waitFor("the planted provider is offered") { if case .foreign = await ModelGuard.check(client) { return true }; return false }
    let store = OlaStore(config: config)
    var asked = 0
    store.onForeignModels = { asked += 1; r.server.stop() }
    await store.sendToOla("Summarize the made-up survey.")
    XCTAssertEqual(store.problem?.text, ModelGuard.stopped)
    XCTAssertEqual(asked, 1)
    XCTAssertTrue(store.sessions.isEmpty, "a session was made")
    XCTAssertFalse(r.server.isRunning)
    do { let got = try await r.other.count(); XCTAssertEqual(got, 0) }
    do { let got = try await r.ola.count(); XCTAssertEqual(got, 0) }
  }

  /// Another provider planted while it runs: the engine's own watch stops it within seconds and
  /// says so (the app and `ola` show the sentence from there), and nothing reaches that provider.
  func testPlantedProviderWhileItRunsStopsTheEngineByItself() async throws {
    try XCTSkipIf(LocalServer.binary == nil, "no opencode 2.3.0 on this Mac (tools/install-local-opencode.sh)")
    let r = try await Rig.make(self, plant: .otherProvider, plantAtStart: false)
    defer { r.end() }
    r.server.watchEvery = 1
    let tripped = Flag()
    r.server.onForeignModels = { names in tripped.set(names) }
    _ = try await r.server.start(modelToken: "made-up-token", modelURL: "http://127.0.0.1:\(r.ola.port)/v1")
    XCTAssertTrue(r.server.isRunning)
    try r.plantNow(deletingOlas: true)
    try await waitFor("the engine's watch stops it") { tripped.names != nil }
    XCTAssertTrue(tripped.names!.contains { $0.hasPrefix("other/") }, "\(tripped.names!)")
    XCTAssertFalse(r.server.isRunning)
    do { let got = try await r.other.count(); XCTAssertEqual(got, 0) }
  }

  /// One case of the five that must keep Ola working: only Ola's models, and one request that
  /// reaches only Ola's stand-in.
  func onlyOla(_ change: Change, plant: Plant = .none) async throws {
    try XCTSkipIf(LocalServer.binary == nil, "no opencode 2.3.0 on this Mac (tools/install-local-opencode.sh)")
    let r = try await Rig.make(self, plant: plant, plantAtStart: true)
    defer { r.end() }
    let tripped = Flag()
    r.server.onForeignModels = { names in tripped.set(names) }
    switch change {
    case .deleteBeforeStart: r.server.afterPrepare = { try FileManager.default.removeItem(at: r.settingsFile) }
    case .damageBeforeStart: r.server.afterPrepare = { try #"{ "providers": { "ola": "#.write(to: r.settingsFile, atomically: true, encoding: .utf8) }
    default: break
    }
    let config = try await r.server.start(modelToken: "made-up-token", modelURL: "http://127.0.0.1:\(r.ola.port)/v1")
    let client = OpenCodeClient(config)
    switch change {
    case .deleteWhileRunning: try FileManager.default.removeItem(at: r.settingsFile)
    case .damageWhileRunning: try #"{ "model": "opencode/big-pickle", "providers": "#.write(to: r.settingsFile, atomically: true, encoding: .utf8)
    default: break
    }
    if change == .deleteWhileRunning || change == .damageWhileRunning {
      // opencode reloads a changed settings file within about 100 ms; it fell back within 3 s (investigator, build 25).
      try await Task.sleep(nanoseconds: 4_000_000_000)
    }
    let models = try await client.models()
    XCTAssertFalse(models.isEmpty, "no models at all (\(change))")
    XCTAssertEqual(Set(models.map(\.providerID)), ["ola"], "\(change): \(models.map(\.id))")
    do { let got = try await client.defaultModel()?.id; XCTAssertEqual(got, "ola/general", "\(change)") }
    do { let got = await ModelGuard.check(client); XCTAssertEqual(got, .olas) }

    let session = try await client.createSession(title: "only Ola check")
    try await client.prompt(session.id, text: "Say hello.")
    try await waitFor("the request reaches Ola's stand-in") { (try? await r.ola.count()) ?? 0 > 0 }
    try await waitFor("the request finishes") { (try? await client.active().contains(session.id)) == false }
    let said = String(decoding: JSON.array(try await client.messages(session.id)).data, as: UTF8.self)
    XCTAssertFalse(said.contains("big-pickle"), said)
    XCTAssertTrue(said.contains("Hello."), "Ola's stand-in's answer is not in the conversation: \(said.prefix(600))")
    do { let got = try await r.other.count(); XCTAssertEqual(got, 0) }
    XCTAssertNil(tripped.names, "the check stopped an engine that offered only Ola's models")
    XCTAssertTrue(r.server.isRunning)
  }

  func waitFor(_ what: String, seconds: TimeInterval = 60, _ ok: () async -> Bool) async throws {
    let t0 = Date()
    while Date().timeIntervalSince(t0) < seconds {
      if await ok() { return }
      try await Task.sleep(nanoseconds: 300_000_000)
    }
    XCTFail("timed out: \(what)")
    throw CancellationError()
  }

  final class Flag: @unchecked Sendable {
    private let lock = NSLock()
    private var value: [String]?
    var names: [String]? { lock.withLock { value } }
    func set(_ n: [String]) { lock.withLock { value = n } }
  }

  /// A stand-in model on loopback that counts the requests it gets.
  final class Stub {
    let process = Process()
    let port: Int
    init(_ script: URL) throws {
      let out = Pipe()
      process.executableURL = URL(fileURLWithPath: "/usr/bin/python3")
      process.arguments = [script.path]
      process.standardOutput = out
      try process.run()
      let first = String(decoding: out.fileHandleForReading.availableData, as: UTF8.self)
      guard let p = first.split(separator: "\n").first.flatMap({ $0.hasPrefix("port ") ? Int($0.dropFirst(5)) : nil }) else { throw OlaError.badReply(first) }
      port = p
    }
    func count() async throws -> Int {
      let (d, _) = try await URLSession.shared.data(from: URL(string: "http://127.0.0.1:\(port)/count")!)
      return (JSON.parse(d) ?? .null)["chat"].int ?? -1
    }
    func end() { if process.isRunning { process.terminate() } }
  }

  /// A scratch Ola: its folders, Ola's stand-in, another provider's stand-in, and the server.
  final class Rig {
    let t: URL
    let ola: Stub, other: Stub
    let server: LocalServer
    let planted: URL
    let plantText: String?
    let saved: (URL, URL, URL?, URL?, URL?, URL)
    var settingsFile: URL { t.appendingPathComponent("state/config/opencode/opencode.jsonc") }

    static func make(_ test: OnlyOlasModelsTests, plant: Plant, plantAtStart: Bool) async throws -> Rig { try Rig(test, plant: plant, plantAtStart: plantAtStart) }

    init(_ test: OnlyOlasModelsTests, plant: Plant, plantAtStart: Bool) throws {
      let fm = FileManager.default
      t = fm.temporaryDirectory.resolvingSymlinksInPath().appendingPathComponent("ola-only-\(getpid())-\(UUID().uuidString.prefix(8))")
      saved = (LocalServer.support, LocalServer.skillsHome, LocalServer.skillsSource, LocalServer.webToolsSource, LocalServer.pluginsSource, LocalServer.pluginsHome)
      (LocalServer.support, LocalServer.skillsHome, LocalServer.skillsSource, LocalServer.webToolsSource, LocalServer.pluginsSource, LocalServer.pluginsHome) = (t.appendingPathComponent("support"), t.appendingPathComponent("skills"), nil, nil, nil, t.appendingPathComponent("plugins"))
      let project = t.appendingPathComponent("project"), home = t.appendingPathComponent("home")
      for d in [project, home] { try fm.createDirectory(at: d, withIntermediateDirectories: true) }
      ola = try Stub(test.stub)
      other = try Stub(test.stub)
      server = LocalServer(folder: project)
      server.stateBase = t.appendingPathComponent("state")
      server.pidFileName = nil
      server.extraEnvironment["HOME"] = home.path
      // No network: only loopback (both stand-ins and the engine itself); DNS refused too.
      let profile = """
      (version 1)
      (allow default)
      (deny network-outbound)
      (allow network-outbound (remote ip "localhost:*"))
      """
      server.launchPrefix = ["/usr/bin/sandbox-exec", "-p", profile]
      // A settings file planted where opencode reads one besides Ola's (here OPENCODE_CONFIG; one
      // in /Library/Application Support/opencode outranks even that, and is read the same way).
      planted = t.appendingPathComponent("planted/opencode.json")
      try fm.createDirectory(at: planted.deletingLastPathComponent(), withIntermediateDirectories: true)
      switch plant {
      case .none: plantText = nil
      case .opencodeAllowed:
        plantText = #"{ "model": "opencode/big-pickle", "enabled_providers": ["opencode", "ola"], "policies": [ { "action": "provider.use", "resource": "opencode", "effect": "allow" } ] }"#
      case .otherProvider:
        plantText = """
        { "providers": { "other": { "name": "Other", "package": "@opencode/ai/providers/openai-compatible", "settings": { "baseURL": "http://127.0.0.1:\(other.port)/v1", "apiKey": "made-up" },
            "models": { "x": { "modelID": "x", "name": "X", "capabilities": { "tools": true, "input": ["text"], "output": ["text"] }, "limit": { "context": 8000, "output": 1000 } } } } },
          "model": "other/x",
          "policies": [ { "action": "provider.use", "resource": "other", "effect": "allow" } ] }
        """
      }
      if plantText != nil {
        server.extraEnvironment["OPENCODE_CONFIG"] = planted.path
        if plantAtStart { try plantNow() }
      }
    }

    /// Plants the file. While the engine runs, Ola's own settings file goes too: Ola's file, read
    /// before an OPENCODE_CONFIG file, denies every other provider, so a planted file of that kind
    /// takes effect only once Ola's is gone (one in /Library/Application Support/opencode outranks
    /// Ola's either way).
    func plantNow(deletingOlas: Bool = false) throws {
      try plantText?.write(to: planted, atomically: true, encoding: .utf8)
      if deletingOlas { try FileManager.default.removeItem(at: settingsFile) }
    }

    func end() {
      server.stop()
      ola.end()
      other.end()
      (LocalServer.support, LocalServer.skillsHome, LocalServer.skillsSource, LocalServer.webToolsSource, LocalServer.pluginsSource, LocalServer.pluginsHome) = saved
      try? FileManager.default.removeItem(at: t)
    }
  }
}
