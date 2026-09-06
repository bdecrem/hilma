import SwiftUI

/// The signature 16-step LED strip (kick / snare / hats). Static on library
/// cards; the current step is ringed while the transport plays. Port of
/// `src/app/jam/LedStrip.tsx`.
struct LedStripView: View {
    var strip: Strip?
    /// Current 16th within the bar (0-15), nil when stopped.
    var step: Int? = nil
    var big: Bool = false

    private static let empty = String(repeating: "0", count: 16)

    private var rows: [(String, [Character], Color)] {
        let s = strip ?? Strip(k: Self.empty, s: Self.empty, h: Self.empty)
        return [
            ("k", Array(s.k), JBTheme.orange),
            ("s", Array(s.s), JBTheme.cobalt),
            ("h", Array(s.h), JBTheme.ink),
        ]
    }

    var body: some View {
        VStack(spacing: big ? 4 : 3) {
            ForEach(rows, id: \.0) { _, bits, hitColor in
                HStack(spacing: big ? 4 : 3) {
                    ForEach(0..<16, id: \.self) { i in
                        let hit = i < bits.count && bits[i] == "1"
                        let now = step == i
                        cell(hit: hit, now: now, hitColor: hitColor)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func cell(hit: Bool, now: Bool, hitColor: Color) -> some View {
        RoundedRectangle(cornerRadius: big ? 3 : 2, style: .continuous)
            .fill(hit ? hitColor : (now ? JBTheme.ink3 : JBTheme.ledOff))
            .opacity(hit || now ? (hit ? 1 : 0.9) : 0.55)
            .overlay(
                RoundedRectangle(cornerRadius: big ? 3 : 2, style: .continuous)
                    .stroke(hit && now ? JBTheme.ink : .clear, lineWidth: 1.5)
            )
            .frame(height: big ? 10 : 6)
            .shadow(color: hit && now ? hitColor.opacity(0.6) : .clear, radius: hit && now ? 4 : 0)
    }
}

#Preview {
    VStack(spacing: 20) {
        LedStripView(strip: Strip(k: "1000100010001000", s: "0000100000001000", h: "1010101010101010"), step: 4)
        LedStripView(strip: nil)
    }
    .padding()
    .background(JBTheme.panel3)
}
