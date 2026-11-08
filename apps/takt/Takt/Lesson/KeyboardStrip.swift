import SwiftUI

/// The on-screen keyboard, `low`...`high` as MIDI notes (C4 = 60). Both ends must be white keys.
/// The key to press now is filled `signal`; the next one is outlined in `cue` with a corner tick.
/// Keys held from any input (MIDI, computer keyboard, touch) fill `muted`. Playable by touch
/// or click, a finger per key (slide to glide across keys). In tap mode (Settings, on by default
/// on the iPhone) a finger anywhere on it plays the notes due instead, chords and all.
struct KeyboardStrip: View {
    let low: Int
    let high: Int
    var now: Set<Int> = []
    var next: Set<Int> = []
    var pressed: Set<Int> = []
    /// Keys → the finger that plays them, drawn as a numbered badge.
    var fingers: [Int: Int] = [:]
    /// Keys half lit, 0...1: the key a Reading lesson's note wanted, just after it was missed
    /// (`Player.readingHint`), fading out on the beat after.
    var soft: [Int: Double] = [:]
    /// The computer keycaps, when Settings shows them; off on the Show me stage.
    var keyCaps = true
    @Environment(\.lessonControls) private var controls
    @AppStorage("tapMode") private var tapMode = KeyboardStrip.tapModeDefault
    /// Settings → Input on the Mac: each key carries the computer key that plays it.
    @AppStorage("showComputerKeys") private var showComputerKeys = false
    /// Each finger's key, while it is down.
    @State private var touched = Touched()
    @Environment(\.offscreen) private var offscreen

    /// A phone has no keyboard; an iPad or a Mac usually sits by one.
    static var tapModeDefault: Bool { UIDevice.current.userInterfaceIdiom == .phone }

    final class Touched {
        var keys: [Int: Int] = [:]
    }

    var body: some View {
        GeometryReader { geo in
            let layout = Layout(low: low, high: high, size: geo.size)

            ZStack(alignment: .topLeading) {
                ForEach(Array(layout.whites.enumerated()), id: \.element) { i, note in
                    Key(note: note, black: false, role: role(note), finger: fingers[note], keyCap: keyCap(note), soft: soft[note] ?? 0)
                        .frame(width: layout.white, height: layout.height)
                        .offset(x: CGFloat(i) * layout.white)
                }
                ForEach(layout.blacks, id: \.self) { note in
                    Key(note: note, black: true, role: role(note), finger: fingers[note], keyCap: keyCap(note), soft: soft[note] ?? 0)
                        .frame(width: layout.blackWidth, height: layout.blackHeight)
                        .offset(x: layout.blackX(note))
                }
            }
            .frame(width: geo.size.width, height: geo.size.height, alignment: .topLeading)
            .overlay {
                if !offscreen { TouchSurface { phase, id, point in touch(phase, id, layout.note(at: point)) } }
            }
        }
    }

    private func touch(_ phase: TouchSurface.Phase, _ id: Int, _ note: Int?) {
        if tapMode {
            if phase == .down { controls.tapDown(id) }
            if phase == .up { controls.tapUp(id) }
            return
        }
        let old = touched.keys[id]
        let new = phase == .up ? nil : note
        guard new != old else { return }
        touched.keys[id] = new
        // A key two fingers hold sounds until the last one leaves it.
        if let old, !touched.keys.values.contains(old) { controls.release(old) }
        if let new, touched.keys.values.filter({ $0 == new }).count == 1 { controls.press(new) }
    }

    /// The computer key for a note's name (`KeyCatcher`'s A–J row and W E T Y U); the octave
    /// follows the song, so every octave shows the same letter.
    private func keyCap(_ note: Int) -> String? {
        guard showComputerKeys, keyCaps else { return nil }
        return ["A", "W", "S", "E", "D", "F", "T", "G", "Y", "H", "U", "J"][((note % 12) + 12) % 12]
    }

    private func role(_ note: Int) -> Key.Role {
        if pressed.contains(note) { return .pressed }
        return now.contains(note) ? .now : next.contains(note) ? .next : .rest
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
    /// The computer key that plays it (Settings → Input → Show computer keys, Mac).
    var keyCap: String? = nil
    /// Half lit, 0...1 (a missed note's key): a wash of `signal`, a third of the key to play now.
    var soft: Double = 0

    var body: some View {
        let shape = UnevenRoundedRectangle(bottomLeadingRadius: 4, bottomTrailingRadius: 4)
        let fill: Color = switch role {
        case .now: Palette.signal
        case .pressed: Palette.muted
        default: black ? Palette.blackKey : Palette.panel
        }

        ZStack(alignment: .bottom) {
            shape.fill(fill)
            if soft > 0, role == .rest {
                shape.fill(Palette.signal.opacity((black ? 0.5 : 0.34) * soft))
            }
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
                if let keyCap {
                    KeyCap(letter: keyCap, black: black, role: role)
                }
                // With the keycaps on, an unnamed white key keeps the name's room, so every cap
                // sits on one row.
                if !black, role != .rest || note % 12 == 0 || keyCap != nil {
                    Text(Self.name(note))
                        .dataLabel(11, weight: .medium)
                        .foregroundStyle(role == .next ? Palette.cue : role == .rest ? Palette.muted : Palette.ground)
                        .opacity(role != .rest || note % 12 == 0 ? 1 : 0)
                }
            }
            .padding(.bottom, 8)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(Self.name(note))\(role == .now ? ", play now" : role == .next ? ", next" : soft > 0 ? ", the note you missed" : "")\(finger.map { ", finger \($0)" } ?? "")")
    }

    static func name(_ note: Int) -> String {
        let names = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"]
        return "\(names[note % 12])\(note / 12 - 1)"
    }
}

/// A computer key's letter as a small keycap: a rounded square, thin rim, heavier bottom lip,
/// drawn quiet (it is a hint, the note name and the cue colors stay the loud things). Ink on the
/// lit and held keys, paper on the black keys (black in both themes), the theme's muted ink on
/// the white ones.
struct KeyCap: View {
    let letter: String
    let black: Bool
    let role: Key.Role

    var body: some View {
        let ink: Color = switch role {
        case .now, .pressed: Palette.blackKey
        case .next: Palette.cue
        case .rest: black ? Color(dark: 0xF2F0EB, paper: 0xF2F0EB) : Palette.muted
        }
        let strength = role == .rest ? 0.55 : 0.85
        let cap = RoundedRectangle(cornerRadius: 4, style: .continuous)
        Text(letter)
            .font(.system(size: 10, weight: .semibold, design: .monospaced))
            .foregroundStyle(ink.opacity(strength))
            .frame(width: 18, height: 17)
            .background(cap.fill(ink.opacity(0.07)))
            .overlay(cap.strokeBorder(ink.opacity(strength * 0.55), lineWidth: 1))
            // The lip: a keycap's bottom edge sits a little heavier than its rim.
            .overlay(alignment: .bottom) {
                Capsule().fill(ink.opacity(strength * 0.55)).frame(width: 12, height: 1.5).offset(y: 0.5)
            }
            .accessibilityHidden(true)
    }
}

private struct OffscreenKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    /// Drawn by ImageRenderer (the debug snapshots), which can't draw a UIKit view: the touch
    /// surface stays out.
    var offscreen: Bool {
        get { self[OffscreenKey.self] }
        set { self[OffscreenKey.self] = newValue }
    }
}
