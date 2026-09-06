import SwiftUI

/// The public catalog — "FROM EVERYONE": every published track, playable by
/// anyone. Port of `src/app/jam/Catalog.tsx`. Embedded under the Library
/// list for signed-in users (tap opens `PublicPlayerView`, which needs a
/// live `EngineAPI`) and under the Login form for signed-out visitors (tap
/// routes to sign-in instead, since the engine host isn't warmed pre-login).
struct CatalogView: View {
    var title: String = "FROM EVERYONE"
    var emptyText: String = "Nothing published yet. Open a track and press Publish."
    /// Pass the shared engine (`EngineFactory.shared`) when the viewer can
    /// play tracks; nil (signed-out) routes taps to `onSignedOutTap` instead.
    var engine: EngineAPI?
    var onSignedOutTap: (() -> Void)? = nil
    /// When set, the caller presents the player itself (the Library does,
    /// so it can follow a Remix into Studio); otherwise this view presents it.
    var onOpen: ((PublicTrackMeta) -> Void)? = nil
    /// Bumping this reloads the list (pull-to-refresh in the Library).
    var reloadToken: Int = 0

    @State private var tracks: [PublicTrackMeta]? = nil
    @State private var error: String = ""
    @State private var openTrack: PublicTrackMeta? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 10) {
                Text(title)
                    .font(JBTheme.panelFont(12, weight: .semibold))
                    .tracking(1.5)
                    .foregroundStyle(JBTheme.ink3)
                Rectangle().fill(JBTheme.rule).frame(height: 1)
            }
            .padding(.top, 6)

            if !error.isEmpty {
                Text(error)
                    .font(JBTheme.monoFont(12))
                    .foregroundStyle(JBTheme.orange)
            }
            if tracks == nil && error.isEmpty {
                Text("Loading…")
                    .font(JBTheme.monoFont(12))
                    .foregroundStyle(JBTheme.ink3)
            }
            if let tracks, tracks.isEmpty {
                Text(emptyText)
                    .font(JBTheme.bodyFont(13))
                    .foregroundStyle(JBTheme.ink3)
            }

            VStack(spacing: 8) {
                ForEach(tracks ?? []) { t in
                    Button {
                        if let onOpen, engine != nil { onOpen(t) }
                        else if engine != nil { openTrack = t }
                        else { onSignedOutTap?() }
                    } label: {
                        row(t)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .task(id: reloadToken) { await load() }
        .sheet(item: $openTrack) { t in
            if let engine {
                NavigationStack { PublicPlayerView(meta: t, engine: engine) }
            }
        }
    }

    private func row(_ t: PublicTrackMeta) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(t.title.uppercased())
                    .font(JBTheme.panelFont(15, weight: .semibold))
                    .foregroundStyle(JBTheme.ink)
                    .lineLimit(1)
                Spacer()
                Text(t.username)
                    .font(JBTheme.monoFont(12))
                    .foregroundStyle(JBTheme.ink3)
            }
            LedStripView(strip: t.strip)
            Text("\(t.bpm) BPM · \(t.bars) \(t.bars == 1 ? "bar" : "bars")\(t.remix ? " · remix" : "") · \(relTime(t.publishedAt))")
                .font(JBTheme.monoFont(12))
                .foregroundStyle(JBTheme.ink2)
        }
        .padding(14)
        .background(JBTheme.panel2)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(JBTheme.rule, lineWidth: 1))
    }

    private func load() async {
        do {
            tracks = try await JamAPI.shared.catalog()
            error = ""
        } catch {
            self.error = error.localizedDescription
        }
    }
}

#Preview {
    ScrollView { CatalogView(engine: MockEngine()).padding(16) }
        .background(JBTheme.panel)
}
