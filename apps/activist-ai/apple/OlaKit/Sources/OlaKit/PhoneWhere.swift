import Foundation

/// The iPhone's two runtimes (2026-11-17, Bart: "the same 'where Ola works' switch from the macOS
/// app should also be in the iPhone app"; one cloud since OLA-150, 2026-11-19):
/// - `mac`, "Through my Mac" (local): paired with the Mac app, the phone shows what the Mac shows
///   (its relay, OlaKit/Relay.swift).
/// - `machine`, the Cloud: the phone signs in with an Ola name and password (its own device key,
///   listed under Your devices) and works in the person's project on app.ola.cx (`OlaCloud`): the
///   same conversations the website and the Mac's Cloud show, with the Mac off, over the internet.
public enum PhoneMode: String, Sendable, CaseIterable { case mac, machine }

public enum PhoneWhere {
  public static let modeKey = "ola.phone.where"
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

  /// Paired with a Mac (no Keychain read).
  public static var paired: Bool { defaults.string(forKey: Credentials.addressKey) != nil }
  /// Signed in to Ola (no Keychain read).
  public static var signedIn: Bool { AccountKeeper.signedIn }
  public static func ready(_ m: PhoneMode) -> Bool { m == .mac ? paired : signedIn }

  /// The server for a mode, or nil when that mode is not set up yet. Reads the Keychain. The cloud
  /// is the remembered project; `refreshCloud` asks the server which projects are the person's.
  public static func config(_ m: PhoneMode) -> ServerConfig? {
    switch m {
    case .mac: return Credentials.load()
    case .machine: return signedIn ? OlaCloud.saved() : nil
    }
  }

  /// The cloud's project, asked of the server again (at launch, after a sign-in): the config to
  /// show, nil when the account has none or the server does not answer (then `config` stands).
  public static func refreshCloud(api: AccountAPI = AccountAPI()) async -> ServerConfig? {
    guard signedIn, let s = AccountKeeper.session else { return nil }
    return try? await OlaCloud.resolve(s, api: api).config
  }

  /// The one line when the cloud does not answer.
  public static let unreachableLine = "Ola isn\u{2019}t answering. Check that this phone is online, then try again."

  /// Whether this device has a Tailscale address (100.64.0.0/10) on any interface: Tailscale on and
  /// connected. The phone reaches its Mac (the local runtime) that way; the cloud needs none.
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

  /// Signs this phone in (name and password, its own device key), finds the person's project, and
  /// keeps the sign-in. An account with no project is told so and not kept.
  public static func signIn(handle: String, password: String, api: AccountAPI = AccountAPI(), deviceName: String = AccountAPI.thisMacName) async throws -> ServerConfig {
    let s: AccountSession
    do {
      s = try await api.login(handle: handle.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(), password: password, deviceName: deviceName, kind: "phone", known: AccountKeeper.known)
    } catch {
      throw SignInProblem(words(error))
    }
    let found: ServerConfig?
    do {
      found = try await OlaCloud.resolve(s, api: api).config
    } catch {
      try? await api.signOut(s)
      throw SignInProblem(words(error))
    }
    guard let config = found else {
      try? await api.signOut(s)
      throw SignInProblem(OlaCloud.noProject)
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
