import Foundation
import OlaKit

/// OLA_SERVE_LOCAL=1: the local runtime ("On this Mac") exactly as the Mac app sets it up, headless,
/// for the asks runner (evals/asks, OLA-231), which then talks to it the way the app does:
///
///   OLA_SERVE_LOCAL=1 OLA_ACCOUNT_BASE=https://app.ola.cx OLA_HANDLE=<made-up account>
///   OLA_ACCOUNT_PASSWORD_FILE=<file> OLA_LOCAL_FOLDER=<empty folder> OLA_SERVE_DIR=<scratch folder>
///   swift run olakit-selftest
///
/// It signs in with the name and password (the app's own AccountAPI.login), starts the model door
/// with that account and opencode in OLA_LOCAL_FOLDER through it (LocalServer: the app's config and
/// permissions, Ola's skills, web commands, ola-publish and plugins, from this checkout), writes
/// {"url","password"} to OLA_SERVE_DIR/server.json (mode 600), prints "ready", and stays up until its
/// standard input closes. Then it stops opencode and the door and signs out, so the key is removed on
/// the server. Never a window, never the Keychain, nothing under ~/Library: everything the app would
/// write there goes to OLA_SERVE_DIR. The password and the key are never printed.
enum ServeLocal {
  static func go(env: [String: String]) async -> Int32 {
    guard let b = env["OLA_ACCOUNT_BASE"], let base = URL(string: b), let handle = env["OLA_HANDLE"],
          let pf = env["OLA_ACCOUNT_PASSWORD_FILE"], let password = try? String(contentsOfFile: pf, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines),
          let folder = env["OLA_LOCAL_FOLDER"], let dir = env["OLA_SERVE_DIR"] else {
      print("FAIL  set OLA_ACCOUNT_BASE, OLA_HANDLE, OLA_ACCOUNT_PASSWORD_FILE, OLA_LOCAL_FOLDER and OLA_SERVE_DIR")
      return 2
    }
    SecretStore.disabled = true
    let fm = FileManager.default
    let scratch = URL(fileURLWithPath: dir)
    try? fm.createDirectory(at: scratch, withIntermediateDirectories: true)
    let repo = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../../..").standardized
    LocalServer.webToolsSource = repo.appendingPathComponent("workspace")
    LocalServer.skillsSource = repo.appendingPathComponent("skills")
    LocalServer.pluginsSource = repo.appendingPathComponent("workspace/plugins")
    LocalServer.support = scratch.appendingPathComponent("support")
    LocalServer.skillsHome = scratch.appendingPathComponent("skills")
    LocalServer.pluginsHome = scratch.appendingPathComponent("plugins")

    let api = AccountAPI(base: base, session: URLSession(configuration: .ephemeral))
    let session: AccountSession
    do {
      session = try await api.login(handle: handle, password: password, deviceName: "Ola asks runner (made up)")
    } catch {
      print("FAIL  sign in as \(handle): \((error as? LocalizedError)?.errorDescription ?? "\(error)")")
      return 1
    }
    let door = ModelDoor(api: api) { session.token }
    do { try await door.start() } catch {
      print("FAIL  the model door: \(error)")
      try? await api.signOut(session)
      return 1
    }
    let server = LocalServer(folder: URL(fileURLWithPath: folder))
    server.stateBase = scratch.appendingPathComponent("state")
    server.pidFileName = nil
    let config: ServerConfig
    do {
      config = try await server.start(route: .door(door))
    } catch {
      print("FAIL  opencode on this Mac: \(error.localizedDescription)")
      door.stop()
      try? await api.signOut(session)
      return 1
    }
    // The record of who made each file, as the app keeps it (OLA-303): every run bracketed, and the
    // model connection asked which model served each change (the design model is named).
    let record = LocalMadeBy(folder: URL(fileURLWithPath: folder), tools: LocalServer.support.appendingPathComponent("web-tools"))
    record.served = { sid, since in await door.served(session: sid, sinceMs: since) }
    _ = await record.endStale()
    let recorder = LocalTurnRecorder(record: record, client: OpenCodeClient(config))
    recorder.start()
    // The cards the Mac app would show (OLA-250): its own store on this server, Lots of permissions
    // on as the app's default, answering what the app answers by itself; the runner answers only
    // the cards, as a person does, and reads what is left on screen after an answer.
    let cards = await MainActor.run { AppCards(config: config, file: scratch.appendingPathComponent("cards.json")) }
    await cards.start()
    let info = scratch.appendingPathComponent("server.json")
    let body = try! JSONSerialization.data(withJSONObject: ["url": config.url.absoluteString, "password": config.password, "skills": server.skillStates.map(\.line)])
    fm.createFile(atPath: info.path, contents: body, attributes: [.posixPermissions: 0o600])
    print("ready  \(config.url.absoluteString)")
    fflush(stdout)
    // Up until whoever started this closes our standard input (or dies, which closes it too).
    await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
      Thread.detachNewThread {
        while readLine() != nil {}
        c.resume()
      }
    }
    await cards.stop()
    recorder.stop()
    server.stop()
    door.stop()
    do { try await api.signOut(session) } catch { print("FAIL  sign out: \(error)") }
    try? fm.removeItem(at: info)
    print("stopped")
    return 0
  }
}

/// OLA-250, Nov 22: the Mac app showed "Ola wants to run a command: Run publish.py" after the answer,
/// for a step that had run, and the card could not be answered. The asks runner talked to opencode
/// directly and answered every waiting request itself, so it could never see what the app shows.
/// This is the app's own store (OlaStore, the same code as the Mac and the phone) on the local
/// server, wired as the Mac app wires it with Lots of permissions on (its default): it answers the
/// steps the app answers by itself and keeps the cards a person must answer. Every 250 ms it writes
/// `cards.json`: per session, the card on screen now (or null), every card it showed, and whether
/// the conversation is shown as working. Made-up content only; nothing here is a secret.
@MainActor
final class AppCards {
  let store: OlaStore
  let file: URL
  private var seen: [String: [[String: Any]]] = [:]
  private var task: Task<Void, Never>?

  init(config: ServerConfig, file: URL) {
    store = OlaStore(config: config)
    store.goesAhead = { action, resources in PermissionSettings.goesAhead(action: action, resources: resources) }
    store.serverAnswers = { false }
    self.file = file
  }

  func start() {
    store.start()
    task = Task { [weak self] in
      while !Task.isCancelled {
        await self?.tick()
        try? await Task.sleep(nanoseconds: 250_000_000)
      }
    }
  }

  func stop() {
    task?.cancel()
    try? FileManager.default.removeItem(at: file)
  }

  static func describe(_ a: Approval) -> [String: Any] {
    [
      "id": a.id,
      "action": a.action,
      "title": a.title,
      "command": a.items.map { $0.detail ?? $0.label }.joined(separator: "\n"),
      "publishCard": a.card != nil,
      "at": Date().timeIntervalSince1970 * 1000,
    ]
  }

  private func tick() async {
    // Every conversation the server has, loaded the way the app loads the one on screen.
    for s in store.sessions where store.conversations[s.id] == nil { await store.open(s.id) }
    var out: [String: Any] = [:]
    for (id, c) in store.conversations {
      var card: Any = NSNull()
      if let a = c.approval {
        let d = Self.describe(a)
        card = d
        if !(seen[id] ?? []).contains(where: { ($0["id"] as? String) == a.id }) { seen[id, default: []].append(d) }
      }
      out[id] = ["card": card, "seen": seen[id] ?? [], "working": c.isRunning, "problem": store.problem?.text ?? NSNull()]
    }
    guard let data = try? JSONSerialization.data(withJSONObject: out) else { return }
    let tmp = file.appendingPathExtension("tmp")
    // Written whole, then renamed over the old one: a reader never sees half a file.
    if FileManager.default.createFile(atPath: tmp.path, contents: data) { rename(tmp.path, file.path) }
  }
}
