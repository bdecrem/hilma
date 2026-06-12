import Foundation

struct User: Codable, Equatable {
    let id: String
    let username: String
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
