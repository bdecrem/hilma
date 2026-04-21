import AVFoundation
import Foundation
import Observation

// Plays text through a short-lived OpenAI Realtime session so the voice
// is literally the SAME as voice-mode Realtime (same gpt-realtime model,
// same voice name). This replaces the /v1/audio/speech route for Listen
// — that endpoint is a different synthesis model that sounds different
// even with the same voice name.
//
// Flow, per Listen tap:
//   1. Mint ephemeral key (same /api/feynd/realtime-session endpoint as
//      voice mode, so voice + model stay in sync).
//   2. Open a fresh WebSocket to wss://api.openai.com/v1/realtime.
//   3. session.update — tell the model to read user text aloud verbatim,
//      strip markdown, no tools, no turn-detection.
//   4. conversation.item.create — user message = the text to speak.
//   5. response.create — model emits PCM16 audio chunks.
//   6. Stream-play the chunks via AVAudioPlayer segment-chaining (same
//      approach RealtimeClient uses for voice mode).

@MainActor
@Observable
final class TTSPlayer: NSObject {
    enum State: Equatable {
        case idle
        case preparing
        case speaking
        case failed(String)
    }

    private(set) var state: State = .idle
    /// The message id currently being spoken (nil when idle/failed).
    private(set) var currentMessageId: String? = nil

    private var urlSession: URLSession!
    private var webSocket: URLSessionWebSocketTask?
    private var receiveTask: Task<Void, Never>? = nil

    // Playback pipeline (PCM16 @ 24 kHz → WAV → AVAudioPlayer chaining).
    private var audioBuffer = Data()
    private var playedBytes = 0
    private var audioPlayer: AVAudioPlayer?
    private var isReceivingAudio = false
    private let targetSampleRate: Double = 24_000
    private let startThresholdSec: Double = 0.6
    private let minFollowupSegmentSec: Double = 0.8

    override init() {
        super.init()
        let cfg = URLSessionConfiguration.default
        self.urlSession = URLSession(configuration: cfg, delegate: nil, delegateQueue: nil)
    }

    // MARK: - Public API

    func speak(_ text: String, messageId: String) async {
        await stop()
        currentMessageId = messageId
        state = .preparing
        do {
            try configureAudioSession()
            let key = try await mintEphemeralKey()
            try connectWebSocket(ephemeralKey: key)
            startReceiveLoop()
            try sendSessionUpdate()
            try sendTextToSpeak(text)
            state = .speaking
        } catch {
            state = .failed(String(describing: error))
            await stop(preserveFailure: true)
        }
    }

    func stop(preserveFailure: Bool = false) async {
        receiveTask?.cancel()
        receiveTask = nil
        webSocket?.cancel(with: .goingAway, reason: nil)
        webSocket = nil
        audioPlayer?.stop()
        audioPlayer = nil
        audioBuffer.removeAll(keepingCapacity: false)
        playedBytes = 0
        isReceivingAudio = false
        if !preserveFailure {
            state = .idle
            currentMessageId = nil
        }
    }

    // MARK: - Audio session

    private func configureAudioSession() throws {
        let s = AVAudioSession.sharedInstance()
        try s.setCategory(.playback, mode: .spokenAudio, options: [])
        try s.setActive(true, options: [.notifyOthersOnDeactivation])
    }

    // MARK: - Ephemeral key

    private func mintEphemeralKey() async throws -> String {
        let url = Secrets.backendBaseURL.appendingPathComponent("api/feynd/realtime-session")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue(Secrets.backendSecret, forHTTPHeaderField: "x-feynd-secret")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: [
            "instructions": ttsInstructions,
            "voice": "echo"
        ])
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode),
              let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let value = json["value"] as? String else {
            let snippet = String(data: data, encoding: .utf8) ?? ""
            throw NSError(domain: "feynd.tts", code: -1, userInfo: [NSLocalizedDescriptionKey: "key mint failed: \(snippet)"])
        }
        return value
    }

    // MARK: - WebSocket

    private func connectWebSocket(ephemeralKey: String) throws {
        let url = URL(string: "wss://api.openai.com/v1/realtime?model=gpt-realtime")!
        var req = URLRequest(url: url)
        req.setValue("Bearer \(ephemeralKey)", forHTTPHeaderField: "Authorization")
        let task = urlSession.webSocketTask(with: req)
        self.webSocket = task
        task.resume()
    }

    private func sendJSON(_ obj: [String: Any]) throws {
        let data = try JSONSerialization.data(withJSONObject: obj)
        guard let text = String(data: data, encoding: .utf8), let ws = webSocket else {
            throw NSError(domain: "feynd.tts", code: -2)
        }
        ws.send(.string(text)) { err in
            if let err { NSLog("FEYND_TTS_SEND_ERR \(err)") }
        }
    }

    private let ttsInstructions = """
    Read aloud exactly what the user sends you, verbatim. Do not \
    paraphrase, shorten, summarize, add commentary, or role-play. Treat \
    markdown syntax (asterisks, backticks, leading dashes, hashes) as \
    formatting only — do not speak the symbols; speak the content as \
    natural prose. Do not call any tools. Speak at a natural, engaged \
    pace — warm, curious.
    """

    private func sendSessionUpdate() throws {
        try sendJSON([
            "type": "session.update",
            "session": [
                "type": "realtime",
                "model": "gpt-realtime",
                "instructions": ttsInstructions,
                "audio": [
                    "output": ["voice": "echo"]
                ],
                "tools": [],
                "tool_choice": "none"
            ]
        ])
    }

    private func sendTextToSpeak(_ text: String) throws {
        try sendJSON([
            "type": "conversation.item.create",
            "item": [
                "type": "message",
                "role": "user",
                "content": [
                    ["type": "input_text", "text": text]
                ]
            ]
        ])
        try sendJSON(["type": "response.create"])
    }

    // MARK: - Receive loop

    private func startReceiveLoop() {
        receiveTask?.cancel()
        receiveTask = Task { [weak self] in
            while let self, let ws = await self.webSocket {
                if Task.isCancelled { break }
                do {
                    let msg = try await ws.receive()
                    switch msg {
                    case .string(let s):
                        await self.handleEvent(s)
                    case .data(let d):
                        if let s = String(data: d, encoding: .utf8) {
                            await self.handleEvent(s)
                        }
                    @unknown default:
                        break
                    }
                } catch {
                    break
                }
            }
        }
    }

    private func handleEvent(_ text: String) async {
        guard let data = text.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = obj["type"] as? String else { return }

        switch type {
        case "response.output_audio.delta", "response.audio.delta":
            if let b64 = obj["delta"] as? String,
               let audio = Data(base64Encoded: b64) {
                await MainActor.run { self.handleAudioDelta(audio) }
            }
        case "response.output_audio.done", "response.audio.done":
            await MainActor.run {
                self.isReceivingAudio = false
                // Flush any tail the streaming threshold held back.
                if self.audioPlayer == nil && self.audioBuffer.count > self.playedBytes {
                    self.startPlayback()
                }
            }
        case "response.done", "response.cancelled":
            // Model is done generating. Close the socket; playback continues
            // until audioPlayerDidFinishPlaying drains the buffer.
            webSocket?.cancel(with: .normalClosure, reason: nil)
            webSocket = nil
        case "error":
            let msg = (obj["error"] as? [String: Any])?["message"] as? String ?? "Realtime error"
            await MainActor.run {
                self.state = .failed(msg)
            }
        default:
            break
        }
    }

    // MARK: - Playback

    private func handleAudioDelta(_ data: Data) {
        audioBuffer.append(data)
        isReceivingAudio = true
        let buffered = Double(audioBuffer.count) / (targetSampleRate * 2.0)
        if state == .preparing { state = .speaking }
        if audioPlayer == nil && buffered >= startThresholdSec {
            startPlayback()
        }
    }

    private func startPlayback() {
        let total = audioBuffer.count
        let available = total - playedBytes
        guard available > 0 else { return }
        let evenBytes = available - (available % 2)
        guard evenBytes > 0 else { return }

        let seconds = Double(evenBytes) / (targetSampleRate * 2.0)
        if isReceivingAudio && seconds < minFollowupSegmentSec { return }

        let pcm = audioBuffer.subdata(in: playedBytes..<(playedBytes + evenBytes))
        let wav = makeWAV(pcm: pcm, sampleRate: UInt32(targetSampleRate))
        do {
            let player = try AVAudioPlayer(data: wav)
            player.delegate = self
            player.prepareToPlay()
            player.play()
            self.audioPlayer = player
            self.playedBytes += evenBytes
        } catch {
            NSLog("FEYND_TTS_PLAYER_ERR \(error)")
        }
    }

    private func makeWAV(pcm: Data, sampleRate: UInt32) -> Data {
        var w = Data()
        let dataSize = UInt32(pcm.count)
        let fileSize = UInt32(36) + dataSize
        let byteRate = sampleRate * 2   // mono, 16-bit
        func u32(_ v: UInt32) -> Data { withUnsafeBytes(of: v.littleEndian) { Data($0) } }
        func u16(_ v: UInt16) -> Data { withUnsafeBytes(of: v.littleEndian) { Data($0) } }
        w.append("RIFF".data(using: .ascii)!)
        w.append(u32(fileSize))
        w.append("WAVE".data(using: .ascii)!)
        w.append("fmt ".data(using: .ascii)!)
        w.append(u32(16))
        w.append(u16(1))          // PCM
        w.append(u16(1))          // mono
        w.append(u32(sampleRate))
        w.append(u32(byteRate))
        w.append(u16(2))          // block align
        w.append(u16(16))         // bits per sample
        w.append("data".data(using: .ascii)!)
        w.append(u32(dataSize))
        w.append(pcm)
        return w
    }
}

extension TTSPlayer: @preconcurrency AVAudioPlayerDelegate {
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            self.audioPlayer = nil
            let hasMore = self.audioBuffer.count > self.playedBytes
            if hasMore {
                try? await Task.sleep(nanoseconds: 40_000_000)
                self.startPlayback()
                return
            }
            if !self.isReceivingAudio {
                self.state = .idle
                self.currentMessageId = nil
            }
        }
    }
}
