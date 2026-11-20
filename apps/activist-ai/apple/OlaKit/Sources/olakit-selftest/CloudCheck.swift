import Foundation
import OlaKit

/// OLA_CLOUD_CHECK=1 (OLA-150): one cloud. Signs in as one account and lists its cloud sessions
/// through each of the three paths, the website's (a browser's cookie and `/oc/api/session`), the
/// Mac app's (the account sign-in, `OlaCloud.resolve`, the store) and the iPhone app's
/// (`PhoneWhere.signIn`, `PhoneWhere.config(.machine)`, the store), shows the three lists are the
/// same, makes a session from each path, and shows the three lists are the same again.
///
///   OLA_CLOUD_CHECK=1 OLA_ACCOUNT_BASE=http://localhost:4796 OLA_HANDLE=<made-up admin>
///   OLA_ACCOUNT_PASSWORD_FILE=<file> swift run olakit-selftest
///
/// Run only against a made-up account. Nothing is kept: the Keychain and the settings are
/// throwaway ones in memory for this run, and every device it signed in is signed out at the end.
/// The password and the keys are never printed.
enum CloudCheck {
  final class Memory: SecretBackend, @unchecked Sendable {
    let lock = NSLock()
    var items: [String: SecretItem] = [:]
    func read(_ s: String) -> (SecretItem?, OSStatus) { lock.withLock { (items[s], items[s] == nil ? errSecItemNotFound : errSecSuccess) } }
    func write(_ s: String, _ i: SecretItem) -> OSStatus { lock.withLock { items[s] = i }; return errSecSuccess }
    func remove(_ s: String) -> OSStatus { lock.withLock { items[s] = nil }; return errSecSuccess }
  }

  @MainActor
  static func go(env: [String: String], line: (Bool, String, String) -> Void) async {
    guard let b = env["OLA_ACCOUNT_BASE"], let base = URL(string: b), let handle = env["OLA_HANDLE"],
          let pf = env["OLA_ACCOUNT_PASSWORD_FILE"], let password = try? String(contentsOfFile: pf, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines) else {
      line(false, "set OLA_ACCOUNT_BASE, OLA_HANDLE and OLA_ACCOUNT_PASSWORD_FILE", "")
      return
    }
    // Throwaway Keychain and settings: this run never touches the apps' own.
    SecretStore.resetForTests(backend: Memory())
    let suite = "cx.ola.cloudcheck.\(getpid())"
    let d = UserDefaults(suiteName: suite)!
    defer { UserDefaults.standard.removePersistentDomain(forName: suite) }
    AccountKeeper.defaults = d
    OlaCloud.defaults = d
    PhoneWhere.defaults = d
    let api = AccountAPI(base: base, session: URLSession(configuration: .ephemeral))

    // 1. The website's path: a browser's sign-in (the cookie), its project, its list.
    let web = Web(base: base)
    guard let slug = await web.signIn(handle: handle, password: password) else {
      line(false, "the website: signed in", web.why)
      return
    }
    line(true, "the website: signed in, the project \(slug)", "")

    // 2. The Mac's path: the account's sign-in and the cloud as WhereOlaWorks resolves it.
    let mac: AccountSession
    do { mac = try await api.login(handle: handle, password: password, deviceName: "Cloud check Mac", kind: "mac") } catch {
      line(false, "the Mac: signed in", (error as? LocalizedError)?.errorDescription ?? "\(error)")
      return
    }
    guard let macConfig = try? await OlaCloud.resolve(mac, api: api).config else {
      line(false, "the Mac: its cloud is the person's project", "no project")
      return
    }
    line(OlaCloud.project(of: macConfig) == slug && macConfig.url.path.hasPrefix("/api/device/w/"), "the Mac: its cloud is the same project, through the account's sign-in", macConfig.url.path)

    // 3. The phone's path: PhoneWhere's own sign-in, and its config for the cloud.
    let phoneConfig: ServerConfig
    do {
      _ = try await PhoneWhere.signIn(handle: handle, password: password, api: api, deviceName: "Cloud check iPhone")
      guard let c = PhoneWhere.config(.machine) else { throw PhoneWhere.SignInProblem("no cloud config") }
      phoneConfig = c
    } catch {
      line(false, "the iPhone: signed in", (error as? LocalizedError)?.errorDescription ?? "\(error)")
      return
    }
    line(OlaCloud.project(of: phoneConfig) == slug && phoneConfig.password != mac.token, "the iPhone: its cloud is the same project, with its own key", phoneConfig.url.path)

    let macStore = OlaStore(config: macConfig)
    let phoneStore = OlaStore(config: phoneConfig)
    func lists() async -> (web: [String], mac: [String], phone: [String]) {
      await macStore.refresh()
      await phoneStore.refresh()
      return (await web.sessions(slug).sorted(), macStore.sessions.map(\.id).sorted(), phoneStore.sessions.map(\.id).sorted())
    }
    func same(_ when: String, _ l: (web: [String], mac: [String], phone: [String])) -> Bool {
      let ok = l.web == l.mac && l.mac == l.phone
      line(ok, "\(when): the three lists are the same", ok ? "\(l.web.count) session(s)" : "web \(l.web.count), Mac \(l.mac.count), iPhone \(l.phone.count)")
      return ok
    }
    let before = await lists()
    _ = same("before", before)

    // One new session from each path.
    let w = await web.create(slug, title: "Cloud check: from the website")
    line(w != nil, "a session made on the website", w ?? web.why)
    macStore.cloudLots = { true }
    await macStore.sendToOla("Cloud check: from the Mac. Reply with one word.")
    let m = macStore.selectedID
    line(m != nil, "a session made from the Mac (its first request sent)", m ?? macStore.problem?.text ?? "")
    phoneStore.cloudLots = { false }
    await phoneStore.sendToOla("Cloud check: from the iPhone. Reply with one word.")
    let p = phoneStore.selectedID
    line(p != nil, "a session made from the iPhone (its first request sent)", p ?? phoneStore.problem?.text ?? "")

    let after = await lists()
    if same("after", after) {
      let made = Set([w, m, p].compactMap { $0 })
      line(made.count == 3 && made.isSubset(of: Set(after.web)) && after.web.count == before.web.count + 3, "each new session is in all three lists", "")
    }
    // The website sees what each app asked for: Lots from the Mac, Ask from the phone.
    let auto = await web.autonomy(slug)
    line(m.flatMap { auto[$0] } == "go" && p.flatMap { auto[$0] } == "ask", "each app's Lots of permissions reached its conversation", "Mac \(m.flatMap { auto[$0] } ?? "?"), iPhone \(p.flatMap { auto[$0] } ?? "?")")

    // Signed out, the key works nowhere.
    try? await api.signOut(mac)
    await PhoneWhere.signOut(api: api)
    let phoneAfter = try? await OpenCodeClient(phoneConfig).sessions()
    let macAfter = try? await OpenCodeClient(macConfig).sessions()
    line(phoneAfter == nil && macAfter == nil,"after sign-out neither app's key lists anything", "")
    await web.signOut()
  }

  /// A browser's half: the cookie from a password sign-in, the CSRF token, the project's door.
  final class Web {
    let base: URL
    var cookie = ""
    var csrf = ""
    var why = ""
    let session = URLSession(configuration: .ephemeral)
    init(base: URL) { self.base = base }

    var origin: String { "\(base.scheme!)://\(base.host!)\(base.port.map { ":\($0)" } ?? "")" }

    func send(_ method: String, _ path: String, body: JSON? = nil, workspace: String? = nil) async -> (Int, JSON?, HTTPURLResponse?) {
      var r = URLRequest(url: URL(string: origin + path)!)
      r.httpMethod = method
      r.httpShouldHandleCookies = false
      if !cookie.isEmpty { r.setValue(cookie, forHTTPHeaderField: "Cookie") }
      if method != "GET" { r.setValue(origin, forHTTPHeaderField: "Origin") }
      if method != "GET", !csrf.isEmpty { r.setValue(csrf, forHTTPHeaderField: "X-Ola-CSRF") }
      if let workspace { r.setValue(workspace, forHTTPHeaderField: "X-Ola-Workspace") }
      if let body {
        r.httpBody = body.data
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
      }
      guard let (d, res) = try? await session.data(for: r), let h = res as? HTTPURLResponse else { return (0, nil, nil) }
      return (h.statusCode, JSON.parse(d), h)
    }

    func signIn(handle: String, password: String) async -> String? {
      let (s, _, h) = await send("POST", "/api/auth/password", body: ["handle": .string(handle), "password": .string(password)])
      guard s == 200, let set = h?.value(forHTTPHeaderField: "Set-Cookie") else { why = "sign-in \(s)"; return nil }
      // The session cookie (its name and value, nothing after the first ';').
      cookie = set.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { $0.hasPrefix("ola") }.map { String($0.split(separator: ";")[0]) }.joined(separator: "; ")
      let (ms, me, _) = await send("GET", "/api/me")
      guard ms == 200, let me else { why = "me \(ms)"; return nil }
      csrf = me["csrf"].str
      guard let slug = me["workspaces"].array.first?["slug"].string else { why = "no project"; return nil }
      return slug
    }

    func list(_ slug: String) async -> [JSON] {
      for _ in 0..<40 {
        let (s, j, _) = await send("GET", "/oc/api/session?limit=200", workspace: slug)
        if s == 200, let j { return j["data"].isNull ? j.array : j["data"].array }
        try? await Task.sleep(nanoseconds: 1_000_000_000) // waking
      }
      return []
    }

    func sessions(_ slug: String) async -> [String] { await list(slug).map { $0["id"].str } }

    func autonomy(_ slug: String) async -> [String: String] {
      Dictionary(await list(slug).map { ($0["id"].str, $0["metadata"]["autonomy"].str) }, uniquingKeysWith: { a, _ in a })
    }

    func create(_ slug: String, title: String) async -> String? {
      let (s, j, _) = await send("POST", "/oc/api/session", body: ["title": .string(title), "metadata": ["autonomy": "go"]], workspace: slug)
      let id = j?["data"]["id"].string ?? j?["id"].string
      if id == nil { why = "create \(s)" }
      return id
    }

    func signOut() async { _ = await send("POST", "/api/signout") }
  }
}
