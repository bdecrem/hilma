import SwiftUI

/// Rotary knob — port of `alt/Knob.tsx`'s `Knob` component. Drag vertically
/// anywhere on the knob: 150pt of travel covers the full range (log scale
/// honoured via `ControlsMath`, same as the Faders sheet). Double-tap
/// resets to `defaultValue` when one is known. While dragging, a floating
/// orange readout appears above the knob (`.jam-knob-float`).
struct KnobControl: View {
    let control: Control
    let label: String
    var skin: PanelSkin
    var size: CGFloat = 44
    /// Descriptor default for double-tap reset. `ParamDescriptor` doesn't
    /// carry one yet — see the integration note in PROGRESS.md — so today
    /// this is always nil and double-tap is a no-op.
    var defaultValue: Double? = nil
    /// Debug-only: forces the mid-drag visual (floating readout, orange
    /// ring) without a live gesture — used by `PanelsPreviewHost` to
    /// screenshot the drag state headlessly (no screen control).
    var debugForceDrag: Bool = false
    var onChange: (Double) -> Void

    @State private var dragT: Double? = nil
    @State private var dragStartT: Double = 0
    @State private var moved = false
    @State private var lastDownAt: Date? = nil
    @State private var lastMoved = false
    @State private var emitted: Double? = nil

    private static let dragRange: CGFloat = 150
    private static let tapSlop: CGFloat = 6
    private static let doubleTapWindow: TimeInterval = 0.32

    private var t: Double { dragT ?? ControlsMath.toSlider(control, value: control.value) }
    private var liveValue: Double { dragT != nil ? ControlsMath.fromSlider(control, t: t) : control.value }
    private var degrees: Double { -135 + max(0, min(1, t)) * 270 }
    private var text: String { ControlsMath.format(control, value: liveValue) }
    private var dragging: Bool { dragT != nil || debugForceDrag }

    var body: some View {
        VStack(spacing: 5) {
            ZStack(alignment: .top) {
                if dragging {
                    Text(text)
                        .font(JBTheme.monoFont(13, weight: .semibold))
                        .foregroundStyle(JBTheme.orange)
                        .padding(.horizontal, 9)
                        .padding(.vertical, 3)
                        .background(Color(hex: 0x14161A), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).stroke(JBTheme.orange.opacity(0.5), lineWidth: 1))
                        .offset(y: -30)
                        .zIndex(1)
                        .allowsHitTesting(false)
                }
                face
                    .frame(width: size, height: size)
            }
            .frame(height: size)
            Text(label.uppercased())
                .font(.system(size: 9.5, weight: .semibold))
                .tracking(0.4)
                .foregroundStyle(skin.dim)
                .lineLimit(1)
            Text(text)
                .font(JBTheme.monoFont(10.5))
                .foregroundStyle(dragging ? JBTheme.orange : skin.dim)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity)
        .contentShape(Rectangle())
        .gesture(drag)
    }

    private var face: some View {
        ZStack {
            Circle()
                .fill(RadialGradient(colors: [skin.knobFace.0, skin.knobFace.1], center: UnitPoint(x: 0.3, y: 0.3), startRadius: 0, endRadius: size * 0.75))
                .overlay(Circle().stroke(dragging ? JBTheme.orange : skin.knobRing, lineWidth: dragging ? 2 : 1.5))
                .shadow(color: .black.opacity(0.4), radius: 3, x: 0, y: 2)
            Capsule()
                .fill(skin.knobIndicator)
                .frame(width: max(2, size * 0.07), height: size * 0.26)
                .offset(y: -size * 0.37)
                .shadow(color: skin.knobIndicator.opacity(0.7), radius: 3)
                .rotationEffect(.degrees(degrees))
        }
    }

    private var drag: some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { g in
                if dragT == nil {
                    let now = Date()
                    let isDoubleTap = (lastDownAt.map { now.timeIntervalSince($0) < Self.doubleTapWindow } ?? false) && !lastMoved
                    lastDownAt = now
                    moved = false
                    if isDoubleTap, let d = defaultValue {
                        lastDownAt = nil
                        if d != control.value { onChange(d) }
                        return
                    }
                    dragStartT = ControlsMath.toSlider(control, value: control.value)
                    emitted = control.value
                    dragT = dragStartT
                }
                if abs(g.translation.height) > Self.tapSlop { moved = true }
                let nt = max(0, min(1, dragStartT + Double(-g.translation.height) / Self.dragRange))
                dragT = nt
                let v = ControlsMath.fromSlider(control, t: nt)
                if v != emitted { emitted = v; onChange(v) }
            }
            .onEnded { _ in
                lastMoved = moved
                dragT = nil
            }
    }
}

#Preview {
    HStack(spacing: 24) {
        KnobControl(control: Control(path: "a", label: "cutoff", min: 100, max: 8000, step: 1, unit: "Hz", scale: "log", value: 1200), label: "cutoff", skin: .jb202) { _ in }
        KnobControl(control: Control(path: "b", label: "level", min: -24, max: 6, step: 0.5, unit: "dB", scale: "lin", value: -3), label: "level", skin: .jt90, defaultValue: 0) { _ in }
    }
    .padding(40)
    .background(Color.black)
}
