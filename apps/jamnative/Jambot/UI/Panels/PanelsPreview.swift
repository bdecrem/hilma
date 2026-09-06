import SwiftUI

// Debug-only fixture for screenshotting PanelsView without a live engine
// (no screen control — see PROGRESS.md). Covers every synth type + an
// effect + a mid-drag knob, so a `-panelsPreview` launch arg can present
// `PanelsPreviewHost` full-screen. Wiring that launch arg into
// `JambotApp.swift` is an integration request (see PROGRESS.md box 6) —
// this file stays self-contained either way.
enum PanelsFixture {
    static func descriptor() -> SessionDescription {
        func entry(_ path: String, _ sub: String, _ v: Double, _ min: Double, _ max: Double, _ unit: String, options: [String]? = nil) -> ParamEntry {
            ParamEntry(path: path, sub: sub, value: .number(v), descriptor: ParamDescriptor(min: min, max: max, unit: unit, options: options), isDefault: false)
        }
        func choice(_ path: String, _ sub: String, _ v: String, _ options: [String]) -> ParamEntry {
            ParamEntry(path: path, sub: sub, value: .string(v), descriptor: ParamDescriptor(min: 0, max: 0, unit: "choice", options: options), isDefault: false)
        }

        let jb202 = InstrumentDescription(id: "jb202", type: "jb202", active: true, voices: [], level: -3, params: [
            choice("jb202.osc1Waveform", "osc1Waveform", "sawtooth", ["sawtooth", "square", "triangle", "sine"]),
            entry("jb202.osc1Octave", "osc1Octave", 0, -2, 2, "semitones"),
            entry("jb202.osc1Detune", "osc1Detune", 0, -50, 50, "cents"),
            entry("jb202.osc1Level", "osc1Level", 0.8, 0, 1, "0-1"),
            choice("jb202.osc2Waveform", "osc2Waveform", "square", ["sawtooth", "square", "triangle", "sine"]),
            entry("jb202.osc2Octave", "osc2Octave", -1, -2, 2, "semitones"),
            entry("jb202.osc2Detune", "osc2Detune", 8, -50, 50, "cents"),
            entry("jb202.osc2Level", "osc2Level", 0.5, 0, 1, "0-1"),
            entry("jb202.filterCutoff", "filterCutoff", 1200, 100, 8000, "Hz"),
            entry("jb202.filterResonance", "filterResonance", 18, 0, 30, "0-1"),
            entry("jb202.filterEnvAmount", "filterEnvAmount", 0.4, 0, 1, "0-1"),
            entry("jb202.filterAttack", "filterAttack", 0.01, 0, 1, "s"),
            entry("jb202.filterDecay", "filterDecay", 0.3, 0, 2, "s"),
            entry("jb202.filterSustain", "filterSustain", 0.2, 0, 1, "0-1"),
            entry("jb202.filterRelease", "filterRelease", 0.2, 0, 2, "s"),
            entry("jb202.ampAttack", "ampAttack", 0.005, 0, 1, "s"),
            entry("jb202.ampDecay", "ampDecay", 0.15, 0, 2, "s"),
            entry("jb202.ampSustain", "ampSustain", 0.7, 0, 1, "0-1"),
            entry("jb202.ampRelease", "ampRelease", 0.2, 0, 2, "s"),
            entry("jb202.drive", "drive", 0.3, 0, 1, "0-1"),
        ])

        let jt30 = InstrumentDescription(id: "jt30", type: "jt30", active: true, voices: [], level: -2, params: [
            choice("jt30.waveform", "waveform", "sawtooth", ["sawtooth", "square"]),
            entry("jt30.cutoff", "cutoff", 900, 100, 5000, "Hz"),
            entry("jt30.resonance", "resonance", 22, 0, 30, "0-1"),
            entry("jt30.envMod", "envMod", 0.5, 0, 1, "0-1"),
            entry("jt30.decay", "decay", 0.3, 0, 1, "s"),
            entry("jt30.accent", "accent", 0.6, 0, 1, "0-1"),
            entry("jt30.drive", "drive", 0.2, 0, 1, "0-1"),
        ])

        let jt10 = InstrumentDescription(id: "jt10", type: "jt10", active: true, voices: [], level: -4, params: [
            entry("jt10.sawLevel", "sawLevel", 0.6, 0, 1, "0-1"),
            entry("jt10.pulseLevel", "pulseLevel", 0.3, 0, 1, "0-1"),
            entry("jt10.pulseWidth", "pulseWidth", 0.5, 0, 1, "0-1"),
            entry("jt10.subLevel", "subLevel", 0.4, 0, 1, "0-1"),
            choice("jt10.subMode", "subMode", "1", ["0", "1", "2"]),
            entry("jt10.cutoff", "cutoff", 2000, 100, 8000, "Hz"),
            entry("jt10.resonance", "resonance", 12, 0, 30, "0-1"),
            entry("jt10.envMod", "envMod", 0.5, 0, 1, "0-1"),
            entry("jt10.attack", "attack", 0.01, 0, 2, "s"),
            entry("jt10.decay", "decay", 0.3, 0, 2, "s"),
            entry("jt10.sustain", "sustain", 0.6, 0, 1, "0-1"),
            entry("jt10.release", "release", 0.4, 0, 2, "s"),
            entry("jt10.lfoRate", "lfoRate", 3, 0.1, 20, "Hz"),
            choice("jt10.lfoWaveform", "lfoWaveform", "triangle", ["triangle", "square", "sh", "sine", "ramp"]),
            entry("jt10.lfoToPitch", "lfoToPitch", 0, 0, 1, "0-1"),
            entry("jt10.lfoToFilter", "lfoToFilter", 0.2, 0, 1, "0-1"),
            entry("jt10.lfoToPW", "lfoToPW", 0, 0, 1, "0-1"),
        ])

        func voiceEntries(_ inst: String, _ voice: String) -> [ParamEntry] {
            [entry("\(inst).\(voice).level", "\(voice).level", 0.8, 0, 1, "0-1"),
             entry("\(inst).\(voice).decay", "\(voice).decay", 0.3, 0.05, 1.5, "s"),
             entry("\(inst).\(voice).tune", "\(voice).tune", 0, -12, 12, "semitones")]
        }
        let jt90Voices = ["kick", "snare", "clap", "ch", "oh", "crash"]
        let jt90 = InstrumentDescription(id: "jt90", type: "jt90", active: true, voices: jt90Voices, level: 0,
                                          params: jt90Voices.flatMap { voiceEntries("jt90", $0) })
        let jb01Voices = ["kick", "snare", "ch", "oh"]
        let jb01 = InstrumentDescription(id: "jb01", type: "jb01", active: true, voices: jb01Voices, level: -1,
                                          params: jb01Voices.flatMap { voiceEntries("jb01", $0) })

        return SessionDescription(
            bpm: 128, swing: 8, bars: 16,
            instruments: [jb202, jt30, jt10, jt90, jb01],
            arrangement: [],
            tracks: ["jb202": TrackMixState(mute: false, solo: false, volume: 0), "jt90": TrackMixState(mute: true, solo: false, volume: 0)],
            anySolo: false
        )
    }

    static let effects: [PanelEffectTarget] = [
        PanelEffectTarget(target: "jt90", chain: [
            PanelEffectChain(id: "d1", type: "delay",
                              params: ["time": .number(0.375), "feedback": .number(0.4), "mix": .number(0.25), "sync": .string("1/8")],
                              descriptors: [
                                "time": ParamDescriptor(min: 0.01, max: 1.5, unit: "s", options: nil),
                                "feedback": ParamDescriptor(min: 0, max: 0.95, unit: "0-1", options: nil),
                                "mix": ParamDescriptor(min: 0, max: 1, unit: "0-1", options: nil),
                                "sync": ParamDescriptor(min: 0, max: 0, unit: "choice", options: ["off", "1/4", "1/8", "1/16"]),
                              ]),
        ]),
    ]
}

/// Full-screen host for the fixture — a `-panelsPreview` launch arg (or an
/// Xcode canvas preview) can present this. See the integration note above.
struct PanelsPreviewHost: View {
    @State private var desc = PanelsFixture.descriptor()
    @State private var hits: [String: [String]] = [:]
    private let timer = Timer.publish(every: 0.6, on: .main, in: .common).autoconnect()

    /// `-panelsPreviewOpen <id>` seeds which accordion section opens (via
    /// the same UserDefaults key PanelsView remembers), so a headless
    /// screenshot run can pick a panel without tapping. `-panelsPreviewKnob`
    /// shows one knob full-screen with `debugForceDrag` for the mid-drag
    /// shot. See PROGRESS.md box 6 — no screen control available.
    init() {
        let args = CommandLine.arguments
        if let idx = args.firstIndex(of: "-panelsPreviewOpen"), idx + 1 < args.count {
            let value = args[idx + 1]
            UserDefaults.standard.set(value == "none" ? "__closed__" : value, forKey: "jam.panelsOpen")
        }
    }

    private var showDragDemo: Bool { CommandLine.arguments.contains("-panelsPreviewKnob") }

    var body: some View {
        if showDragDemo {
            dragDemo
        } else {
            panels
        }
    }

    private var dragDemo: some View {
        VStack(spacing: 40) {
            Text("KNOB — MID-DRAG").font(JBTheme.panelFont(14)).foregroundStyle(JBTheme.ink2)
            HStack(spacing: 40) {
                KnobControl(control: Control(path: "jb202.filterCutoff", label: "cutoff", min: 100, max: 8000, step: 1, unit: "Hz", scale: "log", value: 3400),
                            label: "CUTOFF", skin: .jb202, size: 56, debugForceDrag: true) { _ in }
                KnobControl(control: Control(path: "jt90.kick.decay", label: "decay", min: 0.05, max: 1.5, step: 0.01, unit: "s", scale: "lin", value: 0.42),
                            label: "DECAY", skin: .jt90, size: 44, debugForceDrag: true) { _ in }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(PanelSkin.jb202.bg)
    }

    private var panels: some View {
        NavigationStack {
            PanelsView(
                desc: desc,
                hits: hits,
                effects: PanelsFixture.effects,
                onParam: { path, value, label in
                    print("[panels preview] onParam \(path) = \(value) (\(label))")
                },
                onMix: { id, what, on in
                    var tracks = desc.tracks ?? [:]
                    var t = tracks[id] ?? TrackMixState(mute: false, solo: false, volume: 0)
                    if what == "mute" { t.mute = on } else { t.solo = on }
                    tracks[id] = t
                    desc.tracks = tracks
                    desc.anySolo = tracks.values.contains { $0.solo }
                }
            )
            .navigationTitle("PANELS PREVIEW")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(JBTheme.panel, for: .navigationBar)
        }
        .onReceive(timer) { _ in
            hits = Bool.random() ? ["jt90": ["kick", "oh"].filter { _ in Bool.random() }] : [:]
        }
    }
}

#Preview("Panels — all synths") {
    PanelsPreviewHost()
}
