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

    /// Fields a newer app knows and an older server does not yet send
    /// decode with defaults, so a deploy in flight never signs anyone out.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        phone = try c.decode(String.self, forKey: .phone)
        name = try c.decodeIfPresent(String.self, forKey: .name)
        language = try c.decode(String.self, forKey: .language)
        level = try c.decode(String.self, forKey: .level)
        dailyHour = try c.decodeIfPresent(Int.self, forKey: .dailyHour) ?? 8
        dailyLabel = try c.decodeIfPresent(String.self, forKey: .dailyLabel) ?? ""
        tz = try c.decodeIfPresent(String.self, forKey: .tz) ?? TimeZone.current.identifier
        streak = try c.decodeIfPresent(Int.self, forKey: .streak) ?? 0
        bestStreak = try c.decodeIfPresent(Int.self, forKey: .bestStreak) ?? 0
        objectives = try c.decodeIfPresent(Bool.self, forKey: .objectives) ?? false
        rung = try c.decodeIfPresent(Int.self, forKey: .rung) ?? 1
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
    /// The level completed on this day, when its star round earned the last objective: the flag.
    let levelDone: Int?
    var id: Int { n }

    enum CodingKeys: String, CodingKey {
        case n, done, today, starred
        case levelDone = "level_done"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        n = try c.decode(Int.self, forKey: .n)
        done = try c.decodeIfPresent(Bool.self, forKey: .done) ?? false
        today = try c.decodeIfPresent(Bool.self, forKey: .today) ?? false
        starred = try c.decodeIfPresent(Bool.self, forKey: .starred) ?? false
        levelDone = try c.decodeIfPresent(Int.self, forKey: .levelDone)
    }
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
    let levelDone: Int?

    enum CodingKeys: String, CodingKey {
        case state, targets, earned
        case levelUp = "level_up"
        case levelDone = "level_done"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        state = try c.decode(String.self, forKey: .state)
        targets = try c.decodeIfPresent([Named].self, forKey: .targets) ?? []
        earned = try c.decodeIfPresent([Named].self, forKey: .earned) ?? []
        levelUp = try c.decodeIfPresent(Bool.self, forKey: .levelUp) ?? false
        levelDone = try c.decodeIfPresent(Int.self, forKey: .levelDone)
    }
}

/// A completed level: bright until its refresher is due.
struct LevelView: Codable, Equatable, Identifiable {
    let level: Int
    let name: String
    let cefr: String
    let tagline: String
    let completedDay: String
    let refreshDue: String
    let refreshedAt: String?
    let refreshCount: Int
    let due: Bool
    let canDos: [LevelCanDo]
    var id: Int { level }

    struct LevelCanDo: Codable, Equatable, Identifiable {
        let id: String
        let title: String
        let evidence: String?
    }

    enum CodingKeys: String, CodingKey {
        case level, name, cefr, tagline, due
        case completedDay = "completed_day"
        case refreshDue = "refresh_due"
        case refreshedAt = "refreshed_at"
        case refreshCount = "refresh_count"
        case canDos = "can_dos"
    }
}

/// The refresher under way, or the one done today.
struct RefreshView: Codable, Equatable {
    let id: String
    let level: Int
    let name: String
    let state: String
    let targets: [Named]
    let demonstrated: [Named]
    let passed: Bool?
    let nextDue: String?
    let right: Int
    let total: Int

    enum CodingKeys: String, CodingKey {
        case id, level, name, state, targets, demonstrated, passed, right, total
        case nextDue = "next_due"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        level = try c.decodeIfPresent(Int.self, forKey: .level) ?? 1
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? ""
        state = try c.decodeIfPresent(String.self, forKey: .state) ?? "talk"
        targets = try c.decodeIfPresent([Named].self, forKey: .targets) ?? []
        demonstrated = try c.decodeIfPresent([Named].self, forKey: .demonstrated) ?? []
        passed = try c.decodeIfPresent(Bool.self, forKey: .passed)
        nextDue = try c.decodeIfPresent(String.self, forKey: .nextDue)
        right = try c.decodeIfPresent(Int.self, forKey: .right) ?? 0
        total = try c.decodeIfPresent(Int.self, forKey: .total) ?? 0
    }
}

/// The one banner slot above the day.
struct Banner: Codable, Equatable {
    let kind: String
    let level: Int
    let title: String
    let text: String
}

/// One exchange of a star round's dialogue.
struct ScriptStep: Codable, Equatable {
    let dolly: String
    let dollyEn: String
    let youEn: String
    let you: String
    let targetId: String

    enum CodingKeys: String, CodingKey {
        case dolly, you
        case dollyEn = "dolly_en"
        case youEn = "you_en"
        case targetId = "target_id"
    }
}

struct CanDoView: Codable, Equatable, Identifiable {
    let id: String
    let title: String
    let earned: Bool
    let evidence: String?
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
    /// A completed level whose refresher is due: it comes before the star round.
    let refreshDue: RefreshDue?

    struct RefreshDue: Codable, Equatable { let level: Int; let name: String }
    let canDos: [CanDoView]
    let ladder: [Rung]

    enum CodingKeys: String, CodingKey {
        case on, level, name, tagline, cefr, earned, total, ladder
        case starAvailable = "star_available"
        case refreshDue = "refresh_due"
        case canDos = "can_dos"
    }

    init(on: Bool, level: Int, name: String, tagline: String, cefr: String, earned: Int, total: Int, starAvailable: Bool, refreshDue: RefreshDue?, canDos: [CanDoView], ladder: [Rung]) {
        self.on = on; self.level = level; self.name = name; self.tagline = tagline; self.cefr = cefr
        self.earned = earned; self.total = total; self.starAvailable = starAvailable; self.refreshDue = refreshDue; self.canDos = canDos; self.ladder = ladder
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        on = try c.decodeIfPresent(Bool.self, forKey: .on) ?? false
        level = try c.decodeIfPresent(Int.self, forKey: .level) ?? 1
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? "Hello"
        tagline = try c.decodeIfPresent(String.self, forKey: .tagline) ?? ""
        cefr = try c.decodeIfPresent(String.self, forKey: .cefr) ?? "A1.1"
        earned = try c.decodeIfPresent(Int.self, forKey: .earned) ?? 0
        total = try c.decodeIfPresent(Int.self, forKey: .total) ?? 0
        starAvailable = try c.decodeIfPresent(Bool.self, forKey: .starAvailable) ?? false
        refreshDue = try c.decodeIfPresent(RefreshDue.self, forKey: .refreshDue)
        canDos = try c.decodeIfPresent([CanDoView].self, forKey: .canDos) ?? []
        ladder = try c.decodeIfPresent([Rung].self, forKey: .ladder) ?? []
    }

    /// Objectives off, level 1, nothing earned: what an older server implies.
    static let off = ObjectivesView(on: false, level: 1, name: "Hello", tagline: "", cefr: "A1.1", earned: 0, total: 0, starAvailable: false, refreshDue: nil, canDos: [], ladder: [])
}

enum DayState: String {
    case morning, paused, done
    case afterTalk = "after_talk"
    case afterThings = "after_things"
    case starAfterTalk = "star_after_talk"
    case starAfterThings = "star_after_things"
    case starPaused = "star_paused"
    case refreshCards = "refresh_cards"
    case refreshPaused = "refresh_paused"

    var inStarRound: Bool { self == .starAfterTalk || self == .starAfterThings || self == .starPaused }
    var inRefresher: Bool { self == .refreshCards || self == .refreshPaused }
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
    /// What the extra calls produced today, and the latest call's own three.
    let extraThings: [Thing]
    let lastExtraThings: [Thing]
    let starred: Bool
    let star: StarView?
    let objectives: ObjectivesView
    /// Every level completed, oldest first; the refresher under way or done today; the banner slot.
    let levels: [LevelView]
    let refresh: RefreshView?
    let banner: Banner?

    var dayState: DayState { DayState(rawValue: state) ?? .morning }

    /// 0–3: how many of the three parts are done.
    var stepsDone: Int {
        switch dayState {
        case .morning: return 0
        case .afterTalk: return 1
        case .afterThings, .paused: return 2
        case .done, .starAfterTalk, .starAfterThings, .starPaused, .refreshCards, .refreshPaused: return 3
        }
    }

    var rightCount: Int { answers.filter(\.ok).count }

    enum CodingKeys: String, CodingKey {
        case id, day, n, topic, state, streak, things, questions, answers, trail, tomorrow, starred, star, objectives, levels, refresh, banner
        case bestStreak = "best_streak"
        case dailyHour = "daily_hour"
        case dailyLabel = "daily_label"
        case callSeconds = "call_seconds"
        case comingBack = "coming_back"
        case extraCalls = "extra_calls"
        case extraMinutes = "extra_minutes"
        case extraThings = "extra_things"
        case lastExtraThings = "last_extra_things"
    }

    /// The fields added after the first build decode with defaults (see UserView).
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        day = try c.decode(String.self, forKey: .day)
        n = try c.decode(Int.self, forKey: .n)
        topic = try c.decode(String.self, forKey: .topic)
        state = try c.decode(String.self, forKey: .state)
        streak = try c.decodeIfPresent(Int.self, forKey: .streak) ?? 0
        bestStreak = try c.decodeIfPresent(Int.self, forKey: .bestStreak) ?? 0
        dailyHour = try c.decodeIfPresent(Int.self, forKey: .dailyHour) ?? 8
        dailyLabel = try c.decodeIfPresent(String.self, forKey: .dailyLabel) ?? ""
        things = try c.decodeIfPresent([Thing].self, forKey: .things) ?? []
        questions = try c.decodeIfPresent([Question].self, forKey: .questions) ?? []
        answers = try c.decodeIfPresent([Answer].self, forKey: .answers) ?? []
        callSeconds = try c.decodeIfPresent(Int.self, forKey: .callSeconds)
        trail = try c.decodeIfPresent([TrailNode].self, forKey: .trail) ?? []
        comingBack = try c.decodeIfPresent([String].self, forKey: .comingBack) ?? []
        tomorrow = try c.decodeIfPresent(String.self, forKey: .tomorrow)
        extraCalls = try c.decodeIfPresent(Int.self, forKey: .extraCalls) ?? 0
        extraMinutes = try c.decodeIfPresent(Int.self, forKey: .extraMinutes) ?? 0
        extraThings = try c.decodeIfPresent([Thing].self, forKey: .extraThings) ?? []
        lastExtraThings = try c.decodeIfPresent([Thing].self, forKey: .lastExtraThings) ?? []
        starred = try c.decodeIfPresent(Bool.self, forKey: .starred) ?? false
        star = try c.decodeIfPresent(StarView.self, forKey: .star)
        objectives = try c.decodeIfPresent(ObjectivesView.self, forKey: .objectives) ?? .off
        levels = try c.decodeIfPresent([LevelView].self, forKey: .levels) ?? []
        refresh = try c.decodeIfPresent(RefreshView.self, forKey: .refresh)
        banner = try c.decodeIfPresent(Banner.self, forKey: .banner)
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
        /// The star round's (or refresher's) objectives, for the screen, and its dialogue.
        let targets: [Named]?
        let script: [ScriptStep]?
        /// A refresher: the level it keeps bright.
        let level: RefreshLevel?

        struct RefreshLevel: Codable { let n: Int; let name: String }

        enum CodingKeys: String, CodingKey {
            case model, kickoff, cues, wrap, targets, script, level
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
