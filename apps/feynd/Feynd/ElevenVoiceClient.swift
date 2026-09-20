@preconcurrency import AVFoundation
import Combine
import ElevenLabs
import Foundation
import LiveKit
import Observation

/// Dodo's voice client on the ElevenLabs engine — a per-device setting next
/// to GPT-Live (LiveVoiceClient). See docs/f2-eleven-voice-reference.md.
///
/// How it differs from GPT-Live, in one place:
/// - ElevenLabs owns the audio: speech-to-text, turn-taking, barge-in and the
///   voice. The phone joins the conversation through ElevenLabs' Swift SDK
///   (WebRTC over LiveKit) with a conversation token OUR server minted.
/// - Claude writes every turn, server-side: ElevenLabs sends each transcribed
///   turn to our voice bridge → /api/f2/eleven/turn. The phone never sees the
///   prompt; it only names the session with the `dodo_voice_session` variable.
/// - Dodo opens a scripted session because the client sends a kickoff text
///   message once connected (the server swaps it for the opening instruction).
/// - Turns arrive whole (`onUserTranscript`, `onAgentResponse`), and when the
///   user cuts in, a correction carries what Dodo actually got to say — that
///   is what the transcript keeps.
@MainActor
@Observable
final class ElevenVoiceClient: DodoVoiceClient {
    private(set) var phase: VoicePhase = .idle
    private(set) var status = "Ready"
    private(set) var model = ""

    let mode: String
    let threadId: String?
    let cardIds: [String]?
    let holdToTalk: Bool
    private(set) var talking = false
    private(set) var muted = false

    private var sessionResponse: F2API.ElevenSessionResponse?
    var voiceSessionId: String? { sessionResponse?.voiceSession.id }

    private var conversation: Conversation?
    private var agentStateSink: AnyCancellable?
    private var agentReady = false
    private var sessionOpened = false
    private var connectedAt: Date?
    private var ending = false
    private var endedByUs = false
    private var transcriptUploaded = false

    private struct Turn {
        let role: String
        var text: String
        let at: Date
        /// ElevenLabs' event id, so a correction finds the reply it amends.
        let eventId: Int
    }
    private var turns: [Turn] = []

    private var thinkingTimer: Task<Void, Never>?
    private var releaseTask: Task<Void, Never>?
    private static let releaseGrace: Duration = .milliseconds(300)

    #if targetEnvironment(simulator) || (DEBUG && targetEnvironment(macCatalyst))
    private(set) var debugLastAssistantText = ""
    var debugChannelOpen: Bool { conversation?.state.isActive ?? false }
    var debugSessionStarted: Bool { agentReady }
    var debugCloseReason: String? { endedByUs ? "close_requested" : nil }
    var debugTranscriptUploaded: Bool { transcriptUploaded }
    var debugTurnCount: Int { turns.count }
    private let audioProbe = InboundAudioProbe()
    private var probeAttached = false
    #endif

    init(mode: String, threadId: String? = nil, cardIds: [String]? = nil, holdToTalk: Bool = false) {
        self.mode = mode
        self.threadId = threadId
        self.cardIds = cardIds
        self.holdToTalk = holdToTalk
    }

    // MARK: Mic control

    func setMuted(_ on: Bool) {
        muted = on
        applyMicState()
    }

    /// Hold-to-talk: the button went down. Dodo is told to stop (ElevenLabs
    /// drops the rest of the reply) and the mic opens.
    func beginTalking() {
        guard holdToTalk, !talking, agentReady, phase == .connected || phase == .speaking else { return }
        releaseTask?.cancel()
        releaseTask = nil
        thinkingTimer?.cancel()
        talking = true
        if phase == .speaking {
            Task { try? await conversation?.interruptAgent() }
        }
        applyMicState()
        status = "Listening"
        NSLog("F2_ELEVEN_PTT press")
    }

    /// Hold-to-talk: the button came up. The mic stays open for a short grace
    /// so the tail of the utterance lands, then closes — the silence is what
    /// ends the user's turn.
    func endTalking() {
        guard talking else { return }
        talking = false
        setThinking()
        NSLog("F2_ELEVEN_PTT release")
        releaseTask = Task { [weak self] in
            try? await Task.sleep(for: Self.releaseGrace)
            guard let self, !Task.isCancelled, !self.talking else { return }
            self.applyMicState()
        }
    }

    /// The one place the mic is switched: hold-to-talk opens it only while
    /// talking; hands-free keeps it open unless muted.
    private func applyMicState() {
        let open = holdToTalk ? talking : !muted
        guard let conversation else { return }
        Task {
            do {
                try await conversation.setMuted(!open)
            } catch {
                NSLog("F2_ELEVEN_MUTE_ERROR %@", error.localizedDescription)
            }
        }
    }

    private func setThinking() {
        guard phase == .connected || phase == .speaking, !talking else { return }
        status = "Thinking"
        thinkingTimer?.cancel()
        thinkingTimer = Task { [weak self] in
            try? await Task.sleep(for: .seconds(8))
            guard let self, !Task.isCancelled, self.status == "Thinking" else { return }
            self.status = self.talking ? "Listening" : "Connected"
        }
    }

    #if targetEnvironment(simulator) || (DEBUG && targetEnvironment(macCatalyst))
    /// Test rig: the simulator mic is silent, so a drill speaks as the user
    /// with a text message instead.
    func debugInstruct(_ text: String) {
        Task { try? await conversation?.sendMessage(text) }
    }

    /// GPT-Live's commentary nudge has no counterpart here; the text message
    /// above already gets a reply.
    func debugCommentary(_ text: String) {}

    /// Test rig: cumulative energy + seconds of audio RECEIVED from Dodo,
    /// measured on the rendered PCM, to prove sound is actually arriving.
    func debugInboundAudio() async -> (energy: Double, duration: Double)? {
        audioProbe.snapshot()
    }
    #endif

    // MARK: Lifecycle

    func start() async {
        guard phase == .idle else { return }
        do {
            phase = .requestingPermission
            status = "Requesting microphone access..."
            let granted = await requestMicrophonePermission()
            guard granted else {
                phase = .failed("Microphone access denied.")
                status = "Enable microphone access in Settings."
                return
            }

            phase = .creatingSession
            status = "Creating voice session..."
            let session = try await F2API.shared.startElevenSession(
                mode: mode, threadId: threadId, cardIds: cardIds, holdToTalk: holdToTalk)
            sessionResponse = session
            model = session.eleven.model

            phase = .connecting
            status = "Connecting audio..."
            let config = ConversationConfig(
                dynamicVariables: session.eleven.dynamicVariables,
                onError: { [weak self] error in
                    Task { @MainActor in self?.handleError(error) }
                },
                onAgentResponse: { [weak self] text, eventId in
                    Task { @MainActor in self?.appendTurn(role: "assistant", text: text, eventId: eventId) }
                },
                onAgentResponseCorrection: { [weak self] _, corrected, eventId in
                    Task { @MainActor in self?.correctTurn(eventId: eventId, spoken: corrected) }
                },
                onUserTranscript: { [weak self] text, eventId in
                    Task { @MainActor in self?.appendTurn(role: "user", text: text, eventId: eventId) }
                },
                onInterruption: { _ in
                    NSLog("F2_ELEVEN_EV interruption")
                }
            )
            // The ready / disconnect callbacks go here, not on the config: this
            // entry point overwrites the config's copies with its own arguments.
            let conversation = try await ElevenLabs.startConversation(
                conversationToken: session.eleven.conversationToken,
                config: config,
                onAgentReady: { [weak self] in
                    Task { @MainActor in self?.handleAgentReady() }
                },
                onDisconnect: { [weak self] reason in
                    Task { @MainActor in self?.handleDisconnect(reason) }
                }
            )
            // An End pressed while connecting wins.
            if ending {
                await conversation.endConversation()
                return
            }
            self.conversation = conversation
            // Speaking / listening comes from the audio itself (LiveKit's
            // active-speaker detection), published on the conversation. The
            // config's onAgentStateChange only fires in the SDK's event-based mode.
            agentStateSink = conversation.$agentState
                .removeDuplicates()
                .receive(on: DispatchQueue.main)
                .sink { [weak self] state in
                    MainActor.assumeIsolated { self?.handleAgentState(state) }
                }
            if agentReady { openSession() } else { status = "Waiting for Dodo..." }
        } catch {
            NSLog("F2_ELEVEN_START_ERROR %@", error.localizedDescription)
            if phase != .ended {
                phase = .failed(error.localizedDescription)
                status = "Voice failed"
            }
        }
    }

    func stop() {
        Task { _ = await end() }
    }

    func end() async -> String? {
        guard !ending else { return voiceSessionId }
        ending = true
        endedByUs = true
        talking = false
        phase = .ended
        status = "Ended"
        thinkingTimer?.cancel()
        releaseTask?.cancel()
        if let conversation {
            try? await conversation.setMuted(true)
            await conversation.endConversation()
        }
        agentStateSink = nil
        conversation = nil
        await finishSession()
        return voiceSessionId
    }

    private func requestMicrophonePermission() async -> Bool {
        await withCheckedContinuation { continuation in
            AVAudioApplication.requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }
    }

    // MARK: Events

    private func handleAgentReady() {
        guard !agentReady, phase != .ended else { return }
        agentReady = true
        connectedAt = Date()
        phase = .connected
        status = "Connected"
        NSLog("F2_ELEVEN_EV agent-ready")
        openSession()
    }

    /// Once the agent is ready AND we hold the conversation (the ready
    /// callback can beat `startConversation` returning): set the mic, and in
    /// scripted modes send the kickoff so Dodo speaks first. Runs once.
    private func openSession() {
        guard agentReady, conversation != nil, !sessionOpened else { return }
        sessionOpened = true
        applyMicState()
        attachAudioProbe()
        if let kickoff = sessionResponse?.eleven.kickoff, !kickoff.isEmpty {
            Task { [weak self] in
                do {
                    try await self?.conversation?.sendMessage(kickoff)
                } catch {
                    NSLog("F2_ELEVEN_KICKOFF_ERROR %@", error.localizedDescription)
                }
            }
            setThinking()
        }
    }

    private func handleAgentState(_ state: ElevenLabs.AgentState) {
        guard agentReady, phase != .ended else { return }
        NSLog("F2_ELEVEN_EV agent-state %@", String(describing: state))
        switch state {
        case .speaking:
            thinkingTimer?.cancel()
            if !talking {
                phase = .speaking
                status = "Speaking"
            }
            attachAudioProbe()
        case .thinking:
            if phase == .speaking { phase = .connected }
            setThinking()
        case .listening:
            if phase == .speaking { phase = .connected }
            if status != "Thinking" { status = talking ? "Listening" : "Connected" }
        @unknown default:
            break
        }
    }

    /// Test rig only: the agent's track can arrive after agent-ready, so this
    /// is tried again when Dodo first speaks.
    private func attachAudioProbe() {
        #if targetEnvironment(simulator) || (DEBUG && targetEnvironment(macCatalyst))
        guard !probeAttached, let track = conversation?.agentAudioTrack else { return }
        track.add(audioRenderer: audioProbe)
        probeAttached = true
        #endif
    }

    private func handleDisconnect(_ reason: DisconnectionReason) {
        NSLog("F2_ELEVEN_EV disconnect %@", String(describing: reason))
        agentStateSink = nil
        guard !ending, phase != .ended else { return }
        switch reason {
        case .error:
            phase = .failed("Voice connection lost.")
            status = "Voice disconnected"
        default:
            // ElevenLabs ended it (max duration, server side close).
            phase = .ended
            status = "Ended"
        }
    }

    private func handleError(_ error: ConversationError) {
        NSLog("F2_ELEVEN_EVENT_ERROR %@", error.localizedDescription)
        if !agentReady, phase != .ended {
            phase = .failed(error.localizedDescription)
            status = "Voice failed"
        }
    }

    private func appendTurn(role: String, text: String, eventId: Int) {
        // The kickoff is plumbing, not something the user said.
        if role == "user", text == sessionResponse?.eleven.kickoff { return }
        turns.append(Turn(role: role, text: text, at: Date(), eventId: eventId))
        if role == "assistant" {
            thinkingTimer?.cancel()
            #if targetEnvironment(simulator) || (DEBUG && targetEnvironment(macCatalyst))
            debugLastAssistantText = text
            #endif
        }
    }

    /// The user cut in: keep what Dodo actually got to say.
    private func correctTurn(eventId: Int, spoken: String) {
        guard let idx = turns.lastIndex(where: { $0.role == "assistant" && $0.eventId == eventId }) else { return }
        turns[idx].text = spoken
    }

    /// The grader's shape: one row per turn, in session order.
    private func transcriptRows() -> [[String: String]] {
        let formatter = ISO8601DateFormatter()
        return turns.compactMap { turn in
            let text = turn.text
                .replacingOccurrences(of: #"\[[^\]\n]*(\]|$)"#, with: "", options: .regularExpression)
                .replacingOccurrences(of: #"\s{2,}"#, with: " ", options: .regularExpression)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else { return nil }
            return ["role": turn.role, "text": text, "created_at": formatter.string(from: turn.at)]
        }
    }

    private func finishSession() async {
        guard let id = sessionResponse?.voiceSession.id else { return }
        let rows = transcriptRows()
        for row in rows {
            NSLog("F2_ELEVEN_TRANSCRIPT %@: %@", row["role"] ?? "?", String((row["text"] ?? "").prefix(160)))
        }
        var usage: [String: Int]? = nil
        if let connectedAt { usage = ["seconds": Int(Date().timeIntervalSince(connectedAt))] }
        do {
            try await F2API.shared.finishLiveSession(
                id: id,
                transcript: rows,
                summary: rows.isEmpty ? nil : "Voice session with \(rows.count) transcribed turns.",
                usage: usage
            )
            transcriptUploaded = true
        } catch {
            NSLog("F2_ELEVEN_FINISH_ERROR %@", error.localizedDescription)
        }
    }
}

#if targetEnvironment(simulator) || (DEBUG && targetEnvironment(macCatalyst))
/// Sums the energy of the agent's rendered audio (test rig only).
private final class InboundAudioProbe: NSObject, AudioRenderer, @unchecked Sendable {
    private let lock = NSLock()
    private var energy = 0.0
    private var duration = 0.0

    func render(pcmBuffer: AVAudioPCMBuffer) {
        let frames = Int(pcmBuffer.frameLength)
        guard frames > 0 else { return }
        var sum = 0.0
        if let floats = pcmBuffer.floatChannelData?[0] {
            for i in 0..<frames { sum += Double(floats[i] * floats[i]) }
        } else if let ints = pcmBuffer.int16ChannelData?[0] {
            for i in 0..<frames { let v = Double(ints[i]) / 32768.0; sum += v * v }
        }
        lock.lock()
        energy += sum / Double(frames)
        duration += Double(frames) / pcmBuffer.format.sampleRate
        lock.unlock()
    }

    func snapshot() -> (energy: Double, duration: Double) {
        lock.lock()
        defer { lock.unlock() }
        return (energy, duration)
    }
}
#endif
