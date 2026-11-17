import Foundation
import Security

/// The server address (in user defaults) and its password (in the Keychain, this device only).
public enum Credentials {
  static let service = "cx.ola.opencode"
  static let addressKey = "ola.serverAddress"

  /// A self-test never reads the Keychain (another build of the app would make macOS ask).
  nonisolated(unsafe) public static var disabled = false

  public static func load() -> ServerConfig? {
    if disabled { return nil }
    guard let address = UserDefaults.standard.string(forKey: addressKey), let url = URL(string: address),
          let password = password(for: address) else { return nil }
    let d = UserDefaults.standard
    return ServerConfig(url: url, password: password, viaMac: d.bool(forKey: viaMacKey), macName: d.string(forKey: macNameKey))
  }
  static let viaMacKey = "ola.viaMac"
  static let macNameKey = "ola.macName"

  public static var savedAddress: String? { UserDefaults.standard.string(forKey: addressKey) }

  public static func save(_ config: ServerConfig) throws {
    let account = config.url.absoluteString
    let base: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service]
    SecItemDelete(base as CFDictionary)
    var add = base
    add[kSecAttrAccount as String] = account
    add[kSecValueData as String] = Data(config.password.utf8)
    add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    let status = SecItemAdd(add as CFDictionary, nil)
    guard status == errSecSuccess else { throw OlaError.badReply("Keychain \(status)") }
    UserDefaults.standard.set(account, forKey: addressKey)
    UserDefaults.standard.set(config.viaMac, forKey: viaMacKey)
    UserDefaults.standard.set(config.macName, forKey: macNameKey)
  }

  public static func forget() {
    SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service] as CFDictionary)
    UserDefaults.standard.removeObject(forKey: addressKey)
  }

  static func password(for account: String) -> String? {
    let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account,
                            kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
    var out: CFTypeRef?
    guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
    return String(data: data, encoding: .utf8)
  }
}
