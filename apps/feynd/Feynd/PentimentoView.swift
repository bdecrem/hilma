import SwiftUI
import AVFoundation

/// Pentimento: the payoff for clearing Peck level 10. A 57-second film,
/// painted and scored in code (apps/pentimento, rendered with
/// `--variant dodo` for its "Level 10 cleared" card), bundled as a 720p MP4
/// so it plays offline. One canvas painted four times over a dodo, then an
/// X-ray: the dodo is still there.
///
/// Plays full screen with its score, ✕ to skip at any point, closes itself a
/// moment after the last frame (or on a tap once it has ended).
struct PentimentoFilm: Identifiable {
    let id = UUID()
    /// First clear: the region transition waits for the film to close.
    let firstClear: Bool
}

struct PentimentoView: View {
    let onClose: () -> Void

    @State private var player: AVPlayer? = nil
    @State private var ended = false
    @State private var closed = false
    @State private var savedCategory: AVAudioSession.Category? = nil
    @State private var savedOptions: AVAudioSession.CategoryOptions = []

    var body: some View {
        ZStack {
            Color(red: 0.055, green: 0.043, blue: 0.035).ignoresSafeArea()
            if let player {
                FilmLayer(player: player).ignoresSafeArea()
            }
            if ended {
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture { close() }
            }
            VStack {
                HStack {
                    Spacer()
                    Button { close() } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.85))
                            .frame(width: 36, height: 36)
                            .background(.black.opacity(0.35), in: Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Close the film")
                    .padding(.trailing, 16)
                    .padding(.top, 8)
                }
                Spacer()
            }
        }
        .statusBarHidden()
        .onAppear(perform: start)
        .onDisappear(perform: stop)
        .onReceive(NotificationCenter.default.publisher(for: .AVPlayerItemDidPlayToEndTime)) { note in
            guard let item = note.object as? AVPlayerItem, item === player?.currentItem else { return }
            ended = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) { close() }
        }
    }

    private func start() {
        guard player == nil, let url = Bundle.main.url(forResource: "pentimento", withExtension: "mp4") else { return }
        // The film has a score: play it through the silent switch. A live
        // voice session owns .playAndRecord; never switch it out from under it.
        let session = AVAudioSession.sharedInstance()
        if session.category != .playAndRecord {
            savedCategory = session.category
            savedOptions = session.categoryOptions
            try? session.setCategory(.playback, mode: .moviePlayback)
            try? session.setActive(true)
        }
        let p = AVPlayer(url: url)
        p.actionAtItemEnd = .pause
        player = p
        p.play()
    }

    private func stop() {
        player?.pause()
        if let cat = savedCategory {
            try? AVAudioSession.sharedInstance().setCategory(cat, options: savedOptions)
            savedCategory = nil
        }
    }

    private func close() {
        guard !closed else { return }
        closed = true
        stop()
        onClose()
    }
}

/// The film, letterboxed: it is 9:16 and the phone is taller, and the film's
/// own studio dark matches the bars.
private struct FilmLayer: UIViewRepresentable {
    let player: AVPlayer

    func makeUIView(context: Context) -> PlayerView {
        let v = PlayerView()
        v.playerLayer.player = player
        v.playerLayer.videoGravity = .resizeAspect
        v.backgroundColor = .clear
        return v
    }

    func updateUIView(_ uiView: PlayerView, context: Context) {
        uiView.playerLayer.player = player
    }

    final class PlayerView: UIView {
        override class var layerClass: AnyClass { AVPlayerLayer.self }
        var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
    }
}
