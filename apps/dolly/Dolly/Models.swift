import Foundation

/// What /api/dolly/* returns. Field names follow the JSON.

struct UserView: Codable, Equatable {
    let id: String
    let phone: String
    let name: String?
    let language: String
    let level: String
    let dailyHour: Int
    let dailyLabel: String
    let tz: String
    let streak: Int
    let bestStreak: Int
    /// Learning objectives (Settings) and the rung of the ladder.
    let objectives: Bool
    let rung: Int

    enum CodingKeys: String, CodingKey {
        case id, phone, name, language, level, tz, streak, objectives, rung
        case dailyHour = "daily_hour"
        case dailyLabel = "daily_label"
        case bestStreak = "best_streak"
    }
}

struct Thing: Codable, Equatable, Identifiable {
    let kind: String
    let target: String
    let native: String
    let pinyin: String?
    let source: String
    var id: String { target }

    var kindLabel: String {
        switch kind {
        case "fix": return "Fix"
        case "word": return "New word"
        default: return "Phrase"
        }
    }
}

struct Question: Codable, Equatable {
    let kind: String
    let native: String
    let target: String
    let pinyin: String?
    let options: [String]?
    let from: From
    let itemId: String?

    /// "new" or a day number.
    enum From: Codable, Equatable {
        case new
        case day(Int)

        init(from decoder: Decoder) throws {
            let c = try decoder.singleValueContainer()
            if let n = try? c.decode(Int.self) { self = .day(n) } else { self = .new }
        }

        func encode(to encoder: Encoder) throws {
            var c = encoder.singleValueContainer()
            switch self {
            case .new: try c.encode("new")
            case .day(let n): try c.encode(n)
            }
        }

        var label: String {
            switch self {
            case .new: return "New today"
            case .day(let n): return "Day \(n)"
            }
        }
    }

    enum CodingKeys: String, CodingKey {
        case kind, native, target, pinyin, options, from
        case itemId = "item_id"
    }
}

struct Answer: Codable, Equatable {
    let q: Int
    let ok: Bool
    let answer: String
}

struct TrailNode: Codable, Equatable, Identifiable {
    let n: Int
    let done: Bool
    let today: Bool
    let starred: Bool
    var id: Int { n }
}

struct Named: Codable, Equatable, Identifiable {
    let id: String
    let title: String
}

/// The star round in progress or done today.
struct StarView: Codable, Equatable {
    let state: String
    let targets: [Named]
    let earned: [Named]
    let levelUp: Bool

    enum CodingKeys: String, CodingKey {
        case state, targets, earned
        case levelUp = "level_up"
    }
}

struct CanDoView: Codable, Equatable, Identifiable {
    let id: String
    let title: String
    let earned: Bool
}

struct Rung: Codable, Equatable, Identifiable {
    let n: Int
    let name: String
    let tagline: String
    let cefr: String
    let authored: Bool
    var id: Int { n }
}

struct ObjectivesView: Codable, Equatable {
    let on: Bool
    let level: Int
    let name: String
    let tagline: String
    let cefr: String
    let earned: Int
    let total: Int
    let starAvailable: Bool
    let canDos: [CanDoView]
    let ladder: [Rung]

    enum CodingKeys: String, CodingKey {
        case on, level, name, tagline, cefr, earned, total, ladder
        case starAvailable = "star_available"
        case canDos = "can_dos"
    }
}

enum DayState: String {
    case morning, paused, done
    case afterTalk = "after_talk"
    case afterThings = "after_things"
    case starAfterTalk = "star_after_talk"
    case starAfterThings = "star_after_things"
    case starPaused = "star_paused"

    var inStarRound: Bool { self == .starAfterTalk || self == .starAfterThings || self == .starPaused }
}

struct DayView: Codable, Equatable {
    let id: String
    let day: String
    let n: Int
    let topic: String
    let state: String
    let streak: Int
    let bestStreak: Int
    let dailyHour: Int
    let dailyLabel: String
    let things: [Thing]
    let questions: [Question]
    let answers: [Answer]
    let callSeconds: Int?
    let trail: [TrailNode]
    let comingBack: [String]
    let tomorrow: String?
    let extraCalls: Int
    let extraMinutes: Int
    let starred: Bool
    let star: StarView?
    let objectives: ObjectivesView

    var dayState: DayState { DayState(rawValue: state) ?? .morning }

    /// 0–3: how many of the three parts are done.
    var stepsDone: Int {
        switch dayState {
        case .morning: return 0
        case .afterTalk: return 1
        case .afterThings, .paused: return 2
        case .done, .starAfterTalk, .starAfterThings, .starPaused: return 3
        }
    }

    var rightCount: Int { answers.filter(\.ok).count }

    enum CodingKeys: String, CodingKey {
        case id, day, n, topic, state, streak, things, questions, answers, trail, tomorrow, starred, star, objectives
        case bestStreak = "best_streak"
        case dailyHour = "daily_hour"
        case dailyLabel = "daily_label"
        case callSeconds = "call_seconds"
        case comingBack = "coming_back"
        case extraCalls = "extra_calls"
        case extraMinutes = "extra_minutes"
    }
}

struct TodayResponse: Codable {
    let user: UserView
    let day: DayView
}

struct DayResponse: Codable {
    let day: DayView
}

struct AnswerResponse: Codable {
    let ok: Bool
    let target: String
    let complete: Bool
    let day: DayView
}

struct UserResponse: Codable {
    let user: UserView
}

struct VerifyResponse: Codable {
    let ok: Bool
    let created: Bool
    let user: UserView
}

/// What /api/dolly/eleven/session returns — Polly's shape, plus Dolly's
/// cues and the call's wrap-up timing.
struct ElevenSessionResponse: Codable {
    let voiceSession: VoiceSessionInfo
    let eleven: ElevenConfig

    struct VoiceSessionInfo: Codable {
        let id: String
        let mode: String
        let dayId: String

        enum CodingKeys: String, CodingKey {
            case id, mode
            case dayId = "day_id"
        }
    }

    struct Wrap: Codable {
        let afterMs: Int
        let endMs: Int
        let cue: String

        enum CodingKeys: String, CodingKey {
            case cue
            case afterMs = "after_ms"
            case endMs = "end_ms"
        }
    }

    struct ElevenConfig: Codable {
        let conversationToken: String
        let model: String
        let holdToTalk: Bool
        let dynamicVariables: [String: String]
        /// Sent as a text message once connected so Dolly speaks first.
        let kickoff: String?
        /// What a text message from the APP starts with; such turns stay out of the transcript.
        let cuePrefix: String?
        /// Three things: cues[i] makes thing i current (i ≥ 1; the first is the
        /// opening), the last one closes.
        let cues: [String]
        /// The call: send `cue` at afterMs, end at endMs.
        let wrap: Wrap?
        /// The star round's objectives, for the screen.
        let targets: [Named]?

        enum CodingKeys: String, CodingKey {
            case model, kickoff, cues, wrap, targets
            case conversationToken = "conversation_token"
            case holdToTalk = "hold_to_talk"
            case dynamicVariables = "dynamic_variables"
            case cuePrefix = "cue_prefix"
        }
    }

    enum CodingKeys: String, CodingKey {
        case voiceSession = "voice_session"
        case eleven
    }
}

struct ErrorBody: Codable {
    let error: String
}
