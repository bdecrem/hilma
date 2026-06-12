@preconcurrency import AVFoundation
import Foundation
import Observation
@preconcurrency import WebRTC

/// The walk engine: one WebRTC connection to OpenAI Realtime, driven by the
/// /api/f4/walk backend. Adapted from Feynd's RealtimeVoiceClient with three
/// Peri-specific behaviors:
///   1. Peri speaks first — `response.create` is sent the moment the
///      oai-events channel opens, so the walk starts with the agenda.
///   2. Live captions — the latest user/assistant transcript lines publish
///      to the UI for glances.
///   3. Review tallies — record_review tool calls are parsed client-side so
///      the screen can show solid/shaky/forgot counts without polling.
@MainActor
@Observable
final class WalkClient: NSObject {
    enum Phase: Equatable {
        case idle
        case requestingPermission
        case creatingSession
        case connecting
        case listening      // connected, user's turn / silence
        case speaking       // Peri is talking
        case failed(String)
        case ended
    }

    private(set) var phase: Phase = .idle
    private(set) var status = "Ready"

    /// Latest line of each side, for the glanceable captions.
    private(set) var lastUserLine = ""
    private(set) var lastPeriLine = ""

    /// record_review tallies this walk: [forgot, shaky, solid].
    private(set) var tally = [0, 0, 0]
    private(set) var agendaDue = 0

    private var sessionResponse: API.WalkSessionResponse?
    private var peerConnectionFactory: RTCPeerConnectionFactory?
    private var peerConnection: RTCPeerConnection?
    private var localAudioTrack: RTCAudioTrack?
    private var dataChannel: RTCDataChannel?
    private var transcript: [[String: String]] = []
    private var handledToolCallIds: Set<String> = []
    private var openedConversation = false

    var reviewedCount: Int { tally.reduce(0, +) }

    func start() async {
        guard phase == .idle || phase == .ended else { return }
        transcript = []
        tally = [0, 0, 0]
        handledToolCallIds = []
        openedConversation = false
        lastUserLine = ""
        lastPeriLine = ""
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
            status = "Waking Peri…"
            let session = try await API.shared.startWalkSession()
            sessionResponse = session
            agendaDue = session.agenda.dueCount

            phase = .connecting
            status = "Connecting…"
            try await connectWebRTC(session)
        } catch {
            cleanup()
            phase = .failed(error.localizedDescription)
            status = "Couldn't start the walk"
        }
    }

    func stop() {
        Task { await finishSession() }
        cleanup()
        phase = .ended
        status = "Walk ended"
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

    // MARK: WebRTC (same handshake as Feynd — offer → /v1/realtime/calls → answer)

    private func connectWebRTC(_ session: API.WalkSessionResponse) async throws {
        let factory = RTCPeerConnectionFactory()
        let configuration = RTCConfiguration()
        configuration.sdpSemantics = .unifiedPlan
        configuration.continualGatheringPolicy = .gatherContinually
        let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)

        guard let connection = factory.peerConnection(
            with: configuration, constraints: constraints, delegate: self
        ) else { throw WalkError.peerConnection }

        let audioSource = factory.audioSource(with: nil)
        let audioTrack = factory.audioTrack(with: audioSource, trackId: "peri-microphone")
        audioTrack.isEnabled = true
        guard connection.add(audioTrack, streamIds: ["peri-walk"]) != nil else {
            throw WalkError.audioTrack
        }

        let channelConfiguration = RTCDataChannelConfiguration()
        channelConfiguration.isOrdered = true
        guard let channel = connection.dataChannel(
            forLabel: session.realtime.dataChannel,
            configuration: channelConfiguration
        ) else { throw WalkError.dataChannel }
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
        NSLog("PERI_WEBRTC remote SDP accepted")
    }

    private func offer(for connection: RTCPeerConnection) async throws -> RTCSessionDescription {
        try await withCheckedThrowingContinuation { (c: CheckedContinuation<RTCSessionDescription, Error>) in
            let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
            connection.offer(for: constraints) { offer, error in
                if let error { c.resume(throwing: error) }
                else if let offer { c.resume(returning: offer) }
                else { c.resume(throwing: WalkError.missingSDP) }
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
        guard let http = response as? HTTPURLResponse else { throw WalkError.invalidSDPResponse }
        guard (200..<300).contains(http.statusCode) else {
            throw WalkError.sdpExchange(http.statusCode, String(data: data, encoding: .utf8) ?? "")
        }
        guard let answer = String(data: data, encoding: .utf8), !answer.isEmpty else {
            throw WalkError.invalidSDPResponse
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
            status = "Peri"
        case "response.done":
            if phase != .ended { phase = .listening; status = "Listening" }
        case "conversation.item.input_audio_transcription.completed":
            if let t = event["transcript"] as? String { appendTranscript(role: "user", text: t) }
        case "response.audio_transcript.done", "response.output_audio_transcript.done":
            if let t = event["transcript"] as? String { appendTranscript(role: "assistant", text: t) }
        case "response.function_call_arguments.done":
            if let callId = event["call_id"] as? String,
               let name = event["name"] as? String,
               let args = event["arguments"] as? String {
                runTool(callId: callId, name: name, argumentsJSON: args)
            }
        case "response.output_item.done":
            if let item = event["item"] as? [String: Any],
               item["type"] as? String == "function_call",
               let callId = item["call_id"] as? String,
               let name = item["name"] as? String,
               let args = item["arguments"] as? String {
                runTool(callId: callId, name: name, argumentsJSON: args)
            }
        case "error":
            let message = ((event["error"] as? [String: Any])?["message"] as? String) ?? "Realtime error"
            status = message
            NSLog("PERI_EVENT_ERROR %@", message)
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
            "created_at": ISO8601DateFormatter().string(from: Date()),
        ])
        if role == "user" { lastUserLine = trimmed } else { lastPeriLine = trimmed }
    }

    private func runTool(callId: String, name: String, argumentsJSON: String) {
        guard !handledToolCallIds.contains(callId) else { return }
        handledToolCallIds.insert(callId)

        Task {
            let output: String
            do {
                let data = try await API.shared.callWalkTool(name: name, argumentsJSON: argumentsJSON)
                output = String(data: data, encoding: .utf8) ?? "{}"
                if name == "record_review" { noteReview(argumentsJSON) }
            } catch {
                output = #"{"error":"\#(error.localizedDescription)"}"#
            }
            sendEvent([
                "type": "conversation.item.create",
                "item": ["type": "function_call_output", "call_id": callId, "output": output],
            ])
            sendEvent(["type": "response.create"])
        }
    }

    /// Keep the on-screen tally in sync with what the model just recorded.
    private func noteReview(_ argumentsJSON: String) {
        guard
            let data = argumentsJSON.data(using: .utf8),
            let args = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return }
        let grade = (args["grade"] as? NSNumber)?.intValue ?? -1
        if (0...2).contains(grade) { tally[grade] += 1 }
    }

    private func sendEvent(_ object: [String: Any]) {
        guard
            let channel = dataChannel,
            channel.readyState == .open,
            let data = try? JSONSerialization.data(withJSONObject: object)
        else { return }
        if !channel.sendData(RTCDataBuffer(data: data, isBinary: false)) {
            NSLog("PERI_DATA_CHANNEL_SEND_ERROR")
        }
    }

    /// Peri speaks first: fire one response.create as soon as the events
    /// channel opens, so the model delivers the OPEN step of the session arc.
    private func openConversationIfNeeded() {
        guard !openedConversation else { return }
        openedConversation = true
        sendEvent(["type": "response.create"])
        NSLog("PERI_OPENING response.create sent")
    }

    // MARK: Finish

    private func finishSession() async {
        guard let id = sessionResponse?.voiceSession.id else { return }
        let summary = "Walk: \(reviewedCount) ideas reviewed (\(tally[2]) solid, \(tally[1]) shaky, \(tally[0]) forgot)."
        try? await API.shared.finishWalkSession(
            id: id,
            transcript: transcript,
            summary: transcript.isEmpty ? nil : summary
        )
    }

    private func cleanup() {
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

    enum WalkError: LocalizedError {
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

extension WalkClient: RTCDataChannelDelegate {
    nonisolated func dataChannelDidChangeState(_ dataChannel: RTCDataChannel) {
        let state = dataChannel.readyState
        Task { @MainActor in
            NSLog("PERI_DATA_CHANNEL state=%ld", state.rawValue)
            if state == .open { self.openConversationIfNeeded() }
        }
    }

    nonisolated func dataChannel(_ dataChannel: RTCDataChannel, didReceiveMessageWith buffer: RTCDataBuffer) {
        guard let text = String(data: buffer.data, encoding: .utf8) else { return }
        Task { @MainActor in self.handleEvent(text) }
    }
}

extension WalkClient: RTCPeerConnectionDelegate {
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {
        for audioTrack in stream.audioTracks { audioTrack.isEnabled = true }
        Task { @MainActor in NSLog("PERI_WEBRTC remote audio stream added") }
    }

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}
    nonisolated func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {
        Task { @MainActor in NSLog("PERI_ICE state=%ld", newState.rawValue) }
    }

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {}
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {}
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {
        dataChannel.delegate = self
    }

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCPeerConnectionState) {
        Task { @MainActor in
            NSLog("PERI_CONNECTION state=%ld", newState.rawValue)
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
