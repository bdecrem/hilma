import Foundation

// MARK: - Flash cards (mirrors /api/f2/flash/* and /api/f2/topics/[id]/flash)

struct FlashCard: Codable, Identifiable, Equatable, Hashable {
    let id: String
    var question: String
    var answer: String
    var distractors: [String]
    /// "down" = buried (never served again), "priority" = resurfaced hard
    /// until mastered, nil = a normal card. Absent on older backends.
    var rating: String?
    /// How many times this card has been served in a set.
    var timesShown: Int?
    /// Consecutive correct answers — the mastery counter.
    var streak: Int?

    var isBuried: Bool { rating == "down" }
    var isRare: Bool { rating == "down1" }
    var isPriority: Bool { rating == "priority" }

    enum CodingKeys: String, CodingKey {
        case id, question, answer, distractors, rating, streak
        case timesShown = "times_shown"
    }

    init(id: String, question: String, answer: String, distractors: [String],
         rating: String? = nil, timesShown: Int? = nil, streak: Int? = nil) {
        self.id = id
        self.question = question
        self.answer = answer
        self.distractors = distractors
        self.rating = rating
        self.timesShown = timesShown
        self.streak = streak
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        question = try c.decode(String.self, forKey: .question)
        answer = try c.decode(String.self, forKey: .answer)
        distractors = try c.decodeIfPresent([String].self, forKey: .distractors) ?? []
        rating = try c.decodeIfPresent(String.self, forKey: .rating)
        timesShown = try c.decodeIfPresent(Int.self, forKey: .timesShown)
        streak = try c.decodeIfPresent(Int.self, forKey: .streak)
    }
}

/// Score that clears a Jumbo level for a set played in `mode` — mirrors
/// jumboPassScore in src/lib/f2/flash.ts. Spoken recall is the hardest
/// performance so audio rounds pass at 7; choice has the answers on screen
/// so it demands 9; typed sits between.
func jumboPassScore(mode: String) -> Int {
    switch mode {
    case "voice": return 7
    case "text": return 8
    case "mixed": return 8
    default: return 9
    }
}

/// One topic's deck as listed in the Flash tab's deck manager.
struct FlashDeck: Codable, Identifiable, Equatable {
    var id: String { threadId }
    let threadId: String
    let topic: String?
    let url: String?
    let kind: String?
    let stars: Int
    let cardCount: Int
    let priorityCount: Int
    let buriedCount: Int
    /// True when this deck sits out of Peck (jumbo) sets. Absent on older
    /// servers — treated as included.
    var peckExcluded: Bool?
    /// Peck draw multiplier (0.5 / 1 / 2 / 5). Absent on older servers — 1.
    var peckWeight: Double?

    enum CodingKeys: String, CodingKey {
        case topic, url, kind, stars
        case threadId = "thread_id"
        case cardCount = "card_count"
        case priorityCount = "priority_count"
        case buriedCount = "buried_count"
        case peckExcluded = "peck_excluded"
        case peckWeight = "peck_weight"
    }

    var displayLabel: String {
        if let topic, !topic.isEmpty { return topic }
        if let url, let host = URL(string: url)?.host {
            return host.replacingOccurrences(of: "www.", with: "")
        }
        return "(untitled)"
    }
}

/// One question inside a running set. `choices` + `answer` only arrive in
/// multiple-choice mode (instant feedback); text/voice questions omit both.
struct FlashQuestion: Codable, Identifiable, Equatable {
    var id: String { cardId }
    let cardId: String
    let question: String
    let choices: [String]?
    let answer: String?
    /// Existing rating on this card ("priority"; buried cards are never
    /// served), so the thumbs render in the right state on arrival.
    let rating: String?
    /// The card's topic name, shown in small print at the top of the card —
    /// matters in Jumbo sets where every card can come from a different
    /// topic ("according to the book…" needs to say which book). Absent on
    /// older backends.
    let topic: String?
    /// Set when this question arrived already answered — a Peck credit from
    /// the daily iMessage card. The set opens past these; their verdicts
    /// count in the final score.
    let prefilled: PrefilledAnswer?
    /// Mixed sets only: "choice", "text", or "cloze" — how THIS question plays.
    let format: String?
    /// Cloze questions: the exact missing word(s), for instant grading.
    let clozeAnswer: String?

    enum CodingKeys: String, CodingKey {
        case question, choices, answer, rating, topic, prefilled, format
        case cardId = "card_id"
        case clozeAnswer = "cloze_answer"
    }

    init(cardId: String, question: String, choices: [String]?, answer: String?,
         rating: String?, topic: String?, prefilled: PrefilledAnswer? = nil,
         format: String? = nil, clozeAnswer: String? = nil) {
        self.cardId = cardId
        self.question = question
        self.choices = choices
        self.answer = answer
        self.rating = rating
        self.topic = topic
        self.prefilled = prefilled
        self.format = format
        self.clozeAnswer = clozeAnswer
    }
}

/// A verdict carried in from the daily iMessage flow ("daily" freeform
/// answer or the "bonus" multiple-choice question).
struct PrefilledAnswer: Codable, Equatable {
    let given: String?
    let correct: Bool
    let source: String?
}

struct FlashStart: Codable {
    let mode: String
    let threadId: String?
    let jumboLevel: Int?
    let total: Int
    let questions: [FlashQuestion]

    enum CodingKeys: String, CodingKey {
        case mode, total, questions
        case threadId = "thread_id"
        case jumboLevel = "jumbo_level"
    }
}

struct FlashResultRow: Codable, Identifiable, Equatable {
    var id: String { cardId }
    let cardId: String
    let question: String
    let answer: String
    let given: String?
    let correct: Bool
    /// Card-clinic context (absent on older servers/stored sets).
    var threadId: String?
    var rating: String?
    var gradingNote: String?
    var distractors: [String]?

    enum CodingKeys: String, CodingKey {
        case question, answer, given, correct, rating, distractors
        case cardId = "card_id"
        case threadId = "thread_id"
        case gradingNote = "grading_note"
    }
}

struct FlashSubmitResult: Codable, Equatable {
    let score: Int
    let total: Int
    let results: [FlashResultRow]
    let xpAwarded: Int
    let totalXp: Int
    let star2Awarded: Bool
    let stars: Int?
    let consecutiveHighSets: Int

    enum CodingKeys: String, CodingKey {
        case score, total, results, stars
        case xpAwarded = "xp_awarded"
        case totalXp = "total_xp"
        case star2Awarded = "star2_awarded"
        case consecutiveHighSets = "consecutive_high_sets"
    }
}

/// One row of set history.
struct FlashSetRecord: Codable, Identifiable, Equatable {
    let id: String
    let mode: String
    let score: Int
    let total: Int
    let xp: Int
    let jumboLevel: Int?
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id, mode, score, total, xp
        case jumboLevel = "jumbo_level"
        case createdAt = "created_at"
    }
}

struct TopicFlash: Codable {
    let cards: [FlashCard]
    let sets: [FlashSetRecord]
    let stars: Int
}

// MARK: - Jumbo career

struct JumboLevelInfo: Codable, Identifiable, Equatable {
    var id: Int { level }
    let level: Int
    let mode: String            // choice | text | voice
    let status: String          // locked | unlocked | passed
    let bestScore: Int?
    let stars: Int              // 0..3 node stars
    /// Score that clears the level in its default mode (voice 7, text 8,
    /// choice 9). Absent on older backends — requiredScore falls back to
    /// the same mapping client-side.
    let passScore: Int?

    enum CodingKeys: String, CodingKey {
        case level, mode, status, stars
        case bestScore = "best_score"
        case passScore = "pass_score"
    }

    /// Threshold to clear this level when played in its default mode.
    var requiredScore: Int {
        passScore ?? jumboPassScore(mode: mode)
    }

    var modeIcon: String {
        switch mode {
        case "text": return "keyboard"
        case "voice": return "mic.fill"
        case "mixed": return "square.split.2x1"
        default: return "square.grid.2x2"
        }
    }

    var modeLabel: String {
        switch mode {
        case "text": return "Type answers"
        case "voice": return "Voice round"
        case "mixed": return "Mixed round"
        default: return "Multiple choice"
        }
    }
}

struct JumboState: Codable, Equatable {
    let xp: Int
    let cardCount: Int
    let highestPassed: Int
    let levels: [JumboLevelInfo]
    /// Daily-card streak (consecutive days) + the XP multiplier it earns.
    /// Optional so payloads from older servers still decode.
    let dailyStreak: Int?
    let xpMultiplier: Int?

    enum CodingKeys: String, CodingKey {
        case xp, levels
        case cardCount = "card_count"
        case highestPassed = "highest_passed"
        case dailyStreak = "daily_streak"
        case xpMultiplier = "xp_multiplier"
    }
}

// MARK: - Final Review

struct FinalReviewResult: Codable, Equatable {
    let grade: String
    let passed: Bool
    let notes: String
    /// Areas the grader flagged as commanded / needing review. Optional so
    /// results from older servers still decode.
    let strengths: [String]?
    let weaknesses: [String]?
    let stars: Int
    let mastered: Bool
    /// Whether a Second Chance (3-question retake) is on offer after this
    /// failed full attempt. Optional so older servers still decode.
    let secondChance: SecondChanceOffer?
    /// Recert gradings only: whether the badge was renewed, and the next
    /// due date when it was.
    let renewed: Bool?
    let recertDueAt: Date?

    enum CodingKeys: String, CodingKey {
        case grade, passed, notes, strengths, weaknesses, stars, mastered, renewed
        case secondChance = "second_chance"
        case recertDueAt = "recert_due_at"
    }
}

struct SecondChanceOffer: Codable, Equatable {
    let eligible: Bool
    /// ISO timestamp the offer expires.
    let until: String?
}
