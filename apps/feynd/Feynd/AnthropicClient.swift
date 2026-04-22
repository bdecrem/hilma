import Foundation

// Thin client for the hilma backend's `/api/feynd/opus-answer` endpoint.
// The backend holds the Anthropic API key; the app only carries the shared
// bearer in Secrets.swift.

enum AnthropicClient {
    struct Turn: Codable {
        let role: String   // "user" or "assistant"
        let text: String
    }

    enum ClientError: Error {
        case badResponse(Int, String)
        case missingAnswer
    }

    struct VideoContext {
        let title: String
        let author: String
        let host: String
        let publishedOn: String
        let transcript: String
    }

    static func answer(
        question: String,
        history: [Turn] = [],
        videoContext: VideoContext? = nil
    ) async throws -> String {
        let url = Secrets.backendBaseURL.appendingPathComponent("api/feynd/opus-answer")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue(Secrets.backendSecret, forHTTPHeaderField: "x-feynd-secret")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        // Give Opus enough room for a cold prompt-cache write over the full
        // topic source pool (~17s) plus Vercel cold-start slack.
        req.timeoutInterval = 60

        var payload: [String: Any] = [
            "question": question,
            "history": history.map { ["role": $0.role, "text": $0.text] }
        ]
        if let vc = videoContext {
            payload["videoContext"] = [
                "title": vc.title,
                "author": vc.author,
                "host": vc.host,
                "publishedOn": vc.publishedOn,
                "transcript": vc.transcript
            ]
        }
        req.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let code = (resp as? HTTPURLResponse)?.statusCode ?? -1
            let snippet = String(data: data, encoding: .utf8) ?? ""
            throw ClientError.badResponse(code, snippet)
        }

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let answer = json["answer"] as? String,
              !answer.isEmpty else {
            throw ClientError.missingAnswer
        }
        return answer
    }
}
