@preconcurrency import AVFoundation
import Combine
import ElevenLabs
import LiveKit
import OlaKit

/// Kit's voice connection: ElevenLabs' Swift SDK (3.3.1, the version the Dodo app ships), over
/// WebRTC, with a conversation token our server minted. ElevenLabs does the listening, turn-taking,
/// barge-in and the voice; every word Kit says is written by Claude on our server (see
/// hilma's src/lib/venture/phone.ts). This turns the SDK's callbacks into KitVoiceEvents; the
/// meeting's states live in OlaKit's KitMeeting, which is tested with a fake of this.
@MainActor
final class ElevenKitTransport: KitVoiceTransport {
  private var conversation: ElevenConversation?
  private var onEvent: (@MainActor (KitVoiceEvent) -> Void)?
  private var stateSink: AnyCancellable?
  private var interruption: NSObjectProtocol?
  private var meterTask: Task<Void, Never>?
  private let meter = LevelMeter()
  private var meterAttached = false
  private var vad: Float = 0
  private var agentReady = false
  private var readySent = false
  private var closed = false

  func open(token: String, variables: [String: String], onEvent: @escaping @MainActor (KitVoiceEvent) -> Void) async throws {
    self.onEvent = onEvent
    let config = ConversationConfig(
      dynamicVariables: variables,
      onError: { error in NSLog("KIT_VOICE error %@", error.localizedDescription) },
      onAgentResponse: { [weak self] text, id in Task { @MainActor in self?.emit(.kitSaid(text, id: id)) } },
      onAgentResponseCorrection: { [weak self] _, corrected, id in Task { @MainActor in self?.emit(.kitCut(corrected, id: id)) } },
      onUserTranscript: { [weak self] text, _ in Task { @MainActor in self?.emit(.youSaid(text)) } },
      onInterruption: { [weak self] _ in Task { @MainActor in self?.emit(.activity(.listening)) } },
      onVadScore: { [weak self] score in Task { @MainActor in self?.vad = Float(score) } }
    )
    // The ready and disconnect callbacks go here: this entry point replaces the config's copies.
    let c = try await ElevenLabs.startConversation(
      conversationToken: token,
      config: config,
      onAgentReady: { [weak self] in Task { @MainActor in self?.markReady() } },
      onDisconnect: { [weak self] reason in Task { @MainActor in self?.disconnected(reason) } }
    )
    if closed {
      await c.endConversation()
      return
    }
    conversation = c
    stateSink = c.$agentState.removeDuplicates().receive(on: DispatchQueue.main).sink { [weak self] s in
      MainActor.assumeIsolated { self?.agentState(s) }
    }
    // A phone call (or FaceTime, or Siri) takes the audio: the meeting ends, plainly.
    interruption = NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
      let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
      guard raw == AVAudioSession.InterruptionType.began.rawValue else { return }
      MainActor.assumeIsolated { self?.emit(.audioTaken) }
    }
    startMeter()
    sendReadyIfBoth()
  }

  func send(_ text: String) async throws {
    try await conversation?.sendMessage(text)
  }

  func setMuted(_ muted: Bool) async {
    do { try await conversation?.setMuted(muted) } catch { NSLog("KIT_VOICE mute %@", error.localizedDescription) }
  }

  func setSpeaker(_ on: Bool) async {
    // Loudspeaker or the earpiece; AirPods and the car take the audio either way.
    AudioManager.shared.isSpeakerOutputPreferred = on
  }

  func close() async {
    guard !closed else { return }
    closed = true
    meterTask?.cancel()
    stateSink = nil
    if let interruption { NotificationCenter.default.removeObserver(interruption) }
    interruption = nil
    if let conversation {
      try? await conversation.setMuted(true)
      await conversation.endConversation()
    }
    conversation = nil
    // The SDK leaves LiveKit's audio engine warm (mic pipeline up) after a conversation; the next
    // thing to use audio (a note) then fails. Dodo learned this on 2026-09-22.
    try? await AudioManager.shared.setRecordingAlwaysPreparedMode(false)
    AudioManager.shared.isSpeakerOutputPreferred = true
  }

  // MARK: events

  private func emit(_ e: KitVoiceEvent) {
    guard !closed else { return }
    onEvent?(e)
  }

  /// Ready is reported once both the agent is ready and the conversation is in hand (the ready
  /// callback can arrive before startConversation returns).
  private func markReady() {
    agentReady = true
    sendReadyIfBoth()
  }

  private func sendReadyIfBoth() {
    guard agentReady, conversation != nil, !readySent else { return }
    readySent = true
    emit(.ready)
  }

  private func agentState(_ s: ElevenLabs.AgentState) {
    switch s {
    case .speaking: emit(.activity(.speaking))
    case .thinking: emit(.activity(.thinking))
    case .listening: emit(.activity(.listening))
    @unknown default: break
    }
  }

  private func disconnected(_ reason: DisconnectionReason) {
    NSLog("KIT_VOICE disconnect %@", String(describing: reason))
    switch reason {
    case .error: emit(.closed(error: true))
    default: emit(.closed(error: false))
    }
  }

  /// Kit's loudness from its rendered audio, and Bart's from ElevenLabs' voice-activity score,
  /// twenty times a second.
  private func startMeter() {
    meterTask = Task { [weak self] in
      var smooth: Float = 0
      while !Task.isCancelled {
        try? await Task.sleep(for: .milliseconds(50))
        guard let self else { return }
        if !self.meterAttached, let track = self.conversation?.agentAudioTrack {
          track.add(audioRenderer: self.meter)
          self.meterAttached = true
        }
        let raw = self.meter.take()
        smooth = max(raw, smooth * 0.82)
        self.emit(.levels(kit: min(1, smooth * 4), you: self.vad))
      }
    }
  }
}

/// The loudness (RMS) of what the agent's audio track plays, read on the audio thread.
private final class LevelMeter: NSObject, AudioRenderer, @unchecked Sendable {
  private let lock = NSLock()
  private var peak: Float = 0

  func render(pcmBuffer: AVAudioPCMBuffer) {
    let frames = Int(pcmBuffer.frameLength)
    guard frames > 0 else { return }
    var sum: Float = 0
    if let f = pcmBuffer.floatChannelData?[0] {
      for i in 0..<frames { sum += f[i] * f[i] }
    } else if let s = pcmBuffer.int16ChannelData?[0] {
      for i in 0..<frames { let v = Float(s[i]) / 32768; sum += v * v }
    }
    let rms = (sum / Float(frames)).squareRoot()
    lock.lock(); peak = max(peak, rms); lock.unlock()
  }

  /// The loudest moment since the last call.
  func take() -> Float {
    lock.lock(); defer { lock.unlock() }
    let p = peak
    peak = 0
    return p
  }
}
