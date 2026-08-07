import SwiftUI

/// The Flash tab — Jumbo Flash Game. A vertical level path (think Duolingo)
/// over every flash card the user owns, across all topics. The level sheet
/// offers all three modes; clearing depends on the one you pick: voice
/// passes at 7/10, typed at 8/10, multiple choice at 9/10. 9/10 = 2 node
/// stars, perfect = 3.
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
    @State private var showDecks = false
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
                    HStack(spacing: 8) {
                        deckStackButton
                        xpPill
                    }
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
        .sheet(isPresented: $showDecks) {
            FlashDecksSheet()
                .environment(session)
                // Cards may have been added or buried — the map's card count
                // and the locked/unlocked state both depend on it.
                .onDisappear { Task { await load() } }
        }
        .sheet(item: $sheetLevel) { level in
            LevelStartSheet(
                level: level,
                starting: startingLevel == level.level,
                onPlay: { mode in play(level, mode: mode) }
            )
            .presentationDetents([.height(430)])
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
            // Never wrap: the pill shares a tight top bar with the deck
            // button, and a two-line XP count looks broken.
            Text(compactXP(state?.xp ?? 0))
                .font(.system(size: 13.5, weight: .bold))
                .foregroundStyle(FeyndTheme.text)
                .lineLimit(1)
                .fixedSize(horizontal: true, vertical: false)
                .contentTransition(.numericText())
        }
        .padding(.horizontal, 11)
        .padding(.vertical, 7)
        .background(FeyndTheme.surface, in: Capsule())
        .overlay(Capsule().stroke(FeyndTheme.border, lineWidth: 1))
        .fixedSize(horizontal: true, vertical: false)
        .accessibilityLabel("\(state?.xp ?? 0) experience points")
    }

    /// XP grows without bound, the top bar doesn't. Four digits and up get
    /// abbreviated so the pill stays one short line forever.
    private func compactXP(_ xp: Int) -> String {
        if xp < 1000 { return "\(xp)" }
        if xp < 100_000 {
            let k = Double(xp) / 1000
            // 1.2k up to 99.9k, dropping the decimal once it's not useful.
            return k < 10
                ? String(format: "%.1fk", k)
                : String(format: "%.0fk", k)
        }
        return String(format: "%.1fM", Double(xp) / 1_000_000)
    }

    /// The deck manager button — a stack of cards, which is literally what
    /// it opens. Badged when any deck holds priority cards.
    private var deckStackButton: some View {
        Button { showDecks = true } label: {
            Image(systemName: "rectangle.stack.fill")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(FeyndTheme.text)
                .padding(.horizontal, 11)
                .padding(.vertical, 7)
                .background(FeyndTheme.surface, in: Capsule())
                .overlay(Capsule().stroke(FeyndTheme.border, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Manage your decks")
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
                    .fill(FeyndTheme.accentSoft)
                    .frame(width: 110, height: 110)
                Image(systemName: "bolt.fill")
                    .font(.system(size: 44))
                    .foregroundStyle(FeyndTheme.accent)
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
                        .fill(i < state.cardCount ? FeyndTheme.accent : FeyndTheme.surface2)
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
                .foregroundStyle(FeyndTheme.accent)
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
                                with: .color(Color(hex: 0xF3DFAE).opacity(0.5)),
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
                // Open at the meadow — the journey starts at the bottom, and
                // the frontier node is always in the lowest unlocked stretch.
                // (scrollTo against .position-ed views lands erratically, so
                // no programmatic scrolling here.)
                .defaultScrollAnchor(.bottom)
                .refreshable { await load() }
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
                        .fill(isPassed ? Color(hex: 0xB97A14) : Color(hex: 0x180F28))
                        .frame(width: nodeSize, height: nodeSize)
                        .offset(y: 4)
                    Circle()
                        .fill(isPassed ? FeyndTheme.accent : (isCurrent ? Color(hex: 0x3A2B57) : Color(hex: 0x2A2140)))
                        .frame(width: nodeSize, height: nodeSize)
                        .overlay(
                            Circle().stroke(
                                isPassed ? Color(hex: 0xF6C46A) : (isCurrent ? FeyndTheme.gold : Color(hex: 0x453563)),
                                lineWidth: isCurrent ? 2 : 1.5
                            )
                        )
                        .shadow(color: isPassed ? FeyndTheme.accent.opacity(0.4) : .black.opacity(0.35),
                                radius: isPassed ? 14 : 8, y: 4)

                    if level.status == "locked" {
                        Image(systemName: "lock.fill")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(Color(hex: 0x6B5C94))
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
                                .foregroundStyle(s < level.stars ? FeyndTheme.gold : Color(hex: 0x4A3A66))
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

    private func play(_ level: JumboLevelInfo, mode: String) {
        guard startingLevel == nil else { return }
        FlashSFX.shared.play(.start)
        startingLevel = level.level
        Task {
            do {
                let start = try await F2API.shared.startJumboSet(level: level.level, mode: mode)
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
            // "Funky dusk": plum night at the top melting through violet and
            // a burnt-coral horizon haze into a deep teal meadow.
            LinearGradient(
                stops: [
                    .init(color: Color(hex: 0x160E24), location: 0.00),
                    .init(color: Color(hex: 0x271A44), location: 0.30),
                    .init(color: Color(hex: 0x3D2453), location: 0.58),
                    .init(color: Color(hex: 0x5C3247), location: 0.76),
                    .init(color: Color(hex: 0x6E4140), location: 0.84),
                    .init(color: Color(hex: 0x24443A), location: 0.94),
                    .init(color: Color(hex: 0x152E27), location: 1.00),
                ],
                startPoint: .top, endPoint: .bottom
            )

            TimelineView(.animation(minimumInterval: 1.0 / 20.0)) { timeline in
                let t = timeline.date.timeIntervalSinceReferenceDate
                Canvas { ctx, size in
                    let w = size.width
                    let h = size.height

                    // Stars — dots plus little 4-point sparkles, twinkling.
                    for i in 0..<34 {
                        let fi = Double(i)
                        let x = w * frac(fi * 0.6180339887 + 0.13)
                        let y = h * 0.58 * frac(fi * 0.7548776662)
                        let tw = 0.3 + 0.5 * (0.5 + 0.5 * sin(t * (0.7 + frac(fi * 0.53)) + fi))
                        if i % 5 == 0 {
                            // Sparkle cross: two thin diamonds.
                            let s = 3.0 + 3.0 * frac(fi * 0.31)
                            var cross = Path()
                            cross.move(to: CGPoint(x: x, y: y - s))
                            cross.addQuadCurve(to: CGPoint(x: x + s, y: y), control: CGPoint(x: x + s * 0.18, y: y - s * 0.18))
                            cross.addQuadCurve(to: CGPoint(x: x, y: y + s), control: CGPoint(x: x + s * 0.18, y: y + s * 0.18))
                            cross.addQuadCurve(to: CGPoint(x: x - s, y: y), control: CGPoint(x: x - s * 0.18, y: y + s * 0.18))
                            cross.addQuadCurve(to: CGPoint(x: x, y: y - s), control: CGPoint(x: x - s * 0.18, y: y - s * 0.18))
                            ctx.fill(cross, with: .color(Color(hex: 0xF3DFAE).opacity(tw)))
                        } else {
                            let r = 0.8 + 1.2 * frac(fi * 0.3247179572)
                            ctx.fill(Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)),
                                     with: .color(.white.opacity(tw * 0.9)))
                        }
                    }

                    // Shooting star — a brief streak every ~9 seconds.
                    let cycle = frac(t / 9.0)
                    if cycle < 0.11 {
                        let p = cycle / 0.11
                        let sx = w * (0.15 + 0.5 * p)
                        let sy = h * 0.10 + h * 0.10 * p
                        var streak = Path()
                        streak.move(to: CGPoint(x: sx, y: sy))
                        streak.addLine(to: CGPoint(x: sx - 34, y: sy - 12))
                        let fade = sin(p * .pi)
                        ctx.stroke(streak, with: .color(.white.opacity(0.7 * fade)),
                                   style: StrokeStyle(lineWidth: 1.6, lineCap: .round))
                    }

                    // The big moon — oversized, cratered, glowing. The hero.
                    let moonC = CGPoint(x: w * 0.24, y: 120)
                    for (gr, ga) in [(96.0, 0.05), (76.0, 0.08)] {
                        ctx.fill(Path(ellipseIn: CGRect(x: moonC.x - gr, y: moonC.y - gr, width: gr * 2, height: gr * 2)),
                                 with: .color(Color(hex: 0xF3DFAE).opacity(ga)))
                    }
                    ctx.fill(Path(ellipseIn: CGRect(x: moonC.x - 54, y: moonC.y - 54, width: 108, height: 108)),
                             with: .color(Color(hex: 0xF3DFAE)))
                    let craters: [(Double, Double, Double)] = [
                        (-0.35, -0.25, 13), (0.22, 0.05, 17), (-0.1, 0.42, 9), (0.38, -0.38, 8),
                    ]
                    for (cx, cy, cr) in craters {
                        ctx.fill(Path(ellipseIn: CGRect(x: moonC.x + cx * 54 - cr, y: moonC.y + cy * 54 - cr,
                                                        width: cr * 2, height: cr * 2)),
                                 with: .color(Color(hex: 0xDCC38A).opacity(0.8)))
                    }

                    // A funky little ringed planet, upper right.
                    let planetC = CGPoint(x: w * 0.83, y: h * 0.20)
                    ctx.fill(Path(ellipseIn: CGRect(x: planetC.x - 11, y: planetC.y - 11, width: 22, height: 22)),
                             with: .color(FeyndTheme.accent.opacity(0.9)))
                    var ring = ctx
                    ring.translateBy(x: planetC.x, y: planetC.y)
                    ring.rotate(by: .degrees(-18))
                    ring.stroke(Path(ellipseIn: CGRect(x: -20, y: -6, width: 40, height: 12)),
                                with: .color(Color(hex: 0xF3DFAE).opacity(0.75)), lineWidth: 1.6)

                    // Cloud streaks — long thin lavender wisps, drifting.
                    for i in 0..<6 {
                        let fi = Double(i)
                        let y = h * (0.34 + 0.34 * frac(fi * 0.7548776662))
                        let drift = sin(t * 0.08 + fi * 2.1) * 22
                        let baseX = w * frac(fi * 0.6180339887 + 0.37) + drift
                        let len = 60.0 + 70.0 * frac(fi * 0.29)
                        let wisp = Color(hex: 0x9C86C4).opacity(0.22)
                        ctx.fill(Path(roundedRect: CGRect(x: baseX - len / 2, y: y, width: len, height: 7), cornerRadius: 3.5), with: .color(wisp))
                        ctx.fill(Path(roundedRect: CGRect(x: baseX - len * 0.32, y: y - 6, width: len * 0.55, height: 6), cornerRadius: 3), with: .color(wisp))
                    }

                    // Layered ridge lines with sunset rim light — further is
                    // hazier, each crest catches a sliver of coral.
                    let ridges: [(base: Double, amp: Double, fill: UInt32, alpha: Double, phase: Double)] = [
                        (h - 210, 55, 0x6B4160, 0.55, 0.0),
                        (h - 165, 48, 0x4A2C55, 0.75, 1.7),
                        (h - 125, 42, 0x33204A, 0.95, 3.9),
                    ]
                    for r in ridges {
                        var ridge = Path()
                        ridge.move(to: CGPoint(x: 0, y: h))
                        ridge.addLine(to: CGPoint(x: 0, y: r.base))
                        let steps = 5
                        for s in 1...steps {
                            let px = w * Double(s) / Double(steps)
                            let py = r.base - r.amp * (0.5 + 0.5 * sin(Double(s) * 2.1 + r.phase))
                            let cx = w * (Double(s) - 0.5) / Double(steps)
                            let cy = r.base - r.amp * (0.5 + 0.5 * sin((Double(s) - 0.5) * 2.1 + r.phase + 1.2))
                            ridge.addQuadCurve(to: CGPoint(x: px, y: py), control: CGPoint(x: cx, y: cy))
                        }
                        ridge.addLine(to: CGPoint(x: w, y: h))
                        ridge.closeSubpath()
                        ctx.fill(ridge, with: .color(Color(hex: r.fill).opacity(r.alpha)))
                        // Rim light along the crest.
                        var crest = Path()
                        crest.move(to: CGPoint(x: 0, y: r.base))
                        for s in 1...steps {
                            let px = w * Double(s) / Double(steps)
                            let py = r.base - r.amp * (0.5 + 0.5 * sin(Double(s) * 2.1 + r.phase))
                            let cx = w * (Double(s) - 0.5) / Double(steps)
                            let cy = r.base - r.amp * (0.5 + 0.5 * sin((Double(s) - 0.5) * 2.1 + r.phase + 1.2))
                            crest.addQuadCurve(to: CGPoint(x: px, y: py), control: CGPoint(x: cx, y: cy))
                        }
                        ctx.stroke(crest, with: .color(Color(hex: 0xE08A5C).opacity(0.35)), lineWidth: 1.4)
                    }

                    // Meadow hummocks — deep teal with a minty rim.
                    var backHill = Path()
                    backHill.move(to: CGPoint(x: 0, y: h))
                    backHill.addLine(to: CGPoint(x: 0, y: h - 96))
                    backHill.addQuadCurve(to: CGPoint(x: w * 0.52, y: h - 64),
                                          control: CGPoint(x: w * 0.2, y: h - 124))
                    backHill.addQuadCurve(to: CGPoint(x: w, y: h - 92),
                                          control: CGPoint(x: w * 0.8, y: h - 28))
                    backHill.addLine(to: CGPoint(x: w, y: h))
                    backHill.closeSubpath()
                    ctx.fill(backHill, with: .color(Color(hex: 0x25493B)))
                    var backRim = Path()
                    backRim.move(to: CGPoint(x: 0, y: h - 96))
                    backRim.addQuadCurve(to: CGPoint(x: w * 0.52, y: h - 64),
                                         control: CGPoint(x: w * 0.2, y: h - 124))
                    backRim.addQuadCurve(to: CGPoint(x: w, y: h - 92),
                                         control: CGPoint(x: w * 0.8, y: h - 28))
                    ctx.stroke(backRim, with: .color(Color(hex: 0x74BA95).opacity(0.4)), lineWidth: 1.6)

                    // Wonky blob trees on the back hummock — round canopies
                    // squashed at random, thin trunks, no two alike.
                    for i in 0..<5 {
                        let fi = Double(i)
                        let x = w * (0.08 + 0.86 * frac(fi * 0.6180339887 + 0.57))
                        let baseY = h - 72 - 24 * frac(fi * 0.43)
                        let ch = 20.0 + 14.0 * frac(fi * 0.77)
                        let squash = 0.85 + 0.4 * frac(fi * 0.61)
                        var trunk = Path()
                        trunk.move(to: CGPoint(x: x, y: baseY))
                        trunk.addLine(to: CGPoint(x: x + (frac(fi * 0.9) - 0.5) * 5, y: baseY - ch * 0.6))
                        ctx.stroke(trunk, with: .color(Color(hex: 0x1A2E24)), lineWidth: 2.4)
                        ctx.fill(Path(ellipseIn: CGRect(x: x - ch * squash / 2, y: baseY - ch * 1.35,
                                                        width: ch * squash, height: ch)),
                                 with: .color(Color(hex: 0x2F6247)))
                        ctx.fill(Path(ellipseIn: CGRect(x: x - ch * squash * 0.32, y: baseY - ch * 1.28,
                                                        width: ch * squash * 0.45, height: ch * 0.4)),
                                 with: .color(Color(hex: 0x4C8A64).opacity(0.65)))
                    }

                    var frontHill = Path()
                    frontHill.move(to: CGPoint(x: 0, y: h))
                    frontHill.addLine(to: CGPoint(x: 0, y: h - 42))
                    frontHill.addQuadCurve(to: CGPoint(x: w * 0.62, y: h - 26),
                                           control: CGPoint(x: w * 0.3, y: h - 66))
                    frontHill.addQuadCurve(to: CGPoint(x: w, y: h - 50),
                                           control: CGPoint(x: w * 0.86, y: h - 4))
                    frontHill.addLine(to: CGPoint(x: w, y: h))
                    frontHill.closeSubpath()
                    ctx.fill(frontHill, with: .color(Color(hex: 0x142A20)))

                    // Grass tufts — little 3-blade fans along the front hill.
                    for i in 0..<9 {
                        let fi = Double(i)
                        let x = w * (0.04 + 0.92 * frac(fi * 0.6180339887 + 0.23))
                        let y = h - 30 - 16 * frac(fi * 0.47)
                        for b in -1...1 {
                            var blade = Path()
                            blade.move(to: CGPoint(x: x, y: y))
                            blade.addQuadCurve(to: CGPoint(x: x + Double(b) * 5, y: y - 9 - 3 * frac(fi * 0.8)),
                                               control: CGPoint(x: x + Double(b) * 1.5, y: y - 6))
                            ctx.stroke(blade, with: .color(Color(hex: 0x3E7A55).opacity(0.8)), lineWidth: 1.3)
                        }
                    }

                    // Fireflies — slow-orbiting warm sparks over the meadow.
                    for i in 0..<7 {
                        let fi = Double(i)
                        let cx = w * frac(fi * 0.6180339887 + 0.49)
                        let cy = h - 60 - 90 * frac(fi * 0.71)
                        let x = cx + sin(t * (0.3 + 0.2 * frac(fi * 0.9)) + fi * 2.4) * 16
                        let y = cy + sin(t * (0.4 + 0.15 * frac(fi * 0.5)) + fi * 1.3) * 10
                        let glow = 0.25 + 0.55 * (0.5 + 0.5 * sin(t * 1.6 + fi * 2.9))
                        ctx.fill(Path(ellipseIn: CGRect(x: x - 4, y: y - 4, width: 8, height: 8)),
                                 with: .color(FeyndTheme.gold.opacity(glow * 0.25)))
                        ctx.fill(Path(ellipseIn: CGRect(x: x - 1.6, y: y - 1.6, width: 3.2, height: 3.2)),
                                 with: .color(FeyndTheme.gold.opacity(glow)))
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
    /// Called with the chosen mode: "choice" | "text" | "voice".
    let onPlay: (String) -> Void

    /// Which mode button was tapped — keeps the spinner on that row.
    @State private var pickedMode: String? = nil

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
                    .foregroundStyle(FeyndTheme.accent)
                    .padding(.top, 8)

                Text(level.status == "passed"
                     ? "Cleared with \(level.bestScore ?? 0)/10. Replay for a better score — 10/10 earns all three stars."
                     : "10 questions mixed from all your topics. 9/10 is two stars, a perfect round is three.")
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

                // Same wording and layout as the topic deck's mode list;
                // each sub states the clear bar for that mode.
                VStack(spacing: 10) {
                    modeButton("choice", icon: "square.grid.2x2", title: "Multiple choice",
                               sub: "Tap the right answer — clears at \(jumboPassScore(mode: "choice"))/10")
                    modeButton("text", icon: "keyboard", title: "Type answers",
                               sub: "Write it in your own words — clears at \(jumboPassScore(mode: "text"))/10")
                    modeButton("voice", icon: "mic.fill", title: "Voice round",
                               sub: "F2 quizzes you out loud — clears at \(jumboPassScore(mode: "voice"))/10")
                }
                .padding(.horizontal, 24)
                .padding(.top, 2)

                Spacer()
            }
        }
        .onChange(of: starting) { _, nowStarting in
            if !nowStarting { pickedMode = nil }
        }
    }

    private func modeButton(_ mode: String, icon: String, title: String, sub: String) -> some View {
        Button {
            pickedMode = mode
            onPlay(mode)
        } label: {
            HStack(spacing: 13) {
                Image(systemName: icon)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(FeyndTheme.accent)
                    .frame(width: 40, height: 40)
                    .background(FeyndTheme.accentSoft, in: RoundedRectangle(cornerRadius: 12))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(FeyndTheme.text)
                    Text(sub)
                        .font(.system(size: 12.5))
                        .foregroundStyle(FeyndTheme.text3)
                }
                Spacer()
                if starting && pickedMode == mode {
                    ProgressView().tint(FeyndTheme.text2)
                } else {
                    Image(systemName: "play.fill")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(FeyndTheme.text3)
                }
            }
            .padding(13)
            .background(FeyndTheme.surface, in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(FeyndTheme.border, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .disabled(starting)
    }
}
