import Foundation

/// Only Ola's models, ever (OLA-249). opencode 2.3.0 with no provider it can use turns on its own
/// hosted provider and its free models ("big-pickle" first), needing no key, and answers with one
/// as if nothing happened. The engine on this Mac gets its settings so a deleted or damaged file
/// cannot change them (LocalServer.prepare); this is the second line: what the engine offers is
/// read after it starts, before each request, and every few seconds while it runs, and anything not
/// Ola's own provider stops it. Ola's own models are every model of provider `ola` (`ola/general`,
/// and `ola/hosted`, the hosted open model the person hands a request to); Fallback to Claude is the
/// person's own Claude Code, which never goes through opencode, so nothing here touches it.
public enum ModelGuard {
  /// The one sentence the person sees in the app when the engine is stopped.
  public static let stopped = "Ola stopped because its settings on this Mac are missing or damaged, so nothing was sent. Quit and reopen Ola."
  /// The same on the iPhone, about the Mac it works through.
  public static let stoppedPhone = "Ola stopped because its settings on your Mac are missing or damaged, so nothing was sent. Quit and reopen Ola on your Mac."
  /// The same in a terminal (the `ola` command).
  public static let stoppedTerminal = "Ola stopped because its settings on this Mac are missing or damaged, so nothing was sent. Run ola again."

  public enum Verdict: Equatable, Sendable {
    /// Every model offered, and the default, is Ola's.
    case olas
    /// Models of another provider are offered (their `provider/model` names).
    case foreign([String])
    /// The engine did not say (it is not answering): nothing to judge, nothing sent either.
    case unknown(String)
  }

  /// Ola's own provider, as LocalServer.config names it.
  public static let provider = "ola"

  public static func verdict(models: [ModelInfo], defaultModel: ModelInfo?) -> Verdict {
    let bad = (models + (defaultModel.map { [$0] } ?? [])).filter { $0.providerID != provider }.map(\.id)
    if bad.isEmpty { return .olas }
    var seen = Set<String>()
    return .foreign(bad.filter { seen.insert($0).inserted })
  }

  /// Asks the engine what it offers. The cloud's account route offers no choice (Client.models is
  /// empty there), so this is only meaningful for an opencode Ola runs itself.
  public static func check(_ client: OpenCodeClient) async -> Verdict {
    do {
      let models = try await client.models()
      let d = try await client.defaultModel()
      return verdict(models: models, defaultModel: d)
    } catch {
      return .unknown((error as? OlaError)?.detail ?? error.localizedDescription)
    }
  }
}
