import Foundation
import Observation
import os

/// Drives one open track: loads it into the engine, mirrors engine state
/// for the views, runs agent turns, and autosaves. Mirrors the shape of
/// `Studio.tsx` (web) — see DESIGN.md for the bridge contract this rides on.
///
/// Stage 10 additions: render scope (section audition from the Seq tab),
/// hit polling for the Panels LEDs, the sequencer's shared model + note
/// coalescer, string-valued choice params, rename / publish, the last
/// render kept for Bounce, the on-device render cache, and Now Playing.
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
    var title: String = "Untitled" {
        didSet { if sharing.title != title { sharing.title = title } }
    }
    var desc: SessionDescription? = nil
    var groups: [ControlGroup] = []
    var feed: [FeedItem] = []
    var input: String = ""
    var busy = false
    var controlsOpen = false
    var bounceOpen = false

    var playing = false
    var rendering = false
    var hasBuffer = false
    var pos: Double = 0
    /// ABSOLUTE 16th of the playing render (nil when stopped) — the Seq
    /// view needs the absolute index; the LED strip uses `ledStep`.
    var playStep16: Int? = nil
    var ledStep: Int? { playStep16.map { $0 % 16 } }
    var saveState: SaveState = .idle
    enum SaveState: Equatable { case idle, saving, failed }

    /// Rename / publish / share state for the header (seeded from the track).
    let sharing = SharingState(title: "Untitled")

    /// Audition scope the Seq tab asks for (`.section(i)` while "Loop
    /// section" is lit) and the scope of the render that is playing now.
    private(set) var renderScope: RenderScope = .song
    private(set) var playedScope: RenderScope = .song
    var sectionNow: Int? { if case .section(let i) = playedScope { return i + 1 } else { return nil } }

    /// Voices hitting at the current 16th (instId → voices), polled from the
    /// engine while `hitsWanted` (the Panels tab is showing).
    private(set) var hits: [String: [String]] = [:]
    var hitsWanted = false { didSet { if !hitsWanted { hits = [:]; hitsStep = nil } } }
    private var hitsStep: Int? = nil
    private var hitsInFlight = false
    /// Hit polls that answered with at least one voice (debug readout).
    private(set) var hitPolls = 0
    private(set) var hitPollsLit = 0

    /// Sequencer picks, remembered per open track (the web keeps them in the sheet).
    var seqInst: String? = nil
    var seqSection: Int? = nil
    let seqNotes = SeqNoteCoalescer()
    /// The Seq tab's model — shared so the debug script can drive it.
    let seqModel = SeqModel()

    /// The last render that reached the player (what Bounce writes out).
    private(set) var lastRender: RenderResult? = nil

    private var track: Track?
    /// Anthropic-format history. The engine's agent loop appends the user
    /// turn, assistant turns and tool results itself (runAgent), so this is
    /// only ever replaced wholesale from `agentMessages()` after a turn.
    private var messages: [AgentMessage] = []
    /// Pending `[controls]` notes for the next message, keyed (a slider's
    /// label, a sequencer target) — latest text per key wins, like the web's
    /// controlNotesRef map.
    private var pendingNotes: [(key: String, text: String)] = []
    private var lastRenderBars: Int? = nil
    /// Last session JSON that went to the server — what a crashed engine
    /// is reloaded from (the engine's own copy is gone then).
    private var lastSerialized: JSONValue? = nil
    private var renderTask: Task<Void, Never>?
    private var renderSeq = 0
    private var cacheTask: Task<Void, Never>?
    private var renderId = 0
    private var saveTask: Task<Void, Never>?
    private var saveInFlight: Task<Void, Never>?
    private var playheadTimer: Timer?
    private var closed = false

    var bpm: Int { desc?.bpm ?? track?.bpm ?? 128 }
    var bars: Int { desc?.bars ?? track?.bars ?? 16 }
    var swing: Double { desc?.swing ?? 0 }
    var inSong: Bool { (desc?.arrangement.count ?? 0) > 0 }
    /// Bars the transport shows — the render's length (an arrangement is the
    /// sum of its sections; a section audition its own length), like the
    /// web's `shownBars`.
    var shownBars: Int { lastRenderBars ?? bars }
    /// Live from the session like the web (`stripFromDesc`); the saved
    /// track's strip only until the first `describe()` lands.
    var strip: Strip? { desc?.strip ?? track?.strip }
    var barNow: Int { min(shownBars, Int(pos * Double(shownBars)) + 1) }
    var engineStamp: String { EngineFactory.host?.engineVersion ?? "mock" }
    /// The transport readout — "section 2 · bar 3/8" during an audition.
    var transportLabel: String {
        if rendering { return "rendering" }
        if !hasBuffer { return "no sound yet" }
        let sec = sectionNow.map { "section \($0) · " } ?? ""
        if playing { return "\(sec)bar \(barNow)/\(shownBars)" }
        return sectionNow != nil ? "\(sec)ready" : "ready"
    }

    init(trackId: String, initialMeta: TrackMeta?, engine: EngineAPI) {
        self.trackId = trackId
        self.engine = engine
        if let initialMeta {
            self.title = initialMeta.title
            sharing.apply(initialMeta)
        }
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
            sharing.apply(track.meta)
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
            attachNowPlaying()
            // Cache-first: an unchanged track plays instantly.
            let started = Date()
            if let key = await cacheKey(), let cached = await RenderCache.shared.load(trackId: trackId, key: key) {
                applyRender(cached, scope: .song, cache: false)
                Self.log.notice("render from cache: \(cached.bars) bars in \(String(format: "%.2f", Date().timeIntervalSince(started)), privacy: .public)s")
            } else {
                await renderNow()
            }
        } catch {
            if isAuthLoss(error) { onAuthLost?(); return }
            status = .error(error.localizedDescription)
            Self.log.error("load \(self.trackId, privacy: .public) failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Leaving the studio: stop the clock and playback, flush the save,
    /// release the lock-screen entry.
    func close() {
        guard !closed else { return }
        closed = true
        stopPlayheadClock()
        if player.isPlaying { player.stop() }
        NowPlaying.shared.detach(player: player)
        flushSave()
    }

    private func attachNowPlaying() {
        NowPlaying.shared.attach(player: player, title: title)
        NowPlaying.shared.onToggle = { [weak self] in guard let self else { return false }; self.togglePlay(); return true }
        NowPlaying.shared.onPlay = { [weak self] in guard let self, self.hasBuffer else { return false }; self.player.play(); return true }
        NowPlaying.shared.onPause = { [weak self] in guard let self else { return false }; self.player.stop(); return true }
        NowPlaying.shared.onStop = { [weak self] in guard let self else { return false }; self.player.stop(); return true }
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
        guard playing else {
            if pos != 0 { pos = 0 }
            if playStep16 != nil { playStep16 = nil }
            if !hits.isEmpty { hits = [:] }
            hitsStep = nil
            return
        }
        pos = player.position()
        let totalSteps = max(1, shownBars * 16)
        let step = Int(pos * Double(totalSteps)) % totalSteps
        if playStep16 != step { playStep16 = step }
        if hitsWanted, step != hitsStep { pollHits(step) }
    }

    /// One `hits` round trip per 16th while the Panels tab is up. A poll
    /// still in flight is not stacked — the next tick asks again.
    private func pollHits(_ step: Int) {
        guard !hitsInFlight else { return }
        hitsStep = step
        hitsInFlight = true
        let scope = playedScope
        Task {
            defer { hitsInFlight = false }
            if let h = try? await engine.hits(step: step, scope: scope) {
                hitPolls += 1
                if !h.isEmpty { hitPollsLit += 1 }
                if hitsWanted { hits = h }
            }
        }
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
                note(key: label, text: "\(label) -> \(value)")
                scheduleSave()
            } catch { handle(error, during: "tweak \(path)") }
        }
    }

    /// The Panels tab's knobs and choice pills: numbers go through `tweak`,
    /// strings (waveform, sub mode, delay sync…) through `tweakChoice`.
    func onPanelParam(path: String, value: PanelParamValue, label: String) {
        switch value {
        case .number(let v):
            onParam(path: path, value: v, label: label)
        case .string(let s):
            Task {
                do {
                    desc = try await engine.tweakChoice(path: path, value: s)
                    scheduleRender()
                    note(key: label, text: "\(label) -> \(s)")
                    scheduleSave()
                } catch { handle(error, during: "tweak \(path)") }
            }
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

    /// One note per key, latest text wins (the web's controlNotesRef).
    private func note(key: String, text: String) {
        if let i = pendingNotes.firstIndex(where: { $0.key == key }) { pendingNotes[i].text = text } else { pendingNotes.append((key, text)) }
    }

    // MARK: - Sequencer (Seq tab)

    /// An edit landed in the engine: re-render (300 ms), remember the
    /// coalesced note, autosave.
    func onSeqEdited(key: String, text: String) {
        note(key: key, text: text)
        scheduleRender(delayMs: 300)
        scheduleSave()
    }

    func onSeqDesc(_ d: SessionDescription) {
        desc = d
    }

    /// Sequencer audition: loop one section or the whole song. Re-renders
    /// on change (150 ms), like the web's `setRenderScope`.
    func setRenderScope(_ scope: RenderScope) {
        guard scope != renderScope else { return }
        renderScope = scope
        guard status == .ready else { return }
        if case .section = scope { scheduleRender(delayMs: 150) } else if inSong { scheduleRender(delayMs: 150) }
    }

    // MARK: - Render

    private func scheduleRender(delayMs: Int = 220) {
        renderTask?.cancel()
        renderTask = Task {
            try? await Task.sleep(nanoseconds: UInt64(delayMs) * 1_000_000)
            guard !Task.isCancelled else { return }
            await renderNow()
        }
    }

    func renderNow() async {
        guard status == .ready else { return }
        renderSeq += 1
        let seq = renderSeq
        var scope = renderScope
        if case .section(let i) = scope, i >= (desc?.arrangement.count ?? 0) {
            // The arrangement changed under us (agent cleared or shortened it).
            scope = .song
            renderScope = .song
        }
        rendering = true
        defer { if seq == renderSeq { rendering = false } }
        do {
            let started = Date()
            let result = try await engine.render(scope: scope)
            guard seq == renderSeq else { return }
            applyRender(result, scope: scope)
            Self.log.notice("render applied (\(scope == .song ? "song" : "section", privacy: .public)): \(result.bars) bars @ \(result.bpm), RMS(1s)=\(String(format: "%.4f", Self.rmsFirstSecond(result)), privacy: .public) in \(String(format: "%.2f", Date().timeIntervalSince(started)), privacy: .public)s, pos=\(String(format: "%.3f", self.player.position()), privacy: .public)")
        } catch {
            hasBuffer = player.hasBuffer()
            handle(error, during: "render")
        }
    }

    private func applyRender(_ result: RenderResult, scope: RenderScope, cache: Bool = true, autoplay: Bool = false) {
        player.load(result)
        hasBuffer = player.hasBuffer()
        lastRenderBars = result.bars
        lastRender = result
        playedScope = scope
        renderId += 1
        if autoplay, hasBuffer, !player.isPlaying { player.play() }
        if scope == .song {
            if cache { scheduleCacheSave(result, id: renderId) } else { cacheTask?.cancel() }
        }
    }

    // MARK: Render cache

    private func cacheKey() async -> String? {
        guard let session = try? await engine.serialize() else { return nil }
        return RenderCache.key(session: session, stamp: engineStamp)
    }

    /// Save a whole-track render 1.5 s after it lands; a newer render
    /// cancels the pending save, so a slider storm writes once.
    private func scheduleCacheSave(_ result: RenderResult, id: Int) {
        cacheTask?.cancel()
        cacheTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            guard !Task.isCancelled, let self, self.renderId == id else { return }
            guard let key = await self.cacheKey(), !Task.isCancelled, self.renderId == id else { return }
            await RenderCache.shared.save(trackId: self.trackId, key: key, result)
        }
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

    // MARK: - Header actions

    func rename(_ newTitle: String) {
        let clean = String(newTitle.trimmingCharacters(in: .whitespacesAndNewlines).prefix(80))
        guard !clean.isEmpty else { return }
        title = clean
        NowPlaying.shared.title = clean
        scheduleSave()
    }

    /// Publish / unpublish: save first (so what goes public is current),
    /// then flip on the server and mirror the result.
    func togglePublish() async {
        guard !sharing.busy, status == .ready else { return }
        sharing.busy = true
        sharing.error = nil
        defer { sharing.busy = false }
        await saveNow()
        guard saveState != .failed else { sharing.error = "Couldn't save before publishing."; return }
        do {
            let meta = sharing.published ? try await JamAPI.shared.unpublish(trackId) : try await JamAPI.shared.publish(trackId)
            sharing.apply(meta)
            if var t = track { t.publishedAt = meta.publishedAt; t.slug = meta.slug; track = t }
            Self.log.notice("\(meta.publishedAt == nil ? "unpublished" : "published", privacy: .public) \(self.trackId, privacy: .public) slug=\(meta.slug ?? "-", privacy: .public)")
        } catch {
            sharing.error = error.localizedDescription
            handle(error, during: "publish")
        }
    }

    // MARK: - Chat

    func send(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !busy, status == .ready else { return }
        input = ""
        feed.append(.user(id: UUID().uuidString, text: trimmed))
        if title == "Untitled" { title = Self.autoTitle(from: trimmed) }
        busy = true

        let notes = pendingNotes.map(\.text)
        pendingNotes = []
        seqNotes.reset()

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
                    // The agent's render is the whole track; it starts
                    // playing like on the web (autoplay).
                    renderScope = .song
                    applyRender(result, scope: .song, autoplay: true)
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
