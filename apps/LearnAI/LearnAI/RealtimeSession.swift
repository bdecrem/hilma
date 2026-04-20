import Foundation
import Observation
import RealtimeAPI

@MainActor
@Observable
final class RealtimeSession {
    enum Phase {
        case idle, connecting, ready
        case failed(String)
    }

    private(set) var phase: Phase = .idle
    private(set) var toolStatus: String? = nil

    let conversation: Conversation
    private var handledCallIds: Set<String> = []
    private var opusHistory: [AnthropicClient.Turn] = []

    private let systemInstructions = """
    You are a friendly voice tutor for someone learning how AI works. Keep \
    your spoken replies short and conversational — usually two or three \
    sentences. For anything substantive (explanations of concepts, recent \
    developments, recommendations, or finding YouTube videos), call the \
    `ask_opus` tool with the user's question and speak the returned answer \
    naturally. You may lightly rephrase for spoken flow, but do not invent \
    facts beyond what the tool returns. When you call the tool, say a brief \
    filler like "let me think about that" first so the user knows you're \
    working on it.
    """

    private let opusSystemPrompt = """
    You are the deep-reasoning brain behind a voice tutor app about AI. The \
    user's spoken question is passed to you. Answer clearly and accurately. \
    Keep the answer tight — aim for 3–6 sentences unless the question truly \
    needs more. Do not include markdown or lists; this text will be spoken \
    aloud. Plain prose only.
    """

    init() {
        self.conversation = Conversation()
    }

    func start() async {
        guard case .idle = phase else { return }
        phase = .connecting
        do {
            let key = try await OpenAIClient.mintEphemeralKey(instructions: systemInstructions)
            try await conversation.connect(ephemeralKey: key, model: .custom("gpt-realtime-1.5"))
            await conversation.waitForConnection()
            try conversation.updateSession { session in
                session.instructions = systemInstructions
                session.audio.input.transcription = .init()
                session.tools = [
                    .function(.init(
                        name: "ask_opus",
                        description: "Ask Claude Opus 4.7 a substantive question about AI. Use for any factual, recent, or in-depth topic. The returned text is the authoritative answer — speak it to the user.",
                        parameters: .object(properties: [
                            "question": .string(description: "The user's question, rephrased clearly for Opus. Include any useful context from the conversation.")
                        ])
                    ))
                ]
            }
            phase = .ready
            Task { await observeFunctionCalls() }
        } catch {
            phase = .failed(String(describing: error))
        }
    }

    private func observeFunctionCalls() async {
        while !Task.isCancelled {
            for entry in conversation.entries {
                guard case let .functionCall(call) = entry else { continue }
                guard call.status == .completed else { continue }
                guard !handledCallIds.contains(call.callId) else { continue }
                handledCallIds.insert(call.callId)
                Task { await handleCall(call) }
            }
            try? await Task.sleep(nanoseconds: 150_000_000)
        }
    }

    private func handleCall(_ call: Item.FunctionCall) async {
        guard call.name == "ask_opus" else {
            submitToolResult(callId: call.callId, output: "Unknown tool: \(call.name)")
            return
        }
        let question = parseQuestion(call.arguments) ?? "(empty)"
        toolStatus = "Opus thinking: \(question.prefix(60))…"
        do {
            let answer = try await AnthropicClient.answer(
                systemPrompt: opusSystemPrompt,
                history: opusHistory,
                question: question
            )
            opusHistory.append(.init(role: "user", text: question))
            opusHistory.append(.init(role: "assistant", text: answer))
            if opusHistory.count > 20 { opusHistory.removeFirst(opusHistory.count - 20) }
            toolStatus = nil
            submitToolResult(callId: call.callId, output: answer)
        } catch {
            toolStatus = nil
            submitToolResult(callId: call.callId, output: "Opus error: \(error). Please tell the user you couldn't reach the deep-thinking brain right now.")
        }
    }

    private func submitToolResult(callId: String, output: String) {
        do {
            try conversation.send(result: .init(
                id: "call-out-\(UUID().uuidString.prefix(8))",
                callId: callId,
                output: output
            ))
            try conversation.send(event: .createResponse())
        } catch {
            print("Failed to submit tool result: \(error)")
        }
    }

    private func parseQuestion(_ argsJSON: String) -> String? {
        guard let data = argsJSON.data(using: .utf8) else { return nil }
        let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        return obj?["question"] as? String
    }
}
