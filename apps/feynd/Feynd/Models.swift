import Foundation

struct F2User: Codable, Equatable {
    let id: String
    let username: String
}

struct F2Topic: Codable, Identifiable, Equatable, Hashable {
    let id: String
    var topic: String?
    let url: String?
    var quizCount: Int
    var lastQuizzedAt: Date?
    var stars: Int
    var hardQuizCompletedAt: Date?
    let createdAt: Date
    let updatedAt: Date
    let client: String?

    var displayLabel: String {
        if let topic, !topic.isEmpty { return topic }
        if let url, let host = URL(string: url)?.host {
            return host.replacingOccurrences(of: "www.", with: "")
        }
        return "(untitled)"
    }

    /// Bare host for the source-card line under topic titles, e.g. "every.to".
    var sourceHost: String? {
        guard let url, let host = URL(string: url)?.host else { return nil }
        return host.replacingOccurrences(of: "www.", with: "")
    }

    enum CodingKeys: String, CodingKey {
        case id, topic, url, client, stars
        case quizCount = "quiz_count"
        case lastQuizzedAt = "last_quizzed_at"
        case hardQuizCompletedAt = "hard_quiz_completed_at"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    // Custom init so the iOS app keeps working against backends that don't
    // yet return `stars` / `hard_quiz_completed_at` (those fields shipped in
    // the same change as this client; older deployments won't have them).
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        topic = try c.decodeIfPresent(String.self, forKey: .topic)
        url = try c.decodeIfPresent(String.self, forKey: .url)
        client = try c.decodeIfPresent(String.self, forKey: .client)
        quizCount = try c.decodeIfPresent(Int.self, forKey: .quizCount) ?? 0
        lastQuizzedAt = try c.decodeIfPresent(Date.self, forKey: .lastQuizzedAt)
        stars = try c.decodeIfPresent(Int.self, forKey: .stars) ?? 0
        hardQuizCompletedAt = try c.decodeIfPresent(Date.self, forKey: .hardQuizCompletedAt)
        createdAt = try c.decode(Date.self, forKey: .createdAt)
        updatedAt = try c.decode(Date.self, forKey: .updatedAt)
    }
}

struct F2Message: Codable, Identifiable, Equatable {
    var id: String { "\(role)-\(createdAt?.timeIntervalSince1970 ?? 0)-\(text.hashValue)" }
    let role: String       // "user" | "assistant"
    let text: String
    let createdAt: Date?

    enum CodingKeys: String, CodingKey {
        case role, text
        case createdAt = "created_at"
    }
}

struct F2Thread: Codable {
    let id: String
    var topic: String?
    let url: String?
    let messages: [F2Message]
    var quizCount: Int
    var lastQuizzedAt: Date?
    var stars: Int
    var hardQuizCompletedAt: Date?

    var sourceHost: String? {
        guard let url, let host = URL(string: url)?.host else { return nil }
        return host.replacingOccurrences(of: "www.", with: "")
    }

    enum CodingKeys: String, CodingKey {
        case id, topic, url, messages, stars
        case quizCount = "quiz_count"
        case lastQuizzedAt = "last_quizzed_at"
        case hardQuizCompletedAt = "hard_quiz_completed_at"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        topic = try c.decodeIfPresent(String.self, forKey: .topic)
        url = try c.decodeIfPresent(String.self, forKey: .url)
        messages = try c.decodeIfPresent([F2Message].self, forKey: .messages) ?? []
        quizCount = try c.decodeIfPresent(Int.self, forKey: .quizCount) ?? 0
        lastQuizzedAt = try c.decodeIfPresent(Date.self, forKey: .lastQuizzedAt)
        stars = try c.decodeIfPresent(Int.self, forKey: .stars) ?? 0
        hardQuizCompletedAt = try c.decodeIfPresent(Date.self, forKey: .hardQuizCompletedAt)
    }
}

/// User-wide learning progress. Mirror of `/api/f2/progress`.
struct F2Progress: Codable, Equatable {
    var level: Int
    var starredTopicCount: Int
    var totalStars: Int
    var masteredTopicCount: Int
    var currentLevelAt: Int
    var nextLevelAt: Int
    var toNextLevel: Int

    /// 0..1 fill of the level-up ring. Handles the "already at next threshold"
    /// edge — never returns NaN, never exceeds 1.
    var progressFraction: Double {
        let span = max(1, nextLevelAt - currentLevelAt)
        let earned = max(0, starredTopicCount - currentLevelAt)
        return min(1.0, Double(earned) / Double(span))
    }

    static let zero = F2Progress(
        level: 0,
        starredTopicCount: 0,
        totalStars: 0,
        masteredTopicCount: 0,
        currentLevelAt: 0,
        nextLevelAt: 1,
        toNextLevel: 1
    )

    enum CodingKeys: String, CodingKey {
        case level
        case starredTopicCount = "starred_topic_count"
        case totalStars = "total_stars"
        case masteredTopicCount = "mastered_topic_count"
        case currentLevelAt = "current_level_at"
        case nextLevelAt = "next_level_at"
        case toNextLevel = "to_next_level"
    }
}
