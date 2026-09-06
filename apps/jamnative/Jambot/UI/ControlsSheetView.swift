import SwiftUI

/// Full-screen Controls sheet: tempo/swing/length, then one card per
/// ControlGroup with a slider per Control and M/S keys on the group row.
/// Port of `src/app/jam/ControlsSheet.tsx` (Faders mode only — Panels/Seq
/// are out of scope for this test build, see DESIGN.md).
struct ControlsSheetView: View {
    @Bindable var model: StudioModel

    private static let barChoices = [1, 2, 4, 8, 16, 32, 64, 128]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    trackCard
                    ForEach(model.groups) { group in
                        groupSection(group)
                    }
                    if model.groups.isEmpty {
                        Text("Nothing to tweak yet. Ask for a beat first.")
                            .font(JBTheme.bodyFont(15))
                            .foregroundStyle(JBTheme.ink3)
                            .frame(maxWidth: .infinity)
                            .multilineTextAlignment(.center)
                            .padding(.top, 32)
                    }
                }
                .padding(16)
            }
            .background(JBTheme.panel)
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    HStack(spacing: 8) {
                        Text("CONTROLS").font(JBTheme.panelFont(16, weight: .semibold))
                        Circle().fill(model.rendering ? JBTheme.orange : JBTheme.green).frame(width: 6, height: 6)
                        Text(model.rendering ? "rendering" : "live")
                            .font(JBTheme.monoFont(11))
                            .foregroundStyle(JBTheme.ink2)
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { model.controlsOpen = false }
                        .buttonStyle(JBKeyStyle(variant: .orange, small: true))
                }
            }
        }
    }

    private var trackCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            groupLabel("TRACK")
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
                        Text("arrangement · \(model.bars) bars")
                            .font(JBTheme.monoFont(12))
                            .foregroundStyle(JBTheme.ink2)
                    }
                    .padding(.vertical, 12)
                } else {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("length").font(JBTheme.bodyFont(14)).foregroundStyle(JBTheme.ink2)
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 40, maximum: 48), spacing: 6)], spacing: 6) {
                            ForEach(Self.barChoices, id: \.self) { b in
                                Button("\(b)") { model.onTrack(key: "bars", value: Double(b)) }
                                    .buttonStyle(JBKeyStyle(variant: model.bars == b ? .orange : .panel, small: true))
                            }
                        }
                    }
                    .padding(.vertical, 12)
                }
            }
            .padding(.horizontal, 12)
            .background(JBTheme.panel2)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(JBTheme.rule, lineWidth: 1))
        }
    }

    private func groupSection(_ group: ControlGroup) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                groupLabel(group.title.uppercased())
                if let subtitle = group.subtitle {
                    Text(subtitle)
                        .font(JBTheme.monoFont(11))
                        .foregroundStyle(JBTheme.ink3)
                }
                Rectangle().fill(JBTheme.rule).frame(height: 1)
                muteSoloKeys(group.id)
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
            .background(JBTheme.panel2)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(JBTheme.rule, lineWidth: 1))
        }
    }

    private func groupLabel(_ text: String) -> some View {
        Text(text)
            .font(JBTheme.panelFont(12, weight: .semibold))
            .tracking(1.5)
            .foregroundStyle(JBTheme.ink3)
            .padding(.bottom, 8)
    }

    @ViewBuilder
    private func muteSoloKeys(_ id: String) -> some View {
        let mute = model.desc?.tracks?[id]?.mute ?? false
        let solo = model.desc?.tracks?[id]?.solo ?? false
        HStack(spacing: 4) {
            msKey("M", on: mute, color: JBTheme.orange) { model.onMix(id: id, what: "mute", on: !mute) }
            msKey("S", on: solo, color: JBTheme.green) { model.onMix(id: id, what: "solo", on: !solo) }
        }
    }

    private func msKey(_ label: String, on: Bool, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(JBTheme.panelFont(11, weight: .bold))
                .frame(width: 26, height: 26)
                .background(on ? color : JBTheme.panel4)
                .foregroundStyle(on ? .white : JBTheme.ink3)
                .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
        }
        .buttonStyle(.plain)
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
        VStack(spacing: 6) {
            HStack {
                Text(label)
                    .font(JBTheme.bodyFont(14))
                    .foregroundStyle(JBTheme.ink2)
                Spacer()
                Text(display)
                    .font(JBTheme.monoFont(12, weight: .medium))
                    .foregroundStyle(JBTheme.ink)
            }
            Slider(value: Binding(get: { max(0, min(1, t)) }, set: onInput), in: 0...1)
                .tint(JBTheme.cobalt)
        }
        .padding(.vertical, 10)
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
