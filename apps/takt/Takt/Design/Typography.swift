import SwiftUI

// System fonts only (brief §2). Sizes go through @ScaledMetric so they follow Dynamic Type on
// iPhone; on the Mac idiom text styles shrink to macOS sizes, so the base sizes are given in points.

extension Font {
    /// Display: SF Pro compressed, heavy. Lesson titles, the big tempo number.
    static func display(_ size: CGFloat) -> Font {
        .system(size: size, weight: .heavy).width(.compressed)
    }
}

/// Data & labels: SF Mono, uppercase, +12% tracking, 11–13 pt.
struct DataLabel: ViewModifier {
    @ScaledMetric private var size: CGFloat
    private let weight: Font.Weight

    init(size: CGFloat, weight: Font.Weight) {
        _size = ScaledMetric(wrappedValue: size, relativeTo: size < 12 ? .caption2 : size < 13 ? .caption : .footnote)
        self.weight = weight
    }

    func body(content: Content) -> some View {
        content
            .font(.system(size: size, weight: weight, design: .monospaced))
            .textCase(.uppercase)
            .tracking(size * 0.12)
            .monospacedDigit()
    }
}

/// Body: SF Pro (Text at these sizes), regular or semibold, scaled with Dynamic Type.
struct BodyText: ViewModifier {
    @ScaledMetric private var size: CGFloat
    private let weight: Font.Weight

    init(size: CGFloat, weight: Font.Weight, relativeTo style: Font.TextStyle) {
        _size = ScaledMetric(wrappedValue: size, relativeTo: style)
        self.weight = weight
    }

    func body(content: Content) -> some View {
        content.font(.system(size: size, weight: weight))
    }
}

extension View {
    func dataLabel(_ size: CGFloat = 12, weight: Font.Weight = .regular) -> some View {
        modifier(DataLabel(size: size, weight: weight))
    }

    func bodyText(_ size: CGFloat = 15, weight: Font.Weight = .regular, relativeTo style: Font.TextStyle = .body) -> some View {
        modifier(BodyText(size: size, weight: weight, relativeTo: style))
    }
}
