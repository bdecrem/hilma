import SwiftUI

/// Wraps subviews into fixed-size columns (like CSS `flex-basis: N%`) and
/// centers each line, including a partial last line — the SwiftUI
/// equivalent of the web's narrow-panel knob rows
/// (panels-mobile.css: 4-per-row generally, 3-per-row for JB202's OSC
/// sections, "3 knobs sit centered, 7 wrap as 4 + 3").
struct CenteredFlowLayout: Layout {
    /// How many equal-width cells fit on one line, regardless of the
    /// container's actual width (mirrors a fixed flex-basis percentage).
    var columns: Int
    var lineSpacing: CGFloat = 12
    var itemSpacing: CGFloat = 0

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 300
        let iw = itemWidth(for: width)
        let lines = pack(subviews: subviews, itemWidth: iw)
        let height = lines.reduce(0.0) { $0 + $1.height } + lineSpacing * CGFloat(max(0, lines.count - 1))
        return CGSize(width: width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let iw = itemWidth(for: bounds.width)
        let lines = pack(subviews: subviews, itemWidth: iw)
        var y = bounds.minY
        for line in lines {
            let lineWidth = CGFloat(line.indices.count) * iw + itemSpacing * CGFloat(max(0, line.indices.count - 1))
            var x = bounds.minX + max(0, (bounds.width - lineWidth) / 2)
            for i in line.indices {
                subviews[i].place(at: CGPoint(x: x, y: y), anchor: .topLeading, proposal: ProposedViewSize(width: iw, height: nil))
                x += iw + itemSpacing
            }
            y += line.height + lineSpacing
        }
    }

    private func itemWidth(for width: CGFloat) -> CGFloat {
        max(1, (width - itemSpacing * CGFloat(max(0, columns - 1))) / CGFloat(max(1, columns)))
    }

    private struct Line { var indices: [Int]; var height: CGFloat }

    private func pack(subviews: Subviews, itemWidth: CGFloat) -> [Line] {
        var lines: [Line] = []
        var current: [Int] = []
        var currentHeight: CGFloat = 0
        for (i, subview) in subviews.enumerated() {
            if current.count >= columns {
                lines.append(Line(indices: current, height: currentHeight))
                current = []
                currentHeight = 0
            }
            current.append(i)
            let h = subview.sizeThatFits(ProposedViewSize(width: itemWidth, height: nil)).height
            currentHeight = max(currentHeight, h)
        }
        if !current.isEmpty { lines.append(Line(indices: current, height: currentHeight)) }
        return lines
    }
}
