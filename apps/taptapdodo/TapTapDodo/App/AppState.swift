import SwiftUI
import Combine

enum Route: Equatable {
    case title
    case setSelect
    case game(RunConfig)
    case results(RunConfig)
}

/// Nav, settings, unlocks. Settings persist through UserDefaults; scores
/// through ScoreStore.
@MainActor
final class AppState: ObservableObject {
    @Published var route: Route = .title
    @Published var selectedSetIndex = 0
    @Published var lastResult: RunResult?

    let store = ScoreStore()
    let haptics = Haptics()
    let library = TrackLibrary()

    // MARK: Settings

    @Published var calibration: Double {          // seconds, clamped ±0.12
        didSet { UserDefaults.standard.set(calibration, forKey: "ttd.calibration") }
    }
    @Published var noteSpeed: Double {            // travel-time scale 0.85...1.15
        didSet { UserDefaults.standard.set(noteSpeed, forKey: "ttd.noteSpeed") }
    }
    @Published var hapticsOn: Bool {
        didSet { UserDefaults.standard.set(hapticsOn, forKey: "ttd.haptics") }
    }
    @Published var kickHapticsOn: Bool {
        didSet { UserDefaults.standard.set(kickHapticsOn, forKey: "ttd.kickHaptics") }
    }

    private var cancellables: Set<AnyCancellable> = []

    init() {
        let d = UserDefaults.standard
        calibration = d.object(forKey: "ttd.calibration") as? Double ?? 0
        noteSpeed = d.object(forKey: "ttd.noteSpeed") as? Double ?? 1.0
        hapticsOn = d.object(forKey: "ttd.haptics") as? Bool ?? true
        kickHapticsOn = d.object(forKey: "ttd.kickHaptics") as? Bool ?? true

        // Views observe AppState; surface the nested library's changes so
        // store cards flip from "download" to playable the moment a pack lands.
        library.objectWillChange
            .sink { [weak self] _ in self?.objectWillChange.send() }
            .store(in: &cancellables)
    }

    var runSettings: RunSettings {
        RunSettings(travelScale: noteSpeed, calibration: calibration,
                    hapticsOn: hapticsOn, kickHapticsOn: kickHapticsOn)
    }

    var gabberUnlocked: Bool { store.hasSRank }

    // MARK: Flow

    func startRun(trackId: String, seed: UInt64? = nil, isDaily: Bool = false) {
        guard library.byId(trackId) != nil else { return }
        let config = RunConfig(trackId: trackId,
                               seed: seed ?? UInt64.random(in: 1..<UInt64.max),
                               isDaily: isDaily)
        route = .game(config)
    }

    func startDaily() {
        startRun(trackId: ScoreStore.dailyTrackId(), seed: ScoreStore.dailySeed(), isDaily: true)
    }

    func finishRun(_ result: RunResult) {
        var final = result
        final.isNewBest = store.record(result)
        lastResult = final
        route = .results(result.config)
    }

    func handleDeepLink(_ url: URL) {
        // taptapdodo://play?track=ttd02&seed=12345
        guard url.scheme == "taptapdodo",
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              (url.host == "play" || components.path.contains("play")) else { return }
        let items = components.queryItems ?? []
        guard let trackId = items.first(where: { $0.name == "track" })?.value else { return }
        let seedString = items.first(where: { $0.name == "seed" })?.value ?? ""
        let seed = UInt64(seedString) ?? UInt64(seedString, radix: 16)
        // A gabber link doesn't bypass the unlock.
        if trackId == TrackDef.gabber.id && !gabberUnlocked { return }
        if library.byId(trackId) != nil {
            startRun(trackId: trackId, seed: seed)
            return
        }
        // Not local: if the store has it, download first, then play. This is
        // both the deep-link UX and the headless test path for online packs.
        Task { @MainActor [weak self] in
            guard let self else { return }
            if await self.library.ensurePlayable(trackId) {
                self.startRun(trackId: trackId, seed: seed)
            }
        }
    }
}
