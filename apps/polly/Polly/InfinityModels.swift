import Foundation

// Infinity Chat models — mirror of src/lib/polly/infinity.ts. One Infinity
// Chat topic holds many conversations; each conversation, once cleaned up,
// carries an analysis: the ≤5 curated fixes, vocab (either direction) and
// grammar drills.

struct InfinityChat: Codable, Identifiable, Equatable {
    let id: String
    let threadId: String
    let voiceSessionId: String?
    var title: String?
    var analysis: InfinityAnalysis?
    var cleanupSessionId: String?
    var cleanedUpAt: Date?
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id, title, analysis
        case threadId = "thread_id"
        case voiceSessionId = "voice_session_id"
        case cleanupSessionId = "cleanup_session_id"
        case cleanedUpAt = "cleaned_up_at"
        case createdAt = "created_at"
    }

    var isCleanedUp: Bool { cleanedUpAt != nil }
    var hasAnalysis: Bool { (analysis?.fixes.isEmpty == false) }
    var displayTitle: String { (title?.isEmpty == false ? title! : "A quick chat") }
}

struct InfinityAnalysis: Codable, Equatable {
    let title: String
    let fixes: [InfinityFix]
    let vocab: [InfinityVocab]
    let grammar: [InfinityGrammar]
}

struct InfinityFix: Codable, Equatable, Identifiable {
    let id: String
    let said: String
    let fixed: String
    let kind: String      // grammar | vocab | phrasing
    let note: String
    let sayIt: String

    enum CodingKeys: String, CodingKey {
        case id, said, fixed, kind, note
        case sayIt = "say_it"
    }
}

struct InfinityVocab: Codable, Equatable, Identifiable {
    var id: String { term }
    let term: String
    let meaning: String
}

struct InfinityGrammar: Codable, Equatable, Identifiable {
    var id: String { point }
    let point: String
    let explain: String
    let drills: [InfinityDrill]
}

struct InfinityDrill: Codable, Equatable, Identifiable {
    var id: String { prompt }
    let prompt: String
    let answer: String
}
