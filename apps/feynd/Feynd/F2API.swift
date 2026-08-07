import Foundation

enum F2APIError: Error, LocalizedError {
    case unauthenticated
    case http(Int, String?)
    case decode(Error)
    case transport(Error)

    var errorDescription: String? {
        switch self {
        case .unauthenticated: return "Not signed in."
        case .http(let code, let msg): return "Server returned \(code): \(msg ?? "no message")."
        case .decode(let e): return "Couldn't read server response: \(e.localizedDescription)."
        case .transport(let e): return e.localizedDescription
        }
    }
}

/// Thin HTTP client for the F2 backend.
///
/// Session is held in the shared HTTPCookieStorage. The web app sets an
/// httpOnly persistent cookie named `f2_session` with Max-Age 30 days; iOS
/// URLSession picks it up automatically and replays it on subsequent calls,
/// surviving app launches via the system cookie store.
final class F2API {
    static let shared = F2API()

    private let session: URLSession
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    private init() {
        let config = URLSessionConfiguration.default
        config.httpCookieStorage = HTTPCookieStorage.shared
        config.httpShouldSetCookies = true
        config.httpCookieAcceptPolicy = .always
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        // F2 data is per-user and live. Drop the cache entirely so a list/topic
        // fetch can never be served stale from URLCache (the session config's
        // requestCachePolicy alone isn't enough — per-request .useProtocolCachePolicy
        // overrides it, so a cacheable response header would still be replayed).
        config.urlCache = nil
        self.session = URLSession(configuration: config)

        self.encoder = JSONEncoder()
        self.encoder.dateEncodingStrategy = .iso8601

        self.decoder = JSONDecoder()
        // Server returns timestamps in two flavors:
        // - ISO8601 with fractional seconds + timezone (Postgres timestamptz)
        // - Plain ISO8601 (set on client side via new Date().toISOString())
        // Try both before giving up.
        let isoFractional = ISO8601DateFormatter()
        isoFractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let isoBasic = ISO8601DateFormatter()
        isoBasic.formatOptions = [.withInternetDateTime]
        self.decoder.dateDecodingStrategy = .custom { d in
            let container = try d.singleValueContainer()
            let str = try container.decode(String.self)
            if let date = isoFractional.date(from: str) { return date }
            if let date = isoBasic.date(from: str) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unparseable date: \(str)")
        }
    }

    // MARK: Auth

    struct LoginResponse: Codable { let user: F2User }

    func login(username: String, password: String) async throws -> F2User {
        struct Body: Encodable { let username: String; let password: String }
        let res: LoginResponse = try await post("/api/f2/auth/login", body: Body(username: username, password: password))
        return res.user
    }

    /// Create a fresh account with email + password. Server enforces 8+ char
    /// password and email format, returns 409 if the email is already taken.
    /// Auto-signs in (session cookie set on the response).
    func signup(email: String, password: String) async throws -> F2User {
        struct Body: Encodable { let email: String; let password: String }
        let res: LoginResponse = try await post("/api/f2/auth/signup", body: Body(email: email, password: password))
        return res.user
    }

    func me() async throws -> F2User {
        let res: LoginResponse = try await get("/api/f2/auth/me")
        return res.user
    }

    func logout() async throws {
        let _: EmptyResponse = try await post("/api/f2/auth/logout", body: EmptyBody())
        clearCookies()
    }

    // MARK: Messages

    /// Optional thread-state snapshot returned when a chat turn changed the
    /// thread's quiz/star state (e.g. a reflection quiz started).
    struct MessageThreadState: Codable {
        let pendingQuizKind: String?
        let stars: Int
        let quizCount: Int
        let hardQuizCompletedAt: Date?

        enum CodingKeys: String, CodingKey {
            case stars
            case pendingQuizKind = "pending_quiz_kind"
            case quizCount = "quiz_count"
            case hardQuizCompletedAt = "hard_quiz_completed_at"
        }
    }

    struct MessageResponse: Codable {
        let reply: String
        let threadId: String?
        let threadState: MessageThreadState?

        enum CodingKeys: String, CodingKey {
            case reply
            case threadId = "thread_id"
            case threadState = "thread_state"
        }
    }

    func sendMessage(text: String, threadId: String? = nil, model: String? = nil) async throws -> MessageResponse {
        struct Body: Encodable {
            let text: String
            let thread_id: String?
            let model: String?
        }
        return try await post("/api/f2/messages", body: Body(text: text, thread_id: threadId, model: model))
    }

    // MARK: Topics

    struct TopicsResponse: Codable { let topics: [F2Topic] }
    struct ThreadResponse: Codable { let thread: F2Thread }
    struct IngestResponse: Codable {
        let thread: ThreadStub
        struct ThreadStub: Codable { let id: String; let topic: String? }
    }

    func listTopics() async throws -> [F2Topic] {
        let res: TopicsResponse = try await get("/api/f2/topics")
        return res.topics
    }

    struct LatestResponse: Codable { let thread: F2Thread? }

    func latestThread() async throws -> F2Thread? {
        let res: LatestResponse = try await get("/api/f2/latest")
        return res.thread
    }

    func getThread(id: String) async throws -> F2Thread {
        let res: ThreadResponse = try await get("/api/f2/topics/\(id)")
        return res.thread
    }

    /// Create a bare topic from a typed title (the Topics screen's + button).
    func createTopic(title: String, kind: String) async throws {
        struct Body: Encodable {
            let topic: String
            let kind: String
        }
        struct Created: Decodable { let thread: Thread
            struct Thread: Decodable { let id: String } }
        let _: Created = try await post("/api/f2/topics", body: Body(topic: title, kind: kind))
    }

    /// Rename a topic and/or set its user-chosen type (kind). Pass nil to
    /// leave either field unchanged.
    func renameTopic(id: String, to newTopic: String, kind: String? = nil) async throws {
        struct Body: Encodable {
            let topic: String
            let kind: String?
        }
        let _: EmptyResponse = try await request("/api/f2/topics/\(id)", method: "PATCH", body: Body(topic: newTopic, kind: kind))
    }

    func setPinned(id: String, pinned: Bool) async throws {
        struct Body: Encodable { let pinned: Bool }
        let _: EmptyResponse = try await request("/api/f2/topics/\(id)", method: "PATCH", body: Body(pinned: pinned))
    }

    /// Save (or clear, with "") the topic's study focus. Returns how many
    /// flash cards the topic currently has so the caller can rebuild a deck
    /// that was generated under the old focus.
    func setStudyFocus(id: String, focus: String) async throws -> Int {
        struct Body: Encodable {
            let studyFocus: String
            enum CodingKeys: String, CodingKey { case studyFocus = "study_focus" }
        }
        struct Response: Decodable {
            let flashCardCount: Int?
            enum CodingKeys: String, CodingKey { case flashCardCount = "flash_card_count" }
        }
        let res: Response = try await request("/api/f2/topics/\(id)", method: "PATCH", body: Body(studyFocus: focus))
        return res.flashCardCount ?? 0
    }

    func deleteTopic(id: String) async throws {
        let _: EmptyResponse = try await request("/api/f2/topics/\(id)", method: "DELETE", body: nil as EmptyBody?)
    }

    /// Response from `POST /api/f2/topics/[id]/quiz`. Stars are not yet
    /// awarded — `pendingQuizKind` records which kind is in flight so the UI
    /// can show a Done button.
    struct QuizResponse: Codable {
        let reply: String
        let kind: String?
        let pendingQuizKind: String?
        let stars: Int?
        let quizCount: Int?
        let hardQuizCompletedAt: Date?

        enum CodingKeys: String, CodingKey {
            case reply, kind, stars
            case pendingQuizKind = "pending_quiz_kind"
            case quizCount = "quiz_count"
            case hardQuizCompletedAt = "hard_quiz_completed_at"
        }
    }

    /// `kind`: "standard" earns up to 2 stars, "hard" earns the third star.
    /// Just marks the quiz as in-flight — no star yet. `model` is the picker's
    /// registry key so quiz questions come from the same model as chat.
    func quizMe(id: String, kind: String = "standard", model: String? = nil) async throws -> QuizResponse {
        struct Body: Encodable {
            let kind: String
            let model: String?
        }
        let res: QuizResponse = try await post("/api/f2/topics/\(id)/quiz", body: Body(kind: kind, model: model))
        return res
    }

    /// Response from `POST /api/f2/topics/[id]/quiz/complete` — star is now
    /// awarded based on whichever kind was pending. For Quiz 2 (going from
    /// 1★ to 2★), `passed/accepted/total/notes` describe how the LLM grader
    /// judged the user's answers. Other paths set `passed: true`,
    /// `accepted: nil`, `total: nil`.
    struct QuizCompleteResponse: Codable {
        let stars: Int?
        let quizCount: Int?
        let hardQuizCompletedAt: Date?
        let completedKind: String?
        let passed: Bool?
        let accepted: Int?
        let total: Int?
        let notes: String?

        enum CodingKeys: String, CodingKey {
            case stars, passed, accepted, total, notes
            case quizCount = "quiz_count"
            case hardQuizCompletedAt = "hard_quiz_completed_at"
            case completedKind = "completed_kind"
        }
    }

    /// Tell the server the user has finished answering the in-flight quiz.
    /// The server awards the star (or no-ops if nothing was pending).
    func completeQuiz(id: String) async throws -> QuizCompleteResponse {
        let res: QuizCompleteResponse = try await request(
            "/api/f2/topics/\(id)/quiz/complete",
            method: "POST",
            body: nil as EmptyBody?
        )
        return res
    }

    func fetchProgress() async throws -> F2Progress {
        try await get("/api/f2/progress")
    }

    // MARK: Audio summary

    struct AudioSummaryStartResponse: Codable {
        let audioSummary: F2AudioSummary?
        enum CodingKeys: String, CodingKey { case audioSummary = "audio_summary" }
    }

    /// Kick off narrated-summary generation for a topic. Returns immediately
    /// with the pending state (status "generating"); poll listTopics() until
    /// the status flips to ready/error. Server answers 409 if a generation is
    /// already in flight for this topic.
    func generateAudioSummary(id: String, model: String? = nil) async throws -> F2AudioSummary? {
        struct Body: Encodable { let model: String? }
        let res: AudioSummaryStartResponse = try await post("/api/f2/topics/\(id)/audio-summary", body: Body(model: model))
        return res.audioSummary
    }

    // MARK: Additional materials

    struct AddSourceRequest: Codable { let url: String }
    struct AddSourceResponse: Codable {
        let total: Int
        let fetched: Bool
    }

    /// Attach an additional URL to an existing topic. Server fetches the body
    /// and appends a { url, title, content, added_at } entry to the thread's
    /// additional_sources array. The combined corpus is what the chat / quiz /
    /// voice prompts see going forward.
    func addTopicSource(id: String, url: String) async throws -> AddSourceResponse {
        try await request(
            "/api/f2/topics/\(id)/sources",
            method: "POST",
            body: AddSourceRequest(url: url),
        )
    }

    /// Upload the user's own notes (a .txt file's contents) to a topic.
    /// Stored flagged as notes, so audio summaries cover them point by point.
    func uploadTopicNotes(id: String, text: String, title: String?) async throws -> AddSourceResponse {
        struct Body: Encodable { let text: String; let title: String? }
        return try await request(
            "/api/f2/topics/\(id)/sources",
            method: "POST",
            body: Body(text: text, title: title),
        )
    }

    /// One display row in the View Context modal. Media URLs with a transcript
    /// (YouTube + audio hosts) are split server-side into two items — one with
    /// part="url", one with part="transcript" — sharing the same kind/index.
    /// Everything else returns as a single part="source" item.
    struct TopicSource: Codable, Identifiable, Equatable {
        let id: String
        let kind: String          // "primary" | "additional"
        let index: Int
        let part: String          // "source" | "url" | "transcript"
        let topicKind: String     // "web" | "video" | "audio" | "paste" | "fallback"
        let url: String?
        let title: String?
        let author: String?
        /// True for user-uploaded notes (Upload Notes).
        let note: Bool?
        let contentLength: Int
        let addedAt: String?

        enum CodingKeys: String, CodingKey {
            case id, kind, index, part, url, title, author, note
            case topicKind = "topic_kind"
            case contentLength = "content_length"
            case addedAt = "added_at"
        }
    }
    struct ListSourcesResponse: Codable { let items: [TopicSource] }

    /// List every source attached to a topic — primary (the original URL +
    /// content on the thread row, if any) plus every additional source the
    /// user has appended. Used by the "View Topic Context" modal.
    func listTopicSources(id: String) async throws -> [TopicSource] {
        let res: ListSourcesResponse = try await get("/api/f2/topics/\(id)/sources")
        return res.items
    }

    /// One audio-summary transcript version. Base version has instructions=nil;
    /// each `summary <…>` command adds an augmented one. Only the current
    /// version (id == current_id) has playable audio.
    struct SummaryVersion: Codable, Identifiable, Equatable {
        let id: String
        let script: String
        let scale: String?          // "book" | "short"
        let durationSecs: Int?
        let instructions: String?   // nil = base version
        let createdAt: String?

        enum CodingKeys: String, CodingKey {
            case id, script, scale, instructions
            case durationSecs = "duration_secs"
            case createdAt = "created_at"
        }
    }
    struct SummariesResponse: Codable {
        let summaries: [SummaryVersion]
        let currentId: String?
        let audioUrl: String?
        enum CodingKeys: String, CodingKey {
            case summaries
            case currentId = "current_id"
            case audioUrl = "audio_url"
        }
    }

    /// Full audio-summary transcripts for a topic, base first. Backs the
    /// Summaries section + reader in the Topic Context sheet.
    func listSummaries(id: String) async throws -> SummariesResponse {
        try await get("/api/f2/topics/\(id)/summaries")
    }

    struct SourceText: Codable { let content: String; let title: String?; let url: String? }

    /// Fetch the full text of one source row on demand (bodies are kept out of
    /// the list payload). `part` is unused server-side — kind+index identify
    /// the storage slot — but taken for symmetry with the row.
    func readSourceText(id: String, kind: String, index: Int) async throws -> SourceText {
        var comps = URLComponents(
            url: Secrets.backendBaseURL.appendingPathComponent("/api/f2/topics/\(id)/sources"),
            resolvingAgainstBaseURL: false,
        )!
        comps.queryItems = [
            URLQueryItem(name: "read", value: "1"),
            URLQueryItem(name: "kind", value: kind),
            URLQueryItem(name: "index", value: String(index)),
        ]
        var req = URLRequest(url: comps.url!)
        req.httpMethod = "GET"
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw F2APIError.http(0, "non-HTTP response") }
        if http.statusCode == 401 { throw F2APIError.unauthenticated }
        if http.statusCode >= 400 { throw F2APIError.http(http.statusCode, errorMessage(from: data, response: http)) }
        return try decoder.decode(SourceText.self, from: data)
    }

    struct DeleteSourceRequest: Codable { let kind: String; let index: Int?; let part: String }

    /// Remove a source (or one half of a split media source) from a topic.
    /// kind: "primary" | "additional". index: required for additional.
    /// part: "source" drops the whole entry; "url" clears just the URL;
    /// "transcript" clears just the content body.
    func deleteTopicSource(id: String, kind: String, index: Int?, part: String) async throws {
        let _: EmptyResponse = try await request(
            "/api/f2/topics/\(id)/sources",
            method: "DELETE",
            body: DeleteSourceRequest(kind: kind, index: index, part: part),
        )
    }

    // MARK: Avatar

    struct AvatarResponse: Codable {
        let avatarUrl: String?
        enum CodingKeys: String, CodingKey { case avatarUrl = "avatar_url" }
    }

    /// Upload an image as the signed-in user's avatar. Image is encoded as JPEG
    /// (or PNG when transparency matters; the design uses round masks so JPEG
    /// is fine). Server enforces 1 MB and image/jpeg|png at the bucket level.
    func uploadAvatar(imageData: Data, mime: String = "image/jpeg") async throws -> String {
        let url = Secrets.backendBaseURL.appendingPathComponent("/api/f2/avatar")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Accept")

        let boundary = "feynd-\(UUID().uuidString)"
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()
        let crlf = "\r\n"
        func append(_ s: String) { body.append(s.data(using: .utf8)!) }
        let filename = mime == "image/png" ? "avatar.png" : "avatar.jpg"
        append("--\(boundary)\(crlf)")
        append("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\(crlf)")
        append("Content-Type: \(mime)\(crlf)\(crlf)")
        body.append(imageData)
        append("\(crlf)--\(boundary)--\(crlf)")
        req.httpBody = body

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw F2APIError.transport(error)
        }
        guard let http = response as? HTTPURLResponse else {
            throw F2APIError.http(0, "non-HTTP response")
        }
        if http.statusCode == 401 { throw F2APIError.unauthenticated }
        if http.statusCode >= 400 {
            throw F2APIError.http(http.statusCode, errorMessage(from: data, response: http))
        }
        let decoded = try decoder.decode(AvatarResponse.self, from: data)
        guard let urlStr = decoded.avatarUrl else {
            throw F2APIError.http(500, "no avatar_url in response")
        }
        return urlStr
    }

    /// Remove the current user's avatar.
    func deleteAvatar() async throws {
        let _: EmptyResponse = try await request("/api/f2/avatar", method: "DELETE", body: nil as EmptyBody?)
    }

    // MARK: iMessage pairing

    struct IMessageHandlesResponse: Codable { let handles: [String] }
    struct IMessageStartResponse: Codable {
        let handle: String
        let sentAt: String?
        enum CodingKeys: String, CodingKey {
            case handle
            case sentAt = "sent_at"
        }
    }
    struct IMessageConfirmResponse: Codable { let handle: String }

    func listImessageHandles() async throws -> [String] {
        let res: IMessageHandlesResponse = try await get("/api/f2/imessage/handles")
        return res.handles
    }

    /// Step 1 — server sends a 6-digit code via iMessage to the handle.
    func startImessagePairing(handle: String) async throws -> String {
        struct Body: Encodable { let handle: String }
        let res: IMessageStartResponse = try await post("/api/f2/imessage/start", body: Body(handle: handle))
        return res.handle
    }

    /// Step 2 — verify the 6-digit code; on success the handle is bound.
    func confirmImessagePairing(handle: String, code: String) async throws -> String {
        struct Body: Encodable { let handle: String; let code: String }
        let res: IMessageConfirmResponse = try await post("/api/f2/imessage/confirm", body: Body(handle: handle, code: code))
        return res.handle
    }

    func removeImessageHandle(handle: String) async throws {
        struct Body: Encodable { let handle: String }
        let _: EmptyResponse = try await request("/api/f2/imessage/handles", method: "DELETE", body: Body(handle: handle))
    }

    func ingestPaste(title: String?, text: String) async throws -> String {
        struct Body: Encodable { let title: String?; let text: String }
        let res: IngestResponse = try await post("/api/f2/topics/ingest", body: Body(title: title?.isEmpty == true ? nil : title, text: text))
        return res.thread.id
    }

    // MARK: Realtime voice

    struct RealtimeSessionResponse: Codable {
        let clientSecret: ClientSecret
        let openaiSessionId: String?
        let voiceSession: VoiceSession
        let realtime: RealtimeConfig

        struct ClientSecret: Codable {
            let value: String
            let expiresAt: Int

            enum CodingKeys: String, CodingKey {
                case value
                case expiresAt = "expires_at"
            }
        }

        struct VoiceSession: Codable {
            let id: String
            let mode: String
            let threadId: String?

            enum CodingKeys: String, CodingKey {
                case id, mode
                case threadId = "thread_id"
            }
        }

        struct RealtimeConfig: Codable {
            let model: String
            let voice: String
            let callsUrl: URL
            let dataChannel: String

            enum CodingKeys: String, CodingKey {
                case model, voice
                case callsUrl = "calls_url"
                case dataChannel = "data_channel"
            }
        }

        enum CodingKeys: String, CodingKey {
            case clientSecret = "client_secret"
            case openaiSessionId = "openai_session_id"
            case voiceSession = "voice_session"
            case realtime
        }
    }

    /// `cardIds` is required for mode "flash" — the deck the quizmaster reads
    /// from, in question order.
    func startRealtimeSession(mode: String, threadId: String? = nil, cardIds: [String]? = nil) async throws -> RealtimeSessionResponse {
        struct Body: Encodable {
            let mode: String
            let thread_id: String?
            let card_ids: [String]?
        }
        return try await post("/api/f2/realtime/session", body: Body(mode: mode, thread_id: threadId, card_ids: cardIds))
    }

    // MARK: Flash cards

    /// Deck + set history for one topic.
    func getTopicFlash(id: String) async throws -> TopicFlash {
        try await get("/api/f2/topics/\(id)/flash")
    }

    struct GenerateCardsResponse: Codable { let cards: [FlashCard] }

    /// Generate `count` new cards from the topic's material. Slow (one big
    /// LLM read of the source) — callers should show progress.
    func generateFlashCards(topicId: String, count: Int, model: String? = nil) async throws -> [FlashCard] {
        struct Body: Encodable { let count: Int; let model: String? }
        let res: GenerateCardsResponse = try await post("/api/f2/topics/\(topicId)/flash", body: Body(count: count, model: model))
        return res.cards
    }

    struct UpdateCardResponse: Codable { let card: FlashCard }

    func updateFlashCard(cardId: String, question: String, answer: String, distractors: [String]) async throws -> FlashCard {
        struct Body: Encodable { let question: String; let answer: String; let distractors: [String] }
        let res: UpdateCardResponse = try await request("/api/f2/flash/cards/\(cardId)", method: "PATCH", body: Body(question: question, answer: answer, distractors: distractors))
        return res.card
    }

    func deleteFlashCard(cardId: String) async throws {
        let _: EmptyResponse = try await request("/api/f2/flash/cards/\(cardId)", method: "DELETE", body: nil as EmptyBody?)
    }

    /// Rate a card: "down" buries it, "priority" pushes it up the rotation,
    /// nil clears the rating. Returns the updated card.
    @discardableResult
    func rateFlashCard(cardId: String, rating: String?) async throws -> FlashCard {
        // Explicit encode: the synthesized one omits nil, but the server
        // needs to SEE null to clear a rating (absent = leave unchanged).
        struct Body: Encodable {
            let rating: String?
            enum CodingKeys: String, CodingKey { case rating }
            func encode(to encoder: Encoder) throws {
                var c = encoder.container(keyedBy: CodingKeys.self)
                try c.encode(rating, forKey: .rating)
            }
        }
        let res: UpdateCardResponse = try await request(
            "/api/f2/flash/cards/\(cardId)", method: "PATCH", body: Body(rating: rating))
        return res.card
    }

    struct DecksResponse: Codable { let decks: [FlashDeck] }

    /// Every topic that has flash cards — the Flash tab's deck manager.
    func listFlashDecks() async throws -> [FlashDeck] {
        let res: DecksResponse = try await get("/api/f2/flash/decks")
        return res.decks
    }

    /// Start a topic set (mode chosen by the user).
    func startFlashSet(threadId: String, mode: String) async throws -> FlashStart {
        struct Body: Encodable { let mode: String; let thread_id: String }
        return try await post("/api/f2/flash/start", body: Body(mode: mode, thread_id: threadId))
    }

    /// Start a Jumbo level (mode fixed by the level).
    /// Start a Jumbo set. `voice: true` plays the level as an audio round
    /// (the Flash tab's mic button) instead of the level's default mode.
    func startJumboSet(level: Int, voice: Bool = false) async throws -> FlashStart {
        struct Body: Encodable {
            let jumbo_level: Int
            let mode: String?
        }
        return try await post("/api/f2/flash/start", body: Body(jumbo_level: level, mode: voice ? "voice" : nil))
    }

    struct FlashAnswer: Encodable {
        let card_id: String
        let answer: String?
    }

    /// Submit a finished choice/text set for grading + recording.
    func submitFlashSet(mode: String, threadId: String?, jumboLevel: Int?, answers: [FlashAnswer]) async throws -> FlashSubmitResult {
        struct Body: Encodable {
            let mode: String
            let thread_id: String?
            let jumbo_level: Int?
            let answers: [FlashAnswer]
        }
        return try await post("/api/f2/flash/submit", body: Body(mode: mode, thread_id: threadId, jumbo_level: jumboLevel, answers: answers))
    }

    /// Submit a finished VOICE set — graded server-side from the session
    /// transcript, so this must run after finishRealtimeSession.
    func submitVoiceFlashSet(threadId: String?, jumboLevel: Int?, cardIds: [String], voiceSessionId: String) async throws -> FlashSubmitResult {
        struct Body: Encodable {
            let mode: String
            let thread_id: String?
            let jumbo_level: Int?
            let card_ids: [String]
            let voice_session_id: String
        }
        return try await post("/api/f2/flash/submit", body: Body(mode: "voice", thread_id: threadId, jumbo_level: jumboLevel, card_ids: cardIds, voice_session_id: voiceSessionId))
    }

    func jumboState() async throws -> JumboState {
        try await get("/api/f2/flash/jumbo")
    }

    /// User drafts a question; the server polishes it, answers it from the
    /// topic material, and writes the wrong choices.
    func authorFlashCard(topicId: String, question: String, model: String? = nil) async throws -> FlashCard {
        struct Body: Encodable { let question: String; let model: String? }
        let res: UpdateCardResponse = try await post("/api/f2/topics/\(topicId)/flash/card", body: Body(question: question, model: model))
        return res.card
    }

    /// Rebuild the whole deck to the user's instructions, replacing all
    /// existing cards. Slow — run through FlashDeckBuilder.
    func redoFlashDeck(topicId: String, instructions: String, model: String? = nil) async throws -> [FlashCard] {
        struct Body: Encodable { let instructions: String; let model: String? }
        let res: GenerateCardsResponse = try await post("/api/f2/topics/\(topicId)/flash/redo", body: Body(instructions: instructions, model: model))
        return res.cards
    }

    /// Grade a finished Final Review voice session. A → star 3.
    func submitFinalReview(topicId: String, voiceSessionId: String) async throws -> FinalReviewResult {
        struct Body: Encodable { let voice_session_id: String }
        return try await post("/api/f2/topics/\(topicId)/final-review", body: Body(voice_session_id: voiceSessionId))
    }

    func callRealtimeTool(name: String, arguments: [String: String]) async throws -> Data {
        struct Body: Encodable {
            let name: String
            let arguments: [String: String]
        }
        return try await postRaw("/api/f2/realtime/tool", body: Body(name: name, arguments: arguments))
    }

    func finishRealtimeSession(id: String, transcript: [[String: String]], summary: String? = nil) async throws {
        struct Body: Encodable {
            let transcript: [[String: String]]
            let summary: String?
        }
        let _: EmptyResponse = try await request("/api/f2/realtime/session/\(id)", method: "PATCH", body: Body(transcript: transcript, summary: summary))
    }

    // MARK: HTTP plumbing

    private struct EmptyBody: Codable {}
    private struct EmptyResponse: Codable {}

    private func get<R: Decodable>(_ path: String) async throws -> R {
        try await request(path, method: "GET", body: nil as EmptyBody?)
    }

    private func post<B: Encodable, R: Decodable>(_ path: String, body: B) async throws -> R {
        try await request(path, method: "POST", body: body)
    }

    private func postRaw<B: Encodable>(_ path: String, body: B) async throws -> Data {
        let url = Secrets.backendBaseURL.appendingPathComponent(path)
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.httpBody = try encoder.encode(body)

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw F2APIError.transport(error)
        }

        guard let http = response as? HTTPURLResponse else {
            throw F2APIError.http(0, "non-HTTP response")
        }
        if http.statusCode == 401 {
            throw F2APIError.unauthenticated
        }
        if http.statusCode >= 400 {
            throw F2APIError.http(http.statusCode, errorMessage(from: data, response: http))
        }
        return data
    }

    private func request<B: Encodable, R: Decodable>(_ path: String, method: String, body: B?) async throws -> R {
        let url = Secrets.backendBaseURL.appendingPathComponent(path)
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.cachePolicy = .reloadIgnoringLocalCacheData   // never read a cached response
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            req.httpBody = try encoder.encode(body)
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw F2APIError.transport(error)
        }

        guard let http = response as? HTTPURLResponse else {
            throw F2APIError.http(0, "non-HTTP response")
        }

        if http.statusCode == 401 {
            throw F2APIError.unauthenticated
        }
        if http.statusCode >= 400 {
            throw F2APIError.http(http.statusCode, errorMessage(from: data, response: http))
        }

        if R.self == EmptyResponse.self {
            // Caller doesn't care about body; succeed regardless of shape.
            return EmptyResponse() as! R
        }

        do {
            return try decoder.decode(R.self, from: data)
        } catch {
            throw F2APIError.decode(error)
        }
    }

    func clearCookies() {
        let host = Secrets.backendBaseURL.host ?? ""
        for cookie in HTTPCookieStorage.shared.cookies ?? [] where cookie.domain.contains(host) || cookie.name == "f2_session" {
            HTTPCookieStorage.shared.deleteCookie(cookie)
        }
    }

    private func errorMessage(from data: Data, response: HTTPURLResponse) -> String {
        let contentType = response.value(forHTTPHeaderField: "Content-Type") ?? ""
        if contentType.contains("application/json"),
           let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let err = obj["error"] as? String {
            return err
        }
        if contentType.contains("text/html") {
            if response.statusCode == 404 {
                return "The F2 voice endpoint is not available on this server."
            }
            return "The server returned an HTML error page."
        }
        let text = String(data: data, encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if let text, !text.isEmpty {
            return String(text.prefix(240))
        }
        return HTTPURLResponse.localizedString(forStatusCode: response.statusCode)
    }
}
