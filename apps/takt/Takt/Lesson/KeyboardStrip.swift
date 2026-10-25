import SwiftUI

/// The on-screen keyboard, `low`...`high` as MIDI notes (C4 = 60). Both ends must be white keys.
/// The key to press now is filled `signal`; the next one is outlined in `cue` with a corner tick.
struct KeyboardStrip: View {
    let low: Int
    let high: Int
    var now: Int?
    var next: Int?

    var body: some View {
        GeometryReader { geo in
            let whites = (low...high).filter { !Self.isBlack($0) }
            let blacks = (low...high).filter { Self.isBlack($0) }
            let w = geo.size.width / CGFloat(whites.count)
            let h = geo.size.height
            // Black keys: 58% of a white key wide, 62% tall, centered on the seam after the white below them.
            let bw = w * 0.58
            let bh = h * 0.62

            ZStack(alignment: .topLeading) {
                ForEach(Array(whites.enumerated()), id: \.element) { i, note in
                    Key(note: note, black: false, role: role(note))
                        .frame(width: w, height: h)
                        .offset(x: CGFloat(i) * w)
                }
                ForEach(blacks, id: \.self) { note in
                    let seam = CGFloat((whites.firstIndex(of: note - 1) ?? 0) + 1) * w
                    Key(note: note, black: true, role: role(note))
                        .frame(width: bw, height: bh)
                        .offset(x: seam - bw / 2)
                }
            }
        }
    }

    private func role(_ note: Int) -> Key.Role {
        note == now ? .now : note == next ? .next : .rest
    }

    static func isBlack(_ note: Int) -> Bool {
        [1, 3, 6, 8, 10].contains(note % 12)
    }
}

struct Key: View {
    enum Role { case now, next, rest }

    let note: Int
    let black: Bool
    let role: Role

    var body: some View {
        let shape = UnevenRoundedRectangle(bottomLeadingRadius: 4, bottomTrailingRadius: 4)
        let fill: Color = role == .now ? Palette.signal : black ? Palette.blackKey : Palette.panel

        ZStack(alignment: .bottom) {
            shape.fill(fill)
            if role == .next {
                shape.strokeBorder(Palette.cue, lineWidth: 1.5)
                CornerTick(inset: 5, leg: 8).fill(Palette.cue)
            } else if role == .rest {
                shape.strokeBorder(Palette.line, lineWidth: 1)
            }
            if !black, role != .rest || note % 12 == 0 {
                Text(Self.name(note))
                    .dataLabel(11, weight: .medium)
                    .foregroundStyle(role == .now ? Palette.ground : role == .next ? Palette.cue : Palette.muted)
                    .padding(.bottom, 8)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(Self.name(note))\(role == .now ? ", play now" : role == .next ? ", next" : "")")
    }

    static func name(_ note: Int) -> String {
        let names = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"]
        return "\(names[note % 12])\(note / 12 - 1)"
    }
}
