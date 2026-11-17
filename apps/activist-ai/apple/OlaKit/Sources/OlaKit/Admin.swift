import Foundation
import Security

/// The phone's admin sign-in: Bart's account for app.kochitolabs.com, checked by the site
/// (`/api/kochito/app-token`), which returns a token for 30 days. The token lives in the Keychain.
public struct AdminToken: Equatable, Sendable {
  public var token: String
  public var user: String
  public var expires: Date

  /// `olaapp.<user>.<expires>.<signature>`; nil for anything else.
  public init?(_ token: String) {
    let parts = token.split(separator: ".").map(String.init)
    guard parts.count == 4, parts[0] == "olaapp", !parts[1].isEmpty, let exp = Double(parts[2]), parts[3].count >= 20 else { return nil }
    self.token = token
    user = parts[1]
    expires = Date(timeIntervalSince1970: exp)
  }

  public func expired(at now: Date = .now) -> Bool { expires <= now }
}

public struct AdminLink: Equatable, Sendable, Identifiable {
  public var name: String
  public var what: String
  public var href: URL
  public var id: String { name + href.absoluteString }
  public init(name: String, what: String, href: URL) {
    self.name = name
    self.what = what
    self.href = href
  }
}

public enum AdminAuth {
  public static let site = URL(string: "https://app.kochitolabs.com")!
  static let service = "cx.ola.admin"

  public enum Failure: Error, Equatable, LocalizedError {
    case refused(String), unreachable, badReply
    public var errorDescription: String? {
      switch self {
      case .refused(let m): return m
      case .unreachable: return "The site did not answer. Try again."
      case .badReply: return "The site sent something unexpected."
      }
    }
  }

  /// Signs in; returns the token and the links.
  public static func signIn(name: String, password: String, session: URLSession = .shared, site: URL = site) async throws -> (AdminToken, [AdminLink]) {
    var r = URLRequest(url: site.appendingPathComponent("api/kochito/app-token"))
    r.httpMethod = "POST"
    r.setValue("application/json", forHTTPHeaderField: "content-type")
    r.httpBody = JSON.object(["name": .string(name), "passcode": .string(password)]).data
    let (d, res) = try await fetch(r, session)
    let j = JSON.parse(d) ?? .null
    guard res.statusCode == 200 else { throw Failure.refused(j["error"].string ?? "That did not work.") }
    guard let t = AdminToken(j["token"].str) else { throw Failure.badReply }
    return (t, links(j))
  }

  /// Is the token still good? Returns the links; throws `refused` when it is not.
  public static func check(_ t: AdminToken, session: URLSession = .shared, site: URL = site) async throws -> [AdminLink] {
    if t.expired() { throw Failure.refused("Sign in again.") }
    var r = URLRequest(url: site.appendingPathComponent("api/kochito/app-token"))
    r.setValue("Bearer \(t.token)", forHTTPHeaderField: "authorization")
    let (d, res) = try await fetch(r, session)
    let j = JSON.parse(d) ?? .null
    guard res.statusCode == 200 else { throw Failure.refused(j["error"].string ?? "Sign in again.") }
    return links(j)
  }

  static func fetch(_ r: URLRequest, _ s: URLSession) async throws -> (Data, HTTPURLResponse) {
    do {
      let (d, res) = try await s.data(for: r)
      guard let h = res as? HTTPURLResponse else { throw Failure.badReply }
      return (d, h)
    } catch let e as Failure { throw e } catch { throw Failure.unreachable }
  }

  static func links(_ j: JSON) -> [AdminLink] {
    j["links"].array.compactMap { l in URL(string: l["href"].str).map { AdminLink(name: l["name"].str, what: l["what"].str, href: $0) } }
  }

  // MARK: the Keychain

  public static func load() -> AdminToken? {
    let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
    var out: CFTypeRef?
    guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data, let s = String(data: d, encoding: .utf8) else { return nil }
    return AdminToken(s)
  }

  public static func save(_ t: AdminToken) {
    signOut()
    SecItemAdd([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: t.user,
                kSecValueData as String: Data(t.token.utf8), kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly] as CFDictionary, nil)
  }

  public static func signOut() {
    SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service] as CFDictionary)
  }
}
