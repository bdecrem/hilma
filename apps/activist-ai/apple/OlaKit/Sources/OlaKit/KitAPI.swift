import Foundation

// Kit: the Claude that runs Venture with Bart, reached from the phone app's Kit tab (admins only).
// The server side is hilma's src/lib/venture/phone.ts, under /api/venture/phone, signed in with the
// app token from /api/kochito/app-token (Bearer). A meeting is an ElevenLabs conversation the server
// mints a token for; a note is an audio file the server transcribes and keeps as text.

public struct KitMeetingSummary: Identifiable, Equatable, Sendable {
  public var id: String
  public var at: Date
  public var seconds: Int
  public var firstLine: String
  public var turns: Int
  public var minutes: KitMinutes?
  public init(id: String, at: Date, seconds: Int, firstLine: String, turns: Int, minutes: KitMinutes? = nil) {
    self.id = id; self.at = at; self.seconds = seconds; self.firstLine = firstLine; self.turns = turns; self.minutes = minutes
  }
}

/// What Kit took from a call or a note (hilma's src/lib/venture/minutes.ts): what Bart decided (only
/// what he confirmed), what is still to decide, what Kit will do. He can correct it.
public struct KitMinutes: Equatable, Sendable {
  public struct Line: Identifiable, Equatable, Sendable {
    public var id: String
    public var text: String
    public var quote: String?
    /// Bart set this line himself (moved it on the phone).
    public var byBart: Bool
    public init(id: String, text: String, quote: String? = nil, byBart: Bool = false) { self.id = id; self.text = text; self.quote = quote; self.byBart = byBart }
  }
  public enum Move: String, Sendable { case decided, toDecide = "to_decide", delete }
  public var source: String
  public var ref: String
  public var summary: String
  public var decided: [Line]
  public var toDecide: [Line]
  public var kitWillDo: [Line]
  public var isEmpty: Bool { decided.isEmpty && toDecide.isEmpty && kitWillDo.isEmpty }
  public init(source: String, ref: String, summary: String, decided: [Line], toDecide: [Line], kitWillDo: [Line]) {
    self.source = source; self.ref = ref; self.summary = summary; self.decided = decided; self.toDecide = toDecide; self.kitWillDo = kitWillDo
  }
}

public struct KitNote: Identifiable, Equatable, Sendable {
  public var id: Int
  public var text: String
  public var at: Date
  /// Kit's session has read it.
  public var read: Bool
  public var minutes: KitMinutes?
  public init(id: Int, text: String, at: Date, read: Bool, minutes: KitMinutes? = nil) { self.id = id; self.text = text; self.at = at; self.read = read; self.minutes = minutes }
}

public struct KitOverview: Equatable, Sendable {
  public var meetings: [KitMeetingSummary]
  public var notes: [KitNote]
  public init(meetings: [KitMeetingSummary], notes: [KitNote]) { self.meetings = meetings; self.notes = notes }
}

public struct KitLine: Identifiable, Equatable, Sendable {
  public enum Who: String, Sendable { case kit, bart }
  public var id: Int
  public var who: Who
  public var text: String
  public init(id: Int, who: Who, text: String) { self.id = id; self.who = who; self.text = text }
}

public struct KitMeetingStart: Equatable, Sendable {
  public var session: String
  public var resumed: Bool
  public var conversationToken: String
  public var variables: [String: String]
  public var kickoff: String
  public init(session: String, resumed: Bool, conversationToken: String, variables: [String: String], kickoff: String) {
    self.session = session; self.resumed = resumed; self.conversationToken = conversationToken; self.variables = variables; self.kickoff = kickoff
  }
}

/// Why a meeting ended, in the server's words.
public enum KitEndReason: String, Sendable, Equatable {
  case you, silence, dropped, phoneCall = "phone call", background, timeLimit = "time limit", error
}

public enum KitError: Error, LocalizedError, Equatable {
  case signedOut
  case refused(String)
  case offline

  public var errorDescription: String? {
    switch self {
    case .signedOut: "Sign in again to reach Kit."
    case .refused(let s): s
    case .offline: "No connection. Try again when you have signal."
    }
  }
}

/// What the meeting screen needs from the server (a fake stands in for tests).
public protocol KitService: Sendable {
  func startMeeting(resume: String?) async throws -> KitMeetingStart
  func endMeeting(_ id: String, seconds: Int, reason: KitEndReason) async throws
}

public struct KitAPI: KitService {
  public static let defaultBase = URL(string: "https://app.kochitolabs.com")!
  public var base: URL
  public var token: @Sendable () -> String?
  public var urlSession: URLSession

  public init(base: URL = KitAPI.defaultBase, urlSession: URLSession = .shared, token: @escaping @Sendable () -> String?) {
    self.base = base; self.token = token; self.urlSession = urlSession
  }

  public func overview() async throws -> KitOverview {
    let j = try await call("GET", "api/venture/phone")
    return KitOverview(meetings: j["meetings"].array.compactMap(Self.summary), notes: j["notes"].array.compactMap(Self.note))
  }

  public func startMeeting(resume: String?) async throws -> KitMeetingStart {
    var body: [String: JSON] = [:]
    if let resume { body["session"] = .string(resume) }
    let j = try await call("POST", "api/venture/phone/meeting", json: .object(body), timeout: 20)
    guard let session = j["session"].string, let token = j["conversation_token"].string else { throw KitError.refused("Kit cannot take a call right now.") }
    var vars: [String: String] = [:]
    for (k, v) in j["dynamic_variables"].object { if let s = v.string { vars[k] = s } }
    return KitMeetingStart(session: session, resumed: j["resumed"].bool ?? false, conversationToken: token, variables: vars, kickoff: j["kickoff"].string ?? "[begin]")
  }

  public func endMeeting(_ id: String, seconds: Int, reason: KitEndReason) async throws {
    _ = try await call("POST", "api/venture/phone/meeting/\(id)", json: .object(["seconds": .number(Double(seconds)), "reason": .string(reason.rawValue)]))
  }

  /// Bart moves a line between Decided and To be decided, or removes it.
  public func correct(_ m: KitMinutes, line: String, to: KitMinutes.Move) async throws -> KitMinutes {
    let j = try await call("POST", "api/venture/phone/minutes", json: .object(["source": .string(m.source), "ref": .string(m.ref), "id": .string(line), "to": .string(to.rawValue)]))
    guard let out = Self.minutes(j["minutes"]) else { throw KitError.refused("That did not save. Try again.") }
    return out
  }

  public func meeting(_ id: String) async throws -> (KitMeetingSummary?, KitMinutes?, [KitLine]) {
    let j = try await call("GET", "api/venture/phone/meeting/\(id)")
    let lines = j["turns"].array.enumerated().compactMap { i, t -> KitLine? in
      guard let who = t["who"].string.flatMap(KitLine.Who.init), let text = t["text"].string else { return nil }
      return KitLine(id: i, who: who, text: text)
    }
    return (Self.summary(j["meeting"]), Self.minutes(j["minutes"]), lines)
  }

  /// One recorded note (AAC in an .m4a file, what AVAudioRecorder writes).
  public func sendNote(audio: Data, seconds: Double) async throws -> KitNote {
    let boundary = "ola-\(UUID().uuidString)"
    var body = Data()
    func part(_ s: String) { body.append(Data(s.utf8)) }
    part("--\(boundary)\r\nContent-Disposition: form-data; name=\"seconds\"\r\n\r\n\(Int(seconds.rounded()))\r\n")
    part("--\(boundary)\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"note.m4a\"\r\nContent-Type: audio/mp4\r\n\r\n")
    body.append(audio)
    part("\r\n--\(boundary)--\r\n")
    let j = try await call("POST", "api/venture/phone/note", body: body, contentType: "multipart/form-data; boundary=\(boundary)", timeout: 90)
    guard let n = Self.note(j["note"]) else { throw KitError.refused("The note did not go through. Record it again.") }
    return n
  }

  // MARK: plumbing

  func call(_ method: String, _ path: String, json: JSON? = nil, body: Data? = nil, contentType: String? = nil, timeout: TimeInterval = 20) async throws -> JSON {
    guard let token = token(), !token.isEmpty else { throw KitError.signedOut }
    var req = URLRequest(url: base.appendingPathComponent(path), timeoutInterval: timeout)
    req.httpMethod = method
    req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    if let json {
      req.httpBody = json.data
      req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    } else if let body {
      req.httpBody = body
      req.setValue(contentType, forHTTPHeaderField: "Content-Type")
    }
    let data: Data, res: URLResponse
    do { (data, res) = try await urlSession.data(for: req) } catch { throw KitError.offline }
    let status = (res as? HTTPURLResponse)?.statusCode ?? 0
    let j = JSON.parse(data) ?? .null
    if status == 401 { throw KitError.signedOut }
    guard (200..<300).contains(status) else { throw KitError.refused(j["error"].string ?? "Something went wrong (\(status)).") }
    return j
  }

  static func summary(_ j: JSON) -> KitMeetingSummary? {
    guard let id = j["id"].string, let at = j["at"].string.flatMap(kitDate) else { return nil }
    return KitMeetingSummary(id: id, at: at, seconds: j["seconds"].int ?? 0, firstLine: j["first_line"].str, turns: j["turns"].int ?? 0, minutes: minutes(j["minutes"]))
  }

  static func note(_ j: JSON) -> KitNote? {
    guard let id = j["id"].int, let text = j["text"].string, let at = j["at"].string.flatMap(kitDate) else { return nil }
    return KitNote(id: id, text: text, at: at, read: j["read"].bool ?? false, minutes: minutes(j["minutes"]))
  }

  static func minutes(_ j: JSON) -> KitMinutes? {
    guard let source = j["source"].string, let ref = j["ref"].string else { return nil }
    func lines(_ k: String) -> [KitMinutes.Line] {
      j[k].array.compactMap { x in
        guard let id = x["id"].string, let text = x["text"].string else { return nil }
        return KitMinutes.Line(id: id, text: text, quote: x["quote"].string, byBart: x["by"].string == "bart")
      }
    }
    return KitMinutes(source: source, ref: ref, summary: j["summary"].str, decided: lines("decided"), toDecide: lines("to_decide"), kitWillDo: lines("kit_will_do"))
  }
}

/// Postgres timestamps ("2026-11-17T10:00:00.123456+00:00") and plain ISO 8601.
public func kitDate(_ s: String) -> Date? {
  let f = ISO8601DateFormatter()
  if let d = f.date(from: s) { return d }
  // Drop the fraction, which ISO8601DateFormatter reads only up to three digits.
  let trimmed = s.replacingOccurrences(of: #"\.\d+"#, with: "", options: .regularExpression)
  return f.date(from: trimmed)
}
