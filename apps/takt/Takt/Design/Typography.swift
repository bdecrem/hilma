import SwiftUI

// System fonts only (brief §2). Sizes go through @ScaledMetric so they follow Dynamic Type on
// iPhone; on the Mac idiom text styles shrink to macOS sizes, so the base sizes are given in points.

extension Font {
    /// Display: SF Pro compressed, heavy. Lesson titles, the big tempo number.
    static func display(_ size: CGFloat) -> Font {
        .system(size: size, weight: .heavy).width(.compressed)
    }
}

/// Data & labels: SF Mono, uppercase, +12% tracking, 11–13 pt. They follow Dynamic Type up to
/// 1.35x: they label a dense instrument panel (pads, strips, transport) whose boxes don't grow;
/// past that they truncate and outgrow what they label. Body text scales all the way.
struct DataLabel: ViewModifier {
    static let maxScale: CGFloat = 1.35
    @ScaledMetric private var scaled: CGFloat
    private let base: CGFloat
    private let weight: Font.Weight

    init(size: CGFloat, weight: Font.Weight) {
        _scaled = ScaledMetric(wrappedValue: size, relativeTo: size < 12 ? .caption2 : size < 13 ? .caption : .footnote)
        base = size
        self.weight = weight
    }

    func body(content: Content) -> some View {
        let size = min(scaled, base * Self.maxScale)
        // Blues (`Vibe`): a typewriter face where Electronic has the mono, the set list typed
        // on the back of a record sleeve. It runs narrower than SF Mono, so nothing a label
        // fits in gets tighter; a point larger and less tracking keep it as legible at 9 pt.
        let blues = Vibe.current == .blues
        return content
            .font(blues ? .custom(Self.typewriter(weight), fixedSize: size + 1) : .system(size: size, weight: weight, design: .monospaced))
            .textCase(.uppercase)
            .tracking(size * (blues ? 0.09 : 0.12))
            .monospacedDigit()
    }

    /// American Typewriter ships with iOS and macOS (the brief's "system fonts only" holds).
    static func typewriter(_ weight: Font.Weight) -> String {
        switch weight {
        case .semibold, .bold, .heavy, .black: return "AmericanTypewriter-Semibold"
        default: return "AmericanTypewriter"
        }
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
        // Blues reads in a serif (New York), like liner notes; Electronic in SF Pro.
        content.font(.system(size: size, weight: weight, design: Vibe.current == .blues ? .serif : .default))
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
