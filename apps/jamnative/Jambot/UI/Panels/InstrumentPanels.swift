import SwiftUI

// Per-synth panel bodies — port of alt/panels.tsx's JB202Panel / JT30Panel /
// JT10Panel / JT90Panel / JB01Panel / EffectPanel, laid out per the
// phone-width rules in alt/panels-mobile.css (knob rows wrap N-per-row and
// center; JB202 OSC1 | OSC2 side by side; JT-90 / JB01 2-column voice
// cards; JT-10 vertical ADSR sliders + an LFO row).

// MARK: - shared building blocks

private func paramKnob(_ inst: InstrumentDescription, sub: String, label: String, skin: PanelSkin, size: CGFloat = 44, name: String, onParam: @escaping PanelOnParam) -> some View {
    let entry = PanelParams.find(inst, sub: sub)
    let control = PanelParams.control(entry, label: label)
    return Group {
        if let c = control {
            KnobControl(control: c, label: label, skin: skin, size: size, defaultValue: entry?.descriptor.defaultValue) { v in onParam(c.path, .number(v), "\(name) \(label)") }
        } else { EmptyView() }
    }
}

private func levelKnob(_ inst: InstrumentDescription, label: String = "LEVEL", skin: PanelSkin, size: CGFloat = 44, name: String, onParam: @escaping PanelOnParam) -> some View {
    let c = PanelParams.levelControl(inst)
    return KnobControl(control: c, label: label, skin: skin, size: size, defaultValue: 0) { v in onParam(c.path, .number(v), "\(name) level") }
}

private func choiceParam(_ inst: InstrumentDescription, sub: String, skin: PanelSkin, labels: [String: String] = [:], wrapColumns: Int? = nil, name: String, onParam: @escaping PanelOnParam) -> some View {
    let entry = PanelParams.find(inst, sub: sub)
    return Group {
        if let p = entry {
            ChoiceRow(options: p.descriptor.options ?? [], value: PanelJSON.string(p.value), skin: skin, labels: labels, wrapColumns: wrapColumns) { v in
                onParam(p.path, .string(v), "\(name) \(sub)")
            }
        } else { EmptyView() }
    }
}

/// Section card: uppercase title over a knob row, tinted on the skin's
/// background — port of `.control-section` / `.section` (h3 + content).
private struct SectionCard<Content: View>: View {
    let title: String
    let skin: PanelSkin
    @ViewBuilder var content: () -> Content
    var body: some View {
        VStack(spacing: 12) {
            Text(title)
                .font(.system(size: 11, weight: .bold))
                .tracking(1.2)
                .foregroundStyle(skin.accent)
            content()
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 6)
        .frame(maxWidth: .infinity)
        .background(Color.white.opacity(0.035))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

private let JB202_WAVES = ["sawtooth": "SAW", "square": "SQR", "triangle": "TRI", "sine": "SIN"]

// MARK: - JB202

struct JB202Panel: View {
    let inst: InstrumentDescription
    let onParam: PanelOnParam
    private let skin = PanelSkin.jb202

    var body: some View {
        let name = inst.id
        VStack(spacing: 8) {
            HStack(alignment: .top, spacing: 8) {
                oscSection("OSC 1", "osc1", name: name)
                oscSection("OSC 2", "osc2", name: name)
            }
            SectionCard(title: "FILTER", skin: skin) {
                CenteredFlowLayout(columns: 3) {
                    paramKnob(inst, sub: "filterCutoff", label: "CUTOFF", skin: skin, size: 56, name: name, onParam: onParam)
                    paramKnob(inst, sub: "filterResonance", label: "RESO", skin: skin, size: 56, name: name, onParam: onParam)
                    paramKnob(inst, sub: "filterEnvAmount", label: "ENV", skin: skin, name: name, onParam: onParam)
                }
            }
            SectionCard(title: "FILTER ENV", skin: skin) {
                CenteredFlowLayout(columns: 4) {
                    paramKnob(inst, sub: "filterAttack", label: "A", skin: skin, size: 40, name: name, onParam: onParam)
                    paramKnob(inst, sub: "filterDecay", label: "D", skin: skin, size: 40, name: name, onParam: onParam)
                    paramKnob(inst, sub: "filterSustain", label: "S", skin: skin, size: 40, name: name, onParam: onParam)
                    paramKnob(inst, sub: "filterRelease", label: "R", skin: skin, size: 40, name: name, onParam: onParam)
                }
            }
            SectionCard(title: "AMP ENV", skin: skin) {
                CenteredFlowLayout(columns: 4) {
                    paramKnob(inst, sub: "ampAttack", label: "A", skin: skin, size: 40, name: name, onParam: onParam)
                    paramKnob(inst, sub: "ampDecay", label: "D", skin: skin, size: 40, name: name, onParam: onParam)
                    paramKnob(inst, sub: "ampSustain", label: "S", skin: skin, size: 40, name: name, onParam: onParam)
                    paramKnob(inst, sub: "ampRelease", label: "R", skin: skin, size: 40, name: name, onParam: onParam)
                }
            }
            SectionCard(title: "OUTPUT", skin: skin) {
                CenteredFlowLayout(columns: 2) {
                    paramKnob(inst, sub: "drive", label: "DRIVE", skin: skin, name: name, onParam: onParam)
                    levelKnob(inst, skin: skin, name: name, onParam: onParam)
                }
            }
        }
    }

    private func oscSection(_ title: String, _ osc: String, name: String) -> some View {
        SectionCard(title: title, skin: skin) {
            VStack(spacing: 10) {
                choiceParam(inst, sub: "\(osc)Waveform", skin: skin, labels: JB202_WAVES, wrapColumns: 4, name: name, onParam: onParam)
                CenteredFlowLayout(columns: 3) {
                    paramKnob(inst, sub: "\(osc)Octave", label: "OCT", skin: skin, name: name, onParam: onParam)
                    paramKnob(inst, sub: "\(osc)Detune", label: "DETUNE", skin: skin, name: name, onParam: onParam)
                    paramKnob(inst, sub: "\(osc)Level", label: "LEVEL", skin: skin, name: name, onParam: onParam)
                }
            }
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - JT30

struct JT30Panel: View {
    let inst: InstrumentDescription
    let onParam: PanelOnParam
    private let skin = PanelSkin.jt30

    var body: some View {
        let name = inst.id
        VStack(spacing: 14) {
            choiceParam(inst, sub: "waveform", skin: skin, labels: ["sawtooth": "SAW", "square": "SQR"], name: name, onParam: onParam)
                .frame(maxWidth: 180)
            CenteredFlowLayout(columns: 4) {
                paramKnob(inst, sub: "cutoff", label: "Cutoff", skin: skin, size: 48, name: name, onParam: onParam)
                paramKnob(inst, sub: "resonance", label: "Reso", skin: skin, size: 48, name: name, onParam: onParam)
                paramKnob(inst, sub: "envMod", label: "Env Mod", skin: skin, size: 48, name: name, onParam: onParam)
                paramKnob(inst, sub: "decay", label: "Decay", skin: skin, size: 48, name: name, onParam: onParam)
                paramKnob(inst, sub: "accent", label: "Accent", skin: skin, size: 48, name: name, onParam: onParam)
                paramKnob(inst, sub: "drive", label: "Drive", skin: skin, size: 48, name: name, onParam: onParam)
                levelKnob(inst, label: "Level", skin: skin, size: 48, name: name, onParam: onParam)
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - JT10

struct JT10Panel: View {
    let inst: InstrumentDescription
    let onParam: PanelOnParam
    private let skin = PanelSkin.jt10

    var body: some View {
        let name = inst.id
        VStack(spacing: 8) {
            SectionCard(title: "VCO", skin: skin) {
                CenteredFlowLayout(columns: 3) {
                    paramKnob(inst, sub: "sawLevel", label: "SAW", skin: skin, name: name, onParam: onParam)
                    paramKnob(inst, sub: "pulseLevel", label: "PULSE", skin: skin, name: name, onParam: onParam)
                    paramKnob(inst, sub: "pulseWidth", label: "PW", skin: skin, name: name, onParam: onParam)
                }
            }
            SectionCard(title: "SUB", skin: skin) {
                VStack(spacing: 10) {
                    paramKnob(inst, sub: "subLevel", label: "LEVEL", skin: skin, name: name, onParam: onParam)
                        .frame(width: 90)
                    HStack(spacing: 6) {
                        Text("MODE").font(.system(size: 10, weight: .semibold)).foregroundStyle(skin.dim)
                        choiceParam(inst, sub: "subMode", skin: skin, labels: ["0": "OFF", "1": "-1", "2": "-2"], name: name, onParam: onParam)
                    }
                }
            }
            SectionCard(title: "VCF", skin: skin) {
                CenteredFlowLayout(columns: 3) {
                    paramKnob(inst, sub: "cutoff", label: "FREQ", skin: skin, name: name, onParam: onParam)
                    paramKnob(inst, sub: "resonance", label: "RES", skin: skin, name: name, onParam: onParam)
                    paramKnob(inst, sub: "envMod", label: "ENV", skin: skin, name: name, onParam: onParam)
                }
            }
            SectionCard(title: "ENV", skin: skin) {
                HStack(spacing: 10) {
                    ForEach(["attack", "decay", "sustain", "release"], id: \.self) { s in
                        let entry = PanelParams.find(inst, sub: s)
                        if let c = PanelParams.control(entry, label: String(s.prefix(1)).uppercased()) {
                            VSliderControl(control: c, label: String(s.prefix(1)).uppercased(), skin: skin, width: 44, height: 120) { v in
                                onParam(c.path, .number(v), "\(name) \(s)")
                            }
                        }
                    }
                }
            }
            SectionCard(title: "LFO", skin: skin) {
                VStack(spacing: 10) {
                    CenteredFlowLayout(columns: 4) {
                        paramKnob(inst, sub: "lfoRate", label: "RATE", skin: skin, name: name, onParam: onParam)
                        paramKnob(inst, sub: "lfoToPitch", label: "PITCH", skin: skin, size: 36, name: name, onParam: onParam)
                        paramKnob(inst, sub: "lfoToFilter", label: "VCF", skin: skin, size: 36, name: name, onParam: onParam)
                        paramKnob(inst, sub: "lfoToPW", label: "PW", skin: skin, size: 36, name: name, onParam: onParam)
                    }
                    choiceParam(inst, sub: "lfoWaveform", skin: skin,
                                labels: ["triangle": "tri", "square": "sq", "sh": "S/H", "sine": "sin", "ramp": "ramp", "sample": "S/H"],
                                wrapColumns: 3, name: name, onParam: onParam)
                }
            }
            SectionCard(title: "VCA", skin: skin) {
                levelKnob(inst, label: "VOL", skin: skin, name: name, onParam: onParam)
                    .frame(width: 90)
            }
        }
    }
}

// MARK: - JT90 / JB01 (2-column voice grids)

let JT90_VOICES: [(String, String)] = [
    ("kick", "Bass Drum"), ("snare", "Snare"), ("clap", "Clap"), ("rimshot", "Rim Shot"),
    ("lowtom", "Low Tom"), ("midtom", "Mid Tom"), ("hitom", "High Tom"),
    ("ch", "Closed Hat"), ("oh", "Open Hat"), ("crash", "Crash"), ("ride", "Ride"),
]
let JB01_VOICES: [(String, String)] = [
    ("kick", "KICK"), ("snare", "SNARE"), ("clap", "CLAP"), ("ch", "C.HAT"),
    ("oh", "O.HAT"), ("lowtom", "L.TOM"), ("hitom", "H.TOM"), ("cymbal", "CYMBAL"),
]

private struct VoiceCard: View {
    let name: String
    let hit: Bool
    let skin: PanelSkin
    let params: [ParamEntry]
    let inst: InstrumentDescription
    let onParam: PanelOnParam
    let instName: String
    var master: Bool = false

    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 6) {
                HitLed(hit: hit, color: skin.accent, size: 7)
                Text(name.uppercased())
                    .font(.system(size: 11, weight: .bold))
                    .tracking(0.6)
                    .foregroundStyle(skin.text)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.bottom, 6)
            .overlay(alignment: .bottom) { Rectangle().fill(skin.rule).frame(height: 1) }
            if master {
                levelKnob(inst, skin: skin, name: instName, onParam: onParam)
                    .frame(width: 90)
            } else {
                CenteredFlowLayout(columns: 3) {
                    ForEach(params) { p in
                        let label = (p.sub.split(separator: ".").last.map(String.init) ?? p.sub)
                        if let c = PanelParams.control(p, label: label) {
                            KnobControl(control: c, label: label, skin: skin, size: 44, defaultValue: p.descriptor.defaultValue) { v in
                                onParam(c.path, .number(v), "\(instName) \(name) \(label)")
                            }
                        }
                    }
                }
            }
        }
        .padding(10)
        .background(Color.white.opacity(0.035))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

struct JT90Panel: View {
    let inst: InstrumentDescription
    let onParam: PanelOnParam
    var hitVoices: [String] = []
    private let skin = PanelSkin.jt90

    var body: some View {
        let name = inst.id
        let voices = inst.voices.isEmpty ? JT90_VOICES.map(\.0) : inst.voices
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible())], spacing: 8) {
            VoiceCard(name: "Master", hit: false, skin: skin, params: [], inst: inst, onParam: onParam, instName: name, master: true)
                .gridCellColumns(2)
            ForEach(voices, id: \.self) { v in
                VoiceCard(name: JT90_VOICES.first(where: { $0.0 == v })?.1 ?? v, hit: hitVoices.contains(v), skin: skin,
                          params: PanelParams.voiceParams(inst, voice: v), inst: inst, onParam: onParam, instName: name)
            }
        }
    }
}

struct JB01Panel: View {
    let inst: InstrumentDescription
    let onParam: PanelOnParam
    var hitVoices: [String] = []
    private let skin = PanelSkin.jb01

    var body: some View {
        let name = inst.id
        let voices = inst.voices.isEmpty ? JB01_VOICES.map(\.0) : inst.voices
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible())], spacing: 8) {
            VoiceCard(name: "Master", hit: false, skin: skin, params: [], inst: inst, onParam: onParam, instName: name, master: true)
                .gridCellColumns(2)
            ForEach(voices, id: \.self) { v in
                VoiceCard(name: JB01_VOICES.first(where: { $0.0 == v })?.1 ?? v.uppercased(), hit: hitVoices.contains(v), skin: skin,
                          params: PanelParams.voiceParams(inst, voice: v), inst: inst, onParam: onParam, instName: name)
            }
        }
    }
}

// MARK: - Effects (delay / reverb / sidechain…) — ready once SessionDescription grows `effects`

struct EffectPanel: View {
    let target: String
    let fxId: String
    let type: String
    let params: [String: JSONValue]
    let descriptors: [String: ParamDescriptor]
    let onParam: PanelOnParam
    private let skin = PanelSkin.fx

    var body: some View {
        let base = "fx.\(target).\(fxId)"
        let name = "\(type) on \(target)"
        let entries = descriptors.sorted { a, b in
            let ia = PanelParams.fxOrder.firstIndex(of: a.key) ?? 99
            let ib = PanelParams.fxOrder.firstIndex(of: b.key) ?? 99
            return ia < ib
        }
        let choices = entries.filter { $0.value.unit == "choice" }
        let knobs = entries.filter { $0.value.unit != "choice" }
        SectionCard(title: type.uppercased(), skin: skin) {
            VStack(spacing: 12) {
                ForEach(choices, id: \.key) { k, d in
                    let opts = d.options ?? []
                    HStack(spacing: 6) {
                        Text(PanelParams.fxLabels[k] ?? k.uppercased())
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(skin.dim)
                        ChoiceRow(options: opts, value: params[k].map(PanelJSON.string) ?? "", skin: skin,
                                  wrapColumns: opts.count > 4 ? 3 : nil) { v in
                            onParam("\(base).\(k)", .string(v), "\(name) \(k)")
                        }
                    }
                }
                CenteredFlowLayout(columns: 4) {
                    ForEach(knobs, id: \.key) { k, d in
                        if let v = params[k], let n = PanelJSON.double(v) {
                            let label = PanelParams.fxLabels[k] ?? k.uppercased()
                            let c = Control(path: "\(base).\(k)", label: label, min: d.min, max: d.max,
                                             step: d.unit == "dB" ? 0.5 : (d.unit == "s" || d.unit == "seconds") ? 0.1 : d.unit == "0-1" ? 0.01 : 1,
                                             unit: d.unit, scale: (d.unit == "Hz" && d.min > 0 && d.max / d.min >= 20) ? "log" : "lin", value: n)
                            KnobControl(control: c, label: label, skin: skin, size: k == "mix" ? 56 : 44, defaultValue: d.defaultValue) { nv in
                                onParam(c.path, .number(nv), "\(name) \(k)")
                            }
                        }
                    }
                }
            }
        }
    }
}
