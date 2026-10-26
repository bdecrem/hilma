import SwiftUI

/// Calibration (brief §5.9) as a timing dial: before the first lesson, and from Settings. A click
/// every beat at 90; tap along on any key (the MIDI keyboard, the computer keys, or the pad
/// here) and the needle swings to how early or late the tap landed, with the saved correction
/// already applied. In the middle means the correction is right. Once eight taps lean the same
/// way, Use this moves the correction by that much and the needle starts over from it.
struct CalibrationScreen: View {
    let app: AppModel
    let player: Player
    @Environment(\.horizontalSizeClass) private var sizeClass
    /// The correction just saved with Use this, for the line that confirms it.
    @State private var saved: Double?

    var body: some View {
        let compact = sizeClass == .compact
        let c = player.calibration
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 16) {
                TransportButton(symbol: "chevron.left", lit: false, size: compact ? 34 : 36, label: "Back") {
                    player.endCalibration()
                    app.leaveCalibration()
                }
                Text("Timing")
                    .font(.display(compact ? 34 : 44))
                    .textCase(.uppercase)
                    .foregroundStyle(Palette.text)
                StaffLines()
                    .frame(maxWidth: .infinity)
            }
            .padding(.top, compact ? 8 : 24)
            .padding(.bottom, 16)

            Text(headline(c))
                .bodyText(compact ? 17 : 20, weight: .semibold, relativeTo: .title3)
                .foregroundStyle(Palette.text)
                .fixedSize(horizontal: false, vertical: true)
            Text(detail(c))
                .bodyText(15)
                .foregroundStyle(Palette.muted)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 8)

            Dial(calibration: c)
                .frame(maxWidth: 560)
                .frame(maxWidth: .infinity)
                .padding(.top, compact ? 16 : 24)

            BeatLights(click: c == nil ? nil : player.calibrationClick)
                .frame(maxWidth: .infinity)
                .padding(.top, 14)

            if c != nil {
                TapPad(player: player)
                    .frame(maxWidth: .infinity)
                    .frame(height: compact ? 120 : 90)
                    .padding(.top, 18)
            }

            Spacer(minLength: 16)
            HStack(spacing: 10) {
                if c == nil {
                    PrimaryButton(title: "Start") { player.startCalibration() }
                    QuietButton(title: "Skip") {
                        player.endCalibration()
                        app.leaveCalibration()
                    }
                } else {
                    if let p = c?.proposed, let a = c?.average, abs(a) >= Calibration.minLeanMs {
                        PrimaryButton(title: "Use this: \(Calibration.words(p))") {
                            player.useCalibration()
                            saved = p
                        }
                    }
                    QuietButton(title: "Done") {
                        player.endCalibration()
                        app.leaveCalibration()
                    }
                }
                Spacer()
            }
            .padding(.bottom, compact ? 8 : 24)
        }
        .padding(.horizontal, compact ? 16 : 40)
        .frame(maxWidth: compact ? .infinity : 820, alignment: .leading)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Palette.ground.ignoresSafeArea())
    }

    private func headline(_ c: Calibration?) -> String {
        guard let c else { return "Tap any key with the click." }
        if (player.calibrationClick ?? 0) < Calibration.listen && c.taps.isEmpty { return "Listen: one bar, then tap." }
        if let saved, c.taps.count < Calibration.window { return "Saved: you play \(Calibration.words(saved)). Keep tapping." }
        guard let a = c.average else { return "Tap with the click." }
        if !c.steady { return "All over the place. Keep tapping until the marks bunch up." }
        return abs(a) < Calibration.minLeanMs ? "Dead center. Your timing is right as it is." : "You land \(Calibration.words(a)), every time."
    }

    private func detail(_ c: Calibration?) -> String {
        let base = c?.base ?? Player.inputOffsetMs
        let now = base == 0 ? "No correction yet, so the needle shows your raw timing."
                            : "The needle already takes out your saved correction (you play \(Calibration.words(base)))."
        guard let c else {
            return "A click plays every beat. Line your note up with it, the way you will with the band, and the needle shows how each tap landed. \(now) In the middle means it's right."
        }
        guard c.taps.count >= Calibration.window else {
            return "\(now) \(c.taps.count) of \(Calibration.window) taps."
        }
        if saved != nil && c.steady, let a = c.average, abs(a) < Calibration.minLeanMs { return "The needle sits in the middle now. Done when you are." }
        return c.steady && abs(c.average ?? 0) >= Calibration.minLeanMs
            ? "Use this moves the correction by \(Int(abs(c.average!).rounded())) ms, and the needle should sit in the middle after."
            : "The average of your last \(Calibration.window) taps is the thick mark."
    }
}

/// The dial: early on the left, late on the right, ±80 ms over 120°. The orange band is on time
/// (±20 ms); faint marks are the last eight taps, the thick one their average, and the needle
/// swings to the latest tap.
struct Dial: View {
    let calibration: Calibration?

    static let sweep = 60.0
    static func angle(_ ms: Double) -> Double {
        max(-1, min(1, ms / Calibration.scaleMs)) * sweep
    }

    var body: some View {
        let needle = calibration?.needle
        VStack(spacing: 6) {
            GeometryReader { g in face(g.size) }
                .aspectRatio(2.0, contentMode: .fit)
            Text(needle.map { Calibration.words($0) } ?? "–")
                .font(.display(34))
                .textCase(.uppercase)
                .monospacedDigit()
                .foregroundStyle(needle.map { abs($0) <= Calibration.onTimeMs } ?? false ? Palette.signal : Palette.text)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(needle.map { "Last tap \(Calibration.words($0))" } ?? "No taps yet")
        .accessibilityValue(calibration?.average.map { "Average \(Calibration.words($0))" } ?? "")
    }

    /// The needle's length, and the point it turns on: the bottom middle.
    private func geometry(_ size: CGSize) -> (r: CGFloat, pivot: CGPoint) {
        let fit = size.width / 2 / CGFloat(sin(Self.sweep * .pi / 180)) * 0.92
        return (min(fit, size.height * 0.9), CGPoint(x: size.width / 2, y: size.height - 4))
    }

    /// A point on a ray from the pivot: `deg` from straight up, clockwise.
    private static func point(_ pivot: CGPoint, _ deg: Double, _ radius: CGFloat) -> CGPoint {
        let a = CGFloat((deg - 90) * .pi / 180)
        return CGPoint(x: pivot.x + radius * cos(a), y: pivot.y + radius * sin(a))
    }

    private func face(_ size: CGSize) -> some View {
        let (r, pivot) = geometry(size)
        return ZStack {
            Canvas { ctx, _ in draw(&ctx, r: r, pivot: pivot) }
            labels(r: r, pivot: pivot)
            needleView(r: r, pivot: pivot, size: size)
            Circle().fill(Palette.text).frame(width: 14, height: 14).position(pivot)
        }
    }

    private func draw(_ ctx: inout GraphicsContext, r: CGFloat, pivot: CGPoint) {
        // On time.
        var zone = Path()
        zone.addArc(center: pivot, radius: r * 0.9, startAngle: .degrees(Self.angle(-Calibration.onTimeMs) - 90),
                    endAngle: .degrees(Self.angle(Calibration.onTimeMs) - 90), clockwise: false)
        ctx.stroke(zone, with: .color(Palette.signal.opacity(0.35)), lineWidth: r * 0.09)
        // The scale, every 10 ms.
        for ms in stride(from: -80.0, through: 80.0, by: 10) {
            let major = Int(ms) % 40 == 0
            var t = Path()
            t.move(to: Self.point(pivot, Self.angle(ms), r * (major ? 0.8 : 0.85)))
            t.addLine(to: Self.point(pivot, Self.angle(ms), r * 0.95))
            ctx.stroke(t, with: .color(major ? Palette.text : Palette.muted), lineWidth: major ? 2 : 1)
        }
        // The last eight taps.
        for ms in calibration?.recent ?? [] {
            let p = Self.point(pivot, Self.angle(ms), r)
            ctx.fill(Path(ellipseIn: CGRect(x: p.x - 3.5, y: p.y - 3.5, width: 7, height: 7)), with: .color(Palette.muted.opacity(0.7)))
        }
        // Their average.
        if let a = calibration?.average {
            var t = Path()
            t.move(to: Self.point(pivot, Self.angle(a), r * 0.72))
            t.addLine(to: Self.point(pivot, Self.angle(a), r))
            ctx.stroke(t, with: .color(Palette.cue), style: StrokeStyle(lineWidth: 6, lineCap: .round))
        }
    }

    private func labels(r: CGFloat, pivot: CGPoint) -> some View {
        ZStack {
            ForEach([-80.0, -40, 40, 80], id: \.self) { ms in
                Text(String(format: "%+.0f", ms))
                    .dataLabel(10)
                    .foregroundStyle(Palette.muted)
                    .position(Self.point(pivot, Self.angle(ms), r * 0.68))
            }
            Text("Early").dataLabel(11, weight: .semibold).foregroundStyle(Palette.muted)
                .position(x: pivot.x - r * 0.62, y: pivot.y - 10)
            Text("Late").dataLabel(11, weight: .semibold).foregroundStyle(Palette.muted)
                .position(x: pivot.x + r * 0.62, y: pivot.y - 10)
        }
    }

    private func needleView(r: CGFloat, pivot: CGPoint, size: CGSize) -> some View {
        let needle = calibration?.needle
        let length = r * 0.95
        return Capsule()
            .fill(needle == nil ? Palette.muted : Palette.signal)
            .frame(width: 4, height: length)
            .position(x: pivot.x, y: pivot.y - length / 2)
            .rotationEffect(.degrees(Self.angle(needle ?? 0)), anchor: UnitPoint(x: pivot.x / size.width, y: pivot.y / size.height))
            .animation(.interpolatingSpring(stiffness: 170, damping: 14), value: needle)
    }
}

/// Four lights, one per beat; the lit one is the click heard now, beat 1 in `signal`.
struct BeatLights: View {
    let click: Int?

    var body: some View {
        HStack(spacing: 12) {
            ForEach(0..<4, id: \.self) { b in
                let lit = click.map { $0 % 4 == b } ?? false
                Circle()
                    .fill(lit ? (b == 0 ? Palette.signal : Palette.text) : Palette.line)
                    .frame(width: 12, height: 12)
            }
        }
        .accessibilityHidden(true)
    }
}

/// A big key to tap on: it plays and scores like a key on the keyboard strip (middle C).
struct TapPad: View {
    let player: Player
    @State private var down = false

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 8)
        shape.fill(down ? Palette.signal.opacity(0.25) : Palette.panel)
            .overlay(shape.strokeBorder(Palette.line, lineWidth: 1))
            .overlay(Text("Tap").dataLabel(13, weight: .semibold).foregroundStyle(Palette.muted))
            .contentShape(shape)
            .gesture(DragGesture(minimumDistance: 0)
                .onChanged { _ in
                    guard !down else { return }
                    down = true
                    player.press(60)
                }
                .onEnded { _ in
                    down = false
                    player.release(60)
                })
            .accessibilityElement()
            .accessibilityLabel("Tap pad")
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { player.press(60); player.release(60) }
    }
}
