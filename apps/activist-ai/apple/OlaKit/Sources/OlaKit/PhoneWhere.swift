import Foundation

/// The iPhone's "Where Ola works" (2026-11-17, Bart: "the same 'where Ola works' switch from the
/// macOS app should also be in the iPhone app"):
/// - `mac`, "Through my Mac": paired with the Mac app, the phone shows what the Mac shows (its
///   relay, OlaKit/Relay.swift). Unchanged from before.
/// - `machine`, "On the Ola machine": the phone signs in with an Ola name and password (its own
///   device key, listed under Your devices) and works with Bart's opencode on the machine directly,
///   through the machine's phone door on its Tailscale address (bart/phone-door.mjs). The same
///   sessions the Mac sees in its own "On the Ola machine"; works with the Mac off.
public enum PhoneMode: String, Sendable, CaseIterable { case mac, machine }

public enum PhoneWhere {
  public static let modeKey = "ola.phone.where"
  public static let doorKey = "ola.machineDoor"
  /// The mini's phone door. A Tailscale name, not its address: App Transport Security allows plain
  /// HTTP to `*.ts.net` names only (see Client.swift, ServerConfig.defaultAddress).
  public static let defaultDoor = URL(string: "http://admins-mac-mini.tailde799a.ts.net:4312")!
  nonisolated(unsafe) public static var defaults: UserDefaults = .standard
  nonisolated(unsafe) public static var environment: [String: String] = ProcessInfo.processInfo.environment

  /// nil: a fresh install that has chosen nothing yet (the first screen offers both). A phone
  /// paired before this setting existed keeps working through its Mac.
  public static var mode: PhoneMode? {
    get {
      if let s = defaults.string(forKey: modeKey), let m = PhoneMode(rawValue: s) { return m }
      return paired ? .mac : nil
    }
    set { defaults.set(newValue?.rawValue, forKey: modeKey) }
  }

  /// Where the phone door is (checks point it elsewhere with OLA_MACHINE_DOOR or the default).
  public static var door: URL {
    if let s = environment["OLA_MACHINE_DOOR"], let u = URL(string: s), u.host != nil { return u }
    if let s = defaults.string(forKey: doorKey), let u = URL(string: s), u.host != nil { return u }
    return defaultDoor
  }

  /// Paired with a Mac (no Keychain read).
  public static var paired: Bool { defaults.string(forKey: Credentials.addressKey) != nil }
  /// Signed in to the Ola machine (no Keychain read).
  public static var signedIn: Bool { AccountKeeper.signedIn }
  public static func ready(_ m: PhoneMode) -> Bool { m == .mac ? paired : signedIn }

  /// The server for a mode, or nil when that mode is not set up yet. Reads the Keychain.
  public static func config(_ m: PhoneMode) -> ServerConfig? {
    switch m {
    case .mac: return Credentials.load()
    case .machine:
      guard let s = AccountKeeper.session else { return nil }
      return machineConfig(token: s.token)
    }
  }

  public static func machineConfig(token: String) -> ServerConfig { ServerConfig(url: door, password: token, account: true) }

  /// The one line when the machine does not answer. Tailscale is the phone's way to the machine,
  /// so when it is off, that is what it says.
  public static func unreachableLine(tailscaleOn: Bool = PhoneWhere.tailscaleOn) -> String {
    tailscaleOn ? "It isn\u{2019}t answering. Try again in a minute." : "Turn on Tailscale on this phone."
  }

  /// Whether this device has a Tailscale address (100.64.0.0/10) on any interface: Tailscale on and
  /// connected. The phone sees its VPN interface's address like any other.
  public static var tailscaleOn: Bool {
    var list: UnsafeMutablePointer<ifaddrs>?
    guard getifaddrs(&list) == 0, let first = list else { return false }
    defer { freeifaddrs(list) }
    var p: UnsafeMutablePointer<ifaddrs>? = first
    while let ifa = p {
      if let sa = ifa.pointee.ifa_addr, sa.pointee.sa_family == UInt8(AF_INET) {
        let ip = UInt32(bigEndian: sa.withMemoryRebound(to: sockaddr_in.self, capacity: 1) { $0.pointee.sin_addr.s_addr })
        if ip & 0xFFC0_0000 == 0x6440_0000 { return true }
      }
      p = ifa.pointee.ifa_next
    }
    return false
  }

  public struct SignInProblem: Error, LocalizedError, Equatable {
    public var text: String
    public var errorDescription: String? { text }
    public init(_ text: String) { self.text = text }
  }

  /// A refusal from the account's sign-in, in the phone's words.
  public static func words(_ error: Error) -> String {
    if error is PasskeyNeeded { return passkeyWords }
    switch error as? AccountError {
    case .passkeyRequired?, .passkeysNotInThisVersion?: return passkeyWords
    case .unreachable?: return "Ola didn\u{2019}t answer. Check that this phone is online, then try again."
    case .signedOut?: return "You\u{2019}ve been signed out on this phone. Sign in again."
    case let e?: return e.errorDescription ?? "That sign-in didn\u{2019}t go through. Try again."
    case nil: return (error as? LocalizedError)?.errorDescription ?? "That sign-in didn\u{2019}t go through. Try again."
    }
  }
  static let passkeyWords = "Your account asks for your passkey too, and Ola on the phone can\u{2019}t use passkeys yet. Turn off \u{201C}Ask for my passkey too\u{201D} in your account on the web, then sign in here."
  public static let notAllowed = "This account can\u{2019}t work on the Ola machine from a phone."

  /// Signs this phone in (name and password, its own device key), asks the machine whether the
  /// account may work there, and keeps the sign-in. A machine that does not answer (Tailscale off)
  /// still keeps the sign-in: the phone says what to do and connects when it can.
  public static func signIn(handle: String, password: String, api: AccountAPI = AccountAPI(), deviceName: String = AccountAPI.thisMacName) async throws -> ServerConfig {
    let s: AccountSession
    do {
      s = try await api.login(handle: handle.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(), password: password, deviceName: deviceName, kind: "phone", known: AccountKeeper.known)
    } catch {
      throw SignInProblem(words(error))
    }
    let config = machineConfig(token: s.token)
    do {
      _ = try await OpenCodeClient(config).info()
    } catch OlaError.server(403, _) {
      try? await api.signOut(s)
      throw SignInProblem(notAllowed)
    } catch OlaError.unauthorized {
      throw SignInProblem("That sign-in didn\u{2019}t go through. Try again.")
    } catch {
      // Not answering: kept; the sessions screen says what to do.
    }
    guard AccountKeeper.keep(s) else { throw SignInProblem("This phone couldn\u{2019}t keep the sign-in. Try again.") }
    mode = .machine
    return config
  }

  /// Ends this phone's sign-in, on the server too (best effort: the key is forgotten here either way).
  public static func signOut(api: AccountAPI = AccountAPI()) async {
    if let s = AccountKeeper.session { try? await api.signOut(s) }
    AccountKeeper.forget()
  }
}
