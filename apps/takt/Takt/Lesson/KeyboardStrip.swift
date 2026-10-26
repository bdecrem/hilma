import SwiftUI

/// The on-screen keyboard, `low`...`high` as MIDI notes (C4 = 60). Both ends must be white keys.
/// The key to press now is filled `signal`; the next one is outlined in `cue` with a corner tick.
/// Keys held from any input (MIDI, computer keyboard, touch) fill `muted`. Playable by touch
/// or click: one finger, slide to glide across keys.
struct KeyboardStrip: View {
    let low: Int
    let high: Int
    var now: Int?
    var next: Int?
    var pressed: Set<Int> = []
    /// Keys → the finger that plays them, drawn as a numbered badge.
    var fingers: [Int: Int] = [:]
    @Environment(\.lessonControls) private var controls
    @State private var touched: Int?

    var body: some View {
        GeometryReader { geo in
            let layout = Layout(low: low, high: high, size: geo.size)

            ZStack(alignment: .topLeading) {
                ForEach(Array(layout.whites.enumerated()), id: \.element) { i, note in
                    Key(note: note, black: false, role: role(note), finger: fingers[note])
                        .frame(width: layout.white, height: layout.height)
                        .offset(x: CGFloat(i) * layout.white)
                }
                ForEach(layout.blacks, id: \.self) { note in
                    Key(note: note, black: true, role: role(note), finger: fingers[note])
                        .frame(width: layout.blackWidth, height: layout.blackHeight)
                        .offset(x: layout.blackX(note))
                }
            }
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0)
                .onChanged { g in
                    let note = layout.note(at: g.location)
                    guard note != touched else { return }
                    if let old = touched { controls.release(old) }
                    if let note { controls.press(note) }
                    touched = note
                }
                .onEnded { _ in
                    if let old = touched { controls.release(old) }
                    touched = nil
                })
        }
    }

    private func role(_ note: Int) -> Key.Role {
        if pressed.contains(note) { return .pressed }
        return note == now ? .now : note == next ? .next : .rest
    }

    static func isBlack(_ note: Int) -> Bool {
        [1, 3, 6, 8, 10].contains(note % 12)
    }

    /// Key geometry, shared by drawing and hit-testing.
    struct Layout {
        let whites: [Int]
        let blacks: [Int]
        let white: CGFloat
        let height: CGFloat
        // Black keys: 58% of a white key wide, 62% tall, centered on the seam after the white below them.
        var blackWidth: CGFloat { white * 0.58 }
        var blackHeight: CGFloat { height * 0.62 }

        init(low: Int, high: Int, size: CGSize) {
            whites = (low...high).filter { !KeyboardStrip.isBlack($0) }
            blacks = (low...high).filter { KeyboardStrip.isBlack($0) }
            white = size.width / CGFloat(whites.count)
            height = size.height
        }

        func blackX(_ note: Int) -> CGFloat {
            CGFloat((whites.firstIndex(of: note - 1) ?? 0) + 1) * white - blackWidth / 2
        }

        func note(at p: CGPoint) -> Int? {
            guard p.y >= 0, p.y <= height, p.x >= 0 else { return nil }
            if p.y <= blackHeight, let b = blacks.first(where: { p.x >= blackX($0) && p.x <= blackX($0) + blackWidth }) {
                return b
            }
            let i = Int(p.x / white)
            return i < whites.count ? whites[i] : nil
        }
    }
}

struct Key: View {
    enum Role { case now, next, rest, pressed }

    let note: Int
    let black: Bool
    let role: Role
    var finger: Int? = nil

    var body: some View {
        let shape = UnevenRoundedRectangle(bottomLeadingRadius: 4, bottomTrailingRadius: 4)
        let fill: Color = switch role {
        case .now: Palette.signal
        case .pressed: Palette.muted
        default: black ? Palette.blackKey : Palette.panel
        }

        ZStack(alignment: .bottom) {
            shape.fill(fill)
            if role == .next {
                shape.strokeBorder(Palette.cue, lineWidth: 1.5)
                CornerTick(inset: 5, leg: 8).fill(Palette.cue)
            } else if role != .now {
                shape.strokeBorder(Palette.line, lineWidth: 1)
            }
            VStack(spacing: 6) {
                if let finger {
                    FingerBadge(finger: finger, onFill: role == .now)
                }
                if !black, role != .rest || note % 12 == 0 {
                    Text(Self.name(note))
                        .dataLabel(11, weight: .medium)
                        .foregroundStyle(role == .next ? Palette.cue : role == .rest ? Palette.muted : Palette.ground)
                }
            }
            .padding(.bottom, 8)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(Self.name(note))\(role == .now ? ", play now" : role == .next ? ", next" : "")\(finger.map { ", finger \($0)" } ?? "")")
    }

    static func name(_ note: Int) -> String {
        let names = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"]
        return "\(names[note % 12])\(note / 12 - 1)"
    }
}
