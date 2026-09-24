import Foundation
import AVFoundation
import Speech
import Observation

/// Hold-to-talk dictation for the composer: press to open the mic, the words
/// stream into `transcript`, release to get the final text. Apple's speech
/// recognizer (server-backed for accuracy; it falls back to on-device when
/// that's all there is).
@Observable
@MainActor
final class VoiceInput {
    private(set) var listening = false
    private(set) var transcript = ""
    /// Set when the mic or speech permission is missing, for an alert.
    var problem: String?

    private let engine = AVAudioEngine()
    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var gotFinal = false
    /// The finger is still down. A release during the permission prompt stops right after start.
    private var wanted = false

    func start() async {
        wanted = true
        guard !listening else { return }
        guard await Self.authorize() else {
            problem = "Token Surfers needs the microphone and speech recognition to hear you. Turn them on in Settings."
            wanted = false
            return
        }
        guard let recognizer, recognizer.isAvailable else {
            problem = "Speech recognition isn't available right now."
            wanted = false
            return
        }
        guard wanted else { return }

        SurfAudio.shared.setRecording(true)
        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = true
        req.addsPunctuation = true
        req.taskHint = .dictation
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else {
            SurfAudio.shared.setRecording(false)
            problem = "No microphone found."
            wanted = false
            return
        }
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in req.append(buffer) }
        engine.prepare()
        do {
            try engine.start()
        } catch {
            input.removeTap(onBus: 0)
            SurfAudio.shared.setRecording(false)
            problem = "The microphone didn't start: \(error.localizedDescription)"
            wanted = false
            return
        }
        request = req
        transcript = ""
        gotFinal = false
        listening = true
        task = recognizer.recognitionTask(with: req) { [weak self] result, error in
            let text = result?.bestTranscription.formattedString
            let final = result?.isFinal ?? false
            Task { @MainActor in
                guard let self else { return }
                if let text, !text.isEmpty { self.transcript = text }
                if final || error != nil { self.gotFinal = true }
            }
        }
        if !wanted { _ = await stop() }
    }

    /// Close the mic and return what was said (waits a moment for the final result).
    func stop() async -> String {
        wanted = false
        guard listening else { return "" }
        engine.stop()
        engine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        let deadline = Date().addingTimeInterval(1.5)
        while !gotFinal && Date() < deadline {
            try? await Task.sleep(for: .milliseconds(50))
        }
        task?.cancel()
        task = nil
        request = nil
        listening = false
        SurfAudio.shared.setRecording(false)
        let text = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        transcript = ""
        return text
    }

    func cancel() async {
        _ = await stop()
    }

    /// Transcribe an audio file with the same recognizer (the simulator hook
    /// `TS_HEAR`, so the voice path can be checked without a finger on the mic).
    func transcribe(file url: URL) async -> String {
        guard await Self.authorizeSpeech(), let recognizer else {
            print("[voice] speech recognition not authorized (\(SFSpeechRecognizer.authorizationStatus().rawValue))")
            return ""
        }
        let req = SFSpeechURLRecognitionRequest(url: url)
        req.addsPunctuation = true
        return await withCheckedContinuation { cont in
            var done = false
            recognizer.recognitionTask(with: req) { result, error in
                guard !done else { return }
                if let result, result.isFinal {
                    done = true
                    cont.resume(returning: result.bestTranscription.formattedString)
                } else if let error {
                    print("[voice] recognizer error: \(error.localizedDescription)")
                    done = true
                    cont.resume(returning: "")
                }
            }
        }
    }

    private static func authorizeSpeech() async -> Bool {
        await withCheckedContinuation { cont in
            SFSpeechRecognizer.requestAuthorization { cont.resume(returning: $0 == .authorized) }
        }
    }

    private static func authorize() async -> Bool {
        guard await authorizeSpeech() else { return false }
        return await AVAudioApplication.requestRecordPermission()
    }
}
