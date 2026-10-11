import SwiftUI

@main
struct DollyApp: App {
    @State private var state = AppState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(state)
                .task { await state.boot() }
                .onOpenURL { url in
                    // dolly://today, and https://ola.cx/dolly/today as a universal link.
                    let path = url.scheme == "dolly" ? "/\(url.host ?? "")\(url.path)" : url.path
                    if path.hasPrefix("/today") || path.hasPrefix("/dolly/today") {
                        Task {
                            await state.refresh()
                            state.openToday()
                        }
                    }
                }
        }
    }
}

struct RootView: View {
    @Environment(AppState.self) private var state

    var body: some View {
        @Bindable var state = state
        ZStack {
            Skin.current.background.ignoresSafeArea()
            switch state.phase {
            case .loading:
                Mascot(size: 120, mood: .idle)
            case .signedOut:
                OnboardingView()
            case .signedIn:
                MapView()
                    .fullScreenCover(item: Binding(get: { state.flow }, set: { state.flow = $0 })) { step in
                        FlowView(start: step, day: state.day)
                            .environment(state)
                    }
                    .sheet(isPresented: $state.showSettings) {
                        SettingsView()
                            .environment(state)
                    }
                    .sheet(isPresented: $state.showObjectives) {
                        ObjectivesSheet()
                            .environment(state)
                    }
                    .sheet(isPresented: Binding(get: { state.showLevel != nil }, set: { if !$0 { state.showLevel = nil } })) {
                        LevelSheet(level: state.showLevel ?? 1)
                            .environment(state)
                    }
                    .sheet(isPresented: $state.showYou) {
                        YouSheet()
                            .environment(state)
                    }
            }
        }
    }
}

extension FlowStep: Identifiable {
    var id: String { rawValue }
}

/// The full-screen day: talk → three things → cards → done, each handing
/// to the next inside one cover so the map never flashes between them. The
/// star round runs the same three screens after the day; "Talk more" is a
/// call with nothing after it.
struct FlowView: View {
    @Environment(AppState.self) private var state
    @State private var step: FlowStep
    /// A star round (started here, or resumed mid-way from the map).
    @State private var starFlow: Bool
    @State private var moreFlow: Bool
    /// A completed level's refresher (started here, or its cards resumed from the map).
    @State private var refreshFlow: Bool
    /// A flash set: ten cards, then the score.
    @State private var flashFlow: Bool

    init(start: FlowStep, day: DayView?) {
        _step = State(initialValue: start)
        _starFlow = State(initialValue: start == .star || (day?.dayState.inStarRound ?? false))
        _moreFlow = State(initialValue: start == .more)
        _refreshFlow = State(initialValue: start == .refresh || start == .refreshDone || (day?.dayState.inRefresher ?? false))
        _flashFlow = State(initialValue: start == .flash || start == .flashDone)
    }

    var body: some View {
        ZStack {
            switch step {
            case .talk, .more:
                TalkView(mode: step.rawValue, onDone: { day in advance(after: day) }, onLeave: { state.flow = nil })
                    .id(step)
                    .transition(.opacity)
            case .star:
                StarScriptView(mode: "star", onDone: { day in advance(after: day) }, onLeave: { state.flow = nil })
                    .transition(.opacity)
            case .refresh:
                StarScriptView(mode: "refresh", level: state.refreshLevel, onDone: { day in advance(after: day) }, onLeave: { state.flow = nil })
                    .id("refresh-\(state.refreshLevel ?? 0)")
                    .transition(.opacity)
            case .refreshDone:
                RefreshDoneView(onDone: { state.flow = nil }, onAgain: { startRefresh() })
                    .transition(.opacity)
            case .things:
                ThingsView(onDone: { day in advance(after: day) }, onLeave: { state.flow = nil })
                    .transition(.opacity)
            case .cards:
                CardsView(source: .day, onDone: { if let day = state.day { advance(after: day) } }, onLeave: { state.flow = nil })
                    .transition(.opacity)
            case .flash:
                CardsView(source: .flash, onDone: { step = .flashDone }, onLeave: { state.flow = nil })
                    .id("flash-\(flashDeals)")
                    .transition(.opacity)
            case .flashDone:
                FlashDoneView(onDone: { state.flow = nil }, onAgain: { startFlash() })
                    .transition(.opacity)
            case .done:
                DoneView(star: starFlow, onDone: { state.flow = nil }, onMore: { startMore() }, onStar: { startStar() })
                    .transition(.opacity)
            case .moreDone:
                MoreDoneView(onDone: { state.flow = nil }, onMore: { startMore() })
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.35), value: step)
    }

    /// The server's day says what comes next.
    private func advance(after day: DayView) {
        state.apply(day)
        switch day.dayState {
        case .morning: state.flow = nil
        case .afterTalk, .starAfterTalk: step = .things
        case .afterThings, .paused, .starAfterThings, .starPaused, .refreshCards, .refreshPaused: step = .cards
        case .done:
            if refreshFlow {
                // The refresher's cards are done (its verdict), or its call went nowhere.
                if day.refresh?.state == "done" { step = .refreshDone } else { state.flow = nil }
            } else if moreFlow {
                // The extra call's three things, when it produced any.
                if day.lastExtraThings.isEmpty { state.flow = nil } else { step = .moreDone }
            } else if starFlow, day.star?.state != "done" {
                // A star call where nothing was said: back to the map.
                state.flow = nil
            } else {
                step = .done
            }
        }
    }

    private func startMore() {
        moreFlow = true
        starFlow = false
        refreshFlow = false
        step = .more
    }

    private func startStar() {
        starFlow = true
        moreFlow = false
        refreshFlow = false
        step = .star
    }

    private func startRefresh() {
        refreshFlow = true
        starFlow = false
        moreFlow = false
        step = .refresh
    }

    @State private var flashDeals = 0

    private func startFlash() {
        flashFlow = true
        state.flash = nil
        flashDeals += 1
        step = .flash
    }
}
