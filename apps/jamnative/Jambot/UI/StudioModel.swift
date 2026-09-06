import Foundation
import Observation
import os

/// Drives one open track: loads it into the engine, mirrors engine state
/// for the views, runs agent turns, and autosaves. Mirrors the shape of
/// `Studio.tsx` (web) — see DESIGN.md for the bridge contract this rides on.
@Observable
@MainActor
final class StudioModel {
    static let log = Logger(subsystem: "com.bartdecrem.Jambot", category: "studio")

    enum Status: Equatable { case loading, ready, error(String) }

    let trackId: String
    let engine: EngineAPI
    let player = AudioPlayer()

    /// Set by the view: the server said 401 — the app should drop to Login.
    var onAuthLost: (() -> Void)?

    private(set) var status: Status = .loading
    var title: String = "Untitled"
    var desc: SessionDescription? = nil
    var groups: [ControlGroup] = []
    var feed: [FeedItem] = []
    var input: String = ""
    var busy = false
    var controlsOpen = false

    var playing = false
    var rendering = false
    var hasBuffer = false
    var pos: Double = 0
    var playStep16: Int? = nil
    var saveState: SaveState = .idle
    enum SaveState: Equatable { case idle, saving, failed }

    private var track: Track?
    /// Anthropic-format history. The engine's agent loop appends the user
    /// turn, assistant turns and tool results itself (runAgent), so this is
    /// only ever replaced wholesale from `agentMessages()` after a turn.
    private var messages: [AgentMessage] = []
    private var pendingNotes: [String] = []
    private var lastRenderBars: Int? = nil
    /// Last session JSON that went to the server — what a crashed engine
    /// is reloaded from (the engine's own copy is gone then).
    private var lastSerialized: JSONValue? = nil
    private var renderTask: Task<Void, Never>?
    private var saveTask: Task<Void, Never>?
    private var saveInFlight: Task<Void, Never>?
    private var playheadTimer: Timer?

    var bpm: Int { desc?.bpm ?? track?.bpm ?? 128 }
    var bars: Int { desc?.bars ?? track?.bars ?? 16 }
    var swing: Double { desc?.swing ?? 0 }
    var inSong: Bool { (desc?.arrangement.count ?? 0) > 0 }
    /// Bars the transport shows — the render's length (an arrangement is the
    /// sum of its sections), like the web's `shownBars`.
    var shownBars: Int { lastRenderBars ?? bars }
    var strip: Strip? { track?.strip }
    var barNow: Int { min(shownBars, Int(pos * Double(shownBars)) + 1) }

    init(trackId: String, initialMeta: TrackMeta?, engine: EngineAPI) {
        self.trackId = trackId
        self.engine = engine
        if let initialMeta { self.title = initialMeta.title }
        player.onStateChange = { [weak self] playing in
            Task { @MainActor in self?.playing = playing }
        }
    }

    // MARK: - Load

    func load() async {
        status = .loading
        do {
            let track = try await JamAPI.shared.track(trackId)
            self.track = track
            self.title = track.title
            self.messages = track.messages
            self.feed = track.feed
            try await engine.ready()
            // `loadSession` throws on a corrupt saved session (the web
            // silently starts fresh). Staying in `.error` here means nothing
            // is saved over the track — autosave requires `.ready`.
            let loaded = try await engine.loadSession(session: track.session, bpm: track.bpm)
            desc = loaded.desc
            lastSerialized = track.session
            groups = try await engine.controls()
            status = .ready
            await renderNow()
        } catch {
            if isAuthLoss(error) { onAuthLost?(); return }
            status = .error(error.localizedDescription)
            Self.log.error("load \(self.trackId, privacy: .public) failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// The engine's web process died and reloaded (EngineHost bumps its
    /// generation): put the last saved session back and re-render.
    private func recoverFromCrash() async {
        guard let track else { return }
        Self.log.error("engine crashed under track \(track.id, privacy: .public) — reloading last saved session")
        feed.append(.note(id: UUID().uuidString, text: "The sound engine restarted; reloaded your last saved state.", error: true))
        do {
            try await engine.ready()
            let loaded = try await engine.loadSession(session: lastSerialized ?? track.session, bpm: bpm)
            desc = loaded.desc
            groups = try await engine.controls()
            status = .ready
            await renderNow()
        } catch {
            status = .error(error.localizedDescription)
        }
    }

    private func isAuthLoss(_ error: Error) -> Bool {
        if case JamAPIError.unauthenticated = error { return true }
        if case EngineError.unauthenticated = error { return true }
        return false
    }

    private func isCrash(_ error: Error) -> Bool {
        if case EngineError.crashed = error { return true }
        return false
    }

    /// Common tail for a failed engine/API call outside an agent turn.
    private func handle(_ error: Error, during what: String) {
        Self.log.error("\(what, privacy: .public) failed: \(error.localizedDescription, privacy: .public)")
        if isAuthLoss(error) { onAuthLost?(); return }
        if isCrash(error) { Task { await recoverFromCrash() } }
    }

    // MARK: - Transport

    func startPlayheadClock() {
        stopPlayheadClock()
        let timer = Timer.scheduledTimer(withTimeInterval: 1.0 / 30.0, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
        RunLoop.main.add(timer, forMode: .common)
        playheadTimer = timer
    }

    func stopPlayheadClock() {
        playheadTimer?.invalidate()
        playheadTimer = nil
    }

    private func tick() {
        guard playing else { pos = 0; playStep16 = nil; return }
        pos = player.position()
        let totalSteps = max(1, shownBars * 16)
        playStep16 = Int(pos * Double(totalSteps)) % 16
    }

    func togglePlay() {
        player.toggle()
    }

    // MARK: - Controls sheet actions

    func onTrack(key: String, value: Double) {
        Task {
            do {
                desc = try await engine.setTrack(key: key, value: value)
                groups = try await engine.controls()
                scheduleRender()
                scheduleSave()
            } catch { handle(error, during: "setTrack \(key)") }
        }
    }

    func onParam(path: String, value: Double, label: String) {
        Task {
            do {
                desc = try await engine.tweak(path: path, value: value)
                scheduleRender()
                // One note per control, latest value wins — same as the
                // web's controlNotesRef map keyed by path.
                let note = "\(label) -> \(value)"
                if let i = pendingNotes.firstIndex(where: { $0.hasPrefix("\(label) -> ") }) { pendingNotes[i] = note } else { pendingNotes.append(note) }
                scheduleSave()
            } catch { handle(error, during: "tweak \(path)") }
        }
    }

    func onMix(id: String, what: String, on: Bool) {
        Task {
            do {
                desc = try await engine.mix(id: id, what: what, on: on)
                scheduleRender()
                scheduleSave()
            } catch { handle(error, during: "\(what) \(id)") }
        }
    }

    private func scheduleRender() {
        renderTask?.cancel()
        renderTask = Task {
            try? await Task.sleep(nanoseconds: 220_000_000)
            guard !Task.isCancelled else { return }
            await renderNow()
        }
    }

    func renderNow() async {
        guard status == .ready else { return }
        rendering = true
        defer { rendering = false }
        do {
            let started = Date()
            let result = try await engine.render(scope: .song)
            applyRender(result)
            Self.log.notice("render applied: \(result.bars) bars @ \(result.bpm), RMS(1s)=\(String(format: "%.4f", Self.rmsFirstSecond(result)), privacy: .public) in \(String(format: "%.2f", Date().timeIntervalSince(started)), privacy: .public)s, pos=\(String(format: "%.3f", self.player.position()), privacy: .public)")
        } catch {
            hasBuffer = player.hasBuffer()
            handle(error, during: "render")
        }
    }

    private func applyRender(_ result: RenderResult) {
        player.load(result)
        hasBuffer = player.hasBuffer()
        lastRenderBars = result.bars
    }

    /// RMS of the first second of channel 0 — a one-number "is there sound"
    /// readout for logs (0.05–0.2 is a normal loop; 0 is silence).
    static func rmsFirstSecond(_ r: RenderResult) -> Double {
        let n = min(Int(r.sampleRate), r.length)
        guard n > 0, r.pcm.count >= n else { return 0 }
        var acc = 0.0
        for i in 0..<n { let v = Double(r.pcm[i]) / 32768; acc += v * v }
        return (acc / Double(n)).squareRoot()
    }

    // MARK: - Chat

    func send(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !busy, status == .ready else { return }
        input = ""
        feed.append(.user(id: UUID().uuidString, text: trimmed))
        if title == "Untitled" { title = Self.autoTitle(from: trimmed) }
        busy = true

        let notes = pendingNotes
        pendingNotes = []

        Task { await runTurn(trimmed, notes: notes) }
    }

    /// Runs one agent turn and waits for it to finish (the debug script
    /// driver awaits this; `send` fires it and returns).
    func runTurn(_ task: String, notes: [String]) async {
        let started = Date()
        var pendingToolIds: [String] = []
        do {
            for try await event in engine.agent(task: task, messages: messages, notes: notes) {
                switch event {
                case .text(let t):
                    feed.append(.assistant(id: UUID().uuidString, text: t))
                case .tool(let name, let toolInput):
                    let id = UUID().uuidString
                    pendingToolIds.append(id)
                    feed.append(.tool(id: id, name: name, input: toolInput, result: nil, isError: nil))
                case .toolResult(let name, let result, let isError):
                    let id = pendingToolIds.isEmpty ? nil : pendingToolIds.removeFirst()
                    if let id, let idx = feed.firstIndex(where: { $0.id == id }),
                       case .tool(_, let n, let inp, _, _) = feed[idx] {
                        feed[idx] = .tool(id: id, name: n, input: inp, result: result, isError: isError)
                    }
                    // Events carry no state; re-describe after every tool
                    // except render so the header/Controls track the turn.
                    if name != "render" {
                        if let d = try? await engine.describe() { desc = d }
                        if let g = try? await engine.controls() { groups = g }
                    }
                case .render(let result):
                    applyRender(result)
                    Self.log.notice("agent render applied: \(result.bars) bars, RMS(1s)=\(String(format: "%.4f", Self.rmsFirstSecond(result)), privacy: .public)")
                case .end(let stopReason, let newDesc):
                    desc = newDesc
                    Self.log.notice("agent turn finished (\(stopReason, privacy: .public)) in \(String(format: "%.1f", Date().timeIntervalSince(started)), privacy: .public)s")
                case .failure(let message):
                    feed.append(.note(id: UUID().uuidString, text: message, error: true))
                }
            }
        } catch {
            if isAuthLoss(error) { busy = false; onAuthLost?(); return }
            feed.append(.note(id: UUID().uuidString, text: error.localizedDescription, error: true))
            if isCrash(error) { busy = false; await recoverFromCrash(); return }
        }
        // The engine owns the transcript (runAgent appended the user turn,
        // assistant turns and tool results in place); take it back for the
        // save. On a failed turn it still holds whatever was appended, with
        // any half tool round dropped.
        if let history = try? await engine.agentMessages(), !history.isEmpty { messages = history }
        if let g = try? await engine.controls() { groups = g }
        busy = false
        await saveNow()
    }

    /// First sentence of the first message, ≤ 40 chars — the web's rule.
    static func autoTitle(from text: String) -> String {
        var t = text.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
        if let range = t.range(of: "[.!?:;]\\s", options: .regularExpression) { t = String(t[..<range.lowerBound]) }
        t = t.trimmingCharacters(in: .whitespaces)
        if t.count > 40 {
            t = String(t.prefix(40)).replacingOccurrences(of: "\\s+\\S*$", with: "", options: .regularExpression)
        }
        t = t.replacingOccurrences(of: "[\\s,.:;!?-]+$", with: "", options: .regularExpression)
        return t.isEmpty ? "Untitled" : t
    }

    // MARK: - Save

    func scheduleSave() {
        saveTask?.cancel()
        saveTask = Task {
            try? await Task.sleep(nanoseconds: 800_000_000)
            guard !Task.isCancelled else { return }
            await saveNow()
        }
    }

    /// PUT the track. Serialized: a save that arrives while one is on the
    /// wire waits for it, so the server always ends with the newest state.
    func saveNow() async {
        saveTask?.cancel()
        if let inFlight = saveInFlight { await inFlight.value }
        let task = Task { await self.performSave() }
        saveInFlight = task
        await task.value
        if saveInFlight == task { saveInFlight = nil }
    }

    private func performSave() async {
        guard let track, status == .ready else { return }
        saveState = .saving
        do {
            let session = try await engine.serialize()
            let patch = TrackPatch(title: title, bpm: bpm, bars: shownBars, session: session,
                                   messages: messages, feed: Array(feed.suffix(200)))
            let meta = try await JamAPI.shared.saveTrack(track.id, patch: patch)
            lastSerialized = session
            saveState = .idle
            Self.log.notice("saved \(track.id, privacy: .public) updated_at=\(meta.updatedAt, privacy: .public)")
        } catch {
            saveState = .failed
            handle(error, during: "save")
        }
    }

    func flushSave() {
        Task { await saveNow() }
    }
}
