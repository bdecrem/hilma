@preconcurrency import AVFoundation
import Combine
import ElevenLabs
import Foundation
import LiveKit
import Observation

/// Dolly's voice client on the ElevenLabs engine — Polly's
/// (../../../polly/ios/Polly/ElevenVoiceClient.swift), ported 2026-10-10.
///
/// - ElevenLabs owns the audio: speech-to-text, turn-taking, barge-in and the
///   voice. The phone joins the conversation through ElevenLabs' Swift SDK
///   (WebRTC over LiveKit) with a conversation token OUR server minted.
/// - Claude writes every turn, server-side: ElevenLabs sends each transcribed
///   turn to the voice bridge → /api/dolly/eleven/turn. The phone never sees
///   the prompt; it only names the session with the `dodo_voice_session` variable.
/// - Dolly speaks first because the client sends a kickoff text message once
///   connected (the server swaps it for the opening instruction).
/// - Turns arrive whole (`onUserTranscript`, `onAgentResponse`), and when the
///   learner cuts in, a correction carries what Dolly actually got to say.
@MainActor
@Observable
final class ElevenVoiceClient: DollyVoiceClient {
    private(set) var phase: VoicePhase = .idle
    private(set) var status = "Ready"
    private(set) var turns: [VoiceTurn] = []
    private(set) var talking = false
    private(set) var muted = false

    let mode: String
    let holdToTalk: Bool

    private var sessionResponse: ElevenSessionResponse?
    var voiceSessionId: String? { sessionResponse?.voiceSession.id }
    var config: ElevenSessionResponse.ElevenConfig? { sessionResponse?.eleven }
    var elapsed: Int { connectedAt.map { Int(Date().timeIntervalSince($0)) } ?? 0 }

    private var conversation: Conversation?
    private var agentStateSink: AnyCancellable?
    private var agentReady = false
    private var sessionOpened = false
    private var connectedAt: Date?
    private var ending = false
    private var endedByUs = false
    private var finishedDay: DayView?

    private var thinkingTimer: Task<Void, Never>?
    private var releaseTask: Task<Void, Never>?
    private static let releaseGrace: Duration = .milliseconds(300)

    #if targetEnvironment(simulator)
    var debugChannelOpen: Bool { conversation?.state.isActive ?? false }
    var debugSessionStarted: Bool { agentReady }
    private let audioProbe = InboundAudioProbe()
    private var probeAttached = false
    #endif

    init(mode: String, holdToTalk: Bool = false) {
        self.mode = mode
        self.holdToTalk = holdToTalk
    }

    // MARK: Mic control

    func setMuted(_ on: Bool) {
        muted = on
        applyMicState()
    }

    /// Hold-to-talk: the button went down. Dolly is told to stop and the mic opens.
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
        NSLog("DOLLY_ELEVEN_PTT press")
    }

    /// Hold-to-talk: the button came up. The mic stays open for a short grace
    /// so the tail of the utterance lands, then closes.
    func endTalking() {
        guard talking else { return }
        talking = false
        setThinking()
        NSLog("DOLLY_ELEVEN_PTT release")
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
                NSLog("DOLLY_ELEVEN_MUTE_ERROR %@", error.localizedDescription)
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

    #if targetEnvironment(simulator)
    /// Test rig: cumulative energy + seconds of audio RECEIVED from Dolly,
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
            let session = try await DollyAPI.shared.startElevenSession(mode: mode, holdToTalk: holdToTalk)
            sessionResponse = session

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
                    NSLog("DOLLY_ELEVEN_EV interruption")
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
            // active-speaker detection), published on the conversation.
            agentStateSink = conversation.$agentState
                .removeDuplicates()
                .receive(on: DispatchQueue.main)
                .sink { [weak self] state in
                    MainActor.assumeIsolated { self?.handleAgentState(state) }
                }
            if agentReady { openSession() } else { status = "Waiting for Dolly..." }
        } catch {
            NSLog("DOLLY_ELEVEN_START_ERROR %@", error.localizedDescription)
            if phase != .ended {
                phase = .failed(error.localizedDescription)
                status = "Voice failed"
            }
        }
    }

    func stop() {
        Task { _ = await end() }
    }

    func end() async -> DayView? {
        guard !ending else { return finishedDay }
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
        await releaseAudioEngine()
        await finishSession()
        return finishedDay
    }

    /// ElevenLabs' SDK leaves LiveKit's audio engine warm after a conversation
    /// and never turns it off; the next thing to touch the audio session breaks
    /// that engine and the next voice session fails to start (Dodo, 2026-09-22).
    private func releaseAudioEngine() async {
        do {
            try await AudioManager.shared.setRecordingAlwaysPreparedMode(false)
        } catch {
            NSLog("DOLLY_ELEVEN_AUDIO_RELEASE_ERROR %@", error.localizedDescription)
        }
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
        NSLog("DOLLY_ELEVEN_EV agent-ready")
        openSession()
    }

    /// Once the agent is ready AND we hold the conversation: set the mic and
    /// send the kickoff so Dolly speaks first. Runs once.
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
                    NSLog("DOLLY_ELEVEN_KICKOFF_ERROR %@", error.localizedDescription)
                }
            }
            setThinking()
        }
    }

    private func handleAgentState(_ state: ElevenLabs.AgentState) {
        guard agentReady, phase != .ended else { return }
        NSLog("DOLLY_ELEVEN_EV agent-state %@", String(describing: state))
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

    private func attachAudioProbe() {
        #if targetEnvironment(simulator)
        guard !probeAttached, let track = conversation?.agentAudioTrack else { return }
        track.add(audioRenderer: audioProbe)
        probeAttached = true
        #endif
    }

    private func handleDisconnect(_ reason: DisconnectionReason) {
        NSLog("DOLLY_ELEVEN_EV disconnect %@", String(describing: reason))
        agentStateSink = nil
        guard !ending, phase != .ended else { return }
        switch reason {
        case .error:
            phase = .failed("Voice connection lost.")
            status = "Voice disconnected"
        default:
            phase = .ended
            status = "Ended"
        }
    }

    private func handleError(_ error: ConversationError) {
        NSLog("DOLLY_ELEVEN_EVENT_ERROR %@", error.localizedDescription)
        if !agentReady, phase != .ended {
            phase = .failed(error.localizedDescription)
            status = "Voice failed"
        }
    }

    // MARK: App cues

    /// A text message from the app (the server wrote it, prefix included):
    /// Claude reads it as a note, answers out loud, and it stays out of the transcript.
    func sendCue(_ text: String) {
        guard agentReady, let conversation else { return }
        NSLog("DOLLY_ELEVEN_CUE %@", String(text.prefix(120)))
        Task {
            do {
                try await conversation.sendMessage(text)
            } catch {
                NSLog("DOLLY_ELEVEN_CUE_ERROR %@", error.localizedDescription)
            }
        }
        setThinking()
    }

    private func appendTurn(role: String, text: String, eventId: Int) {
        // The kickoff and the app's cues are plumbing, not something the user said.
        if role == "user", text == sessionResponse?.eleven.kickoff { return }
        if role == "user", let prefix = sessionResponse?.eleven.cuePrefix,
           text.hasPrefix(prefix.trimmingCharacters(in: .whitespaces)) { return }
        turns.append(VoiceTurn(id: eventId, role: role, text: text, at: Date()))
        if role == "assistant" { thinkingTimer?.cancel() }
    }

    /// The learner cut in: keep what Dolly actually got to say.
    private func correctTurn(eventId: Int, spoken: String) {
        guard let idx = turns.lastIndex(where: { $0.role == "assistant" && $0.id == eventId }) else { return }
        turns[idx].text = spoken
    }

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
            NSLog("DOLLY_ELEVEN_TRANSCRIPT %@: %@", row["role"] ?? "?", String((row["text"] ?? "").prefix(160)))
        }
        let seconds = connectedAt.map { Int(Date().timeIntervalSince($0)) }
        do {
            finishedDay = try await DollyAPI.shared.finishVoice(id: id, transcript: rows, seconds: seconds)
        } catch {
            NSLog("DOLLY_ELEVEN_FINISH_ERROR %@", error.localizedDescription)
        }
    }
}

#if targetEnvironment(simulator)
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
