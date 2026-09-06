import SwiftUI

/// JT-10-style vertical fader (44×120) — port of `alt/Knob.tsx`'s `VSlider`.
/// Unlike the knob, dragging anywhere maps directly to the slider's own
/// height (the web reads `getBoundingClientRect()`); double-tap resets to
/// `defaultValue`.
struct VSliderControl: View {
    let control: Control
    let label: String
    var skin: PanelSkin
    var width: CGFloat = 44
    var height: CGFloat = 120
    var defaultValue: Double? = nil
    var onChange: (Double) -> Void

    @State private var dragT: Double? = nil
    @State private var emitted: Double? = nil
    @State private var lastDownAt: Date? = nil

    private var t: Double { dragT ?? ControlsMath.toSlider(control, value: control.value) }
    private var liveValue: Double { dragT != nil ? ControlsMath.fromSlider(control, t: t) : control.value }
    private var text: String { ControlsMath.format(control, value: liveValue) }
    private var dragging: Bool { dragT != nil }

    var body: some View {
        VStack(spacing: 5) {
            if dragging {
                Text(text)
                    .font(JBTheme.monoFont(11, weight: .semibold))
                    .foregroundStyle(JBTheme.orange)
            }
            GeometryReader { geo in
                ZStack(alignment: .bottom) {
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(Color.black.opacity(0.35))
                        .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).stroke(skin.rule, lineWidth: 1))
                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .fill(skin.accent.opacity(0.85))
                        .frame(height: max(6, geo.size.height * t))
                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .fill(skin.accent)
                        .frame(height: 16)
                        .offset(y: -max(0, geo.size.height * t - 8))
                        .shadow(color: skin.accent.opacity(0.6), radius: dragging ? 4 : 0)
                }
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { g in
                            if dragT == nil {
                                let now = Date()
                                let isDoubleTap = lastDownAt.map { now.timeIntervalSince($0) < 0.32 } ?? false
                                lastDownAt = now
                                if isDoubleTap, let d = defaultValue {
                                    lastDownAt = nil
                                    if d != control.value { onChange(d) }
                                    return
                                }
                                emitted = nil
                            }
                            let nt = max(0, min(1, 1 - Double(g.location.y / geo.size.height)))
                            dragT = nt
                            let v = ControlsMath.fromSlider(control, t: nt)
                            if v != emitted { emitted = v; onChange(v) }
                        }
                        .onEnded { _ in dragT = nil }
                )
            }
            .frame(width: width, height: height)
            Text(label.uppercased())
                .font(.system(size: 9.5, weight: .semibold))
                .foregroundStyle(skin.dim)
            Text(text)
                .font(JBTheme.monoFont(10.5))
                .foregroundStyle(dragging ? JBTheme.orange : skin.dim)
        }
        .frame(width: width)
    }
}
