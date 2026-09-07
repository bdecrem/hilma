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
    var dismissAbout: (() -> Void)?
    var dismissPublic: (() -> Void)?
    var showAbout = false
    var deleteTarget: TrackMeta? = nil
    var busyTrackId: String? = nil
    /// The public track whose player sheet is up, and its model.
    var publicTrack: PublicTrackMeta? = nil
    private(set) var playerModel: PublicPlayerModel? = nil
    var catalogReload = 0
    /// DEBUG driver: an anchor id the list should scroll to ("catalog").
    var scrollTarget: String? = nil
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
    /// Favourite on/off: an orange-edged card sorted first (and a taste signal).
    func star(_ t: TrackMeta) async {
        let on = t.starredAt == nil
        if let idx = tracks?.firstIndex(where: { $0.id == t.id }) { tracks?[idx].starredAt = on ? ISO8601DateFormatter().string(from: Date()) : nil }
        do {
            let meta = try await JamAPI.shared.starTrack(t.id, starred: on)
            if let idx = tracks?.firstIndex(where: { $0.id == t.id }) { tracks?[idx].starredAt = meta.starredAt }
        } catch {
            if case JamAPIError.unauthenticated = error { onAuthLost?(); return }
            self.error = error.localizedDescription
        }
    }

    /// Starred tracks first, otherwise the server's order (last edited first).
    var orderedTracks: [TrackMeta]? {
        guard let tracks else { return nil }
        return tracks.filter { $0.starredAt != nil } + tracks.filter { $0.starredAt == nil }
    }

    /// Star rating of the creation (1–5, nil clears) — a taste signal.
    func rate(_ t: TrackMeta, _ stars: Int?) async {
        if let idx = tracks?.firstIndex(where: { $0.id == t.id }) { tracks?[idx].rating = stars }
        do {
            let meta = try await JamAPI.shared.rateTrack(t.id, stars: stars)
            if let idx = tracks?.firstIndex(where: { $0.id == t.id }) { tracks?[idx].rating = meta.rating }
        } catch {
            if case JamAPIError.unauthenticated = error { onAuthLost?(); return }
            self.error = error.localizedDescription
        }
    }

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
                ScrollViewReader { proxy in
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
                            ForEach(model.orderedTracks ?? []) { t in
                                trackRow(t)
                            }
                        }

                        CatalogView(engine: EngineFactory.make(), onOpen: { model.openPublic($0) }, reloadToken: model.catalogReload, admin: session.user?.admin ?? false)
                            .padding(.top, 8)
                            .id("catalog")
                    }
                    .padding(16)
                    .columnWidth()
                    .frame(maxWidth: .infinity)
                }
                .refreshable {
                    await model.load(openLaunchTrack: false)
                    model.catalogReload += 1
                }
                // DEBUG-only: the `scroll:catalog` library-script step (no
                // screen control, so screenshots below the fold need this).
                .onChange(of: model.scrollTarget) { _, target in
                    guard let target else { return }
                    withAnimation { proxy.scrollTo(target, anchor: .top) }
                }
                }
            }
            .background(JBTheme.panel)
            .navigationDestination(item: $model.openTrack) { t in
                StudioView(trackId: t.id, initialMeta: t, engine: EngineFactory.make())
            }
            .sheet(isPresented: $model.showAbout) {
                AboutView(engineVersion: EngineFactory.host?.engineVersion)
                    .jbAppearance()
                    // Catalyst sheets don't inherit the Observation environment: without this AboutView's
                    // @Environment(Session.self) traps (EXC_BREAKPOINT in EnvironmentValues.subscript).
                    .environment(session)
                    .jbDismissHook { model.dismissAbout = $0 }
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
        .background { Color.clear.sheet(item: $model.publicTrack, onDismiss: { model.playerModel?.stop() }) { t in
            NavigationStack {
                PublicPlayerView(meta: t, engine: EngineFactory.make(), onRemixed: { model.remixed($0) }, externalModel: model.playerModel)
            }
            .jbAppearance()
            .jbDismissHook { model.dismissPublic = $0 }
        } }
        .background { Color.clear.sheet(isPresented: $debugBounce) {
            BounceSheet(render: RenderResult(bars: 16, bpm: 128, hasArrangement: true, message: "debug",
                                              sampleRate: 44100, channels: 2, length: 44100 * 2,
                                              pcm: Exporter.syntheticSine()), bpm: 128)
                .jbAppearance()
        } }
        .onChange(of: model.openTrack) { _, now in
            // Back from Studio: the title / bpm / bars / updated_at changed.
            if now == nil { Task { await model.load(openLaunchTrack: false) } }
        }
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            JBWordmark(size: 22)
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
        JBGroupRow("Your tracks") {
            Button(model.creating ? "Starting…" : "+ New track") {
                Task { await model.createAndOpen() }
            }
            .buttonStyle(JBKeyStyle(variant: .orange, size: .small))
            .disabled(model.creating)
        }
        .padding(.top, 6)
    }

    /// A track card with its "…" menu (Duplicate / Delete) inside the card
    /// at the trailing edge, like the web's `.jb-track` row: the card body
    /// opens the track, the menu key doesn't steal that tap.
    private func trackRow(_ t: TrackMeta) -> some View {
        HStack(alignment: .center, spacing: 0) {
            Button { model.openTrack = t } label: { trackCard(t) }
                .buttonStyle(.plain)
            VStack(spacing: 0) {
            // Favourite: ☆ / ★ above the "…" key; the card gets an orange edge.
            Button {
                Task { await model.star(t) }
            } label: {
                Text(t.starredAt == nil ? "☆" : "★")
                    .font(.system(size: 17))
                    .foregroundStyle(t.starredAt == nil ? JBTheme.ink3 : JBTheme.orange)
                    .frame(width: 44, height: 32)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(t.starredAt == nil ? "Star" : "Unstar")
            Menu {
                // Star rating of the whole creation (taste signal); the
                // current star clears it, like the web's row of stars.
                Menu {
                    ForEach(1...5, id: \.self) { n in
                        Button {
                            Task { await model.rate(t, t.rating == n ? nil : n) }
                        } label: {
                            Label(String(repeating: "★", count: n), systemImage: (t.rating ?? 0) == n ? "checkmark" : "")
                        }
                    }
                    if t.rating != nil {
                        Button(role: .destructive) { Task { await model.rate(t, nil) } } label: { Label("Clear rating", systemImage: "xmark") }
                    }
                } label: {
                    Label(t.rating.map { "Rated \(String(repeating: "★", count: $0))" } ?? "Rate", systemImage: t.rating == nil ? "star" : "star.fill")
                }
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
                Text("…")
                    .font(JBTheme.monoFont(18))
                    .foregroundStyle(JBTheme.ink2)
                    .frame(width: 44)
                    .frame(maxHeight: .infinity)
                    .contentShape(Rectangle())
                    .opacity(model.busyTrackId == t.id ? 0.35 : 1)
            }
            .disabled(model.busyTrackId == t.id)
            .accessibilityLabel("Track options")
            }
            .padding(.vertical, 6)
        }
        .jbCard()
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(JBTheme.orange, lineWidth: 1.5)
                .opacity(t.starredAt == nil ? 0 : 1)
        )
    }

    private func trackCard(_ t: TrackMeta) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(t.title)
                    .font(JBTheme.panelFont(19, weight: .semibold))
                    .tracking(0.4)
                    .textCase(.uppercase)
                    .foregroundStyle(JBTheme.ink)
                    .lineLimit(1)
                    .truncationMode(.tail)
                Spacer(minLength: 0)
                if t.publishedAt != nil { JBTag(text: "public", style: .green) }
                if t.remixOf != nil { JBTag(text: "remix", style: .outline) }
            }
            LedStripView(strip: t.strip)
            readout("\(t.bpm)", " BPM · \(t.bars) \(t.bars == 1 ? "bar" : "bars") · \(relTime(t.updatedAt))", stars: t.rating)
        }
        .padding(.vertical, 12)
        .padding(.leading, 14)
        .padding(.trailing, 4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    /// `.jb-readout` with the leading number in ink (`<b>`).
    private func readout(_ strong: String, _ rest: String, stars: Int? = nil) -> some View {
        (Text(strong).fontWeight(.medium).foregroundColor(JBTheme.ink)
         + Text(rest).foregroundColor(JBTheme.ink2)
         + Text(stars.map { " · " + String(repeating: "★", count: max(0, min(5, $0))) } ?? "").foregroundColor(JBTheme.orange))
            .font(JBTheme.monoFont(12))
            .lineLimit(1)
            .minimumScaleFactor(0.85)
    }
}

#Preview {
    LibraryView().environment(Session())
}
