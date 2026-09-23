import SwiftUI
import UIKit

final class PGRenderCache {
    var scale: CGFloat = 0
    var assets: PGAssets?
    var background: Image?
}

/// Which rest stop's game to open (Peck levels 5, 15, 25, …).
struct PeckGameStop: Identifiable {
    let level: Int
    var id: Int { level }
}

/// Peck or Perish, full screen. The game is always laid out on a 400 × 720
/// canvas. On iPhone it scales to fit the screen; on iPad it scales up to
/// 1.4×; on the Mac it holds a fixed phone-sized frame (1.15×, shrinking only
/// when the window is too short) centered in the window.
struct PeckGameView: View {
    let level: Int
    let onClose: () -> Void

    @State private var game: PeckGame
    /// Hatch tiles + the rendered plate. A reference, because the canvas
    /// closure runs outside body and never sees @State values set later.
    @State private var art = PGRenderCache()
    @FocusState private var focused: Bool
    @Environment(\.displayScale) private var displayScale

    init(level: Int, onClose: @escaping () -> Void) {
        self.level = level
        self.onClose = onClose
        _game = State(initialValue: PeckGame(level: level))
    }

    static func fitScale(_ size: CGSize) -> CGFloat {
        let fit = min(size.width / PG.size.width, size.height / PG.size.height)
        #if targetEnvironment(macCatalyst)
        return min(fit, 1.15)
        #else
        if UIDevice.current.userInterfaceIdiom == .pad { return min(fit, 1.4) }
        return fit
        #endif
    }

    var body: some View {
        GeometryReader { geo in
            let s = Self.fitScale(geo.size)
            ZStack {
                PGC.frame
                TimelineView(.animation) { timeline in
                    Canvas { ctx, _ in
                        game.advance(to: timeline.date)
                        if let assets = art.assets {
                            PeckGameArt.draw(game, in: ctx, scale: s, assets: assets, background: art.background)
                        }
                    }
                }
                .frame(width: PG.size.width * s, height: PG.size.height * s)
                .clipShape(RoundedRectangle(cornerRadius: 6 * s))
                .shadow(color: .black.opacity(0.5), radius: 24, y: 10)
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { v in
                            guard !game.touching else { return }
                            game.touching = true
                            game.tap(at: CGPoint(x: v.startLocation.x / s, y: v.startLocation.y / s))
                        }
                        .onEnded { _ in game.touching = false }
                )
                .onAppear { prepare(scale: s) }
                .onChange(of: s) { _, n in prepare(scale: n) }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .background(PGC.frame.ignoresSafeArea())
        .statusBarHidden()
        .persistentSystemOverlays(.hidden)
        .focusable()
        .focusEffectDisabled()
        .focused($focused)
        .onKeyPress(.escape) { onClose(); return .handled }
        .onKeyPress(.space) { game.keyStart(); return .handled }
        .onKeyPress(.return) { game.keyStart(); return .handled }
        .onAppear {
            focused = true
            wire()
            applyDebugHooks()
        }
        .onDisappear { PeckGameAudio.shared.stop() }
        .task { await loadBoard() }
    }

    /// Hatch tiles and the printed plate, rendered once per scale.
    private func prepare(scale s: CGFloat) {
        guard s > 0, abs(s - art.scale) > 0.001 else { return }
        art.scale = s
        let a = PGAssets(pxPerUnit: s * displayScale)
        art.assets = a
        let plate = Canvas { ctx, _ in
            var c = ctx
            c.scaleBy(x: s, y: s)
            PeckGameArt.drawBackground(PGInk(c: c, a: a))
        }
        .frame(width: PG.size.width * s, height: PG.size.height * s)
        let r = ImageRenderer(content: plate)
        r.scale = displayScale
        art.background = r.cgImage.map { Image(decorative: $0, scale: displayScale) }
    }

    private func wire() {
        let audio = PeckGameAudio.shared
        game.muted = audio.muted
        audio.start()
        game.onSound = { audio.play($0) }
        game.onMusic = { on, bpm in audio.setMusic(on, bpm: bpm) }
        game.onMute = { audio.muted = $0 }
        game.onHaptic = { Self.haptic($0) }
        game.onClose = { onClose() }
        game.onFinish = { year in Task { await submit(year) } }
    }

    private func loadBoard() async {
        if mockBoard() { return }
        do {
            game.board = try await F2API.shared.peckGameBoard(level: level)
        } catch {
            game.boardError = "The board is offline."
        }
    }

    private func submit(_ year: Int) async {
        game.boardPosting = true
        defer { game.boardPosting = false }
        if mockBoard(year: year) { return }
        do {
            game.board = try await F2API.shared.submitPeckGame(level: level, year: year)
            game.boardError = nil
        } catch F2APIError.http(403, let msg) {
            game.boardError = msg
        } catch {
            game.boardError = "Could not reach the board."
        }
    }

    private static let light = UIImpactFeedbackGenerator(style: .light)
    private static let medium = UIImpactFeedbackGenerator(style: .medium)
    private static let heavy = UIImpactFeedbackGenerator(style: .heavy)
    private static let note = UINotificationFeedbackGenerator()

    private static func haptic(_ h: PGHaptic) {
        switch h {
        case .peck: light.impactOccurred()
        case .bite: medium.impactOccurred()
        case .oops: note.notificationOccurred(.warning)
        case .extinct: heavy.impactOccurred()
        case .history: note.notificationOccurred(.success)
        }
    }

    // MARK: headless hooks (simulator + Mac debug only)

    /// `-PeckGameMockBoard 1` fills the board with made-up players so the
    /// screenshots show it without a server round.
    private func mockBoard(year: Int? = nil) -> Bool {
        #if targetEnvironment(simulator) || (targetEnvironment(macCatalyst) && DEBUG)
        guard UserDefaults.standard.bool(forKey: "PeckGameMockBoard") else { return false }
        var rows: [(String, Int, Bool)] = [("kira", 1694, false), ("tomasz", 1681, false), ("bart", 1677, false), ("guest 3b7a", 1659, false)]
        if let year { rows.append(("you", year, true)) }
        rows.sort { $0.1 > $1.1 }
        let board = rows.enumerated().map { PeckGameBoard.Row(rank: $0.offset + 1, handle: $0.element.0, year: $0.element.1, me: $0.element.2) }
        game.board = PeckGameBoard(level: level, best: year, plays: 1, board: board, players: board.count, newBest: year != nil)
        return true
        #else
        return false
        #endif
    }

    /// `-PeckGameScene play|ship|over` starts a round on its own; `play` and
    /// `ship` let a bot tap, `over` runs straight into extinction.
    private func applyDebugHooks() {
        #if targetEnvironment(simulator) || (targetEnvironment(macCatalyst) && DEBUG)
        guard let scene = UserDefaults.standard.string(forKey: "PeckGameScene") else { return }
        switch scene {
        case "play":
            game.skipTo = 44; game.autoplay = true; game.start()
        case "ship":
            game.skipTo = 63; game.autoplay = true; game.start()
        case "over":
            game.skipTo = 70; game.start(); game.P = 99.8
        default: break
        }
        #endif
    }
}
