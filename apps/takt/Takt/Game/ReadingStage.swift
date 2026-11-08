import SwiftUI

/// The Reading lesson in the highway's place (2026-11-07, from the mockup Bart approved): the
/// staff scrolls right to left past a fixed playhead, the note to play now framed in `signal`
/// (a frame, not a fill: on a staff, filled and hollow say quarter and half), the next one
/// outlined in `cue` with the corner tick;
/// the finger over each, no names and no coach on screen (the staff is the thing read; the coach
/// line is VoiceOver's); the bar and its beat LEDs bottom right; the cheat sheet beside it,
/// hidden into a side tab (⌘/), the staff taking the room.
struct ReadingStage: View {
    let state: GameState
    let reading: ReadingState
    let compact: Bool
    @Environment(\.gameControls) private var controls
    @AppStorage("readingCheat") private var cheatOpen = true
    @AppStorage("readingCheatPhone") private var cheatOpenPhone = false

    private var open: Bool { compact ? cheatOpenPhone : cheatOpen }

    var body: some View {
        HStack(alignment: .top, spacing: compact ? 0 : 14) {
            ZStack(alignment: .topLeading) {
                StaffView(reading: reading, heardTick: state.heardTick, ticksPerBeat: state.ticksPerBeat, compact: compact)
                    .accessibilityElement()
                    .accessibilityLabel(reading.coach)
                // No clues on the screen (Bart, 2026-11-07: "remove the hints and the large clue
                // letters"): the staff says what to play; only the bar and its beat, bottom right.
                VStack(alignment: .trailing, spacing: 0) {
                    Spacer()
                    HStack(spacing: 8) {
                        Spacer()
                        Text("Bar \(state.bar + 1) / \(state.bars)")
                            .dataLabel(10)
                            .foregroundStyle(Palette.muted)
                        HStack(spacing: 4) {
                            ForEach(0..<4, id: \.self) { i in
                                RoundedRectangle(cornerRadius: 2)
                                    .fill(state.playing && state.beat == i ? Palette.signal : Palette.line)
                                    .frame(width: 9, height: 9)
                            }
                        }
                        .accessibilityHidden(true)
                    }
                }
                .allowsHitTesting(false)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            if !compact {
                if open {
                    CheatSheetPanel(reading: reading, compact: false) { cheatOpen = false }
                        .frame(width: 292)
                } else {
                    CheatTab { cheatOpen = true }
                }
            }
        }
        .overlay(alignment: .topTrailing) {
            // The phone: the sheet slides over the staff, the toggle is in the HUD.
            if compact && open {
                CheatSheetPanel(reading: reading, compact: true) { cheatOpenPhone = false }
                    .frame(maxWidth: 300)
                    .padding(.top, 34)
                    .transition(.move(edge: .trailing).combined(with: .opacity))
            }
        }
        .animation(.easeOut(duration: 0.2), value: open)
    }
}

/// The toggle in the HUD: a book, lit while the sheet is open.
struct CheatToggle: View {
    let compact: Bool
    @AppStorage("readingCheat") private var cheatOpen = true
    @AppStorage("readingCheatPhone") private var cheatOpenPhone = false

    var body: some View {
        let open = compact ? cheatOpenPhone : cheatOpen
        TransportButton(symbol: open ? "book.fill" : "book", lit: open, size: compact ? 34 : 36,
                        label: open ? "Hide the cheat sheet" : "Show the cheat sheet") {
            if compact { cheatOpenPhone.toggle() } else { cheatOpen.toggle() }
        }
        .keyboardShortcut("/", modifiers: .command)
    }
}

/// The sheet hidden: a slim tab on the right edge.
private struct CheatTab: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text("Cheat sheet ⌘/")
                .dataLabel(10)
                .foregroundStyle(Palette.muted)
                .fixedSize()
                .rotationEffect(.degrees(90))
                .frame(width: 28, height: 150)
                .frame(maxHeight: .infinity, alignment: .top)
                .padding(.top, 8)
                .background(RoundedRectangle(cornerRadius: 8).fill(Palette.panel))
                .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Palette.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Show the cheat sheet")
    }
}

/// The lesson's cheat sheet: the clef, the five notes with their fingers, the mnemonics, one tip,
/// the note values.
struct CheatSheetPanel: View {
    let reading: ReadingState
    let compact: Bool
    let hide: () -> Void

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 10)
        // Unscrolled when it fits (the Mac at any height, and the offscreen snapshots, which draw
        // a ScrollView blank); scrolled when it doesn't.
        ViewThatFits(in: .vertical) {
            sheet
            ScrollView { sheet }.scrollBounceBehavior(.basedOnSize)
        }
        .frame(maxHeight: .infinity, alignment: .top)
        .background(shape.fill(Palette.panel))
        .overlay(shape.strokeBorder(Palette.line, lineWidth: 1))
    }

    @ViewBuilder private var sheet: some View {
            if let c = reading.cheat {
                VStack(alignment: .leading, spacing: 7) {
                    HStack {
                        Text("Cheat sheet").dataLabel(10).foregroundStyle(Palette.muted)
                        Spacer()
                        Button(action: hide) {
                            Text(compact ? "Hide" : "Hide ⌘/")
                                .dataLabel(9, weight: .semibold)
                                .foregroundStyle(Palette.muted)
                                .padding(.horizontal, 7)
                                .frame(height: 22)
                                .overlay(RoundedRectangle(cornerRadius: 5).strokeBorder(Palette.line, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                    }
                    Text(c.title)
                        .font(.display(20))
                        .textCase(.uppercase)
                        .foregroundStyle(Palette.text)
                    Text(c.lead)
                        .bodyText(12)
                        .foregroundStyle(Palette.text)
                        .fixedSize(horizontal: false, vertical: true)
                    MiniStaff(clef: reading.clef, notes: c.notes, fingers: reading.fingers)
                        .frame(height: reading.clef == .grand ? 140 : 90)
                    Hairline()
                    ForEach(c.mnemonics, id: \.label) { m in
                        VStack(alignment: .leading, spacing: 2) {
                            (Text(m.label + "  ").foregroundColor(Palette.text)
                                + Text(m.letters.map(String.init).joined(separator: " ")).fontWeight(.bold).foregroundColor(Palette.text))
                                .font(.system(size: 12, design: .monospaced))
                            Text(m.words)
                                .font(.system(size: 10.5, design: .monospaced))
                                .foregroundStyle(Palette.muted)
                        }
                    }
                    Hairline()
                    Text(c.tip)
                        .bodyText(12)
                        .foregroundStyle(Palette.text)
                        .fixedSize(horizontal: false, vertical: true)
                    if c.values {
                        NoteValues().frame(height: 58)
                    }
                }
                .padding(compact ? 14 : 16)
            }
    }
}

// MARK: The staff

/// The staff's geometry in a box: the staves (one, or the grand staff's two), the gap between
/// lines, where the playhead stands, how wide a beat is, where the notes fade in.
struct StaffLayout {
    struct Staff {
        let clef: Reading.Clef
        let top: CGFloat
        let g: CGFloat
        var bottom: CGFloat { top + 4 * g }
        var middle: CGFloat { top + 2 * g }
        func y(step: Int) -> CGFloat { bottom - CGFloat(step) * g / 2 }
    }

    let staves: [Staff]
    let g: CGFloat
    let x0: CGFloat
    let timeX: CGFloat
    let clipX: CGFloat
    let playX: CGFloat
    let beat: CGFloat
    let grand: Bool

    init(clef: Reading.Clef, size: CGSize, compact: Bool) {
        grand = clef == .grand
        g = grand ? (compact ? 13 : 14) : (compact ? 19 : 22)
        x0 = grand ? (compact ? 12 : 20) : (compact ? 4 : 10)
        // The clef is about 4.6 lines wide; the time after it; the music fades in past both.
        timeX = x0 + g * 4.6 + 8
        clipX = timeX + g * 1.2
        playX = clipX + (compact ? 34 : 110)
        beat = compact ? 42 : 64
        // The coach and the chord sit under the staff; the block above them is centered.
        let reserve: CGFloat = compact ? 30 : 36
        let room = max(0, size.height - reserve)
        if grand {
            let block = 60 + 13 * g + 70
            let top = max(0, (room - block) / 2) + 60
            staves = [Staff(clef: .treble, top: top, g: g), Staff(clef: .bass, top: top + 9 * g, g: g)]
        } else {
            let block = 4 * g + 130
            let top = max(0, (room - block) / 2) + 60
            staves = [Staff(clef: clef, top: top, g: g)]
        }
    }

    func staff(for e: Reading.Event) -> Staff {
        grand ? (e.hand == .right ? staves[0] : staves[1]) : staves[0]
    }
}

struct StaffView: View {
    let reading: ReadingState
    let heardTick: Double
    let ticksPerBeat: Int
    let compact: Bool

    var body: some View {
        Canvas { ctx, size in
            let L = StaffLayout(clef: reading.clef, size: size, compact: compact)
            let x1 = size.width - 2
            func x(_ tick: Int) -> CGFloat { L.playX + CGFloat((Double(tick) - heardTick) / Double(ticksPerBeat)) * L.beat }
            let first = L.staves[0], last = L.staves[L.staves.count - 1]

            // The staves, the clefs, the time.
            for s in L.staves {
                StaffDraw.lines(&ctx, s, from: L.x0, to: x1)
                StaffDraw.clef(&ctx, s, x: L.x0 + (L.grand ? 4 : 6))
                StaffDraw.time(&ctx, s, x: L.timeX)
            }
            if L.grand { StaffDraw.brace(&ctx, from: first, to: last, x: L.x0) }

            // The music, faded in after the clef and out at the right edge.
            ctx.drawLayer { layer in
                let fadeIn = (L.clipX) / size.width, fadeInEnd = (L.clipX + 50) / size.width
                let fadeOut = max(fadeInEnd, (size.width - 70) / size.width)
                layer.clipToLayer { mask in
                    mask.fill(Path(CGRect(origin: .zero, size: size)), with: .linearGradient(
                        Gradient(stops: [.init(color: .clear, location: 0), .init(color: .clear, location: fadeIn),
                                         .init(color: .black, location: fadeInEnd), .init(color: .black, location: fadeOut),
                                         .init(color: .clear, location: 1)]),
                        startPoint: .zero, endPoint: CGPoint(x: size.width, y: 0)))
                }
                // Bars: the line a hair before the 1, its number, the chord where it changes.
                for b in reading.bars {
                    let bx = x(b.tick) - 0.45 * L.beat
                    guard bx > L.clipX - 40, bx < size.width + 40 else { continue }
                    for s in L.staves {
                        layer.stroke(Path { p in p.move(to: CGPoint(x: bx, y: s.top)); p.addLine(to: CGPoint(x: bx, y: s.bottom)) },
                                     with: .color(Palette.muted), lineWidth: 1.2)
                    }
                    if L.grand {
                        layer.stroke(Path { p in p.move(to: CGPoint(x: bx, y: first.bottom)); p.addLine(to: CGPoint(x: bx, y: last.top)) },
                                     with: .color(Palette.muted), lineWidth: 1.2)
                    }
                    layer.draw(Text("\(b.n + 1)").font(.system(size: 9, design: .monospaced)).foregroundColor(Palette.muted),
                               at: CGPoint(x: bx - 4, y: first.top - 9), anchor: .trailing)
                    if let c = b.chord {
                        let cy = first.top - (L.grand ? 40 : 52)
                        let chord = layer.resolve(Text(c).font(.display(L.grand ? 22 : 26)).foregroundColor(Palette.text))
                        let w = chord.measure(in: CGSize(width: 200, height: 60)).width
                        layer.draw(chord, at: CGPoint(x: x(b.tick) - 8, y: cy), anchor: .leading)
                        if let n = b.numeral {
                            layer.draw(Text(n).font(.system(size: 10, design: .monospaced)).foregroundColor(Palette.muted),
                                       at: CGPoint(x: x(b.tick) - 8 + w + 5, y: cy + 4), anchor: .leading)
                        }
                    }
                }
                // Notes and rests.
                for n in reading.notes {
                    let nx = x(n.tick)
                    guard nx > L.clipX - 30, nx < size.width + 30 else { continue }
                    let s = L.staff(for: n.event)
                    let color: Color = n.mark == .now ? Palette.signal : n.mark == .next ? Palette.cue : Palette.text
                    var c = layer
                    if n.mark == .played || n.mark == .missed { c.opacity = 0.32 }
                    guard let step = Reading.step(n.event, clef: s.clef) else {
                        StaffDraw.rest(&c, s, x: nx, beats: n.event.beats, color: color)
                        continue
                    }
                    let span = StaffDraw.note(&c, s, x: nx, step: step, beats: n.event.beats, accidental: n.event.accidental, color: color)
                    let rx = s.g * 0.62
                    let frame = CGRect(x: nx - rx - 9, y: span.lowerBound - 7, width: 2 * rx + 18, height: span.upperBound - span.lowerBound + 14)
                    if n.mark == .now {
                        let p = Path(roundedRect: frame, cornerRadius: 6)
                        c.fill(p, with: .color(Palette.signal.opacity(0.12)))
                        c.stroke(p, with: .color(Palette.signal), lineWidth: 2)
                    } else if n.mark == .next {
                        c.stroke(Path(roundedRect: frame, cornerRadius: 6), with: .color(Palette.cue), lineWidth: 1.4)
                        c.fill(CornerTick(inset: 1, leg: 8).path(in: frame), with: .color(Palette.cue))
                    }
                    let lit = n.mark == .now || n.mark == .next
                    // The finger: over the treble, under the bass.
                    if let f = n.event.finger {
                        let fy = n.event.hand == .right ? s.top - 16 : s.bottom + (L.grand ? 3.4 * s.g : 2.0 * s.g + 6)
                        c.draw(Text("\(f)").font(.system(size: 11, weight: .bold, design: .monospaced))
                                .foregroundColor(lit ? color : Palette.muted), at: CGPoint(x: nx, y: fy))
                    }
                }
            }

            // The playhead, fixed.
            let lowRow = L.grand ? last.bottom + 3.4 * last.g + 10 : last.bottom + (reading.clef == .bass ? 2.0 * last.g + 18 : 1.6 * last.g + 10)
            ctx.stroke(Path { p in p.move(to: CGPoint(x: L.playX, y: first.top - 26)); p.addLine(to: CGPoint(x: L.playX, y: lowRow)) },
                       with: .color(Palette.signal), lineWidth: 2)
            ctx.fill(Path { p in
                p.move(to: CGPoint(x: L.playX - 6, y: first.top - 32))
                p.addLine(to: CGPoint(x: L.playX + 6, y: first.top - 32))
                p.addLine(to: CGPoint(x: L.playX, y: first.top - 24))
                p.closeSubpath()
            }, with: .color(Palette.signal))
        }
    }
}

/// The notation, drawn: staff lines, clefs, the time, notes with stems, flags, dots, ledger
/// lines and accidentals, rests. Shared by the staff and the cheat sheet.
enum StaffDraw {
    static func lines(_ ctx: inout GraphicsContext, _ s: StaffLayout.Staff, from: CGFloat, to: CGFloat) {
        for i in 0..<5 {
            let y = (s.top + CGFloat(i) * s.g).rounded() + 0.5
            ctx.stroke(Path { p in p.move(to: CGPoint(x: from, y: y)); p.addLine(to: CGPoint(x: to, y: y)) },
                       with: .color(Palette.line), lineWidth: 1.2)
        }
    }

    /// The clef glyph, its curl on the G line (treble) or its dots around the F line (bass).
    static func clef(_ ctx: inout GraphicsContext, _ s: StaffLayout.Staff, x: CGFloat) {
        let treble = s.clef == .treble
        let text = ctx.resolve(Text(treble ? "\u{1D11E}" : "\u{1D122}")
            .font(.system(size: treble ? s.g * 9.6 : s.g * 5.0))
            .foregroundColor(Palette.text))
        let size = text.measure(in: CGSize(width: 400, height: 400))
        let base = text.firstBaseline(in: size)
        // The glyph's baseline sits on the bottom line for the treble clef, on the second line for the bass.
        let baseline = treble ? s.bottom + s.g * 1.25 : s.bottom - s.g * 0.9
        ctx.draw(text, in: CGRect(x: x, y: baseline - base, width: size.width, height: size.height))
    }

    static func time(_ ctx: inout GraphicsContext, _ s: StaffLayout.Staff, x: CGFloat) {
        for y in [s.top + s.g, s.top + 3 * s.g] {
            ctx.draw(Text("4").font(.display(s.g * 2.4)).foregroundColor(Palette.text), at: CGPoint(x: x, y: y))
        }
    }

    static func brace(_ ctx: inout GraphicsContext, from a: StaffLayout.Staff, to b: StaffLayout.Staff, x: CGFloat) {
        ctx.stroke(Path { p in p.move(to: CGPoint(x: x, y: a.top)); p.addLine(to: CGPoint(x: x, y: b.bottom)) },
                   with: .color(Palette.text), lineWidth: 1.6)
        let t = a.top, e = b.bottom, m = (t + e) / 2, bx = x - 8
        ctx.stroke(Path { p in
            p.move(to: CGPoint(x: bx + 5, y: t))
            p.addCurve(to: CGPoint(x: bx - 4, y: m), control1: CGPoint(x: bx - 4, y: t + 20), control2: CGPoint(x: bx + 6, y: m - 20))
            p.addCurve(to: CGPoint(x: bx + 5, y: e), control1: CGPoint(x: bx + 6, y: m + 20), control2: CGPoint(x: bx - 4, y: e - 20))
        }, with: .color(Palette.text), lineWidth: 2.4)
    }

    /// A note at a step; returns the vertical span of its head and stem (for the now/next frame).
    @discardableResult
    static func note(_ ctx: inout GraphicsContext, _ s: StaffLayout.Staff, x: CGFloat, step: Int, beats: Double,
                     accidental: Int, color: Color) -> ClosedRange<CGFloat> {
        let g = s.g, y = s.y(step: step)
        let rx = g * 0.62, ry = g * 0.44
        // Ledger lines, below and above.
        var k = -2
        while k >= step { ledger(&ctx, s, x: x, y: s.y(step: k), rx: rx, color: color); k -= 2 }
        k = 10
        while k <= step { ledger(&ctx, s, x: x, y: s.y(step: k), rx: rx, color: color); k += 2 }
        let head = Path(ellipseIn: CGRect(x: -rx, y: -ry, width: 2 * rx, height: 2 * ry))
            .applying(CGAffineTransform(rotationAngle: -22 * .pi / 180))
            .applying(CGAffineTransform(translationX: x, y: y))
        let hollow = beats >= 2
        if hollow {
            ctx.stroke(head, with: .color(color), lineWidth: max(1.6, g * 0.1))
        } else {
            ctx.fill(head, with: .color(color))
        }
        var span = (y - ry)...(y + ry)
        if beats < 4 {
            let up = step < 4
            let sx = up ? x + rx - 1.1 : x - rx + 1.1
            let sy = up ? y - 3.5 * g : y + 3.5 * g
            ctx.stroke(Path { p in p.move(to: CGPoint(x: sx, y: y)); p.addLine(to: CGPoint(x: sx, y: sy)) },
                       with: .color(color), lineWidth: 1.6)
            span = min(span.lowerBound, sy)...max(span.upperBound, sy)
            if beats < 1 {
                // The eighth's flag.
                let d: CGFloat = up ? 1 : -1
                ctx.stroke(Path { p in
                    p.move(to: CGPoint(x: sx, y: sy))
                    p.addCurve(to: CGPoint(x: sx + 0.7 * g, y: sy + d * 2.3 * g),
                               control1: CGPoint(x: sx + 0.2 * g, y: sy + d * 1.0 * g), control2: CGPoint(x: sx + 1.2 * g, y: sy + d * 1.4 * g))
                }, with: .color(color), lineWidth: 1.8)
            }
        }
        // A dotted length: the dot in the space to the right.
        if [1.5, 3].contains(beats) {
            let dy = step % 2 == 0 ? y - g / 2 : y
            ctx.fill(Path(ellipseIn: CGRect(x: x + rx + 0.35 * g, y: dy - 0.13 * g, width: 0.26 * g, height: 0.26 * g)), with: .color(color))
        }
        if accidental != 0 {
            ctx.draw(Text(accidental > 0 ? "♯" : "♭").font(.system(size: g * 1.5)).foregroundColor(color),
                     at: CGPoint(x: x - rx - 0.6 * g, y: y))
        }
        return span
    }

    static func ledger(_ ctx: inout GraphicsContext, _ s: StaffLayout.Staff, x: CGFloat, y: CGFloat, rx: CGFloat, color: Color) {
        ctx.stroke(Path { p in p.move(to: CGPoint(x: x - rx - 6, y: y)); p.addLine(to: CGPoint(x: x + rx + 6, y: y)) },
                   with: .color(color), lineWidth: 1.4)
    }

    static func rest(_ ctx: inout GraphicsContext, _ s: StaffLayout.Staff, x: CGFloat, beats: Double, color: Color) {
        let g = s.g
        switch beats {
        case 4...:
            // Hangs from the fourth line.
            ctx.fill(Path(CGRect(x: x - 0.45 * g, y: s.top + g, width: 0.9 * g, height: 0.5 * g)), with: .color(color))
        case 2..<4:
            // Sits on the middle line.
            ctx.fill(Path(CGRect(x: x - 0.45 * g, y: s.middle - 0.5 * g, width: 0.9 * g, height: 0.5 * g)), with: .color(color))
        default:
            // The quarter rest's zigzag (an eighth's too, smaller).
            let k: CGFloat = beats < 1 ? 0.7 : 1
            ctx.stroke(Path { p in
                p.move(to: CGPoint(x: x - 0.2 * g * k, y: s.middle - 1.4 * g * k))
                p.addLine(to: CGPoint(x: x + 0.3 * g * k, y: s.middle - 0.75 * g * k))
                p.addLine(to: CGPoint(x: x - 0.2 * g * k, y: s.middle - 0.15 * g * k))
                p.addLine(to: CGPoint(x: x + 0.3 * g * k, y: s.middle + 0.45 * g * k))
                p.addCurve(to: CGPoint(x: x + 0.05 * g * k, y: s.middle + 1.2 * g * k),
                           control1: CGPoint(x: x - 0.3 * g * k, y: s.middle + 0.2 * g * k), control2: CGPoint(x: x - 0.4 * g * k, y: s.middle + 0.8 * g * k))
            }, with: .color(color), style: StrokeStyle(lineWidth: 0.2 * g, lineCap: .round, lineJoin: .round))
        }
    }
}

/// The cheat sheet's staff: the clef and its notes, each with its name and finger under it (a
/// stacked chord on the grand staff).
private struct MiniStaff: View {
    let clef: Reading.Clef
    let notes: [String]
    let fingers: [String: [String: Int]]

    var body: some View {
        Canvas { ctx, size in
            let g: CGFloat = 10
            let staves: [StaffLayout.Staff] = clef == .grand
                ? [.init(clef: .treble, top: 14, g: g), .init(clef: .bass, top: 14 + 9 * g, g: g)]
                : [.init(clef: clef, top: 12, g: g)]
            for s in staves {
                StaffDraw.lines(&ctx, s, from: 2, to: size.width - 2)
                StaffDraw.clef(&ctx, s, x: 4)
            }
            let stacked = clef == .grand
            for (i, name) in notes.enumerated() {
                guard let p = Reading.pitch(name) else { continue }
                let hand: Reading.Hand = stacked ? (p.midi >= 60 ? .right : .left) : (clef == .bass ? .left : .right)
                let s = stacked ? (hand == .right ? staves[0] : staves[1]) : staves[0]
                let e = Reading.Event(midi: p.midi, beats: 1, finger: nil, hand: hand, letter: p.letter, accidental: p.accidental)
                guard let step = Reading.step(e, clef: s.clef) else { continue }
                let x = stacked ? size.width * 0.5 : 64 + CGFloat(i) * min(40, (size.width - 80) / CGFloat(max(1, notes.count)))
                // A head alone (no stem): a name, not a length.
                StaffDraw.note(&ctx, s, x: x, step: step, beats: 4, accidental: p.accidental, color: Palette.text)
                if stacked {
                    ctx.draw(Text(name).font(.system(size: 10, weight: .bold, design: .monospaced)).foregroundColor(Palette.muted),
                             at: CGPoint(x: x + 16, y: s.y(step: step)), anchor: .leading)
                } else {
                    let base = staves[0].bottom
                    ctx.draw(Text(String(p.letter)).font(.system(size: 11, weight: .bold, design: .monospaced)).foregroundColor(Palette.text),
                             at: CGPoint(x: x, y: base + 25))
                    if let f = fingers[hand.rawValue]?[name] {
                        ctx.draw(Text("\(f)").font(.system(size: 10, design: .monospaced)).foregroundColor(Palette.muted),
                                 at: CGPoint(x: x, y: base + 37))
                    }
                }
            }
        }
        .accessibilityLabel(notes.joined(separator: ", "))
    }
}

/// Quarter, half, whole, a half rest: one beat, two, four, two silent.
private struct NoteValues: View {
    var body: some View {
        Canvas { ctx, size in
            let g: CGFloat = 10
            let s = StaffLayout.Staff(clef: .treble, top: -8, g: g)
            let items: [(Double, Bool, String)] = [(1, false, "1 beat"), (2, false, "2 beats"), (4, false, "4 beats"), (2, true, "2 rest")]
            for (i, it) in items.enumerated() {
                let x = (CGFloat(i) + 0.5) * size.width / CGFloat(items.count)
                if it.1 {
                    StaffDraw.rest(&ctx, StaffLayout.Staff(clef: .treble, top: 6, g: g), x: x, beats: 2, color: Palette.text)
                } else {
                    // Step 2 sits the head low enough for an up-stem to fit.
                    StaffDraw.note(&ctx, s, x: x, step: -1 + 0, beats: it.0, accidental: 0, color: Palette.text)
                }
                ctx.draw(Text(it.2.uppercased()).font(.system(size: 9, design: .monospaced)).foregroundColor(Palette.muted),
                         at: CGPoint(x: x, y: size.height - 5))
            }
        }
        .accessibilityLabel("A quarter note is one beat, a half note two, a whole note four, a half rest two beats of silence")
    }
}

/// The HUD's count for a Reading lesson: a ring of this chorus's notes played of those judged so
/// far, and the gate (two clean choruses), or Done.
struct ReadingMeter: View {
    let reading: ReadingState
    let compact: Bool

    var body: some View {
        let size: CGFloat = compact ? 40 : 50
        let fill = reading.judged == 0 ? 0 : Double(reading.played) / Double(reading.judged)
        HStack(spacing: compact ? 8 : 12) {
            ZStack {
                Circle().stroke(Palette.line, lineWidth: compact ? 3 : 4)
                Circle()
                    .trim(from: 0, to: fill)
                    .stroke(Palette.cue, style: StrokeStyle(lineWidth: compact ? 3 : 4, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                VStack(spacing: -1) {
                    Text("\(reading.played)/\(reading.judged)")
                        .font(.display(compact ? 13 : 17))
                        .monospacedDigit()
                        .foregroundStyle(Palette.text)
                    Text("PLAYED")
                        .font(.system(size: compact ? 5 : 6, weight: .semibold, design: .monospaced))
                        .foregroundStyle(Palette.muted)
                }
            }
            .frame(width: size, height: size)
            VStack(alignment: .leading, spacing: 3) {
                Text(reading.done ? "Done" : "Chorus \(reading.chorus)")
                    .font(.display(compact ? 18 : 22))
                    .textCase(.uppercase)
                    .foregroundStyle(reading.done ? Palette.signal : Palette.text)
                GateRings(clean: min(reading.clean, reading.gate), required: reading.gate, size: compact ? 9 : 11)
            }
            .frame(minWidth: compact ? 60 : 84, alignment: .leading)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(reading.played) of \(reading.judged) played this chorus, \(reading.clean) of \(reading.gate) clean choruses\(reading.done ? ", lesson done" : "")")
    }
}
