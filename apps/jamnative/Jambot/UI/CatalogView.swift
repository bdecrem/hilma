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
    /// Signed-in admin (jam_users.is_admin): every row gets the "…" menu
    /// the Library puts on its own rows — Rename / Delete — for any track.
    var admin: Bool = false

    @State private var tracks: [PublicTrackMeta]? = nil
    @State private var error: String = ""
    @State private var openTrack: PublicTrackMeta? = nil
    @State private var renameTarget: PublicTrackMeta? = nil
    @State private var renameText: String = ""
    @State private var deleteTarget: PublicTrackMeta? = nil
    @State private var busySlug: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            JBGroupRow(title)
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
                    HStack(alignment: .center, spacing: 0) {
                        Button {
                            if let onOpen, engine != nil { onOpen(t) }
                            else if engine != nil { openTrack = t }
                            else { onSignedOutTap?() }
                        } label: {
                            row(t)
                        }
                        .buttonStyle(.plain)
                        if admin { adminMenu(t) }
                    }
                    .jbCard()
                }
            }
        }
        .task(id: reloadToken) { await load() }
        .sheet(item: $openTrack) { t in
            if let engine {
                NavigationStack { PublicPlayerView(meta: t, engine: engine) }
            }
        }
        .alert("Rename track", isPresented: Binding(get: { renameTarget != nil }, set: { if !$0 { renameTarget = nil } })) {
            TextField("Title", text: $renameText)
            Button("Rename") { if let t = renameTarget { Task { await rename(t, to: renameText) } } }
            Button("Cancel", role: .cancel) { renameTarget = nil }
        } message: {
            Text(renameTarget.map { "\"\($0.title)\" by \($0.username)" } ?? "")
        }
        .alert("Delete this track?", isPresented: Binding(get: { deleteTarget != nil }, set: { if !$0 { deleteTarget = nil } })) {
            Button("Delete", role: .destructive) { if let t = deleteTarget { Task { await remove(t) } } }
            Button("Cancel", role: .cancel) { deleteTarget = nil }
        } message: {
            Text(deleteTarget.map { "\"\($0.title)\" by \($0.username) can't be recovered — it is deleted from their library too." } ?? "")
        }
    }

    /// The admin's "…" key at the card's trailing edge (same as the
    /// Library's track rows): Rename / Delete for any catalog track.
    private func adminMenu(_ t: PublicTrackMeta) -> some View {
        Menu {
            Button {
                renameText = t.title
                renameTarget = t
            } label: {
                Label("Rename", systemImage: "pencil")
            }
            Button(role: .destructive) {
                deleteTarget = t
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
                .opacity(busySlug == t.slug ? 0.35 : 1)
        }
        .disabled(busySlug == t.slug)
        .accessibilityLabel("Track options")
    }

    private func rename(_ t: PublicTrackMeta, to raw: String) async {
        renameTarget = nil
        let title = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty, title != t.title else { return }
        busySlug = t.slug
        defer { busySlug = nil }
        do {
            _ = try await JamAPI.shared.renamePublicTrack(t.slug, title: title)
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func remove(_ t: PublicTrackMeta) async {
        deleteTarget = nil
        busySlug = t.slug
        defer { busySlug = nil }
        do {
            try await JamAPI.shared.deletePublicTrack(t.slug)
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func row(_ t: PublicTrackMeta) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(t.title)
                    .font(JBTheme.panelFont(19, weight: .semibold))
                    .tracking(0.4)
                    .textCase(.uppercase)
                    .foregroundStyle(JBTheme.ink)
                    .lineLimit(1)
                Spacer()
                Text(t.username)
                    .font(JBTheme.monoFont(12))
                    .foregroundStyle(JBTheme.ink3)
            }
            LedStripView(strip: t.strip)
            (Text("\(t.bpm)").fontWeight(.medium).foregroundColor(JBTheme.ink)
             + Text(" BPM · \(t.bars) \(t.bars == 1 ? "bar" : "bars")\(t.remix ? " · remix" : "") · \(relTime(t.publishedAt))").foregroundColor(JBTheme.ink2))
                .font(JBTheme.monoFont(12))
                .lineLimit(1)
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
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
