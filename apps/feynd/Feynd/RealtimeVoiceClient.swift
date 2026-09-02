@preconcurrency import AVFoundation
import Foundation
import Observation
@preconcurrency import WebRTC

@MainActor
@Observable
final class RealtimeVoiceClient: NSObject {
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
    /// Hold-to-talk: the session is minted without server turn detection.
    /// The mic stays off until `beginTalking()`, and `endTalking()` commits
    /// the utterance and asks for Dodo's reply. Room noise can't end or
    /// interrupt a turn because the server never listens on its own.
    let holdToTalk: Bool
    /// True while the user holds the talk button (hold-to-talk only).
    private(set) var talking = false
    /// Hands-free mute (the Mute button) — mic track off, session alive.
    private(set) var muted = false

    private var sessionResponse: F2API.RealtimeSessionResponse?

    /// The backend voice-session row id — needed by flash / final-review
    /// flows to grade the transcript after the call ends.
    var voiceSessionId: String? { sessionResponse?.voiceSession.id }
    private var peerConnectionFactory: RTCPeerConnectionFactory?
    private var peerConnection: RTCPeerConnection?
    private var localAudioTrack: RTCAudioTrack?
    /// Dodo's voice. Hold-to-talk silences it the instant the key goes down
    /// (WebRTC keeps playing buffered audio long after the server has
    /// finished generating) and re-enables it when the next reply starts.
    private var remoteAudioTrack: RTCAudioTrack?
    /// The assistant message currently being played, and when its audio
    /// started, so a cut-in can truncate it to what was actually heard.
    private var speakingItemId: String?
    private var speakingAudioStart: Date?
    /// Hold-to-talk release: the mic stays open for a short grace so the
    /// tail of the utterance lands before the commit, then we wait for the
    /// server's `input_audio_buffer.committed` before asking for a reply —
    /// a rejected (empty) commit must NOT produce a response, or Dodo just
    /// re-answers its last thought.
    private var commitTask: Task<Void, Never>?
    private var awaitingCommit = false
    private static let releaseGrace: Duration = .milliseconds(300)
    /// Speech gate for a release: the server accepts any ≥100ms buffer,
    /// silence included, so the client decides whether the user actually
    /// said something. A press shorter than `minHoldMs` is a "stop" tap;
    /// a hold whose mic energy (WebRTC media-source totalAudioEnergy)
    /// stays under `minEnergy` is a silent hold. Either way: no commit, no
    /// reply — Dodo stays cut off and waits.
    private var pressedAt: Date?
    private var pressEnergy: (energy: Double, duration: Double)?
    private static let minHoldMs = 350.0
    /// Mean mic power over the hold (energy / seconds, i.e. mean squared
    /// linear level): quiet rooms sit around 1e-4 (level 0.01), soft speech
    /// from 1e-3 (level 0.03) up. `-PTTMinPower <x>` overrides for tuning.
    private static var minPower: Double {
        if let v = UserDefaults.standard.string(forKey: "PTTMinPower"), let d = Double(v) { return d }
        return 3e-4
    }
    private var dataChannel: RTCDataChannel?
    private var audioRouteObserver: NSObjectProtocol?
    private var statisticsTask: Task<Void, Never>?
    private var transcript: [[String: String]] = []
    private var handledToolCallIds: Set<String> = []

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
    }

    /// Hold-to-talk: the button went down. Cuts Dodo off if it was
    /// mid-sentence, drops whatever silence the server buffered while the
    /// mic was off, and opens the mic.
    func beginTalking() {
        guard holdToTalk, !talking, phase == .connected || phase == .speaking else { return }
        // A press during the release grace restarts the turn.
        commitTask?.cancel()
        commitTask = nil
        awaitingCommit = false
        pressedAt = Date()
        pressEnergy = nil
        Task { [weak self] in
            let m = await self?.micEnergy()
            await MainActor.run { self?.pressEnergy = m }
        }
        cutOffDodo()
        sendEvent(["type": "input_audio_buffer.clear"])
        talking = true
        applyMicState()
        status = "Listening"
    }

    /// Hold-to-talk: the button came up. Closes the mic, commits the
    /// utterance as the user's turn, and asks for the reply.
    func endTalking() {
        guard talking else { return }
        talking = false
        status = "Thinking"
        // Press length is measured here, before the grace.
        let heldMs = (Date().timeIntervalSince(pressedAt ?? Date())) * 1000
        // Mic stays open through the grace (applyMicState runs after it).
        commitTask = Task { [weak self] in
            try? await Task.sleep(for: Self.releaseGrace)
            guard let self, !Task.isCancelled else { return }
            let mic = await self.micEnergy()
            guard !Task.isCancelled, !self.talking else { return }
            let dE = (mic?.energy ?? 0) - (self.pressEnergy?.energy ?? 0)
            let dT = (mic?.duration ?? 0) - (self.pressEnergy?.duration ?? 0)
            let power = dT > 0 ? dE / dT : 0
            // The power gate only engages once the counter is live (>0);
            // a mic that reports no energy at all falls back to duration.
            let energyLive = (mic?.energy ?? 0) > 0
            let spoke = heldMs >= Self.minHoldMs && (!energyLive || power >= Self.minPower)
            NSLog("F2_REALTIME_PTT release held_ms=%.0f power=%.6f (dE=%.6f dT=%.2f) spoke=%d",
                  heldMs, power, dE, dT, spoke ? 1 : 0)
            self.applyMicState()
            if spoke {
                self.awaitingCommit = true
                self.sendEvent(["type": "input_audio_buffer.commit"])
            } else {
                // Tap or silent hold: just a "stop". Drop the buffer, no reply.
                self.sendEvent(["type": "input_audio_buffer.clear"])
                self.status = "Connected"
            }
        }
    }

    /// Cumulative mic energy + captured seconds from WebRTC's media-source
    /// stats (nil until the connection reports them).
    private func micEnergy() async -> (energy: Double, duration: Double)? {
        guard let connection = peerConnection else { return nil }
        let report = await connection.statistics()
        for statistic in report.statistics.values where statistic.type == "media-source" {
            if Self.statisticText("kind", from: statistic) == "audio",
               let e = statistic.values["totalAudioEnergy"] as? NSNumber,
               let d = statistic.values["totalSamplesDuration"] as? NSNumber {
                NSLog("F2_REALTIME_MIC level=%@ energy=%@ duration=%@",
                      Self.statisticText("audioLevel", from: statistic), e, d)
                return (e.doubleValue, d.doubleValue)
            }
        }
        return nil
    }

    /// The server confirmed the user's turn exists — now ask for the reply.
    private func handleCommitted() {
        guard awaitingCommit else { return }
        awaitingCommit = false
        if phase == .speaking {
            // A response slipped in during the hold; the user's turn wins.
            sendEvent(["type": "response.cancel"])
        }
        sendEvent(["type": "response.create"])
        NSLog("F2_REALTIME_PTT committed -> response.create")
    }

    /// Stop Dodo mid-sentence, now. Mutes playback locally (the server has
    /// usually finished generating already, and the audio still queued in
    /// the WebRTC buffer would otherwise play out), cancels a response that
    /// is still generating, and truncates the assistant item to the audio
    /// heard so far so the conversation matches what the user actually
    /// listened to. Playback is re-enabled on the next `response.created`.
    private func cutOffDodo() {
        remoteAudioTrack?.isEnabled = false
        if phase == .speaking {
            sendEvent(["type": "response.cancel"])
        }
        if let itemId = speakingItemId {
            let heardMs = Int(max(0, Date().timeIntervalSince(speakingAudioStart ?? Date())) * 1000)
            sendEvent([
                "type": "conversation.item.truncate",
                "item_id": itemId,
                "content_index": 0,
                "audio_end_ms": heardMs,
            ])
            NSLog("F2_REALTIME_CUT_IN item=%@ heard_ms=%d", itemId, heardMs)
            speakingItemId = nil
            speakingAudioStart = nil
        }
    }

    /// The one place the mic track is switched: hold-to-talk opens it only
    /// while talking; hands-free keeps it open unless muted.
    private func applyMicState() {
        let open = holdToTalk ? talking : !muted
        localAudioTrack?.isEnabled = open
    }

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

            phase = .creatingSession
            status = "Creating Realtime session..."
            let session = try await F2API.shared.startRealtimeSession(mode: mode, threadId: threadId, cardIds: cardIds,
                                                                       holdToTalk: holdToTalk)
            sessionResponse = session
            model = session.realtime.model
            voice = session.realtime.voice

            phase = .connecting
            status = "Connecting audio..."
            try await connectWebRTC(session)
            status = "Establishing media..."
        } catch {
            cleanup()
            phase = .failed(error.localizedDescription)
            status = "Voice failed"
        }
    }

    func stop() {
        Task { await finishSession() }
        cleanup()
        phase = .ended
        status = "Ended"
    }

    /// Like stop(), but AWAITS the transcript upload before returning, so a
    /// caller can immediately submit the session for grading. Returns the
    /// backend voice-session id (nil if the session never got created).
    func end() async -> String? {
        cleanup()
        phase = .ended
        status = "Ended"
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

    private func configureAudioSession() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(
            .playAndRecord,
            mode: .voiceChat,
            options: [.defaultToSpeaker, .allowBluetoothHFP]
        )
        try session.setActive(true, options: [.notifyOthersOnDeactivation])
    }

    private func connectWebRTC(_ session: F2API.RealtimeSessionResponse) async throws {
        let factory = RTCPeerConnectionFactory()
        let configuration = RTCConfiguration()
        configuration.sdpSemantics = .unifiedPlan
        configuration.continualGatheringPolicy = .gatherContinually
        let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)

        guard let connection = factory.peerConnection(
            with: configuration,
            constraints: constraints,
            delegate: self
        ) else {
            throw VoiceError.peerConnection
        }

        let audioSource = factory.audioSource(with: nil)
        let audioTrack = factory.audioTrack(with: audioSource, trackId: "f2-microphone")
        // Hold-to-talk keeps the mic closed until the button is held.
        audioTrack.isEnabled = !holdToTalk
        guard connection.add(audioTrack, streamIds: ["f2-realtime"]) != nil else {
            throw VoiceError.audioTrack
        }

        let channelConfiguration = RTCDataChannelConfiguration()
        channelConfiguration.isOrdered = true
        guard let channel = connection.dataChannel(
            forLabel: session.realtime.dataChannel,
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
        let answer = try await exchangeSDP(
            offer: offer.sdp,
            callsURL: session.realtime.callsUrl,
            clientSecret: session.clientSecret.value
        )
        try await setRemoteDescription(
            RTCSessionDescription(type: .answer, sdp: answer),
            on: connection
        )
        NSLog("F2_REALTIME_WEBRTC remote SDP accepted")
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

    private func exchangeSDP(offer: String, callsURL: URL, clientSecret: String) async throws -> String {
        var request = URLRequest(url: callsURL)
        request.httpMethod = "POST"
        request.setValue("Bearer \(clientSecret)", forHTTPHeaderField: "Authorization")
        request.setValue("application/sdp", forHTTPHeaderField: "Content-Type")
        request.httpBody = Data(offer.utf8)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw VoiceError.invalidSDPResponse
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            let details = String(data: data, encoding: .utf8) ?? "No response body."
            throw VoiceError.sdpExchange(httpResponse.statusCode, details)
        }
        guard let answer = String(data: data, encoding: .utf8), !answer.isEmpty else {
            throw VoiceError.invalidSDPResponse
        }
        return answer
    }

    private func handleEvent(_ text: String) {
        guard
            let data = text.data(using: .utf8),
            let event = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let type = event["type"] as? String
        else { return }

        switch type {
        case "response.created":
            // The user has the floor while the key is held: a reply that
            // starts now (e.g. the follow-up after a tool result) gets
            // cancelled and Dodo answers the user's turn on release instead.
            if talking {
                sendEvent(["type": "response.cancel"])
                break
            }
            phase = .speaking
            status = "Speaking"
            remoteAudioTrack?.isEnabled = true
        case "response.output_item.added":
            if let item = event["item"] as? [String: Any],
               item["type"] as? String == "message",
               item["role"] as? String == "assistant",
               let id = item["id"] as? String {
                speakingItemId = id
                speakingAudioStart = nil
            }
        case "input_audio_buffer.committed":
            handleCommitted()
        case "response.audio_transcript.delta", "response.output_audio_transcript.delta":
            // First transcript delta ≈ first audio — the clock for truncation.
            if speakingAudioStart == nil { speakingAudioStart = Date() }
        case "response.done", "response.cancelled":
            phase = .connected
            status = talking ? "Listening" : "Connected"
        case "conversation.item.input_audio_transcription.completed":
            if let transcriptText = event["transcript"] as? String {
                appendTranscript(role: "user", text: transcriptText)
            }
        case "response.audio_transcript.done", "response.output_audio_transcript.done":
            if let transcriptText = event["transcript"] as? String {
                appendTranscript(role: "assistant", text: transcriptText)
            }
        case "response.function_call_arguments.done":
            handleFunctionArgumentsDone(event)
        case "response.output_item.done":
            handleOutputItemDone(event)
        case "error":
            let err = event["error"] as? [String: Any]
            let message = (err?["message"] as? String) ?? "Realtime error"
            let code = (err?["code"] as? String) ?? ""
            if awaitingCommit, code == "input_audio_buffer_commit_empty" {
                // Nothing (or too little) was said after the press — Dodo
                // stays cut off and waits; no reply is requested.
                awaitingCommit = false
                status = talking ? "Listening" : "Connected"
                NSLog("F2_REALTIME_PTT empty commit — no reply requested")
                break
            }
            status = message
            NSLog("F2_REALTIME_EVENT_ERROR %@", message)
        default:
            break
        }
    }

    private func appendTranscript(role: String, text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        transcript.append([
            "role": role,
            "text": trimmed,
            "created_at": ISO8601DateFormatter().string(from: Date())
        ])
    }

    private func handleFunctionArgumentsDone(_ event: [String: Any]) {
        guard
            let callId = event["call_id"] as? String,
            let name = event["name"] as? String,
            let arguments = event["arguments"] as? String
        else { return }
        runTool(callId: callId, name: name, argumentsJSON: arguments)
    }

    private func handleOutputItemDone(_ event: [String: Any]) {
        guard
            let item = event["item"] as? [String: Any],
            let itemType = item["type"] as? String,
            itemType == "function_call",
            let callId = item["call_id"] as? String,
            let name = item["name"] as? String,
            let arguments = item["arguments"] as? String
        else { return }
        runTool(callId: callId, name: name, argumentsJSON: arguments)
    }

    private func runTool(callId: String, name: String, argumentsJSON: String) {
        guard !handledToolCallIds.contains(callId) else { return }
        handledToolCallIds.insert(callId)

        Task {
            let output: String
            do {
                let args = parseStringArguments(argumentsJSON)
                let data = try await F2API.shared.callRealtimeTool(name: name, arguments: args)
                output = String(data: data, encoding: .utf8) ?? "{}"
            } catch {
                output = #"{"error":"\#(error.localizedDescription)"}"#
            }
            sendToolOutput(callId: callId, output: output)
        }
    }

    private func parseStringArguments(_ json: String) -> [String: String] {
        guard
            let data = json.data(using: .utf8),
            let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return [:] }
        var result: [String: String] = [:]
        for (key, value) in object {
            result[key] = String(describing: value)
        }
        return result
    }

    private func sendToolOutput(callId: String, output: String) {
        sendEvent([
            "type": "conversation.item.create",
            "item": [
                "type": "function_call_output",
                "call_id": callId,
                "output": output
            ]
        ])
        // Mid-hold, the reply waits: endTalking's response.create will pick
        // up this tool result together with the user's utterance.
        if !talking && !awaitingCommit {
            sendEvent(["type": "response.create"])
        }
    }

    private func sendEvent(_ object: [String: Any]) {
        guard
            let channel = dataChannel,
            channel.readyState == .open,
            let data = try? JSONSerialization.data(withJSONObject: object)
        else { return }
        if !channel.sendData(RTCDataBuffer(data: data, isBinary: false)) {
            NSLog("F2_REALTIME_DATA_CHANNEL_SEND_ERROR")
        }
    }

    private func finishSession() async {
        guard let id = sessionResponse?.voiceSession.id else { return }
        try? await F2API.shared.finishRealtimeSession(
            id: id,
            transcript: transcript,
            summary: transcriptSummary()
        )
    }

    private func transcriptSummary() -> String? {
        guard !transcript.isEmpty else { return nil }
        return "Voice session with \(transcript.count) transcribed turns."
    }

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
            "F2_REALTIME_AUDIO_ROUTE %@ inputs=%@ outputs=%@ rate=%.0f buffer=%.4f latency=%.4f",
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
                            "F2_REALTIME_STATS inbound_audio packetsLost=%@ jitter=%@ concealedSamples=%@ jitterBufferDelay=%@ jitterBufferEmittedCount=%@",
                            Self.statisticText("packetsLost", from: statistic),
                            Self.statisticText("jitter", from: statistic),
                            Self.statisticText("concealedSamples", from: statistic),
                            Self.statisticText("jitterBufferDelay", from: statistic),
                            Self.statisticText("jitterBufferEmittedCount", from: statistic)
                        )
                    } else if statistic.type == "candidate-pair",
                              Self.statisticText("nominated", from: statistic) == "1" {
                        NSLog(
                            "F2_REALTIME_STATS candidate_pair state=%@ rtt=%@ availableIncomingBitrate=%@",
                            Self.statisticText("state", from: statistic),
                            Self.statisticText("currentRoundTripTime", from: statistic),
                            Self.statisticText("availableIncomingBitrate", from: statistic)
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
        dataChannel?.delegate = nil
        dataChannel?.close()
        dataChannel = nil
        statisticsTask?.cancel()
        statisticsTask = nil
        localAudioTrack?.isEnabled = false
        localAudioTrack = nil
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
        case invalidSDPResponse
        case sdpExchange(Int, String)

        var errorDescription: String? {
            switch self {
            case .peerConnection:
                return "Couldn't create the Realtime media connection."
            case .audioTrack:
                return "Couldn't connect microphone audio."
            case .dataChannel:
                return "Couldn't create the Realtime event channel."
            case .missingSDP:
                return "Couldn't create a Realtime connection offer."
            case .invalidSDPResponse:
                return "OpenAI returned an invalid Realtime connection response."
            case .sdpExchange(let status, let message):
                return "OpenAI Realtime connection failed (\(status)): \(message)"
            }
        }
    }
}

extension RealtimeVoiceClient: RTCDataChannelDelegate {
    nonisolated func dataChannelDidChangeState(_ dataChannel: RTCDataChannel) {
        let state = dataChannel.readyState
        Task { @MainActor in
            NSLog("F2_REALTIME_DATA_CHANNEL state=%ld", state.rawValue)
        }
    }

    nonisolated func dataChannel(_ dataChannel: RTCDataChannel, didReceiveMessageWith buffer: RTCDataBuffer) {
        guard let text = String(data: buffer.data, encoding: .utf8) else { return }
        Task { @MainActor in
            self.handleEvent(text)
        }
    }
}

extension RealtimeVoiceClient: RTCPeerConnectionDelegate {
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
            NSLog("F2_REALTIME_WEBRTC remote audio stream added")
        }
    }

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}

    nonisolated func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}

    nonisolated func peerConnection(
        _ peerConnection: RTCPeerConnection,
        didChange newState: RTCIceConnectionState
    ) {
        Task { @MainActor in
            NSLog("F2_REALTIME_ICE state=%ld", newState.rawValue)
        }
    }

    nonisolated func peerConnection(
        _ peerConnection: RTCPeerConnection,
        didChange newState: RTCIceGatheringState
    ) {}

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
            NSLog("F2_REALTIME_CONNECTION state=%ld", newState.rawValue)
            switch newState {
            case .connected:
                self.phase = .connected
                self.status = "Connected"
                self.logAudioRoute(reason: "WebRTC connected")
                self.startStatisticsLogging()
            case .failed:
                if self.phase != .ended {
                    self.phase = .failed("Realtime media connection failed.")
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
