import Foundation
import OSLog

/// Sends a take to the improv teacher (`POST /api/takt/improv`) and reads the answer as it
/// streams: status lines while it listens, then the review. Same session cookie as the account.
final class ImprovClient {
    enum Event: Equatable {
        case status(String)
        case review(Improv.Review, id: String?)
        case failed(String)
    }

    private let base: URL
    private let session: URLSession
    private let log = Logger(subsystem: "takt", category: "improv")

    init(base: URL = AccountStore.defaultBase) {
        self.base = base
        let config = URLSessionConfiguration.default
        config.httpCookieStorage = .shared
        config.httpCookieAcceptPolicy = .always
        // A review streams for half a minute or so; the server pings every ten seconds.
        config.timeoutIntervalForRequest = 90
        config.timeoutIntervalForResource = 300
        session = URLSession(configuration: config)
    }

    struct Request {
        let take: Improv.Take
        /// The backing as the teacher reads it: title, style, key, feel, the form, the notes allowed.
        let backing: [String: Any]
        let context: [String: Any]
    }

    func review(_ r: Request) -> AsyncStream<Event> {
        AsyncStream { continuation in
            let task = Task {
                do {
                    try await stream(r) { continuation.yield($0) }
                } catch {
                    log.error("review: \(error.localizedDescription, privacy: .public)")
                    continuation.yield(.failed((error as? Failure)?.message ?? "Can't reach ola.cx. Your take is kept: send it again."))
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    private struct Failure: Error { let message: String }
    private struct ServerError: Decodable { let error: String }

    private func stream(_ r: Request, yield: @escaping (Event) -> Void) async throws {
        var req = URLRequest(url: base.appendingPathComponent("api/takt/improv"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["take": r.take.json, "backing": r.backing, "context": r.context])
        let (bytes, response) = try await session.bytes(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            var data = Data()
            for try await b in bytes { data.append(b) }
            throw Failure(message: (try? JSONDecoder().decode(ServerError.self, from: data))?.error ?? "Server error \(status).")
        }
        var got = false
        for try await line in bytes.lines {
            guard line.hasPrefix("data: "), let data = line.dropFirst(6).data(using: .utf8),
                  let event = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let type = event["type"] as? String else { continue }
            switch type {
            case "status":
                if let text = event["text"] as? String { yield(.status(text)) }
            case "review":
                guard let raw = event["review"] else { continue }
                let review = try JSONDecoder().decode(Improv.Review.self, from: JSONSerialization.data(withJSONObject: raw))
                got = true
                yield(.review(review, id: event["id"] as? String))
            case "error":
                throw Failure(message: event["text"] as? String ?? "The teacher tripped. Your take is kept: send it again.")
            default:
                break
            }
        }
        if !got { throw Failure(message: "The connection dropped before the teacher finished. Your take is kept: send it again.") }
    }
}
