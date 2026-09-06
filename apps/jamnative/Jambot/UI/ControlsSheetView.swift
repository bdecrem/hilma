import SwiftUI

/// Which Controls view is showing — remembered per device like the web's
/// `jam.controlsMode` (UserDefaults key `jam.controlsMode`).
enum ControlsMode: String, CaseIterable, Identifiable {
    case faders, panels, seq
    var id: String { rawValue }
    var label: String {
        switch self {
        case .faders: return "Faders"
        case .panels: return "Panels"
        case .seq: return "Seq"
        }
    }
    static let storageKey = "jam.controlsMode"
}

/// Full-screen Controls sheet: header with the Faders · Panels · Seq
/// function-key row, then the Track card + fader groups (Faders), the Track
/// card + per-synth panels (Panels) or the step sequencer (Seq). Port of
/// `src/app/jam/ControlsSheet.tsx`.
struct ControlsSheetView: View {
    @Bindable var model: StudioModel
    @AppStorage(ControlsMode.storageKey) private var modeRaw: String = ControlsMode.faders.rawValue
    /// The open Panels section (written by PanelsView) — the sheet scrolls it
    /// into view like the web's accordion, since this ScrollView owns the scrolling.
    @AppStorage("jam.panelsOpen") private var panelsOpen: String = ""

    private static let barChoices = [1, 2, 4, 8, 16, 32, 64, 128]

    private var mode: ControlsMode { ControlsMode(rawValue: modeRaw) ?? .faders }

    var body: some View {
        VStack(spacing: 0) {
            JBSheetHeader("Controls", status: (lit: model.rendering, text: model.rendering ? "rendering" : "live"),
                          onDone: { model.controlsOpen = false }) {
                JBSegmented(ControlsMode.allCases, selection: Binding(get: { mode }, set: { modeRaw = $0.rawValue }), label: \.label)
            }
            ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    switch mode {
                    case .faders:
                        trackCard
                        ForEach(model.groups) { group in
                            groupSection(group)
                        }
                        if model.groups.isEmpty {
                            empty("Nothing to tweak yet. Ask for a beat first.")
                        }
                    case .panels:
                        trackCard
                        PanelsView(desc: model.desc, hits: model.hits, effects: PanelEffectTarget.from(model.desc?.effects), scrolls: false,
                                   onParam: model.onPanelParam, onMix: model.onMix)
                    case .seq:
                        if let desc = model.desc {
                            SeqView(engine: model.engine, desc: desc, playStep16: model.playStep16, playScope: model.playedScope,
                                    instId: $model.seqInst, section: $model.seqSection, notes: model.seqNotes, externalModel: model.seqModel,
                                    onEdited: model.onSeqEdited, onScope: model.setRenderScope, onDesc: model.onSeqDesc)
                        } else {
                            empty("Nothing to sequence yet. Ask for a beat first.")
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 10)
                .padding(.bottom, 40)
            }
            .onChange(of: panelsOpen) { _, id in
                guard mode == .panels, !id.isEmpty, id != "__closed__" else { return }
                withAnimation(.easeOut(duration: 0.25)) { proxy.scrollTo(id, anchor: .top) }
            }
            }
        }
        .background(JBTheme.panel)
        .columnWidth()
        .frame(maxWidth: .infinity)
        .background(JBTheme.panel)
        .presentationBackground(JBTheme.panel)
        .onAppear { model.hitsWanted = mode == .panels }
        .onChange(of: modeRaw) { _, _ in model.hitsWanted = mode == .panels }
        .onDisappear { model.hitsWanted = false }
    }

    private func empty(_ text: String) -> some View {
        Text(text)
            .font(JBTheme.bodyFont(15))
            .foregroundStyle(JBTheme.ink3)
            .frame(maxWidth: .infinity)
            .multilineTextAlignment(.center)
            .padding(.top, 32)
    }

    // MARK: - Track card

    private var trackCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            JBGroupRow("Track")
            VStack(spacing: 0) {
                SliderRow(
                    label: "tempo",
                    display: "\(model.bpm) BPM",
                    t: (Double(model.bpm) - 60) / (200 - 60),
                    onInput: { t in model.onTrack(key: "bpm", value: (60 + t * 140).rounded()) }
                )
                Divider().overlay(JBTheme.rule)
                SliderRow(
                    label: "swing",
                    display: "\(Int(model.swing.rounded()))%",
                    t: model.swing / 100,
                    onInput: { t in model.onTrack(key: "swing", value: (t * 100).rounded()) }
                )
                Divider().overlay(JBTheme.rule)
                if model.inSong {
                    HStack {
                        Text("length").font(JBTheme.bodyFont(14)).foregroundStyle(JBTheme.ink2)
                        Spacer()
                        (Text("arrangement · ").foregroundColor(JBTheme.ink2)
                         + Text("\(model.shownBars)").fontWeight(.medium).foregroundColor(JBTheme.ink)
                         + Text(" bars · \(model.desc?.arrangement.count ?? 0) sections, set in chat").foregroundColor(JBTheme.ink3))
                            .font(JBTheme.monoFont(12))
                    }
                    .padding(.vertical, 12)
                } else {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("length").font(JBTheme.bodyFont(14)).foregroundStyle(JBTheme.ink2)
                        // 8 keys, 4 per row on a phone (2 × 4), one row of 8 in a regular-width
                        // column. Card inner width = screen − 32 (sheet) − 24 (card): 375 → 319,
                        // 393 → 337, 402 → 345, 720 column → 664; min 72 + 6 gap gives
                        // floor((w + 6) / 78) = 4 / 4 / 4 / 8 columns, and "128" (≈ 30 pt at
                        // 12 pt semibold + 1.44 tracking) fits inside 72 − 24 padding on one line.
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 72, maximum: 120), spacing: 6)], spacing: 6) {
                            ForEach(Self.barChoices, id: \.self) { b in
                                Button("\(b)") { model.onTrack(key: "bars", value: Double(b)) }
                                    .buttonStyle(JBKeyStyle(variant: model.bars == b ? .orange : .panel, size: .small, wide: true))
                                    .accessibilityAddTraits(model.bars == b ? .isSelected : [])
                            }
                        }
                    }
                    .padding(.vertical, 12)
                }
            }
            .padding(.horizontal, 12)
            .jbCard()
        }
    }

    // MARK: - Fader groups

    private func groupSection(_ group: ControlGroup) -> some View {
        let isFx = group.id.hasPrefix("fx.")
        let silenced = !isFx && PanelParams.isSilenced(group.id, tracks: model.desc?.tracks, anySolo: model.desc?.anySolo)
        let mute = model.desc?.tracks?[group.id]?.mute ?? false
        let solo = model.desc?.tracks?[group.id]?.solo ?? false
        return VStack(alignment: .leading, spacing: 8) {
            JBGroupRow(group.title, subtitle: group.subtitle, dimmed: silenced) {
                if !isFx {
                    JBMSKeys(mute: mute, solo: solo,
                             onMute: { model.onMix(id: group.id, what: "mute", on: !mute) },
                             onSolo: { model.onMix(id: group.id, what: "solo", on: !solo) })
                }
            }
            VStack(spacing: 0) {
                ForEach(Array(group.controls.enumerated()), id: \.element.id) { idx, control in
                    ParamRow(control: control) { v in
                        model.onParam(path: control.path, value: v, label: "\(group.title) \(control.label)")
                    }
                    if idx < group.controls.count - 1 {
                        Divider().overlay(JBTheme.rule)
                    }
                }
            }
            .padding(.horizontal, 12)
            .jbCard()
        }
    }
}

private struct ParamRow: View {
    let control: Control
    let onCommit: (Double) -> Void
    @State private var value: Double

    init(control: Control, onCommit: @escaping (Double) -> Void) {
        self.control = control
        self.onCommit = onCommit
        self._value = State(initialValue: control.value)
    }

    var body: some View {
        SliderRow(
            label: control.label,
            display: ControlsMath.format(control, value: value),
            t: ControlsMath.toSlider(control, value: value),
            onInput: { t in
                let v = ControlsMath.fromSlider(control, t: t)
                value = v
                onCommit(v)
            }
        )
        .onChange(of: control.value) { _, newValue in value = newValue }
    }
}

/// One fader row: label + readout above a cobalt-cap slider. Port of
/// ControlsSheet.tsx's `SliderRow`.
struct SliderRow: View {
    let label: String
    let display: String
    let t: Double
    let onInput: (Double) -> Void

    var body: some View {
        VStack(spacing: 2) {
            HStack(alignment: .firstTextBaseline) {
                Text(label)
                    .font(JBTheme.bodyFont(14))
                    .foregroundStyle(JBTheme.ink2)
                Spacer()
                Text(display)
                    .font(JBTheme.monoFont(12, weight: .medium))
                    .foregroundStyle(JBTheme.ink)
            }
            JBFader(t: t, onInput: onInput)
        }
        .padding(.top, 8)
        .padding(.bottom, 2)
    }
}

#Preview {
    let model = StudioModel(trackId: "preview", initialMeta: nil, engine: MockEngine())
    ControlsSheetView(model: model)
        .task {
            model.desc = try? await model.engine.describe()
            model.groups = (try? await model.engine.controls()) ?? []
        }
}
