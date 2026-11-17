#if os(macOS)
import Foundation
import Security

/// `Ola --import-secret <kind> [--key-id <id>]`: puts a secret into the app's Keychain with no
/// dialog and without anyone seeing it. The value comes in on standard input (never an argument,
/// never echoed); the old item is replaced without being read; one line is printed, never the
/// value. Run by the app's own signed executable, so the item belongs to the app's signature and
/// the app reads it later without macOS asking. Example:
///   ssh <machine> 'ola-bart.sh password' | /Applications/Ola.app/Contents/MacOS/Ola --import-secret machine-password
public enum SecretImport {
  public static var kinds: [SecretKind] { [.machinePassword, .modelToken, .account, .pushKey] }

  public static func usage() -> String {
    "usage: Ola --import-secret <\(kinds.map(\.rawValue).joined(separator: "|"))> [--key-id <id> for push-key] < secret"
  }

  /// Returns the exit code and the one line to print. `input` is standard input's text; `isTTY`
  /// refuses typing a secret at a terminal (it would show on screen).
  public static func run(_ args: [String], input: () -> String, isTTY: Bool, defaults: UserDefaults = LocalSettings.defaults) -> (Int32, String) {
    guard let i = args.firstIndex(of: "--import-secret"), i + 1 < args.count, let kind = SecretKind(rawValue: args[i + 1]), kinds.contains(kind) else {
      return (2, usage())
    }
    var note: String?
    if kind == .pushKey {
      guard let k = args.firstIndex(of: "--key-id"), k + 1 < args.count, args[k + 1].range(of: #"^[A-Z0-9]{10}$"#, options: .regularExpression) != nil else {
        return (2, "push-key needs --key-id <the 10-character key id from AuthKey_<id>.p8>")
      }
      note = args[k + 1]
    }
    if isTTY { return (2, "Pipe the secret in, so it never shows on screen: <command that prints it> | Ola --import-secret \(kind.rawValue)") }
    let value = input().trimmingCharacters(in: .whitespacesAndNewlines)
    guard !value.isEmpty else { return (1, "Nothing came in on standard input; nothing was changed.") }
    if kind == .account, AccountSession.decode(value) == nil { return (1, "That is not an Ola sign-in (expected the JSON the sign-in keeps); nothing was changed.") }
    if kind == .pushKey, !value.contains("PRIVATE KEY") { return (1, "That is not an Apple key file's text; nothing was changed.") }
    guard SecretStore.save(kind, value, note: note) else {
      return (1, "The Keychain did not take it (status \(SecretStore.lastStatus[kind] ?? 0)); nothing was changed.")
    }
    switch kind {
    case .machinePassword:
      if defaults.string(forKey: "ola.serverAddress") == nil { defaults.set(ServerConfig.defaultAddress, forKey: "ola.serverAddress") }
    case .modelToken: defaults.set(true, forKey: LocalSettings.tokenSavedKey)
    case .pushKey: defaults.set(true, forKey: "ola.push.ready")
    default: break
    }
    return (0, "Saved the \(label(kind)) in this Mac's Keychain (\(value.count) characters), readable by this app's signature without asking.")
  }

  static func label(_ k: SecretKind) -> String {
    switch k {
    case .machinePassword: "Ola machine's password"
    case .modelToken: "model token"
    case .account: "Ola sign-in"
    case .pushKey: "Apple push key"
    case .admin: "admin sign-in"
    }
  }

  /// `Ola --secret-status`: one line per kind, saved or not, read the way the app reads (never a
  /// dialog, never the value).
  public static func status() -> String {
    kinds.map { k -> String in
      let item = SecretStore.item(k)
      let st = SecretStore.lastStatus[k] ?? 0
      let words: String = if item != nil { "saved, readable by this build without asking" }
        else if st == errSecItemNotFound || st == 0 { "not saved" }
        else { "not readable without asking (status \(st)); import it again" }
      return "\(k.rawValue): \(words)"
    }.joined(separator: "\n")
  }

  /// The app's entry point calls this before anything from AppKit or SwiftUI starts.
  public static func runIfRequested() {
    let args = CommandLine.arguments
    if args.contains("--secret-status") {
      print(status())
      exit(0)
    }
    if let i = args.firstIndex(of: "--forget-secret") {
      guard i + 1 < args.count, let k = SecretKind(rawValue: args[i + 1]), kinds.contains(k) else { print(usage()); exit(2) }
      SecretStore.remove(k)
      let st = SecretStore.lastStatus[k] ?? 0
      print(st == errSecSuccess || st == errSecItemNotFound ? "Removed the \(label(k)) from this Mac's Keychain." : "Could not remove the \(label(k)) (status \(st)).")
      exit(st == errSecSuccess || st == errSecItemNotFound ? 0 : 1)
    }
    guard args.contains("--import-secret") else { return }
    let (code, line) = run(args, input: { String(decoding: FileHandle.standardInput.readDataToEndOfFile(), as: UTF8.self) }, isTTY: isatty(0) == 1)
    FileHandle.standardOutput.write(Data((line + "\n").utf8))
    exit(code)
  }
}
#endif
