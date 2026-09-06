import SwiftUI
import Observation
import os

/// State + actions behind the Library screen, separate from the view so the
/// debug driver (`UI/LibraryScript.swift`) can exercise the same paths the
/// taps do.
@Observable
@MainActor
final class LibraryModel {
    static let log = Logger(subsystem: "com.bartdecrem.Jambot", category: "library")

    var tracks: [TrackMeta]? = nil
    var error: String = ""
    var creating = false
    var openTrack: TrackMeta? = nil
    var showAbout = false
    var deleteTarget: TrackMeta? = nil
    var busyTrackId: String? = nil
    /// The public track whose player sheet is up, and its model.
    var publicTrack: PublicTrackMeta? = nil
    private(set) var playerModel: PublicPlayerModel? = nil
    var catalogReload = 0
    /// Set by the view: the server said 401.
    var onAuthLost: (() -> Void)?

    func load(openLaunchTrack: Bool = true) async {
        do {
            let fetched = try await JamAPI.shared.tracks()
            tracks = fetched
            error = ""
            if openLaunchTrack, let title = Self.launchArgValue("-openTrack"),
               let match = fetched.first(where: { $0.title.localizedCaseInsensitiveContains(title) }) {
                openTrack = match
            }
        } catch {
            if case JamAPIError.unauthenticated = error { onAuthLost?(); return }
            self.error = error.localizedDescription
        }
    }

    func createAndOpen() async {
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

    @discardableResult
    func duplicate(_ t: TrackMeta) async -> TrackMeta? {
        busyTrackId = t.id
        defer { busyTrackId = nil }
        do {
            let copy = try await JamAPI.shared.duplicateTrack(t.id)
            if let idx = tracks?.firstIndex(where: { $0.id == t.id }) {
                tracks?.insert(copy, at: idx + 1)
            } else {
                tracks?.insert(copy, at: 0)
            }
            return copy
        } catch {
            if case JamAPIError.unauthenticated = error { onAuthLost?(); return nil }
            self.error = error.localizedDescription
            return nil
        }
    }

    @discardableResult
    func delete(_ t: TrackMeta) async -> Bool {
        deleteTarget = nil
        busyTrackId = t.id
        defer { busyTrackId = nil }
        do {
            try await JamAPI.shared.deleteTrack(t.id)
            tracks?.removeAll { $0.id == t.id }
            RenderCache.shared.drop(trackId: t.id)
            return true
        } catch {
            if case JamAPIError.unauthenticated = error { onAuthLost?(); return false }
            self.error = error.localizedDescription
            return false
        }
    }

    /// Present the read-only player for a catalog row.
    func openPublic(_ meta: PublicTrackMeta) {
        playerModel = PublicPlayerModel(meta: meta, engine: EngineFactory.make())
        publicTrack = meta
    }

    func closePublic() {
        playerModel?.stop()
        publicTrack = nil
    }

    /// A remix landed in the library: close the player, list it, open it.
    func remixed(_ track: TrackMeta) {
        publicTrack = nil
        if !(tracks?.contains(where: { $0.id == track.id }) ?? false) { tracks?.insert(track, at: 0) }
        Task {
            try? await Task.sleep(nanoseconds: 450_000_000)
            openTrack = track
        }
    }

    static func launchArgValue(_ flag: String) -> String? {
        let args = CommandLine.arguments
        guard let idx = args.firstIndex(of: flag), idx + 1 < args.count else { return nil }
        return args[idx + 1]
    }
}

/// The user's tracks — port of `src/app/jam/Library.tsx`. Tap a card to
/// open Studio; "+ New track" creates and opens one; "…" duplicates or
/// deletes; the public catalog ("FROM EVERYONE") sits below.
struct LibraryView: View {
    @Environment(Session.self) private var session
    @State private var model = LibraryModel()
    @State private var debugBounce = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                header
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        sectionRow

                        if !model.error.isEmpty {
                            Text(model.error)
                                .font(JBTheme.monoFont(12))
                                .foregroundStyle(JBTheme.orange)
                        }
                        if model.tracks == nil && model.error.isEmpty {
                            Text("Loading…")
                                .font(JBTheme.monoFont(12))
                                .foregroundStyle(JBTheme.ink3)
                                .frame(maxWidth: .infinity)
                                .padding(.top, 32)
                        }
                        if let tracks = model.tracks, tracks.isEmpty {
                            Text("No tracks yet. Start one and tell it what you want to hear.")
                                .font(JBTheme.bodyFont(15))
                                .foregroundStyle(JBTheme.ink3)
                                .frame(maxWidth: .infinity)
                                .multilineTextAlignment(.center)
                                .padding(.top, 32)
                        }

                        VStack(spacing: 8) {
                            ForEach(model.tracks ?? []) { t in
                                trackRow(t)
                            }
                        }

                        CatalogView(engine: EngineFactory.make(), onOpen: { model.openPublic($0) }, reloadToken: model.catalogReload)
                            .padding(.top, 8)
                    }
                    .padding(16)
                    .columnWidth()
                    .frame(maxWidth: .infinity)
                }
                .refreshable {
                    await model.load(openLaunchTrack: false)
                    model.catalogReload += 1
                }
            }
            .background(JBTheme.panel)
            .navigationDestination(item: $model.openTrack) { t in
                StudioView(trackId: t.id, initialMeta: t, engine: EngineFactory.make())
            }
            .sheet(isPresented: $model.showAbout) {
                AboutView(engineVersion: EngineFactory.host?.engineVersion)
            }
            .alert("Delete this track?", isPresented: Binding(get: { model.deleteTarget != nil }, set: { if !$0 { model.deleteTarget = nil } })) {
                Button("Delete", role: .destructive) {
                    if let t = model.deleteTarget { Task { await model.delete(t) } }
                }
                Button("Cancel", role: .cancel) { model.deleteTarget = nil }
            } message: {
                Text(model.deleteTarget.map { "\"\($0.title)\" can't be recovered." } ?? "")
            }
        }
        .jambotAboutShortcut { model.showAbout = true }
        .task {
            model.onAuthLost = { session.authLost() }
            await model.load()
            // DEBUG-only headless verification hooks (no on-screen tapping
            // possible — see "NO SCREEN CONTROL" in DESIGN.md): `-openAbout`
            // shows the About sheet, `-openCatalogTrack "<title>"` opens the
            // public player for a matching catalog row, `-previewBounce`
            // shows BounceSheet against a synthetic render, and
            // `-libraryScript "<steps>"` drives the Library (UI/LibraryScript.swift).
            if CommandLine.arguments.contains("-openAbout") { model.showAbout = true }
            if let title = LibraryModel.launchArgValue("-openCatalogTrack") {
                if let match = try? await JamAPI.shared.catalog().first(where: { $0.title.localizedCaseInsensitiveContains(title) }) {
                    model.openPublic(match)
                }
            }
            if CommandLine.arguments.contains("-previewBounce") { debugBounce = true }
            if let steps = LibraryScript.steps {
                await LibraryScript.run(steps, model: model)
            }
        }
        .sheet(item: $model.publicTrack, onDismiss: { model.playerModel?.stop() }) { t in
            NavigationStack {
                PublicPlayerView(meta: t, engine: EngineFactory.make(), onRemixed: { model.remixed($0) }, externalModel: model.playerModel)
            }
        }
        .sheet(isPresented: $debugBounce) {
            BounceSheet(render: RenderResult(bars: 16, bpm: 128, hasArrangement: true, message: "debug",
                                              sampleRate: 44100, channels: 2, length: 44100 * 2,
                                              pcm: Exporter.syntheticSine()), bpm: 128)
        }
        .onChange(of: model.openTrack) { _, now in
            // Back from Studio: the title / bpm / bars / updated_at changed.
            if now == nil { Task { await model.load(openLaunchTrack: false) } }
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
            Button {
                model.showAbout = true
            } label: {
                Image(systemName: "gearshape")
            }
            .buttonStyle(JBKeyStyle(variant: .panel, small: true, square: true))
            .accessibilityLabel("About")
            Button("Sign out") { Task { await session.logout() } }
                .buttonStyle(JBKeyStyle(variant: .panel, small: true))
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 10)
        .frame(maxWidth: .infinity)
        .columnWidth()
        .background(JBTheme.panel)
    }

    private var sectionRow: some View {
        HStack(alignment: .center, spacing: 10) {
            Text("YOUR TRACKS")
                .font(JBTheme.panelFont(12, weight: .semibold))
                .tracking(1.5)
                .foregroundStyle(JBTheme.ink3)
            Rectangle().fill(JBTheme.rule).frame(height: 1)
            Button(model.creating ? "Starting…" : "+ New track") {
                Task { await model.createAndOpen() }
            }
            .buttonStyle(JBKeyStyle(variant: .orange, small: true))
            .disabled(model.creating)
        }
        .padding(.top, 6)
    }

    /// A track card plus its "…" menu (Duplicate / Delete), laid out so the
    /// menu key sits beside the card without stealing the card's own tap.
    private func trackRow(_ t: TrackMeta) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Button { model.openTrack = t } label: { trackCard(t) }
                .buttonStyle(.plain)
            Menu {
                Button {
                    Task { await model.duplicate(t) }
                } label: {
                    Label("Duplicate", systemImage: "doc.on.doc")
                }
                Button(role: .destructive) {
                    model.deleteTarget = t
                } label: {
                    Label("Delete", systemImage: "trash")
                }
            } label: {
                Image(systemName: model.busyTrackId == t.id ? "ellipsis.circle.fill" : "ellipsis.circle")
                    .font(.system(size: 20))
                    .foregroundStyle(JBTheme.ink3)
                    .frame(width: 32, height: 32)
            }
            .disabled(model.busyTrackId == t.id)
        }
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
        .frame(maxWidth: .infinity, alignment: .leading)
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
}

#Preview {
    LibraryView().environment(Session())
}
