@preconcurrency import AVFoundation
import Foundation
import Observation
@preconcurrency import WebRTC

/// Dodo's voice client on GPT-Live (gpt-live-1), over WebRTC. Replaced the
/// Realtime client on 2026-09-11 — see docs/f2-gpt-live-reference.md.
///
/// What is different from Realtime, in one place:
/// - The session is created by OUR server: the phone builds its SDP offer,
///   POSTs it to /api/f2/live/session, and applies the returned answer.
///   There is no ephemeral client secret and no direct call to OpenAI.
/// - The model is full duplex: it listens while it speaks and handles
///   interruptions itself. There is no turn loop — no audio commits, no
///   response.create, no response.cancel, no truncation. Audio streams
///   continuously; the model decides when to talk.
/// - Reasoning and source lookups are DELEGATED by the model to a Responses
///   backend that our server configured with the full topic material. The
///   client runs no tool calls.
/// - Transcripts arrive as timestamped fragments per speaker
///   (`session.input_transcript.delta` / `session.output_transcript.delta`);
///   this client groups them into turns for the grader.
/// - There is no "response done" event. The speaking indicator is driven by
///   output-transcript activity.
@MainActor
@Observable
final class LiveVoiceClient: NSObject {
    enum Phase: Equatable {
        case idle
        case requestingPermission
        case creatingSession
        case connecting
        case connected
        case speaking
        case failed(String)
        case ended
    }

    private(set) var phase: Phase = .idle
    private(set) var status = "Ready"
    private(set) var model = ""
    private(set) var voice = ""

    let mode: String
    let threadId: String?
    /// Flash mode: the deck (card ids in question order) the server embeds
    /// in the session instructions.
    let cardIds: [String]?
    /// Hold-to-talk: the mic is muted except while the key is held. The
    /// model is told so in its prompt; the key also silences Dodo's audio
    /// locally the instant it goes down.
    let holdToTalk: Bool
    /// True while the user holds the talk button (hold-to-talk only).
    private(set) var talking = false
    /// Hands-free mute (the Mute button) — mic track off, session alive.
    private(set) var muted = false

    private var sessionResponse: F2API.LiveSessionResponse?

    /// The backend voice-session row id — needed by flash / final-review
    /// flows to grade the transcript after the call ends.
    var voiceSessionId: String? { sessionResponse?.voiceSession.id }

    private var peerConnectionFactory: RTCPeerConnectionFactory?
    private var peerConnection: RTCPeerConnection?
    private var localAudioTrack: RTCAudioTrack?
    private var remoteAudioTrack: RTCAudioTrack?
    private var dataChannel: RTCDataChannel?
    private var audioRouteObserver: NSObjectProtocol?
    private var statisticsTask: Task<Void, Never>?
    private var iceGatheringContinuation: CheckedContinuation<Void, Never>?

    // Session lifecycle (server truth arrives on the data channel).
    private var sessionStarted = false
    private var sessionStartedAt: Date?
    private var ending = false
    private var closedContinuation: CheckedContinuation<Void, Never>?
    private var usageSeconds: Int?
    private var closeReason: String?
    private var transcriptUploaded = false

    // Transcript: fragments grouped into turns, per speaker.
    private struct Turn {
        let role: String
        var text: String
        let startMs: Int
        var endMs: Int
    }
    private var turns: [Turn] = []
    private var openTurnIndex: [String: Int] = [:]
    /// A fragment more than this after the speaker's last one starts a new
    /// turn. Tuned so a pause to think stays one answer.
    private static let turnGapMs = 2000

    // Speaking / thinking indicators.
    private var speakingTimer: Task<Void, Never>?
    private var thinkingTimer: Task<Void, Never>?
    private var releaseTask: Task<Void, Never>?
    private var eventCounter = 0
    private static let releaseGrace: Duration = .milliseconds(300)

    #if targetEnvironment(simulator) || (DEBUG && targetEnvironment(macCatalyst))
    private(set) var debugLastAssistantText = ""
    var debugChannelOpen: Bool { dataChannel?.readyState == .open }
    var debugSessionStarted: Bool { sessionStarted }
    var debugCloseReason: String? { closeReason }
    var debugTranscriptUploaded: Bool { transcriptUploaded }
    var debugTurnCount: Int { turns.count }
    #endif

    init(mode: String, threadId: String? = nil, cardIds: [String]? = nil, holdToTalk: Bool = false) {
        self.mode = mode
        self.threadId = threadId
        self.cardIds = cardIds
        self.holdToTalk = holdToTalk
        super.init()
    }

    // MARK: Mic control

    /// Hands-free sessions: silence the mic without ending the call.
    func setMuted(_ on: Bool) {
        muted = on
        applyMicState()
        sendEvent(["type": on ? "session.input_audio.mute" : "session.input_audio.unmute",
                   "event_id": nextEventId(on ? "mute" : "unmute")])
    }

    /// Hold-to-talk: the button went down. Cuts Dodo's audio off locally
    /// (the model stops on its own once it hears the user) and opens the mic.
    func beginTalking() {
        guard holdToTalk, !talking, sessionStarted, phase == .connected || phase == .speaking else { return }
        releaseTask?.cancel()
        releaseTask = nil
        thinkingTimer?.cancel()
        talking = true
        remoteAudioTrack?.isEnabled = false
        applyMicState()
        sendEvent(["type": "session.input_audio.unmute", "event_id": nextEventId("unmute")])
        status = "Listening"
        NSLog("F2_LIVE_PTT press")
    }

    /// Hold-to-talk: the button came up. The mic stays open for a short
    /// grace so the tail of the utterance lands, then closes; Dodo's audio
    /// comes back on.
    func endTalking() {
        guard talking else { return }
        talking = false
        remoteAudioTrack?.isEnabled = true
        setThinking()
        NSLog("F2_LIVE_PTT release")
        releaseTask = Task { [weak self] in
            try? await Task.sleep(for: Self.releaseGrace)
            guard let self, !Task.isCancelled, !self.talking else { return }
            self.applyMicState()
            self.sendEvent(["type": "session.input_audio.mute", "event_id": self.nextEventId("mute")])
        }
    }

    /// The one place the mic track is switched: hold-to-talk opens it only
    /// while talking; hands-free keeps it open unless muted.
    private func applyMicState() {
        let open = holdToTalk ? talking : !muted
        localAudioTrack?.isEnabled = open
    }

    /// "Thinking" until Dodo's next words (or a timeout). Shown by the
    /// hold-to-talk dial after a release and whenever the model delegates.
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
    /// Test rig: the simulator mic is silent, so a drill nudges Dodo with an
    /// appended instruction instead of speech.
    func debugInstruct(_ text: String) {
        sendEvent(["type": "session.instructions.append", "event_id": nextEventId("debug"),
                   "delegation_id": NSNull(), "content": text])
    }

    /// Test rig: a commentary append — the model paraphrases it aloud, which
    /// is the documented way to make it start a greeting.
    func debugCommentary(_ text: String) {
        sendEvent(["type": "session.commentary.append", "event_id": nextEventId("debug-say"),
                   "delegation_id": NSNull(), "content": text])
    }

    /// Test rig: cumulative energy + seconds of audio RECEIVED from Dodo
    /// (inbound-rtp), to prove sound is actually arriving.
    func debugInboundAudio() async -> (energy: Double, duration: Double)? {
        guard let connection = peerConnection else { return nil }
        let report = await connection.statistics()
        for statistic in report.statistics.values where statistic.type == "inbound-rtp" {
            if Self.statisticText("kind", from: statistic) == "audio",
               let e = statistic.values["totalAudioEnergy"] as? NSNumber,
               let d = statistic.values["totalSamplesDuration"] as? NSNumber {
                return (e.doubleValue, d.doubleValue)
            }
        }
        return nil
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

            try configureAudioSession()
            observeAudioRoute()
            logAudioRoute(reason: "session configured")

            phase = .connecting
            status = "Preparing audio..."
            let (connection, offerSDP) = try await prepareWebRTC()

            phase = .creatingSession
            status = "Creating voice session..."
            let session = try await F2API.shared.startLiveSession(
                mode: mode, threadId: threadId, cardIds: cardIds, holdToTalk: holdToTalk, sdp: offerSDP)
            sessionResponse = session
            model = session.live.model
            voice = session.live.voice

            phase = .connecting
            status = "Connecting audio..."
            try await setRemoteDescription(
                RTCSessionDescription(type: .answer, sdp: session.live.sdpAnswer),
                on: connection
            )
            NSLog("F2_LIVE_WEBRTC remote SDP accepted session=%@", session.live.sessionId)
            status = "Establishing media..."
        } catch {
            cleanup()
            phase = .failed(error.localizedDescription)
            status = "Voice failed"
        }
    }

    /// Fire-and-forget end: closes the session gracefully and uploads the
    /// transcript in the background.
    func stop() {
        Task { _ = await end() }
    }

    /// Ends the session and AWAITS the transcript upload, so a caller can
    /// immediately submit the session for grading. Returns the backend
    /// voice-session id (nil if the session never got created).
    func end() async -> String? {
        guard !ending else { return voiceSessionId }
        ending = true
        // Stop capturing the instant End is pressed.
        talking = false
        localAudioTrack?.isEnabled = false
        remoteAudioTrack?.isEnabled = false
        phase = .ended
        status = "Ended"
        await gracefulClose()
        cleanup()
        await finishSession()
        return voiceSessionId
    }

    /// `session.close`, then wait (briefly) for `session.closed` so the
    /// final usage lands. A lost connection just falls through.
    private func gracefulClose() async {
        guard sessionStarted, let channel = dataChannel, channel.readyState == .open else { return }
        sendEvent(["type": "session.close", "event_id": nextEventId("close")])
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            closedContinuation = continuation
            Task { [weak self] in
                try? await Task.sleep(for: .seconds(4))
                await MainActor.run {
                    guard let self, let pending = self.closedContinuation else { return }
                    self.closedContinuation = nil
                    NSLog("F2_LIVE_CLOSE no session.closed within 4s")
                    pending.resume()
                }
            }
        }
    }

    private func requestMicrophonePermission() async -> Bool {
        await withCheckedContinuation { continuation in
            AVAudioApplication.requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }
    }

    private func configureAudioSession() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(
            .playAndRecord,
            mode: .voiceChat,
            options: [.defaultToSpeaker, .allowBluetoothHFP]
        )
        try session.setActive(true, options: [.notifyOthersOnDeactivation])
    }

    // MARK: WebRTC

    /// Peer connection + mic track + event channel, then the SDP offer with
    /// ICE gathering complete — the server needs the whole offer in one go.
    private func prepareWebRTC() async throws -> (RTCPeerConnection, String) {
        let factory = RTCPeerConnectionFactory()
        let configuration = RTCConfiguration()
        configuration.sdpSemantics = .unifiedPlan
        configuration.continualGatheringPolicy = .gatherOnce
        let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)

        guard let connection = factory.peerConnection(
            with: configuration,
            constraints: constraints,
            delegate: self
        ) else {
            throw VoiceError.peerConnection
        }

        let audioSource = factory.audioSource(with: nil)
        let audioTrack = factory.audioTrack(with: audioSource, trackId: "dodo-microphone")
        // Hold-to-talk keeps the mic closed until the button is held.
        audioTrack.isEnabled = !holdToTalk
        guard connection.add(audioTrack, streamIds: ["dodo-live"]) != nil else {
            throw VoiceError.audioTrack
        }

        // The event channel must exist before the offer is created.
        let channelConfiguration = RTCDataChannelConfiguration()
        channelConfiguration.isOrdered = true
        guard let channel = connection.dataChannel(
            forLabel: "oai-events",
            configuration: channelConfiguration
        ) else {
            throw VoiceError.dataChannel
        }
        channel.delegate = self

        peerConnectionFactory = factory
        peerConnection = connection
        localAudioTrack = audioTrack
        dataChannel = channel

        let offer = try await offer(for: connection)
        try await setLocalDescription(offer, on: connection)
        await waitForIceGathering(connection)
        guard let sdp = connection.localDescription?.sdp, !sdp.isEmpty else {
            throw VoiceError.missingSDP
        }
        return (connection, sdp)
    }

    /// Host candidates only (no ICE servers), so this is quick; a timeout
    /// sends whatever has been gathered.
    private func waitForIceGathering(_ connection: RTCPeerConnection) async {
        if connection.iceGatheringState == .complete { return }
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            iceGatheringContinuation = continuation
            Task { [weak self] in
                try? await Task.sleep(for: .seconds(6))
                await MainActor.run {
                    guard let self, let pending = self.iceGatheringContinuation else { return }
                    self.iceGatheringContinuation = nil
                    NSLog("F2_LIVE_ICE gathering timed out — sending the partial offer")
                    pending.resume()
                }
            }
        }
    }

    private func offer(for connection: RTCPeerConnection) async throws -> RTCSessionDescription {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<RTCSessionDescription, Error>) in
            let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
            connection.offer(for: constraints) { offer, error in
                if let error {
                    continuation.resume(throwing: error)
                } else if let offer {
                    continuation.resume(returning: offer)
                } else {
                    continuation.resume(throwing: VoiceError.missingSDP)
                }
            }
        }
    }

    private func setLocalDescription(
        _ description: RTCSessionDescription,
        on connection: RTCPeerConnection
    ) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            connection.setLocalDescription(description) { error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: ())
                }
            }
        }
    }

    private func setRemoteDescription(
        _ description: RTCSessionDescription,
        on connection: RTCPeerConnection
    ) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            connection.setRemoteDescription(description) { error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: ())
                }
            }
        }
    }

    // MARK: Events

    private func handleEvent(_ text: String) {
        guard
            let data = text.data(using: .utf8),
            let event = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let type = event["type"] as? String
        else { return }

        if !type.hasSuffix(".delta") && type != "session.usage.updated" {
            NSLog("F2_LIVE_EV %@", type)
        }
        switch type {
        case "session.started":
            sessionStarted = true
            sessionStartedAt = Date()
            phase = .connected
            status = "Connected"
            if holdToTalk {
                sendEvent(["type": "session.input_audio.mute", "event_id": nextEventId("mute")])
            }
            if let opening = sessionResponse?.live.openingInstruction, !opening.isEmpty {
                sendEvent(["type": "session.instructions.append", "event_id": "opening",
                           "delegation_id": NSNull(), "content": opening])
                setThinking()
            }
        case "session.output_transcript.delta":
            if let delta = event["delta"] as? String {
                appendFragment(role: "assistant", delta: delta,
                               startMs: event["start_ms"] as? Int ?? 0,
                               endMs: event["end_ms"] as? Int ?? 0)
            }
            markSpeaking()
        case "session.input_transcript.delta":
            if let delta = event["delta"] as? String {
                appendFragment(role: "user", delta: delta,
                               startMs: event["start_ms"] as? Int ?? 0,
                               endMs: event["end_ms"] as? Int ?? 0)
            }
        case "session.delegation.created":
            let delegation = event["delegation"] as? [String: Any]
            NSLog("F2_LIVE_DELEGATION target=%@ id=%@",
                  (delegation?["target"] as? String) ?? "-", (delegation?["id"] as? String) ?? "-")
            setThinking()
        case "response.event":
            if let nested = event["event"] as? [String: Any], let nestedType = nested["type"] as? String,
               !nestedType.hasSuffix(".delta") {
                NSLog("F2_LIVE_BACKEND %@", nestedType)
            }
        case "session.usage.updated":
            if let usage = event["usage"] as? [String: Any], let seconds = usage["seconds"] as? Int {
                usageSeconds = seconds
            }
        case "session.closed":
            if let usage = event["usage"] as? [String: Any], let seconds = usage["seconds"] as? Int {
                usageSeconds = seconds
            }
            closeReason = event["reason"] as? String
            NSLog("F2_LIVE_CLOSED reason=%@ seconds=%d", closeReason ?? "-", usageSeconds ?? -1)
            if let pending = closedContinuation {
                closedContinuation = nil
                pending.resume()
            } else if phase != .ended {
                // The server ended it (expired, moderation, lost upstream).
                phase = .ended
                status = "Ended"
            }
        case "error":
            let err = event["error"] as? [String: Any]
            let message = (err?["message"] as? String) ?? "Voice error"
            let code = (err?["code"] as? String) ?? ""
            NSLog("F2_LIVE_EVENT_ERROR %@ (%@)", message, code)
            if !sessionStarted, phase != .ended {
                phase = .failed(message)
                status = "Voice failed"
            }
        default:
            break
        }
    }

    /// Dodo is audible: transcript fragments keep arriving while it speaks.
    /// 1.5 s without one and it has gone quiet (the audio tail is short).
    private func markSpeaking() {
        thinkingTimer?.cancel()
        if !talking {
            phase = .speaking
            status = "Speaking"
        }
        speakingTimer?.cancel()
        speakingTimer = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(1500))
            guard let self, !Task.isCancelled, self.phase == .speaking else { return }
            self.phase = .connected
            self.status = self.talking ? "Listening" : "Connected"
        }
    }

    /// Group a fragment into the speaker's open turn, or start a new one.
    /// Text is concatenated exactly as received (the API includes spaces).
    private func appendFragment(role: String, delta: String, startMs: Int, endMs: Int) {
        if let idx = openTurnIndex[role], idx < turns.count, startMs - turns[idx].endMs <= Self.turnGapMs {
            turns[idx].text += delta
            turns[idx].endMs = max(turns[idx].endMs, endMs)
        } else {
            turns.append(Turn(role: role, text: delta, startMs: startMs, endMs: endMs))
            openTurnIndex[role] = turns.count - 1
        }
        #if targetEnvironment(simulator) || (DEBUG && targetEnvironment(macCatalyst))
        if role == "assistant", let idx = openTurnIndex[role] { debugLastAssistantText = turns[idx].text }
        #endif
    }

    /// The grader's shape: one row per turn, in session order.
    private func transcriptRows() -> [[String: String]] {
        let base = sessionStartedAt ?? Date()
        let formatter = ISO8601DateFormatter()
        return turns
            .sorted { $0.startMs < $1.startMs }
            .compactMap { turn in
                var text = turn.text.trimmingCharacters(in: .whitespacesAndNewlines)
                // GPT-Live transcribes non-speech as bracketed tags
                // ("[tongue click]", "[laughs]"); the graders don't need them.
                text = text.replacingOccurrences(of: #"\[[^\]\n]*(\]|$)"#, with: "", options: .regularExpression)
                    .replacingOccurrences(of: #"\s{2,}"#, with: " ", options: .regularExpression)
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                guard !text.isEmpty else { return nil }
                return [
                    "role": turn.role,
                    "text": text,
                    "created_at": formatter.string(from: base.addingTimeInterval(Double(turn.startMs) / 1000)),
                ]
            }
    }

    private func nextEventId(_ label: String) -> String {
        eventCounter += 1
        return "\(label)-\(eventCounter)"
    }

    private func sendEvent(_ object: [String: Any]) {
        guard
            let channel = dataChannel,
            channel.readyState == .open,
            let data = try? JSONSerialization.data(withJSONObject: object)
        else { return }
        if !channel.sendData(RTCDataBuffer(data: data, isBinary: false)) {
            NSLog("F2_LIVE_DATA_CHANNEL_SEND_ERROR")
        }
    }

    private func finishSession() async {
        guard let id = sessionResponse?.voiceSession.id else { return }
        let rows = transcriptRows()
        for row in rows {
            NSLog("F2_LIVE_TRANSCRIPT %@: %@", row["role"] ?? "?", String((row["text"] ?? "").prefix(160)))
        }
        var usage: [String: Int]? = nil
        if let seconds = usageSeconds { usage = ["seconds": seconds] }
        do {
            try await F2API.shared.finishLiveSession(
                id: id,
                transcript: rows,
                summary: rows.isEmpty ? nil : "Voice session with \(rows.count) transcribed turns.",
                usage: usage
            )
            transcriptUploaded = true
        } catch {
            NSLog("F2_LIVE_FINISH_ERROR %@", error.localizedDescription)
        }
    }

    // MARK: Audio route + stats logging

    private func observeAudioRoute() {
        audioRouteObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.routeChangeNotification,
            object: AVAudioSession.sharedInstance(),
            queue: .main
        ) { [weak self] notification in
            let reasonValue = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt
            let reason = reasonValue.flatMap(AVAudioSession.RouteChangeReason.init(rawValue:))?.rawValue ?? 0
            Task { @MainActor in
                self?.logAudioRoute(reason: "route change \(reason)")
            }
        }
    }

    private func logAudioRoute(reason: String) {
        let session = AVAudioSession.sharedInstance()
        let outputs = session.currentRoute.outputs
            .map { "\($0.portType.rawValue):\($0.portName)" }
            .joined(separator: ",")
        let inputs = session.currentRoute.inputs
            .map { "\($0.portType.rawValue):\($0.portName)" }
            .joined(separator: ",")
        NSLog(
            "F2_LIVE_AUDIO_ROUTE %@ inputs=%@ outputs=%@ rate=%.0f buffer=%.4f latency=%.4f",
            reason,
            inputs,
            outputs,
            session.sampleRate,
            session.ioBufferDuration,
            session.outputLatency
        )
    }

    private func startStatisticsLogging() {
        guard statisticsTask == nil else { return }
        statisticsTask = Task { [weak self] in
            while !Task.isCancelled {
                do {
                    try await Task.sleep(nanoseconds: 10_000_000_000)
                } catch {
                    break
                }
                guard let self, let connection = self.peerConnection else { break }
                let report = await connection.statistics()
                for statistic in report.statistics.values {
                    if statistic.type == "inbound-rtp",
                       Self.statisticText("kind", from: statistic) == "audio" {
                        NSLog(
                            "F2_LIVE_STATS inbound_audio packetsLost=%@ jitter=%@ concealedSamples=%@ jitterBufferDelay=%@",
                            Self.statisticText("packetsLost", from: statistic),
                            Self.statisticText("jitter", from: statistic),
                            Self.statisticText("concealedSamples", from: statistic),
                            Self.statisticText("jitterBufferDelay", from: statistic)
                        )
                    } else if statistic.type == "candidate-pair",
                              Self.statisticText("nominated", from: statistic) == "1" {
                        NSLog(
                            "F2_LIVE_STATS candidate_pair state=%@ rtt=%@",
                            Self.statisticText("state", from: statistic),
                            Self.statisticText("currentRoundTripTime", from: statistic)
                        )
                    }
                }
            }
        }
    }

    private nonisolated static func statisticText(_ key: String, from statistic: RTCStatistics) -> String {
        statistic.values[key].map(String.init(describing:)) ?? "-"
    }

    private func cleanup() {
        if let observer = audioRouteObserver {
            NotificationCenter.default.removeObserver(observer)
            audioRouteObserver = nil
        }
        speakingTimer?.cancel()
        thinkingTimer?.cancel()
        releaseTask?.cancel()
        if let pending = iceGatheringContinuation {
            iceGatheringContinuation = nil
            pending.resume()
        }
        if let pending = closedContinuation {
            closedContinuation = nil
            pending.resume()
        }
        dataChannel?.delegate = nil
        dataChannel?.close()
        dataChannel = nil
        statisticsTask?.cancel()
        statisticsTask = nil
        localAudioTrack?.isEnabled = false
        localAudioTrack = nil
        remoteAudioTrack = nil
        peerConnection?.close()
        peerConnection = nil
        peerConnectionFactory = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
    }

    enum VoiceError: LocalizedError {
        case peerConnection
        case audioTrack
        case dataChannel
        case missingSDP

        var errorDescription: String? {
            switch self {
            case .peerConnection:
                return "Couldn't create the voice media connection."
            case .audioTrack:
                return "Couldn't connect microphone audio."
            case .dataChannel:
                return "Couldn't create the voice event channel."
            case .missingSDP:
                return "Couldn't create a voice connection offer."
            }
        }
    }
}

extension LiveVoiceClient: RTCDataChannelDelegate {
    nonisolated func dataChannelDidChangeState(_ dataChannel: RTCDataChannel) {
        let state = dataChannel.readyState
        Task { @MainActor in
            NSLog("F2_LIVE_DATA_CHANNEL state=%ld", state.rawValue)
        }
    }

    nonisolated func dataChannel(_ dataChannel: RTCDataChannel, didReceiveMessageWith buffer: RTCDataBuffer) {
        guard let text = String(data: buffer.data, encoding: .utf8) else { return }
        Task { @MainActor in
            self.handleEvent(text)
        }
    }
}

extension LiveVoiceClient: RTCPeerConnectionDelegate {
    nonisolated func peerConnection(
        _ peerConnection: RTCPeerConnection,
        didChange stateChanged: RTCSignalingState
    ) {}

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {
        for audioTrack in stream.audioTracks {
            audioTrack.isEnabled = true
        }
        let track = stream.audioTracks.first
        Task { @MainActor in
            self.remoteAudioTrack = track
            // A session that ended before media arrived must stay silent.
            if self.ending { track?.isEnabled = false }
            NSLog("F2_LIVE_WEBRTC remote audio stream added")
        }
    }

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}

    nonisolated func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}

    nonisolated func peerConnection(
        _ peerConnection: RTCPeerConnection,
        didChange newState: RTCIceConnectionState
    ) {
        Task { @MainActor in
            NSLog("F2_LIVE_ICE state=%ld", newState.rawValue)
        }
    }

    nonisolated func peerConnection(
        _ peerConnection: RTCPeerConnection,
        didChange newState: RTCIceGatheringState
    ) {
        Task { @MainActor in
            if newState == .complete, let pending = self.iceGatheringContinuation {
                self.iceGatheringContinuation = nil
                pending.resume()
            }
        }
    }

    nonisolated func peerConnection(
        _ peerConnection: RTCPeerConnection,
        didGenerate candidate: RTCIceCandidate
    ) {}

    nonisolated func peerConnection(
        _ peerConnection: RTCPeerConnection,
        didRemove candidates: [RTCIceCandidate]
    ) {}

    nonisolated func peerConnection(
        _ peerConnection: RTCPeerConnection,
        didOpen dataChannel: RTCDataChannel
    ) {
        dataChannel.delegate = self
    }

    nonisolated func peerConnection(
        _ peerConnection: RTCPeerConnection,
        didChange newState: RTCPeerConnectionState
    ) {
        Task { @MainActor in
            NSLog("F2_LIVE_CONNECTION state=%ld", newState.rawValue)
            switch newState {
            case .connected:
                // Media is up; the session itself is "connected" once
                // session.started arrives on the data channel.
                if !self.sessionStarted { self.status = "Waiting for Dodo..." }
                self.logAudioRoute(reason: "WebRTC connected")
                self.startStatisticsLogging()
            case .failed:
                if self.phase != .ended {
                    self.phase = .failed("Voice media connection failed.")
                    self.status = "Voice disconnected"
                }
            case .disconnected:
                if self.phase != .ended {
                    self.status = "Reconnecting audio..."
                }
            default:
                break
            }
        }
    }
}
