import SwiftUI
import SpriteKit

/// SwiftUI owns menus; SpriteKit owns gameplay. This is the seam.
struct GameView: View {
    let config: RunConfig
    @EnvironmentObject private var app: AppState
    @Environment(\.scenePhase) private var scenePhase
    @State private var scene: GameScene?

    var body: some View {
        Group {
            if let scene {
                SpriteView(scene: scene,
                           preferredFramesPerSecond: UIScreen.main.maximumFramesPerSecond)
                    .ignoresSafeArea()
            } else {
                Skin.forTrack(app.library.byId(config.trackId)?.skinRef ?? config.trackId)
                    .background.ui.ignoresSafeArea()
            }
        }
        .onAppear { buildSceneIfNeeded() }
        .onDisappear { scene?.abort() }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { scene?.pauseGame() }
        }
    }

    private func buildSceneIfNeeded() {
        guard scene == nil, let track = app.library.byId(config.trackId) else { return }
        let chart = ChartGenerator.generate(track: track, seed: config.seed)
        let finish = app.finishRun
        let exit: () -> Void = { [weak app] in app?.route = .setSelect }
        scene = GameScene(size: UIScreen.main.bounds.size,
                          track: track,
                          chart: chart,
                          skin: Skin.forTrack(track.skinRef),
                          config: config,
                          settings: app.runSettings,
                          haptics: app.haptics,
                          onFinish: { result in finish(result) },
                          onExit: exit)
    }
}
