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
    /// How it was had: "voice", "text" or "mixed" (Direction 2b — a typed chat
    /// is the same object as a spoken one).
    var input: String?
    /// Still going: a typed chat not finished yet.
    var open: Bool?
    /// Finished, with conversation the clean-up hasn't read (new, or continued).
    var needsCleanup: Bool?
    var minutes: Int?
    /// Folded fixes so far, while it is open.
    var fixesSoFar: Int?
    /// Only on the single-chat fetch.
    var transcript: [ChatTurn]?

    enum CodingKeys: String, CodingKey {
        case id, title, analysis, input, open, minutes, transcript
        case threadId = "thread_id"
        case voiceSessionId = "voice_session_id"
        case cleanupSessionId = "cleanup_session_id"
        case cleanedUpAt = "cleaned_up_at"
        case createdAt = "created_at"
        case needsCleanup = "needs_cleanup"
        case fixesSoFar = "fixes_so_far"
    }

    var isOpen: Bool { open == true }
    /// Ready for (another) clean-up. Older servers don't say; no analysis = yes.
    var wantsCleanup: Bool { needsCleanup ?? (analysis == nil) }
    var isTyped: Bool { input == "text" }
    var isMixed: Bool { input == "mixed" }
    /// SF Symbol for how the chat was had.
    var inputSymbol: String { isTyped ? "keyboard" : "mic.fill" }
    var isCleanedUp: Bool { cleanedUpAt != nil }
    var isMastered: Bool { analysis?.masteredAt != nil }
    var hasQuiz: Bool { (analysis?.cardIds?.isEmpty == false) }
    var hasAnalysis: Bool { (analysis?.fixes.isEmpty == false) }
    var displayTitle: String { (title?.isEmpty == false ? title! : L("A quick chat", "Due chiacchiere", "Une petite discussion", "짧은 대화")) }
}

struct InfinityAnalysis: Codable, Equatable {
    let title: String
    let fixes: [InfinityFix]
    let vocab: [InfinityVocab]
    let grammar: [InfinityGrammar]
    /// The quiz deck's card ids (set after clean-up); present once a quiz exists.
    var cardIds: [String]?
    /// When the learner passed this conversation's quiz.
    var masteredAt: Date?
    /// A continued chat: how many fixes at the front are new (the walk covers
    /// only those).
    var freshFixes: Int?

    enum CodingKeys: String, CodingKey {
        case title, fixes, vocab, grammar
        case cardIds = "card_ids"
        case masteredAt = "mastered_at"
        case freshFixes = "fresh_fixes"
    }

    /// The fixes the clean-up walk covers.
    var walkFixes: [InfinityFix] {
        let n = freshFixes ?? 0
        return n > 0 ? Array(fixes.prefix(n)) : fixes
    }
}

/// One stored turn of a conversation. `lane`, `fix` and `card` come from the
/// text chat; spoken turns carry role and text.
struct ChatTurn: Codable, Equatable, Identifiable {
    var id: String { "\(at ?? "")-\(role)-\(text.hashValue)" }
    let role: String
    let text: String
    var via: String?
    var at: String?
    var lane: String?
    var fix: TalkFix?
    var card: TalkCard?
}

/// The one fix Polly folds under a reply in the text chat.
struct TalkFix: Codable, Equatable {
    let said: String
    let better: String
    let why: String
}

/// Something the agent made, drawn as a card under its reply.
struct TalkCard: Codable, Equatable, Identifiable {
    var id: String { "\(threadId)-\(count)-\(focus ?? "")" }
    let kind: String
    let title: String
    let threadId: String
    let count: Int
    var focus: String?

    enum CodingKeys: String, CodingKey {
        case kind, title, count, focus
        case threadId = "thread_id"
    }
}

/// One answer from the text chat: the lane the server picked and Polly's
/// turns (a reply; or the agent's answer, then the line that resumes).
struct TalkResponse: Codable {
    let lane: String
    let intent: String
    let messages: [ChatTurn]
    let chat: InfinityChat?
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

/// Fast / Thorough — the learner's content quality (Profile → Learning). One
/// account-level setting over every step that writes or judges learning
/// content: the Infinity clean-up, the cards Polly writes, answer grading.
/// Which model runs at each level is decided per feature on the server
/// (src/lib/polly/quality.ts, apps/polly/QUALITY.md).
enum ContentQuality: String, CaseIterable {
    case fast, deep
    var label: String { self == .fast ? "Fast" : "Thorough" }
}

extension InfinityChat: Hashable {
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}
