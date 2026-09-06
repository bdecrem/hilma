import Foundation

// Codable mirrors of src/app/jam/api.ts and src/app/jam/jambot.ts types.
// Keep field names/CodingKeys aligned with the web app's JSON shapes —
// they hit the exact same /api/jam/* endpoints.

struct JamUser: Codable, Equatable {
    let id: String
    let username: String
}

/// 16-step rhythm of a track (kick / snare / hats), '1' per hit.
struct Strip: Codable, Equatable, Hashable {
    let k: String
    let s: String
    let h: String
}

struct TrackMeta: Codable, Identifiable, Equatable, Hashable {
    let id: String
    var title: String
    var bpm: Int
    var bars: Int
    let createdAt: String
    let updatedAt: String
    var strip: Strip?
    var publishedAt: String?
    var slug: String?
    var remixOf: String?

    enum CodingKeys: String, CodingKey {
        case id, title, bpm, bars, strip, slug
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case publishedAt = "published_at"
        case remixOf = "remix_of"
    }
}

/// One entry in the visible chat feed. `AnyCodable`-backed passthrough for
/// tool input/result since the shapes vary per tool.
enum FeedItem: Codable, Identifiable, Equatable {
    case user(id: String, text: String)
    case assistant(id: String, text: String)
    case tool(id: String, name: String, input: JSONValue, result: String?, isError: Bool?)
    case note(id: String, text: String, error: Bool?)

    var id: String {
        switch self {
        case .user(let id, _), .assistant(let id, _), .tool(let id, _, _, _, _), .note(let id, _, _):
            return id
        }
    }

    private enum CodingKeys: String, CodingKey {
        case id, kind, text, name, input, result, isError, error
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let id = try c.decode(String.self, forKey: .id)
        let kind = try c.decode(String.self, forKey: .kind)
        switch kind {
        case "user":
            self = .user(id: id, text: try c.decode(String.self, forKey: .text))
        case "assistant":
            self = .assistant(id: id, text: try c.decode(String.self, forKey: .text))
        case "tool":
            self = .tool(
                id: id,
                name: try c.decode(String.self, forKey: .name),
                input: try c.decodeIfPresent(JSONValue.self, forKey: .input) ?? .object([:]),
                result: try c.decodeIfPresent(String.self, forKey: .result),
                isError: try c.decodeIfPresent(Bool.self, forKey: .isError)
            )
        case "note":
            self = .note(id: id, text: try c.decode(String.self, forKey: .text), error: try c.decodeIfPresent(Bool.self, forKey: .error))
        default:
            self = .note(id: id, text: "", error: nil)
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        switch self {
        case .user(_, let text):
            try c.encode("user", forKey: .kind)
            try c.encode(text, forKey: .text)
        case .assistant(_, let text):
            try c.encode("assistant", forKey: .kind)
            try c.encode(text, forKey: .text)
        case .tool(_, let name, let input, let result, let isError):
            try c.encode("tool", forKey: .kind)
            try c.encode(name, forKey: .name)
            try c.encode(input, forKey: .input)
            try c.encodeIfPresent(result, forKey: .result)
            try c.encodeIfPresent(isError, forKey: .isError)
        case .note(_, let text, let error):
            try c.encode("note", forKey: .kind)
            try c.encode(text, forKey: .text)
            try c.encodeIfPresent(error, forKey: .error)
        }
    }
}

/// One turn in the Anthropic-shaped agent transcript. Content is passed
/// through as raw JSON — the engine (JS) owns interpreting it, Swift only
/// stores/forwards it for save/load and for the LLM proxy call.
struct AgentMessage: Codable, Equatable {
    let role: String
    let content: JSONValue
}

/// A full track, including session state, chat history, and visible feed.
/// `session` is opaque to Swift — it is round-tripped verbatim between the
/// server and the JS engine (loadSession/serialize).
struct Track: Codable, Identifiable, Equatable {
    let id: String
    var title: String
    var bpm: Int
    var bars: Int
    let createdAt: String
    let updatedAt: String
    var strip: Strip?
    var publishedAt: String?
    var slug: String?
    var remixOf: String?
    var session: JSONValue?
    var messages: [AgentMessage]
    var feed: [FeedItem]

    enum CodingKeys: String, CodingKey {
        case id, title, bpm, bars, strip, slug, session, messages, feed
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case publishedAt = "published_at"
        case remixOf = "remix_of"
    }

    var meta: TrackMeta {
        TrackMeta(id: id, title: title, bpm: bpm, bars: bars, createdAt: createdAt, updatedAt: updatedAt, strip: strip, publishedAt: publishedAt, slug: slug, remixOf: remixOf)
    }
}

/// Patch body for `PUT /api/jam/tracks/:id` — only send what changed.
struct TrackPatch: Encodable {
    var title: String?
    var bpm: Int?
    var bars: Int?
    var session: JSONValue?
    var messages: [AgentMessage]?
    var feed: [FeedItem]?
}

/// Minimal untyped-JSON box so opaque server payloads (session, tool input)
/// round-trip through Codable without a bespoke type per shape.
indirect enum JSONValue: Codable, Equatable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null; return }
        if let v = try? c.decode(Bool.self) { self = .bool(v); return }
        if let v = try? c.decode(Double.self) { self = .number(v); return }
        if let v = try? c.decode(String.self) { self = .string(v); return }
        if let v = try? c.decode([JSONValue].self) { self = .array(v); return }
        if let v = try? c.decode([String: JSONValue].self) { self = .object(v); return }
        throw DecodingError.dataCorruptedError(in: c, debugDescription: "Unsupported JSON value")
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let v): try c.encode(v)
        case .number(let v): try c.encode(v)
        case .string(let v): try c.encode(v)
        case .array(let v): try c.encode(v)
        case .object(let v): try c.encode(v)
        }
    }
}
