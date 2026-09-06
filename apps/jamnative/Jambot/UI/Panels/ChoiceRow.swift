import SwiftUI

/// Row of option pills for a choice param (waveform, sub mode, LFO shape,
/// delay sync…) — port of `alt/Knob.tsx`'s `Choice`.
struct ChoiceRow: View {
    let options: [String]
    let value: String
    var skin: PanelSkin
    var labels: [String: String] = [:]
    /// Set for a long option list (fx-choice--many): wraps 3-per-row
    /// instead of a single scrolling row.
    var wrapColumns: Int? = nil
    var onPick: (String) -> Void

    var body: some View {
        // Wrapped (fixed-column) rows give each pill a narrow cell — like
        // the web's `.wave-btn { padding: 0 }` in a 4-up grid — so pills
        // there fill the cell with no horizontal padding of their own;
        // an unwrapped row (e.g. JT-30's two-option toggle) can afford
        // real padding since it sizes to content.
        let tight = wrapColumns != nil
        let content = ForEach(options, id: \.self) { o in
            let active = o == value
            Button(action: { onPick(o) }) {
                Text(labels[o] ?? o.uppercased())
                    .font(.system(size: 10, weight: .semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .padding(.horizontal, tight ? 2 : 10)
                    .frame(maxWidth: tight ? .infinity : nil, minHeight: 32)
                    .background(active ? skin.accent : skin.bg.opacity(0.001))
                    .foregroundStyle(active ? skin.bg : skin.dim)
                    .overlay(RoundedRectangle(cornerRadius: 5, style: .continuous).stroke(active ? skin.accent : skin.accent.opacity(0.35), lineWidth: 1))
                    .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
            }
            .buttonStyle(.plain)
        }
        Group {
            if let columns = wrapColumns {
                CenteredFlowLayout(columns: columns, lineSpacing: 4, itemSpacing: 4) { content }
            } else {
                HStack(spacing: 4) { content }
            }
        }
    }
}
