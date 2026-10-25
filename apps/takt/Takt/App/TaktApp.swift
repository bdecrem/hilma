import SwiftUI

@main
struct TaktApp: App {
    @AppStorage("theme") private var theme: Theme = .dark
    @State private var player: Player?

    init() {
        #if DEBUG
        DebugHooks.renderIfRequested()
        #endif
        _player = State(initialValue: Self.makePlayer())
    }

    /// The band is already playing when the lesson opens (principle 1). Launch arguments:
    /// `-Tempo <bpm>`, `-AutoPlay 0`, `-Silent 1` (speakers off, everything else runs).
    private static func makePlayer() -> Player? {
        #if DEBUG
        if UserDefaults.standard.string(forKey: "PreviewFrame") != nil { return nil }
        #endif
        let d = UserDefaults.standard
        let tempo = d.double(forKey: "Tempo") > 0 ? d.double(forKey: "Tempo") : 70
        let audio = AudioEngine(band: .bundled("band-blues-C"), tempo: tempo)
        // Keys and horns are locked until the lesson unlocks them (M3).
        audio.send(.mute(.keys, true))
        audio.send(.mute(.horns, true))
        audio.start(silent: d.bool(forKey: "Silent"))
        if d.object(forKey: "AutoPlay") == nil || d.bool(forKey: "AutoPlay") {
            audio.send(.play)
        }
        let player = Player(audio: audio)
        #if DEBUG
        DebugHooks.recordIfRequested(audio)
        DebugHooks.pressIfRequested(player)
        #endif
        return player
    }

    var body: some Scene {
        WindowGroup {
            Group {
                if let player {
                    LiveLessonScreen(player: player)
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
            CommandGroup(after: .toolbar) {
                Toggle("Paper Theme", isOn: Binding(
                    get: { theme == .paper },
                    set: { theme = $0 ? .paper : .dark }
                ))
                .keyboardShortcut("l", modifiers: [.command, .shift])
            }
        }
    }
}

/// The lesson screen driven by the Player, with every input wired to it.
struct LiveLessonScreen: View {
    let player: Player

    var body: some View {
        LessonScreen(state: player.lessonState(from: .preview))
            .environment(\.lessonControls, LessonControls(
                togglePlay: player.togglePlay,
                stop: player.stop,
                nudgeTempo: player.nudgeTempo,
                toggleMute: { i in player.toggleMute([Channel.drums, .bass, .keys, .horns][i]) },
                press: { player.press($0) },
                release: player.release
            ))
            .background(KeyCatcher(
                onNote: { player.key($0, down: $1) },
                onOctave: player.shiftOctave,
                onSpace: player.togglePlay,
                onTempo: player.nudgeTempo
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
