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

/// Which stack runs Dodo's voice. A per-device setting (Profile → Voice),
/// read once when a session starts.
enum VoiceEngine: String, CaseIterable, Identifiable {
    /// OpenAI GPT-Live — the default (LiveVoiceClient).
    case gptLive = "gpt-live"
    /// ElevenLabs Speech Engine for the audio, Claude for the words
    /// (ElevenVoiceClient).
    case eleven = "eleven"

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
        case .gptLive: return "OpenAI's live voice model. The default."
        case .eleven: return "ElevenLabs listens and speaks in its own voice; Claude Opus does the thinking. Experimental."
        }
    }

    static var current: VoiceEngine {
        VoiceEngine(rawValue: UserDefaults.standard.string(forKey: defaultsKey) ?? "") ?? .gptLive
    }
}

/// What the voice screens need from an engine. Both clients are @Observable,
/// so SwiftUI tracks their properties through this existential as usual.
@MainActor
protocol DodoVoiceClient: AnyObject {
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
func makeDodoVoiceClient(mode: String, threadId: String?, cardIds: [String]?,
                         holdToTalk: Bool) -> any DodoVoiceClient {
    switch VoiceEngine.current {
    case .gptLive:
        return LiveVoiceClient(mode: mode, threadId: threadId, cardIds: cardIds, holdToTalk: holdToTalk)
    case .eleven:
        return ElevenVoiceClient(mode: mode, threadId: threadId, cardIds: cardIds, holdToTalk: holdToTalk)
    }
}
