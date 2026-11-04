import Foundation
import SwiftUI

/// Show me on a scale step: the run's keys as a keyboard with the hand over them. The hand
/// travels as the run goes, the finger that plays sitting lit over its key and the next one
/// outlined; the thumb curls under before it crosses; each key lights as its note is heard.
/// Takes the pads' place while the step plays for you (`LessonScreen`); the staircase comes
/// back when it's your turn.
struct DemoStage: View {
    let run: LessonState.Run
    var now: Set<Int> = []
    var next: Set<Int> = []
    var pressed: Set<Int> = []
    /// Keys → the finger that plays them, badged on the keys.
    var fingers: [Int: Int] = [:]
    var compact = false

    /// The hand's fingers sit a white key apart: this many drawing units per key.
    static let unitsPerKey: CGFloat = 40

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 8)
        VStack(spacing: 0) {
            HStack {
                Text(title)
                    .dataLabel(compact ? 11 : 12, weight: .semibold)
                    .foregroundStyle(Palette.muted)
                Spacer(minLength: 0)
                Text("Run \(run.number)")
                    .dataLabel(compact ? 11 : 12, weight: .semibold)
                    .foregroundStyle(Palette.signal)
            }
            GeometryReader { g in scene(in: g.size) }
                .padding(.top, compact ? 8 : 14)
        }
        .padding(compact ? 12 : 18)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(shape.fill(Palette.panel))
        .overlay(shape.strokeBorder(Palette.line, lineWidth: 1))
        .accessibilityElement(children: .contain)
        .accessibilityLabel(spoken)
    }

    /// The keyboard: the run's keys with a white key of room each side.
    var range: ClosedRange<Int> {
        let keys = run.notes.map(\.key)
        var low = (keys.min() ?? 60) - 1, high = (keys.max() ?? 72) + 1
        while KeyboardStrip.isBlack(low) { low -= 1 }
        while KeyboardStrip.isBlack(high) { high += 1 }
        return low...high
    }

    private func scene(in size: CGSize) -> some View {
        let r = range
        let captionH: CGFloat = compact ? 18 : 22
        // The keys, the hand reaching into them from below with the palm under them, and the
        // crossing's name under the hand; the three centered in the panel.
        let keyHeight = min(compact ? 110 : 150, size.height * 0.46)
        let layout = KeyboardStrip.Layout(low: r.lowerBound, high: r.upperBound, size: CGSize(width: size.width, height: keyHeight))
        // Where a fingertip rests on a key: well below the black keys.
        let tipDepth = keyHeight * 0.8
        // Fingers a white key apart; the lowest-reaching pose (the middle finger down, tip +
        // (200 - 6) units) still clears the caption.
        let scale = min(layout.white / Self.unitsPerKey, (size.height - tipDepth - captionH - 8) / 194, 1.1)
        let sceneH = tipDepth + 194 * scale + 8 + captionH
        let top = max(0, (size.height - sceneH) / 2)
        let i = run.index ?? 0
        let note = run.notes.isEmpty ? LessonState.Run.Note(key: r.lowerBound, finger: 1) : run.notes[min(i, run.notes.count - 1)]
        let tip = Self.tip(of: max(1, note.finger), right: run.right)
        let keyX = Self.centerX(of: note.key, in: layout)
        let origin = CGPoint(x: keyX - tip.x * scale, y: top + tipDepth - tip.y * scale)
        let down = run.index == nil || run.resting ? nil : note.finger
        let next = run.index == nil ? note.finger : run.next?.finger
        let crossing = run.resting || run.index == nil ? nil : run.now.flatMap { a in run.next.map { b in LessonState.Run.crossing(from: a, to: b, right: run.right) } } ?? nil
        return ZStack(alignment: .topLeading) {
            // The key being played shows lit, not held (the strip below shows the hold).
            KeyboardStrip(low: r.lowerBound, high: r.upperBound, now: now, next: next.map { _ in self.next } ?? [],
                          pressed: pressed.subtracting(now), fingers: fingers, keyCaps: false)
                .frame(width: size.width, height: keyHeight)
                .offset(y: top)
                .allowsHitTesting(false)
            HandView(down: down, next: next, tuck: tucking, right: run.right)
                .frame(width: 240 * scale, height: 200 * scale)
                .offset(x: origin.x, y: origin.y)
                .animation(.easeInOut(duration: 0.16), value: run.index)
                .animation(.easeInOut(duration: 0.16), value: run.resting)
                .allowsHitTesting(false)
            // The move the hand is about to make, under it: "Thumb under", "Middle over".
            Text(crossing?.uppercased() ?? " ")
                .dataLabel(compact ? 10 : 11, weight: .semibold)
                .foregroundStyle(Palette.signal)
                .frame(width: 200)
                .offset(x: keyX - 100, y: top + sceneH - captionH)
                .opacity(crossing == nil ? 0 : 1)
                .animation(.easeInOut(duration: 0.16), value: run.index)
                .accessibilityHidden(true)
        }
        .frame(width: size.width, height: size.height, alignment: .topLeading)
        .clipped()
    }

    /// A key's center on the keyboard.
    static func centerX(of note: Int, in layout: KeyboardStrip.Layout) -> CGFloat {
        if KeyboardStrip.isBlack(note) { return layout.blackX(note) + layout.blackWidth / 2 }
        let i = layout.whites.firstIndex(of: note) ?? 0
        return (CGFloat(i) + 0.5) * layout.white
    }

    /// A fingertip in the hand's 240 × 200 drawing: fingers 2–5 at the top of their column
    /// (leaning out a little, as drawn); the thumb out to the side at rest, from its base. The
    /// left hand is the drawing mirrored.
    static func tip(of finger: Int, right: Bool) -> CGPoint {
        var p: CGPoint
        if finger == 1 {
            let angle = -42.0 * Double.pi / 180
            p = CGPoint(x: HandView.thumbBase.x + HandView.thumbLength * CGFloat(Foundation.sin(angle)),
                        y: HandView.thumbBase.y - HandView.thumbLength * CGFloat(Foundation.cos(angle)))
        } else {
            let f = min(5, finger)
            let g = HandView.fingers[f]
            let len = HandView.fingerBottom - g.top
            let lean = Double(f - 3) * 3.5 * Double.pi / 180
            p = CGPoint(x: g.x + len * CGFloat(Foundation.sin(lean)), y: HandView.fingerBottom - len * CGFloat(Foundation.cos(lean)))
        }
        return right ? p : CGPoint(x: 240 - p.x, y: p.y)
    }

    /// The thumb tucks under when the next step is the thumb crossing.
    private var tucking: Bool {
        guard let a = run.now, let b = run.next, !run.resting else { return false }
        return LessonState.Run.crossing(from: a, to: b, right: run.right) == "Thumb under"
    }

    /// "A minor pentatonic · show me", "C major · left hand · show me"
    private var title: String {
        [run.name, run.right ? "" : "left hand", "show me"].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    private var spoken: String {
        guard let now = run.now else { return "\(title). Watch the hand." }
        let next = run.next.map { ", next \(Key.letter($0.key, flats: run.flats)) with \(LessonState.Run.fingerWord($0.finger).lowercased())" } ?? ""
        return "\(title). \(run.resting ? "Hold" : "Now") \(Key.letter(now.key, flats: run.flats)), \(LessonState.Run.fingerWord(now.finger).lowercased())\(next)"
    }
}
