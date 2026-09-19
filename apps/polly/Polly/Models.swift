import Foundation

struct PollyUser: Codable, Equatable {
    let id: String
    let username: String
    var avatarUrl: String?
    /// Try-before-signup account; claiming keeps the id and all progress.
    var isGuest: Bool = false
    /// Active course language code (it/fr/ko); nil until the first run picked one.
    var language: String?

    enum CodingKeys: String, CodingKey {
        case id, username, language
        case avatarUrl = "avatar_url"
        case isGuest = "is_guest"
    }

    // Tolerant decode — handles backends that don't yet return avatar_url.
    init(id: String, username: String, avatarUrl: String? = nil, isGuest: Bool = false, language: String? = nil) {
        self.id = id
        self.username = username
        self.avatarUrl = avatarUrl
        self.isGuest = isGuest
        self.language = language
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        username = try c.decode(String.self, forKey: .username)
        avatarUrl = try c.decodeIfPresent(String.self, forKey: .avatarUrl)
        isGuest = try c.decodeIfPresent(Bool.self, forKey: .isGuest) ?? false
        language = try c.decodeIfPresent(String.self, forKey: .language)
    }
}

/// Narrated-recap state for a topic — mirror of the server's `audio_summary`
/// jsonb (the script text never reaches list payloads). status:
/// "generating" | "ready" | "error".
struct PollyAudioSummary: Codable, Equatable, Hashable {
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

/// Status of the web-researched study-context summary for book topics.
/// The topics list carries status only; the markdown itself comes from
/// GET /api/polly/topics/[id]/book-summary (see BookSummaryReaderView).
struct PollyBookSummary: Codable, Equatable, Hashable {
    let status: String        // "generating" | "ready" | "error"
    let error: String?
    let updatedAt: Date?

    enum CodingKeys: String, CodingKey {
        case status, error
        case updatedAt = "updated_at"
    }
}

struct PollyTopic: Codable, Identifiable, Equatable, Hashable {
    let id: String
    var topic: String?
    let url: String?
    var quizCount: Int
    var lastQuizzedAt: Date?
    var stars: Int
    var hardQuizCompletedAt: Date?
    var pendingQuizKind: String?
    /// Topic kind: chat | web | audio | video | paste | fallback, plus the
    /// user-set types book | mini | general and Polly's own guest_lesson |
    /// immersion | ask. Drives the glyph in the topic
    /// row. Auto-classified at thread creation; overridable from the Rename
    /// Topic sheet.
    var kind: String?
    var audioSummary: PollyAudioSummary?
    var bookSummary: PollyBookSummary?
    let createdAt: Date
    let updatedAt: Date
    let client: String?
    /// When the user pinned this topic; nil = not pinned. Also orders pinned
    /// topics (most-recently-pinned first).
    var pinnedAt: Date?
    /// User instruction scoping what they want to be tested on ("only the
    /// first half"). Flash cards, quizzes, and the Final Review honor it.
    var studyFocus: String?
    /// Non-nil while a Second Chance retake is on offer (24h after a failed
    /// 2nd+ Final Review attempt). Topic-detail payload only.
    var secondChanceUntil: Date?
    /// When the gold badge needs its next refresher. Set on certification
    /// and on every renewal (30/60/90-day ladder). Nil until certified.
    var recertDueAt: Date?
    /// Listed in the community directory. Nil on older backends.
    var shared: Bool?
    /// A lesson Polly wrote (kind "lesson"): its 1-based place on the path.
    /// Nil for every other topic, and for a lesson whose path was replaced
    /// by a retaken level check.
    var pathPosition: Int?

    var isPinned: Bool { pinnedAt != nil }
    /// On the learner's path — drawn in the path list, not the topic list.
    var isOnPath: Bool { kind == "lesson" && pathPosition != nil }

    /// Gold badge earned (Final Review passed).
    var isCertified: Bool { stars >= 3 }
    /// Past the refresher due date — the badge renders dimmed.
    var recertLapsed: Bool {
        guard isCertified, let due = recertDueAt else { return false }
        return due < Date()
    }
    /// Inside the final 7 days before the badge dims.
    var recertDueSoon: Bool {
        guard isCertified, !recertLapsed, let due = recertDueAt else { return false }
        return due.timeIntervalSinceNow < 7 * 86_400
    }

    /// The Second Chance offer is live right now.
    var secondChanceAvailable: Bool {
        guard let until = secondChanceUntil else { return false }
        return until > Date()
    }

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
        case id, topic, url, client, stars, kind, shared
        case quizCount = "quiz_count"
        case lastQuizzedAt = "last_quizzed_at"
        case hardQuizCompletedAt = "hard_quiz_completed_at"
        case pendingQuizKind = "pending_quiz_kind"
        case audioSummary = "audio_summary"
        case bookSummary = "book_summary"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case pinnedAt = "pinned_at"
        case studyFocus = "study_focus"
        case secondChanceUntil = "second_chance_until"
        case recertDueAt = "recert_due_at"
        case pathPosition = "path_position"
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
        audioSummary = try c.decodeIfPresent(PollyAudioSummary.self, forKey: .audioSummary)
        bookSummary = try c.decodeIfPresent(PollyBookSummary.self, forKey: .bookSummary)
        createdAt = try c.decode(Date.self, forKey: .createdAt)
        updatedAt = try c.decode(Date.self, forKey: .updatedAt)
        pinnedAt = try c.decodeIfPresent(Date.self, forKey: .pinnedAt)
        studyFocus = try c.decodeIfPresent(String.self, forKey: .studyFocus)
        secondChanceUntil = try c.decodeIfPresent(Date.self, forKey: .secondChanceUntil)
        recertDueAt = try c.decodeIfPresent(Date.self, forKey: .recertDueAt)
        shared = try c.decodeIfPresent(Bool.self, forKey: .shared)
        pathPosition = try c.decodeIfPresent(Int.self, forKey: .pathPosition)
    }
}

struct PollyMessage: Codable, Identifiable, Equatable {
    var id: String { "\(role)-\(createdAt?.timeIntervalSince1970 ?? 0)-\(text.hashValue)" }
    let role: String       // "user" | "assistant"
    let text: String
    let createdAt: Date?

    enum CodingKeys: String, CodingKey {
        case role, text
        case createdAt = "created_at"
    }
}

/// A guest lesson's plan — the teacher's own structure, pulled from the
/// transcript once by the backend (lib/polly/lesson.ts). Shown in the
/// Lesson card at the top of the topic and its sheet.
struct PollyLessonTerm: Codable, Equatable, Identifiable {
    var id: String { term }
    let term: String
    let meaning: String
    let sentence: String
}

struct PollyDialogueLine: Codable, Equatable, Identifiable {
    var id: String { "\(speaker)|\(line)" }
    let speaker: String
    let line: String
    let english: String
}

struct PollyLesson: Codable, Equatable {
    let host: String?
    let series: String?
    let language: String
    let keyWords: [PollyLessonTerm]
    let phrases: [PollyLessonTerm]
    let storySummary: String
    let storySummaryEnglish: String
    let grammarPoint: String?
    let closingQuestion: String?
    // Lessons Polly wrote (kind "lesson") also carry these.
    /// The situation in one English line.
    var scene: String?
    /// The model conversation, line by line.
    var dialogue: [PollyDialogueLine]?
    /// The grammar point explained in plain English.
    var grammarExplained: String?
    /// The level it was written for ("A1").
    var level: String?

    enum CodingKeys: String, CodingKey {
        case host, series, language, phrases, scene, dialogue, level
        case keyWords = "key_words"
        case storySummary = "story_summary"
        case storySummaryEnglish = "story_summary_english"
        case grammarPoint = "grammar_point"
        case closingQuestion = "closing_question"
        case grammarExplained = "grammar_explained"
    }

    /// "Lesson by Silvia · Italiando Storie", or whatever parts exist.
    var byline: String {
        if dialogue != nil { return ["Lesson by Polly", level].compactMap { $0 }.joined(separator: " · ") }
        let who = [host.map { "by \($0)" }, series].compactMap { $0 }
        return (["Lesson"] + who).joined(separator: " · ")
    }
}

struct PollyThread: Codable {
    let id: String
    var topic: String?
    let url: String?
    let messages: [PollyMessage]
    var quizCount: Int
    var lastQuizzedAt: Date?
    var stars: Int
    var hardQuizCompletedAt: Date?
    var pendingQuizKind: String?
    var audioSummary: PollyAudioSummary?
    /// See PollyTopic.studyFocus.
    var studyFocus: String?
    /// See PollyTopic.secondChanceUntil — topic-detail payload only.
    var secondChanceUntil: Date?
    var recertDueAt: Date?
    /// Topic kind (see PollyTopic.kind); "guest_lesson" shows the Lesson card.
    var kind: String?
    /// The lesson plan of a guest lesson, nil until the backend extracts it.
    var lesson: PollyLesson?
    /// Lessons Polly wrote: place on the path, and which steps are done.
    var pathPosition: Int?
    var lessonSteps: PollyLessonSteps?
    var lessonDoneAt: Date?

    var isGuestLesson: Bool { kind == "guest_lesson" }
    /// A lesson Polly wrote for the learner's path.
    var isPollyLesson: Bool { kind == "lesson" }
    var isInfinity: Bool { kind == "infinity" }

    var isCertified: Bool { stars >= 3 }
    var recertLapsed: Bool {
        guard isCertified, let due = recertDueAt else { return false }
        return due < Date()
    }
    var recertDueSoon: Bool {
        guard isCertified, !recertLapsed, let due = recertDueAt else { return false }
        return due.timeIntervalSinceNow < 7 * 86_400
    }

    var sourceHost: String? {
        guard let url, let host = URL(string: url)?.host else { return nil }
        return host.replacingOccurrences(of: "www.", with: "")
    }

    /// The Second Chance offer is live right now.
    var secondChanceAvailable: Bool {
        guard let until = secondChanceUntil else { return false }
        return until > Date()
    }

    enum CodingKeys: String, CodingKey {
        case id, topic, url, messages, stars
        case quizCount = "quiz_count"
        case lastQuizzedAt = "last_quizzed_at"
        case hardQuizCompletedAt = "hard_quiz_completed_at"
        case pendingQuizKind = "pending_quiz_kind"
        case audioSummary = "audio_summary"
        case studyFocus = "study_focus"
        case secondChanceUntil = "second_chance_until"
        case recertDueAt = "recert_due_at"
        case kind, lesson
        case pathPosition = "path_position"
        case lessonSteps = "lesson_steps"
        case lessonDoneAt = "lesson_done_at"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        topic = try c.decodeIfPresent(String.self, forKey: .topic)
        url = try c.decodeIfPresent(String.self, forKey: .url)
        messages = try c.decodeIfPresent([PollyMessage].self, forKey: .messages) ?? []
        kind = try c.decodeIfPresent(String.self, forKey: .kind)
        lesson = try? c.decodeIfPresent(PollyLesson.self, forKey: .lesson)
        pathPosition = try? c.decodeIfPresent(Int.self, forKey: .pathPosition)
        lessonSteps = try? c.decodeIfPresent(PollyLessonSteps.self, forKey: .lessonSteps)
        lessonDoneAt = try? c.decodeIfPresent(Date.self, forKey: .lessonDoneAt)
        quizCount = try c.decodeIfPresent(Int.self, forKey: .quizCount) ?? 0
        lastQuizzedAt = try c.decodeIfPresent(Date.self, forKey: .lastQuizzedAt)
        stars = try c.decodeIfPresent(Int.self, forKey: .stars) ?? 0
        hardQuizCompletedAt = try c.decodeIfPresent(Date.self, forKey: .hardQuizCompletedAt)
        pendingQuizKind = try c.decodeIfPresent(String.self, forKey: .pendingQuizKind)
        audioSummary = try c.decodeIfPresent(PollyAudioSummary.self, forKey: .audioSummary)
        studyFocus = try c.decodeIfPresent(String.self, forKey: .studyFocus)
        secondChanceUntil = try c.decodeIfPresent(Date.self, forKey: .secondChanceUntil)
        recertDueAt = try c.decodeIfPresent(Date.self, forKey: .recertDueAt)
    }
}

/// Which of a lesson's three steps are done (the backend stores the time
/// each was finished; the app only needs whether).
struct PollyLessonSteps: Codable, Equatable {
    var talk: String?
    var words: String?
    var grammar: String?
}

// MARK: - The path (Agentic Learning Mode)

/// GET /api/polly/path — the level check's verdict and the lessons in order.
struct PollyPath: Codable, Equatable {
    let language: String
    let languageName: String
    let level: String?
    let placement: Placement?
    var cardDismissed: Bool
    let lessons: [Lesson]

    struct Placement: Codable, Equatable {
        let level: String
        let canDo: String
        let shaky: String
        let interests: [String]
        enum CodingKeys: String, CodingKey {
            case level, shaky, interests
            case canDo = "can_do"
        }
    }

    struct Lesson: Codable, Equatable, Identifiable {
        var id: Int { position }
        let position: Int
        let title: String
        let scene: String
        let grammar: String
        let threadId: String?
        /// done | current | writing | locked
        let state: String
        let steps: Steps
        struct Steps: Codable, Equatable {
            let talk: Bool
            let words: Bool
            let grammar: Bool
            var doneCount: Int { [talk, words, grammar].filter { $0 }.count }
        }
        enum CodingKeys: String, CodingKey {
            case position, title, scene, grammar, state, steps
            case threadId = "thread_id"
        }
    }

    /// The level check has been taken.
    var isPlaced: Bool { level != nil && !lessons.isEmpty }
    var current: Lesson? { lessons.first { $0.state == "current" || $0.state == "writing" } }
    var doneCount: Int { lessons.filter { $0.state == "done" }.count }
    var isFinished: Bool { isPlaced && doneCount == lessons.count }

    enum CodingKeys: String, CodingKey {
        case language, level, placement, lessons
        case languageName = "language_name"
        case cardDismissed = "card_dismissed"
    }
}

/// Italic flavor word that sits next to the level number ("Level 4 · Apprentice").
/// Kept in lockstep with `levelTitle()` in `src/lib/f2/progress.ts`.
func pollyLevelTitle(_ level: Int) -> String {
    switch level {
    case ..<1: return L("Newcomer", "Nuovo arrivato", "Nouveau venu", "새내기")
    case 1: return L("Beginner", "Principiante", "Débutant", "입문자")
    case 2: return L("Curious", "Curioso", "Curieux", "호기심쟁이")
    case 3: return L("Student", "Studente", "Élève", "학생")
    case 4: return L("Apprentice", "Apprendista", "Apprenti", "견습생")
    case 5: return L("Scholar", "Studioso", "Érudit", "학자")
    case 6: return L("Adept", "Provetto", "Initié", "숙련자")
    case 7: return L("Practitioner", "Professionista", "Confirmé", "실력자")
    case 8: return L("Expert", "Esperto", "Expert", "전문가")
    case 9: return L("Master", "Maestro", "Maître", "달인")
    default: return L("Sage", "Saggio", "Sage", "현자")
    }
}

/// User-wide learning progress. Mirror of `/api/polly/progress`.
struct PollyProgress: Codable, Equatable {
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

    static let zero = PollyProgress(
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

/// A keepsake the learner saved — quotes, for now. Browsed in the Pebbles
/// carousel; one shows at random while a flash set is being graded.
struct PollyArtifact: Codable, Identifiable, Equatable {
    let id: String
    let threadId: String?
    let kind: String
    let body: String
    let source: String?
    /// Public URL of the photo for kind == "image"; nil for quotes.
    let imageUrl: String?
    /// Topic name of the linked thread, for the chip. Nil when unlinked.
    let topic: String?

    var isImage: Bool { imageUrl != nil }

    enum CodingKeys: String, CodingKey {
        case id, kind, body, source, topic
        case threadId = "thread_id"
        case imageUrl = "image_url"
    }
}
