import Foundation
import os

/// The thread with the teacher (Ask, 0.1 (113)): kept on this device (Application Support/
/// chat.json, the last `kept` messages), every question sent to `POST /api/takt/chat`
/// (`src/lib/takt/chat-agent.ts`) with where the player is, the answer streamed back a few
/// words at a time. The server keeps every exchange and gives the teacher a memory of the
/// player's last two sessions (`memory.ts`).
@Observable
final class ChatStore {
    struct Message: Codable, Equatable, Identifiable {
        let id: String
        /// "user" or "teacher".
        let role: String
        let text: String
        let at: String
        /// Where the player was when they asked (the sheet's line under the question).
        let `where`: String?
    }

    struct Failure: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    private(set) var messages: [Message] = []
    /// An answer on its way: the step the teacher is at, then the words so far.
    private(set) var working = false
    private(set) var status = ""
    private(set) var draft = ""
    private(set) var error: String?
    /// The question that failed, for Try again.
    private(set) var failed: String?
    /// An answer landed while the sheet was closed: the button lights until it opens.
    var unread = false

    static let kept = 200

    @ObservationIgnored private let file: URL
    @ObservationIgnored private let base: URL
    @ObservationIgnored private let session: URLSession
    @ObservationIgnored private let log = Logger(subsystem: "takt", category: "chat")
    @ObservationIgnored private var task: Task<Void, Never>?

    static var defaultFile: URL {
        #if DEBUG
        if let p = UserDefaults.standard.string(forKey: "ChatFile") { return URL(fileURLWithPath: p) }
        #endif
        return FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("chat.json")
    }

    init(file: URL = ChatStore.defaultFile, base: URL = AccountStore.defaultBase) {
        self.file = file
        self.base = base
        let config = URLSessionConfiguration.default
        config.httpCookieStorage = .shared
        config.httpCookieAcceptPolicy = .always
        // An answer streams for half a minute at most; the server pings every ten seconds.
        config.timeoutIntervalForRequest = 90
        config.timeoutIntervalForResource = 300
        session = URLSession(configuration: config)
        if let data = try? Data(contentsOf: file), let saved = try? JSONDecoder().decode([Message].self, from: data) {
            messages = saved
        }
    }

    private func save() {
        guard !ProgressStore.readOnly else { return }
        if messages.count > Self.kept { messages.removeFirst(messages.count - Self.kept) }
        try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        if let data = try? JSONEncoder().encode(messages) { try? data.write(to: file, options: .atomic) }
    }

    /// The thread starts over (the server keeps its memory either way).
    func clear() {
        task?.cancel()
        messages = []
        working = false
        draft = ""
        error = nil
        failed = nil
        save()
    }

    /// A question with where the player is (`AppModel.chatContext`, `chatWhere`): it goes on the
    /// thread at once, the answer grows under it as it streams, then joins the thread.
    func ask(_ text: String, context: [String: Any], where line: String) {
        let message = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !message.isEmpty, !working else { return }
        messages.append(Message(id: UUID().uuidString, role: "user", text: message, at: ISO8601DateFormatter().string(from: Date()), where: line))
        save()
        working = true
        status = "Sending"
        draft = ""
        error = nil
        failed = nil
        let thread = messages.dropLast().suffix(16).map { ["role": $0.role, "text": $0.text] }
        task?.cancel()
        task = Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                #if DEBUG
                // `-ChatReply <file>`: the answer from a text file, streamed a word at a time,
                // no network (the screenshots and the checks).
                if let path = UserDefaults.standard.string(forKey: "ChatReply"), let reply = try? String(contentsOfFile: path, encoding: .utf8) {
                    self.status = "Thinking it over"
                    try? await Task.sleep(for: .milliseconds(700))
                    for word in reply.trimmingCharacters(in: .whitespacesAndNewlines).split(separator: " ", omittingEmptySubsequences: false) {
                        self.draft += (self.draft.isEmpty ? "" : " ") + word
                        try? await Task.sleep(for: .milliseconds(20))
                    }
                    self.finish(reply.trimmingCharacters(in: .whitespacesAndNewlines))
                    return
                }
                #endif
                try await self.stream(message, thread: Array(thread), context: context)
            } catch is CancellationError {
                self.working = false
            } catch {
                self.log.error("ask: \(error.localizedDescription, privacy: .public)")
                self.error = (error as? Failure)?.message ?? "Can't reach ola.cx. Your question is kept: try again."
                self.failed = message
                // The question comes off the thread until it goes through.
                if self.messages.last?.role == "user" { self.messages.removeLast() }
                self.save()
                self.working = false
                self.draft = ""
            }
        }
    }

    private func finish(_ reply: String) {
        messages.append(Message(id: UUID().uuidString, role: "teacher", text: reply, at: ISO8601DateFormatter().string(from: Date()), where: nil))
        save()
        draft = ""
        status = ""
        working = false
        unread = true
    }

    private struct ServerError: Decodable { let error: String }

    private func stream(_ message: String, thread: [[String: String]], context: [String: Any]) async throws {
        var req = URLRequest(url: base.appendingPathComponent("api/takt/chat"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["message": message, "thread": thread, "context": context])
        let (bytes, response) = try await session.bytes(for: req)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else {
            var data = Data()
            for try await b in bytes { data.append(b) }
            throw Failure(message: (try? JSONDecoder().decode(ServerError.self, from: data))?.error ?? "Server error \(code).")
        }
        status = "Reading where you are"
        var got = false
        for try await line in bytes.lines {
            guard line.hasPrefix("data: "), let data = line.dropFirst(6).data(using: .utf8),
                  let event = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let type = event["type"] as? String else { continue }
            switch type {
            case "status":
                if let text = event["text"] as? String { status = text }
            case "delta":
                if let text = event["text"] as? String { draft += text }
            case "reply":
                if let text = event["text"] as? String {
                    got = true
                    finish(text)
                }
            case "error":
                throw Failure(message: event["text"] as? String ?? "The teacher tripped. Try again.")
            default:
                break
            }
        }
        if !got { throw Failure(message: "The connection dropped before the teacher finished. Try again.") }
    }
}
