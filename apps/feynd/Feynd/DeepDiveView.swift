import SwiftUI
import UIKit
import os

/// Deep Dive, full screen: the Canvas fills the display edge to edge, a
/// press anywhere sinks the dodo (and steers it toward the finger), the
/// title and end cards are SwiftUI on top. Talks to the rest stop's board
/// through the same route as Peck or Perish (the "year" column holds the
/// dive score for these levels).
struct DeepDiveView: View {
    let level: Int
    let onClose: () -> Void

    @State private var game = DeepDiveGame()
    /// What SwiftUI reacts to; the game itself is not observable (see
    /// DeepDiveGame). `phase` arrives through `onPhase`, off the render pass.
    @State private var phase: DDPhase = .title
    @State private var board: PeckGameBoard?
    @State private var boardError: String?
    @State private var boardPosting = false
    @FocusState private var focused: Bool
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        ZStack {
            Color(hex: 0x2A1E45).ignoresSafeArea()
            // 60 fps is plenty; the ProMotion simulators would ask for 120.
            TimelineView(.animation(minimumInterval: 1.0 / 60.0)) { timeline in
                Canvas { ctx, size in
                    #if DEBUG
                    let t0 = CFAbsoluteTimeGetCurrent()
                    defer { Self.profileFrame(t0) }
                    #endif
                    if game.W != size.width { game.W = size.width }
                    if game.H != size.height { game.H = size.height }
                    game.advance(to: timeline.date)
                    var c = ctx
                    DeepDiveArt.draw(game, in: &c)
                }
            }
            .ignoresSafeArea()
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0, coordinateSpace: .global)
                    .onChanged { v in
                        if game.held { game.move(x: v.location.x) } else { game.press(x: v.location.x) }
                    }
                    .onEnded { _ in game.release() }
            )
            // The safe areas, read where they are honoured.
            GeometryReader { geo in
                Color.clear
                    .onAppear {
                        game.safeTop = geo.safeAreaInsets.top
                        game.safeBottom = geo.safeAreaInsets.bottom
                    }
                    .onChange(of: geo.safeAreaInsets.top) { _, n in game.safeTop = n }
            }
            .allowsHitTesting(false)

            if phase == .title { card { titleCard } }
            if phase == .end { card { endCard } }

            // Leave mid-dive: a quiet key in the bottom-right corner, where
            // Peck or Perish keeps its keys (the HUD owns the top). The cards
            // have their own way out.
            if phase != .title && phase != .end {
                VStack {
                    Spacer()
                    HStack {
                        Spacer()
                        Button {
                            onClose()
                        } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(.white.opacity(0.9))
                                .frame(width: 36, height: 36)
                                .background(.white.opacity(0.16), in: Circle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Leave Deep Dive")
                        .padding(.trailing, 16)
                    }
                    .padding(.bottom, 12)
                }
            }
        }
        .statusBarHidden()
        .persistentSystemOverlays(.hidden)
        .focusable()
        .focusEffectDisabled()
        .focused($focused)
        .onKeyPress(.escape) { onClose(); return .handled }
        .onKeyPress(.space, phases: [.down, .up]) { press in
            if press.phase == .down {
                if phase == .title || phase == .end { game.start() } else { game.press(x: nil) }
            } else {
                game.release()
            }
            return .handled
        }
        .onAppear {
            focused = true
            wire()
            applyDebugHooks()
        }
        .onDisappear { DeepDiveAudio.shared.stop() }
        .task { await loadBoard() }
    }

    // MARK: cards

    private func card<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        ZStack {
            Color(hex: 0x0A1E3C).opacity(0.3).ignoresSafeArea()
            VStack(spacing: 0) { content() }
                .padding(.horizontal, 24)
                .padding(.top, 26)
                .padding(.bottom, 22)
                .frame(maxWidth: 320)
                .background(Color(hex: 0xF8F2F8), in: RoundedRectangle(cornerRadius: 28, style: .continuous))
                .shadow(color: Color(hex: 0x051432).opacity(0.5), radius: 25, y: 18)
                .padding(20)
        }
        .transition(.opacity)
    }

    private var kicker: some View {
        Text("PECK · JELLY LAGOON · LEVEL \(level)")
            .font(.custom("Fredoka", size: 12).weight(.bold))
            .tracking(1.5)
            .foregroundStyle(Color(hex: 0x2689BD))
    }

    private var titleCard: some View {
        VStack(spacing: 10) {
            kicker
            Text("Deep Dive")
                .font(.custom("Fredoka", size: 34).weight(.bold))
                .foregroundStyle(Color(hex: 0x2D2537))
            Text("Hold to sink, let go to float. Pearls are +3, jellies cost air, the glowing pockets give it back. How deep can you go on one breath?")
                .font(.system(size: 15))
                .lineSpacing(3)
                .foregroundStyle(Color(hex: 0x6A5F73))
                .multilineTextAlignment(.center)
                .padding(.bottom, 8)
            if game.best > 0 {
                Text("Best on this phone · \(game.best)")
                    .font(.custom("Fredoka", size: 12).weight(.semibold))
                    .foregroundStyle(Color(hex: 0x9A8FA4))
            }
            jellyKey("Dive") { game.start() }
            Button("Not now") { onClose() }
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Color(hex: 0x9A8FA4))
                .padding(.top, 8)
        }
    }

    private var endCard: some View {
        VStack(spacing: 10) {
            kicker
            Text("Surfaced")
                .font(.custom("Fredoka", size: 34).weight(.bold))
                .foregroundStyle(Color(hex: 0x2D2537))
            Text("\(game.score)")
                .font(.custom("Fredoka", size: 56).weight(.bold))
                .foregroundStyle(Color(hex: 0x2689BD))
                .padding(.top, -6)
            HStack(spacing: 18) {
                stat("DEPTH", "\(game.endDepth) m")
                stat("PEARLS", "\(game.pearlCount)")
                stat("BEST", "\(max(game.best, board?.best ?? 0))")
            }
            Text(game.endNote)
                .font(.system(size: 14))
                .foregroundStyle(Color(hex: 0x6A5F73))
                .multilineTextAlignment(.center)
            boardView
            jellyKey("Dive again") { game.start() }
            Button("Back to the map") { onClose() }
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Color(hex: 0x9A8FA4))
                .padding(.top, 8)
        }
    }

    private func stat(_ label: String, _ value: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.custom("Fredoka", size: 20).weight(.bold))
                .foregroundStyle(Color(hex: 0x2D2537))
            Text(label)
                .font(.custom("Fredoka", size: 10).weight(.bold))
                .tracking(1)
                .foregroundStyle(Color(hex: 0x9A8FA4))
        }
        .frame(minWidth: 64)
    }

    /// The rest stop's board: top rows, the caller's row marked.
    @ViewBuilder
    private var boardView: some View {
        if let board, !board.board.isEmpty {
            VStack(spacing: 4) {
                ForEach(board.board.prefix(5), id: \.rank) { row in
                    HStack {
                        Text("\(row.rank)")
                            .font(.custom("Fredoka", size: 12).weight(.bold))
                            .foregroundStyle(Color(hex: 0x9A8FA4))
                            .frame(width: 22, alignment: .leading)
                        Text(row.handle)
                            .font(.system(size: 13, weight: row.me ? .bold : .regular))
                            .foregroundStyle(Color(hex: row.me ? 0x2689BD : 0x2D2537))
                            .lineLimit(1)
                        Spacer()
                        Text("\(row.year)")
                            .font(.custom("Fredoka", size: 13).weight(.bold))
                            .foregroundStyle(Color(hex: row.me ? 0x2689BD : 0x2D2537))
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(row.me ? Color(hex: 0xDCF6FF) : .clear, in: RoundedRectangle(cornerRadius: 8))
                }
                if board.newBest == true {
                    Text("A new best on the board.")
                        .font(.custom("Fredoka", size: 11).weight(.semibold))
                        .foregroundStyle(Color(hex: 0x2689BD))
                }
            }
            .padding(.vertical, 6)
        } else if boardPosting {
            ProgressView().tint(Color(hex: 0x2689BD)).padding(.vertical, 8)
        } else if let err = boardError {
            Text(err)
                .font(.system(size: 12))
                .foregroundStyle(Color(hex: 0x9A8FA4))
                .padding(.vertical, 4)
        }
    }

    private func jellyKey(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.custom("Fredoka", size: 17).weight(.bold))
                .foregroundStyle(.white)
                .padding(.horizontal, 30)
                .frame(height: 50)
                .background(
                    ZStack {
                        Capsule().fill(Color(hex: 0x2689BD)).offset(y: 5)
                        Capsule().fill(LinearGradient(colors: [Color(hex: 0x9FE0F7), Color(hex: 0x5EC6EC)], startPoint: .top, endPoint: .bottom))
                        Capsule().fill(.white.opacity(0.35)).frame(height: 8).padding(.horizontal, 16).offset(y: -16)
                    }
                )
        }
        .buttonStyle(JellyPressStyle())
        .padding(.top, 6)
    }

    #if DEBUG
    /// `log show --predicate 'subsystem == "dodo.deepdive"'`: one line per
    /// 60 frames with the mean draw time, to catch a frame that got heavy.
    nonisolated(unsafe) private static var frames = 0
    nonisolated(unsafe) private static var drawTime: CFAbsoluteTime = 0
    nonisolated(unsafe) private static var lastReport = CFAbsoluteTimeGetCurrent()
    private static let log = Logger(subsystem: "dodo.deepdive", category: "frames")
    private static func profileFrame(_ t0: CFAbsoluteTime) {
        let now = CFAbsoluteTimeGetCurrent()
        drawTime += now - t0
        frames += 1
        if frames % 60 == 0 {
            let wall = now - lastReport
            log.info("60 frames: draw \(drawTime / 60 * 1000, format: .fixed(precision: 1)) ms mean, wall \(wall, format: .fixed(precision: 2)) s (\(60 / wall, format: .fixed(precision: 0)) fps)")
            drawTime = 0
            lastReport = now
        }
    }
    #endif

    // MARK: wiring

    private func wire() {
        let audio = DeepDiveAudio.shared
        game.muted = audio.muted
        audio.start()
        game.onPhase = { p in
            // Phase changes happen inside the Canvas draw; SwiftUI state
            // must change outside the render pass.
            DispatchQueue.main.async { withAnimation(.easeOut(duration: 0.3)) { phase = p } }
        }
        game.onSound = { audio.play($0) }
        game.onDepth = { audio.setDepth(Double($0)) }
        game.onHaptic = { Self.haptic($0) }
        game.onClose = { onClose() }
        game.onFinish = { score in Task { await submit(score) } }
    }

    private func loadBoard() async {
        if mockBoard() { return }
        do {
            board = try await F2API.shared.peckGameBoard(level: level)
        } catch {
            boardError = "The board is offline."
        }
    }

    private func submit(_ score: Int) async {
        boardPosting = true
        defer { boardPosting = false }
        if mockBoard(score: score) { return }
        do {
            board = try await F2API.shared.submitDeepDive(level: level, score: score)
            boardError = nil
        } catch F2APIError.http(403, let msg) {
            boardError = msg
        } catch {
            boardError = "Could not reach the board."
        }
    }

    private static let light = UIImpactFeedbackGenerator(style: .light)
    private static let medium = UIImpactFeedbackGenerator(style: .medium)
    private static let note = UINotificationFeedbackGenerator()

    private static func haptic(_ h: DDHaptic) {
        switch h {
        case .pearl: light.impactOccurred()
        case .sting: medium.impactOccurred()
        case .air: light.impactOccurred()
        case .surface: note.notificationOccurred(.success)
        }
    }

    // MARK: headless hooks (simulator + Mac debug only)

    /// `-PeckGameMockBoard 1` fills the board with made-up divers.
    private func mockBoard(score: Int? = nil) -> Bool {
        #if targetEnvironment(simulator) || (targetEnvironment(macCatalyst) && DEBUG)
        guard UserDefaults.standard.bool(forKey: "PeckGameMockBoard") else { return false }
        var rows: [(String, Int, Bool)] = [("kira", 88, false), ("tomasz", 71, false), ("bart", 64, false), ("guest 3b7a", 37, false)]
        if let score { rows.append(("you", score, true)) }
        rows.sort { $0.1 > $1.1 }
        let mock = rows.enumerated().map { PeckGameBoard.Row(rank: $0.offset + 1, handle: $0.element.0, year: $0.element.1, me: $0.element.2) }
        board = PeckGameBoard(level: level, best: score, plays: 1, board: mock, players: mock.count, newBest: score != nil)
        return true
        #else
        return false
        #endif
    }

    /// `-DeepDiveScene dive|deep|end`: start a dive holding down; `deep`
    /// warps to 61 m first, `end` runs the air out so the end card follows.
    private func applyDebugHooks() {
        #if targetEnvironment(simulator) || (targetEnvironment(macCatalyst) && DEBUG)
        guard let scene = UserDefaults.standard.string(forKey: "DeepDiveScene") else { return }
        UserDefaults.standard.removeObject(forKey: "DeepDiveScene")
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
            game.start()
            switch scene {
            case "deep": game.warp(to: 61); game.press(x: game.W * 0.6)
            case "end": game.warp(to: 24); game.drainAir(); game.press(x: game.W * 0.5)
            default: game.press(x: game.W * 0.5)
            }
        }
        #endif
    }
}
