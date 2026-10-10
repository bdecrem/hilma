import Foundation

/// Where a voice session is in its life. Shared by every engine.
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

/// Which stack runs Dolly's voice. Only ElevenLabs + Claude is wired; GPT-Live
/// is the gap to fill — Polly's `LiveVoiceClient.swift` (../../../polly/ios)
/// plus a `/api/dolly/live/session` route built on the same `startVoice()`
/// prompt, then a second case here and in `makeVoiceClient`.
enum VoiceEngine: String, CaseIterable, Identifiable {
    case eleven = "eleven"

    static let fallback: VoiceEngine = .eleven
    static let defaultsKey = "voiceEngine"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .eleven: return "ElevenLabs + Claude"
        }
    }

    static var current: VoiceEngine {
        VoiceEngine(rawValue: UserDefaults.standard.string(forKey: defaultsKey) ?? "") ?? fallback
    }
}

/// One turn of a session as the screens show it and the server keeps it.
struct VoiceTurn: Equatable, Identifiable {
    let id: Int
    let role: String
    var text: String
    let at: Date
}

/// What the voice screens need from an engine. Both clients are @Observable,
/// so SwiftUI tracks their properties through this existential as usual.
@MainActor
protocol DollyVoiceClient: AnyObject {
    var phase: VoicePhase { get }
    var status: String { get }
    var talking: Bool { get }
    /// Every turn so far, in order; the screens draw the last few.
    var turns: [VoiceTurn] { get }
    var voiceSessionId: String? { get }
    /// What the server handed the client to steer the session with.
    var config: ElevenSessionResponse.ElevenConfig? { get }
    /// Seconds since the session connected.
    var elapsed: Int { get }

    func start() async
    /// Fire-and-forget end; the transcript uploads in the background.
    func stop()
    /// Ends the session and AWAITS the finish — the server's day comes back.
    func end() async -> DayView?
    func setMuted(_ on: Bool)
    func beginTalking()
    func endTalking()
    /// A text message from the app, already prefixed by the server (a cue).
    func sendCue(_ text: String)

    #if targetEnvironment(simulator)
    var debugSessionStarted: Bool { get }
    var debugChannelOpen: Bool { get }
    func debugInboundAudio() async -> (energy: Double, duration: Double)?
    #endif
}

@MainActor
func makeVoiceClient(mode: String, holdToTalk: Bool) -> any DollyVoiceClient {
    switch VoiceEngine.current {
    case .eleven:
        return ElevenVoiceClient(mode: mode, holdToTalk: holdToTalk)
    }
}
