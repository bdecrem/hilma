import SwiftUI

// Shared types, palette and param helpers for the Panels tab. Port of
// src/app/jam/alt/panels.tsx (structure/helpers) + alt/panels-mobile.css
// (--ph-* palette) + alt/skins.css (knob face/pointer colours). See
// DESIGN.md "Panels" row and PROGRESS.md box 6.

// MARK: - onParam / onMix

/// A value a panel control writes back. Faders-sheet controls are always
/// numeric (see ControlsMath), but Panels also has choice controls
/// (waveform, sub mode, LFO shape, delay sync…) whose value is a string —
/// mirroring the web's `OnParam = (path, value: number | string, label) => void`.
enum PanelParamValue: Equatable {
    case number(Double)
    case string(String)
}

/// `(path, value, label) -> Void` — see the integration note in
/// PROGRESS.md: today `EngineAPI.tweak(path:value:)` only accepts a
/// Double, so a caller wiring this to `StudioModel.onParam` can pass
/// `.number` straight through but must stub `.string` until the bridge
/// grows a string-valued tweak.
typealias PanelOnParam = (_ path: String, _ value: PanelParamValue, _ label: String) -> Void

/// `(id, what, on) -> Void` — matches `StudioModel.onMix` exactly, so an
/// integrator can pass `model.onMix` directly.
typealias PanelOnMix = (_ id: String, _ what: String, _ on: Bool) -> Void

// MARK: - Effects (not yet wired — see integration note)

/// Mirrors the web's `SessionDescription.effects` shape. Swift's
/// `SessionDescription` (EngineAPI.swift) has no `effects` field yet, so
/// `PanelsView` always receives `[]` today; the type exists so the
/// EffectPanel view is ready the moment that field lands.
struct PanelEffectChain: Identifiable, Equatable {
    var id: String
    var type: String
    var params: [String: JSONValue]
    var descriptors: [String: ParamDescriptor]
}

struct PanelEffectTarget: Identifiable, Equatable {
    var id: String { target }
    var target: String
    var chain: [PanelEffectChain]
}

// MARK: - JSONValue helpers (local to Panels; avoids touching EngineHost's extension)

enum PanelJSON {
    static func double(_ v: JSONValue) -> Double? {
        if case .number(let n) = v { return n }
        return nil
    }
    /// String form of any scalar JSON value, for comparing a choice
    /// control's current value against its option list (options are
    /// normalised to strings by engine-bridge.js; values may still arrive
    /// as a JS number, e.g. subMode 0/1/2).
    static func string(_ v: JSONValue) -> String {
        switch v {
        case .string(let s): return s
        case .number(let n):
            if n == n.rounded() && abs(n) < 1e15 { return String(Int(n)) }
            return String(n)
        case .bool(let b): return b ? "true" : "false"
        default: return ""
        }
    }
}

// MARK: - Palette (per data-skin, from panels-mobile.css --ph-*)

/// `JBTheme.PanelPalette` (Theme.swift) already carries the four `--ph-*`
/// tokens shared with the rest of the app (background/accent/dim/rule +
/// the display label) — added in stage 9 for this stage to consume, so
/// Panels aliases it rather than keeping a second copy of the same six
/// hex tables. Only the knob-specific extras (glow, text, knob face
/// colours) are added here.
typealias PanelSkin = JBTheme.PanelPalette

extension JBTheme.PanelPalette {
    init?(instrumentType: String) {
        switch instrumentType {
        case "jb202": self = .jb202
        case "jt30": self = .jt30
        case "jt10": self = .jt10
        case "jt90": self = .jt90
        case "jb01": self = .jb01
        case "fx": self = .fx
        default: return nil
        }
    }

    /// Convenience alias so Panels code can say `skin.bg` like the CSS
    /// custom property it mirrors (`--ph-bg`).
    var bg: Color { background }

    var glow: Color { accent.opacity(0.55) }

    /// `--ph-text` — primary readout text on the panel background.
    var text: Color {
        switch self {
        case .jb202: return Color(hex: 0xE8E8E8)
        case .jt30, .jt90: return Color(hex: 0xFAFAFA)
        case .jt10: return Color(hex: 0xF0F0F0)
        case .jb01: return Color(hex: 0xF5E8D8)
        case .fx: return Color(hex: 0xE8E8EC)
        }
    }

    /// Knob face radial gradient (dark bezel, from skins.css `--knob-bg`
    /// or its literal `.knob` gradient).
    var knobFace: (Color, Color) {
        switch self {
        case .jb202: return (Color(hex: 0x2A4A3A), Color(hex: 0x162130))
        case .jb01: return (Color(hex: 0x4A3A2A), Color(hex: 0x2A2018))
        case .jt30, .jt90: return (Color(hex: 0x3A3A3A), Color(hex: 0x1A1A1A))
        case .jt10: return (Color(hex: 0x3A3A3A), Color(hex: 0x222222))
        case .fx: return (Color(hex: 0x2B3044), Color(hex: 0x2B3044))
        }
    }

    var knobRing: Color {
        switch self {
        case .jb202: return Color(hex: 0x3A5A4A)
        case .jb01: return Color(hex: 0x5A4A3A)
        case .jt30, .jt90: return Color(hex: 0x2A2A2A)
        case .jt10: return Color(hex: 0x444444)
        case .fx: return accent.opacity(0.5)
        }
    }

    /// The little indicator line on the knob face — usually the accent,
    /// JB01 uses a distinct amber.
    var knobIndicator: Color {
        switch self {
        case .jb01: return Color(hex: 0xF0A030)
        case .jb202: return Color(hex: 0x4FD1A3)
        default: return accent
        }
    }
}

// MARK: - Param lookup / control-building (port of panels.tsx's find/ctl/dflt/fmt/levelControl)

enum PanelParams {
    static func find(_ inst: InstrumentDescription, sub: String) -> ParamEntry? {
        inst.params.first { $0.sub == sub || $0.sub.hasSuffix(".\(sub)") }
    }

    /// Port of controls.ts `toControl` — nil for choice/non-numeric params.
    static func control(_ p: ParamEntry?, label: String) -> Control? {
        guard let p, let value = PanelJSON.double(p.value) else { return nil }
        let d = p.descriptor
        guard d.unit != "choice", d.min.isFinite, d.max.isFinite, d.max > d.min else { return nil }
        let unit = d.unit
        let log = unit == "Hz" && d.min > 0 && d.max / d.min >= 20
        let step: Double = unit == "dB" ? 0.5 : (unit == "s" || unit == "seconds") ? 0.1 : unit == "0-1" ? 0.01 : 1
        return Control(path: p.path, label: label, min: d.min, max: d.max, step: step, unit: unit, scale: log ? "log" : "lin", value: value)
    }

    static func levelControl(_ inst: InstrumentDescription) -> Control {
        Control(path: "\(inst.id).level", label: "level", min: -24, max: 6, step: 0.5, unit: "dB", scale: "lin", value: inst.level)
    }

    static func fmt(_ inst: InstrumentDescription, sub: String) -> String? {
        guard let c = control(find(inst, sub: sub), label: sub) else { return nil }
        return ControlsMath.format(c, value: c.value)
    }

    static func instrumentSummary(_ inst: InstrumentDescription) -> String {
        let level = ControlsMath.format(levelControl(inst), value: inst.level)
        if !inst.voices.isEmpty {
            return "\(inst.voices.count) voice\(inst.voices.count == 1 ? "" : "s") · \(level)"
        }
        func pick(_ subs: [String], _ label: String) -> String? {
            for s in subs { if let v = fmt(inst, sub: s) { return "\(label) \(v)" } }
            return nil
        }
        let parts = [pick(["filterCutoff", "cutoff"], "cutoff"), pick(["filterResonance", "resonance"], "reso")].compactMap { $0 }
        return parts.isEmpty ? level : parts.joined(separator: " · ")
    }

    static func voiceParams(_ inst: InstrumentDescription, voice: String) -> [ParamEntry] {
        inst.params.filter { $0.sub.hasPrefix("\(voice).") && $0.descriptor.unit != "choice" && PanelJSON.double($0.value) != nil }
    }

    // ---- effects (ready for when SessionDescription grows `effects`) ----

    static let fxLabels: [String: String] = [
        "time": "TIME", "feedback": "FDBK", "mix": "MIX", "lowcut": "LO CUT", "highcut": "HI CUT",
        "saturation": "SAT", "spread": "SPREAD", "decay": "DECAY", "damping": "DAMP", "predelay": "PRE",
        "size": "SIZE", "width": "WIDTH", "cutoff": "CUTOFF", "resonance": "RESO", "amount": "AMOUNT",
        "attack": "ATTACK", "release": "RELEASE", "hold": "HOLD", "threshold": "THRESH",
    ]
    static let fxOrder = ["time", "feedback", "decay", "damping", "predelay", "size", "width", "lowcut", "highcut",
                           "saturation", "spread", "cutoff", "resonance", "amount", "attack", "hold", "release", "threshold", "mix"]

    static func effectSummary(type: String, params: [String: JSONValue], descriptors: [String: ParamDescriptor]) -> String {
        func f(_ k: String) -> String? {
            guard let d = descriptors[k], let v = params[k] else { return nil }
            if d.unit == "choice" { return PanelJSON.string(v) }
            guard let n = PanelJSON.double(v) else { return PanelJSON.string(v) }
            let c = Control(path: k, label: k, min: d.min, max: d.max, step: 1, unit: d.unit, scale: "lin", value: n)
            return ControlsMath.format(c, value: n)
        }
        var parts: [String] = []
        if type == "delay" {
            if let sync = params["sync"], PanelJSON.string(sync) != "off" { parts.append(PanelJSON.string(sync)) }
            else if let t = f("time") { parts.append("time \(t)") }
        } else if type == "reverb" {
            if let d = f("decay") { parts.append("decay \(d)") }
        } else if let first = descriptors.keys.first(where: { $0 != "mix" && descriptors[$0]?.unit != "choice" }), let v = f(first) {
            parts.append("\(first) \(v)")
        }
        if let mix = f("mix") { parts.append("mix \(mix)") }
        return parts.joined(separator: " · ")
    }

    // ---- mute/solo (port of MuteSolo.tsx isSilenced) ----

    static func isSilenced(_ id: String, tracks: [String: TrackMixState]?, anySolo: Bool?) -> Bool {
        let t = tracks?[id]
        return (t?.mute ?? false) || ((anySolo ?? false) && !(t?.solo ?? false))
    }

    /// Header LED: an instrument lights on any of its hits; an effect
    /// lights with its target (a voice target like jt90.oh only when that
    /// voice hits).
    static func isHit(_ id: String, hits: [String: [String]]) -> Bool {
        if !id.hasPrefix("fx.") { return !(hits[id]?.isEmpty ?? true) }
        let rest = id.dropFirst(3) // after "fx."
        guard let lastDot = rest.lastIndex(of: ".") else { return false }
        let target = String(rest[rest.startIndex..<lastDot])
        let parts = target.split(separator: ".", maxSplits: 1).map(String.init)
        guard let inst = parts.first, let h = hits[inst], !h.isEmpty else { return false }
        if parts.count > 1 { return h.contains(parts[1]) }
        return true
    }
}

extension Color {
    /// Convenience for literal Int hex (0xRRGGBB) alongside the existing
    /// `Color(hex: UInt32)` initializer in Theme.swift.
    init(hex: Int) { self.init(hex: UInt32(hex)) }
}
