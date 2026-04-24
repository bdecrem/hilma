import Foundation

// Thin HTTP wrapper around the Feynd backend routes under /api/feynd/*.
// All calls include the shared bearer (x-feynd-secret) and per-device UUID
// (x-feynd-device).

enum FeyndAPIError: Error, LocalizedError {
    case badResponse(Int, String)
    case decodingFailed(String)

    var errorDescription: String? {
        switch self {
        case .badResponse(let code, let body): return "HTTP \(code): \(body)"
        case .decodingFailed(let s): return "Decode error: \(s)"
        }
    }
}

// MARK: - Models (mirror backend JSON shapes)

struct FeyndChat: Codable, Identifiable, Hashable {
    let id: String
    let device_id: String
    let course_id: String
    let video_id: String?
    let title: String
    let created_at: String
    let updated_at: String
}

struct FeyndMessage: Codable, Identifiable, Hashable {
    let id: String
    let role: String          // "user" | "assistant"
    let text: String
    let source: String        // voice | text | discord | seed
    let audio_url: String?
    let created_at: String
}

struct FeyndQuizQuestion: Codable, Identifiable, Hashable {
    let id: String
    let q: String
    let options: [String]
    let correct_idx: Int
    let explanation: String
    let concept_ids: [String]?
}

struct FeyndQuiz: Codable, Identifiable, Hashable {
    let id: String
    let course_id: String
    let video_id: String
    let questions: [FeyndQuizQuestion]
    let generated_at: String
}

struct FeyndQuizAttempt: Codable, Identifiable, Hashable {
    let id: String
    let device_id: String
    let course_id: String
    let video_id: String
    let quiz_id: String?
    let score: Int
    let total: Int
    let attempted_at: String
}

// Quiz derived from the user's own Claude conversation history, surfaced
// by the /api/feynd/claude-quizzes/* routes. The iOS client currently
// only renders MCQ questions, which is what the API returns.

struct ClaudeQuizSummary: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let topic: String?
    let source_created_at: String?
    let summary: String
    let question_count: Int
}

struct ClaudeQuizMCQ: Codable, Hashable {
    let q: String
    let options: [String]
    let answer_index: Int
    let explanation: String?
}

struct ClaudeQuiz: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let topic: String?
    let source_created_at: String?
    let summary: String
    let questions: [ClaudeQuizMCQ]
}

// MARK: - Client

enum FeyndAPI {

    // --- Shared request builder ------------------------------------------

    private static func makeRequest(path: String, method: String = "GET", query: [String: String] = [:], body: [String: Any]? = nil) throws -> URLRequest {
        var components = URLComponents(url: Secrets.backendBaseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty {
            components.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        var req = URLRequest(url: components.url!)
        req.httpMethod = method
        req.setValue(Secrets.backendSecret,    forHTTPHeaderField: "x-feynd-secret")
        req.setValue(DeviceIdentity.deviceId,  forHTTPHeaderField: "x-feynd-device")
        req.setValue("application/json",       forHTTPHeaderField: "Content-Type")
        req.timeoutInterval = 60
        if let body {
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        return req
    }

    private static func send<T: Decodable>(_ req: URLRequest, as: T.Type) async throws -> T {
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let code = (resp as? HTTPURLResponse)?.statusCode ?? -1
            let snippet = String(data: data, encoding: .utf8) ?? ""
            throw FeyndAPIError.badResponse(code, snippet)
        }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw FeyndAPIError.decodingFailed(String(describing: error))
        }
    }

    // --- Chats ------------------------------------------------------------

    private struct ChatsResp: Codable { let chats: [FeyndChat] }
    private struct ChatResp:  Codable { let chat: FeyndChat }
    private struct ChatDetailResp: Codable { let chat: FeyndChat; let messages: [FeyndMessage] }

    static func listChats(courseId: String? = nil, videoId: String? = nil) async throws -> [FeyndChat] {
        var q: [String: String] = [:]
        if let courseId { q["course_id"] = courseId }
        if let videoId { q["video_id"] = videoId }
        let req = try makeRequest(path: "api/feynd/chats", query: q)
        let out = try await send(req, as: ChatsResp.self)
        return out.chats
    }

    static func createChat(courseId: String, videoId: String?, title: String) async throws -> FeyndChat {
        let req = try makeRequest(path: "api/feynd/chats", method: "POST", body: [
            "course_id": courseId,
            "video_id": videoId as Any,
            "title": title
        ])
        return try await send(req, as: ChatResp.self).chat
    }

    static func getChat(_ id: String) async throws -> (FeyndChat, [FeyndMessage]) {
        let req = try makeRequest(path: "api/feynd/chats/\(id)")
        let out = try await send(req, as: ChatDetailResp.self)
        return (out.chat, out.messages)
    }

    static func deleteChat(_ id: String) async throws {
        let req = try makeRequest(path: "api/feynd/chats/\(id)", method: "DELETE")
        _ = try await URLSession.shared.data(for: req)
    }

    // --- Messages ---------------------------------------------------------

    private struct MessagePairResp: Codable {
        let user_message: FeyndMessage
        let assistant_message: FeyndMessage
    }
    private struct TTSResp: Codable { let audio_url: String; let cached: Bool }

    static func sendMessage(chatId: String, text: String, source: String = "text") async throws -> (FeyndMessage, FeyndMessage) {
        let req = try makeRequest(path: "api/feynd/chats/\(chatId)/messages", method: "POST", body: [
            "text": text, "source": source
        ])
        let out = try await send(req, as: MessagePairResp.self)
        return (out.user_message, out.assistant_message)
    }

    private struct SingleMessageResp: Codable { let message: FeyndMessage }

    // Append a pre-formed message without invoking Opus. Used by voice mode
    // to persist Realtime-emitted transcripts back into the chat thread.
    static func appendMessage(chatId: String, role: String, text: String, source: String = "voice") async throws -> FeyndMessage {
        let req = try makeRequest(path: "api/feynd/chats/\(chatId)/append", method: "POST", body: [
            "role": role, "text": text, "source": source
        ])
        return try await send(req, as: SingleMessageResp.self).message
    }

    // --- Dictation (Whisper STT) ---------------------------------------

    private struct STTResp: Codable { let text: String }

    static func transcribe(audioData: Data, filename: String = "audio.m4a", mimeType: String = "audio/mp4") async throws -> String {
        let url = Secrets.backendBaseURL.appendingPathComponent("api/feynd/stt")
        let boundary = "----feynd-boundary-\(UUID().uuidString)"
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue(Secrets.backendSecret, forHTTPHeaderField: "x-feynd-secret")
        req.setValue(DeviceIdentity.deviceId, forHTTPHeaderField: "x-feynd-device")
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        req.timeoutInterval = 60

        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"audio\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
        body.append(audioData)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        req.httpBody = body

        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let code = (resp as? HTTPURLResponse)?.statusCode ?? -1
            let snippet = String(data: data, encoding: .utf8) ?? ""
            throw FeyndAPIError.badResponse(code, snippet)
        }
        let out = try JSONDecoder().decode(STTResp.self, from: data)
        return out.text
    }

    static func fetchTTS(messageId: String, text: String) async throws -> URL {
        let req = try makeRequest(
            path: "api/feynd/messages/\(messageId)/tts",
            method: "POST",
            body: ["text": text]
        )
        let out = try await send(req, as: TTSResp.self)
        guard let url = URL(string: out.audio_url) else {
            throw FeyndAPIError.decodingFailed("Invalid audio URL")
        }
        return url
    }

    // --- Quizzes ----------------------------------------------------------

    private struct QuizResp: Codable { let quiz: FeyndQuiz; let cached: Bool? }
    private struct AttemptResp: Codable { let attempt: FeyndQuizAttempt }
    private struct AttemptsResp: Codable { let attempts: [FeyndQuizAttempt] }

    static func fetchQuiz(courseId: String, videoId: String) async throws -> FeyndQuiz {
        let req = try makeRequest(path: "api/feynd/quizzes/\(videoId)", query: ["course_id": courseId])
        return try await send(req, as: QuizResp.self).quiz
    }

    static func submitQuizAttempt(courseId: String, videoId: String, quizId: String, answers: [[String: Any]], score: Int, total: Int) async throws -> FeyndQuizAttempt {
        let req = try makeRequest(path: "api/feynd/quiz-attempts", method: "POST", body: [
            "course_id": courseId,
            "video_id": videoId,
            "quiz_id": quizId,
            "answers": answers,
            "score": score,
            "total": total
        ])
        return try await send(req, as: AttemptResp.self).attempt
    }

    static func listQuizAttempts(videoId: String? = nil) async throws -> [FeyndQuizAttempt] {
        var q: [String: String] = [:]
        if let videoId { q["video_id"] = videoId }
        let req = try makeRequest(path: "api/feynd/quiz-attempts", query: q)
        return try await send(req, as: AttemptsResp.self).attempts
    }

    // --- Claude-history quizzes ------------------------------------------

    private struct ClaudeQuizzesResp: Codable { let quizzes: [ClaudeQuizSummary] }
    private struct ClaudeQuizResp: Codable { let quiz: ClaudeQuiz }

    static func listClaudeQuizzes() async throws -> [ClaudeQuizSummary] {
        let req = try makeRequest(path: "api/feynd/claude-quizzes")
        return try await send(req, as: ClaudeQuizzesResp.self).quizzes
    }

    static func fetchClaudeQuiz(_ id: String) async throws -> ClaudeQuiz {
        let req = try makeRequest(path: "api/feynd/claude-quizzes/\(id)")
        return try await send(req, as: ClaudeQuizResp.self).quiz
    }
}
