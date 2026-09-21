import Foundation

/// Where a voice session is in its life. Shared by both engines.
enum VoicePhase: Equatable {
    case idle
    case requestingPermission
    case creatingSession
    case connecting
    case connected
    case speaking
    case failed(String)
    case ended
}

/// Which stack runs Polly's voice. A per-device setting (Profile → Voice),
/// read once when a session starts.
enum VoiceEngine: String, CaseIterable, Identifiable {
    /// ElevenLabs Speech Engine for the audio, Claude for the words
    /// (ElevenVoiceClient). The default since 2026-09-21.
    case eleven = "eleven"
    /// OpenAI GPT-Live (LiveVoiceClient).
    case gptLive = "gpt-live"

    static let fallback: VoiceEngine = .eleven

    static let defaultsKey = "voiceEngine"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .gptLive: return "GPT-Live"
        case .eleven: return "ElevenLabs + Claude"
        }
    }

    var detail: String {
        switch self {
        case .gptLive: return "OpenAI's live voice model."
        case .eleven: return "ElevenLabs listens and speaks in its own voice; Claude Opus does the thinking. The default."
        }
    }

    static var current: VoiceEngine {
        VoiceEngine(rawValue: UserDefaults.standard.string(forKey: defaultsKey) ?? "") ?? fallback
    }
}

/// What the voice screens need from an engine. Both clients are @Observable,
/// so SwiftUI tracks their properties through this existential as usual.
@MainActor
protocol PollyVoiceClient: AnyObject {
    var phase: VoicePhase { get }
    var status: String { get }
    var talking: Bool { get }
    /// The backend voice-session row id — what grading is keyed on.
    var voiceSessionId: String? { get }

    func start() async
    /// Fire-and-forget end; the transcript uploads in the background.
    func stop()
    /// Ends the session and AWAITS the transcript upload.
    func end() async -> String?
    func setMuted(_ on: Bool)
    func beginTalking()
    func endTalking()
    /// The app steers Polly mid-session (the clean-up walk's next card).
    /// `speak` is what she says; GPT-Live needs it spelled out to talk
    /// unprompted, the ElevenLabs engine answers the instruction itself.
    func sendCue(instruction: String, speak: String)

    #if targetEnvironment(simulator) || (DEBUG && targetEnvironment(macCatalyst))
    var debugLastAssistantText: String { get }
    var debugChannelOpen: Bool { get }
    var debugSessionStarted: Bool { get }
    var debugCloseReason: String? { get }
    var debugTranscriptUploaded: Bool { get }
    var debugTurnCount: Int { get }
    func debugInstruct(_ text: String)
    func debugCommentary(_ text: String)
    func debugInboundAudio() async -> (energy: Double, duration: Double)?
    #endif
}

@MainActor
func makePollyVoiceClient(mode: String, threadId: String?, cardIds: [String]?,
                          chatId: String? = nil,
                          continueChatId: String?, holdToTalk: Bool) -> any PollyVoiceClient {
    switch VoiceEngine.current {
    case .eleven:
        return ElevenVoiceClient(mode: mode, threadId: threadId, cardIds: cardIds, chatId: chatId,
                                 continueChatId: continueChatId, holdToTalk: holdToTalk)
    case .gptLive:
        return LiveVoiceClient(mode: mode, threadId: threadId, cardIds: cardIds, chatId: chatId,
                               continueChatId: continueChatId, holdToTalk: holdToTalk)
    }
}
