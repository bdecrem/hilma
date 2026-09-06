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
}

extension EngineAPI {
    func agentMessages() async throws -> [AgentMessage] { [] }
}

enum RenderScope: Equatable {
    case song
    case section(index: Int)
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
}
