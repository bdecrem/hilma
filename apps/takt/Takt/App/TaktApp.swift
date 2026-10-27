import SwiftUI

@main
struct TaktApp: App {
    @AppStorage("theme") private var theme: Theme = .dark
    @State private var app: AppModel

    init() {
        #if DEBUG
        DebugHooks.renderIfRequested()
        DebugHooks.lessonCheckIfRequested()
        #endif
        let progress = ProgressStore()
        let account = AccountStore(progress: progress)
        progress.onChange = { [weak account] in account?.progressChanged() }
        _app = State(initialValue: AppModel(player: Self.makePlayer(progress: progress), progress: progress, account: account))
        #if DEBUG
        if !UserDefaults.standard.bool(forKey: "Offline") {
            account.start()
        }
        #else
        account.start()
        #endif
    }

    /// The band is already playing when the app opens (principle 1), at step 1's tempo, under
    /// the menu and every screen. Launch arguments: `-Tempo <bpm>`, `-Paused 1` (band stopped),
    /// `-Silent 1` (speakers off, everything else runs); DEBUG: `-Route lesson|lessons|settings`,
    /// `-Step <n>` (start the lesson at step n, 1-based), `-Offline 1` (no account calls),
    /// `-Backend <url>`, `-ProgressFile <path>`, `-Autoplay <mode>` and the hooks in DebugHooks.
    private static func makePlayer(progress: ProgressStore) -> Player? {
        #if DEBUG
        if UserDefaults.standard.string(forKey: "PreviewFrame") != nil { return nil }
        #endif
        let d = UserDefaults.standard
        let lesson = Lesson.bundled("lesson-A1")
        let tempo = d.double(forKey: "Tempo") > 0 ? d.double(forKey: "Tempo") : Double(lesson.steps[0].tempo!)
        let audio = AudioEngine(band: .bundled(lesson.band), tempo: tempo)
        let player = Player(audio: audio, lesson: lesson, progress: progress)
        audio.start(silent: d.bool(forKey: "Silent"))
        // The band on the menu is a setting (Settings → Sound); a lesson always has it.
        if !d.bool(forKey: "Paused") && RootView.menuMusicOn { audio.send(.play) }
        #if DEBUG
        // `-Step`, `-Lesson` and `-StepComplete` are applied in AppModel.init, after `-Module`.
        DebugHooks.recordIfRequested(audio)
        DebugHooks.pressIfRequested(player)
        DebugHooks.calibrateIfRequested(player)
        DebugHooks.autoplayIfRequested(player)
        #endif
        return player
    }

    var body: some Scene {
        WindowGroup {
            Group {
                if let player = app.player {
                    RootView(app: app, player: player)
                } else {
                    LessonScreen(state: .launchFrame)
                }
            }
            .preferredColorScheme(theme.colorScheme)
            #if targetEnvironment(macCatalyst)
            .background(MacWindow())
            #endif
        }
        .commands {
            CommandGroup(replacing: .importExport) {
                Button("Export Loop…") { app.exporting = true }
                    .keyboardShortcut("e")
                    .disabled(app.route != .result)
            }
            CommandGroup(after: .toolbar) {
                Toggle("Paper Theme", isOn: Binding(
                    get: { theme == .paper },
                    set: { theme = $0 ? .paper : .dark }
                ))
                .keyboardShortcut("l", modifiers: [.command, .shift])
            }
            #if DEBUG
            if let player = app.player {
                CommandMenu("Debug") {
                    Picker("Autoplay", selection: Binding(get: { player.autoplayMode },
                                                          set: { player.autoplayMode = $0 })) {
                        Text("Off").tag(Autoplay.Mode?.none)
                        ForEach(Autoplay.Mode.allCases) { Text($0.title).tag(Optional($0)) }
                    }
                    Menu("Jump to Step") {
                        ForEach(Array(player.content.steps.enumerated()), id: \.offset) { i, step in
                            Button("\(i + 1) \(step.title)") {
                                player.restartLesson(at: i)
                                app.route = .lesson
                            }
                        }
                    }
                }
            }
            #endif
        }
    }
}

/// The screen for the route. The computer keyboard plays on every screen (the band is always
/// there to play along with); only the lesson scores it. Settings' level trims reach the band.
struct RootView: View {
    let app: AppModel
    let player: Player
    @AppStorage("bandLevel") private var bandLevel = 1.0
    @AppStorage("pianoLevel") private var pianoLevel = 1.0
    @AppStorage("menuMusic") private var menuMusic = true

    static var menuMusicOn: Bool {
        let d = UserDefaults.standard
        return d.object(forKey: "menuMusic") == nil || d.bool(forKey: "menuMusic")
    }

    var body: some View {
        Group {
            switch app.route {
            case .lessons:
                LessonsScreen(app: app)
            case .map:
                MapScreen(app: app)
            case .module:
                ModuleScreen(app: app, code: app.currentModule)
            case .earModule:
                EarModuleScreen(app: app)
            case .earGame:
                if let run = app.ear, let round = app.earRound {
                    EarGameScreen(app: app, kind: app.earKind, run: run, round: round)
                } else {
                    LessonsScreen(app: app)
                }
            case .quiz:
                if let quiz = app.quiz {
                    QuizScreen(app: app, session: quiz)
                } else {
                    LessonsScreen(app: app)
                }
            case .lesson:
                LiveLessonScreen(app: app, player: player)
            case .result:
                if let finish = player.finish {
                    ResultScreen(app: app, finish: finish)
                } else {
                    LessonsScreen(app: app)
                }
            case .settings:
                SettingsScreen(app: app)
            case .calibrate:
                CalibrationScreen(app: app, player: player)
            }
        }
        .background(KeyCatcher(
            onNote: { player.key($0, down: $1) },
            onOctave: player.shiftOctave,
            onSpace: player.togglePlay,
            onTempo: player.nudgeTempo,
            onEscape: { if app.route == .lesson { app.route = .lessons } }
        ))
        .onChange(of: player.finish) { _, f in if f != nil && app.route == .lesson { app.lessonFinished() } }
        .onChange(of: app.route, initial: true) { syncMenuMusic() }
        .onChange(of: menuMusic) { syncMenuMusic(toggled: true) }
        .onChange(of: bandLevel, initial: true) { sendTrim() }
        .onChange(of: pianoLevel) { sendTrim() }
    }

    /// With the menu music off the band plays only in a lesson: it starts when one opens and
    /// stops on the way back to the menu. Turning it on starts it on the menu; with it on, a band
    /// you paused stays paused.
    private func syncMenuMusic(toggled: Bool = false) {
        switch app.route {
        case .lessons, .map, .module, .earModule, .settings:
            if !menuMusic && player.playing { player.togglePlay() }
            if menuMusic && toggled && !player.playing { player.togglePlay() }
        case .lesson:
            if !menuMusic && !player.playing { player.togglePlay() }
        case .result, .calibrate, .quiz, .earGame:
            break  // their own: Play it back, the clicks, a quiet quiz
        }
    }

    private func sendTrim() {
        player.audio.send(.trim(band: Float(bandLevel), monitor: Float(pianoLevel)))
    }
}

/// The lesson screen driven by the Player, with every input wired to it.
struct LiveLessonScreen: View {
    let app: AppModel
    let player: Player

    var body: some View {
        LessonScreen(state: player.lessonState())
            .environment(\.lessonControls, LessonControls(
                togglePlay: player.togglePlay,
                stop: player.stop,
                nudgeTempo: player.nudgeTempo,
                toggleMute: { i in player.toggleMute(player.channels[i]) },
                press: { player.press($0) },
                release: player.release,
                continueCard: player.continueCard,
                beginStep: player.beginStep,
                nextStep: player.nextStep,
                back: { app.route = .module }
            ))
    }
}

#if targetEnvironment(macCatalyst)
/// Mac window chrome: the brief's 1100×720 minimum, no title text and no toolbar,
/// so the transport bar is the top of the window.
struct MacWindow: UIViewRepresentable {
    func makeUIView(context: Context) -> UIView { Probe() }
    func updateUIView(_ uiView: UIView, context: Context) {}

    final class Probe: UIView {
        override func didMoveToWindow() {
            super.didMoveToWindow()
            guard let scene = window?.windowScene else { return }
            scene.sizeRestrictions?.minimumSize = CGSize(width: 1100, height: 720)
            scene.titlebar?.titleVisibility = .hidden
            scene.titlebar?.toolbar = nil
        }
    }
}
#endif
