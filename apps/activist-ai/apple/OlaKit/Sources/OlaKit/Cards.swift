import Foundation
import JavaScriptCore

/// Ola's cards, described once (OLA-325). A question Ola asks and the yes asked before publishing
/// (or taking pages down) are described by the web app's own `web/server/cards.mjs`, run here in
/// JavaScriptCore (the script is `CardsJS`, generated from it by `apple/tools/cards-js.mjs`). The
/// Mac and iPhone apps draw what it returns; nothing here writes a sentence of a card.
///
/// Why: on Nov 20 six card tickets were one card drawn differently in one client (OLA-301, 311,
/// 318, 320, 321, and the raw command on the iPhone's publish yes). The web check and CardsTests
/// render the same fixtures (`web/test/cards.fixtures.json`).
public enum Cards {
  private static let lock = NSLock()
  nonisolated(unsafe) private static var context: JSContext?
  nonisolated(unsafe) private static var cards: JSValue?

  /// Calls one of cards.mjs's functions with JSON arguments; its result as JSON (null when it
  /// returned null, or when the script failed, which CardsTests would have caught).
  static func call(_ name: String, _ args: [JSON]) -> JSON {
    lock.lock()
    defer { lock.unlock() }
    if cards == nil {
      let c = JSContext()!
      c.evaluateScript(CardsJS.script)
      context = c
      cards = c.objectForKeyedSubscript("OlaCards")
    }
    guard let c = context, let fn = cards?.objectForKeyedSubscript(name), !fn.isUndefined else { return .null }
    let parse = c.objectForKeyedSubscript("JSON").objectForKeyedSubscript("parse")!
    let jsArgs: [Any] = args.map { a in
      let text = (try? JSONEncoder().encode(a)).flatMap { String(data: $0, encoding: .utf8) } ?? "null"
      return parse.call(withArguments: [text]) as Any
    }
    guard let out = fn.call(withArguments: jsArgs), c.exception == nil else {
      c.exception = nil
      return .null
    }
    if out.isNull || out.isUndefined { return .null }
    let text = c.objectForKeyedSubscript("JSON").objectForKeyedSubscript("stringify")!.call(withArguments: [out])?.toString() ?? "null"
    return JSON.parse(text) ?? .null
  }

  /// The question card for an opencode form, as JSON (cards.mjs questionCard).
  public static func question(_ form: JSON) -> JSON { call("questionCard", [form]) }

  /// Words typed in the box as the answer to the whole card (cards.mjs answerFromWords): every
  /// question gets them. Nil when there are no words.
  public static func answer(_ card: JSON, words: String) -> [String: JSON]? {
    if case .object(let o) = call("answerFromWords", [card, .string(words)]) { return o }
    return nil
  }

  /// The publish (or take-down) card for a permission request, or nil for any other request.
  /// `address`: the cloud project's address when known; `files`: for the Mac's own command, the
  /// files in its folder (listed here, on the Mac: the script never reads a disk).
  public static func publish(action: String, resources: [String], address: String? = nil, files: [String]? = nil) -> PublishCard? {
    var ctx: [String: JSON] = [:]
    if let address { ctx["address"] = .string(address) }
    if let files { ctx["files"] = .array(files.map { .string($0) }) }
    return PublishCard(call("publishCard", [.string(action), .array(resources.map { .string($0) }), .object(ctx)]))
  }

  /// A cloud publish card with the front desk's look at the files (cards.mjs publishWithPlan): the
  /// sizes, the left-out line, the warnings, the acceptable-use line and the yes for that list.
  public static func withPlan(_ card: PublishCard, plan: JSON) -> PublishCard? {
    PublishCard(call("publishWithPlan", [card.json, plan]))
  }

  /// The Mac's own command, read (cards.mjs localPublishOf): the folder and the site's name.
  public static func localPublish(_ cmd: String) -> (folder: String, name: String)? {
    let j = call("localPublishOf", [.string(cmd)])
    guard j["publish"]["name"].string != nil else { return nil }
    return (j["publish"]["folder"].str, j["publish"]["name"].str)
  }

  /// Every line a card shows, in order (cards.mjs cardLines): what the checks compare.
  public static func lines(_ card: JSON) -> [String] { call("cardLines", [card]).array.map(\.str) }
}

/// The publish (or take-down) yes, as cards.mjs describes it: drawn by ApprovalPanel.
public struct PublishCard: Equatable, Sendable {
  public enum Kind: String, Sendable { case publish, unpublish }
  public var kind: Kind
  public var runtime: String
  public var title: String
  public var lede: String
  public var address: String
  public var heading: String?
  public var files: [String]
  public var yes: String
  public var no: String
  /// The folder, for the Mac's own command.
  public var folder: String?
  /// While the front desk looks at the files (a cloud publish): the line to show.
  public var checking: String?
  /// After its look: one note per file (its size), the left-out line, warnings, the acceptable-use
  /// line, and the fingerprint the yes sends.
  public var fileNotes: [String]?
  public var leftOut: String?
  public var warnings: [String]
  public var aup: String?
  public var fingerprint: String?
  /// The description as it came, for `Cards.lines`.
  public var json: JSON

  init?(_ j: JSON) {
    guard let k = Kind(rawValue: j["kind"].str) else { return nil }
    kind = k
    runtime = j["runtime"].str
    title = j["title"].str
    lede = j["lede"].str
    address = j["address"].str
    heading = j["heading"].string
    files = j["files"].array.map(\.str)
    yes = j["yes"].str
    no = j["no"].str
    folder = j["folder"].string
    checking = j["checking"].string
    fileNotes = j["fileNotes"].isNull ? nil : j["fileNotes"].array.map(\.str)
    leftOut = j["leftOut"].string
    warnings = j["warnings"].array.map(\.str)
    aup = j["aup"].string
    fingerprint = j["fingerprint"].string
    json = j
  }

  /// A cloud publish waits for the front desk's look before its yes (as the website's sheet does).
  public var needsPlan: Bool { kind == .publish && runtime == "cloud" && fingerprint == nil }

  /// The address line, as every client writes it.
  public var addressLine: String { "The address: \(address)" }
}
