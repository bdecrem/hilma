import Foundation

/// The two runtimes (meeting of 2026-11-18, decision 1: "four products across two different
/// runtimes"). The **cloud runtime** is Bart's Ola on the Ola machine (`../bart/`); the **local
/// runtime** is his Mac ("On this Mac"), and for the iPhone, his Mac through the pairing. Settings
/// about the work follow the runtime ("Lots of permissions", one per runtime); things about him
/// (sign-in, appearance, notifications) follow him. Which runtime a session is in is chosen when it
/// is started, in New Session (OLA-143).
public enum Runtime: String, CaseIterable, Sendable, Identifiable {
  case cloud, local

  public var id: String { rawValue }

  /// One word, for the session list and the chooser.
  public var name: String { self == .cloud ? "Cloud" : "Local" }

  /// Where the work happens, as the chooser says it ("Cloud: on the Ola machine").
  public func place(phone: Bool) -> String {
    switch self {
    case .cloud: return "on the Ola machine"
    case .local: return phone ? "through your Mac" : "on this Mac"
    }
  }

  /// The one line under each choice in New Session.
  public func detail(phone: Bool) -> String {
    switch self {
    case .cloud: return phone ? "Works with your Mac off. The files stay on the Ola machine." : "Works with this Mac asleep. The files stay on the Ola machine; your phone can follow."
    case .local: return phone ? "Ola works on your Mac, in its folder. Your Mac needs to be on." : "Ola works in a folder on this Mac. Only the model runs at Ola."
    }
  }

  public var symbol: String { self == .cloud ? "cloud" : "laptopcomputer" }

  /// The runtime a server config is in: the Mac's own agent (loopback) and the phone through its
  /// Mac are local; the machine, directly or through its door, is cloud.
  public static func of(_ config: ServerConfig?) -> Runtime? {
    guard let config else { return nil }
    if config.account { return .cloud }
    if config.viaMac { return .local }
    return config.url.host() == "127.0.0.1" ? .local : .cloud
  }
}

/// The last runtime chosen in New Session: the default the chooser highlights, so one tap (or
/// Return) is enough.
public enum RuntimeChoice {
  public static let key = "ola.runtime.last"
  public static func last(_ d: UserDefaults) -> Runtime? { d.string(forKey: key).flatMap(Runtime.init(rawValue:)) }
  public static func remember(_ r: Runtime, _ d: UserDefaults) { d.set(r.rawValue, forKey: key) }
}

/// "Yes, for the rest of this session" (OLA-142, 2026-11-18). Bart: "I had to approve like 10
/// different times, even when I said approve always in this session." The apps sent opencode its
/// own "always", which saves a lasting rule for the whole project from each command's head
/// (`ola-search *`, `head *`): a download or a lookup after a yes to a search asked again, and the
/// yes outlived the session. The yes is now kept by whoever answers for the runtime (the machine's
/// approver, `../bart/approver.mjs`; this Mac's store for "On this Mac"), for that session only, by
/// kind, and opencode only ever hears "once".
public enum SessionYes {
  /// What a yes is about: `web` for a web step (a search, download or lookup, however the model
  /// wraps it: the same test as the web question, WebAsk.question), else the action.
  public static func kind(action: String, resources: [String]) -> String {
    if action == "shell" || action == "bash", WebAsk.question(resources) != nil { return "web" }
    return action
  }
}
