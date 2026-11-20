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
    server.stop()
    door.stop()
    do { try await api.signOut(session) } catch { print("FAIL  sign out: \(error)") }
    try? fm.removeItem(at: info)
    print("stopped")
    return 0
  }
}
