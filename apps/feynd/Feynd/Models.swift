import Foundation

struct F2User: Codable, Equatable {
    let id: String
    let username: String
    var avatarUrl: String?

    enum CodingKeys: String, CodingKey {
        case id, username
        case avatarUrl = "avatar_url"
    }

    // Tolerant decode — handles backends that don't yet return avatar_url.
    init(id: String, username: String, avatarUrl: String? = nil) {
        self.id = id
        self.username = username
        self.avatarUrl = avatarUrl
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        username = try c.decode(String.self, forKey: .username)
        avatarUrl = try c.decodeIfPresent(String.self, forKey: .avatarUrl)
    }
}

/// Narrated-recap state for a topic — mirror of the server's `audio_summary`
/// jsonb (the script text never reaches list payloads). status:
/// "generating" | "ready" | "error".
struct F2AudioSummary: Codable, Equatable, Hashable {
    let status: String
    let url: String?
    let scale: String?        // "book" | "short"
    let durationSecs: Int?
    let error: String?
    let updatedAt: Date?

    enum CodingKeys: String, CodingKey {
        case status, url, scale, error
        case durationSecs = "duration_secs"
        case updatedAt = "updated_at"
    }
}

struct F2Topic: Codable, Identifiable, Equatable, Hashable {
    let id: String
    var topic: String?
    let url: String?
    var quizCount: Int
    var lastQuizzedAt: Date?
    var stars: Int
    var hardQuizCompletedAt: Date?
    var pendingQuizKind: String?
    /// Topic kind: chat | web | audio | video | paste | fallback, plus the
    /// user-set types book | mini | general. Drives the glyph in the topic
    /// row. Auto-classified at thread creation; overridable from the Rename
    /// Topic sheet.
    var kind: String?
    var audioSummary: F2AudioSummary?
    let createdAt: Date
    let updatedAt: Date
    let client: String?
    /// When the user pinned this topic; nil = not pinned. Also orders pinned
    /// topics (most-recently-pinned first).
    var pinnedAt: Date?
    /// User instruction scoping what they want to be tested on ("only the
    /// first half"). Flash cards, quizzes, and the Final Review honor it.
    var studyFocus: String?

    var isPinned: Bool { pinnedAt != nil }

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
        case id, topic, url, client, stars, kind
        case quizCount = "quiz_count"
        case lastQuizzedAt = "last_quizzed_at"
        case hardQuizCompletedAt = "hard_quiz_completed_at"
        case pendingQuizKind = "pending_quiz_kind"
        case audioSummary = "audio_summary"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case pinnedAt = "pinned_at"
        case studyFocus = "study_focus"
    }

    // Custom init so the iOS app keeps working against backends that don't
    // yet return the newer optional fields (kind, pending_quiz_kind, etc.).
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
        pendingQuizKind = try c.decodeIfPresent(String.self, forKey: .pendingQuizKind)
        kind = try c.decodeIfPresent(String.self, forKey: .kind)
        audioSummary = try c.decodeIfPresent(F2AudioSummary.self, forKey: .audioSummary)
        createdAt = try c.decode(Date.self, forKey: .createdAt)
        updatedAt = try c.decode(Date.self, forKey: .updatedAt)
        pinnedAt = try c.decodeIfPresent(Date.self, forKey: .pinnedAt)
        studyFocus = try c.decodeIfPresent(String.self, forKey: .studyFocus)
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
    var pendingQuizKind: String?
    var audioSummary: F2AudioSummary?
    /// See F2Topic.studyFocus.
    var studyFocus: String?

    var sourceHost: String? {
        guard let url, let host = URL(string: url)?.host else { return nil }
        return host.replacingOccurrences(of: "www.", with: "")
    }

    enum CodingKeys: String, CodingKey {
        case id, topic, url, messages, stars
        case quizCount = "quiz_count"
        case lastQuizzedAt = "last_quizzed_at"
        case hardQuizCompletedAt = "hard_quiz_completed_at"
        case pendingQuizKind = "pending_quiz_kind"
        case audioSummary = "audio_summary"
        case studyFocus = "study_focus"
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
        pendingQuizKind = try c.decodeIfPresent(String.self, forKey: .pendingQuizKind)
        audioSummary = try c.decodeIfPresent(F2AudioSummary.self, forKey: .audioSummary)
        studyFocus = try c.decodeIfPresent(String.self, forKey: .studyFocus)
    }
}

/// Italic flavor word that sits next to the level number ("Level 4 · Apprentice").
/// Kept in lockstep with `levelTitle()` in `src/lib/f2/progress.ts`.
func feyndLevelTitle(_ level: Int) -> String {
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

/// User-wide learning progress. Mirror of `/api/f2/progress`.
struct F2Progress: Codable, Equatable {
    var level: Int
    var topicCount: Int
    var totalStars: Int
    var masteredTopicCount: Int
    var currentLevelAt: Int
    var nextLevelAt: Int
    var toNextLevel: Int

    /// 0..1 fill of the level-up ring — mirrors the linear progress bar in
    /// ProfileSheet exactly. Backend levels are based on TOTAL stars (not
    /// starred-topic count), so the numerator must be totalStars too.
    /// Handles the "already at next threshold" edge — never NaN, never > 1.
    var progressFraction: Double {
        let span = max(1, nextLevelAt - currentLevelAt)
        let earned = max(0, totalStars - currentLevelAt)
        return min(1.0, Double(earned) / Double(span))
    }

    static let zero = F2Progress(
        level: 0,
        topicCount: 0,
        totalStars: 0,
        masteredTopicCount: 0,
        currentLevelAt: 0,
        nextLevelAt: 1,
        toNextLevel: 1
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
