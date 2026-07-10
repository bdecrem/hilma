@preconcurrency import AVFoundation
import Foundation
import Observation
@preconcurrency import WebRTC

/// The talk engine: one WebRTC connection to OpenAI Realtime, driven by the
/// /api/omni/talk backend. Cloned from Peri's WalkClient, minus tool calls
/// (Omniglot's tutor has none — corrections are derived from the transcript
/// after the session ends).
@MainActor
@Observable
final class VoiceClient: NSObject {
    enum Phase: Equatable {
        case idle
        case requestingPermission
        case creatingSession
        case connecting
        case listening      // connected, learner's turn / silence
        case speaking       // the tutor is talking
        case failed(String)
        case ended
    }

    private(set) var phase: Phase = .idle
    private(set) var status = "Ready"

    /// Latest line of each side, for the glanceable captions.
    private(set) var lastUserLine = ""
    private(set) var lastTutorLine = ""

    private(set) var conversationId: String?
    private(set) var muted = false

    private var sessionResponse: TalkSessionResponse?
    private var peerConnectionFactory: RTCPeerConnectionFactory?
    private var peerConnection: RTCPeerConnection?
    private var localAudioTrack: RTCAudioTrack?
    private var dataChannel: RTCDataChannel?
    private(set) var transcript: [[String: String]] = []
    private var openedConversation = false
    private var connectTimeoutTask: Task<Void, Never>?

    var userTurns: Int {
        transcript.filter { $0["role"] == "user" }.count
    }

    func start(topicId: String?) async {
        guard phase == .idle || phase == .ended else { return }
        transcript = []
        openedConversation = false
        lastUserLine = ""
        lastTutorLine = ""
        do {
            phase = .requestingPermission
            status = "Checking the microphone…"
            guard await requestMicrophonePermission() else {
                phase = .failed("Microphone access denied.")
                status = "Enable microphone access in Settings."
                return
            }
            try configureAudioSession()

            phase = .creatingSession
            status = "Waking your tutor…"
            let session = try await API.shared.startTalkSession(topicId: topicId)
            sessionResponse = session
            conversationId = session.conversation.id

            phase = .connecting
            status = "Connecting…"
            try await connectWebRTC(session)

            // ICE can stall without ever reaching .failed — don't leave the
            // booth stuck on "Connecting…" forever.
            connectTimeoutTask = Task { [weak self] in
                try? await Task.sleep(nanoseconds: 20_000_000_000)
                guard let self, self.phase == .connecting else { return }
                self.cleanup()
                self.phase = .failed("Couldn't reach the voice service. Try again.")
                self.status = "Connection timed out"
            }
        } catch {
            cleanup()
            phase = .failed(error.localizedDescription)
            status = "Couldn't start the conversation"
        }
    }

    /// Tear down the connection. The caller ends the session server-side
    /// (PATCH with the transcript) — it needs the response for the debrief.
    func stop() {
        cleanup()
        phase = .ended
        status = "Conversation ended"
    }

    func setMuted(_ value: Bool) {
        muted = value
        localAudioTrack?.isEnabled = !value
    }

    // MARK: Audio + permission

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

    // MARK: WebRTC (offer → /v1/realtime/calls → answer)

    private func connectWebRTC(_ session: TalkSessionResponse) async throws {
        let factory = RTCPeerConnectionFactory()
        let configuration = RTCConfiguration()
        configuration.sdpSemantics = .unifiedPlan
        configuration.continualGatheringPolicy = .gatherContinually
        let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)

        guard let connection = factory.peerConnection(
            with: configuration, constraints: constraints, delegate: self
        ) else { throw TalkError.peerConnection }

        let audioSource = factory.audioSource(with: nil)
        let audioTrack = factory.audioTrack(with: audioSource, trackId: "omni-microphone")
        audioTrack.isEnabled = true
        guard connection.add(audioTrack, streamIds: ["omni-talk"]) != nil else {
            throw TalkError.audioTrack
        }

        let channelConfiguration = RTCDataChannelConfiguration()
        channelConfiguration.isOrdered = true
        guard let channel = connection.dataChannel(
            forLabel: session.realtime.dataChannel,
            configuration: channelConfiguration
        ) else { throw TalkError.dataChannel }
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
            RTCSessionDescription(type: .answer, sdp: answer), on: connection
        )
        NSLog("OMNI_WEBRTC remote SDP accepted")
    }

    private func offer(for connection: RTCPeerConnection) async throws -> RTCSessionDescription {
        try await withCheckedThrowingContinuation { (c: CheckedContinuation<RTCSessionDescription, Error>) in
            let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
            connection.offer(for: constraints) { offer, error in
                if let error { c.resume(throwing: error) }
                else if let offer { c.resume(returning: offer) }
                else { c.resume(throwing: TalkError.missingSDP) }
            }
        }
    }

    private func setLocalDescription(_ d: RTCSessionDescription, on connection: RTCPeerConnection) async throws {
        try await withCheckedThrowingContinuation { (c: CheckedContinuation<Void, Error>) in
            connection.setLocalDescription(d) { error in
                if let error { c.resume(throwing: error) } else { c.resume(returning: ()) }
            }
        }
    }

    private func setRemoteDescription(_ d: RTCSessionDescription, on connection: RTCPeerConnection) async throws {
        try await withCheckedThrowingContinuation { (c: CheckedContinuation<Void, Error>) in
            connection.setRemoteDescription(d) { error in
                if let error { c.resume(throwing: error) } else { c.resume(returning: ()) }
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
        guard let http = response as? HTTPURLResponse else { throw TalkError.invalidSDPResponse }
        guard (200..<300).contains(http.statusCode) else {
            throw TalkError.sdpExchange(http.statusCode, String(data: data, encoding: .utf8) ?? "")
        }
        guard let answer = String(data: data, encoding: .utf8), !answer.isEmpty else {
            throw TalkError.invalidSDPResponse
        }
        return answer
    }

    // MARK: Realtime events

    private func handleEvent(_ text: String) {
        guard
            let data = text.data(using: .utf8),
            let event = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let type = event["type"] as? String
        else { return }

        switch type {
        case "response.created":
            phase = .speaking
            status = "Tutor"
        case "response.done":
            if phase != .ended { phase = .listening; status = "Listening" }
        case "conversation.item.input_audio_transcription.completed":
            if let t = event["transcript"] as? String { appendTranscript(role: "user", text: t) }
        case "response.audio_transcript.done", "response.output_audio_transcript.done":
            if let t = event["transcript"] as? String { appendTranscript(role: "assistant", text: t) }
        case "error":
            let message = ((event["error"] as? [String: Any])?["message"] as? String) ?? "Realtime error"
            status = message
            NSLog("OMNI_EVENT_ERROR %@", message)
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
        ])
        if role == "user" { lastUserLine = trimmed } else { lastTutorLine = trimmed }
    }

    private func sendEvent(_ object: [String: Any]) {
        guard
            let channel = dataChannel,
            channel.readyState == .open,
            let data = try? JSONSerialization.data(withJSONObject: object)
        else { return }
        if !channel.sendData(RTCDataBuffer(data: data, isBinary: false)) {
            NSLog("OMNI_DATA_CHANNEL_SEND_ERROR")
        }
    }

    /// The tutor speaks first: fire one response.create as soon as the
    /// events channel opens, so the session opens with the greeting.
    private func openConversationIfNeeded() {
        guard !openedConversation else { return }
        openedConversation = true
        sendEvent(["type": "response.create"])
        NSLog("OMNI_OPENING response.create sent")
    }

    private func cleanup() {
        connectTimeoutTask?.cancel()
        connectTimeoutTask = nil
        dataChannel?.delegate = nil
        dataChannel?.close()
        dataChannel = nil
        localAudioTrack?.isEnabled = false
        localAudioTrack = nil
        peerConnection?.close()
        peerConnection = nil
        peerConnectionFactory = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
    }

    enum TalkError: LocalizedError {
        case peerConnection, audioTrack, dataChannel, missingSDP, invalidSDPResponse
        case sdpExchange(Int, String)

        var errorDescription: String? {
            switch self {
            case .peerConnection: return "Couldn't create the voice connection."
            case .audioTrack: return "Couldn't connect the microphone."
            case .dataChannel: return "Couldn't open the event channel."
            case .missingSDP: return "Couldn't create a connection offer."
            case .invalidSDPResponse: return "OpenAI returned an invalid connection response."
            case .sdpExchange(let status, let message):
                return "Voice connection failed (\(status)): \(message.prefix(200))"
            }
        }
    }
}

extension VoiceClient: RTCDataChannelDelegate {
    nonisolated func dataChannelDidChangeState(_ dataChannel: RTCDataChannel) {
        let state = dataChannel.readyState
        Task { @MainActor in
            NSLog("OMNI_DATA_CHANNEL state=%ld", state.rawValue)
            if state == .open { self.openConversationIfNeeded() }
        }
    }

    nonisolated func dataChannel(_ dataChannel: RTCDataChannel, didReceiveMessageWith buffer: RTCDataBuffer) {
        guard let text = String(data: buffer.data, encoding: .utf8) else { return }
        Task { @MainActor in self.handleEvent(text) }
    }
}

extension VoiceClient: RTCPeerConnectionDelegate {
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {
        for audioTrack in stream.audioTracks { audioTrack.isEnabled = true }
        Task { @MainActor in NSLog("OMNI_WEBRTC remote audio stream added") }
    }

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}
    nonisolated func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {
        Task { @MainActor in NSLog("OMNI_ICE state=%ld", newState.rawValue) }
    }

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {}
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {}
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {
        dataChannel.delegate = self
    }

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCPeerConnectionState) {
        Task { @MainActor in
            NSLog("OMNI_CONNECTION state=%ld", newState.rawValue)
            switch newState {
            case .connected:
                if self.phase == .connecting {
                    self.phase = .listening
                    self.status = "Connected"
                }
            case .failed:
                if self.phase != .ended {
                    self.phase = .failed("Voice connection lost.")
                    self.status = "Disconnected"
                }
            case .disconnected:
                if self.phase != .ended { self.status = "Reconnecting…" }
            default:
                break
            }
        }
    }
}
