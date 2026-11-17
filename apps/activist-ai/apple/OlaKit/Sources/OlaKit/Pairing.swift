import Foundation
import Security

/// What the phone gets when it pairs with the Mac app: this Mac's name, its Tailscale name and the
/// relay's port, and one long random secret. Nothing else: never the machine's password or the
/// local server's. Carried by a QR code and, for typing, by the same text.
///
///   ola://pair?h=imac-m1.tailde799a.ts.net&p=4330&s=ABCD-EFGH-...&n=Bart%E2%80%99s%20iMac
public struct PairingCode: Equatable, Sendable {
  public var host: String
  public var port: Int
  public var secret: String
  public var name: String

  public init(host: String, port: Int, secret: String, name: String) {
    self.host = host
    self.port = port
    self.secret = secret
    self.name = name
  }

  /// 130 random bits in base32 (A to Z, 2 to 7), in groups of four for typing.
  public static func newSecret() -> String {
    let alphabet = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567")
    var bytes = [UInt8](repeating: 0, count: 26)
    _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
    let chars = bytes.map { alphabet[Int($0) & 31] }
    return stride(from: 0, to: chars.count, by: 4).map { String(chars[$0..<min($0 + 4, chars.count)]) }.joined(separator: "-")
  }

  /// The secret as compared: no dashes or spaces, upper case.
  public static func normalize(_ s: String) -> String {
    s.uppercased().filter { $0.isLetter || $0.isNumber }
  }

  public var text: String {
    var c = URLComponents()
    c.scheme = "ola"
    c.host = "pair"
    c.queryItems = [URLQueryItem(name: "h", value: host), URLQueryItem(name: "p", value: String(port)), URLQueryItem(name: "s", value: secret), URLQueryItem(name: "n", value: name)]
    return c.string ?? ""
  }

  /// Reads the QR text, or a typed `host:port secret` / `host secret`.
  public static func parse(_ raw: String) -> PairingCode? {
    let s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    if s.lowercased().hasPrefix("ola://"), let c = URLComponents(string: s) {
      let q = Dictionary((c.queryItems ?? []).map { ($0.name, $0.value ?? "") }, uniquingKeysWith: { a, _ in a })
      guard let h = q["h"], !h.isEmpty, let sec = q["s"], normalize(sec).count >= 20 else { return nil }
      return PairingCode(host: h, port: Int(q["p"] ?? "") ?? 4330, secret: sec, name: q["n"] ?? h)
    }
    let parts = s.split(whereSeparator: { $0 == " " || $0 == "/" || $0 == "\n" }).map(String.init)
    guard parts.count >= 2 else { return nil }
    let hp = parts[0].split(separator: ":")
    let secret = parts.dropFirst().joined()
    guard let h = hp.first, h.contains("."), normalize(secret).count >= 20 else { return nil }
    return PairingCode(host: String(h), port: hp.count > 1 ? Int(hp[1]) ?? 4330 : 4330, secret: secret, name: String(h.split(separator: ".").first ?? h))
  }

  /// How the phone reaches the Mac app: Bearer auth with the pairing secret.
  public var config: ServerConfig {
    ServerConfig(url: URL(string: "http://\(host):\(port)")!, password: Self.normalize(secret), viaMac: true, macName: name)
  }
}
