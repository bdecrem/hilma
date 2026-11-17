import Foundation

/// This device's sign-in to an Ola account: the token the server gave it and who it is. Kept as
/// one Keychain item (`SecretKind.account`), this device only; nothing secret anywhere else.
public struct AccountSession: Codable, Equatable, Sendable {
  public struct Person: Codable, Equatable, Sendable {
    public var handle: String
    public var name: String
    public var admin: Bool
    public init(handle: String, name: String, admin: Bool) {
      self.handle = handle
      self.name = name
      self.admin = admin
    }
  }

  public struct Device: Codable, Equatable, Sendable {
    public var id: String
    public var name: String
    public var kind: String
    public init(id: String, name: String, kind: String) {
      self.id = id
      self.name = name
      self.kind = kind
    }
  }

  public var token: String
  public var expiresAt: Date?
  public var person: Person
  public var device: Device

  public init(token: String, expiresAt: Date?, person: Person, device: Device) {
    self.token = token
    self.expiresAt = expiresAt
    self.person = person
    self.device = device
  }

  enum CodingKeys: String, CodingKey {
    case token, person, device
    case expiresAt = "expires_at"
  }

  public func expired(at now: Date = .now) -> Bool { expiresAt.map { $0 <= now } ?? false }

  static let encoder: JSONEncoder = {
    let e = JSONEncoder()
    e.dateEncodingStrategy = .iso8601
    e.outputFormatting = [.sortedKeys]
    return e
  }()

  /// The JSON kept in the Keychain (the server's own field names).
  public func encoded() -> String { String(decoding: (try? Self.encoder.encode(self)) ?? Data(), as: UTF8.self) }

  /// From the server's reply or the Keychain; `expires_at` may be ISO 8601 or epoch seconds.
  public static func decode(_ text: String) -> AccountSession? { decode(Data(text.utf8)) }

  public static func decode(_ data: Data) -> AccountSession? {
    guard let j = JSON.parse(data), !j["token"].str.isEmpty, !j["person"]["handle"].str.isEmpty else { return nil }
    return AccountSession(token: j["token"].str, expiresAt: date(j["expires_at"]), person: person(j["person"]), device: device(j["device"]))
  }

  static func person(_ j: JSON) -> Person { Person(handle: j["handle"].str, name: j["name"].str.isEmpty ? j["handle"].str : j["name"].str, admin: j["admin"].bool ?? false) }
  static func device(_ j: JSON) -> Device { Device(id: j["id"].str, name: j["name"].str, kind: j["kind"].str) }

  static func date(_ j: JSON) -> Date? {
    if let s = j.string {
      let f = ISO8601DateFormatter()
      f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
      if let d = f.date(from: s) { return d }
      f.formatOptions = [.withInternetDateTime]
      return f.date(from: s)
    }
    if let n = j.double { return Date(timeIntervalSince1970: n > 1e12 ? n / 1000 : n) }
    return nil
  }
}
