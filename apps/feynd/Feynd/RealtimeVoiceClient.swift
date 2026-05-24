@preconcurrency import AVFoundation
import Foundation
import Observation

@MainActor
@Observable
final class RealtimeVoiceClient: NSObject, AVAudioPlayerDelegate {
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

    private var sessionResponse: F2API.RealtimeSessionResponse?
    private var urlSession: URLSession!
    private var webSocket: URLSessionWebSocketTask?
    private var audioEngine: AVAudioEngine?
    private var audioConverter: AVAudioConverter?
    private var audioPlayer: AVAudioPlayer?
    private var playbackQueue: [Data] = []
    private var playbackPrimed = false
    private var playbackResponseDone = false
    private var playbackPrimeTask: Task<Void, Never>?
    private var transcript: [[String: String]] = []
    private var handledToolCallIds: Set<String> = []

    private let targetSampleRate: Double = 24_000
    private let playbackPrimeChunkCount = 4
    private let playbackPrimeDelayNanos: UInt64 = 450_000_000

    init(mode: String, threadId: String? = nil) {
        self.mode = mode
        self.threadId = threadId
        super.init()
        self.urlSession = URLSession(configuration: .default)
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

            phase = .creatingSession
            status = "Creating Realtime session..."
            let session = try await F2API.shared.startRealtimeSession(mode: mode, threadId: threadId)
            self.sessionResponse = session
            self.model = session.realtime.model
            self.voice = session.realtime.voice

            phase = .connecting
            status = "Connecting audio..."
            try connectWebSocket(session)
            startReceiveLoop()
            try startMicStreaming()

            phase = .connected
            status = "Connected"
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
            options: [.defaultToSpeaker, .allowBluetoothHFP, .allowAirPlay]
        )
        try session.setActive(true, options: [.notifyOthersOnDeactivation])
    }

    private func connectWebSocket(_ session: F2API.RealtimeSessionResponse) throws {
        var components = URLComponents(string: "wss://api.openai.com/v1/realtime")!
        components.queryItems = [URLQueryItem(name: "model", value: session.realtime.model)]
        guard let url = components.url else { throw VoiceError.invalidURL }

        var req = URLRequest(url: url)
        req.setValue("Bearer \(session.clientSecret.value)", forHTTPHeaderField: "Authorization")
        let task = urlSession.webSocketTask(with: req)
        webSocket = task
        task.resume()
    }

    private func startReceiveLoop() {
        Task { [weak self] in
            while let self, let ws = self.webSocket {
                do {
                    let message = try await ws.receive()
                    switch message {
                    case .string(let text):
                        self.handleEvent(text)
                    case .data(let data):
                        if let text = String(data: data, encoding: .utf8) {
                            self.handleEvent(text)
                        }
                    @unknown default:
                        break
                    }
                } catch {
                    await MainActor.run {
                        if self.phase != .ended {
                            self.phase = .failed(error.localizedDescription)
                            self.status = "Realtime disconnected"
                        }
                    }
                    break
                }
            }
        }
    }

    private func startMicStreaming() throws {
        let engine = AVAudioEngine()
        let input = engine.inputNode
        let inputFormat = input.outputFormat(forBus: 0)
        guard let outputFormat = AVAudioFormat(
            commonFormat: .pcmFormatInt16,
            sampleRate: targetSampleRate,
            channels: 1,
            interleaved: true
        ) else {
            throw VoiceError.audioFormat
        }

        let converter = AVAudioConverter(from: inputFormat, to: outputFormat)
        self.audioEngine = engine
        self.audioConverter = converter

        input.installTap(onBus: 0, bufferSize: 2048, format: inputFormat) { [weak self] buffer, _ in
            guard let self else { return }
            Task { @MainActor in
                self.sendAudioBuffer(buffer, inputFormat: inputFormat, outputFormat: outputFormat)
            }
        }

        engine.prepare()
        try engine.start()
    }

    private func sendAudioBuffer(_ buffer: AVAudioPCMBuffer, inputFormat: AVAudioFormat, outputFormat: AVAudioFormat) {
        guard let converter = audioConverter else { return }
        let ratio = outputFormat.sampleRate / inputFormat.sampleRate
        let frameCapacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 8
        guard let converted = AVAudioPCMBuffer(pcmFormat: outputFormat, frameCapacity: frameCapacity) else { return }

        var error: NSError?
        var consumed = false
        converter.convert(to: converted, error: &error) { _, outStatus in
            if consumed {
                outStatus.pointee = .noDataNow
                return nil
            }
            consumed = true
            outStatus.pointee = .haveData
            return buffer
        }
        guard error == nil, converted.frameLength > 0 else { return }
        guard let data = pcm16Data(from: converted) else { return }
        let base64 = data.base64EncodedString()
        sendEvent([
            "type": "input_audio_buffer.append",
            "audio": base64
        ])
    }

    private func pcm16Data(from buffer: AVAudioPCMBuffer) -> Data? {
        let frames = Int(buffer.frameLength)
        guard frames > 0, let channelData = buffer.int16ChannelData else { return nil }
        return Data(bytes: channelData[0], count: frames * MemoryLayout<Int16>.size)
    }

    private func handleEvent(_ text: String) {
        guard
            let data = text.data(using: .utf8),
            let event = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let type = event["type"] as? String
        else { return }

        switch type {
        case "response.audio.delta", "response.output_audio.delta":
            if let audio = event["delta"] as? String,
               let data = Data(base64Encoded: audio) {
                enqueueAudio(data)
            }
        case "response.done":
            playbackResponseDone = true
            tryStartPlayback()
            if playbackQueue.isEmpty && audioPlayer == nil {
                phase = .connected
                status = "Connected"
            }
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
        default:
            break
        }
    }

    private func enqueueAudio(_ pcm: Data) {
        playbackQueue.append(wavData(fromPCM16: pcm, sampleRate: Int(targetSampleRate), channels: 1))
        schedulePlaybackPrimeFallback()
        tryStartPlayback()
    }

    private func schedulePlaybackPrimeFallback() {
        guard !playbackPrimed, audioPlayer == nil, playbackPrimeTask == nil else { return }
        let delay = playbackPrimeDelayNanos
        playbackPrimeTask = Task { [weak self] in
            do {
                try await Task.sleep(nanoseconds: delay)
            } catch {
                return
            }
            await MainActor.run {
                guard let self else { return }
                self.playbackPrimeTask = nil
                self.tryStartPlayback(force: true)
            }
        }
    }

    private func tryStartPlayback(force: Bool = false) {
        guard audioPlayer == nil, !playbackQueue.isEmpty else { return }

        if !playbackPrimed {
            let hasEnoughBuffer = playbackQueue.count >= playbackPrimeChunkCount
            guard force || playbackResponseDone || hasEnoughBuffer else { return }
            playbackPrimed = true
            playbackPrimeTask?.cancel()
            playbackPrimeTask = nil
        }

        playNextAudio()
    }

    private func playNextAudio() {
        guard !playbackQueue.isEmpty else {
            audioPlayer = nil
            playbackPrimed = false
            playbackResponseDone = false
            phase = .connected
            status = "Connected"
            return
        }
        let data = playbackQueue.removeFirst()
        do {
            let player = try AVAudioPlayer(data: data)
            player.delegate = self
            audioPlayer = player
            phase = .speaking
            status = "Speaking"
            player.prepareToPlay()
            player.play()
        } catch {
            audioPlayer = nil
            phase = .connected
            status = "Connected"
        }
    }

    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            self.audioPlayer = nil
            self.playNextAudio()
        }
    }

    private func wavData(fromPCM16 pcm: Data, sampleRate: Int, channels: Int) -> Data {
        var data = Data()
        let byteRate = sampleRate * channels * 2
        let blockAlign = channels * 2
        data.append("RIFF".data(using: .ascii)!)
        data.append(UInt32(36 + pcm.count).littleEndianData)
        data.append("WAVEfmt ".data(using: .ascii)!)
        data.append(UInt32(16).littleEndianData)
        data.append(UInt16(1).littleEndianData)
        data.append(UInt16(channels).littleEndianData)
        data.append(UInt32(sampleRate).littleEndianData)
        data.append(UInt32(byteRate).littleEndianData)
        data.append(UInt16(blockAlign).littleEndianData)
        data.append(UInt16(16).littleEndianData)
        data.append("data".data(using: .ascii)!)
        data.append(UInt32(pcm.count).littleEndianData)
        data.append(pcm)
        return data
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
            let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return [:] }
        var result: [String: String] = [:]
        for (key, value) in obj {
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
        guard let data = try? JSONSerialization.data(withJSONObject: object),
              let text = String(data: data, encoding: .utf8) else { return }
        webSocket?.send(.string(text)) { error in
            if let error {
                NSLog("F2_REALTIME_SEND_ERROR \(error.localizedDescription)")
            }
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

    private func cleanup() {
        audioEngine?.inputNode.removeTap(onBus: 0)
        audioEngine?.stop()
        audioEngine = nil
        audioConverter = nil
        audioPlayer?.stop()
        audioPlayer = nil
        playbackQueue.removeAll()
        playbackPrimed = false
        playbackResponseDone = false
        playbackPrimeTask?.cancel()
        playbackPrimeTask = nil
        webSocket?.cancel(with: .goingAway, reason: nil)
        webSocket = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
    }

    enum VoiceError: LocalizedError {
        case invalidURL
        case audioFormat

        var errorDescription: String? {
            switch self {
            case .invalidURL: return "Couldn't create the Realtime WebSocket URL."
            case .audioFormat: return "Couldn't configure microphone audio."
            }
        }
    }
}

private extension FixedWidthInteger {
    var littleEndianData: Data {
        var value = self.littleEndian
        return Data(bytes: &value, count: MemoryLayout<Self>.size)
    }
}
