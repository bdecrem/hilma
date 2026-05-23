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

    enum CodingKeys: String, CodingKey {
        case id, topic, url, client
        case quizCount = "quiz_count"
        case lastQuizzedAt = "last_quizzed_at"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
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

    enum CodingKeys: String, CodingKey {
        case id, topic, url, messages
        case quizCount = "quiz_count"
        case lastQuizzedAt = "last_quizzed_at"
    }
}
