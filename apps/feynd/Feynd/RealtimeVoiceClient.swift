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

    private var sessionResponse: F2API.RealtimeSessionResponse?

    /// The backend voice-session row id — needed by flash / final-review
    /// flows to grade the transcript after the call ends.
    var voiceSessionId: String? { sessionResponse?.voiceSession.id }
    private var peerConnectionFactory: RTCPeerConnectionFactory?
    private var peerConnection: RTCPeerConnection?
    private var localAudioTrack: RTCAudioTrack?
    private var dataChannel: RTCDataChannel?
    private var audioRouteObserver: NSObjectProtocol?
    private var statisticsTask: Task<Void, Never>?
    private var transcript: [[String: String]] = []
    private var handledToolCallIds: Set<String> = []

    init(mode: String, threadId: String? = nil, cardIds: [String]? = nil) {
        self.mode = mode
        self.threadId = threadId
        self.cardIds = cardIds
        super.init()
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
            let session = try await F2API.shared.startRealtimeSession(mode: mode, threadId: threadId, cardIds: cardIds)
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
        audioTrack.isEnabled = true
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
            phase = .speaking
            status = "Speaking"
        case "response.done":
            phase = .connected
            status = "Connected"
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
            let message = ((event["error"] as? [String: Any])?["message"] as? String) ?? "Realtime error"
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
        sendEvent(["type": "response.create"])
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
        Task { @MainActor in
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
