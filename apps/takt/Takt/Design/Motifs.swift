import SwiftUI

/// One device pixel of `line`, horizontal or vertical.
struct Hairline: View {
    var vertical = false
    @Environment(\.displayScale) private var scale

    var body: some View {
        Rectangle()
            .fill(Palette.line)
            .frame(width: vertical ? 1 / scale : nil, height: vertical ? nil : 1 / scale)
    }
}

/// Five hairlines: the staff. The only classical ornament, used as a divider and in the header.
struct StaffLines: View {
    var spacing: CGFloat = 4

    var body: some View {
        VStack(spacing: spacing) {
            ForEach(0..<5, id: \.self) { _ in Hairline() }
        }
        .accessibilityHidden(true)
    }
}

/// A square status LED: filled `signal` when lit, a `line` outline when off.
struct LED: View {
    let lit: Bool
    var size: CGFloat = 8

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 1.5)
        ZStack {
            if lit {
                shape.fill(Palette.signal)
            } else {
                shape.strokeBorder(Palette.line, lineWidth: 1)
            }
        }
        .frame(width: size, height: size)
    }
}

/// The "next" mark: a small right triangle tucked into the bottom-right corner,
/// so next differs from now in shape as well as hue.
struct CornerTick: Shape {
    var inset: CGFloat = 5
    var leg: CGFloat = 9

    func path(in rect: CGRect) -> Path {
        var p = Path()
        let x = rect.maxX - inset, y = rect.maxY - inset
        p.move(to: CGPoint(x: x, y: y - leg))
        p.addLine(to: CGPoint(x: x, y: y))
        p.addLine(to: CGPoint(x: x - leg, y: y))
        p.closeSubpath()
        return p
    }
}

/// Gate rings: one per clean chorus the gate needs. A clean chorus lights its ring in `cue`.
struct GateRings: View {
    let clean: Int
    let required: Int
    var size: CGFloat = 12

    var body: some View {
        HStack(spacing: 6) {
            ForEach(0..<required, id: \.self) { i in
                ZStack {
                    if i < clean {
                        Circle().strokeBorder(Palette.cue, lineWidth: 2)
                        Circle().fill(Palette.cue).padding(size * 0.3)
                    } else {
                        Circle().strokeBorder(Palette.line, lineWidth: 1)
                    }
                }
                .frame(width: size, height: size)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(clean) of \(required) clean choruses")
    }
}
