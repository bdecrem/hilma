import Foundation

enum AnthropicClientError: Error {
    case badResponse(Int, String)
    case noContent
}

/// Talks to the hilma backend's Opus proxy. The backend holds the Anthropic
/// key and calls `claude-opus-4-7` on our behalf.
enum AnthropicClient {
    struct Turn {
        let role: String // "user" or "assistant"
        let text: String
    }

    static func answer(
        systemPrompt: String,
        history: [Turn],
        question: String,
        maxTokens: Int = 1024
    ) async throws -> String {
        let url = Secrets.backendBaseURL.appendingPathComponent("api/learnai/opus-answer")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(Secrets.backendSecret, forHTTPHeaderField: "x-learnai-secret")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 60

        let payload: [String: Any] = [
            "question": question,
            "history": history.map { ["role": $0.role, "text": $0.text] },
            "systemPrompt": systemPrompt,
            "maxTokens": maxTokens
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let code = (response as? HTTPURLResponse)?.statusCode ?? -1
            let snippet = String(data: data, encoding: .utf8) ?? ""
            throw AnthropicClientError.badResponse(code, snippet)
        }

        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        guard let answer = json?["answer"] as? String else {
            throw AnthropicClientError.noContent
        }
        return answer
    }
}
