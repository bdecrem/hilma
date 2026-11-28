@preconcurrency import AVFoundation
import OlaKit

/// Kit's local voice (OLA-534): the meeting's ears and mouth are Kit's voice server on the Mac Studio
/// (hilma's apps/venture/voice-local/server.py) instead of ElevenLabs, behind the "Local voice (Mac
/// Studio)" switch on Kit's screen. A port of the talk page's client (src/app/venture/local-voice.ts):
///
/// - the microphone goes up as 16 kHz mono int16 in 256 ms posts, one after another
///   (OlaKit's KitLocalVoice); each answer carries the server's events: speech started, stopped,
///   and his whole turn as text (the server ends a turn after 800 ms of quiet);
/// - his words go to /api/venture/phone/meeting/<id>/reply, which runs the same turn as an
///   ElevenLabs meeting (stored under call = 'phone', Claude with the Venture notes) and streams the
///   reply back as text; each sentence is asked of the Studio as audio and played in order;
/// - when he starts talking while Kit speaks, playback stops, the reply request is cancelled (the
///   server keeps what was written, marked interrupted) and Kit listens.
///
/// The audio session is .playAndRecord in .voiceChat mode with voice processing on the engine's
/// input, so the phone cancels its own speaker's echo, as a phone call does.
@MainActor
final class LocalKitTransport: KitVoiceTransport {
  private let api: KitAPI
  private var voice: KitLocalVoice?
  private var call = ""
  private var session = ""
  private var onEvent: (@MainActor (KitVoiceEvent) -> Void)?
  private let engine = AVAudioEngine()
  private let player = AVAudioPlayerNode()
  private let mic = MicTap()
  private let kitMeter = Meter()
  private var tasks: [Task<Void, Never>] = []
  private var interruption: NSObjectProtocol?
  private var configChange: NSObjectProtocol?
  private var closed = false
  private var muted = false
  private var lastHeard = Date()
  private let openedAt = Date()

  // The reply in progress. Ids start high and at random, so a reconnect's replies never touch
  // the lines of the connection before it.
  private var replyId = Int.random(in: 1_000_000...1_000_000_000)
  private var replyTask: Task<Void, Never>?
  private var speakTask: Task<Void, Never>?
  private var spoken = "" // what of the current reply has been sent to the speaker
  private var queued = 0 // buffers of the current reply not yet played
  private var speaking = false
  private var speakDone = true

  private static let outFormat = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: KitLocalVoice.sampleRateOut, channels: 1, interleaved: false)!

  init(api: KitAPI) { self.api = api }

  func open(token: String, variables: [String: String], onEvent: @escaping @MainActor (KitVoiceEvent) -> Void) async throws {
    self.onEvent = onEvent
    guard let u = variables[KitLocalStart.url].flatMap(URL.init(string:)), let s = variables[KitLocalStart.session] else {
      throw KitError.refused("The Mac Studio voice is not set up. Turn off Local voice to talk now.")
    }
    session = s
    let v = KitLocalVoice(url: u, token: token)
    let opened: (call: String, endSilenceMs: Int)
    do { opened = try await v.open() } catch {
      // Never the paid voice instead: say so, plainly.
      throw KitError.refused(KitLocalError.unreachable.errorDescription!)
    }
    voice = v
    call = opened.call
    if closed { await v.end(call); return }
    do { try startAudio() } catch {
      NSLog("KIT_LOCAL audio %@", error.localizedDescription)
      await v.end(call)
      throw KitError.refused("The microphone did not start. Try again.")
    }
    interruption = NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
      let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
      guard raw == AVAudioSession.InterruptionType.began.rawValue else { return }
      MainActor.assumeIsolated { self?.emit(.audioTaken) }
    }
    // A route change (AirPods in or out) can stop the engine: start it again.
    configChange = NotificationCenter.default.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main) { [weak self] _ in
      MainActor.assumeIsolated { self?.restartEngine() }
    }
    tasks.append(Task { [weak self] in await self?.micLoop() })
    tasks.append(Task { [weak self] in await self?.watch() })
    lastHeard = Date()
    emit(.ready)
  }

  /// The meeting's kickoff ("[begin]"), or any line to answer: Kit replies to it.
  func send(_ text: String) async throws { reply(to: text) }

  func setMuted(_ m: Bool) async { muted = m }

  func setSpeaker(_ on: Bool) async {
    // The loudspeaker or the earpiece; AirPods and the car keep the audio either way.
    let s = AVAudioSession.sharedInstance()
    let external = s.currentRoute.outputs.contains { ![.builtInReceiver, .builtInSpeaker].contains($0.portType) }
    do { try s.overrideOutputAudioPort(on && !external ? .speaker : .none) } catch { NSLog("KIT_LOCAL speaker %@", error.localizedDescription) }
  }

  func close() async {
    guard !closed else { return }
    closed = true
    for t in tasks { t.cancel() }
    tasks = []
    replyTask?.cancel()
    speakTask?.cancel()
    if let interruption { NotificationCenter.default.removeObserver(interruption) }
    if let configChange { NotificationCenter.default.removeObserver(configChange) }
    interruption = nil
    configChange = nil
    engine.inputNode.removeTap(onBus: 0)
    engine.mainMixerNode.removeTap(onBus: 0)
    player.stop()
    engine.stop()
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    if let voice, !call.isEmpty { await voice.end(call) }
  }

  // MARK: audio

  private func startAudio() throws {
    let s = AVAudioSession.sharedInstance()
    try s.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth])
    try s.setActive(true)
    // Echo cancellation: the phone takes its own speaker out of what the microphone hears.
    try engine.inputNode.setVoiceProcessingEnabled(true)
    engine.attach(player)
    engine.connect(player, to: engine.mainMixerNode, format: Self.outFormat)
    let input = engine.inputNode.outputFormat(forBus: 0)
    let mic = self.mic
    mic.prepare(from: input.sampleRate)
    engine.inputNode.installTap(onBus: 0, bufferSize: 1024, format: input) { buf, _ in mic.take(buf) }
    let meter = kitMeter
    engine.mainMixerNode.installTap(onBus: 0, bufferSize: 1024, format: nil) { buf, _ in meter.take(buf) }
    engine.prepare()
    try engine.start()
    player.play()
  }

  private func restartEngine() {
    guard !closed, !engine.isRunning else { return }
    do {
      try engine.start()
      player.play()
    } catch {
      NSLog("KIT_LOCAL restart %@", error.localizedDescription)
      emit(.closed(error: true))
    }
  }

  /// One microphone post at a time, in order: the server's VAD reads them as one stream. Muted,
  /// the posts carry silence, so the call stays open.
  private func micLoop() async {
    var fails = 0
    let bytes = KitLocalVoice.chunk * 2
    while !Task.isCancelled, !closed {
      guard let chunk = mic.take(bytes: bytes) else {
        try? await Task.sleep(for: .milliseconds(40))
        continue
      }
      guard let voice else { return }
      do {
        let events = try await voice.audio(call, muted ? Data(count: chunk.count) : chunk)
        fails = 0
        for e in events { heard(e) }
      } catch {
        if closed { return }
        fails += 1
        NSLog("KIT_LOCAL audio post failed %@", String(describing: error))
        if fails >= 3 || (error as? KitLocalError) == .callGone {
          emit(.closed(error: true))
          return
        }
      }
    }
  }

  private func heard(_ e: KitLocalEvent) {
    switch e {
    case .speechStarted:
      // He cut in: Kit stops and listens.
      if speaking || queued > 0 { cutIn() }
    case .speechStopped:
      if !speaking { emit(.activity(.thinking)) }
    case .transcript(let text):
      let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !t.isEmpty else {
        if !speaking && speakDone { emit(.activity(.listening)) }
        return
      }
      lastHeard = Date()
      emit(.youSaid(t))
      reply(to: t)
    }
  }

  // MARK: Kit's reply

  private func reply(to text: String) {
    // A newer turn replaces the reply in flight (the server drops that one too).
    if speaking || queued > 0 { cutIn() } else { replyTask?.cancel(); speakTask?.cancel() }
    replyId += 1
    let id = replyId
    spoken = ""
    queued = 0
    speakDone = false
    let (sentences, out) = AsyncStream<String>.makeStream()
    let api = self.api, session = self.session
    replyTask = Task {
      var split = KitSentences()
      var raw: [UInt8] = []
      do {
        let bytes = try await api.localReply(session, text: text)
        for try await b in bytes {
          raw.append(b)
          // Decode at a plain ASCII byte, so a letter of several bytes is never cut in two.
          guard b < 0x80 else { continue }
          for s in split.add(String(decoding: raw, as: UTF8.self)) { out.yield(s) }
          raw = []
        }
        if !raw.isEmpty { for s in split.add(String(decoding: raw, as: UTF8.self)) { out.yield(s) } }
        if let rest = split.finish() { out.yield(rest) }
      } catch {
        if !Task.isCancelled { NSLog("KIT_LOCAL reply failed %@", String(describing: error)) }
      }
      out.finish()
    }
    speakTask = Task { [weak self] in
      for await s in sentences {
        guard let self, id == self.replyId, !self.closed, let voice = self.voice else { return }
        do {
          let pcm = try await voice.speak(self.call, s)
          guard id == self.replyId, !Task.isCancelled else { return }
          self.play(pcm, sentence: s, id: id)
        } catch {
          if Task.isCancelled { return }
          NSLog("KIT_LOCAL speak failed %@", String(describing: error))
        }
      }
      guard let self, id == self.replyId else { return }
      self.speakDone = true
      if self.queued == 0 { self.quiet(id) }
    }
  }

  private func play(_ pcm: Data, sentence: String, id: Int) {
    let n = pcm.count / 2
    guard n > 0, let buf = AVAudioPCMBuffer(pcmFormat: Self.outFormat, frameCapacity: AVAudioFrameCount(n)) else { return }
    buf.frameLength = AVAudioFrameCount(n)
    let ch = buf.floatChannelData![0]
    pcm.withUnsafeBytes { raw in
      let p = raw.bindMemory(to: Int16.self)
      for i in 0..<n { ch[i] = Float(Int16(littleEndian: p[i])) / 32768 }
    }
    queued += 1
    spoken = spoken.isEmpty ? sentence : spoken + " " + sentence
    if !player.isPlaying { player.play() }
    player.scheduleBuffer(buf, completionCallbackType: .dataPlayedBack) { [weak self] _ in
      Task { @MainActor in self?.played(id) }
    }
    if !speaking {
      speaking = true
      emit(.activity(.speaking))
    }
    emit(.kitSaid(spoken, id: id))
  }

  private func played(_ id: Int) {
    guard id == replyId, queued > 0 else { return }
    queued -= 1
    if queued == 0 && speakDone { quiet(id) }
  }

  private func quiet(_ id: Int) {
    guard id == replyId else { return }
    speaking = false
    emit(.activity(.listening))
  }

  /// Stops Kit mid-reply: the audio, the sentences still coming, and the reply request.
  private func cutIn() {
    let id = replyId
    replyId += 1 // everything of the old reply is ignored from here
    replyTask?.cancel()
    speakTask?.cancel()
    player.stop()
    player.play()
    queued = 0
    speakDone = true
    if speaking || !spoken.isEmpty { emit(.kitCut(spoken, id: id)) }
    speaking = false
    spoken = ""
  }

  // MARK: limits and levels

  /// ElevenLabs ends a quiet meeting by itself; here the phone does: four minutes without a word
  /// from him, or forty minutes in all. Twenty times a second, the levels.
  private func watch() async {
    var smooth: Float = 0
    var tick = 0
    while !Task.isCancelled, !closed {
      try? await Task.sleep(for: .milliseconds(50))
      let raw = kitMeter.takePeak()
      smooth = max(raw, smooth * 0.82)
      emit(.levels(kit: speaking ? min(1, smooth * 4) : 0, you: muted ? 0 : min(1, mic.takePeak() * 6)))
      tick += 1
      guard tick % 20 == 0 else { continue }
      let now = Date()
      if !speaking, now.timeIntervalSince(lastHeard) >= KitMeeting.silenceLimit || now.timeIntervalSince(openedAt) >= KitMeeting.durationLimit {
        emit(.closed(error: false))
        return
      }
    }
  }

  private func emit(_ e: KitVoiceEvent) {
    guard !closed else { return }
    onEvent?(e)
  }
}

/// The microphone, on the audio thread: channel one, resampled to 16 kHz mono int16, kept until
/// the next post takes it; and its loudness.
private final class MicTap: @unchecked Sendable {
  private let lock = NSLock()
  private var data = Data()
  private var peak: Float = 0
  private var converter: AVAudioConverter?
  private var monoIn: AVAudioFormat?
  private let out = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: KitLocalVoice.sampleRateIn, channels: 1, interleaved: true)!

  func prepare(from rate: Double) {
    let mono = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: rate, channels: 1, interleaved: false)!
    monoIn = mono
    converter = AVAudioConverter(from: mono, to: out)
  }

  func take(_ buf: AVAudioPCMBuffer) {
    guard let converter, let monoIn, let src = buf.floatChannelData?[0] else { return }
    let frames = Int(buf.frameLength)
    guard frames > 0, let mono = AVAudioPCMBuffer(pcmFormat: monoIn, frameCapacity: AVAudioFrameCount(frames)) else { return }
    mono.frameLength = AVAudioFrameCount(frames)
    var sum: Float = 0
    let dst = mono.floatChannelData![0]
    for i in 0..<frames { dst[i] = src[i]; sum += src[i] * src[i] }
    let rms = (sum / Float(frames)).squareRoot()
    let cap = AVAudioFrameCount(Double(frames) * out.sampleRate / monoIn.sampleRate) + 32
    guard let res = AVAudioPCMBuffer(pcmFormat: out, frameCapacity: cap) else { return }
    var given = false
    var err: NSError?
    converter.convert(to: res, error: &err) { _, status in
      if given { status.pointee = .noDataNow; return nil }
      given = true
      status.pointee = .haveData
      return mono
    }
    guard err == nil, res.frameLength > 0, let p = res.int16ChannelData?[0] else { return }
    let bytes = Data(bytes: p, count: Int(res.frameLength) * 2)
    lock.lock()
    data.append(bytes)
    peak = max(peak, rms)
    // Never more than ten seconds waiting (a stalled network): the oldest goes.
    if data.count > 320_000 { data.removeFirst(data.count - 320_000) }
    lock.unlock()
  }

  /// `bytes` of microphone, once that much has come in.
  func take(bytes: Int) -> Data? {
    lock.lock(); defer { lock.unlock() }
    guard data.count >= bytes else { return nil }
    let d = data
    data = Data()
    return d
  }

  func takePeak() -> Float {
    lock.lock(); defer { lock.unlock() }
    let p = peak
    peak = 0
    return p
  }
}

/// The loudness of what the speaker plays.
private final class Meter: @unchecked Sendable {
  private let lock = NSLock()
  private var peak: Float = 0

  func take(_ buf: AVAudioPCMBuffer) {
    let frames = Int(buf.frameLength)
    guard frames > 0, let f = buf.floatChannelData?[0] else { return }
    var sum: Float = 0
    for i in 0..<frames { sum += f[i] * f[i] }
    let rms = (sum / Float(frames)).squareRoot()
    lock.lock(); peak = max(peak, rms); lock.unlock()
  }

  func takePeak() -> Float {
    lock.lock(); defer { lock.unlock() }
    let p = peak
    peak = 0
    return p
  }
}
