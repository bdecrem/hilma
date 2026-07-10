import Foundation

// Decoded with .convertFromSnakeCase — properties are camelCase mirrors of
// the API's snake_case fields, no CodingKeys needed.

struct OmniUser: Codable, Equatable {
    let id: String
    let email: String
    let displayName: String?
    let language: String
}

struct Progress: Codable, Equatable {
    var level: Int
    var levelName: String
    var xp: Int
    var nextLevelXp: Int

    static let zero = Progress(level: 1, levelName: "Newbie", xp: 0, nextLevelXp: 100)

    var fraction: Double {
        nextLevelXp > 0 ? Double(xp) / Double(nextLevelXp) : 0
    }
}

struct AuthResponse: Codable {
    let user: OmniUser
    let progress: Progress
}

// MARK: Languages (client-side mirror of src/lib/omni/languages.ts)

struct Language: Identifiable, Hashable {
    let code: String
    let name: String
    let nativeName: String

    var id: String { code }
}

let allLanguages: [Language] = [
    Language(code: "es", name: "Spanish", nativeName: "Español"),
    Language(code: "fr", name: "French", nativeName: "Français"),
    Language(code: "it", name: "Italian", nativeName: "Italiano"),
    Language(code: "de", name: "German", nativeName: "Deutsch"),
    Language(code: "pt", name: "Portuguese", nativeName: "Português"),
    Language(code: "nl", name: "Dutch", nativeName: "Nederlands"),
    Language(code: "zh", name: "Mandarin", nativeName: "中文"),
    Language(code: "ja", name: "Japanese", nativeName: "日本語"),
    Language(code: "ko", name: "Korean", nativeName: "한국어"),
    Language(code: "ru", name: "Russian", nativeName: "Русский"),
    Language(code: "ar", name: "Arabic", nativeName: "العربية"),
    Language(code: "hi", name: "Hindi", nativeName: "हिन्दी"),
]

func language(for code: String) -> Language {
    allLanguages.first { $0.code == code }
        ?? Language(code: code, name: code, nativeName: code)
}

// MARK: Chapters

struct TopicSummary: Codable, Identifiable, Hashable {
    let id: String
    let language: String
    let level: Int
    let kind: String
    let title: String
    let titleTarget: String?
    let emoji: String?
    let description: String?
    let status: String
    let sortOrder: Int
    let cardCount: Int
}

struct TopicsResponse: Codable {
    let prebaked: [TopicSummary]
    let mine: [TopicSummary]
}

struct DialogueLine: Codable, Hashable {
    let speaker: String
    let text: String
    let romanization: String?
    let translation: String
}

struct GrammarExample: Codable, Hashable {
    let target: String
    let romanization: String?
    let translation: String
}

struct Grammar: Codable, Hashable {
    let title: String
    let explanation: String
    let examples: [GrammarExample]
}

struct TopicFull: Codable {
    let id: String
    let language: String
    let level: Int
    let kind: String
    let title: String
    let titleTarget: String?
    let emoji: String?
    let description: String?
    let dialogue: [DialogueLine]
    let grammar: Grammar?
    let status: String
}

struct Card: Codable, Identifiable, Hashable {
    let id: String
    let term: String
    let romanization: String?
    let meaning: String
    let example: String?
    let exampleTranslation: String?
    // Absent on freshly created topics (no review state yet).
    let strength: Int?
    let lastResult: String?
}

struct TopicDetail: Codable {
    let topic: TopicFull
    let cards: [Card]
}

// MARK: XP + talk sessions

struct XpResult: Codable {
    let earned: Int
    let leveledUp: Bool
    let level: Int
    let levelName: String
    let xp: Int
    let nextLevelXp: Int

    var progress: Progress {
        Progress(level: level, levelName: levelName, xp: xp, nextLevelXp: nextLevelXp)
    }
}

struct XpResponse: Codable {
    let xp: XpResult
}

struct Correction: Codable, Hashable {
    let quote: String
    let corrected: String
    let note: String
}

struct NewTopic: Codable {
    let id: String
    let title: String
    let titleTarget: String?
    let emoji: String?
    let description: String?
    let cardCount: Int
}

struct EndSessionResponse: Codable {
    let summary: String?
    let corrections: [Correction]
    let xp: XpResult
    let newTopic: NewTopic?
}

struct TalkSessionResponse: Codable {
    let clientSecret: ClientSecret
    let openaiSessionId: String?
    let conversation: Conversation
    let realtime: Realtime

    struct ClientSecret: Codable {
        let value: String
        let expiresAt: Double?
    }
    struct Conversation: Codable {
        let id: String
        let mode: String
        let topicId: String?
    }
    struct Realtime: Codable {
        let model: String
        let voice: String
        let callsUrl: URL
        let dataChannel: String
    }
}
