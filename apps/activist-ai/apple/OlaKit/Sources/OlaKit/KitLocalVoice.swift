import Foundation

// Kit's local voice (OLA-534): the network half of a meeting whose ears and mouth are Kit's voice
// server on the Mac Studio (hilma's apps/venture/voice-local/server.py, at https://kit-voice.tunn3l.sh),
// ported from the talk page's client (src/app/venture/local-voice.ts). Plain HTTP, one whole
// request and answer each, the token in the query string:
//   POST /call                -> {"call": id, "end_silence_ms": 800}
//   POST /call/<id>/audio     body: ~256 ms of 16 kHz mono int16 PCM -> {"events": [...]}
//   POST /call/<id>/speak     body: one sentence -> 24 kHz mono int16 PCM
//   POST /call/<id>/end
// The server decides when he has finished (800 ms of quiet). The phone app's LocalKitTransport
// drives the microphone and the speaker around this.

public enum KitLocalEvent: Equatable, Sendable {
  case speechStarted, speechStopped
  case transcript(String)
}

public enum KitLocalError: Error, Equatable, LocalizedError {
  /// The Studio did not answer at all (asleep, off the network, the tunnel down).
  case unreachable
  /// The call is gone on the server (expired, or the token is no longer good).
  case callGone
  case failed(Int)

  public var errorDescription: String? {
    switch self {
    case .unreachable: "The Mac Studio voice is not answering. Turn off Local voice in Kit to talk with the usual voice."
    case .callGone: "The Mac Studio dropped the call."
    case .failed(let s): "The Mac Studio voice answered \(s)."
    }
  }
}

public struct KitLocalVoice: Sendable {
  public static let sampleRateIn: Double = 16000
  public static let sampleRateOut: Double = 24000
  /// Samples per microphone post: 256 ms, as on the web.
  public static let chunk = 4096

  public var url: URL
  public var token: String
  public var urlSession: URLSession

  public init(url: URL, token: String, urlSession: URLSession = .shared) {
    self.url = url; self.token = token; self.urlSession = urlSession
  }

  func request(_ path: String, body: Data? = nil, timeout: TimeInterval) -> URLRequest {
    var c = URLComponents(url: url.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
    c.queryItems = [URLQueryItem(name: "t", value: token)]
    var r = URLRequest(url: c.url!, timeoutInterval: timeout)
    r.httpMethod = "POST"
    r.setValue("text/plain", forHTTPHeaderField: "Content-Type")
    r.httpBody = body
    return r
  }

  func send(_ r: URLRequest) async throws -> Data {
    let data: Data, res: URLResponse
    do { (data, res) = try await urlSession.data(for: r) } catch { throw KitLocalError.unreachable }
    let status = (res as? HTTPURLResponse)?.statusCode ?? 0
    if status == 401 || status == 404 { throw KitLocalError.callGone }
    guard (200..<300).contains(status) else { throw KitLocalError.failed(status) }
    return data
  }

  /// Opens a call; throws `.unreachable` if the Studio does not answer in eight seconds.
  public func open() async throws -> (call: String, endSilenceMs: Int) {
    let d = try await send(request("call", timeout: 8))
    let j = JSON.parse(d) ?? .null
    guard let call = j["call"].string else { throw KitLocalError.failed(200) }
    return (call, j["end_silence_ms"].int ?? 800)
  }

  /// One stretch of microphone (16 kHz mono int16, little-endian) → the events since the last post.
  public func audio(_ call: String, _ pcm: Data) async throws -> [KitLocalEvent] {
    let d = try await send(request("call/\(call)/audio", body: pcm, timeout: 5))
    return (JSON.parse(d) ?? .null)["events"].array.compactMap { e in
      switch e["type"].string {
      case "speech_started": .speechStarted
      case "speech_stopped": .speechStopped
      case "transcript": .transcript(e["text"].str)
      default: nil
      }
    }
  }

  /// One sentence → its audio, 24 kHz mono int16, little-endian.
  public func speak(_ call: String, _ sentence: String) async throws -> Data {
    try await send(request("call/\(call)/speak", body: Data(sentence.utf8), timeout: 15))
  }

  public func end(_ call: String) async {
    _ = try? await send(request("call/\(call)/end", timeout: 4))
  }
}

/// Splits a reply into sentences as it streams in. A sentence ends at . ! or ? (maybe followed by a
/// closing quote or bracket) and then a space, so "3.5" stays whole; the web page's rule.
public struct KitSentences: Sendable {
  var pending = ""
  public init() {}

  /// Adds text; returns the sentences it completed.
  public mutating func add(_ text: String) -> [String] {
    pending += text
    var out: [String] = []
    // The match is the punctuation, maybe a closing mark, and the spaces after: the sentence keeps
    // all of it but the spaces.
    while let r = pending.range(of: #"[.!?]["')\]]?\s+"#, options: .regularExpression) {
      let s = pending[..<r.upperBound].trimmingCharacters(in: .whitespacesAndNewlines)
      pending = String(pending[r.upperBound...])
      if !s.isEmpty { out.append(s) }
    }
    return out
  }

  /// The rest, once the reply is complete.
  public mutating func finish() -> String? {
    let s = pending.trimmingCharacters(in: .whitespacesAndNewlines)
    pending = ""
    return s.isEmpty ? nil : s
  }
}
