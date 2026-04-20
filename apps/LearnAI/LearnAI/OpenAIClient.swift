import Foundation

enum OpenAIClientError: Error {
    case badResponse(Int, String)
    case missingEphemeralKey
}

/// Requests an ephemeral Realtime client_secret from the hilma backend.
/// The backend holds the real OpenAI API key; this app never sees it.
enum OpenAIClient {
    static func mintEphemeralKey(instructions: String, voice: String = "cedar") async throws -> String {
        let url = Secrets.backendBaseURL.appendingPathComponent("api/learnai/realtime-session")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(Secrets.backendSecret, forHTTPHeaderField: "x-learnai-secret")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = [
            "instructions": instructions,
            "voice": voice
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let code = (response as? HTTPURLResponse)?.statusCode ?? -1
            let snippet = String(data: data, encoding: .utf8) ?? ""
            throw OpenAIClientError.badResponse(code, snippet)
        }

        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        guard let value = json?["value"] as? String else {
            throw OpenAIClientError.missingEphemeralKey
        }
        return value
    }
}
