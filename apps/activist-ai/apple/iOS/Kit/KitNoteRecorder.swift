@preconcurrency import AVFoundation
import OlaKit
import Observation

/// A voice note for Kit: tap to record, tap to stop, then Send or Discard. AAC in an .m4a file
/// (what iOS records natively), five minutes at most. The file lives in the app's temporary folder
/// until it is sent or discarded; the server keeps only the words.
@MainActor
@Observable
final class KitNoteRecorder {
  enum State: Equatable {
    case ready, recording, recorded, sending, sent(KitNote), failed(String), denied
  }

  static let limit: TimeInterval = 300
  /// The countdown shows for the last this many seconds.
  static let countdown: TimeInterval = 30

  private(set) var state: State = .ready
  private(set) var elapsed: TimeInterval = 0
  /// Recent loudness, 0 to 1, oldest first: the level meter.
  private(set) var levels: [Float] = Array(repeating: 0, count: 32)

  private var recorder: AVAudioRecorder?
  private var ticker: Task<Void, Never>?
  private var interruption: NSObjectProtocol?
  private let file = FileManager.default.temporaryDirectory.appendingPathComponent("kit-note.m4a")

  var remaining: TimeInterval { max(0, Self.limit - elapsed) }

  init(state: State = .ready, elapsed: TimeInterval = 0, levels: [Float]? = nil) {
    self.state = state
    self.elapsed = elapsed
    if let levels { self.levels = levels }
  }

  func start() async {
    guard state == .ready else { return }
    let granted = await withCheckedContinuation { c in AVAudioApplication.requestRecordPermission { c.resume(returning: $0) } }
    guard granted else { state = .denied; return }
    do {
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(.playAndRecord, mode: .default, options: [.allowBluetoothHFP, .defaultToSpeaker])
      try session.setActive(true)
      try? FileManager.default.removeItem(at: file)
      let r = try AVAudioRecorder(url: file, settings: [
        AVFormatIDKey: kAudioFormatMPEG4AAC,
        AVSampleRateKey: 24_000,
        AVNumberOfChannelsKey: 1,
        AVEncoderBitRateKey: 48_000,
      ])
      r.isMeteringEnabled = true
      guard r.record(forDuration: Self.limit) else { throw KitError.refused("The microphone did not start. Try again.") }
      recorder = r
      elapsed = 0
      levels = Array(repeating: 0, count: levels.count)
      state = .recording
      // A phone call stops the note where it is; what was said is kept.
      interruption = NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
        guard (note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt) == AVAudioSession.InterruptionType.began.rawValue else { return }
        MainActor.assumeIsolated { self?.stop() }
      }
      ticker = Task { [weak self] in
        while !Task.isCancelled {
          try? await Task.sleep(for: .milliseconds(80))
          self?.tick()
        }
      }
    } catch {
      state = .failed((error as? KitError)?.errorDescription ?? "The microphone did not start. Try again.")
      release()
    }
  }

  private func tick() {
    guard state == .recording, let r = recorder else { return }
    if !r.isRecording { return stop() }  // the five minutes are up
    r.updateMeters()
    elapsed = r.currentTime
    let db = r.averagePower(forChannel: 0)
    let level = max(0, min(1, (db + 50) / 50))
    levels.removeFirst()
    levels.append(level)
  }

  func stop() {
    guard state == .recording else { return }
    if let r = recorder {
      elapsed = max(elapsed, r.currentTime)
      r.stop()
    }
    release()
    state = elapsed < 1 ? .ready : .recorded
  }

  func send(with api: KitAPI) async {
    guard state == .recorded || isFailed, let data = try? Data(contentsOf: file) else { return }
    state = .sending
    do {
      let note = try await api.sendNote(audio: data, seconds: elapsed)
      try? FileManager.default.removeItem(at: file)
      state = .sent(note)
    } catch {
      state = .failed((error as? KitError)?.errorDescription ?? "The note did not go through. Try again.")
    }
  }

  var isFailed: Bool { if case .failed = state { return true }; return false }
  var hasRecording: Bool { FileManager.default.fileExists(atPath: file.path) }

  func discard() {
    if state == .recording { recorder?.stop() }
    release()
    try? FileManager.default.removeItem(at: file)
    elapsed = 0
    state = .ready
  }

  private func release() {
    ticker?.cancel()
    ticker = nil
    recorder = nil
    if let interruption { NotificationCenter.default.removeObserver(interruption) }
    interruption = nil
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }
}
