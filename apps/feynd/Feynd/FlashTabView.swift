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
    /// Feeds the This Week renewal banner — Peck has no topics list of its
    /// own, so it keeps a lightweight copy (cache first, then refreshed).
    @State private var bannerTopics: [F2Topic] = []
    /// Current scroll offset of the full-bleed world (world-space Y at the
    /// viewport top) and the offset above which the viewport is inside the
    /// night region — together they flip the floating chrome to dark glass.
    @State private var worldOffsetY: CGFloat = .greatestFiniteMagnitude
    @State private var worldNightCutoff: CGFloat = -1

    private var nightChrome: Bool {
        worldNightCutoff >= 0 && worldOffsetY < worldNightCutoff
    }
    /// Crossing into a new region (10→11, 20→21): the transition scene.
    @State private var regionCrossing: RegionCrossing? = nil
    /// Set when the just-played set cleared a band-ending level for the
    /// first time; presented once its results cover is gone.
    @State private var pendingCrossing: Int? = nil
    /// Peck or Perish, the rest-stop minigame (5, 15, 25, …): the one on
    /// screen, and a first clear waiting for its results cover to close.
    @State private var gameStop: PeckGameStop? = nil
    /// Admin Dev mode (Settings → Developer): every rest-stop game and the
    /// level-10 film are open from the map, cleared or not.
    @AppStorage("devMode") private var devMode = false
    @State private var pendingGame: Int? = nil
    /// Pentimento, the film that pays off level 10: the one on screen, and a
    /// first clear waiting for its results cover (the region transition then
    /// waits for the film).
    @State private var film: PentimentoFilm? = nil
    @State private var pendingFilm = false
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
    /// Room above the last level for Sugar Castle on its cloud bank.
    private let topPad: CGFloat = PeckFinale.topPad
    private let bottomPad: CGFloat = 130
    private let amp: CGFloat = 78

    var body: some View {
        ZStack {
            FeyndTheme.bg.ignoresSafeArea()
            if let state, state.cardCount >= 10 {
                // Full bleed: the world owns the screen — sky under the
                // clock, grass under the home bar — and the chrome floats
                // over it on frosted pills. The tab pill (MainTabsView) is
                // the one fixed anchor shared with the rest of the app.
                levelMap(state)
                    .ignoresSafeArea()
                nightMist
                floatingChrome
            } else {
                // Pre-map states (building the first deck, loading, errors)
                // keep the classic framed chrome.
                VStack(spacing: 0) {
                    classicTopBar
                    HomeBannerSlot(jumbo: state, topics: bannerTopics)
                        .padding(.horizontal, 14)
                        .padding(.top, 4)
                        .padding(.bottom, 2)
                    VStack(spacing: 0) {
                        if loading && state == nil {
                            titleRow
                            ProgressView().tint(FeyndTheme.text2)
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                        } else if let state {
                            titleRow
                            lockedHero(state)
                        } else {
                            titleRow
                            errorHero
                        }
                    }
                    .feyndContentColumn()
                }
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
        .fullScreenCover(item: $gameStop) { stop in
            switch PeckMilestone.restGame(stop.level) {
            case .deepDive: DeepDiveView(level: stop.level) { gameStop = nil }
            case .peckOrPerish: PeckGameView(level: stop.level) { gameStop = nil }
            }
        }
        .fullScreenCover(item: $film) { f in
            PentimentoView {
                film = nil
                // After a first clear the walk into Fern Hollow follows the film.
                if f.firstClear, let cleared = pendingCrossing {
                    pendingCrossing = nil
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
                        regionCrossing = RegionCrossing(clearedLevel: cleared)
                    }
                }
            }
        }
        .fullScreenCover(isPresented: $showDemoReel) {
            DemoReelView { showDemoReel = false }
        }
        // The results cover just closed — if that set opened a region, play
        // the transition now, over the freshly reloaded map.
        .onChange(of: activeSet == nil && voiceSet == nil) { _, coversGone in
            if coversGone, pendingFilm {
                // Level 10: the film first; its close starts the region transition.
                pendingFilm = false
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) {
                    film = PentimentoFilm(firstClear: true)
                }
            } else if coversGone, let cleared = pendingCrossing {
                pendingCrossing = nil
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) {
                    regionCrossing = RegionCrossing(clearedLevel: cleared)
                }
            }
            if coversGone, let stop = pendingGame {
                pendingGame = nil
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) {
                    gameStop = PeckGameStop(level: stop)
                }
            }
        }
        .onTitleVisibility { bigTitleVisible = $0 }
        .task {
            if state == nil, let cached: JumboState = ScreenCache.load(key: ScreenCache.jumbo) {
                state = cached
            }
            // Renewal banner data: paint from the cached topics list, then
            // refresh quietly so the week's due date is current.
            if bannerTopics.isEmpty,
               let cachedTopics: [F2Topic] = ScreenCache.load(key: ScreenCache.topics) {
                bannerTopics = cachedTopics
            }
            Task { bannerTopics = (try? await F2API.shared.listTopics()) ?? bannerTopics }
            await load()
            #if targetEnvironment(simulator)
            // Headless-verification hook: `simctl launch … -AutoPlayLevel 3`
            // opens that level's set in text mode without any taps, so
            // screenshot loops can see the in-set UI (e.g. Peck credits).
            let auto = UserDefaults.standard.integer(forKey: "AutoPlayLevel")
            if auto > 0, let level = state?.levels.first(where: { $0.level == auto }) {
                UserDefaults.standard.removeObject(forKey: "AutoPlayLevel")
                // `-AutoPlayMode mixed` overrides the default text mode
                // (mixed is where cloze questions live).
                let mode = UserDefaults.standard.string(forKey: "AutoPlayMode") ?? "text"
                UserDefaults.standard.removeObject(forKey: "AutoPlayMode")
                play(level, mode: mode)
            }
            // `-OpenStreakModal 1` — the flame's status card, no tap.
            if UserDefaults.standard.bool(forKey: "OpenStreakModal"), let st = state {
                UserDefaults.standard.removeObject(forKey: "OpenStreakModal")
                streakModal = StreakMilestone(days: st.dailyStreak ?? 0, multiplier: st.xpMultiplier ?? 1,
                                              celebration: false,
                                              peckDue: st.peckDue, peckDaysLeft: st.peckDaysLeft)
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
            // last passed) so the region scenery can be screenshotted. Add
            // `-MockCurrentLevel M` to stand on level M with M+1…N locked.
            let mock = UserDefaults.standard.integer(forKey: "MockLevelCount")
            if mock > 0, let st = state {
                UserDefaults.standard.removeObject(forKey: "MockLevelCount")
                let curMock = UserDefaults.standard.integer(forKey: "MockCurrentLevel")
                UserDefaults.standard.removeObject(forKey: "MockCurrentLevel")
                let cur = curMock > 0 ? min(curMock, mock) : mock
                let levels = (1...mock).map { lvl in
                    JumboLevelInfo(level: lvl, mode: "mixed",
                                   status: lvl < cur ? "passed" : (lvl == cur ? "unlocked" : "locked"),
                                   bestScore: 9, stars: lvl % 3 + 1, passScore: 8)
                }
                state = JumboState(xp: st.xp, cardCount: st.cardCount,
                                   highestPassed: cur - 1, levels: levels,
                                   dailyStreak: st.dailyStreak, xpMultiplier: st.xpMultiplier,
                                   peckDue: st.peckDue, peckDaysLeft: st.peckDaysLeft)
            }
            // `-MockStreak N` — fake a streak for pill/modal screenshots.
            let mockStreak = UserDefaults.standard.integer(forKey: "MockStreak")
            if mockStreak > 0, let st = state {
                UserDefaults.standard.removeObject(forKey: "MockStreak")
                UserDefaults.standard.removeObject(forKey: "streakCelebrated")
                let mult = mockStreak >= 14 ? 4 : mockStreak >= 10 ? 3 : mockStreak >= 4 ? 2 : 1
                state = JumboState(xp: st.xp, cardCount: st.cardCount,
                                   highestPassed: st.highestPassed, levels: st.levels,
                                   dailyStreak: mockStreak, xpMultiplier: mult,
                                   peckDue: st.peckDue, peckDaysLeft: st.peckDaysLeft)
            }
            // `-MockPeckDue N` — fake the weekly Peck deadline N days out
            // (0 = today) for banner/modal screenshots; needs a streak, so
            // one is faked too when absent.
            if UserDefaults.standard.object(forKey: "MockPeckDue") != nil, let st = state {
                let left = UserDefaults.standard.integer(forKey: "MockPeckDue")
                UserDefaults.standard.removeObject(forKey: "MockPeckDue")
                UserDefaults.standard.removeObject(forKey: "peckWeekBannerDismissed")
                let streak = max(st.dailyStreak ?? 0, 12)
                let mult = streak >= 14 ? 4 : streak >= 10 ? 3 : streak >= 4 ? 2 : 1
                let due = Calendar.current.date(byAdding: .day, value: left, to: Date()) ?? Date()
                let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
                state = JumboState(xp: st.xp, cardCount: st.cardCount,
                                   highestPassed: st.highestPassed, levels: st.levels,
                                   dailyStreak: streak, xpMultiplier: mult,
                                   peckDue: f.string(from: due), peckDaysLeft: left)
            }
            #endif
            #if targetEnvironment(simulator) || (targetEnvironment(macCatalyst) && DEBUG)
            // `-OpenLevelSheet 1` — the current level's start sheet, no taps.
            if UserDefaults.standard.bool(forKey: "OpenLevelSheet") {
                UserDefaults.standard.removeObject(forKey: "OpenLevelSheet")
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                    sheetLevel = state?.levels.first(where: { $0.status == "unlocked" })
                }
            }
            // `-PlayPeckGame 5` — open that rest stop's minigame, no taps.
            let game = UserDefaults.standard.integer(forKey: "PlayPeckGame")
            if game > 0 {
                UserDefaults.standard.removeObject(forKey: "PlayPeckGame")
                gameStop = PeckGameStop(level: game)
            }
            // `-PlayPentimento 1` — the level-10 film as a replay;
            // `-PlayPentimento 2` — as a first clear, so the Fern Hollow
            // transition should follow when it closes.
            let pent = UserDefaults.standard.integer(forKey: "PlayPentimento")
            if pent > 0 {
                UserDefaults.standard.removeObject(forKey: "PlayPentimento")
                if pent == 2 { pendingCrossing = 10 }
                film = PentimentoFilm(firstClear: pent == 2)
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
        streakModal = StreakMilestone(days: streak, multiplier: state?.xpMultiplier ?? 1,
                                      peckDue: state?.peckDue, peckDaysLeft: state?.peckDaysLeft)
    }

    /// The flame — consecutive daily-card days, with the XP multiplier it
    /// has earned. Absent entirely until a streak exists; tap for the story.
    @ViewBuilder
    private var streakPill: some View {
        let streak = state?.dailyStreak ?? 0
        if streak >= 1 {
            let mult = state?.xpMultiplier ?? 1
            Button {
                streakModal = StreakMilestone(days: streak, multiplier: mult, celebration: false,
                                              peckDue: state?.peckDue, peckDaysLeft: state?.peckDaysLeft)
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
                .background(.thinMaterial, in: Capsule())
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
        .background(.thinMaterial, in: Capsule())
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
                .background(.thinMaterial, in: Capsule())
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
                .background(.thinMaterial, in: Capsule())
                .overlay(Capsule().stroke(FeyndTheme.border, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Manage your decks")
    }

    /// The framed chrome used by pre-map states (first deck, loading, error).
    private var classicTopBar: some View {
        FeyndTopBar {
            BarTitle(text: "Peck", bigTitleVisible: bigTitleVisible)
                // Hidden demo reel — a long press on the bar title plays
                // mascot + regions + both transitions.
                .onLongPressGesture(minimumDuration: 1.5) {
                    showDemoReel = true
                }
        } trailing: {
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
    }

    /// Full-bleed chrome: the same pills, floating over the world on
    /// frosted glass. In the night region the whole strip flips to dark
    /// glass by swapping the color scheme the pills resolve against.
    private var floatingChrome: some View {
        VStack(spacing: 8) {
            HStack(spacing: 6) {
                ProfileBadge()
                    .contentShape(Rectangle())
                    .onTapGesture { showProfile = true }
                    // The demo reel keeps its hidden door.
                    .onLongPressGesture(minimumDuration: 1.5) { showDemoReel = true }
                streakPill
                Spacer(minLength: 8)
                pebblesButton
                deckStackButton
                xpPill
            }
            HomeBannerSlot(jumbo: state, topics: bannerTopics)
            Spacer()
        }
        .padding(.horizontal, 14)
        .padding(.top, 6)
    }

    /// Summit mist: a whisper of light at the very top of the night region
    /// so the system clock stays readable over the dark sky.
    @ViewBuilder
    private var nightMist: some View {
        if nightChrome {
            VStack(spacing: 0) {
                LinearGradient(colors: [.white.opacity(0.26), .clear],
                               startPoint: .top, endPoint: .bottom)
                    .frame(height: 72)
                Spacer()
            }
            .ignoresSafeArea()
            .allowsHitTesting(false)
            .transition(.opacity)
        }
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
            let count = state.levels.count
            let world = PeckGeometry(count: count, pitch: pitch, topPad: topPad, bottomPad: bottomPad,
                                     centerX: geo.size.width / 2, amp: amp * w / 430)
            let height = world.height
            let yFor: (Int) -> CGFloat = { i in world.y(i) }
            let xFor: (Int) -> CGFloat = { i in world.x(i) }
            let currentIdx = state.levels.firstIndex(where: { $0.status == "unlocked" })
            // The jelly world has no night region: the floating chrome keeps
            // its daytime glass the whole way up.
            let nightCutoff: CGFloat = -1

            ScrollViewReader { proxy in
                ScrollView {
                    Color.clear.frame(height: 1)
                        .id("peck-top")
                    GeometryReader { g in
                        Color.clear.preference(
                            key: PeckScrollOffsetKey.self,
                            value: -g.frame(in: .named("peckWorld")).minY)
                    }
                    .frame(height: 0)
                    ZStack(alignment: .topLeading) {
                        PeckWorldScenery(height: height, levelCount: count, pitch: pitch, bottomPad: bottomPad,
                                         scrollY: worldOffsetY, currentIdx: currentIdx ?? 0)

                        // The road: worn behind you, stepping stones ahead,
                        // fog beyond — plus gates, signposts, chests.
                        PeckTrailLayer(geo: world, levels: state.levels, currentIdx: currentIdx, devMode: devMode)

                        // Critters seated along the sides (tap to poke, hold
                        // to make one your avatar) and the chests beside a
                        // few stones — under the stones, over the road.
                        ForEach(jellyCritterSeats(geo: world, width: geo.size.width)) { seat in
                            JellyCritterView(seat: seat)
                                .position(x: seat.point.x,
                                          y: seat.floating ? seat.point.y : seat.point.y - seat.size * 0.42)
                        }
                        ForEach(Array(state.levels.enumerated()), id: \.element.level) { i, level in
                            if PeckMilestone.hasChest(level.level) {
                                let side: CGFloat = world.zig(i) > 0 ? -1 : 1
                                // The chest canvas is 140×120 with the box's
                                // base 22 up from its bottom edge.
                                JellyChestView(level: level.level, passed: level.status == "passed")
                                    .position(x: xFor(i) + side * 60, y: yFor(i) + 22 - 38)
                            }
                        }

                        ForEach(Array(state.levels.enumerated()), id: \.element.level) { i, level in
                            levelNode(level, index: i, currentIdx: currentIdx)
                                .position(x: xFor(i), y: yFor(i))
                                .id(level.level)
                        }

                        // A cleared rest stop's signpost replays its game
                        // (the sign is drawn by PeckTrailLayer at ±78, +20).
                        // Level 10's gate, once cleared, has a sign that replays Pentimento.
                        ForEach(Array(state.levels.enumerated()), id: \.element.level) { i, level in
                            if level.level == 10 && (level.status == "passed" || devMode) {
                                let side: CGFloat = world.zig(i) > 0 ? -1 : 1
                                Button {
                                    FlashSFX.shared.play(.pop)
                                    film = PentimentoFilm(firstClear: false)
                                } label: {
                                    Color.clear
                                        .frame(width: 100, height: 64)
                                        .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("Watch Pentimento, the level 10 film")
                                .position(x: xFor(i) + side * 112, y: yFor(i) + 2)
                            }
                        }
                        ForEach(Array(state.levels.enumerated()), id: \.element.level) { i, level in
                            if PeckMilestone.isRest(level.level) && (level.status == "passed" || devMode) {
                                let side: CGFloat = world.zig(i) > 0 ? -1 : 1
                                Button {
                                    FlashSFX.shared.play(.pop)
                                    gameStop = PeckGameStop(level: level.level)
                                } label: {
                                    Color.clear
                                        .frame(width: 100, height: 64)
                                        .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("Play \(PeckMilestone.restGame(level.level).name), rest stop \(level.level)")
                                .position(x: xFor(i) + side * 78, y: yFor(i) - 8)
                            }
                        }

                        // The traveler stands on top of the current stone
                        // (feet at travelerPoint; the view's feet sit 3pt
                        // above its bottom edge).
                        if let i = currentIdx {
                            let p = world.travelerPoint(current: i)
                            let dodoH: CGFloat = 66
                            AnimatedDodoView(height: dodoH, tickleable: true)
                                .position(x: p.x, y: p.y - dodoH * 1.45 / 2 + 3)
                            // The due-date board is planted beside the current
                            // stone, on the side with room: right of a stone on
                            // the left of the zigzag, left otherwise (rest-stop
                            // and Pentimento signs stand on the right of the
                            // centre stones they belong to). Clamped so the
                            // board never runs off the screen edge.
                            if state.peckDue != nil, let left = state.peckDaysLeft {
                                let stone = world.point(i)
                                PeckDueSign(daysLeft: left)
                                    .position(x: dueBoardX(i, world: world, levels: state.levels, width: geo.size.width),
                                              y: stone.y + PeckDueSign.centerOffsetY)
                            }
                        }
                    }
                    .frame(height: height)
                    // Keep the TabPill off the last node — in the meadow's
                    // near hill, so the green runs to the screen's edge.
                    // (Pulled up over the stack's default spacing, which
                    // otherwise shows the page colour as a pale line.)
                    Rectangle()
                        .fill(JellyInk.adaptive(0x96D088))
                        .frame(height: 108)
                        .padding(.top, -12)
                }
                .coordinateSpace(name: "peckWorld")
                .onPreferenceChange(PeckScrollOffsetKey.self) { worldOffsetY = $0 }
                .onAppear { worldNightCutoff = nightCutoff }
                .onChange(of: count) { _, _ in worldNightCutoff = nightCutoff }
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
                        // Late enough for the map to have its final height
                        // (the state, and any -MockLevelCount, land after the
                        // first layout); at 1.2 s it was a region off (2026-10-02).
                        DispatchQueue.main.asyncAfter(deadline: .now() + 5.0) {
                            proxy.scrollTo(target, anchor: .center)
                        }
                    }
                }
                #endif
            }
        }
    }

    /// Where the due-date board stands beside the current stone: on the side
    /// with room — right of a stone on the left of the zigzag, left otherwise
    /// (rest-stop and Pentimento signs stand on the right of centre stones).
    /// A region's first stone has its name sign on the side away from the
    /// next stone, and the gate banner below leans the same way, so there
    /// the board takes the other side (2026-10-02, on level 11: the board sat
    /// on JELLY LAGOON and its post ran through "To Jelly Lagoon"). On a gate
    /// stone it stands outside the arch (r 70 plus its stroke). Clamped so it
    /// never runs off the screen edge.
    private func dueBoardX(_ i: Int, world: PeckGeometry, levels: [JumboLevelInfo], width: CGFloat) -> CGFloat {
        let stone = world.point(i)
        var side: CGFloat = world.zig(i) < 0 ? 1 : -1
        var reach: CGFloat = 86
        if i % 10 == 0 {
            let next = i + 1 < world.count ? world.zig(i + 1) : 0
            side = next < 0 ? -1 : 1
        } else if i < levels.count, PeckMilestone.isGate(levels[i].level) {
            reach = 130
        }
        return min(max(stone.x + side * reach, 54), width - 54)
    }

    /// One level stone — the jelly ball (`JellyNodeView` in PeckJelly.swift).
    private func levelNode(_ level: JumboLevelInfo, index: Int, currentIdx: Int?) -> some View {
        // Only the next two locked stones read as "soon"; the rest ghost.
        let frontier = currentIdx ?? level.level
        return JellyNodeView(level: level,
                             isGate: PeckMilestone.isGate(level.level),
                             nearLocked: index <= frontier + 2,
                             region: JellyRegion.of(index: index),
                             pulse: pulse) {
            sheetLevel = level
        }
    }
    // MARK: - Data / actions

    private func load() async {
        loading = state == nil
        defer { loading = false }
        do {
            state = try await F2API.shared.jumboState()
            if let state { ScreenCache.save(state, key: ScreenCache.jumbo) }
            // Streak-deadline reminders follow the freshest server state.
            PeckWeekNotifications.sync(state: state)
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

    /// A finished set that cleared a level for the first time: a band-ending
    /// level (10, 20) queues the region transition, a rest stop (5, 15, 25, …)
    /// queues Peck or Perish, both for when the results cover closes.
    private func noteRegionCrossing(start: FlashStart, result: FlashSubmitResult) {
        guard let lvl = start.jumboLevel ?? playingLevel,
              playingWasFirstClear,
              result.total >= 10,
              result.score >= jumboPassScore(mode: start.mode)
        else { return }
        if lvl == 10 || lvl == 20 { pendingCrossing = lvl }
        if lvl == 10 { pendingFilm = true }
        if PeckMilestone.isRest(lvl) { pendingGame = lvl }
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

// MARK: - The jelly world

/// The dodo's world, drawn tall in region bands of ten levels each — the
/// jelly map (misc/dodo-redesign/dodo-jelly-map.html): Gumdrop Meadow
/// (1–10) at the bottom, Jelly Lagoon (11–20) above it, Sprinkle Peaks
/// (21–30) on top, and Sugar Castle on its cloud bank above the highest
/// band. The lagoon's waves and lilies move and sprinkles drift down the
/// whole map; everything freezes under Reduce Motion. Dark mode gets the
/// same candy at dusk (`JellyInk`). All Canvas, no assets.
private struct PeckWorldScenery: View {
    let height: CGFloat
    let levelCount: Int
    let pitch: CGFloat
    let bottomPad: CGFloat
    /// Viewport top in world coords — details are only drawn near it.
    let scrollY: CGFloat
    let currentIdx: Int
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        if reduceMotion {
            PeckWorldCanvas(height: height, levelCount: levelCount, pitch: pitch, bottomPad: bottomPad,
                            scrollY: scrollY, currentIdx: currentIdx, dark: scheme == .dark, t: 0)
        } else {
            TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { timeline in
                PeckWorldCanvas(height: height, levelCount: levelCount, pitch: pitch, bottomPad: bottomPad,
                                scrollY: scrollY, currentIdx: currentIdx, dark: scheme == .dark,
                                t: CGFloat(timeline.date.timeIntervalSinceReferenceDate))
            }
        }
    }
}

struct PeckWorldCanvas: View {
    let height: CGFloat
    let levelCount: Int
    let pitch: CGFloat
    let bottomPad: CGFloat
    var scrollY: CGFloat = .greatestFiniteMagnitude
    var currentIdx: Int = 0
    var dark: Bool = false
    let t: CGFloat

    /// World y of level i — same math as PeckGeometry.
    private func levelY(_ i: Int) -> CGFloat { height - bottomPad - CGFloat(i) * pitch }
    private func frac(_ v: CGFloat) -> CGFloat { v - v.rounded(.down) }

    var body: some View {
        Canvas { ctx, size in
            drawWorld(ctx, size: size)
        }
        .frame(height: height)
    }

    // Split out of the Canvas closure: the Catalyst release compile hit
    // "unable to type-check this expression in reasonable time" on the
    // giant closure; named methods type-check fast.
    private func drawWorld(_ context: GraphicsContext, size: CGSize) {
        var ctx = context
        let ink = JellyInk(dark: dark)
        let w = size.width
        let h = size.height
        let bands = max(1, Int(ceil(Double(levelCount) / 10.0)))
        // The castle strip above the highest band.
        let finaleBottom: CGFloat = PeckFinale.bandTop
        func bandBottom(_ k: Int) -> CGFloat {
            k == 0 ? h : h - bottomPad - (CGFloat(k * 10) - 0.5) * pitch
        }
        func bandTop(_ k: Int) -> CGFloat {
            k == bands - 1 ? finaleBottom : h - bottomPad - (CGFloat(k * 10 + 9) + 0.5) * pitch
        }
        // Details only near the viewport (the whole world is one canvas).
        let known = scrollY != .greatestFiniteMagnitude
        let visTop: CGFloat = known ? scrollY - 320 : -1e9
        let visBot: CGFloat = known ? scrollY + 1500 : 1e9
        let near: (CGFloat) -> Bool = { y in y > visTop && y < visBot }

        // ── The castle's sunrise sky, and its sun.
        ctx.fill(Path(CGRect(x: 0, y: 0, width: w, height: finaleBottom + 80)),
                 with: .linearGradient(Gradient(stops: [
                    .init(color: ink.c(0xFFC9A6), location: 0),
                    .init(color: ink.c(0xFFD8C4), location: 0.55),
                    .init(color: ink.c(0xF4DCF6), location: 1),
                 ]), startPoint: .zero, endPoint: CGPoint(x: 0, y: finaleBottom)))
        if near(190) {
            ctx.fill(Path(ellipseIn: CGRect(x: w * 0.77 - 140, y: 190 - 140, width: 280, height: 280)),
                     with: .radialGradient(Gradient(stops: [
                        .init(color: jellyRGBA(255, 240, 170, dark ? 0.5 : 0.95), location: 0),
                        .init(color: jellyRGBA(255, 220, 140, dark ? 0.3 : 0.6), location: 0.25),
                        .init(color: jellyRGBA(255, 200, 150, 0), location: 1),
                     ]), center: CGPoint(x: w * 0.77, y: 190), startRadius: 0, endRadius: 140))
        }

        // ── Bands, top one first, so each lower band's shore overlaps the
        //    one above it the way the page layers them.
        for k in stride(from: bands - 1, through: 0, by: -1) {
            let top = max(finaleBottom, bandTop(k))
            let bottom = min(h, bandBottom(k))
            guard bottom > top else { continue }
            let span = bottom - top
            switch JellyRegion.of(band: k) {
            case .peaks: drawPeaks(&ctx, ink, w: w, top: top, bottom: bottom, span: span, near: near)
            case .lagoon: drawLagoon(&ctx, ink, w: w, top: top, bottom: bottom, span: span, near: near)
            case .meadow: drawMeadow(&ctx, ink, w: w, top: top, bottom: bottom, span: span, h: h, near: near)
            }
            if k == bands - 1 && near(PeckFinale.castleBase) {
                // Sugar Castle on its cloud bank, over the top band's edge.
                jellyCastle(&ctx, ink, x: w / 2, base: PeckFinale.castleBase)
                jellyCloudBank(&ctx, ink, y: PeckFinale.castleBase + 40, width: w)
            }
        }

        // ── Sprinkles drifting down the whole map.
        for i in 0..<30 {
            let fi = CGFloat(i)
            let y = h * frac(t * (0.005 + 0.004 * frac(fi * 0.37)) + fi * 0.0333)
            guard near(y) else { continue }
            let x = w * frac(fi * 0.618 + 0.2) + 26 * sin(t * 0.7 + fi)
            var s = ctx
            s.translateBy(x: x, y: y)
            s.rotate(by: .radians(t * 0.8 + fi))
            s.fill(Path(CGRect(x: -4, y: -1.3, width: 8, height: 2.6)),
                   with: .color(ink.c(Jelly.gdCols[i % 6], 0.55)))
        }
    }

    // MARK: regions

    /// Sprinkle Peaks: lavender sky, candy mountains with frosting caps,
    /// pink-lavender hills, lollipops on the sides.
    private func drawPeaks(_ ctx: inout GraphicsContext, _ ink: JellyInk, w: CGFloat, top: CGFloat, bottom: CGFloat, span: CGFloat, near: (CGFloat) -> Bool) {
        ctx.fill(Path(CGRect(x: 0, y: top - 60, width: w, height: span + 120)),
                 with: .linearGradient(Gradient(colors: [ink.c(0xF1DEFB), ink.c(0xF8DCEE)]),
                                       startPoint: CGPoint(x: 0, y: top), endPoint: CGPoint(x: 0, y: bottom)))
        // The page's peaks span 820pt; ours is a band — stretch the layout.
        let sy = span / 820
        let ms = min(1.3, sy)
        func y(_ v: CGFloat) -> CGFloat { top + v * sy }
        if near(y(300)) {
            jellyMountain(&ctx, ink, cx: w * 0.08, base: y(300), w: 260 * ms, h: 230 * ms, col: 0xC9B2FF, cap: 0xFFFAFF)
            jellyMountain(&ctx, ink, cx: w * 0.84, base: y(290), w: 300 * ms, h: 260 * ms, col: 0xD6C2FF, cap: 0xFFFAFF)
        }
        jellyHillLayer(&ctx, ink, baseY: y(300), amp: 24, freq: 0.02, phase: 1, col: 0xEFDCFF, rim: 0.6, width: w, bottom: bottom + 60)
        if near(y(580)) {
            jellyMountain(&ctx, ink, cx: w * -0.02, base: y(580), w: 240 * ms, h: 190 * ms, col: 0xF0B6DC, cap: 0xFFFFFF)
            jellyMountain(&ctx, ink, cx: w * 0.98, base: y(570), w: 250 * ms, h: 220 * ms, col: 0xE9B0E0, cap: 0xFFFFFF)
        }
        jellyHillLayer(&ctx, ink, baseY: y(580), amp: 26, freq: 0.018, phase: 2.4, col: 0xF7DCF3, rim: 0.6, width: w, bottom: bottom + 60)
        if near(y(790)) {
            jellyMountain(&ctx, ink, cx: w * 0.14, base: y(790), w: 220 * ms, h: 150 * ms, col: 0xD9C2FF, cap: 0xFFFFFF)
        }
        jellyHillLayer(&ctx, ink, baseY: y(790), amp: 22, freq: 0.022, phase: 0.6, col: 0xFBE3EF, rim: 0.6, width: w, bottom: bottom + 60)
        let lollis: [(CGFloat, CGFloat, CGFloat, UInt32)] = [
            (w * 0.10, y(700), 1.0, 0xFF7AB0), (w * 0.90, y(460), 1.0, 0x7FD3FF), (w * 0.09, y(170), 0.9, 0xFFD43A),
            (w * 0.91, y(710), 0.85, 0xA3E45C), (w * 0.89, y(220), 0.8, 0xFF9A5C),
        ]
        for (x, ly, s, col) in lollis where near(ly) {
            jellyLolli(&ctx, ink, x: x, y: ly, s: s, col: col)
        }
    }

    /// Jelly Lagoon: a sand shore along the top, water with drifting waves
    /// and bobbing lily pads. The sand islands under the stones and the
    /// stepping stones are the trail layer's.
    private func drawLagoon(_ ctx: inout GraphicsContext, _ ink: JellyInk, w: CGFloat, top: CGFloat, bottom: CGFloat, span: CGFloat, near: (CGFloat) -> Bool) {
        jellyHillLayer(&ctx, ink, baseY: top + 4, amp: 14, freq: 0.03, phase: 0.4, col: 0xFFE7C2, rim: 0.7, width: w, bottom: top + 70)
        var water = Path()
        var shoreline = Path()
        water.move(to: CGPoint(x: -20, y: bottom + 50))
        var x: CGFloat = -20
        var first = true
        while x <= w + 20 {
            let y = top + 24 - 8 * sin(x * 0.03 + 1.3)
            water.addLine(to: CGPoint(x: x, y: y))
            if first { shoreline.move(to: CGPoint(x: x, y: y + 4)); first = false } else { shoreline.addLine(to: CGPoint(x: x, y: y + 4)) }
            x += 12
        }
        water.addLine(to: CGPoint(x: w + 20, y: bottom + 50))
        water.closeSubpath()
        ctx.fill(water, with: .linearGradient(Gradient(stops: [
            .init(color: ink.c(0x9BE3F5), location: 0),
            .init(color: ink.c(0x7FD2EF), location: 0.5),
            .init(color: ink.c(0x8FDAF2), location: 1),
        ]), startPoint: CGPoint(x: 0, y: top), endPoint: CGPoint(x: 0, y: bottom)))
        ctx.stroke(shoreline, with: .color(.white.opacity(0.75)), lineWidth: 3)
        // Waves: little ~ strokes drifting right.
        let rows = Int(span / 48)
        for k in 0..<rows {
            let y = top + 60 + CGFloat(k) * 48
            guard near(y) else { continue }
            let off = (t * 12 + CGFloat(k) * 40).truncatingRemainder(dividingBy: 120)
            var wx: CGFloat = -60 + off + CGFloat((k * 37) % 60)
            var wave = Path()
            while wx < w + 60 {
                wave.move(to: CGPoint(x: wx, y: y))
                wave.addQuadCurve(to: CGPoint(x: wx + 16, y: y), control: CGPoint(x: wx + 8, y: y - 5))
                wave.addQuadCurve(to: CGPoint(x: wx + 32, y: y), control: CGPoint(x: wx + 24, y: y + 5))
                wx += 130
            }
            ctx.stroke(wave, with: .color(.white.opacity(0.45)), style: StrokeStyle(lineWidth: 2.2, lineCap: .round))
        }
        // Lily pads on the sides, bobbing.
        for i in 0..<12 {
            let fi = CGFloat(i)
            let u = frac(fi * 0.618 + 0.11)
            let lx = u < 0.5 ? w * (0.04 + 0.2 * u * 2) : w * (0.76 + 0.2 * (u - 0.5) * 2)
            let ly = top + 90 + (span - 170) * frac(fi * 0.754)
            guard near(ly) else { continue }
            let r = 9 + 6 * frac(fi * 0.41)
            let a = 2 * CGFloat.pi * frac(fi * 0.29)
            let bob = sin(t * 1.5 + lx) * 1.5
            ctx.fill(jellyEllipse(lx, ly + 3 + bob, r * 1.05, r * 0.5), with: .color(jellyRGBA(40, 120, 150, 0.18)))
            ctx.fill(jellyEllipse(lx, ly + bob, r, r * 0.48), with: .color(ink.c(0x8FDC8A)))
            var notch = Path()
            notch.move(to: CGPoint(x: lx, y: ly + bob))
            notch.addLine(to: CGPoint(x: lx + cos(a) * r * 1.1, y: ly + bob + sin(a) * r * 0.53))
            notch.addLine(to: CGPoint(x: lx + cos(a + 0.6) * r * 1.1, y: ly + bob + sin(a + 0.6) * r * 0.53))
            notch.closeSubpath()
            ctx.fill(notch, with: .color(ink.c(0x7FD2EF)))
            ctx.fill(jellyEllipse(lx - r * 0.35, ly - r * 0.15 + bob, r * 0.3, r * 0.1, rot: -0.2), with: .color(.white.opacity(0.5)))
        }
    }

    /// Gumdrop Meadow: layered green hills, grass sprinkles, gumdrops and
    /// candy trees on the sides.
    private func drawMeadow(_ ctx: inout GraphicsContext, _ ink: JellyInk, w: CGFloat, top: CGFloat, bottom: CGFloat, span: CGFloat, h: CGFloat, near: (CGFloat) -> Bool) {
        let s = span / 870
        jellyHillLayer(&ctx, ink, baseY: top, amp: 30, freq: 0.016, phase: 0.2, col: 0xC8EDB4, rim: 0.55, width: w, bottom: h)
        jellyHillLayer(&ctx, ink, baseY: top + 250 * s, amp: 34, freq: 0.014, phase: 2.1, col: 0xB6E4A3, rim: 0.5, width: w, bottom: h)
        jellyHillLayer(&ctx, ink, baseY: top + 510 * s, amp: 30, freq: 0.017, phase: 4.0, col: 0xA5DA94, rim: 0.45, width: w, bottom: h)
        jellyHillLayer(&ctx, ink, baseY: top + 730 * s, amp: 26, freq: 0.015, phase: 1.2, col: 0x96D088, rim: 0.4, width: w, bottom: h)
        for i in 0..<70 {
            let fi = CGFloat(i)
            let y = top + 20 + (span - 30) * frac(fi * 0.7548)
            guard near(y) else { continue }
            var g = ctx
            g.translateBy(x: w * frac(fi * 0.618 + 0.13), y: y)
            g.rotate(by: .radians(2 * .pi * frac(fi * 0.31)))
            g.fill(Path(CGRect(x: -3, y: -1, width: 6, height: 2.2)), with: .color(ink.c(Jelly.gdCols[i % 6], 0.8)))
        }
        for i in 0..<22 {
            let fi = CGFloat(i)
            let u = frac(fi * 0.618 + 0.43)
            let x = u < 0.5 ? w * (0.03 + 0.16 * u * 2) : w * (0.81 + 0.16 * (u - 0.5) * 2)
            let y = top + 60 + (span - 120) * frac(fi * 0.917)
            guard near(y) else { continue }
            jellyGumdrop(&ctx, ink, x: x, y: y, r: 5 + 3 * frac(fi * 0.53), col: Jelly.gdCols[(i * 5) % 6])
        }
        // Trees in the gaps between stones, alternating sides, clear of
        // the critters (which sit in the odd gaps).
        let treeCols: [UInt32] = [0xFF9FC8, 0x91E9CC, 0xFFD27A, 0xA3E45C]
        for (j, gap) in [0, 2, 4, 6, 8].enumerated() {
            let y = levelY(gap) - pitch * (0.35 + 0.3 * frac(CGFloat(j) * 0.61))
            guard y > top + 60 && y < bottom && near(y) else { continue }
            let leftSide = j % 2 == 0
            let x = leftSide ? w * (0.05 + 0.05 * frac(CGFloat(j) * 0.37)) : w * (0.9 + 0.05 * frac(CGFloat(j) * 0.37))
            jellyTree(&ctx, ink, x: x, y: y, s: 0.85 + 0.3 * frac(CGFloat(j) * 0.73), col: treeCols[j % 4])
        }
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


/// Scroll offset of the Peck world (world-space Y at the viewport top).
private struct PeckScrollOffsetKey: PreferenceKey {
    static var defaultValue: CGFloat = .greatestFiniteMagnitude
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = min(value, nextValue())
    }
}

#if targetEnvironment(simulator)
/// `-ExportPeckWorld <host dir>` — renders the island scenery the Peck map
/// scrolls over, at the map's real pitch, for 10, 20 and 30 levels (one,
/// two, all three regions — the finale follows the top band) to
/// `<dir>/peck-world-<n>.png` at 3x, with a `peck-world.log` beside them.
/// The app draws this live and ships no image of it, so this is how the
/// art leaves the app. Geometry numbers match FlashTabView's path geometry
/// (pitch / topPad / bottomPad). The 30-level world is ~10.6k px tall,
/// past what `ImageRenderer.uiImage` will rasterize (it returns nil), so
/// the SwiftUI drawing is replayed into a plain CoreGraphics bitmap.
@MainActor
func exportPeckWorld(to dir: String) {
    let pitch: CGFloat = 116, topPad: CGFloat = PeckFinale.topPad, bottomPad: CGFloat = 130
    let width: CGFloat = 430
    let scale: CGFloat = 3
    var log: [String] = []
    for count in [10, 20, 30] {
        let height = topPad + CGFloat(count - 1) * pitch + bottomPad
        let world = PeckWorldCanvas(height: height, levelCount: count, pitch: pitch, bottomPad: bottomPad, t: 0)
            .frame(width: width, height: height)
        let renderer = ImageRenderer(content: world)
        var image: CGImage?
        renderer.render(rasterizationScale: scale) { size, draw in
            let w = Int((size.width * scale).rounded()), h = Int((size.height * scale).rounded())
            guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                                      space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
                log.append("\(count): no bitmap context for \(w)x\(h)"); return
            }
            ctx.scaleBy(x: scale, y: scale)
            draw(ctx)
            image = ctx.makeImage()
        }
        let url = URL(fileURLWithPath: dir).appendingPathComponent("peck-world-\(count).png")
        guard let image, let data = UIImage(cgImage: image).pngData() else {
            log.append("\(count): render produced no image"); continue
        }
        do {
            try data.write(to: url)
            log.append("\(count): wrote \(url.lastPathComponent) \(image.width)x\(image.height)")
        } catch {
            log.append("\(count): write failed \(error)")
        }
    }
    try? log.joined(separator: "\n").appending("\n")
        .write(to: URL(fileURLWithPath: dir).appendingPathComponent("peck-world.log"), atomically: true, encoding: .utf8)
}
#endif
