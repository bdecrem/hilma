import SwiftUI
import Observation

/// State for the read-only public player: loads `GET /api/jam/public/:slug`,
/// renders the session through the shared engine, plays it, remixes it.
/// Owned by `PublicPlayerView` unless the caller passes one (the Library's
/// debug script drives it headlessly).
@Observable
@MainActor
final class PublicPlayerModel {
    enum Status: Equatable { case loading, rendering, ready, failed(String) }

    let meta: PublicTrackMeta
    let engine: EngineAPI
    let player = AudioPlayer()

    private(set) var status: Status = .loading
    private(set) var playing = false
    private(set) var pos: Double = 0
    private(set) var remixing = false
    var error: String?
    private var timer: Timer?

    init(meta: PublicTrackMeta, engine: EngineAPI) {
        self.meta = meta
        self.engine = engine
        player.onStateChange = { [weak self] isPlaying in
            Task { @MainActor in self?.playingChanged(isPlaying) }
        }
    }

    private func playingChanged(_ isPlaying: Bool) {
        playing = isPlaying
        timer?.invalidate()
        timer = nil
        if isPlaying {
            let t = Timer.scheduledTimer(withTimeInterval: 1.0 / 30, repeats: true) { [weak self] _ in
                Task { @MainActor in self?.pos = self?.player.position() ?? 0 }
            }
            RunLoop.main.add(t, forMode: .common)
            timer = t
        } else {
            pos = 0
        }
    }

    func load() async {
        status = .loading
        do {
            let track = try await JamAPI.shared.publicTrack(meta.slug)
            status = .rendering
            try await engine.ready()
            _ = try await engine.loadSession(session: track.session, bpm: track.bpm)
            let result = try await engine.render(scope: .song)
            player.load(result)
            status = .ready
        } catch {
            status = .failed(error.localizedDescription)
        }
    }

    func toggle() {
        guard status == .ready else { return }
        player.toggle()
    }

    func stop() {
        timer?.invalidate()
        timer = nil
        player.stop()
    }

    /// Copies the track into the signed-in library; the new track on success.
    func remix() async -> TrackMeta? {
        guard !remixing else { return nil }
        remixing = true
        error = nil
        defer { remixing = false }
        do {
            return try await JamAPI.shared.remix(meta.slug)
        } catch {
            self.error = error.localizedDescription
            return nil
        }
    }
}

/// Read-only player for one published track (`GET /api/jam/public/:slug`),
/// reached from `CatalogView`. Port of `src/app/jam/t/[slug]/PublicTrack.tsx`
/// minus the browser-only bits: title, "by <user>", LED strip, Play/Stop,
/// and Remix (copies the session into the signed-in library).
///
/// Renders the public session through `engine` — the caller passes the
/// app-wide shared engine (`EngineFactory.shared`), so this must not be
/// shown while a Studio session on the same engine is mid-render.
struct PublicPlayerView: View {
    let meta: PublicTrackMeta
    let engine: EngineAPI
    /// Called with the new library track once a remix lands, so the caller
    /// can dismiss this sheet and open Studio on it.
    var onRemixed: ((TrackMeta) -> Void)? = nil
    /// A caller-owned model (the Library's debug script drives one); nil → the view's own.
    var externalModel: PublicPlayerModel? = nil

    @Environment(\.dismiss) private var dismiss
    @State private var ownModel: PublicPlayerModel

    init(meta: PublicTrackMeta, engine: EngineAPI, onRemixed: ((TrackMeta) -> Void)? = nil, externalModel: PublicPlayerModel? = nil) {
        self.meta = meta
        self.engine = engine
        self.onRemixed = onRemixed
        self.externalModel = externalModel
        _ownModel = State(initialValue: externalModel ?? PublicPlayerModel(meta: meta, engine: engine))
    }

    private var model: PublicPlayerModel { externalModel ?? ownModel }

    var body: some View {
        let model = self.model
        VStack(spacing: 18) {
            HStack {
                Button("Close") { dismiss() }
                    .buttonStyle(JBKeyStyle(variant: .panel, small: true))
                Spacer()
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(meta.title.uppercased())
                    .font(JBTheme.panelFont(24, weight: .semibold))
                    .foregroundStyle(JBTheme.ink)
                HStack(spacing: 4) {
                    Text("by \(meta.username)")
                    Text("· \(meta.bpm) BPM · \(meta.bars) \(meta.bars == 1 ? "bar" : "bars")\(meta.remix ? " · remix" : "")")
                }
                .font(JBTheme.monoFont(13))
                .foregroundStyle(JBTheme.ink2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            LedStripView(strip: meta.strip, step: model.playing ? Int(model.pos * Double(max(1, meta.bars)) * 16) % 16 : nil, big: true)

            statusRow(model)

            HStack(spacing: 12) {
                Button {
                    model.toggle()
                } label: {
                    Image(systemName: model.playing ? "stop.fill" : "play.fill")
                        .font(.system(size: 20))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(JBKeyStyle(variant: .panel))
                .disabled(model.status != .ready)

                Button(model.remixing ? "…" : "Remix") {
                    Task {
                        if let track = await model.remix() {
                            model.stop()
                            onRemixed?(track)
                            dismiss()
                        }
                    }
                }
                .buttonStyle(JBKeyStyle(variant: .orange))
                .disabled(model.remixing)
            }

            if let error = model.error {
                Text(error)
                    .font(JBTheme.monoFont(12))
                    .foregroundStyle(JBTheme.orange)
            }

            Spacer()
        }
        .padding(20)
        .background(JBTheme.panel)
        .task { if model.status == .loading { await model.load() } }
        .onDisappear { model.stop() }
    }

    @ViewBuilder
    private func statusRow(_ model: PublicPlayerModel) -> some View {
        switch model.status {
        case .loading:
            Text("Loading…").font(JBTheme.monoFont(12)).foregroundStyle(JBTheme.ink3)
        case .rendering:
            Text("Rendering…").font(JBTheme.monoFont(12)).foregroundStyle(JBTheme.ink3)
        case .ready:
            Text(model.playing ? "bar \(min(meta.bars, Int(model.pos * Double(max(1, meta.bars))) + 1))/\(meta.bars)" : "ready")
                .font(JBTheme.monoFont(12)).foregroundStyle(JBTheme.ink3)
        case .failed(let message):
            Text(message).font(JBTheme.monoFont(12)).foregroundStyle(JBTheme.orange)
        }
    }
}

#Preview {
    PublicPlayerView(
        meta: PublicTrackMeta(slug: "abc123", title: "Late night techno", bpm: 128, bars: 16, publishedAt: "2026-09-01T00:00:00Z", remix: false, username: "bart", strip: nil),
        engine: MockEngine()
    )
}
