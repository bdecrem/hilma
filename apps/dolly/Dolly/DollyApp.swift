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
                        FlowView(start: step)
                            .environment(state)
                    }
                    .sheet(isPresented: $state.showSettings) {
                        SettingsView()
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
/// to the next inside one cover so the map never flashes between them.
struct FlowView: View {
    @Environment(AppState.self) private var state
    @State private var step: FlowStep

    init(start: FlowStep) {
        _step = State(initialValue: start)
    }

    var body: some View {
        ZStack {
            switch step {
            case .talk:
                TalkView(onDone: { day in advance(after: day) }, onLeave: { state.flow = nil })
                    .transition(.opacity)
            case .things:
                ThingsView(onDone: { day in advance(after: day) }, onLeave: { state.flow = nil })
                    .transition(.opacity)
            case .cards:
                CardsView(onDone: { day in advance(after: day) }, onLeave: { state.flow = nil })
                    .transition(.opacity)
            case .done:
                DoneView(onDone: { state.flow = nil })
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
        case .afterTalk: step = .things
        case .afterThings, .paused: step = .cards
        case .done: step = .done
        }
    }
}
