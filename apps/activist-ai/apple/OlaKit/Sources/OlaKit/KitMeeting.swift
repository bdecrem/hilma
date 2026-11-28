import Foundation
import Observation

/// What the voice connection reports. The phone app's ElevenLabs transport makes these from the
/// SDK's callbacks; tests make them by hand.
public enum KitVoiceEvent: Sendable, Equatable {
  /// Connected; Kit can hear and speak.
  case ready
  case activity(KitActivity)
  /// Bart's words for one turn.
  case youSaid(String)
  /// Kit's words for one turn (id: the engine's event id).
  case kitSaid(String, id: Int)
  /// Bart cut in: what Kit actually got to say of that turn.
  case kitCut(String, id: Int)
  /// Loudness, 0 to 1, of Kit's voice and of Bart's microphone.
  case levels(kit: Float, you: Float)
  /// The system took the audio (a phone call, FaceTime, Siri).
  case audioTaken
  /// The conversation is over: closed by the voice service (error false) or lost (error true).
  case closed(error: Bool)
}

public enum KitActivity: Sendable, Equatable { case listening, thinking, speaking }

/// One voice connection. Opened once and closed once; a reconnect makes a new one.
@MainActor
public protocol KitVoiceTransport: AnyObject {
  func open(token: String, variables: [String: String], onEvent: @escaping @MainActor (KitVoiceEvent) -> Void) async throws
  func send(_ text: String) async throws
  func setMuted(_ muted: Bool) async
  func setSpeaker(_ on: Bool) async
  func close() async
}

/// A voice meeting with Kit: the states the screen shows and every way it can end. Each exit
/// closes the voice connection (which frees the ElevenLabs slot) and tells the server once.
///
///   idle → connecting → live ⇄ (listening, thinking, speaking) → ended
///                         ↘ reconnecting (once, on a lost connection) → live | ended
@MainActor
@Observable
public final class KitMeeting {
  public enum Phase: Equatable, Sendable { case idle, connecting, live, reconnecting, ended }

  public private(set) var phase: Phase = .idle
  public private(set) var activity: KitActivity = .listening
  public private(set) var lines: [KitLine] = []
  public private(set) var muted = false
  public private(set) var speaker = true
  public private(set) var endReason: KitEndReason?
  /// One plain sentence when the meeting did not end because Bart pressed End.
  public private(set) var endMessage: String?
  public private(set) var session: String?
  public private(set) var connectedAt: Date?
  public private(set) var endedAt: Date?
  public private(set) var reconnects = 0
  public private(set) var kitLevel: Float = 0
  public private(set) var youLevel: Float = 0

  /// The words of the turn now on screen.
  public var caption: KitLine? { lines.last }
  public var seconds: Int {
    guard let connectedAt else { return 0 }
    return max(0, Int((endedAt ?? now()).timeIntervalSince(connectedAt)))
  }

  let service: KitService
  let makeTransport: @MainActor () -> KitVoiceTransport
  var transport: KitVoiceTransport?
  /// Events from a connection that has since been closed are ignored.
  var generation = 0
  var kickoff = "[begin]"
  var lastHeard: Date?
  var kitLineIndex: [Int: Int] = [:]
  public var now: () -> Date = Date.init
  /// A connection that is not ready within this long counts as lost.
  public var readyTimeout: Duration = .seconds(20)
  /// The engine ends a meeting after this long without a word from Bart (scripts/venture/kit-engine.mjs).
  public static let silenceLimit: TimeInterval = 240
  public static let durationLimit: TimeInterval = 2400

  public init(service: KitService, transport: @escaping @MainActor () -> KitVoiceTransport) {
    self.service = service
    self.makeTransport = transport
  }

  // MARK: actions

  public func start() async {
    guard phase == .idle else { return }
    phase = .connecting
    do {
      let s = try await service.startMeeting(resume: nil)
      session = s.session
      guard phase != .ended else { return await tellServer() }
      try await connect(s)
    } catch {
      await finish(.error, message(error, fallback: "Kit cannot take a call right now. Try again, or leave a note."))
    }
  }

  public func end() async { await finish(.you, nil) }

  /// The app is going to the background and cannot keep the audio (used only without the audio
  /// background mode).
  public func backgrounded() async { await finish(.background, "The meeting ended when Ola left the screen.") }

  public func setMuted(_ on: Bool) {
    muted = on
    let t = transport
    Task { await t?.setMuted(on) }
  }

  public func setSpeaker(_ on: Bool) {
    speaker = on
    let t = transport
    Task { await t?.setSpeaker(on) }
  }

  // MARK: the connection

  func connect(_ s: KitMeetingStart) async throws {
    kickoff = s.kickoff
    generation += 1
    let gen = generation
    let t = makeTransport()
    transport = t
    armReadyTimeout(gen)
    try await t.open(token: s.conversationToken, variables: s.variables) { [weak self] e in self?.handle(e, gen) }
    // End was pressed while it connected: close what just opened.
    if phase == .ended || gen != generation { return await t.close() }
    await t.setMuted(muted)
    await t.setSpeaker(speaker)
  }

  func armReadyTimeout(_ gen: Int) {
    let wait = readyTimeout
    Task { [weak self] in
      try? await Task.sleep(for: wait)
      guard let self, gen == self.generation, self.phase == .connecting || self.phase == .reconnecting else { return }
      self.handle(.closed(error: true), gen)
    }
  }

  func handle(_ e: KitVoiceEvent, _ gen: Int) {
    guard gen == generation, phase != .ended else { return }
    switch e {
    case .ready:
      guard phase == .connecting || phase == .reconnecting else { return }
      phase = .live
      activity = .thinking
      if connectedAt == nil { connectedAt = now() }
      lastHeard = now()
      // Kit speaks first: the server answers the kickoff with a greeting.
      let t = transport, k = kickoff
      Task { try? await t?.send(k) }
    case .activity(let a):
      activity = a
      if a != .speaking { kitLevel = 0 }
    case .youSaid(let text):
      let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !text.isEmpty, text != kickoff else { return }
      lastHeard = now()
      lines.append(KitLine(id: lines.count, who: .bart, text: text))
      activity = .thinking
    case .kitSaid(let text, let id):
      let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !text.isEmpty else { return }
      // The local voice reports a turn again as more of it is spoken: the same line grows.
      if let i = kitLineIndex[id], lines.indices.contains(i) { lines[i].text = text; return }
      kitLineIndex[id] = lines.count
      lines.append(KitLine(id: lines.count, who: .kit, text: text))
    case .kitCut(let text, let id):
      if let i = kitLineIndex[id], lines.indices.contains(i) { lines[i].text = text }
      activity = .listening
    case .levels(let k, let y):
      kitLevel = k
      youLevel = muted ? 0 : y
    case .audioTaken:
      Task { await finish(.phoneCall, "A phone call ended the meeting.") }
    case .closed(let error):
      if error {
        Task { await lost(gen) }
      } else {
        let quiet = now().timeIntervalSince(lastHeard ?? now())
        if quiet >= Self.silenceLimit - 20 {
          Task { await finish(.silence, "It went quiet, so the meeting ended.") }
        } else if Double(seconds) >= Self.durationLimit - 30 {
          Task { await finish(.timeLimit, "Meetings stop at forty minutes. Start another to go on.") }
        } else {
          Task { await finish(.dropped, "The meeting ended.") }
        }
      }
    }
  }

  /// A lost connection: one reconnect into the same meeting, then a plain ending. `gen` is the
  /// connection that was lost; a second report of the same loss does nothing.
  func lost(_ gen: Int) async {
    guard gen == generation, phase != .ended else { return }
    let wasReconnecting = phase == .reconnecting
    let old = transport
    transport = nil
    generation += 1
    await old?.close()
    guard reconnects < 1, !wasReconnecting, let session else {
      return await finish(.dropped, "The connection dropped. What you said is saved.")
    }
    reconnects += 1
    phase = .reconnecting
    activity = .thinking
    do {
      let s = try await service.startMeeting(resume: session)
      guard phase != .ended else { return }
      self.session = s.session
      try await connect(s)
    } catch {
      await finish(.dropped, "The connection dropped again. What you said is saved.")
    }
  }

  func finish(_ reason: KitEndReason, _ message: String?) async {
    guard phase != .ended else { return }
    phase = .ended
    endReason = reason
    endMessage = message
    endedAt = now()
    kitLevel = 0
    youLevel = 0
    generation += 1
    let t = transport
    transport = nil
    await t?.close()
    await tellServer()
  }

  var told = false
  func tellServer() async {
    guard !told, let session, let reason = endReason else { return }
    told = true
    try? await service.endMeeting(session, seconds: seconds, reason: reason)
  }

  func message(_ error: Error, fallback: String) -> String {
    if let k = error as? KitError { return k.errorDescription ?? fallback }
    return fallback
  }
}

// MARK: screenshots

extension KitMeeting {
  /// A meeting frozen in one state, for screenshots (no connection, no server).
  public static func fixture(phase: Phase, activity: KitActivity = .listening, lines: [KitLine] = [], muted: Bool = false, speaker: Bool = true,
                             seconds: Int = 0, endReason: KitEndReason? = nil, endMessage: String? = nil, kitLevel: Float = 0, youLevel: Float = 0) -> KitMeeting {
    struct Nothing: KitService {
      func startMeeting(resume: String?) async throws -> KitMeetingStart { throw KitError.offline }
      func endMeeting(_ id: String, seconds: Int, reason: KitEndReason) async throws {}
    }
    let m = KitMeeting(service: Nothing()) { fatalError("a fixture never connects") }
    let t0 = Date(timeIntervalSince1970: 1_800_000_000)
    m.phase = phase
    m.activity = activity
    m.lines = lines
    m.muted = muted
    m.speaker = speaker
    m.endReason = endReason
    m.endMessage = endMessage
    m.kitLevel = kitLevel
    m.youLevel = youLevel
    m.connectedAt = phase == .connecting ? nil : t0
    m.endedAt = phase == .ended ? t0.addingTimeInterval(TimeInterval(seconds)) : nil
    m.now = { t0.addingTimeInterval(TimeInterval(seconds)) }
    return m
  }
}
