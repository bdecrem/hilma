import SwiftUI

/// The user's tracks — port of `src/app/jam/Library.tsx`. Tap a card to
/// open Studio; "+ New track" creates and opens one.
struct LibraryView: View {
    @Environment(Session.self) private var session

    @State private var tracks: [TrackMeta]? = nil
    @State private var error: String = ""
    @State private var creating = false
    @State private var openTrack: TrackMeta? = nil

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                header
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        sectionRow

                        if !error.isEmpty {
                            Text(error)
                                .font(JBTheme.monoFont(12))
                                .foregroundStyle(JBTheme.orange)
                        }
                        if tracks == nil && error.isEmpty {
                            Text("Loading…")
                                .font(JBTheme.monoFont(12))
                                .foregroundStyle(JBTheme.ink3)
                                .frame(maxWidth: .infinity)
                                .padding(.top, 32)
                        }
                        if let tracks, tracks.isEmpty {
                            Text("No tracks yet. Start one and tell it what you want to hear.")
                                .font(JBTheme.bodyFont(15))
                                .foregroundStyle(JBTheme.ink3)
                                .frame(maxWidth: .infinity)
                                .multilineTextAlignment(.center)
                                .padding(.top, 32)
                        }

                        VStack(spacing: 8) {
                            ForEach(tracks ?? []) { t in
                                Button {
                                    openTrack = t
                                } label: {
                                    trackCard(t)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    .padding(16)
                }
            }
            .background(JBTheme.panel)
            .navigationDestination(item: $openTrack) { t in
                StudioView(trackId: t.id, initialMeta: t, engine: EngineFactory.make())
            }
        }
        .task { await load() }
        .onChange(of: openTrack) { _, now in
            // Back from Studio: the title / bpm / bars / updated_at changed.
            if now == nil { Task { await load(openLaunchTrack: false) } }
        }
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            HStack(spacing: 2) {
                Text("JAMBOT")
                    .font(JBTheme.panelFont(22, weight: .bold))
                Circle().fill(JBTheme.orange).frame(width: 6, height: 6)
            }
            if case .signedIn(let user) = session.state {
                Text(user.username)
                    .font(JBTheme.monoFont(12))
                    .foregroundStyle(JBTheme.ink2)
            }
            Spacer()
            Button("Sign out") { Task { await session.logout() } }
                .buttonStyle(JBKeyStyle(variant: .panel, small: true))
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 10)
        .background(JBTheme.panel)
    }

    private var sectionRow: some View {
        HStack(alignment: .center, spacing: 10) {
            Text("YOUR TRACKS")
                .font(JBTheme.panelFont(12, weight: .semibold))
                .tracking(1.5)
                .foregroundStyle(JBTheme.ink3)
            Rectangle().fill(JBTheme.rule).frame(height: 1)
            Button(creating ? "Starting…" : "+ New track") {
                Task { await createAndOpen() }
            }
            .buttonStyle(JBKeyStyle(variant: .orange, small: true))
            .disabled(creating)
        }
        .padding(.top, 6)
    }

    private func trackCard(_ t: TrackMeta) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(t.title.uppercased())
                    .font(JBTheme.panelFont(16, weight: .semibold))
                    .foregroundStyle(JBTheme.ink)
                    .lineLimit(1)
                Spacer()
                if t.publishedAt != nil {
                    tag("PUBLIC", bg: JBTheme.green, fg: .white)
                }
                if t.remixOf != nil {
                    tag("REMIX", bg: .clear, fg: JBTheme.ink3, outline: true)
                }
            }
            LedStripView(strip: t.strip)
            HStack(spacing: 4) {
                Text("\(t.bpm)").fontWeight(.medium) + Text(" BPM · \(t.bars) \(t.bars == 1 ? "bar" : "bars") · \(relTime(t.updatedAt))")
            }
            .font(JBTheme.monoFont(12))
            .foregroundStyle(JBTheme.ink2)
        }
        .padding(14)
        .background(JBTheme.panel2)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(JBTheme.rule, lineWidth: 1))
    }

    private func tag(_ text: String, bg: Color, fg: Color, outline: Bool = false) -> some View {
        Text(text)
            .font(JBTheme.panelFont(10, weight: .semibold))
            .tracking(1)
            .foregroundStyle(fg)
            .padding(.horizontal, 6)
            .padding(.vertical, 1)
            .background(bg)
            .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 4, style: .continuous)
                    .stroke(outline ? JBTheme.ink3 : .clear, lineWidth: 1)
            )
    }

    private func load(openLaunchTrack: Bool = true) async {
        do {
            let fetched = try await JamAPI.shared.tracks()
            tracks = fetched
            if openLaunchTrack, let title = Self.launchOpenTrackTitle(),
               let match = fetched.first(where: { $0.title.localizedCaseInsensitiveContains(title) }) {
                openTrack = match
            }
        } catch {
            if case JamAPIError.unauthenticated = error { session.authLost(); return }
            self.error = error.localizedDescription
        }
    }

    /// DEBUG-only: `-openTrack "<title>"` opens a matching track on launch
    /// so the simulator can be driven headlessly — see "NO SCREEN CONTROL"
    /// in DESIGN.md/PROGRESS.md verify steps.
    private static func launchOpenTrackTitle() -> String? {
        let args = CommandLine.arguments
        guard let idx = args.firstIndex(of: "-openTrack"), idx + 1 < args.count else { return nil }
        return args[idx + 1]
    }

    private func createAndOpen() async {
        guard !creating else { return }
        creating = true
        error = ""
        do {
            let track = try await JamAPI.shared.createTrack()
            tracks?.insert(track.meta, at: 0)
            openTrack = track.meta
        } catch {
            self.error = error.localizedDescription
        }
        creating = false
    }
}

#Preview {
    LibraryView().environment(Session())
}
