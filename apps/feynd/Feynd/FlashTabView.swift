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
    /// Whether the big in-scroll title is on screen (bar echoes it when not).
    @State private var bigTitleVisible = false
    /// Bumped by double-tapping the bar — the map jumps to the very top.
    @State private var scrollTopSignal = 0

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
                    BarTitle(text: "Peck", bigTitleVisible: bigTitleVisible)
                } trailing: {
                    HStack(spacing: 8) {
                        deckStackButton
                        xpPill
                    }
                } onProfileTap: {
                    showProfile = true
                } onDoubleTap: {
                    scrollTopSignal += 1
                }

                VStack(spacing: 0) {
                    if loading && state == nil {
                        titleRow
                        ProgressView().tint(FeyndTheme.text2)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else if let state, state.cardCount < 10 {
                        titleRow
                        lockedHero(state)
                    } else if let state {
                        levelMap(state)
                    } else {
                        titleRow
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
        .onTitleVisibility { bigTitleVisible = $0 }
        .task {
            if state == nil, let cached: JumboState = ScreenCache.load(key: ScreenCache.jumbo) {
                state = cached
            }
            await load()
            #if targetEnvironment(simulator)
            // Headless-verification hook: `simctl launch … -AutoPlayLevel 3`
            // opens that level's set in text mode without any taps, so
            // screenshot loops can see the in-set UI (e.g. Peck credits).
            let auto = UserDefaults.standard.integer(forKey: "AutoPlayLevel")
            if auto > 0, let level = state?.levels.first(where: { $0.level == auto }) {
                UserDefaults.standard.removeObject(forKey: "AutoPlayLevel")
                play(level, mode: "text")
            }
            // `-OpenProfile 1` — straight to the settings sheet.
            if UserDefaults.standard.bool(forKey: "OpenProfile") {
                UserDefaults.standard.removeObject(forKey: "OpenProfile")
                showProfile = true
            }
            #endif
            // Peck deep link while this tab wasn't mounted (cold start or
            // arriving from another tab): the pending flag survives until
            // the map is loaded, then the set opens directly.
            if DeepLinkRouter.shared.consumePeckPlay() {
                autoPlayCurrentLevel()
            }
            withAnimation(.easeInOut(duration: 1.1).repeatForever(autoreverses: true)) {
                pulse = true
            }
        }
        // Peck deep link while this tab is already on screen.
        .onChange(of: DeepLinkRouter.shared.peckPlaySignal) {
            if DeepLinkRouter.shared.consumePeckPlay() {
                autoPlayCurrentLevel()
            }
        }
        .alert("Peck", isPresented: Binding(
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
            Text("\(state?.xp ?? 0)")
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
        ScreenTitle(
            text: "Peck",
            subtitle: state.map { "\($0.cardCount) CARDS · \($0.highestPassed) LEVEL\($0.highestPassed == 1 ? "" : "S") CLEARED" }
        )
        .titleVisibilityMarker()
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
            Text("Peck mixes flash cards from every topic you're learning into one island trail. You have \(state.cardCount) of 10 — open a topic's ⋯ menu and tap Flash cards to build a deck.")
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
            Text("Couldn't load Peck.")
                .font(.system(size: 14))
                .foregroundStyle(FeyndTheme.text2)
            Button("Retry") { Task { await load() } }
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(FeyndTheme.accent)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - The map (the dodo's island)

    /// Level 1 sits at the BOTTOM in a sunny meadow; the trail wanders up
    /// through hills to the shore, and the last stretch fades out over the
    /// sea toward the sun/moon. One shared bit of math places nodes, trail,
    /// and scenery: y(i) = H - bottomPad - i * pitch.
    private func levelMap(_ state: JumboState) -> some View {
        GeometryReader { geo in
            let w = min(geo.size.width, 430)
            let centerX = geo.size.width / 2
            let count = state.levels.count
            let height = topPad + CGFloat(max(0, count - 1)) * pitch + bottomPad
            let yFor: (Int) -> CGFloat = { i in height - bottomPad - CGFloat(i) * pitch }
            let xFor: (Int) -> CGFloat = { i in centerX + zig(i) * (amp * w / 430) }
            let currentIdx = state.levels.firstIndex(where: { $0.status == "unlocked" })

            ScrollViewReader { proxy in
                ScrollView {
                    titleRow
                        .id("peck-top")
                    ZStack(alignment: .topLeading) {
                        PeckIslandScenery(height: height)

                        // Stepping-stone trail between consecutive nodes —
                        // round pebble dots, like the design's dotted path.
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
                                with: .color(PeckPalette.pathDotColor.opacity(0.9)),
                                style: StrokeStyle(lineWidth: 7, lineCap: .round, dash: [0.1, 17])
                            )
                        }
                        .frame(height: height)

                        ForEach(Array(state.levels.enumerated()), id: \.element.level) { i, level in
                            levelNode(level)
                                .position(x: xFor(i), y: yFor(i))
                                .id(level.level)
                        }

                        // The traveler walks the trail beside the current
                        // level, backpack on, sprout up.
                        if let i = currentIdx {
                            DodoTraveler(size: 82)
                                .position(x: max(34, xFor(i) - 72), y: yFor(i) + 44)
                                .allowsHitTesting(false)
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
                .onChange(of: scrollTopSignal) { _, _ in
                    withAnimation(.easeOut(duration: 0.35)) {
                        proxy.scrollTo("peck-top", anchor: .top)
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
                        // Pulsing marigold halo says "you are here".
                        Circle()
                            .stroke(PeckPalette.marigold.opacity(pulse ? 0.25 : 0.7), lineWidth: 3)
                            .frame(width: nodeSize + (pulse ? 26 : 12), height: nodeSize + (pulse ? 26 : 12))
                    }

                    if isPassed {
                        // Cleared: sunny marigold stone with a soft halo.
                        Circle()
                            .fill(PeckPalette.marigold.opacity(0.25))
                            .frame(width: nodeSize + 18, height: nodeSize + 18)
                        Circle()
                            .fill(PeckPalette.marigold)
                            .frame(width: nodeSize, height: nodeSize)
                            .shadow(color: PeckPalette.marigold.opacity(0.4), radius: 12, y: 3)
                        Text("\(level.level)")
                            .font(.custom("Fredoka", size: 26).weight(.semibold))
                            .foregroundStyle(Color(hex: 0x3E3324))
                    } else if isCurrent {
                        // Current: marigold ring around a bright face.
                        Circle()
                            .fill(PeckPalette.marigold)
                            .frame(width: nodeSize + 13, height: nodeSize + 13)
                        Circle()
                            .fill(PeckPalette.nodeCurFace)
                            .frame(width: nodeSize, height: nodeSize)
                        Text("\(level.level)")
                            .font(.custom("Fredoka", size: 29).weight(.semibold))
                            .foregroundStyle(PeckPalette.nodeCurNum)
                    } else {
                        // Locked: quiet foggy stone.
                        Circle()
                            .fill(PeckPalette.nodeLock)
                            .frame(width: nodeSize - 8, height: nodeSize - 8)
                        Image(systemName: "lock.fill")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(PeckPalette.nodeLockIcon)
                    }

                    // Cleared levels plant a little victory flag.
                    if isPassed {
                        FlagMarker()
                            .offset(x: nodeSize * 0.44, y: -nodeSize * 0.54)
                    }
                }
                .frame(height: nodeSize + 26) // room for halo + flag, keeps rows even

                if isPassed {
                    HStack(spacing: 2) {
                        ForEach(0..<3, id: \.self) { s in
                            Image(systemName: "star.fill")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundStyle(s < level.stars ? PeckPalette.starGold : PeckPalette.starDim)
                        }
                    }
                } else if isCurrent {
                    Text("START")
                        .font(.custom("Fredoka", size: 13).weight(.semibold))
                        .tracking(3)
                        .foregroundStyle(PeckPalette.startText)
                        .shadow(color: .black.opacity(0.25), radius: 2)
                } else {
                    Color.clear.frame(height: 10)
                }
            }
        }
        .buttonStyle(.plain)
        .opacity(level.status == "locked" ? 0.9 : 1)
        .accessibilityLabel("Level \(level.level), \(level.status)")
    }

    // MARK: - Data / actions

    private func load() async {
        loading = state == nil
        defer { loading = false }
        do {
            state = try await F2API.shared.jumboState()
            if let state { ScreenCache.save(state, key: ScreenCache.jumbo) }
        } catch {
            // With a cached map on screen, a failed refresh stays quiet —
            // stale beats an alert. Only a truly empty screen reports.
            if state == nil { errorMessage = error.localizedDescription }
        }
    }

    /// Deep-link continuation: open the current unlocked level's set with no
    /// taps. Non-voice so today's banked daily/bonus answers prefill it —
    /// the whole point of the link is landing on the NEXT question.
    private func autoPlayCurrentLevel() {
        guard startingLevel == nil, activeSet == nil, voiceSet == nil else { return }
        Task {
            if state == nil { await load() }
            guard let level = state?.levels.first(where: { $0.status == "unlocked" }) else { return }
            // The daily-card deep link lands in Mixed — the default round.
            play(level, mode: "mixed")
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

// MARK: - The island world

/// Adaptive colors for the Peck map, straight from the design's two CSS var
/// sets (turn 5 of dodo-logo.dc.html): sunny morning in light mode, starry
/// dusk in dark.
enum PeckPalette {
    static let skyA      = FeyndTheme.adaptiveColor(dark: 0x1E2440, light: 0xAEE0EE)
    static let skyB      = FeyndTheme.adaptiveColor(dark: 0x4A3D63, light: 0xEAF7EF)
    static let sunMoon   = FeyndTheme.adaptiveColor(dark: 0xF3E3B2, light: 0xFFD469)
    static let cloud     = FeyndTheme.adaptiveColor(dark: 0x4A4468, light: 0xFFFFFF)
    static let sea       = FeyndTheme.adaptiveColor(dark: 0x2C5B66, light: 0x79C6C4)
    static let island    = FeyndTheme.adaptiveColor(dark: 0x22453A, light: 0x4E8F6E)
    static let palm      = FeyndTheme.adaptiveColor(dark: 0x2E5B3F, light: 0x4E8F6E)
    static let trunk     = FeyndTheme.adaptiveColor(dark: 0x4A3A2C, light: 0x8A6A4C)
    static let hillFar   = FeyndTheme.adaptiveColor(dark: 0x3A5A4A, light: 0xBFDCA4)
    static let hillMid   = FeyndTheme.adaptiveColor(dark: 0x2E4A3A, light: 0x96C77E)
    static let hillNear  = FeyndTheme.adaptiveColor(dark: 0x254032, light: 0x7BB662)
    static let grass     = FeyndTheme.adaptiveColor(dark: 0x1D3528, light: 0x5FA24C)
    static let tuft      = FeyndTheme.adaptiveColor(dark: 0x2E4A38, light: 0x4C8C3D)
    static let tree1     = FeyndTheme.adaptiveColor(dark: 0x2E5B3F, light: 0x5F9E4C)
    static let tree2     = FeyndTheme.adaptiveColor(dark: 0x3A6B4A, light: 0x7BB662)
    static let pathDotColor = FeyndTheme.adaptiveColor(dark: 0xD9C89A, light: 0xFFFDF4)
    static let starColor = Color(hex: 0xF3E9C8)   // dark-mode only, drawn conditionally
    static let marigold  = Color(hex: 0xF6B04E)
    static let nodeCurFace = FeyndTheme.adaptiveColor(dark: 0x3B3560, light: 0xFFFDF4)
    static let nodeCurNum  = FeyndTheme.adaptiveColor(dark: 0xFFF6E0, light: 0x3E4A52)
    static let startText   = FeyndTheme.adaptiveColor(dark: 0xF6B04E, light: 0x8A5B14)
    static let nodeLock    = FeyndTheme.adaptiveColor(dark: 0x332F4E, light: 0xC4D6C8)
    static let nodeLockIcon = FeyndTheme.adaptiveColor(dark: 0x5C567E, light: 0x8FA695)
    static let starGold    = FeyndTheme.adaptiveColor(dark: 0xF6B04E, light: 0xF0A830)
    static let starDim     = FeyndTheme.adaptiveColor(dark: 0x4A4468, light: 0xC9D6CB)
}

/// The dodo's island, drawn tall: sun/moon and sky at the top, the sea with
/// a little offshore islet, then rolling hills descending to the sunny
/// meadow at the bottom where the trail begins. Same scene both modes —
/// sunny morning in light, starry dusk in dark. All Canvas, no assets.
private struct PeckIslandScenery: View {
    let height: CGFloat
    @Environment(\.colorScheme) private var scheme

    private func frac(_ v: Double) -> Double { v - v.rounded(.down) }

    var body: some View {
        Canvas { ctx, size in
            let w = size.width
            let h = size.height
            let dark = scheme == .dark
            func fill(_ p: Path, _ c: Color, _ o: Double = 1) {
                ctx.fill(p, with: .color(c.opacity(o)))
            }

            // Sky base + soft horizon glow.
            fill(Path(CGRect(x: 0, y: 0, width: w, height: h)), PeckPalette.skyA)
            fill(Path(ellipseIn: CGRect(x: -w * 0.35, y: 150, width: w * 1.7, height: 220)),
                 PeckPalette.skyB, 0.8)

            // Stars — dusk only.
            if dark {
                for i in 0..<12 {
                    let fi = Double(i)
                    let x = w * frac(fi * 0.6180339887 + 0.21)
                    let y = 16 + 180 * frac(fi * 0.7548776662)
                    let r = 1.4 + 1.0 * frac(fi * 0.37)
                    fill(Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)),
                         PeckPalette.starColor, 0.9)
                }
            }

            // Sun (light) / moon (dark) with halo, upper right.
            let sunC = CGPoint(x: w * 0.82, y: 84)
            fill(Path(ellipseIn: CGRect(x: sunC.x - 38, y: sunC.y - 38, width: 76, height: 76)),
                 PeckPalette.sunMoon, 0.3)
            fill(Path(ellipseIn: CGRect(x: sunC.x - 26, y: sunC.y - 26, width: 52, height: 52)),
                 PeckPalette.sunMoon)

            // Two puffs of cloud.
            for (cx, cy) in [(w * 0.20, 96.0), (w * 0.62, 158.0)] {
                fill(Path(roundedRect: CGRect(x: cx - 38, y: cy, width: 76, height: 15), cornerRadius: 7.5), PeckPalette.cloud)
                fill(Path(roundedRect: CGRect(x: cx - 20, y: cy - 10, width: 46, height: 13), cornerRadius: 6.5), PeckPalette.cloud)
            }

            // The sea, with a tiny offshore islet + palm.
            let seaTop: CGFloat = 235
            let seaBottom: CGFloat = 350
            fill(Path(CGRect(x: 0, y: seaTop, width: w, height: seaBottom - seaTop)), PeckPalette.sea)
            let isl = CGPoint(x: w * 0.24, y: seaBottom - 8)
            fill(Path(ellipseIn: CGRect(x: isl.x - 40, y: isl.y - 10, width: 80, height: 20)), PeckPalette.island)
            var mount = Path()
            mount.move(to: CGPoint(x: isl.x - 5, y: isl.y))
            mount.addCurve(to: CGPoint(x: isl.x + 2, y: isl.y - 28),
                           control1: CGPoint(x: isl.x - 7, y: isl.y - 13),
                           control2: CGPoint(x: isl.x - 5, y: isl.y - 21))
            mount.addCurve(to: CGPoint(x: isl.x + 1, y: isl.y),
                           control1: CGPoint(x: isl.x + 4, y: isl.y - 21),
                           control2: CGPoint(x: isl.x + 2, y: isl.y - 10))
            mount.closeSubpath()
            fill(mount, PeckPalette.island)
            for dir in [-1.0, 1.0] {
                var frond = Path()
                frond.move(to: CGPoint(x: isl.x + 2, y: isl.y - 26))
                frond.addQuadCurve(to: CGPoint(x: isl.x + 2 + dir * 20, y: isl.y - 30),
                                   control: CGPoint(x: isl.x + 2 + dir * 10, y: isl.y - 36))
                frond.addQuadCurve(to: CGPoint(x: isl.x + 2, y: isl.y - 26),
                                   control: CGPoint(x: isl.x + 2 + dir * 9, y: isl.y - 27))
                frond.closeSubpath()
                fill(frond, PeckPalette.palm)
            }

            // Rolling hills — far, mid, near — then the meadow floor. Crest
            // lines are gentle sine waves; each layer fills to the bottom.
            let landTop = seaBottom
            let landSpan = max(1, h - landTop - 150)
            let layers: [(frac: Double, color: Color, amp: Double, phase: Double)] = [
                (0.00, PeckPalette.hillFar, 26, 0.4),
                (0.30, PeckPalette.hillMid, 34, 2.2),
                (0.62, PeckPalette.hillNear, 30, 4.1),
            ]
            for layer in layers {
                let crest = landTop + landSpan * layer.frac
                var hill = Path()
                hill.move(to: CGPoint(x: 0, y: h))
                hill.addLine(to: CGPoint(x: 0, y: crest + 20))
                let steps = 5
                for s in 1...steps {
                    let px = w * Double(s) / Double(steps)
                    let py = crest + 20 - layer.amp * (0.5 + 0.5 * sin(Double(s) * 1.9 + layer.phase))
                    let cx = w * (Double(s) - 0.5) / Double(steps)
                    let cy = crest + 20 - layer.amp * (0.5 + 0.5 * sin((Double(s) - 0.5) * 1.9 + layer.phase + 1.1))
                    hill.addQuadCurve(to: CGPoint(x: px, y: py), control: CGPoint(x: cx, y: cy))
                }
                hill.addLine(to: CGPoint(x: w, y: h))
                hill.closeSubpath()
                fill(hill, layer.color)
            }

            // Meadow floor.
            var meadow = Path()
            let meadowTop = h - 140
            meadow.move(to: CGPoint(x: 0, y: h))
            meadow.addLine(to: CGPoint(x: 0, y: meadowTop + 14))
            meadow.addQuadCurve(to: CGPoint(x: w * 0.55, y: meadowTop),
                                control: CGPoint(x: w * 0.25, y: meadowTop - 16))
            meadow.addQuadCurve(to: CGPoint(x: w, y: meadowTop + 10),
                                control: CGPoint(x: w * 0.82, y: meadowTop + 18))
            meadow.addLine(to: CGPoint(x: w, y: h))
            meadow.closeSubpath()
            fill(meadow, PeckPalette.grass)

            // Round trees scattered down the hills. Canopy color by band:
            // the lighter tree2 green only on the far/mid hills — on the
            // near hill it matches the ground exactly and disappears.
            for i in 0..<7 {
                let fi = Double(i)
                let x = w * (0.06 + 0.88 * frac(fi * 0.6180339887 + 0.43))
                let y = landTop + 60 + (landSpan * 0.82) * frac(fi * 0.7548776662)
                let r = 13.0 + 8.0 * frac(fi * 0.53)
                let upperHalf = y < landTop + landSpan * 0.55
                fill(Path(roundedRect: CGRect(x: x - 3, y: y - 4, width: 6, height: r + 8), cornerRadius: 3), PeckPalette.trunk)
                fill(Path(ellipseIn: CGRect(x: x - r, y: y - r * 1.6, width: r * 2, height: r * 2)),
                     upperHalf && i % 2 == 0 ? PeckPalette.tree2 : PeckPalette.tree1)
            }

            // A tall palm near the shore.
            let palmX = w * 0.10
            let palmBase = landTop + 46
            var ptrunk = Path()
            ptrunk.move(to: CGPoint(x: palmX, y: palmBase))
            ptrunk.addQuadCurve(to: CGPoint(x: palmX + 8, y: palmBase - 44),
                                control: CGPoint(x: palmX - 2, y: palmBase - 24))
            ptrunk.addQuadCurve(to: CGPoint(x: palmX + 12, y: palmBase - 43),
                                control: CGPoint(x: palmX + 11, y: palmBase - 44))
            ptrunk.addQuadCurve(to: CGPoint(x: palmX + 4, y: palmBase),
                                control: CGPoint(x: palmX + 2, y: palmBase - 24))
            ptrunk.closeSubpath()
            fill(ptrunk, PeckPalette.trunk)
            for (dx, dy) in [(-22.0, -6.0), (20.0, -8.0), (-2.0, -22.0)] {
                var frond = Path()
                let tip = CGPoint(x: palmX + 9 + dx, y: palmBase - 44 + dy)
                frond.move(to: CGPoint(x: palmX + 9, y: palmBase - 44))
                frond.addQuadCurve(to: tip, control: CGPoint(x: palmX + 9 + dx * 0.5, y: palmBase - 52 + dy * 0.4))
                frond.addQuadCurve(to: CGPoint(x: palmX + 9, y: palmBase - 44),
                                   control: CGPoint(x: palmX + 9 + dx * 0.5, y: palmBase - 42 + dy * 0.6))
                frond.closeSubpath()
                fill(frond, PeckPalette.palm)
            }

            // Grass tufts on the meadow.
            for i in 0..<8 {
                let fi = Double(i)
                let x = w * (0.05 + 0.9 * frac(fi * 0.6180339887 + 0.29))
                let y = h - 24 - 80 * frac(fi * 0.47)
                var tuft = Path()
                tuft.move(to: CGPoint(x: x - 4, y: y))
                tuft.addLine(to: CGPoint(x: x, y: y - 12))
                tuft.addLine(to: CGPoint(x: x + 3, y: y))
                tuft.closeSubpath()
                fill(tuft, PeckPalette.tuft)
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
            ctx.stroke(pole, with: .color(Color(hex: 0xFFF6E0)), lineWidth: 2)
            var flag = Path()
            flag.move(to: CGPoint(x: 4.5, y: 2))
            flag.addLine(to: CGPoint(x: size.width - 2, y: 6.5))
            flag.addLine(to: CGPoint(x: 4.5, y: 11))
            flag.closeSubpath()
            ctx.fill(flag, with: .color(Color(hex: 0xF6B04E)))
        }
        .frame(width: 20, height: 24)
        .shadow(color: .black.opacity(0.4), radius: 2, y: 1)
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
                    modeButton("mixed", icon: "square.split.2x1", title: "Mixed round",
                               sub: "Half choices, half typing — clears at \(jumboPassScore(mode: "mixed"))/10")
                    modeButton("choice", icon: "square.grid.2x2", title: "Multiple choice",
                               sub: "Tap the right answer — clears at \(jumboPassScore(mode: "choice"))/10")
                    modeButton("text", icon: "keyboard", title: "Type answers",
                               sub: "Write it in your own words — clears at \(jumboPassScore(mode: "text"))/10")
                    modeButton("voice", icon: "mic.fill", title: "Voice round",
                               sub: "Dodo quizzes you out loud — clears at \(jumboPassScore(mode: "voice"))/10")
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
