import Foundation

/// The cloud runtime (OLA-150, 2026-11-19). Bart: "one user bart and he's an admin, and he has local
/// sessions on a Mac that the connected phones also see, and cloud sessions that I can see from the
/// website or the apps." The apps' Cloud is the person's own projects on `app.ola.cx`, the same
/// conversations the website shows, reached with this device's account sign-in (a name and a
/// password, `AccountAPI.login`): no machine address, no second password, no Tailscale. The front
/// desk's routes for it are `/api/device/projects` and `/api/device/w/<project>/...`
/// (`../frontdesk/server.mjs`, deviceCloud), with the web's own membership checks.
///
/// A `ServerConfig` with `account: true` is a project's opencode through those routes: its `url` is
/// `<base>/api/device/w/<project>/oc` and its `password` the device's key, sent as a Bearer token.
public struct CloudProject: Equatable, Hashable, Sendable, Identifiable {
  public var slug: String
  public var name: String
  public var team: String
  public var role: String
  public var id: String { slug }
  public init(slug: String, name: String, team: String = "", role: String = "owner") {
    self.slug = slug
    self.name = name
    self.team = team
    self.role = role
  }
}

public enum OlaCloud {
  /// The project the apps' Cloud shows (its slug), remembered on this device.
  public static let projectKey = "ola.cloud.project"
  nonisolated(unsafe) public static var defaults: UserDefaults = .standard

  public static var chosen: String? {
    get { defaults.string(forKey: projectKey) }
    set { defaults.set(newValue, forKey: projectKey) }
  }

  /// A project's opencode through the front desk, as this device.
  public static func config(token: String, project: String, base: URL = AccountAPI.configured) -> ServerConfig {
    var s = base.absoluteString
    if s.hasSuffix("/") { s.removeLast() }
    let slug = project.addingPercentEncoding(withAllowedCharacters: .alphanumerics.union(CharacterSet(charactersIn: "-"))) ?? project
    return ServerConfig(url: URL(string: "\(s)/api/device/w/\(slug)/oc")!, password: token, account: true)
  }

  /// The project a cloud config is for (nil for any other config).
  public static func project(of c: ServerConfig?) -> String? {
    guard let c, c.account else { return nil }
    let parts = c.url.path.split(separator: "/")
    guard let i = parts.firstIndex(of: "w"), i + 1 < parts.count, i > 0, parts[i - 1] == "device" else { return nil }
    return String(parts[i + 1])
  }

  /// The person's projects, as the website lists them (by name).
  public static func projects(_ s: AccountSession, api: AccountAPI = AccountAPI()) async throws -> [CloudProject] {
    var r = URLRequest(url: api.url("/api/device/projects"))
    r.setValue("Bearer \(s.token)", forHTTPHeaderField: "Authorization")
    r.setValue("application/json", forHTTPHeaderField: "Accept")
    let (d, _) = try await api.send(r, signedIn: true)
    guard let j = JSON.parse(d) else { throw AccountError.badReply }
    return parse(j)
  }

  static func parse(_ j: JSON) -> [CloudProject] {
    j["projects"].array.compactMap { p in
      let slug = p["slug"].str
      guard !slug.isEmpty else { return nil }
      return CloudProject(slug: slug, name: p["name"].string ?? slug, team: p["team"].str, role: p["role"].string ?? "member")
    }
  }

  /// The project to show: the remembered one while it is still the person's, else the first.
  public static func pick(_ list: [CloudProject], remembered: String? = OlaCloud.chosen) -> CloudProject? {
    list.first { $0.slug == remembered } ?? list.first
  }

  /// The cloud config for a signed-in account, without the network: the remembered project, if any.
  /// Reads the Keychain (once per launch).
  public static func saved(base: URL = AccountAPI.configured) -> ServerConfig? {
    guard let project = chosen, let s = AccountKeeper.session else { return nil }
    return config(token: s.token, project: project, base: base)
  }

  /// Asks the server for the person's projects, picks one (and remembers it), and gives its config:
  /// nil when the person has no project yet.
  public static func resolve(_ s: AccountSession, api: AccountAPI = AccountAPI()) async throws -> (config: ServerConfig?, projects: [CloudProject]) {
    let list = try await projects(s, api: api)
    guard let p = pick(list) else {
      chosen = nil
      return (nil, list)
    }
    chosen = p.slug
    return (config(token: s.token, project: p.slug, base: api.base), list)
  }

  /// What the Cloud says when the account has no project on Ola yet.
  public static let noProject = "Your account has no project on Ola yet. Make one on app.ola.cx, or ask Ola\u{2019}s team."
}

/// "Lots of permissions" in the cloud is the conversation's autonomy, as on the website (the front
/// desk turns it into opencode's rules and answers web steps itself under it, `web/server/proxy.mjs`
/// permissionsFor): `go` under Lots, `ask` under Ask before each step. The apps send their runtime's
/// switch with a new conversation, and again before a request when it has changed.
public enum CloudAutonomy {
  public static func word(_ lots: Bool) -> String { lots ? "go" : "ask" }
}
