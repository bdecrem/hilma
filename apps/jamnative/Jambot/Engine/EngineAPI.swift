import Foundation

// The protocol both the engine-host agent (2a) and the screens agent (2b)
// build against. Method names/args/results mirror the bridge call table in
// DESIGN.md exactly — keep the two in sync; add calls, don't rename them.
//
// 2a implements `EngineHost` (real WKWebView-backed engine).
// 2b implements/consumes `MockEngine` (below) so screens compile and can be
// screenshotted before the real engine exists, then swaps to `EngineHost` in
// stage 3.

// MARK: - Codable types (mirrors src/app/jam/jambot.ts + controls.ts)

struct ParamDescriptor: Codable, Equatable {
    var min: Double
    var max: Double
    var unit: String
    var options: [String]?
    /// The engine's default for numeric params (double-tap reset on a knob);
    /// nil for choice params or when the descriptor has none.
    var defaultValue: Double?

    init(min: Double, max: Double, unit: String, options: [String]?, defaultValue: Double? = nil) {
        self.min = min; self.max = max; self.unit = unit; self.options = options; self.defaultValue = defaultValue
    }

    private enum CodingKeys: String, CodingKey { case min, max, unit, options, defaultValue = "default" }
}

/// One insert on an effect chain — the web's `describeSession().effects[].chain[]`.
struct EffectChainDescription: Codable, Equatable, Identifiable {
    var id: String
    var type: String
    var params: [String: JSONValue]
    var descriptors: [String: ParamDescriptor]
}

/// Effect chain on one target (`jt90`, `jb202`, `jt90.oh`, `master`, …).
struct EffectTargetDescription: Codable, Equatable, Identifiable {
    var id: String { target }
    var target: String
    var chain: [EffectChainDescription]
}

struct ParamEntry: Codable, Equatable, Identifiable {
    var id: String { path }
    var path: String
    var sub: String
    var value: JSONValue
    var descriptor: ParamDescriptor
    var isDefault: Bool
}

struct InstrumentDescription: Codable, Equatable, Identifiable {
    var id: String
    var type: String
    var active: Bool
    var voices: [String]
    var level: Double
    var params: [ParamEntry]
}

struct TrackMixState: Codable, Equatable {
    var mute: Bool
    var solo: Bool
    var volume: Double
}

struct ArrangementEntry: Codable, Equatable {
    var bars: Int
    var patterns: [String: String]
}

/// Full description of session state — the JS engine's `describeSession()`
/// output, decoded on the Swift side for the UI to render directly.
struct SessionDescription: Codable, Equatable {
    var bpm: Int
    var swing: Double
    var bars: Int
    var instruments: [InstrumentDescription]
    var arrangement: [ArrangementEntry]
    var tracks: [String: TrackMixState]?
    var anySolo: Bool?
    /// Effect chains (delay/reverb/… inserts) — decoded leniently: a shape the
    /// app does not understand yields `nil` rather than failing the whole
    /// description.
    var effects: [EffectTargetDescription]?

    init(bpm: Int, swing: Double, bars: Int, instruments: [InstrumentDescription], arrangement: [ArrangementEntry],
         tracks: [String: TrackMixState]?, anySolo: Bool?, effects: [EffectTargetDescription]? = nil) {
        self.bpm = bpm; self.swing = swing; self.bars = bars; self.instruments = instruments
        self.arrangement = arrangement; self.tracks = tracks; self.anySolo = anySolo; self.effects = effects
    }

    private enum CodingKeys: String, CodingKey { case bpm, swing, bars, instruments, arrangement, tracks, anySolo, effects }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        bpm = try c.decode(Int.self, forKey: .bpm)
        swing = try c.decode(Double.self, forKey: .swing)
        bars = try c.decode(Int.self, forKey: .bars)
        instruments = try c.decode([InstrumentDescription].self, forKey: .instruments)
        arrangement = try c.decode([ArrangementEntry].self, forKey: .arrangement)
        tracks = try c.decodeIfPresent([String: TrackMixState].self, forKey: .tracks)
        anySolo = try c.decodeIfPresent(Bool.self, forKey: .anySolo)
        effects = try? c.decodeIfPresent([EffectTargetDescription].self, forKey: .effects)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(bpm, forKey: .bpm)
        try c.encode(swing, forKey: .swing)
        try c.encode(bars, forKey: .bars)
        try c.encode(instruments, forKey: .instruments)
        try c.encode(arrangement, forKey: .arrangement)
        try c.encodeIfPresent(tracks, forKey: .tracks)
        try c.encodeIfPresent(anySolo, forKey: .anySolo)
        try c.encodeIfPresent(effects, forKey: .effects)
    }
}

/// A single fader/knob in the Controls sheet — port of controls.ts `Control`.
struct Control: Codable, Equatable, Identifiable {
    var id: String { path }
    var path: String
    var label: String
    var min: Double
    var max: Double
    var step: Double
    var unit: String
    var scale: String // "lin" | "log"
    var value: Double
}

struct ControlGroup: Codable, Equatable, Identifiable {
    var id: String
    var title: String
    var subtitle: String?
    var controls: [Control]
}

/// Render output: PCM as planar Int16 (channel 0 then channel 1), decoded
/// from the bridge's base64 chunks by `EngineHost` before this reaches
/// callers — so both EngineHost and MockEngine hand back the same shape.
struct RenderResult: Codable, Equatable {
    var bars: Int
    var bpm: Int
    var hasArrangement: Bool
    var message: String
    var sampleRate: Double
    var channels: Int
    var length: Int
    var pcm: [Int16] // planar: length*channels samples
}

/// Streamed events from a running agent turn (`agent` bridge call).
enum AgentEvent: Equatable {
    case tool(name: String, input: JSONValue)
    case toolResult(name: String, result: String, isError: Bool)
    case text(String)
    case render(RenderResult)
    case end(stopReason: String, desc: SessionDescription)
    case failure(String)
}

/// What `EngineHost.loadSession` needs and returns.
struct LoadedSession: Equatable {
    var desc: SessionDescription
}

// MARK: - The protocol

/// Async surface both the real WKWebView engine host and the mock conform
/// to. One instance per open track; the screens layer never touches the
/// bridge directly.
protocol EngineAPI: AnyObject {
    /// Waits for the engine bundle to finish loading (`jam.ready()` inside
    /// the hidden WKWebView). Call once before any other method.
    func ready() async throws

    /// Loads a saved session (or creates a fresh one when `session` is nil)
    /// at the given starting bpm.
    func loadSession(session: JSONValue?, bpm: Int) async throws -> LoadedSession

    /// Serializes current engine state for saving to the track record.
    func serialize() async throws -> JSONValue

    /// Re-describes current state (after a tool call, tweak, etc. that
    /// doesn't already return a fresh `desc`).
    func describe() async throws -> SessionDescription

    /// Builds the Controls-sheet fader groups from current state.
    func controls() async throws -> [ControlGroup]

    /// Sets one fader/knob value by dotted path (e.g. "jb202.cutoff").
    /// In song mode this also writes through into every saved pattern's
    /// params, mirroring the web app's Studio.onParam.
    func tweak(path: String, value: Double) async throws -> SessionDescription

    /// Sets a choice param (waveform, sub mode, LFO shape, delay sync…) by
    /// dotted path — the same `tweak` tool, string-valued. Song-mode
    /// write-through applies as for `tweak`.
    func tweakChoice(path: String, value: String) async throws -> SessionDescription

    /// Sets a track-level control: bpm, swing, or bar count.
    func setTrack(key: String, value: Double) async throws -> SessionDescription

    /// Mutes or solos one instrument.
    func mix(id: String, what: String, on: Bool) async throws -> SessionDescription

    /// Renders either the whole song arrangement or one section, returning
    /// decoded PCM ready for `AudioPlayer`.
    func render(scope: RenderScope) async throws -> RenderResult

    /// Runs one agent turn. Events stream as they happen; the stream
    /// finishes after `.end` or `.failure`. `notes` carries the
    /// `[controls] …` slider-change notes the web app appends before a
    /// message (see DESIGN.md / Studio.tsx).
    func agent(task: String, messages: [AgentMessage], notes: [String]) -> AsyncThrowingStream<AgentEvent, Error>

    /// The Anthropic-format history after the last `agent` turn — the run
    /// appends the user turn, the assistant turns and every tool result to
    /// the messages it was given. Save this with the track (PUT `messages`).
    /// Added in stage 2a; a default (empty) implementation keeps `MockEngine`
    /// conforming.
    func agentMessages() async throws -> [AgentMessage]

    // Stage 5 — sequencer (DESIGN.md "Bridge additions").

    /// Voices hitting at absolute 16th `step` of the render playing under
    /// `scope`: instId → voice names (mono synths report ["gate"]). Drives
    /// the Panels hit LEDs and the Seq playing pill. Cheap; call each 16th.
    func hits(step: Int, scope: RenderScope) async throws -> [String: [String]]

    /// One sequencer edit. `section` = arrangement index in song mode
    /// (edits the saved pattern that section plays on `inst`, mirrored
    /// into the live node when it is the loaded one); nil = loop mode (the
    /// live node). Ops: cycleDrum {voice,i}, toggleGate {i}, setNote {i,note},
    /// toggleAccent {i}, toggleSlide {i}, resize {bars}, clear. See `SeqOp`.
    func seq(op: String, inst: String, section: Int?, args: JSONValue) async throws -> SeqResult

    /// Reads the pattern the Seq view shows for `inst` (same target rule as `seq`).
    func pattern(inst: String, section: Int?) async throws -> SeqPattern
}

extension EngineAPI {
    func agentMessages() async throws -> [AgentMessage] { [] }
}

enum RenderScope: Equatable {
    case song
    case section(index: Int)

    /// The bridge's `{ kind, index? }` shape.
    var bridgeValue: [String: Any] {
        switch self {
        case .song: return ["kind": "song"]
        case .section(let index): return ["kind": "section", "index": index]
        }
    }
}

// MARK: - Sequencer (stage 5; mirrors src/app/jam/seq/model.ts + the bridge's `pattern` / `seq`)

struct DrumStep: Codable, Equatable {
    var velocity: Double
    var accent: Bool

    static let off = DrumStep(velocity: 0, accent: false)
    var isOn: Bool { velocity > 0 }
    var isAccent: Bool { velocity > 0 && accent }
}

struct MonoStep: Codable, Equatable {
    var note: String
    var gate: Bool
    var accent: Bool
    var slide: Bool
}

/// The dense pattern the Seq view edits — every canonical voice present
/// (drums) or every step present (mono), `length` steps (16 × bars).
enum SeqPatternData: Equatable {
    case drums([String: [DrumStep]])
    case mono([MonoStep])
}

/// Result of the `pattern` bridge call and the `pattern` half of `seq`.
struct SeqPattern: Codable, Equatable {
    /// "drums" | "mono"
    var kind: String
    /// Instrument type the pattern belongs to (jt90, jb202, …) — picks the voice list / pitch range.
    var type: String
    /// Saved pattern name in song mode ("A", "B", …); the loaded pattern's name in loop mode; nil when the section does not play this instrument.
    var name: String?
    var length: Int
    /// Song mode: the chosen section does not play this instrument (nothing to edit).
    var silent: Bool
    /// Song mode: the section references a pattern name that is not saved.
    var missing: Bool
    var data: SeqPatternData

    var bars: Int { max(1, length / 16) }
    var isDrums: Bool { if case .drums = data { return true } else { return false } }

    var drums: [String: [DrumStep]]? { if case .drums(let d) = data { return d } else { return nil } }
    var mono: [MonoStep]? { if case .mono(let m) = data { return m } else { return nil } }

    init(kind: String, type: String, name: String?, length: Int, silent: Bool = false, missing: Bool = false, data: SeqPatternData) {
        self.kind = kind; self.type = type; self.name = name; self.length = length
        self.silent = silent; self.missing = missing; self.data = data
    }

    private enum CodingKeys: String, CodingKey { case kind, type, name, length, silent, missing, pattern }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        kind = try c.decode(String.self, forKey: .kind)
        type = try c.decode(String.self, forKey: .type)
        name = try c.decodeIfPresent(String.self, forKey: .name)
        length = try c.decode(Int.self, forKey: .length)
        silent = try c.decodeIfPresent(Bool.self, forKey: .silent) ?? false
        missing = try c.decodeIfPresent(Bool.self, forKey: .missing) ?? false
        if kind == "drums" {
            data = .drums(try c.decode([String: [DrumStep]].self, forKey: .pattern))
        } else {
            data = .mono(try c.decode([MonoStep].self, forKey: .pattern))
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(kind, forKey: .kind)
        try c.encode(type, forKey: .type)
        try c.encodeIfPresent(name, forKey: .name)
        try c.encode(length, forKey: .length)
        try c.encode(silent, forKey: .silent)
        try c.encode(missing, forKey: .missing)
        switch data {
        case .drums(let d): try c.encode(d, forKey: .pattern)
        case .mono(let m): try c.encode(m, forKey: .pattern)
        }
    }
}

/// What a `seq` edit returns: fresh session description plus the target
/// pattern after the edit (dense), so the view needs no second round trip.
struct SeqResult: Equatable {
    var desc: SessionDescription
    var pattern: SeqPattern
}

/// Sequencer ops the bridge accepts (`seq { op, inst, section?, args }`).
enum SeqOp {
    case cycleDrum(voice: String, i: Int)
    case toggleGate(i: Int)
    case setNote(i: Int, note: String)
    case toggleAccent(i: Int)
    case toggleSlide(i: Int)
    case resize(bars: Int)
    case clear

    var name: String {
        switch self {
        case .cycleDrum: return "cycleDrum"
        case .toggleGate: return "toggleGate"
        case .setNote: return "setNote"
        case .toggleAccent: return "toggleAccent"
        case .toggleSlide: return "toggleSlide"
        case .resize: return "resize"
        case .clear: return "clear"
        }
    }

    var args: JSONValue {
        switch self {
        case .cycleDrum(let voice, let i): return .object(["voice": .string(voice), "i": .number(Double(i))])
        case .toggleGate(let i), .toggleAccent(let i), .toggleSlide(let i): return .object(["i": .number(Double(i))])
        case .setNote(let i, let note): return .object(["i": .number(Double(i)), "note": .string(note)])
        case .resize(let bars): return .object(["bars": .number(Double(bars))])
        case .clear: return .object([:])
        }
    }
}

extension EngineAPI {
    /// Typed convenience over `seq(op:inst:section:args:)`.
    func seq(_ op: SeqOp, inst: String, section: Int?) async throws -> SeqResult {
        try await seq(op: op.name, inst: inst, section: section, args: op.args)
    }
}

// MARK: - Mock, for screens (2b) to build and screenshot against.

final class MockEngine: EngineAPI, ObservableObject {
    private var desc = SessionDescription(
        bpm: 128,
        swing: 0,
        bars: 16,
        instruments: [
            InstrumentDescription(id: "jb202", type: "jb202", active: true, voices: [], level: -3,
                                   params: [ParamEntry(path: "jb202.cutoff", sub: "cutoff", value: .number(1200),
                                                        descriptor: ParamDescriptor(min: 100, max: 8000, unit: "Hz", options: nil),
                                                        isDefault: false)]),
            InstrumentDescription(id: "jt90", type: "jt90", active: true, voices: ["kick", "snare", "hats"], level: 0, params: []),
        ],
        arrangement: [ArrangementEntry(bars: 16, patterns: ["jb202": "a", "jt90": "a"])],
        tracks: nil,
        anySolo: false
    )

    func ready() async throws {}

    func loadSession(session: JSONValue?, bpm: Int) async throws -> LoadedSession {
        LoadedSession(desc: desc)
    }

    func serialize() async throws -> JSONValue { .object([:]) }

    func describe() async throws -> SessionDescription { desc }

    func controls() async throws -> [ControlGroup] {
        [ControlGroup(id: "jb202", title: "JB202 bass", subtitle: nil, controls: [
            Control(path: "jb202.cutoff", label: "cutoff", min: 100, max: 8000, step: 1, unit: "Hz", scale: "log", value: 1200),
            Control(path: "jb202.level", label: "level", min: -24, max: 6, step: 0.5, unit: "dB", scale: "lin", value: -3),
        ])]
    }

    func tweak(path: String, value: Double) async throws -> SessionDescription { desc }

    func tweakChoice(path: String, value: String) async throws -> SessionDescription { desc }

    func setTrack(key: String, value: Double) async throws -> SessionDescription {
        if key == "bpm" { desc.bpm = Int(value) }
        if key == "bars" { desc.bars = Int(value) }
        return desc
    }

    func mix(id: String, what: String, on: Bool) async throws -> SessionDescription { desc }

    func render(scope: RenderScope) async throws -> RenderResult {
        RenderResult(bars: desc.bars, bpm: desc.bpm, hasArrangement: true, message: "mock render",
                     sampleRate: 44100, channels: 2, length: 0, pcm: [])
    }

    func agent(task: String, messages: [AgentMessage], notes: [String]) -> AsyncThrowingStream<AgentEvent, Error> {
        AsyncThrowingStream { continuation in
            continuation.yield(.text("(mock) got it."))
            continuation.yield(.end(stopReason: "end_turn", desc: desc))
            continuation.finish()
        }
    }

    // MARK: Sequencer (canned: a four-on-the-floor jt90 and an octave bass line, edits applied in memory)

    private var mockPatterns: [String: SeqPattern] = [
        "jt90": SeqPattern(kind: "drums", type: "jt90", name: "A", length: 16, data: .drums({
            var d: [String: [DrumStep]] = [:]
            for v in ["kick", "snare", "clap", "rimshot", "lowtom", "midtom", "hitom", "ch", "oh", "crash", "ride"] {
                d[v] = Array(repeating: .off, count: 16)
            }
            for i in stride(from: 0, to: 16, by: 4) { d["kick"]![i] = DrumStep(velocity: 1, accent: i == 0) }
            for i in [4, 12] { d["clap"]![i] = DrumStep(velocity: 1, accent: false) }
            for i in stride(from: 0, to: 16, by: 2) { d["ch"]![i] = DrumStep(velocity: 0.8, accent: false) }
            for i in stride(from: 2, to: 16, by: 4) { d["oh"]![i] = DrumStep(velocity: 1, accent: false) }
            return d
        }())),
        "jb202": SeqPattern(kind: "mono", type: "jb202", name: "A", length: 16, data: .mono(
            (0..<16).map { i in MonoStep(note: i % 4 == 2 ? "A2" : "A1", gate: i % 2 == 1, accent: i == 7, slide: i == 11) }
        )),
    ]

    func hits(step: Int, scope: RenderScope) async throws -> [String: [String]] {
        var out: [String: [String]] = [:]
        let local = ((step % 16) + 16) % 16
        if let d = mockPatterns["jt90"]?.drums {
            let voices = d.filter { $0.value[local].isOn }.map(\.key).sorted()
            if !voices.isEmpty { out["jt90"] = voices }
        }
        if let m = mockPatterns["jb202"]?.mono, m[local].gate { out["jb202"] = ["gate"] }
        return out
    }

    func pattern(inst: String, section: Int?) async throws -> SeqPattern {
        guard let p = mockPatterns[inst] else { throw EngineError.bridge("no instrument '\(inst)' in this session") }
        return p
    }

    func seq(op: String, inst: String, section: Int?, args: JSONValue) async throws -> SeqResult {
        guard var p = mockPatterns[inst] else { throw EngineError.bridge("no instrument '\(inst)' in this session") }
        func arg(_ k: String) -> JSONValue? { if case .object(let o) = args { return o[k] } else { return nil } }
        func int(_ k: String) -> Int { if case .number(let n) = arg(k) ?? .null { return Int(n) } else { return 0 } }
        func str(_ k: String) -> String { if case .string(let s) = arg(k) ?? .null { return s } else { return "" } }
        switch (op, p.data) {
        case ("cycleDrum", .drums(var d)):
            let v = str("voice"), i = int("i")
            var row = d[v] ?? Array(repeating: .off, count: p.length)
            if i < row.count {
                let s = row[i]
                row[i] = !s.isOn ? DrumStep(velocity: 1, accent: false) : !s.accent ? DrumStep(velocity: s.velocity, accent: true) : .off
            }
            d[v] = row
            p.data = .drums(d)
        case ("toggleGate", .mono(var m)): let i = int("i"); if i < m.count { m[i].gate.toggle() }; p.data = .mono(m)
        case ("toggleAccent", .mono(var m)): let i = int("i"); if i < m.count { m[i].accent.toggle() }; p.data = .mono(m)
        case ("toggleSlide", .mono(var m)): let i = int("i"); if i < m.count { m[i].slide.toggle() }; p.data = .mono(m)
        case ("setNote", .mono(var m)): let i = int("i"); if i < m.count { m[i].note = str("note") }; p.data = .mono(m)
        case ("resize", _):
            let len = max(1, int("bars")) * 16
            switch p.data {
            case .drums(let d):
                p.data = .drums(d.mapValues { row in Array((row + Array(repeating: .off, count: max(0, len - row.count))).prefix(len)) })
            case .mono(let m):
                let last = m.last?.note ?? "C2"
                p.data = .mono(Array((m + (0..<max(0, len - m.count)).map { _ in MonoStep(note: last, gate: false, accent: false, slide: false) }).prefix(len)))
            }
            p.length = len
        case ("clear", .drums(let d)): p.data = .drums(d.mapValues { $0.map { _ in .off } })
        case ("clear", .mono(let m)): p.data = .mono(m.map { MonoStep(note: $0.note, gate: false, accent: false, slide: false) })
        default: throw EngineError.bridge("seq: '\(op)' does not apply to \(inst)")
        }
        mockPatterns[inst] = p
        return SeqResult(desc: desc, pattern: p)
    }
}
