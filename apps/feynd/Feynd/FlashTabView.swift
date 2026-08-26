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
    @State private var showPebbles = false
    @State private var showDemoReel = false
    @State private var streakModal: StreakMilestone? = nil
    @State private var pulse = false
    /// Crossing into a new region (10→11, 20→21): the transition scene.
    @State private var regionCrossing: RegionCrossing? = nil
    /// Set when the just-played set cleared a band-ending level for the
    /// first time; presented once its results cover is gone.
    @State private var pendingCrossing: Int? = nil
    /// The level in flight and whether it was still unlocked (first clear).
    @State private var playingLevel: Int? = nil
    @State private var playingWasFirstClear = false
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
                        // Hidden demo reel — a long press on the bar title
                        // plays mascot + regions + both transitions.
                        .onLongPressGesture(minimumDuration: 1.5) {
                            showDemoReel = true
                        }
                } trailing: {
                    // Three pills share the bar with the echoed title — keep
                    // them tight so "Peck" never truncates against them.
                    HStack(spacing: 6) {
                        pebblesButton
                        deckStackButton
                        xpPill
                    }
                } leadingAccessory: {
                    streakPill
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
        .fullScreenCover(item: $streakModal) { m in
            StreakCelebrationView(milestone: m) { streakModal = nil }
        }
        .sheet(isPresented: $showProfile) { ProfileSheet().environment(session) }
        .sheet(isPresented: $showPebbles) { PebblesView() }
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
            FlashSetView(start: start, topicLabel: nil) { result in
                noteRegionCrossing(start: start, result: result)
                Task { await load() }
            }
            .environment(session)
        }
        .fullScreenCover(item: $voiceSet) { start in
            FlashVoiceView(start: start, topicLabel: nil) { result in
                noteRegionCrossing(start: start, result: result)
                Task { await load() }
            }
            .environment(session)
        }
        .fullScreenCover(item: $regionCrossing) { crossing in
            PeckRegionTransitionView(crossing: crossing) {
                regionCrossing = nil
            }
        }
        .fullScreenCover(isPresented: $showDemoReel) {
            DemoReelView { showDemoReel = false }
        }
        // The results cover just closed — if that set opened a region, play
        // the transition now, over the freshly reloaded map.
        .onChange(of: activeSet == nil && voiceSet == nil) { _, coversGone in
            if coversGone, let cleared = pendingCrossing {
                pendingCrossing = nil
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) {
                    regionCrossing = RegionCrossing(clearedLevel: cleared)
                }
            }
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
            // `-OpenDecks 1` — straight to the deck manager.
            if UserDefaults.standard.bool(forKey: "OpenDecks") {
                UserDefaults.standard.removeObject(forKey: "OpenDecks")
                showDecks = true
            }
            // `-OpenPebbles 1` — straight to the quote carousel.
            if UserDefaults.standard.bool(forKey: "OpenPebbles") {
                UserDefaults.standard.removeObject(forKey: "OpenPebbles")
                showPebbles = true
            }
            // `-ShowDemoReel 1` — the full showcase, for recordings.
            if UserDefaults.standard.bool(forKey: "ShowDemoReel") {
                UserDefaults.standard.removeObject(forKey: "ShowDemoReel")
                showDemoReel = true
            }
            // `-ShowRegionTransition 10|20` — play the region scene headlessly.
            let crossing = UserDefaults.standard.integer(forKey: "ShowRegionTransition")
            if crossing == 10 || crossing == 20 {
                UserDefaults.standard.removeObject(forKey: "ShowRegionTransition")
                regionCrossing = RegionCrossing(clearedLevel: crossing)
            }
            // `-MockLevelCount N` — synthesize an N-level map (all but the
            // last passed) so the region scenery can be screenshotted.
            let mock = UserDefaults.standard.integer(forKey: "MockLevelCount")
            if mock > 0, let st = state {
                UserDefaults.standard.removeObject(forKey: "MockLevelCount")
                let levels = (1...mock).map { lvl in
                    JumboLevelInfo(level: lvl, mode: "mixed",
                                   status: lvl < mock ? "passed" : "unlocked",
                                   bestScore: 9, stars: lvl % 3 + 1, passScore: 8)
                }
                state = JumboState(xp: st.xp, cardCount: st.cardCount,
                                   highestPassed: mock - 1, levels: levels,
                                   dailyStreak: st.dailyStreak, xpMultiplier: st.xpMultiplier)
            }
            // `-MockStreak N` — fake a streak for pill/modal screenshots.
            let mockStreak = UserDefaults.standard.integer(forKey: "MockStreak")
            if mockStreak > 0, let st = state {
                UserDefaults.standard.removeObject(forKey: "MockStreak")
                UserDefaults.standard.removeObject(forKey: "streakCelebrated")
                let mult = mockStreak >= 14 ? 4 : mockStreak >= 10 ? 3 : mockStreak >= 4 ? 2 : 1
                state = JumboState(xp: st.xp, cardCount: st.cardCount,
                                   highestPassed: st.highestPassed, levels: st.levels,
                                   dailyStreak: mockStreak, xpMultiplier: mult)
            }
            #endif
            checkStreakMilestone()
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

    /// Milestone crossings get the sparkle modal, once each (largest first
    /// so a returning long streak doesn't replay every step).
    private func checkStreakMilestone() {
        let streak = state?.dailyStreak ?? 0
        let milestones = [4, 7, 10, 14, 21, 30, 50, 100]
        let done = UserDefaults.standard.integer(forKey: "streakCelebrated")
        guard let hit = milestones.last(where: { streak >= $0 && $0 > done }) else { return }
        UserDefaults.standard.set(hit, forKey: "streakCelebrated")
        streakModal = StreakMilestone(days: streak, multiplier: state?.xpMultiplier ?? 1)
    }

    /// The flame — consecutive daily-card days, with the XP multiplier it
    /// has earned. Absent entirely until a streak exists; tap for the story.
    @ViewBuilder
    private var streakPill: some View {
        let streak = state?.dailyStreak ?? 0
        if streak >= 1 {
            let mult = state?.xpMultiplier ?? 1
            Button {
                streakModal = StreakMilestone(days: streak, multiplier: mult, celebration: false)
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "flame.fill")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(Color(hex: 0xE8853A))
                    Text("\(streak)")
                        .font(.system(size: 13.5, weight: .bold))
                        .foregroundStyle(FeyndTheme.text)
                        .lineLimit(1)
                        .fixedSize(horizontal: true, vertical: false)
                    if mult > 1 {
                        Text("×\(mult)")
                            .font(.system(size: 11.5, weight: .heavy))
                            .foregroundStyle(FeyndTheme.gold)
                            .fixedSize(horizontal: true, vertical: false)
                    }
                }
                .padding(.horizontal, 9)
                .frame(height: 31)   // matches xpPill — see the comment there
                .background(FeyndTheme.surface, in: Capsule())
                .overlay(Capsule().stroke(FeyndTheme.border, lineWidth: 1))
                .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(streak)-day daily streak, XP times \(mult)")
        }
    }

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
        .padding(.horizontal, 9)
        // All three trailing pills share one fixed height — icon glyphs and
        // the XP text have different intrinsic heights and would otherwise
        // render three subtly different capsules.
        .frame(height: 31)
        .background(FeyndTheme.surface, in: Capsule())
        .overlay(Capsule().stroke(FeyndTheme.border, lineWidth: 1))
        .fixedSize(horizontal: true, vertical: false)
        .accessibilityLabel("\(state?.xp ?? 0) experience points")
    }

    /// The Pebbles button — the keepsake shelf of saved quotes.
    private var pebblesButton: some View {
        Button { showPebbles = true } label: {
            Image(systemName: "quote.opening")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(FeyndTheme.text)
                .padding(.horizontal, 9)
                .frame(height: 31)   // matches xpPill — see the comment there
                .background(FeyndTheme.surface, in: Capsule())
                .overlay(Capsule().stroke(FeyndTheme.border, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Pebbles — your saved quotes")
    }

    /// The deck manager button — a stack of cards, which is literally what
    /// it opens. Badged when any deck holds priority cards.
    private var deckStackButton: some View {
        Button { showDecks = true } label: {
            Image(systemName: "rectangle.stack.fill")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(FeyndTheme.text)
                .padding(.horizontal, 9)
                .frame(height: 31)   // matches xpPill — see the comment there
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
                        PeckWorldScenery(height: height, levelCount: count, pitch: pitch, bottomPad: bottomPad)

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
                            AnimatedDodoView(height: 78, tickleable: true)
                                .position(x: max(34, xFor(i) - 72), y: yFor(i) + 40)
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
                #if targetEnvironment(simulator)
                // `-ScrollToLevel N` — jump the map near level N for
                // region-scenery screenshots (approximate is fine).
                .onAppear {
                    if UserDefaults.standard.bool(forKey: "ScrollTop") {
                        UserDefaults.standard.removeObject(forKey: "ScrollTop")
                        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
                            proxy.scrollTo("peck-top", anchor: .top)
                        }
                    }
                    let target = UserDefaults.standard.integer(forKey: "ScrollToLevel")
                    if target > 0 {
                        UserDefaults.standard.removeObject(forKey: "ScrollToLevel")
                        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
                            proxy.scrollTo(target, anchor: .center)
                        }
                    }
                }
                #endif
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

    /// A finished set on a band-ending level (10, 20), first clear, passing
    /// score → queue the region transition for when the cover closes.
    private func noteRegionCrossing(start: FlashStart, result: FlashSubmitResult) {
        guard let lvl = start.jumboLevel ?? playingLevel,
              lvl == 10 || lvl == 20,
              playingWasFirstClear,
              result.total >= 10,
              result.score >= jumboPassScore(mode: start.mode)
        else { return }
        pendingCrossing = lvl
    }

    private func play(_ level: JumboLevelInfo, mode: String) {
        guard startingLevel == nil else { return }
        FlashSFX.shared.play(.start)
        playingLevel = level.level
        playingWasFirstClear = level.status == "unlocked"
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

/// The dodo's world, drawn tall in region bands of ten levels each — the
/// Claude Design "Peck landscapes" (branding/design/POINTERS.md): Sunrise
/// Meadow (1–10, dawn) at the bottom, Fern Hollow (11–20, sunset) above it,
/// Starfall Summit (21–30, night) on top, and the sea-and-sky finale above
/// the highest band. Everything moves a little: clouds drift, a bunny hops,
/// a butterfly loops, leaves fall, fireflies and stars twinkle, a campfire
/// flickers. All Canvas, no assets; ambience freezes under Reduce Motion.
private struct PeckWorldScenery: View {
    let height: CGFloat
    let levelCount: Int
    let pitch: CGFloat
    let bottomPad: CGFloat
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        if reduceMotion {
            PeckWorldCanvas(height: height, levelCount: levelCount, pitch: pitch, bottomPad: bottomPad, t: 0)
        } else {
            TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { timeline in
                PeckWorldCanvas(height: height, levelCount: levelCount, pitch: pitch, bottomPad: bottomPad,
                                t: CGFloat(timeline.date.timeIntervalSinceReferenceDate))
            }
        }
    }
}

/// One region band's look.
struct RegionSkin {
    let skyTop: UInt32
    let skyBottom: UInt32
    let hills: [UInt32]          // far → near
    let canopy: UInt32
    let canopyShade: UInt32
    let trunk: UInt32
    let pathDot: UInt32
    let pines: Bool
}

let REGION_SKINS: [RegionSkin] = [
    // Sunrise Meadow — dawn creams and spring greens.
    RegionSkin(skyTop: 0xC9E6DE, skyBottom: 0xFFEFD1,
               hills: [0xCDE3B4, 0xB5D89A, 0x9CCB80, 0x7FBA66],
               canopy: 0x6FAE5C, canopyShade: 0x5F9E4C, trunk: 0x8A6B4A,
               pathDot: 0xFFFDF4, pines: false),
    // Fern Hollow — sunset ambers over deep ferns.
    RegionSkin(skyTop: 0xF2A87B, skyBottom: 0xFFDCA8,
               hills: [0xA3B871, 0x84A765, 0x668F57, 0x4E7B4A],
               canopy: 0x4F7D4A, canopyShade: 0x3E6B42, trunk: 0x5C4632,
               pathDot: 0xFFF3DC, pines: false),
    // Starfall Summit — night blues, pines, stars.
    RegionSkin(skyTop: 0x0F161C, skyBottom: 0x1B2A38,
               hills: [0x2C3B4A, 0x24313D, 0x1D2934, 0x16202A],
               canopy: 0x10181F, canopyShade: 0x0C141B, trunk: 0x0C141B,
               pathDot: 0xE8EEF2, pines: true),
]

func regionSkin(_ band: Int) -> RegionSkin {
    REGION_SKINS[min(band, REGION_SKINS.count - 1)]
}

struct PeckWorldCanvas: View {
    let height: CGFloat
    let levelCount: Int
    let pitch: CGFloat
    let bottomPad: CGFloat
    let t: CGFloat

    private func frac(_ v: Double) -> Double { v - v.rounded(.down) }

    var body: some View {
        Canvas { ctx, size in
            drawWorld(ctx, size: size)
        }
        .frame(height: height)
    }

    // Split out of the Canvas closure: the Catalyst release compile hit
    // "unable to type-check this expression in reasonable time" on the
    // giant closure; a named method type-checks fast. GraphicsContext
    // copies draw to the same target, so the value parameter is fine.
    private func drawWorld(_ context: GraphicsContext, size: CGSize) {
            var ctx = context
            let w = size.width
            let h = size.height
            let bands = max(1, Int(ceil(Double(levelCount) / 10.0)))
            // Sea/sky finale strip above the highest band.
            let finaleBottom: CGFloat = 350
            // Band k's vertical span (world coords, bottom band k=0).
            func bandBottom(_ k: Int) -> CGFloat {
                k == 0 ? h : h - bottomPad - (CGFloat(k * 10) - 0.5) * pitch
            }
            func bandTop(_ k: Int) -> CGFloat {
                k == bands - 1 ? finaleBottom : h - bottomPad - (CGFloat(k * 10 + 9) + 0.5) * pitch
            }

            func fill(_ p: Path, _ hex: UInt32, _ o: Double = 1) {
                ctx.fill(p, with: .color(Color(hex: hex).opacity(o)))
            }

            let topSkin = regionSkin(bands - 1)

            // ── Sky: one gradient through every band's colors, finale on top.
            var stops: [Gradient.Stop] = []
            stops.append(.init(color: Color(hex: topSkin.skyTop), location: 0))
            for k in stride(from: bands - 1, through: 0, by: -1) {
                let skin = regionSkin(k)
                let top = max(0.001, bandTop(k) / h)
                stops.append(.init(color: Color(hex: skin.skyTop), location: top))
                stops.append(.init(color: Color(hex: skin.skyBottom), location: min(0.999, top + 110 / h)))
            }
            ctx.fill(Path(CGRect(x: 0, y: 0, width: w, height: h)),
                     with: .linearGradient(Gradient(stops: stops),
                                           startPoint: .zero, endPoint: CGPoint(x: 0, y: h)))

            // ── Finale: sun or moon, clouds/stars, the sea with its islet.
            let night = topSkin.pines
            let sunC = CGPoint(x: w * 0.82, y: 84)
            fill(Path(ellipseIn: CGRect(x: sunC.x - 38, y: sunC.y - 38, width: 76, height: 76)),
                 night ? 0xEDE6D2 : 0xFFD469, night ? 0.14 : 0.3)
            fill(Path(ellipseIn: CGRect(x: sunC.x - 26, y: sunC.y - 26, width: 52, height: 52)),
                 night ? 0xEDE6D2 : 0xFFD469)
            if night {
                for (mx, my, mr) in [(-10.0, -8.0, 6.0), (8.0, 8.0, 4.0), (2.0, -10.0, 2.6)] {
                    fill(Path(ellipseIn: CGRect(x: sunC.x + mx - mr, y: sunC.y + my - mr, width: mr * 2, height: mr * 2)), 0xD8CFB8)
                }
                for i in 0..<14 {
                    let fi = Double(i)
                    let x = w * frac(fi * 0.6180339887 + 0.21)
                    let y = 16 + 300 * frac(fi * 0.7548776662)
                    let tw = i % 3 == 0 ? 0.15 + 0.85 * abs(sin(t * 1.1 + fi)) : 0.5
                    let r = 1.4 + 1.0 * frac(fi * 0.37)
                    fill(Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)), 0xEDE6D2, tw)
                }
                // A shooting star every nine seconds.
                let su = (t / 9).truncatingRemainder(dividingBy: 1)
                if su > 0 && su < 0.12 {
                    let e = su / 0.12
                    let sx = 40 + 280 * e, sy = 60 + 110 * e
                    var streak = Path()
                    streak.move(to: CGPoint(x: sx - 30, y: sy - 11))
                    streak.addLine(to: CGPoint(x: sx, y: sy))
                    ctx.stroke(streak, with: .color(.white.opacity(0.9 * (1 - e))), lineWidth: 2)
                    fill(Path(ellipseIn: CGRect(x: sx - 2.6, y: sy - 2.6, width: 5.2, height: 5.2)), 0xFFFFFF, 0.9 * (1 - e))
                }
            } else {
                for (i, cy) in [96.0, 158.0].enumerated() {
                    let drift = 22 * sin(t / (13 + Double(i) * 4) + Double(i) * 2)
                    let cx = w * (i == 0 ? 0.20 : 0.62) + drift
                    fill(Path(roundedRect: CGRect(x: cx - 38, y: cy, width: 76, height: 15), cornerRadius: 7.5), 0xFFFFFF, 0.9)
                    fill(Path(roundedRect: CGRect(x: cx - 20, y: cy - 10, width: 46, height: 13), cornerRadius: 6.5), 0xFFFFFF, 0.9)
                }
            }
            let seaTop: CGFloat = 235
            fill(Path(CGRect(x: 0, y: seaTop, width: w, height: finaleBottom - seaTop)), night ? 0x1C3742 : 0x79C6C4)
            let isl = CGPoint(x: w * 0.24, y: finaleBottom - 8)
            fill(Path(ellipseIn: CGRect(x: isl.x - 40, y: isl.y - 10, width: 80, height: 20)), night ? 0x22453A : 0x4E8F6E)
            var mount = Path()
            mount.move(to: CGPoint(x: isl.x - 5, y: isl.y))
            mount.addCurve(to: CGPoint(x: isl.x + 2, y: isl.y - 28),
                           control1: CGPoint(x: isl.x - 7, y: isl.y - 13), control2: CGPoint(x: isl.x - 5, y: isl.y - 21))
            mount.addCurve(to: CGPoint(x: isl.x + 1, y: isl.y),
                           control1: CGPoint(x: isl.x + 4, y: isl.y - 21), control2: CGPoint(x: isl.x + 2, y: isl.y - 10))
            mount.closeSubpath()
            fill(mount, night ? 0x22453A : 0x4E8F6E)

            // ── Bands, bottom-up.
            for k in 0..<bands {
                let skin = regionSkin(k)
                let top = max(finaleBottom, bandTop(k))
                let bottom = min(h, bandBottom(k))
                guard bottom > top else { continue }
                let span = bottom - top

                // Ground: rolling hill layers below the band's horizon strip.
                for (li, hex) in skin.hills.enumerated() {
                    let crest = top + 104 + (span - 104) * (0.02 + CGFloat(li) * 0.24)
                    var hill = Path()
                    hill.move(to: CGPoint(x: 0, y: bottom))
                    hill.addLine(to: CGPoint(x: 0, y: crest + 20))
                    let steps = 5
                    let phase = Double(li) * 1.9 + Double(k) * 0.8
                    for st in 1...steps {
                        let px = w * CGFloat(st) / CGFloat(steps)
                        let py = crest + 20 - 42 * (0.5 + 0.5 * sin(Double(st) * 1.9 + phase))
                        let cx = w * (CGFloat(st) - 0.5) / CGFloat(steps)
                        let cy = crest + 20 - 42 * (0.5 + 0.5 * sin((Double(st) - 0.5) * 1.9 + phase + 1.1))
                        hill.addQuadCurve(to: CGPoint(x: px, y: py), control: CGPoint(x: cx, y: cy))
                    }
                    hill.addLine(to: CGPoint(x: w, y: bottom))
                    hill.closeSubpath()
                    fill(hill, hex)
                }

                // Trees or pines scattered down the band.
                for i in 0..<10 {
                    let fi = Double(i) + Double(k) * 11
                    // Sides only — the trail and its traveler own the middle.
                    let u = frac(fi * 0.6180339887 + 0.43)
                    let x = u < 0.5 ? w * (0.02 + 0.09 * u * 2) : w * (0.82 + 0.15 * (u - 0.5) * 2)
                    let y = top + 150 + (span - 170) * (0.22 + 0.7 * frac(fi * 0.7548776662))
                    let kk = 0.75 + 0.5 * frac(fi * 0.53)
                    if skin.pines {
                        drawPine(&ctx, x: x, y: y, k: kk)
                    } else {
                        let sway = sin(t / (3.5 + frac(fi * 0.3) * 2) + fi) * 1.3
                        drawRoundTree(&ctx, x: x, y: y, k: kk, sway: sway,
                                      canopy: skin.canopy, shade: skin.canopyShade, trunk: skin.trunk)
                    }
                }

                // Region ambience.
                switch min(k, 2) {
                case 0:
                    // Flowers + a hopping bunny + a looping butterfly.
                    for i in 0..<6 {
                        let fi = Double(i)
                        let x = w * (0.08 + 0.84 * frac(fi * 0.6180339887 + 0.7))
                        let y = top + span * (0.45 + 0.5 * frac(fi * 0.917))
                        drawFlower(&ctx, x: x, y: y, petal: i % 2 == 0 ? 0xF2A19A : 0xF0A830)
                    }
                    let bu = (t / 11).truncatingRemainder(dividingBy: 1)
                    if bu > 0.04 && bu < 0.96 {
                        let bx = -30 + (w + 60) * bu
                        let by = top + span * 0.4 - 14 * abs(sin(bu * 34))
                        drawBunny(&ctx, x: bx, y: by)
                    }
                    let fu = t / 15
                    let fx = w * 0.28 + 46 * cos(fu) + 18 * cos(fu * 2.4)
                    let fy = top + span * 0.62 + 26 * sin(fu * 1.7)
                    drawButterfly(&ctx, x: fx, y: fy, flap: abs(sin(t * 8)))
                case 1:
                    // Fireflies + a falling leaf.
                    for i in 0..<6 {
                        let fi = Double(i)
                        let x = w * (0.1 + 0.8 * frac(fi * 0.6180339887 + 0.19))
                        let y = top + span * (0.35 + 0.55 * frac(fi * 0.754))
                        let tw = abs(sin(t / (2.7 + frac(fi * 0.41)) + fi * 2))
                        fill(Path(ellipseIn: CGRect(x: x - 2.2, y: y - 2.2, width: 4.4, height: 4.4)), 0xFFD98A, 0.15 + 0.8 * tw)
                    }
                    let lu = (t / 9).truncatingRemainder(dividingBy: 1)
                    if lu > 0 && lu < 1 {
                        let lx = w * 0.82 - 30 * sin(lu * 6)
                        let ly = top + span * (0.1 + 0.75 * lu)
                        var leaf = ctx
                        leaf.translateBy(x: lx, y: ly)
                        leaf.rotate(by: .degrees(lu * 520))
                        leaf.fill(Path(ellipseIn: CGRect(x: -5, y: -2.4, width: 10, height: 4.8)),
                                  with: .color(Color(hex: 0xD98E4A).opacity(0.9)))
                    }
                default:
                    // Campfire flicker + its glow.
                    let cf = CGPoint(x: w * 0.17, y: top + span * 0.55)
                    let flick = 0.9 + 0.2 * sin(t * 9) + 0.1 * sin(t * 23)
                    fill(Path(ellipseIn: CGRect(x: cf.x - 26, y: cf.y - 26, width: 52, height: 52)), 0xF0A830, 0.1 + 0.08 * flick)
                    fill(Path(roundedRect: CGRect(x: cf.x - 14, y: cf.y - 2, width: 28, height: 5), cornerRadius: 2.5), 0x6B4A2E)
                    var flame = Path()
                    flame.move(to: CGPoint(x: cf.x, y: cf.y - 2))
                    flame.addCurve(to: CGPoint(x: cf.x, y: cf.y - 2 - 26 * flick),
                                   control1: CGPoint(x: cf.x - 8, y: cf.y - 10), control2: CGPoint(x: cf.x - 6, y: cf.y - 20 * flick))
                    flame.addCurve(to: CGPoint(x: cf.x, y: cf.y - 2),
                                   control1: CGPoint(x: cf.x + 6, y: cf.y - 13 * flick), control2: CGPoint(x: cf.x + 6, y: cf.y - 7))
                    flame.closeSubpath()
                    fill(flame, 0xF0A830)
                }

            }

            // Meadow floor + grass tufts at the very bottom (band 0).
            var meadow = Path()
            let meadowTop = h - 140
            meadow.move(to: CGPoint(x: 0, y: h))
            meadow.addLine(to: CGPoint(x: 0, y: meadowTop + 14))
            meadow.addQuadCurve(to: CGPoint(x: w * 0.55, y: meadowTop), control: CGPoint(x: w * 0.25, y: meadowTop - 16))
            meadow.addQuadCurve(to: CGPoint(x: w, y: meadowTop + 10), control: CGPoint(x: w * 0.82, y: meadowTop + 18))
            meadow.addLine(to: CGPoint(x: w, y: h))
            meadow.closeSubpath()
            fill(meadow, 0x7FBA66)
            for i in 0..<8 {
                let fi = Double(i)
                let x = w * (0.05 + 0.9 * frac(fi * 0.6180339887 + 0.29))
                let y = h - 24 - 80 * frac(fi * 0.47)
                var tuft = Path()
                tuft.move(to: CGPoint(x: x - 4, y: y))
                tuft.addLine(to: CGPoint(x: x + 1.3 * sin(t * 1.4 + fi), y: y - 12))
                tuft.addLine(to: CGPoint(x: x + 3, y: y))
                tuft.closeSubpath()
                fill(tuft, 0x4C8C3D)
            }
    }

    // MARK: props

    private func drawRoundTree(_ ctx: inout GraphicsContext, x: CGFloat, y: CGFloat, k: CGFloat, sway: CGFloat, canopy: UInt32, shade: UInt32, trunk: UInt32) {
        var g = ctx
        g.translateBy(x: x, y: y)
        g.rotate(by: .degrees(sway))
        g.scaleBy(x: k, y: k)
        g.fill(Path(roundedRect: CGRect(x: -3, y: -40, width: 6, height: 42), cornerRadius: 3), with: .color(Color(hex: trunk)))
        g.fill(Path(ellipseIn: CGRect(x: -26, y: -88, width: 52, height: 52)), with: .color(Color(hex: canopy)))
        g.fill(Path(ellipseIn: CGRect(x: -22, y: -84, width: 26, height: 22)), with: .color(Color(hex: shade).opacity(0.55)))
    }

    private func drawPine(_ ctx: inout GraphicsContext, x: CGFloat, y: CGFloat, k: CGFloat) {
        var g = ctx
        g.translateBy(x: x, y: y)
        g.scaleBy(x: k, y: k)
        g.fill(Path(CGRect(x: -1.5, y: -6, width: 3, height: 6)), with: .color(Color(hex: 0x0C141B)))
        var p = Path()
        p.move(to: CGPoint(x: 0, y: -46))
        p.addLine(to: CGPoint(x: 14, y: -18)); p.addLine(to: CGPoint(x: 6, y: -20))
        p.addLine(to: CGPoint(x: 17, y: -5)); p.addLine(to: CGPoint(x: -17, y: -5))
        p.addLine(to: CGPoint(x: -6, y: -20)); p.addLine(to: CGPoint(x: -14, y: -18))
        p.closeSubpath()
        g.fill(p, with: .color(Color(hex: 0x10181F)))
    }

    private func drawFlower(_ ctx: inout GraphicsContext, x: CGFloat, y: CGFloat, petal: UInt32) {
        var g = ctx
        g.translateBy(x: x, y: y)
        var stem = Path()
        stem.move(to: .zero)
        stem.addCurve(to: CGPoint(x: 0, y: -14), control1: CGPoint(x: 0, y: -6), control2: CGPoint(x: -1, y: -10))
        g.stroke(stem, with: .color(Color(hex: 0x5F9E4C)), lineWidth: 1.8)
        for (px, py) in [(-3.0, -14.0), (3.0, -14.0), (-2.0, -18.6), (2.0, -18.6)] {
            g.fill(Path(ellipseIn: CGRect(x: px - 2.4, y: py - 2.4, width: 4.8, height: 4.8)), with: .color(Color(hex: petal)))
        }
        g.fill(Path(ellipseIn: CGRect(x: -1.8, y: -17.8, width: 3.6, height: 3.6)), with: .color(Color(hex: 0xFFD98A)))
    }

    private func drawBunny(_ ctx: inout GraphicsContext, x: CGFloat, y: CGFloat) {
        var g = ctx
        g.translateBy(x: x, y: y)
        g.scaleBy(x: 0.8, y: 0.8)
        g.fill(Path(ellipseIn: CGRect(x: -11, y: -8, width: 22, height: 16)), with: .color(Color(hex: 0xEFE3CB)))
        g.fill(Path(ellipseIn: CGRect(x: -13.1, y: -6.1, width: 7.2, height: 7.2)), with: .color(.white))
        g.fill(Path(ellipseIn: CGRect(x: 3.6, y: -12.4, width: 12.8, height: 12.8)), with: .color(Color(hex: 0xEFE3CB)))
        var ear1 = Path()
        ear1.move(to: CGPoint(x: 7, y: -11))
        ear1.addCurve(to: CGPoint(x: 9.5, y: -26.5), control1: CGPoint(x: 5, y: -19), control2: CGPoint(x: 6.5, y: -24))
        ear1.addCurve(to: CGPoint(x: 10, y: -11), control1: CGPoint(x: 11.8, y: -22), control2: CGPoint(x: 11.8, y: -16))
        ear1.closeSubpath()
        g.fill(ear1, with: .color(Color(hex: 0xEFE3CB)))
        var ear2 = Path()
        ear2.move(to: CGPoint(x: 12, y: -11))
        ear2.addCurve(to: CGPoint(x: 18, y: -25), control1: CGPoint(x: 12.5, y: -19), control2: CGPoint(x: 15, y: -23.5))
        ear2.addCurve(to: CGPoint(x: 15, y: -11), control1: CGPoint(x: 19, y: -21), control2: CGPoint(x: 17.2, y: -15))
        ear2.closeSubpath()
        g.fill(ear2, with: .color(Color(hex: 0xE3D2B2)))
        g.fill(Path(ellipseIn: CGRect(x: 11.5, y: -7.8, width: 2.6, height: 2.6)), with: .color(Color(hex: 0x33383E)))
    }

    private func drawButterfly(_ ctx: inout GraphicsContext, x: CGFloat, y: CGFloat, flap: CGFloat) {
        var g = ctx
        g.translateBy(x: x, y: y)
        g.fill(Path(ellipseIn: CGRect(x: -1.4, y: -4, width: 2.8, height: 8)), with: .color(Color(hex: 0x8A6B4A)))
        let rx = 1.2 + 3.0 * flap
        g.fill(Path(ellipseIn: CGRect(x: -4 - rx, y: -6, width: rx * 2, height: 10)), with: .color(Color(hex: 0xF2A19A)))
        g.fill(Path(ellipseIn: CGRect(x: 4 - rx, y: -6, width: rx * 2, height: 10)), with: .color(Color(hex: 0xF2A19A)))
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
    @Environment(\.dismiss) private var dismiss

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
        // Explicit close — without it this sheet only offers ways to START
        // a round, which traps the user on the Mac (no sheet-swipe there).
        .overlay(alignment: .topTrailing) {
            Button { closeModal(dismiss) } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(FeyndTheme.text2)
                    .frame(width: 36, height: 36)
                    .background(FeyndTheme.surface2, in: Circle())
            }
            .buttonStyle(.plain)
            .keyboardShortcut(.cancelAction)
            .padding(.top, 12)
            .padding(.trailing, 14)
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
