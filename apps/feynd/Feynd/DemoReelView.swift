import SwiftUI

// The hidden demo reel — one continuous showcase of the Peck world work:
// the lively mascot running through its whole repertoire, the three region
// landscapes, then both region transitions played back to back. For demos
// and screen recordings; reached by long-pressing the "Peck" bar title
// (any build) or `-ShowDemoReel 1` in the simulator. Tap to exit.
struct DemoReelView: View {
    var onDone: () -> Void = {}

    private enum Phase {
        case mascot          // 13s of moods
        case regions         // 9s — the world at 10 / 20 / 30 levels
        case crossing10      // Fern Hollow transition
        case crossing20      // Starfall Summit transition
    }

    @State private var phase: Phase = .mascot
    @State private var phaseStart = Date()

    var body: some View {
        ZStack {
            FeyndTheme.bg.ignoresSafeArea()
            switch phase {
            case .mascot:
                MascotShowcase()
                    .onAppear { schedule(.regions, after: 13) }
            case .regions:
                RegionShowcase()
                    .onAppear { schedule(.crossing10, after: 9) }
            case .crossing10:
                PeckRegionTransitionView(crossing: RegionCrossing(clearedLevel: 10)) {
                    advance(.crossing20)
                }
            case .crossing20:
                PeckRegionTransitionView(crossing: RegionCrossing(clearedLevel: 20)) {
                    onDone()
                }
            }

            // Quiet exit for humans; recordings just never tap it.
            VStack {
                HStack {
                    Spacer()
                    Button { onDone() } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(FeyndTheme.text3)
                            .frame(width: 30, height: 30)
                            .background(FeyndTheme.surface.opacity(0.6), in: Circle())
                    }
                    .buttonStyle(.plain)
                    .padding(.trailing, 14)
                }
                Spacer()
            }
        }
    }

    private func schedule(_ next: Phase, after seconds: Double) {
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds) {
            advance(next)
        }
    }

    private func advance(_ next: Phase) {
        withAnimation(.easeInOut(duration: 0.4)) {
            phase = next
            phaseStart = Date()
        }
    }
}

// MARK: - Scene 1: the mascot's repertoire

private struct MascotShowcase: View {
    @State private var start = Date()

    private let beats: [(label: String, span: ClosedRange<CGFloat>)] = [
        ("Idle — breathing, blinking", 0...3.0),
        ("Happy — the hop", 3.0...4.6),
        ("Excited — three stars!", 4.6...6.4),
        ("Thinking…", 6.4...8.4),
        ("Wrong answer (kept kind)", 8.4...9.9),
        ("Walking", 9.9...13.0),
    ]

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 40.0)) { timeline in
            let t = CGFloat(timeline.date.timeIntervalSince(start))
            VStack(spacing: 0) {
                Text("The Dodo")
                    .font(.custom("Fredoka", size: 30).weight(.semibold))
                    .foregroundStyle(FeyndTheme.text)
                    .padding(.top, 70)
                Text("every move from the animation spec")
                    .font(.system(size: 14))
                    .foregroundStyle(FeyndTheme.text3)
                    .padding(.top, 4)
                Spacer()
                Canvas { ctx, size in
                    var g = ctx
                    let pose = pose(at: t)
                    let x = currentBeat(t) == 5
                        ? size.width * (0.15 + 0.7 * ((t - 9.9) / 3.1))
                        : size.width / 2
                    drawAnimatedDodo(&g, at: CGPoint(x: x, y: size.height - 30), height: 210, pose: pose)
                    // Ground line so hops read against something.
                    var ground = Path()
                    ground.move(to: CGPoint(x: size.width * 0.12, y: size.height - 26))
                    ground.addLine(to: CGPoint(x: size.width * 0.88, y: size.height - 26))
                    g.stroke(ground, with: .color(FeyndTheme.border), style: StrokeStyle(lineWidth: 2, lineCap: .round, dash: [0.1, 9]))
                }
                .frame(height: 330)
                Spacer()
                Text(beats[currentBeat(t)].label)
                    .font(.custom("Fredoka", size: 19).weight(.medium))
                    .foregroundStyle(FeyndTheme.text2)
                    .padding(.bottom, 90)
                    .id(currentBeat(t))
                    .transition(.opacity)
            }
        }
    }

    private func currentBeat(_ t: CGFloat) -> Int {
        for (i, b) in beats.enumerated() where b.span.contains(t) { return i }
        return t < 0 ? 0 : beats.count - 1
    }

    private func pose(at t: CGFloat) -> DodoPose {
        let idle = DodoMood.idle(t, seed: 1)
        switch currentBeat(t) {
        case 1:
            var p = DodoMood.happy((t - 3.2) / 0.6)
            p.eyeScaleY = idle.eyeScaleY
            return p
        case 2:
            var p = DodoMood.excited((t - 4.8) / 1.1)
            p.scaleY *= idle.scaleY
            return p
        case 3:
            var p = DodoMood.thinking(min(1, (t - 6.4) / 0.8))
            p.scaleY = idle.scaleY; p.scaleX = idle.scaleX
            return p
        case 4:
            return DodoMood.wrong((t - 8.5) / 1.0)
        case 5:
            return DodoMood.walking(t, phase: (t - 9.9) * 9)
        default:
            return idle
        }
    }
}

// MARK: - Scene 2: the world grows

private struct RegionShowcase: View {
    @State private var start = Date()

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { timeline in
            let t = timeline.date.timeIntervalSince(start)
            let idx = min(2, Int(t / 3))
            VStack(spacing: 14) {
                Text("Three regions")
                    .font(.custom("Fredoka", size: 30).weight(.semibold))
                    .foregroundStyle(FeyndTheme.text)
                    .padding(.top, 70)
                Text(["Sunrise Meadow · levels 1–10",
                      "Fern Hollow · levels 11–20",
                      "Starfall Summit · levels 21–30"][idx])
                    .font(.custom("Fredoka", size: 16).weight(.medium))
                    .foregroundStyle(Color(hex: 0xC77E2B))
                    .id(idx)
                PeckWorldCanvas(height: 560, levelCount: (idx + 1) * 10,
                                pitch: 560 / CGFloat((idx + 1) * 10 + 4),
                                bottomPad: 60,
                                t: CGFloat(timeline.date.timeIntervalSinceReferenceDate))
                    .frame(width: 340, height: 560)
                    .clipShape(RoundedRectangle(cornerRadius: 30))
                    .overlay(RoundedRectangle(cornerRadius: 30).stroke(FeyndTheme.border, lineWidth: 1))
                    .id("world-\(idx)")
                    .transition(.opacity)
                Spacer()
            }
        }
    }
}
