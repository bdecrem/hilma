import SwiftUI

/// The Flash tab — Jumbo Flash Game. A vertical level path (think Duolingo)
/// over every flash card the user owns, across all topics. Pass a level
/// (7/10) to unlock the next; 9/10 = 2 node stars, perfect = 3.
struct FlashTabView: View {
    @Environment(Session.self) private var session

    @State private var state: JumboState? = nil
    @State private var loading = true
    @State private var errorMessage: String? = nil
    @State private var sheetLevel: JumboLevelInfo? = nil
    @State private var startingLevel: Int? = nil
    @State private var activeSet: FlashStart? = nil
    @State private var voiceSet: FlashStart? = nil
    @State private var showProfile = false
    @State private var pulse = false

    // Path geometry — one shared set of numbers for nodes AND connectors.
    // Node centers: y = topPad + i * pitch, x = centerX + amp * zigzag(i).
    private let nodeSize: CGFloat = 68
    private let pitch: CGFloat = 116
    private let topPad: CGFloat = 40
    private let bottomPad: CGFloat = 130
    private let amp: CGFloat = 78

    /// -1, 0, +1, 0, -1, … period-4 zigzag keeps the path snaking without
    /// ever leaving a phone-width column.
    private func zig(_ i: Int) -> CGFloat {
        switch i % 4 {
        case 0: return 0
        case 1: return -1
        case 2: return 0
        default: return 1
        }
    }

    var body: some View {
        ZStack {
            FeyndTheme.bg.ignoresSafeArea()
            VStack(spacing: 0) {
                FeyndTopBar {
                    Text("Arcade")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(FeyndTheme.text2)
                } trailing: {
                    xpPill
                } onProfileTap: {
                    showProfile = true
                }

                VStack(spacing: 0) {
                    titleRow
                    if loading && state == nil {
                        ProgressView().tint(FeyndTheme.text2)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else if let state, state.cardCount < 10 {
                        lockedHero(state)
                    } else if let state {
                        levelMap(state)
                    } else {
                        errorHero
                    }
                }
                .feyndContentColumn()
            }
        }
        .sheet(isPresented: $showProfile) { ProfileSheet().environment(session) }
        .sheet(item: $sheetLevel) { level in
            LevelStartSheet(
                level: level,
                starting: startingLevel == level.level,
                onPlay: { play(level) }
            )
            .presentationDetents([.height(320)])
        }
        .fullScreenCover(item: $activeSet) { start in
            FlashSetView(start: start, topicLabel: nil) { _ in
                Task { await load() }
            }
            .environment(session)
        }
        .fullScreenCover(item: $voiceSet) { start in
            FlashVoiceView(start: start, topicLabel: nil) { _ in
                Task { await load() }
            }
            .environment(session)
        }
        .task {
            await load()
            withAnimation(.easeInOut(duration: 1.1).repeatForever(autoreverses: true)) {
                pulse = true
            }
        }
        .alert("Flash", isPresented: Binding(
            get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } }
        )) {
            Button("OK") { errorMessage = nil }
        } message: { Text(errorMessage ?? "") }
    }

    // MARK: - Header bits

    private var xpPill: some View {
        HStack(spacing: 5) {
            Image(systemName: "bolt.fill")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(FeyndTheme.gold)
            Text("\(state?.xp ?? 0)")
                .font(.system(size: 13.5, weight: .bold))
                .foregroundStyle(FeyndTheme.text)
                .contentTransition(.numericText())
        }
        .padding(.horizontal, 11)
        .padding(.vertical, 7)
        .background(FeyndTheme.surface, in: Capsule())
        .overlay(Capsule().stroke(FeyndTheme.border, lineWidth: 1))
        .accessibilityLabel("\(state?.xp ?? 0) experience points")
    }

    private var titleRow: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .bottom) {
                Text("Flash")
                    .font(.system(size: 34, weight: .bold))
                    .tracking(-0.8)
                    .foregroundStyle(FeyndTheme.text)
                Spacer()
            }
            if let state {
                Text("\(state.cardCount) CARDS · \(state.highestPassed) LEVEL\(state.highestPassed == 1 ? "" : "S") CLEARED")
                    .font(.system(size: 12, weight: .semibold))
                    .tracking(0.2)
                    .foregroundStyle(FeyndTheme.text3)
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 8)
        .padding(.bottom, 12)
    }

    // MARK: - Not enough cards yet

    private func lockedHero(_ state: JumboState) -> some View {
        VStack(spacing: 16) {
            Spacer()
            ZStack {
                Circle()
                    .fill(FeyndTheme.coralSoft)
                    .frame(width: 110, height: 110)
                Image(systemName: "bolt.fill")
                    .font(.system(size: 44))
                    .foregroundStyle(FeyndTheme.coral)
            }
            Text("The path opens at 10 cards")
                .font(.system(size: 21, weight: .bold))
                .tracking(-0.4)
                .foregroundStyle(FeyndTheme.text)
            Text("Jumbo mixes flash cards from every topic you're learning into one climb. You have \(state.cardCount) of 10 — open a topic's ⋯ menu and tap Flash cards to build a deck.")
                .font(.system(size: 14))
                .lineSpacing(3)
                .foregroundStyle(FeyndTheme.text2)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            // Little progress meter toward unlocking — the math is 10 cells.
            HStack(spacing: 4) {
                ForEach(0..<10, id: \.self) { i in
                    Capsule()
                        .fill(i < state.cardCount ? FeyndTheme.coral : FeyndTheme.surface2)
                        .frame(width: 16, height: 6)
                }
            }
            .padding(.top, 4)
            Spacer()
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private var errorHero: some View {
        VStack(spacing: 10) {
            Image(systemName: "bolt.slash")
                .font(.system(size: 30))
                .foregroundStyle(FeyndTheme.text3)
            Text("Couldn't load the Flash arcade.")
                .font(.system(size: 14))
                .foregroundStyle(FeyndTheme.text2)
            Button("Retry") { Task { await load() } }
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(FeyndTheme.coral)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - The map (the "night climb" world)

    /// Level 1 sits at the BOTTOM in a dark meadow; the path climbs through
    /// twilight and clouds into a starry sky. One shared bit of math places
    /// nodes, trail, and scenery: y(i) = H - bottomPad - i * pitch.
    private func levelMap(_ state: JumboState) -> some View {
        GeometryReader { geo in
            let w = min(geo.size.width, 430)
            let centerX = geo.size.width / 2
            let count = state.levels.count
            let height = topPad + CGFloat(max(0, count - 1)) * pitch + bottomPad
            let yFor: (Int) -> CGFloat = { i in height - bottomPad - CGFloat(i) * pitch }
            let xFor: (Int) -> CGFloat = { i in centerX + zig(i) * (amp * w / 430) }

            ScrollViewReader { proxy in
                ScrollView {
                    ZStack(alignment: .topLeading) {
                        FlashWorldScenery(height: height)

                        // Stepping-stone trail between consecutive nodes —
                        // warm sand dots, like a path through the world.
                        Canvas { ctx, _ in
                            var path = Path()
                            for i in 0..<count {
                                let p = CGPoint(x: xFor(i), y: yFor(i))
                                if i == 0 { path.move(to: p) }
                                else {
                                    let prev = CGPoint(x: xFor(i - 1), y: yFor(i - 1))
                                    let mid = CGPoint(x: (prev.x + p.x) / 2, y: (prev.y + p.y) / 2)
                                    path.addQuadCurve(to: mid, control: CGPoint(x: prev.x, y: mid.y + pitch * 0.18))
                                    path.addQuadCurve(to: p, control: CGPoint(x: p.x, y: mid.y - pitch * 0.18))
                                }
                            }
                            ctx.stroke(
                                path,
                                with: .color(Color(hex: 0xD8C08A).opacity(0.5)),
                                style: StrokeStyle(lineWidth: 4, lineCap: .round, dash: [0.5, 12])
                            )
                        }
                        .frame(height: height)

                        ForEach(Array(state.levels.enumerated()), id: \.element.level) { i, level in
                            levelNode(level)
                                .position(x: xFor(i), y: yFor(i))
                                .id(level.level)
                        }
                    }
                    .frame(height: height)
                    .clipShape(RoundedRectangle(cornerRadius: 22))
                    .overlay(RoundedRectangle(cornerRadius: 22).stroke(FeyndTheme.border, lineWidth: 1))
                    .padding(.horizontal, 12)
                    Color.clear.frame(height: 96) // keep TabPill off the meadow
                }
                .scrollIndicators(.hidden)
                .refreshable { await load() }
                .onAppear {
                    // Land the camera on the frontier node. Deferred a beat —
                    // scrolling before the ZStack has laid out overshoots.
                    let target = min(state.highestPassed + 1, count)
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                        withAnimation(.easeOut(duration: 0.4)) {
                            proxy.scrollTo(target, anchor: .center)
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func levelNode(_ level: JumboLevelInfo) -> some View {
        let isCurrent = level.status == "unlocked"
        let isPassed = level.status == "passed"

        Button {
            guard level.status != "locked" else { return }
            FlashSFX.shared.play(.tap)
            sheetLevel = level
        } label: {
            VStack(spacing: 5) {
                ZStack {
                    if isCurrent {
                        // Pulsing gold halo says "you are here".
                        Circle()
                            .stroke(FeyndTheme.gold.opacity(pulse ? 0.2 : 0.6), lineWidth: 3)
                            .frame(width: nodeSize + (pulse ? 24 : 10), height: nodeSize + (pulse ? 24 : 10))
                    }

                    // Chunky game-button base: a darker "depth" disc peeking
                    // out below the face makes the node read as pressable.
                    Circle()
                        .fill(isPassed ? Color(hex: 0xB85A3F) : Color(hex: 0x151827))
                        .frame(width: nodeSize, height: nodeSize)
                        .offset(y: 4)
                    Circle()
                        .fill(isPassed ? FeyndTheme.coral : (isCurrent ? Color(hex: 0x2E3350) : Color(hex: 0x232637)))
                        .frame(width: nodeSize, height: nodeSize)
                        .overlay(
                            Circle().stroke(
                                isPassed ? Color(hex: 0xF5A08A) : (isCurrent ? FeyndTheme.gold : Color(hex: 0x363B5E)),
                                lineWidth: isCurrent ? 2 : 1.5
                            )
                        )
                        .shadow(color: isPassed ? FeyndTheme.coral.opacity(0.4) : .black.opacity(0.35),
                                radius: isPassed ? 14 : 8, y: 4)

                    if level.status == "locked" {
                        Image(systemName: "lock.fill")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(Color(hex: 0x5A5F86))
                    } else {
                        VStack(spacing: 1) {
                            Text("\(level.level)")
                                .font(.system(size: 22, weight: .bold))
                                .foregroundStyle(.white)
                            Image(systemName: level.modeIcon)
                                .font(.system(size: 9, weight: .semibold))
                                .foregroundStyle(isPassed ? .white.opacity(0.85) : FeyndTheme.gold)
                        }
                    }

                    // Cleared levels plant a little victory flag.
                    if isPassed {
                        FlagMarker()
                            .offset(x: nodeSize * 0.42, y: -nodeSize * 0.52)
                    }
                }
                .frame(height: nodeSize + 26) // room for halo + flag, keeps rows even

                if isPassed {
                    HStack(spacing: 1.5) {
                        ForEach(0..<3, id: \.self) { s in
                            Image(systemName: "star.fill")
                                .font(.system(size: 8.5, weight: .bold))
                                .foregroundStyle(s < level.stars ? FeyndTheme.gold : Color(hex: 0x3A3F55))
                        }
                    }
                } else if isCurrent {
                    Text("START")
                        .font(.system(size: 10, weight: .heavy))
                        .tracking(1.2)
                        .foregroundStyle(FeyndTheme.gold)
                        .shadow(color: .black.opacity(0.6), radius: 3)
                } else {
                    Color.clear.frame(height: 10)
                }
            }
        }
        .buttonStyle(.plain)
        .opacity(level.status == "locked" ? 0.8 : 1)
        .accessibilityLabel("Level \(level.level), \(level.modeLabel), \(level.status)")
    }

    // MARK: - Data / actions

    private func load() async {
        loading = state == nil
        defer { loading = false }
        do {
            state = try await F2API.shared.jumboState()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func play(_ level: JumboLevelInfo) {
        guard startingLevel == nil else { return }
        FlashSFX.shared.play(.start)
        startingLevel = level.level
        Task {
            do {
                let start = try await F2API.shared.startJumboSet(level: level.level)
                sheetLevel = nil
                // Give the sheet a beat to dismiss before the cover slides up.
                try? await Task.sleep(for: .milliseconds(350))
                if start.mode == "voice" {
                    voiceSet = start
                } else {
                    activeSet = start
                }
            } catch {
                errorMessage = error.localizedDescription
                sheetLevel = nil
            }
            startingLevel = nil
        }
    }
}

// MARK: - World scenery

/// The fixed dusk-to-space backdrop behind the level path: meadow and pines
/// at the bottom, mountain silhouettes, drifting clouds mid-climb, then a
/// starfield and crescent moon at the top. All Canvas-drawn — no assets.
/// Deterministic pseudo-random placement (golden-ratio hashing) so the world
/// looks the same every visit; only clouds drift and stars twinkle.
private struct FlashWorldScenery: View {
    let height: CGFloat

    private func frac(_ v: Double) -> Double { v - v.rounded(.down) }

    var body: some View {
        ZStack {
            // Altitude gradient: deep space → indigo twilight → dusk teal →
            // dark meadow green.
            LinearGradient(
                stops: [
                    .init(color: Color(hex: 0x0A0918), location: 0.00),
                    .init(color: Color(hex: 0x171635), location: 0.32),
                    .init(color: Color(hex: 0x233052), location: 0.58),
                    .init(color: Color(hex: 0x2E4149), location: 0.78),
                    .init(color: Color(hex: 0x263A28), location: 0.92),
                    .init(color: Color(hex: 0x1B2A1C), location: 1.00),
                ],
                startPoint: .top, endPoint: .bottom
            )

            TimelineView(.animation(minimumInterval: 1.0 / 20.0)) { timeline in
                let t = timeline.date.timeIntervalSinceReferenceDate
                Canvas { ctx, size in
                    let w = size.width
                    let h = size.height

                    // Stars — upper half only, twinkling on offset phases.
                    for i in 0..<30 {
                        let fi = Double(i)
                        let x = w * frac(fi * 0.6180339887 + 0.13)
                        let y = h * 0.52 * frac(fi * 0.7548776662)
                        let r = 0.8 + 1.3 * frac(fi * 0.3247179572)
                        let twinkle = 0.35 + 0.45 * (0.5 + 0.5 * sin(t * (0.8 + frac(fi * 0.53)) + fi))
                        ctx.fill(
                            Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)),
                            with: .color(.white.opacity(twinkle))
                        )
                    }

                    // Crescent moon, top right.
                    let moonC = CGPoint(x: w * 0.82, y: 64)
                    ctx.fill(Path(ellipseIn: CGRect(x: moonC.x - 16, y: moonC.y - 16, width: 32, height: 32)),
                             with: .color(Color(hex: 0xF3E3B8).opacity(0.9)))
                    ctx.fill(Path(ellipseIn: CGRect(x: moonC.x - 22, y: moonC.y - 20, width: 30, height: 30)),
                             with: .color(Color(hex: 0x0E0D20)))

                    // Clouds — mid-altitude blobs on a slow drift.
                    for i in 0..<5 {
                        let fi = Double(i)
                        let baseX = w * frac(fi * 0.6180339887 + 0.41)
                        let y = h * (0.40 + 0.28 * frac(fi * 0.7548776662))
                        let drift = sin(t * 0.10 + fi * 1.9) * 18
                        let cw = 54.0 + 40.0 * frac(fi * 0.29)
                        let cloud = Color(hex: 0x3D4460).opacity(0.55)
                        for (dx, dy, s) in [(0.0, 0.0, 1.0), (-cw * 0.32, 4.0, 0.7), (cw * 0.34, 5.0, 0.62)] {
                            let r = cw * 0.28 * s
                            ctx.fill(
                                Path(ellipseIn: CGRect(x: baseX + drift + dx - r, y: y + dy - r,
                                                       width: r * 2, height: r * 1.5)),
                                with: .color(cloud)
                            )
                        }
                    }

                    // Mountain silhouettes above the meadow.
                    var far = Path()
                    far.move(to: CGPoint(x: 0, y: h - 120))
                    far.addLine(to: CGPoint(x: w * 0.28, y: h - 235))
                    far.addLine(to: CGPoint(x: w * 0.55, y: h - 120))
                    far.closeSubpath()
                    ctx.fill(far, with: .color(Color(hex: 0x1B2440).opacity(0.85)))
                    var near = Path()
                    near.move(to: CGPoint(x: w * 0.45, y: h - 110))
                    near.addLine(to: CGPoint(x: w * 0.78, y: h - 205))
                    near.addLine(to: CGPoint(x: w * 1.05, y: h - 110))
                    near.closeSubpath()
                    ctx.fill(near, with: .color(Color(hex: 0x141B30).opacity(0.9)))

                    // Rolling meadow hummocks along the bottom edge.
                    var backHill = Path()
                    backHill.move(to: CGPoint(x: 0, y: h))
                    backHill.addLine(to: CGPoint(x: 0, y: h - 92))
                    backHill.addQuadCurve(to: CGPoint(x: w * 0.5, y: h - 66),
                                          control: CGPoint(x: w * 0.22, y: h - 118))
                    backHill.addQuadCurve(to: CGPoint(x: w, y: h - 88),
                                          control: CGPoint(x: w * 0.78, y: h - 34))
                    backHill.addLine(to: CGPoint(x: w, y: h))
                    backHill.closeSubpath()
                    ctx.fill(backHill, with: .color(Color(hex: 0x24371F)))

                    var frontHill = Path()
                    frontHill.move(to: CGPoint(x: 0, y: h))
                    frontHill.addLine(to: CGPoint(x: 0, y: h - 44))
                    frontHill.addQuadCurve(to: CGPoint(x: w * 0.6, y: h - 30),
                                           control: CGPoint(x: w * 0.3, y: h - 66))
                    frontHill.addQuadCurve(to: CGPoint(x: w, y: h - 48),
                                           control: CGPoint(x: w * 0.85, y: h - 8))
                    frontHill.addLine(to: CGPoint(x: w, y: h))
                    frontHill.closeSubpath()
                    ctx.fill(frontHill, with: .color(Color(hex: 0x16240F)))

                    // A few pines on the back hill.
                    for i in 0..<6 {
                        let fi = Double(i)
                        let x = w * (0.06 + 0.9 * frac(fi * 0.6180339887 + 0.71))
                        let baseY = h - 66 - 22 * frac(fi * 0.43)
                        let treeH = 24.0 + 12.0 * frac(fi * 0.77)
                        var pine = Path()
                        pine.move(to: CGPoint(x: x, y: baseY - treeH))
                        pine.addLine(to: CGPoint(x: x - treeH * 0.32, y: baseY))
                        pine.addLine(to: CGPoint(x: x + treeH * 0.32, y: baseY))
                        pine.closeSubpath()
                        ctx.fill(pine, with: .color(Color(hex: 0x0F1B0C)))
                    }
                }
            }
        }
        .frame(height: height)
    }
}

/// Tiny victory flag planted on cleared level nodes.
private struct FlagMarker: View {
    var body: some View {
        Canvas { ctx, size in
            var pole = Path()
            pole.move(to: CGPoint(x: 3, y: 2))
            pole.addLine(to: CGPoint(x: 3, y: size.height - 2))
            ctx.stroke(pole, with: .color(Color(hex: 0xF3E3B8)), lineWidth: 2)
            var flag = Path()
            flag.move(to: CGPoint(x: 4.5, y: 2))
            flag.addLine(to: CGPoint(x: size.width - 2, y: 6.5))
            flag.addLine(to: CGPoint(x: 4.5, y: 11))
            flag.closeSubpath()
            ctx.fill(flag, with: .color(FeyndTheme.gold))
        }
        .frame(width: 20, height: 24)
        .shadow(color: .black.opacity(0.5), radius: 2, y: 1)
    }
}

// MARK: - Level start sheet

private struct LevelStartSheet: View {
    let level: JumboLevelInfo
    let starting: Bool
    let onPlay: () -> Void

    var body: some View {
        ZStack {
            FeyndTheme.bg.ignoresSafeArea()
            VStack(spacing: 14) {
                Capsule()
                    .fill(FeyndTheme.surface3)
                    .frame(width: 38, height: 5)
                    .padding(.top, 10)

                Text("LEVEL \(level.level)")
                    .font(.system(size: 12, weight: .heavy))
                    .tracking(1.6)
                    .foregroundStyle(FeyndTheme.coral)
                    .padding(.top, 8)

                HStack(spacing: 8) {
                    Image(systemName: level.modeIcon)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(FeyndTheme.coral)
                    Text(level.modeLabel)
                        .font(.system(size: 20, weight: .bold))
                        .tracking(-0.3)
                        .foregroundStyle(FeyndTheme.text)
                }

                Text(level.status == "passed"
                     ? "Cleared with \(level.bestScore ?? 0)/10. Replay for a better score — 10/10 earns all three stars."
                     : "10 questions mixed from all your topics. Score 7 to clear it, 9 for two stars, perfect for three.")
                    .font(.system(size: 13.5))
                    .lineSpacing(3)
                    .foregroundStyle(FeyndTheme.text2)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 34)

                if level.status == "passed" {
                    HStack(spacing: 3) {
                        ForEach(0..<3, id: \.self) { s in
                            Image(systemName: "star.fill")
                                .font(.system(size: 15, weight: .bold))
                                .foregroundStyle(s < level.stars ? FeyndTheme.gold : FeyndTheme.text4)
                        }
                    }
                }

                Button(action: onPlay) {
                    HStack(spacing: 8) {
                        if starting {
                            ProgressView().tint(Color(hex: 0x1A0E08)).scaleEffect(0.85)
                        } else {
                            Image(systemName: "play.fill")
                                .font(.system(size: 14, weight: .bold))
                        }
                        Text(level.status == "passed" ? "Play again" : "Let's go")
                            .font(.system(size: 16, weight: .bold))
                    }
                    .foregroundStyle(Color(hex: 0x1A0E08))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(FeyndTheme.coral, in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(starting)
                .padding(.horizontal, 24)
                .padding(.top, 4)

                Spacer()
            }
        }
    }
}
