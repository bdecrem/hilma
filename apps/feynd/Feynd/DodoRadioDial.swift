import SwiftUI

/// The voice screen's radio, v3 ("the dial" — branding/design/dodo-radio-faces.html,
/// Concept A). A small mid-century tabletop set: bone body, sprout antenna,
/// a glass tuning window with one red needle, and below it either a
/// perforated speaker with a VU meter (hands-free) or one big press-to-talk
/// key (hold-to-talk). No face: the needle is the expression. It rests on
/// LISTEN, swings into the marigold TALK zone while you hold, drifts back
/// while Dodo thinks, and trembles on LISTEN while Dodo speaks.
struct DodoRadioDial: View {
    enum Mood: Equatable {
        case tuning      // connecting
        case listening   // idle, Dodo's turn to listen
        case talking     // hold-to-talk: the key is held
        case thinking    // hold-to-talk: released, waiting for the reply
        case speaking    // Dodo is talking
        case ended
    }

    let tape: String
    let mood: Mood
    let holdToTalk: Bool
    /// Hold-to-talk key callbacks (touch down / lift).
    var onKeyDown: () -> Void = {}
    var onKeyUp: () -> Void = {}

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var keyPressed = false

    private let bodyWidth: CGFloat = 244
    private let ink = Color(hex: 0x2B3036)
    private let inkDeep = Color(hex: 0x14181C)
    private let marigold = Color(hex: 0xF0A830)
    private let marigoldDeep = Color(hex: 0xC9821F)
    private let bone = Color(hex: 0xF6EFDF)
    private let boneShade = Color(hex: 0xE6DCC6)
    private let boneEdge = Color(hex: 0xD9CDB4)
    private let plate = Color(hex: 0x3E3324)

    private var held: Bool { mood == .talking }

    var body: some View {
        VStack(spacing: 0) {
            HStack { Spacer(); sprout }
                .padding(.trailing, 28)
                .zIndex(1)
                .offset(y: 6)

            ZStack {
                // Body with a drop edge.
                RoundedRectangle(cornerRadius: 36)
                    .fill(boneEdge)
                    .offset(y: 4)
                RoundedRectangle(cornerRadius: 36)
                    .fill(LinearGradient(colors: [bone, boneShade], startPoint: .top, endPoint: .bottom))
                RoundedRectangle(cornerRadius: 36)
                    .stroke(.white.opacity(0.55), lineWidth: 1.5)
                if held {
                    RoundedRectangle(cornerRadius: 36)
                        .strokeBorder(marigold, lineWidth: 3)
                }

                VStack(spacing: 18) {
                    dial
                    if holdToTalk { key } else { speaker }
                    label
                }
                .padding(.top, 22)
                .padding(.bottom, 18)
            }
            .fixedSize(horizontal: false, vertical: true)
            .frame(width: bodyWidth)
            .offset(y: held ? 5 : 0)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: held)

            // Feet.
            HStack {
                Capsule().fill(Color(hex: 0x33383E)).frame(width: 26, height: 8)
                Spacer()
                Capsule().fill(Color(hex: 0x33383E)).frame(width: 26, height: 8)
            }
            .padding(.horizontal, 34)
            .offset(y: -1)
        }
        .frame(width: bodyWidth)
        .background(alignment: .bottom) {
            // Ground shadow — tightens while the radio is pressed down.
            Ellipse()
                .fill(plate.opacity(held ? 0.14 : 0.2))
                .frame(width: held ? 190 : 216, height: held ? 16 : 24)
                .blur(radius: 10)
                .offset(y: 14)
                .animation(.easeOut(duration: 0.2), value: held)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(accessibilityText)
    }

    private var accessibilityText: String {
        switch mood {
        case .tuning: return "Connecting"
        case .listening: return holdToTalk ? "Ready. Press and hold to talk." : "Dodo is listening"
        case .talking: return "Listening to you. Release to send."
        case .thinking: return "Dodo is thinking"
        case .speaking: return "Dodo is speaking"
        case .ended: return "Session ended"
        }
    }

    // MARK: Sprout

    private var sprout: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 1.5)
                .fill(Color(hex: 0x5F9E4C))
                .frame(width: 3, height: 22)
                .offset(y: 4)
            Ellipse()
                .fill(Color(hex: 0x7BB662))
                .frame(width: 24, height: 12)
                .rotationEffect(.degrees(-22))
                .offset(x: -11, y: -4)
            Ellipse()
                .fill(Color(hex: 0x5F9E4C))
                .frame(width: 24, height: 12)
                .rotationEffect(.degrees(18))
                .offset(x: 9, y: -9)
        }
        .frame(width: 40, height: 30)
    }

    // MARK: Dial window

    private var needleX: CGFloat {
        // Positions inside the 172pt window: LISTEN, middle, TALK.
        switch mood {
        case .talking: return 150
        case .thinking: return 86
        default: return 30
        }
    }

    private var dial: some View {
        let talkLit = held
        return ZStack(alignment: .topLeading) {
            RoundedRectangle(cornerRadius: 14).fill(boneEdge).offset(y: 2)
            RoundedRectangle(cornerRadius: 14).fill(Color(hex: 0xF3EBD8))

            // Printed band: the TALK zone.
            RoundedRectangle(cornerRadius: 10)
                .fill(marigold.opacity(talkLit ? 0.95 : 0.5))
                .frame(width: 70, height: 68)
                .padding(.leading, 96)
                .padding(.top, 6)
                .shadow(color: marigold.opacity(talkLit ? 0.6 : 0), radius: 8)
                .animation(.easeOut(duration: 0.2), value: talkLit)

            Text("LISTEN")
                .font(.system(size: 8.5, weight: .semibold, design: .monospaced))
                .tracking(1.6)
                .foregroundStyle(plate.opacity(0.85))
                .padding(.leading, 18)
                .padding(.top, 18)
            Text("TALK")
                .font(.system(size: 8.5, weight: .semibold, design: .monospaced))
                .tracking(1.6)
                .foregroundStyle(talkLit ? plate : marigoldDeep)
                .padding(.leading, 136)
                .padding(.top, 18)

            // Ticks + footprints + needle.
            TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: reduceMotion)) { timeline in
                let t = timeline.date.timeIntervalSinceReferenceDate
                Canvas { ctx, size in
                    for i in 0..<15 {
                        let x = 10 + CGFloat(i) * 10.6
                        let tall = i % 5 == 0
                        ctx.fill(Path(CGRect(x: x, y: tall ? 52 : 56, width: 1.4, height: tall ? 10 : 6)),
                                 with: .color(plate.opacity(0.55)))
                    }
                    for px: CGFloat in [22, 56, 90] {
                        var g = ctx
                        g.translateBy(x: px, y: 36)
                        g.fill(Path(ellipseIn: CGRect(x: -2.2, y: -3, width: 4.4, height: 6)), with: .color(plate.opacity(0.35)))
                        g.fill(Path(ellipseIn: CGRect(x: -4.2, y: -4.2, width: 2.4, height: 3.2)), with: .color(plate.opacity(0.35)))
                        g.fill(Path(ellipseIn: CGRect(x: 1.8, y: -4.2, width: 2.4, height: 3.2)), with: .color(plate.opacity(0.35)))
                    }
                    // Needle: quivers while anyone is speaking.
                    let quiver: CGFloat = (mood == .talking || mood == .speaking) && !reduceMotion
                        ? CGFloat(sin(t * 38) * 1.6 + sin(t * 9) * 1.2) : 0
                    let x = needleX + quiver
                    if quiver != 0 {
                        ctx.fill(Path(roundedRect: CGRect(x: x - 4, y: 8, width: 2.4, height: 66), cornerRadius: 1.2),
                                 with: .color(Color(hex: 0xC84A3C).opacity(0.3)))
                        ctx.fill(Path(roundedRect: CGRect(x: x + 2, y: 8, width: 2.4, height: 66), cornerRadius: 1.2),
                                 with: .color(Color(hex: 0xC84A3C).opacity(0.3)))
                    }
                    ctx.fill(Path(roundedRect: CGRect(x: x - 1, y: 8, width: 2, height: 66), cornerRadius: 1),
                             with: .color(Color(hex: 0xC84A3C)))
                    ctx.fill(Path(roundedRect: CGRect(x: x - 3, y: 70, width: 6, height: 6), cornerRadius: 1.5),
                             with: .color(Color(hex: 0x33383E)))
                }
            }
            .animation(.spring(response: 0.45, dampingFraction: 0.6), value: needleX)

            // Glass.
            RoundedRectangle(cornerRadius: 14)
                .fill(LinearGradient(colors: [.white.opacity(0.22), .clear], startPoint: .top, endPoint: .bottom))
            RoundedRectangle(cornerRadius: 14)
                .strokeBorder(plate.opacity(0.18), lineWidth: 1.2)
        }
        .frame(width: 172, height: 80)
    }

    // MARK: Speaker (hands-free)

    private var activity: Double {
        switch mood {
        case .speaking: return 1.0
        case .listening: return 0.3
        default: return 0.12
        }
    }

    private let barSpeeds: [Double] = [5.2, 6.4, 4.5, 6.9, 5.7, 4.9, 6.1]
    private let barPhases: [Double] = [0.0, 1.3, 2.4, 3.1, 4.3, 5.2, 0.7]

    private var speaker: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 16).fill(Color(hex: 0x1F2429)).offset(y: 2)
            RoundedRectangle(cornerRadius: 16).fill(ink)
            TimelineView(.animation(minimumInterval: 1.0 / 20.0, paused: reduceMotion)) { timeline in
                let t = timeline.date.timeIntervalSinceReferenceDate
                HStack(spacing: 13) {
                    ForEach(0..<7, id: \.self) { i in
                        Capsule()
                            .fill(marigold.opacity(mood == .speaking ? 1 : 0.55))
                            .frame(width: 7, height: barHeight(i, t: t))
                    }
                }
            }
            // Perforations over the meter.
            Canvas { ctx, size in
                var y: CGFloat = 4
                while y < size.height {
                    var x: CGFloat = 4
                    while x < size.width {
                        ctx.fill(Path(ellipseIn: CGRect(x: x - 1.6, y: y - 1.6, width: 3.2, height: 3.2)),
                                 with: .color(Color(hex: 0x171B1F).opacity(0.9)))
                        x += 7
                    }
                    y += 7
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 16))
        }
        .frame(width: 168, height: 88)
    }

    private func barHeight(_ i: Int, t: Double) -> CGFloat {
        let wave = 0.5 + 0.5 * sin(t * barSpeeds[i] + barPhases[i])
        let base = 8.0
        let amp = 6.0 + 46.0 * activity
        return CGFloat(base + amp * wave)
    }

    // MARK: Press-to-talk key

    private var keyLegend: String {
        switch mood {
        case .talking: return "LISTENING"
        case .thinking: return "ONE MOMENT"
        case .speaking: return "PRESS TO CUT IN"
        case .tuning: return "TUNING IN"
        case .ended: return "ENDED"
        case .listening: return "PRESS TO TALK"
        }
    }

    private var keyEnabled: Bool { mood == .listening || mood == .speaking || mood == .thinking || mood == .talking }

    private var key: some View {
        let face = held ? marigold : ink
        let legendColor = held ? plate : marigold
        return ZStack {
            if held {
                RoundedRectangle(cornerRadius: 22)
                    .fill(marigold.opacity(0.35))
                    .blur(radius: 10)
                    .padding(-8)
            }
            let rim: CGFloat = held ? 3 : 2
            // Drop edge, then the rim as a filled outer shape with the face
            // inset by the rim width — a stroke rasterizes unevenly at
            // Catalyst's 0.77 scale, an inset fill doesn't.
            // The key's side (the 3D drop edge) is the rim's own colour, so
            // the ring reads as the top of a solid keycap rather than a line
            // floating above a dark slab.
            RoundedRectangle(cornerRadius: 18).fill(held ? Color(hex: 0xA86A14) : marigoldDeep).offset(y: 6)
            RoundedRectangle(cornerRadius: 18).fill(held ? Color(hex: 0xFFD98A) : marigold)
            RoundedRectangle(cornerRadius: 18 - rim)
                .fill(face)
                .padding(rim)
            RoundedRectangle(cornerRadius: 18 - rim)
                .fill(LinearGradient(colors: [.white.opacity(held ? 0.2 : 0.08), .clear], startPoint: .top, endPoint: .center))
                .padding(rim)

            VStack(spacing: 8) {
                Image(systemName: held ? "waveform" : "mic.fill")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(legendColor)
                    .contentTransition(.symbolEffect(.replace))
                Text(keyLegend)
                    .font(.system(size: 10.5, weight: .semibold, design: .monospaced))
                    .tracking(2.2)
                    .foregroundStyle(legendColor)
            }
        }
        .frame(width: 168, height: 92)
        .offset(y: held ? 4 : 0)
        .opacity(keyEnabled ? 1 : 0.55)
        .contentShape(RoundedRectangle(cornerRadius: 18))
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in
                    guard keyEnabled, !keyPressed else { return }
                    keyPressed = true
                    onKeyDown()
                }
                .onEnded { _ in
                    guard keyPressed else { return }
                    keyPressed = false
                    onKeyUp()
                }
        )
        .animation(.spring(response: 0.22, dampingFraction: 0.7), value: held)
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel(held ? "Listening, release to send" : "Press and hold to talk")
    }

    // MARK: Label plate

    private var label: some View {
        Text(tape)
            .font(.system(size: 9.5, weight: .semibold, design: .monospaced))
            .tracking(2)
            .lineLimit(1)
            .foregroundStyle(Color(hex: 0x5C4632))
            .padding(.horizontal, 12)
            .frame(height: 22)
            .frame(maxWidth: 176)
            .background {
                ZStack {
                    RoundedRectangle(cornerRadius: 6).fill(Color(hex: 0xE3D8C0)).offset(y: 1)
                    RoundedRectangle(cornerRadius: 6).fill(Color(hex: 0xEDE4CF))
                }
            }
    }
}
