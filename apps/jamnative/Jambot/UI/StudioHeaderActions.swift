import SwiftUI

/// Sharing/rename state for one open track's header — port of the bits of
/// `Studio.tsx` around `title`/`pub`. `StudioModel` owns one per track,
/// seeds it from the loaded `Track`, and keeps it in sync with its `title`.
@MainActor
@Observable
final class SharingState {
    var title: String
    var published: Bool
    var slug: String?
    var busy = false
    var error: String?

    init(title: String, published: Bool = false, slug: String? = nil) {
        self.title = title
        self.published = published
        self.slug = slug
    }

    /// `https://jambot.to/t/<slug>` once published, mirrors `publicTrackUrl`.
    var publicURL: URL? {
        guard let slug, !slug.isEmpty else { return nil }
        return publicTrackURL(slug)
    }

    func apply(_ meta: TrackMeta) {
        title = meta.title
        published = meta.publishedAt != nil
        slug = meta.slug
    }
}

/// The studio header: a nav row (`leading` — the back key — then Share and
/// Publish/Unpublish keys) over the tap-to-rename title. Share opens the
/// system share sheet with the public URL. This view owns no network
/// calls — it edits `state` locally and invokes the callbacks; the model
/// saves first, then calls `JamAPI.publish`/`unpublish` and `state.apply(_:)`.
struct StudioHeaderActions<Leading: View>: View {
    @Bindable var state: SharingState
    /// Fired when the user commits a new title (trimmed, non-empty, capped
    /// at 80 chars — already applied to `state.title` by the time this
    /// fires). Persist it (`StudioModel.rename`).
    var onRename: (String) -> Void
    /// Fired to flip publish state (`StudioModel.togglePublish`).
    var onPublishToggle: () -> Void
    @ViewBuilder var leading: () -> Leading

    @State private var editingTitle = false
    @State private var draftTitle = ""
    @State private var showShare = false
    @FocusState private var titleFocused: Bool

    init(state: SharingState, onRename: @escaping (String) -> Void, onPublishToggle: @escaping () -> Void,
         @ViewBuilder leading: @escaping () -> Leading = { EmptyView() }) {
        self.state = state
        self.onRename = onRename
        self.onPublishToggle = onPublishToggle
        self.leading = leading
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                leading()
                Spacer()
                if state.published, let url = state.publicURL {
                    Button("Share") { showShare = true }
                        .buttonStyle(JBKeyStyle(variant: .panel, small: true))
                        .sheet(isPresented: $showShare) {
                            ShareSheet(items: [state.title, url])
                        }
                }
                Button(state.busy ? "…" : (state.published ? "Unpublish" : "Publish")) {
                    state.error = nil
                    onPublishToggle()
                }
                .buttonStyle(JBKeyStyle(variant: state.published ? .ghost : .green, small: true))
                .disabled(state.busy)
                .accessibilityIdentifier("publishKey")
            }

            if editingTitle {
                TextField("Track title", text: $draftTitle)
                    .font(JBTheme.panelFont(22, weight: .semibold))
                    .textInputAutocapitalization(.words)
                    .focused($titleFocused)
                    .onSubmit(commitTitle)
                    .submitLabel(.done)
                    .jbField()
                    .task { titleFocused = true }
                    .onChange(of: titleFocused) { _, focused in if !focused && editingTitle { commitTitle() } }
            } else {
                Button {
                    draftTitle = state.title
                    editingTitle = true
                } label: {
                    Text(state.title.uppercased())
                        .font(JBTheme.panelFont(26, weight: .semibold))
                        .foregroundStyle(JBTheme.ink)
                        .lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Rename track")
            }

            if let error = state.error {
                Text(error)
                    .font(JBTheme.monoFont(11))
                    .foregroundStyle(JBTheme.orange)
            }
        }
    }

    private func commitTitle() {
        editingTitle = false
        let clean = draftTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        let capped = String(clean.prefix(80))
        guard !capped.isEmpty, capped != state.title else { return }
        state.title = capped
        onRename(capped)
    }
}

#Preview {
    StudioHeaderActions(
        state: SharingState(title: "Late night techno", published: true, slug: "abc123"),
        onRename: { _ in },
        onPublishToggle: {},
        leading: { Text("‹ TRACKS").font(JBTheme.panelFont(12, weight: .semibold)) }
    )
    .padding()
    .background(JBTheme.panel)
}
