import Foundation
import Security

// The app's secrets, one Keychain item each, read at most once per launch and only when needed.
//
// Why it is shaped like this (macOS, 2026-11-17): the login keychain ties each item to the
// designated requirement of the app that made it. An ad-hoc build's requirement is its cdhash, so
// every new build was a stranger and macOS asked for the login password before each read (twice
// with "Always Allow": once to read, once to add the build to the item's list). The Mac app is now
// signed with a stable identity (tools/build.sh), and measured on this Mac with throwaway items:
// a rebuilt binary with the same identity reads silently; a rebuilt ad-hoc binary is refused;
// deleting an item another build made is refused (it would ask), but changing its value is not.
// So on the Mac: every item has the account "ola" (items older builds made, under other account
// names, are never matched, so never asked about), a write changes the value in place and adds
// only when there is none, and no read may ever show a dialog (`kSecUseAuthenticationUIFail`: a
// read macOS would ask about counts as no item, and the app asks for sign-in instead).

/// What the app keeps. The raw values are what `Ola --import-secret <kind>` takes.
public enum SecretKind: String, CaseIterable, Sendable {
  /// The Ola machine's opencode password ("On the Ola machine").
  case machinePassword = "machine-password"
  /// This device's sign-in to the Ola account (the token and who it is), JSON.
  case account
  /// The pasted gateway token for "On this Mac" before account sign-in. Delete with the pasted-token path.
  case modelToken = "model-token"
  /// The Apple push key (the .p8 text); its key id rides along as the item's comment.
  case pushKey = "push-key"
  /// The phone's admin sign-in (app.kochitolabs.com).
  case admin

  var service: String {
    let base: String = switch self {
    case .machinePassword: "cx.ola.opencode"
    case .account: "cx.ola.account"
    case .modelToken: "cx.ola.gateway-token"
    case .pushKey: "cx.ola.apns"
    case .admin: "cx.ola.admin"
    }
    // Checks use throwaway names, never the real items (OLA_SECRET_PREFIX, tests only).
    if let p = SecretStore.servicePrefix { return p + rawValue }
    return base
  }
}

public struct SecretItem: Equatable, Sendable {
  public var value: String
  /// Something that is not secret and belongs with it (the push key's id).
  public var note: String?
  public init(value: String, note: String? = nil) {
    self.value = value
    self.note = note
  }
}

/// Where items are kept. The real one is the Keychain; tests use one in memory.
public protocol SecretBackend: AnyObject, Sendable {
  func read(_ service: String) -> (SecretItem?, OSStatus)
  /// Changes the value in place, or adds the item.
  func write(_ service: String, _ item: SecretItem) -> OSStatus
  func remove(_ service: String) -> OSStatus
}

public final class KeychainBackend: SecretBackend, @unchecked Sendable {
  public init() {}
  static let account = "ola"
  /// The value of an item another build made that was removed (it cannot be deleted silently).
  static let removed = "ola:removed"

  func base(_ service: String) -> [String: Any] {
    var q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service]
    #if os(macOS)
    q[kSecAttrAccount as String] = Self.account
    q[kSecUseAuthenticationUI as String] = kSecUseAuthenticationUIFail
    #endif
    return q
  }

  public func read(_ service: String) -> (SecretItem?, OSStatus) {
    var q = base(service)
    q[kSecReturnData as String] = true
    q[kSecReturnAttributes as String] = true
    q[kSecMatchLimit as String] = kSecMatchLimitOne
    var out: CFTypeRef?
    let st = SecItemCopyMatching(q as CFDictionary, &out)
    guard st == errSecSuccess, let d = out as? [String: Any], let data = d[kSecValueData as String] as? Data,
          let value = String(data: data, encoding: .utf8), !value.isEmpty, value != Self.removed else { return (nil, st == errSecSuccess ? errSecItemNotFound : st) }
    return (SecretItem(value: value, note: d[kSecAttrComment as String] as? String), st)
  }

  public func write(_ service: String, _ item: SecretItem) -> OSStatus {
    var change: [String: Any] = [kSecValueData as String: Data(item.value.utf8)]
    change[kSecAttrComment as String] = item.note ?? ""
    #if os(macOS)
    // In place: allowed even for an item an earlier build made (a delete would ask).
    let st = SecItemUpdate(base(service) as CFDictionary, change as CFDictionary)
    if st != errSecItemNotFound { return st }
    #else
    SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service] as CFDictionary)
    #endif
    var add = base(service)
    add[kSecAttrAccount as String] = Self.account
    add[kSecValueData as String] = Data(item.value.utf8)
    if let note = item.note { add[kSecAttrComment as String] = note }
    add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    add.removeValue(forKey: kSecUseAuthenticationUI as String)
    return SecItemAdd(add as CFDictionary, nil)
  }

  public func remove(_ service: String) -> OSStatus {
    #if os(macOS)
    let st = SecItemDelete(base(service) as CFDictionary)
    if st == errSecSuccess || st == errSecItemNotFound { return st }
    // Made by another build: it cannot be deleted without asking, so its value is replaced by a
    // mark that reads as no item (the Keychain does not take an empty value).
    return SecItemUpdate(base(service) as CFDictionary, [kSecValueData as String: Data(Self.removed.utf8), kSecAttrComment as String: ""] as CFDictionary)
    #else
    return SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service] as CFDictionary)
    #endif
  }
}

/// The one way to the app's secrets: each kind is read once per launch, when first needed, and
/// kept in memory after (writes and removals update the memory too).
public enum SecretStore {
  nonisolated(unsafe) public static var backend: SecretBackend = KeychainBackend()
  /// A self-test never reads the Keychain.
  nonisolated(unsafe) public static var disabled = false
  /// Tests only: throwaway service names (`OLA_SECRET_PREFIX`).
  nonisolated(unsafe) public static var servicePrefix: String? = ProcessInfo.processInfo.environment["OLA_SECRET_PREFIX"].flatMap { $0.isEmpty ? nil : $0 }

  private static let lock = NSLock()
  nonisolated(unsafe) private static var cache: [SecretKind: SecretItem?] = [:]
  nonisolated(unsafe) private static var counts: [SecretKind: Int] = [:]
  /// The last status a read or write gave, for a plain message (never the value).
  nonisolated(unsafe) public private(set) static var lastStatus: [SecretKind: OSStatus] = [:]

  public static func item(_ kind: SecretKind) -> SecretItem? {
    if disabled { return nil }
    return lock.withLock {
      if let hit = cache[kind] { return hit }
      let (item, st) = backend.read(kind.service)
      counts[kind, default: 0] += 1
      lastStatus[kind] = st
      cache[kind] = .some(item)
      return item
    }
  }

  public static func value(_ kind: SecretKind) -> String? { item(kind)?.value }

  /// Has it been read (or written) in this launch? Reading `isKnown` never touches the Keychain.
  public static func isKnown(_ kind: SecretKind) -> Bool { lock.withLock { cache[kind] != nil } }

  @discardableResult
  public static func save(_ kind: SecretKind, _ value: String, note: String? = nil) -> Bool {
    if disabled { return false }
    return lock.withLock {
      let item = SecretItem(value: value, note: note)
      let st = backend.write(kind.service, item)
      lastStatus[kind] = st
      if st == errSecSuccess { cache[kind] = .some(item) }
      return st == errSecSuccess
    }
  }

  public static func remove(_ kind: SecretKind) {
    if disabled { return }
    lock.withLock {
      lastStatus[kind] = backend.remove(kind.service)
      cache[kind] = .some(nil)
    }
  }

  /// How many times each kind was read from the backend in this launch (tests).
  public static func readCount(_ kind: SecretKind) -> Int { lock.withLock { counts[kind] ?? 0 } }

  /// Tests: forget what was read, as at a new launch.
  public static func resetForTests(backend b: SecretBackend? = nil) {
    lock.withLock {
      cache = [:]
      counts = [:]
      lastStatus = [:]
      if let b { backend = b }
    }
  }
}

/// Keeps items in memory (tests and screenshots).
public final class MemorySecrets: SecretBackend, @unchecked Sendable {
  private let lock = NSLock()
  private var items: [String: SecretItem] = [:]
  public private(set) var reads = 0
  public init(_ items: [String: SecretItem] = [:]) { self.items = items }
  public func read(_ service: String) -> (SecretItem?, OSStatus) {
    lock.withLock {
      reads += 1
      let i = items[service]
      return (i, i == nil ? errSecItemNotFound : errSecSuccess)
    }
  }
  public func write(_ service: String, _ item: SecretItem) -> OSStatus { lock.withLock { items[service] = item }; return errSecSuccess }
  public func remove(_ service: String) -> OSStatus { lock.withLock { items[service] = nil }; return errSecSuccess }
}

/// The server address (in user defaults) and its password (in the Keychain, this device only).
public enum Credentials {
  static let addressKey = "ola.serverAddress"

  /// A self-test never reads the Keychain (another build of the app would make macOS ask).
  public static var disabled: Bool {
    get { SecretStore.disabled }
    set { SecretStore.disabled = newValue }
  }

  /// The machine's address and password. Reads the password (once per launch), so call it only
  /// when the app is about to use the machine.
  public static func load() -> ServerConfig? {
    if disabled { return nil }
    guard let address = UserDefaults.standard.string(forKey: addressKey), let url = URL(string: address),
          let password = SecretStore.value(.machinePassword) else { return nil }
    let d = UserDefaults.standard
    return ServerConfig(url: url, password: password, viaMac: d.bool(forKey: viaMacKey), macName: d.string(forKey: macNameKey))
  }
  static let viaMacKey = "ola.viaMac"
  static let macNameKey = "ola.macName"

  public static var savedAddress: String? { UserDefaults.standard.string(forKey: addressKey) }

  public static func save(_ config: ServerConfig) throws {
    guard SecretStore.save(.machinePassword, config.password) else {
      throw OlaError.badReply("Keychain \(SecretStore.lastStatus[.machinePassword] ?? 0)")
    }
    UserDefaults.standard.set(config.url.absoluteString, forKey: addressKey)
    UserDefaults.standard.set(config.viaMac, forKey: viaMacKey)
    UserDefaults.standard.set(config.macName, forKey: macNameKey)
  }

  public static func forget() {
    SecretStore.remove(.machinePassword)
    UserDefaults.standard.removeObject(forKey: addressKey)
  }
}
