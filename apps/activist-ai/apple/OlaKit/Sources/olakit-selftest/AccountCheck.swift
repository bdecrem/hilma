import Foundation
import OlaKit

/// OLA_ACCOUNT_CHECK=1: "On this Mac" for anyone with a login (2026-11-17), end to end, the way the
/// Mac app runs it: sign in with a name and password (the app's own AccountAPI.login), the model
/// door with the account's key, opencode started here in a scratch folder through that door, one tiny
/// request answered by Ola's model, then sign out and see the next request through the door refused.
///
///   OLA_ACCOUNT_CHECK=1 OLA_ACCOUNT_BASE=http://localhost:4795 OLA_HANDLE=<made-up account>
///   OLA_ACCOUNT_PASSWORD_FILE=<file> OLA_LOCAL_FOLDER=<scratch folder> swift run olakit-selftest
///
/// The password is read from the file and never printed; the key is never printed.
enum AccountCheck {
  static func go(env: [String: String], line: (Bool, String, String) -> Void) async {
    guard let b = env["OLA_ACCOUNT_BASE"], let base = URL(string: b), let handle = env["OLA_HANDLE"],
          let pf = env["OLA_ACCOUNT_PASSWORD_FILE"], let password = try? String(contentsOfFile: pf, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines),
          let folder = env["OLA_LOCAL_FOLDER"] else {
      line(false, "set OLA_ACCOUNT_BASE, OLA_HANDLE, OLA_ACCOUNT_PASSWORD_FILE and OLA_LOCAL_FOLDER", "")
      return
    }
    let api = AccountAPI(base: base, session: URLSession(configuration: .ephemeral))
    // A wrong password first: refused in plain words.
    do {
      _ = try await api.login(handle: handle, password: password + "-not-it", deviceName: "Self-test Mac")
      line(false, "a wrong password is refused", "it signed in")
    } catch {
      line((error as? AccountError) == .wrongPassword, "a wrong password is refused", (error as? LocalizedError)?.errorDescription ?? "\(error)")
    }
    let session: AccountSession
    do {
      session = try await api.login(handle: handle, password: password, deviceName: "Self-test Mac")
      line(!session.token.isEmpty && session.person.handle == handle, "signed in with name and password; a key for this Mac", "as \(session.person.name), device \(session.device.name)")
    } catch {
      line(false, "signed in with name and password", (error as? LocalizedError)?.errorDescription ?? "\(error)")
      return
    }
    let door = ModelDoor(api: api) { session.token }
    final class Flag: @unchecked Sendable {
      let lock = NSLock()
      var on = false
    }
    let told = Flag()
    door.onSignedOut = { told.lock.withLock { told.on = true } }
    do { try await door.start() } catch {
      line(false, "the model door starts", "\(error)")
      return
    }
    defer { door.stop() }
    // Everything the app would write under Application Support goes to the scratch folder instead.
    LocalServer.support = URL(fileURLWithPath: folder).appendingPathComponent(".ola-selftest-support")
    let server = LocalServer(folder: URL(fileURLWithPath: folder))
    server.stateBase = URL(fileURLWithPath: folder).appendingPathComponent(".ola-selftest-state")
    server.pidFileName = nil
    let config: ServerConfig
    do {
      config = try await server.start(route: .door(door))
      line(true, "opencode started on this Mac, its model through the door", config.url.absoluteString)
    } catch {
      line(false, "opencode started on this Mac", error.localizedDescription)
      return
    }
    defer { server.stop() }
    // One tiny request to Ola's model, through the door, as opencode makes it.
    let client = OpenCodeClient(config)
    do {
      let s = try await client.createSession(title: "account self-test")
      try await client.prompt(s.id, text: "Reply with exactly five words saying hello.")
      var reply = ""
      let end = Date().addingTimeInterval(120)
      while Date() < end, reply.isEmpty {
        try? await Task.sleep(nanoseconds: 1_000_000_000)
        let turns = Conversation.turns(fromMessages: (try? await client.messages(s.id)) ?? [], directory: s.directory)
        if let t = turns.last, t.status == .done || t.status == .failed { reply = t.answer.isEmpty ? (t.status == .failed ? "" : " ") : t.answer }
        if turns.last?.status == .failed { break }
      }
      reply = reply.trimmingCharacters(in: .whitespacesAndNewlines)
      try? await client.deleteSession(s.id)
      line(!reply.isEmpty, "Ola's model answered through the door", reply.isEmpty ? "no reply in 2 minutes" : "\(reply.split(separator: " ").count) words")
    } catch {
      line(false, "a tiny request through the door", error.localizedDescription)
    }
    // The usage sentence the app shows in Settings.
    let usage = try? await api.usage(session)
    line(usage != nil, "this week's share is shown", usage ?? "none")
    // Sign out: the key is removed on the server, and the door's next request is refused.
    do { try await api.signOut(session) } catch { line(false, "signed out on the server", "\(error)") }
    var r = URLRequest(url: door.url.appendingPathComponent("v1/models"))
    r.setValue("Bearer \(door.key)", forHTTPHeaderField: "Authorization")
    let status = ((try? await URLSession(configuration: .ephemeral).data(for: r))?.1 as? HTTPURLResponse)?.statusCode ?? 0
    line(status == 401 && told.lock.withLock({ told.on }), "after signing out, the door's next request is refused and the app is told", "\(status)")
    do {
      _ = try await api.me(session)
      line(false, "the key no longer works anywhere", "who-am-I still answered")
    } catch AccountError.signedOut {
      line(true, "the key no longer works anywhere", "who-am-I says signed out")
    } catch { line(false, "the key no longer works anywhere", "\(error)") }
  }
}
