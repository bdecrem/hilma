import Foundation

struct User: Codable, Equatable {
    let id: String
    let username: String
    var avatarUrl: String?

    enum CodingKeys: String, CodingKey {
        case id, username
        case avatarUrl = "avatar_url"
    }
}

/// User-wide learning progress — mirror of /api/f2/progress, the same star
/// and level system Feynd uses (one backend, shared accounts). In Loci stars
/// come from reviewing: a topic earns 1★ once every idea has been reviewed,
/// 2★ when all hold a 7-day interval, 3★ at 21 days.
struct UserProgress: Codable, Equatable {
    var level: Int
    var topicCount: Int
    var totalStars: Int
    var masteredTopicCount: Int
    var currentLevelAt: Int
    var nextLevelAt: Int
    var toNextLevel: Int

    /// 0..1 fill for the ring/bar — numerator is total stars because backend
    /// levels are based on total stars. Never NaN, never > 1.
    var progressFraction: Double {
        let span = max(1, nextLevelAt - currentLevelAt)
        let earned = max(0, totalStars - currentLevelAt)
        return min(1.0, Double(earned) / Double(span))
    }

    static let zero = UserProgress(
        level: 0, topicCount: 0, totalStars: 0, masteredTopicCount: 0,
        currentLevelAt: 0, nextLevelAt: 1, toNextLevel: 1
    )

    enum CodingKeys: String, CodingKey {
        case level
        case topicCount = "topic_count"
        case totalStars = "total_stars"
        case masteredTopicCount = "mastered_topic_count"
        case currentLevelAt = "current_level_at"
        case nextLevelAt = "next_level_at"
        case toNextLevel = "to_next_level"
    }
}

/// Italic flavor word next to the level number ("Level 4 · Apprentice").
/// Kept in lockstep with `levelTitle()` in `src/lib/f2/progress.ts`.
func lociLevelTitle(_ level: Int) -> String {
    switch level {
    case ..<1: return "Newcomer"
    case 1: return "Beginner"
    case 2: return "Curious"
    case 3: return "Student"
    case 4: return "Apprentice"
    case 5: return "Scholar"
    case 6: return "Adept"
    case 7: return "Practitioner"
    case 8: return "Expert"
    case 9: return "Master"
    default: return "Sage"
    }
}

/// One topic as the home/library screens need it — mirrors F3TopicSummary.
struct TopicSummary: Codable, Identifiable, Equatable, Hashable {
    let id: String
    let topic: String?
    let url: String?
    let kind: String?
    let updatedAt: Date
    let cardCount: Int
    let dueCount: Int
    let strength: Double?

    var displayLabel: String {
        if let topic, !topic.isEmpty { return topic }
        if let url, let host = URL(string: url)?.host {
            return host.replacingOccurrences(of: "www.", with: "")
        }
        return "(untitled)"
    }

    var sourceHost: String? {
        guard let url, let host = URL(string: url)?.host else { return nil }
        return host.replacingOccurrences(of: "www.", with: "")
    }

    enum CodingKeys: String, CodingKey {
        case id, topic, url, kind, strength
        case updatedAt = "updated_at"
        case cardCount = "card_count"
        case dueCount = "due_count"
    }
}

/// Mirrors /api/f3/home.
struct Home: Codable, Equatable {
    var dueCount: Int
    var cardCount: Int
    var reviewedToday: Int
    var streakDays: Int
    var topics: [TopicSummary]

    static let empty = Home(dueCount: 0, cardCount: 0, reviewedToday: 0, streakDays: 0, topics: [])

    enum CodingKeys: String, CodingKey {
        case topics
        case dueCount = "due_count"
        case cardCount = "card_count"
        case reviewedToday = "reviewed_today"
        case streakDays = "streak_days"
    }
}

/// One idea card. `answer` rides along for the reveal/self-grade path.
struct Card: Codable, Identifiable, Equatable {
    let id: String
    let threadId: String
    let prompt: String
    let answer: String
    let state: String        // new | learning | review
    let dueAt: Date
    let intervalDays: Double
    let reps: Int
    let lapses: Int
    let lastReviewedAt: Date?
    // Present on queue cards only.
    let topic: String?

    enum CodingKeys: String, CodingKey {
        case id, prompt, answer, state, reps, lapses, topic
        case threadId = "thread_id"
        case dueAt = "due_at"
        case intervalDays = "interval_days"
        case lastReviewedAt = "last_reviewed_at"
    }
}

/// Mirrors POST /api/f3/review/[id]/answer.
struct ReviewResult: Codable, Equatable {
    let grade: Int           // 0 forgot, 1 shaky, 2 solid
    let feedback: String?
    let answer: String
    let nextDueAt: Date
    let intervalDays: Double

    enum CodingKeys: String, CodingKey {
        case grade, feedback, answer
        case nextDueAt = "next_due_at"
        case intervalDays = "interval_days"
    }

    var nextDueLabel: String {
        if intervalDays < 0.5 { return "again in a few minutes" }
        let days = Int(intervalDays.rounded())
        if days <= 1 { return "again tomorrow" }
        return "again in \(days) days"
    }
}

/// One message in a topic conversation (f2 thread message).
struct Message: Codable, Identifiable, Equatable {
    var id: String { "\(role)-\(createdAt?.timeIntervalSince1970 ?? 0)-\(text.hashValue)" }
    let role: String
    let text: String
    let createdAt: Date?

    enum CodingKeys: String, CodingKey {
        case role, text
        case createdAt = "created_at"
    }
}
