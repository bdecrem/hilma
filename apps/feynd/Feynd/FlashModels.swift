import Foundation

// MARK: - Flash cards (mirrors /api/f2/flash/* and /api/f2/topics/[id]/flash)

struct FlashCard: Codable, Identifiable, Equatable, Hashable {
    let id: String
    var question: String
    var answer: String
    var distractors: [String]

    enum CodingKeys: String, CodingKey { case id, question, answer, distractors }
}

/// One question inside a running set. `choices` + `answer` only arrive in
/// multiple-choice mode (instant feedback); text/voice questions omit both.
struct FlashQuestion: Codable, Identifiable, Equatable {
    var id: String { cardId }
    let cardId: String
    let question: String
    let choices: [String]?
    let answer: String?

    enum CodingKeys: String, CodingKey {
        case question, choices, answer
        case cardId = "card_id"
    }
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

    enum CodingKeys: String, CodingKey {
        case question, answer, given, correct
        case cardId = "card_id"
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

    enum CodingKeys: String, CodingKey {
        case level, mode, status, stars
        case bestScore = "best_score"
    }

    var modeIcon: String {
        switch mode {
        case "text": return "keyboard"
        case "voice": return "mic.fill"
        default: return "square.grid.2x2"
        }
    }

    var modeLabel: String {
        switch mode {
        case "text": return "Type answers"
        case "voice": return "Voice round"
        default: return "Multiple choice"
        }
    }
}

struct JumboState: Codable, Equatable {
    let xp: Int
    let cardCount: Int
    let highestPassed: Int
    let levels: [JumboLevelInfo]

    enum CodingKeys: String, CodingKey {
        case xp, levels
        case cardCount = "card_count"
        case highestPassed = "highest_passed"
    }
}

// MARK: - Final Review

struct FinalReviewResult: Codable, Equatable {
    let grade: String
    let passed: Bool
    let notes: String
    let stars: Int
    let mastered: Bool
}
