import AVFoundation
import Foundation
import Observation

// Talks to OpenAI Realtime over a raw WebSocket. Push-to-talk:
//   startRecording() captures mic → PCM16 @ 24kHz
//   stopRecording() commits and asks for a response
//   incoming `response.output_audio.delta` chunks are buffered, wrapped in
//   a WAV header, and played back through AVAudioPlayer in chained segments.
//
// Modelled on the crash app's AudioManager; no WebRTC, no third-party SDKs.

@MainActor
@Observable
final class RealtimeClient: NSObject {
    enum Phase: Equatable {
        case idle
        case fetchingKey
        case connecting
        case ready           // waiting for user to tap mic
        case recording       // capturing user audio
        case processing      // sent commit, waiting for first audio delta
        case speaking        // assistant audio is playing
        case failed(String)
    }

    private(set) var phase: Phase = .idle
    private(set) var lastStatus: String = ""

    // MARK: - WebSocket
    private var urlSession: URLSession!
    private var webSocket: URLSessionWebSocketTask?

    // OpenAI only allows one response per conversation at a time. We track
    // it here so we can preempt (`response.cancel`) before firing a new one
    // — and so we can silently ignore the matching server error if the
    // cancel and the next create cross in flight.
    private var isResponseInFlight: Bool = false

    // MARK: - Mic capture
    private var audioEngine: AVAudioEngine?
    private var capturedFloats: [Float] = []
    private var inputSampleRate: Double = 48_000

    // MARK: - Playback
    private var audioBuffer = Data()
    private var playedBytes = 0
    private var audioPlayer: AVAudioPlayer?
    private var isReceivingAudio = false
    private let targetSampleRate: Double = 24_000
    private let interactiveStartThresholdSec: Double = 1.5
    private let minFollowupSegmentSec: Double = 1.6

    // MARK: - Config
    //
    // Pattern A: Realtime owns the voice interface (ears, mouth, VAD) but
    // delegates substantive reasoning to Claude Opus 4.7 via the `ask_opus`
    // tool. The Realtime model should call the tool for anything factual or
    // in-depth, say a brief filler first so the user knows it's working, and
    // then speak back the returned answer naturally.
    private let systemInstructions = """
    You are Feynd, a friendly and playful voice tutor who can teach anything \
    — physics, history, code, cooking, music, philosophy, whatever the user \
    brings up.

    You are the voice of Feynd, not the brain. For anything substantive — \
    explanations, facts, recommendations, how things work, current events, \
    recent developments — CALL the `ask_opus` tool with the user's question \
    and then speak the returned answer naturally. You may lightly rephrase \
    for spoken flow, but do not invent facts beyond what the tool returns.

    Before calling the tool, say a brief spoken filler like "let me think \
    about that" or "good question — one sec" so the user knows you're working \
    on it. Do not call the tool for small talk, acknowledgements, or simple \
    conversational steering ("yes", "say that again", "louder please", \
    "what's your name") — handle those yourself in two or three sentences.

    Keep spoken replies concrete and conversational. Avoid reading lists or \
    bullet points out loud.
    """

    private let openingLine = "Hey there, what would you like to learn today?"

    // Rolling history we feed Opus so multi-turn questions get context.
    private var opusHistory: [AnthropicClient.Turn] = []
    // De-duplicate tool-call handling; the same call_id can appear across
    // multiple events (arguments.delta, arguments.done, item.done).
    private var handledCallIds: Set<String> = []

    /// When set, every Opus tool call carries this video's transcript as
    /// cached context. Cleared when user leaves the video. Mutate only via
    /// `setVideoContext(_:)` so Realtime is told about the change too.
    private(set) var videoContext: AnthropicClient.VideoContext? = nil

    /// Point the session at a specific video (or clear it). In addition to
    /// wiring the transcript to the Opus tool, this pushes a session.update
    /// to Realtime so the model can resolve pronouns ("it", "this video")
    /// and knows it MUST delegate transcript-level questions to Opus.
    func setVideoContext(_ ctx: AnthropicClient.VideoContext?) {
        self.videoContext = ctx
        let instr = ctx.map(videoScopedInstructions(for:)) ?? systemInstructions
        // GA requires `session.type` on every session.update — even partial
        // ones that only change a single field.
        try? sendJSON([
            "type": "session.update",
            "session": [
                "type": "realtime",
                "instructions": instr
            ]
        ])
    }

    private func videoScopedInstructions(for ctx: AnthropicClient.VideoContext) -> String {
        let hostBit = ctx.host.isEmpty ? "" : " (with \(ctx.host))"
        return """
        \(systemInstructions)

        CURRENT STUDY VIDEO:
          Title:     "\(ctx.title)"
          Author:    \(ctx.author)\(hostBit)
          Published: \(ctx.publishedOn)

        The user tapped "Ask Feynd" on this video. When they say "it", \
        "this", "the video", or ask you to "summarize", "recap", "explain", \
        or "quote" anything, they mean THIS video. You do NOT have the \
        transcript yourself — Opus does. For ANY question that needs the \
        actual content of the video (summary, themes, specifics, what the \
        speaker said or argued), you MUST call the `ask_opus` tool. Do not \
        invent content from the video under any circumstances. If the user \
        asks something that is obviously not about this video, answer it \
        normally.
        """
    }

    override init() {
        super.init()
        let cfg = URLSessionConfiguration.default
        self.urlSession = URLSession(configuration: cfg, delegate: nil, delegateQueue: nil)
    }

    // MARK: - Lifecycle

    func start() async {
        guard phase == .idle else { return }
        do {
            try configureAudioSession()
            phase = .fetchingKey
            lastStatus = "Minting key…"
            let key = try await mintEphemeralKey()
            phase = .connecting
            lastStatus = "Connecting to OpenAI…"
            try connectWebSocket(ephemeralKey: key)
            startReceiveLoop()
            try sendSessionUpdate()
            try sendInitialGreeting()
            phase = .ready
            lastStatus = "Tap to talk"
        } catch {
            phase = .failed(String(describing: error))
            lastStatus = ""
        }
    }

    func stop() {
        webSocket?.cancel(with: .goingAway, reason: nil)
        webSocket = nil
        audioPlayer?.stop()
        audioPlayer = nil
        audioEngine?.inputNode.removeTap(onBus: 0)
        audioEngine?.stop()
        audioEngine = nil
    }

    // MARK: - Audio session

    private func configureAudioSession() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(
            .playAndRecord,
            mode: .default,
            options: [.defaultToSpeaker, .allowBluetoothHFP]
        )
        try session.setActive(true, options: [.notifyOthersOnDeactivation])
        try? session.overrideOutputAudioPort(.speaker)
    }

    // MARK: - Backend

    private func mintEphemeralKey() async throws -> String {
        let url = Secrets.backendBaseURL.appendingPathComponent("api/feynd/realtime-session")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue(Secrets.backendSecret, forHTTPHeaderField: "x-feynd-secret")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: [
            "instructions": systemInstructions,
            "voice": "cedar"
        ])
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let snippet = String(data: data, encoding: .utf8) ?? ""
            throw NSError(domain: "feynd.backend", code: (resp as? HTTPURLResponse)?.statusCode ?? -1,
                          userInfo: [NSLocalizedDescriptionKey: snippet])
        }
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let value = json["value"] as? String else {
            throw NSError(domain: "feynd.backend", code: -2,
                          userInfo: [NSLocalizedDescriptionKey: "No ek_ in response"])
        }
        return value
    }

    // MARK: - WebSocket

    private func connectWebSocket(ephemeralKey: String) throws {
        // GA Realtime API — no "OpenAI-Beta" header (that's beta only and will
        // fail auth when combined with a GA ek_ client secret).
        let url = URL(string: "wss://api.openai.com/v1/realtime?model=gpt-realtime")!
        var req = URLRequest(url: url)
        req.setValue("Bearer \(ephemeralKey)", forHTTPHeaderField: "Authorization")
        let task = urlSession.webSocketTask(with: req)
        self.webSocket = task
        task.resume()
    }

    private func startReceiveLoop() {
        Task { [weak self] in
            while let self, let ws = await self.webSocket {
                do {
                    let msg = try await ws.receive()
                    switch msg {
                    case .string(let s):
                        await self.handleEventText(s)
                    case .data(let d):
                        if let s = String(data: d, encoding: .utf8) {
                            await self.handleEventText(s)
                        }
                    @unknown default:
                        break
                    }
                } catch {
                    await MainActor.run {
                        if case .failed = self.phase { return }
                        self.phase = .failed("WebSocket closed: \(error.localizedDescription)")
                    }
                    return
                }
            }
        }
    }

    private func sendJSON(_ object: [String: Any]) throws {
        let data = try JSONSerialization.data(withJSONObject: object)
        guard let text = String(data: data, encoding: .utf8), let ws = webSocket else {
            throw NSError(domain: "feynd.ws", code: -3)
        }
        ws.send(.string(text)) { err in
            if let err { NSLog("FEYND_WS_SEND_ERR \(err)") }
        }
    }

    private func sendSessionUpdate() throws {
        // GA session.update shape. Leaving audio format fields at defaults
        // (PCM16 @ 24kHz mono for both input and output). We also declare
        // the `ask_opus` tool so Realtime can delegate substantive questions
        // to Claude Opus 4.7.
        let tools: [[String: Any]] = [
            [
                "type": "function",
                "name": "ask_opus",
                "description": "Ask Claude Opus 4.7 (the reasoning brain) to answer a substantive question from the user. Use this for any factual, in-depth, or recent-developments topic. The returned text is the authoritative answer — speak it back to the user.",
                "parameters": [
                    "type": "object",
                    "properties": [
                        "question": [
                            "type": "string",
                            "description": "The user's question, rephrased clearly for Opus. Include useful context from earlier in the conversation if it sharpens the question."
                        ]
                    ],
                    "required": ["question"]
                ]
            ]
        ]
        try sendJSON([
            "type": "session.update",
            "session": [
                "type": "realtime",
                "model": "gpt-realtime",
                "instructions": systemInstructions,
                "audio": [
                    "output": ["voice": "cedar"]
                ],
                "tools": tools,
                "tool_choice": "auto"
            ]
        ])
    }

    private func sendInitialGreeting() throws {
        try createResponse(options: [
            "instructions": "Say exactly this, warmly and briefly, then stop and listen: \"\(openingLine)\""
        ])
    }

    /// Safely create a new response. If one is already in flight, cancel it
    /// first so we never trip the "conversation_already_has_active_response"
    /// error on the server. The cancel/create pair may cross on the wire —
    /// the error handler treats that case as a no-op.
    private func createResponse(options: [String: Any]? = nil) throws {
        if isResponseInFlight {
            try? sendJSON(["type": "response.cancel"])
        }
        var ev: [String: Any] = ["type": "response.create"]
        if let options, !options.isEmpty {
            ev["response"] = options
        }
        try sendJSON(ev)
        isResponseInFlight = true
    }

    // MARK: - Recording (push-to-talk)

    func startRecording() {
        guard phase == .ready else { return }
        capturedFloats.removeAll()

        let engine = AVAudioEngine()
        self.audioEngine = engine
        let input = engine.inputNode
        let fmt = input.outputFormat(forBus: 0)
        self.inputSampleRate = fmt.sampleRate
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: fmt) { [weak self] buffer, _ in
            guard let self, let channel = buffer.floatChannelData?[0] else { return }
            let n = Int(buffer.frameLength)
            var slice = [Float](repeating: 0, count: n)
            for i in 0..<n { slice[i] = channel[i] }
            Task { @MainActor in
                self.capturedFloats.append(contentsOf: slice)
            }
        }
        do {
            try engine.start()
            phase = .recording
            lastStatus = "Listening… tap to send"
        } catch {
            phase = .failed("Mic start failed: \(error.localizedDescription)")
        }
    }

    func stopRecordingAndSend() {
        guard phase == .recording else { return }
        audioEngine?.inputNode.removeTap(onBus: 0)
        audioEngine?.stop()
        audioEngine = nil

        guard let base64 = producePCM16Base64(capturedFloats,
                                              fromRate: Float(inputSampleRate),
                                              toRate: Float(targetSampleRate)) else {
            phase = .ready
            lastStatus = "Nothing captured"
            return
        }
        capturedFloats.removeAll(keepingCapacity: false)

        // Reset playback state for the new assistant turn.
        audioBuffer.removeAll(keepingCapacity: false)
        playedBytes = 0
        isReceivingAudio = false

        do {
            try sendJSON(["type": "input_audio_buffer.append", "audio": base64])
            try sendJSON(["type": "input_audio_buffer.commit"])
            try createResponse()
            phase = .processing
            lastStatus = "Thinking…"
        } catch {
            phase = .failed("Send failed: \(error.localizedDescription)")
        }
    }

    // MARK: - Event handling

    private func handleEventText(_ text: String) async {
        guard let data = text.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = obj["type"] as? String else { return }

        switch type {
        case "response.created":
            await MainActor.run { self.isResponseInFlight = true }
        case "response.output_audio.delta", "response.audio.delta":
            if let deltaB64 = obj["delta"] as? String,
               let audio = Data(base64Encoded: deltaB64) {
                await MainActor.run { self.handleAudioDelta(audio) }
            }
        case "response.output_audio.done", "response.audio.done":
            await MainActor.run {
                self.isReceivingAudio = false
                // Flush any tail the streaming threshold held back.
                if self.audioPlayer == nil && self.audioBuffer.count > self.playedBytes {
                    self.startStreamingPlayback()
                }
            }
        case "response.done", "response.cancelled":
            await MainActor.run {
                self.isResponseInFlight = false
                self.isReceivingAudio = false
                if self.audioPlayer == nil && self.audioBuffer.count > self.playedBytes {
                    self.startStreamingPlayback()
                }
            }
        case "response.function_call_arguments.done":
            // Complete tool-call arguments have arrived. Run Opus, submit
            // the result, and ask Realtime to speak it.
            let callId = (obj["call_id"] as? String) ?? ""
            let argsJSON = (obj["arguments"] as? String) ?? "{}"
            let name = (obj["name"] as? String) ?? ""
            if name == "ask_opus" && !callId.isEmpty {
                await handleAskOpus(callId: callId, argsJSON: argsJSON)
            } else if !callId.isEmpty {
                // Unknown tool — return an error so Realtime can recover.
                await submitToolResult(callId: callId,
                                       output: "Unknown tool: \(name)")
            }
        case "error":
            let err = obj["error"] as? [String: Any] ?? [:]
            let code = (err["code"] as? String) ?? ""
            let msg = (err["message"] as? String) ?? "Realtime error"
            // Recoverable: we raced a cancel/create, or tried to cancel a
            // response that was already done. Log and move on — the next
            // response.create will succeed.
            let recoverable = code == "conversation_already_has_active_response"
                || code == "response_cancel_not_active"
                || msg.lowercased().contains("active response")
                || msg.lowercased().contains("no active response")
            if recoverable {
                NSLog("FEYND_WARN \(code): \(msg)")
            } else {
                await MainActor.run {
                    self.phase = .failed(msg)
                }
            }
        default:
            break
        }
    }

    // MARK: - Tool handling (ask_opus)

    private func handleAskOpus(callId: String, argsJSON: String) async {
        // Atomic check-and-insert so repeated events for the same call_id
        // don't trigger a second Opus round-trip.
        let shouldRun: Bool = await MainActor.run {
            if self.handledCallIds.contains(callId) { return false }
            self.handledCallIds.insert(callId)
            return true
        }
        guard shouldRun else { return }

        let question = parseQuestion(argsJSON) ?? ""
        guard !question.isEmpty else {
            await submitToolResult(callId: callId,
                                   output: "No question was provided. Please ask the user to repeat.")
            return
        }

        do {
            let history = await MainActor.run { self.opusHistory }
            let vc = await MainActor.run { self.videoContext }
            let answer = try await AnthropicClient.answer(
                question: question,
                history: history,
                videoContext: vc
            )
            await MainActor.run {
                self.opusHistory.append(.init(role: "user", text: question))
                self.opusHistory.append(.init(role: "assistant", text: answer))
                if self.opusHistory.count > 20 {
                    self.opusHistory.removeFirst(self.opusHistory.count - 20)
                }
            }
            await submitToolResult(callId: callId, output: answer)
        } catch {
            await submitToolResult(
                callId: callId,
                output: "Opus couldn't be reached right now. Tell the user the deep-thinking brain is offline for a moment and suggest trying again."
            )
        }
    }

    private func parseQuestion(_ argsJSON: String) -> String? {
        guard let data = argsJSON.data(using: .utf8) else { return nil }
        let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        let q = (obj?["question"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
        return (q?.isEmpty == false) ? q : nil
    }

    private func submitToolResult(callId: String, output: String) async {
        do {
            try sendJSON([
                "type": "conversation.item.create",
                "item": [
                    "type": "function_call_output",
                    "call_id": callId,
                    "output": output
                ]
            ])
            try createResponse()
        } catch {
            NSLog("FEYND_TOOL_SUBMIT_ERR \(error)")
        }
    }

    // MARK: - Playback

    private func handleAudioDelta(_ data: Data) {
        audioBuffer.append(data)
        isReceivingAudio = true
        let buffered = Double(audioBuffer.count) / (targetSampleRate * 2.0)
        if phase == .processing {
            phase = .speaking
            lastStatus = "Speaking…"
        }
        if audioPlayer == nil && buffered >= interactiveStartThresholdSec {
            startStreamingPlayback()
        }
    }

    private func startStreamingPlayback() {
        let total = audioBuffer.count
        let available = total - playedBytes
        guard available > 0 else { return }
        let evenBytes = available - (available % 2)
        guard evenBytes > 0 else { return }

        let seconds = Double(evenBytes) / (targetSampleRate * 2.0)
        // If more is still streaming, wait for a bigger chunk to avoid stutter.
        if isReceivingAudio && seconds < minFollowupSegmentSec {
            return
        }

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
            NSLog("FEYND_PLAYER_ERR \(error)")
        }
    }

    private func makeWAV(pcm: Data, sampleRate: UInt32) -> Data {
        var w = Data()
        let dataSize = UInt32(pcm.count)
        let fileSize = UInt32(36) + dataSize
        let byteRate = sampleRate * 2 // mono, 16-bit
        func u32(_ v: UInt32) -> Data { withUnsafeBytes(of: v.littleEndian) { Data($0) } }
        func u16(_ v: UInt16) -> Data { withUnsafeBytes(of: v.littleEndian) { Data($0) } }
        w.append("RIFF".data(using: .ascii)!)
        w.append(u32(fileSize))
        w.append("WAVE".data(using: .ascii)!)
        w.append("fmt ".data(using: .ascii)!)
        w.append(u32(16))
        w.append(u16(1))        // PCM
        w.append(u16(1))        // mono
        w.append(u32(sampleRate))
        w.append(u32(byteRate))
        w.append(u16(2))        // block align
        w.append(u16(16))       // bits per sample
        w.append("data".data(using: .ascii)!)
        w.append(u32(dataSize))
        w.append(pcm)
        return w
    }

    // MARK: - Resampling

    private func producePCM16Base64(_ samples: [Float], fromRate: Float, toRate: Float) -> String? {
        guard !samples.isEmpty else { return nil }
        let resampled = resampleLinear(samples, from: fromRate, to: toRate)
        var pcm = Data()
        pcm.reserveCapacity(resampled.count * 2)
        for s in resampled {
            let clamped = max(-1.0, min(1.0, s))
            let v = Int16((clamped * Float(Int16.max)).rounded()).littleEndian
            withUnsafeBytes(of: v) { pcm.append($0.bindMemory(to: UInt8.self)) }
        }
        return pcm.base64EncodedString()
    }

    private func resampleLinear(_ samples: [Float], from: Float, to: Float) -> [Float] {
        guard from > 0, to > 0 else { return samples }
        if abs(from - to) < 0.5 { return samples }
        let ratio = Double(from) / Double(to)
        let outCount = Int(Double(samples.count) / ratio)
        guard outCount > 0 else { return [] }
        var out = [Float](repeating: 0, count: outCount)
        for i in 0..<outCount {
            let srcIdx = Double(i) * ratio
            let lo = Int(srcIdx.rounded(.down))
            let hi = min(lo + 1, samples.count - 1)
            let t = Float(srcIdx - Double(lo))
            out[i] = samples[lo] * (1 - t) + samples[hi] * t
        }
        return out
    }
}

extension RealtimeClient: @preconcurrency AVAudioPlayerDelegate {
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            self.audioPlayer = nil
            let hasMore = self.audioBuffer.count > self.playedBytes
            if hasMore {
                try? await Task.sleep(nanoseconds: 50_000_000)
                self.startStreamingPlayback()
                return
            }
            if !self.isReceivingAudio {
                self.phase = .ready
                self.lastStatus = "Tap to talk"
            }
        }
    }
}
