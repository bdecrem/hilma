import SwiftUI

/// The community topic directory — topics other learners have shared,
/// newest first. "Add" forks one into this account: sources, notes, and the
/// flash deck come along; progress starts fresh. (Ratings, reports, and
/// author pages can come later — this is deliberately just a list.)
struct CommunitySheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(Session.self) private var session

    /// Called after a topic was forked into the account (list refresh).
    var onForked: () -> Void = {}

    @State private var topics: [PollyAPI.CommunityTopic] = []
    @State private var loading = true
    @State private var loadError: String? = nil
    /// Community ids currently being forked / already forked this visit.
    @State private var forking: Set<String> = []
    @State private var forked: Set<String> = []

    private var myUsername: String? {
        if case .signedIn(let user) = session.state { return user.username }
        return nil
    }

    var body: some View {
        VStack(spacing: 0) {
            handle
            header
            content
        }
        .background(PollyTheme.bgRaised.ignoresSafeArea())
        .task { await load() }
    }

    @ViewBuilder
    private var content: some View {
        if loading {
            ProgressView()
                .tint(PollyTheme.text2)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let err = loadError {
            Text(err)
                .font(.system(size: 13))
                .foregroundStyle(PollyTheme.text3)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(24)
        } else if topics.isEmpty {
            VStack(spacing: 10) {
                Image(systemName: "person.2")
                    .font(.system(size: 30))
                    .foregroundStyle(PollyTheme.text3)
                Text(L("Nothing shared yet", "Ancora niente di condiviso", "Rien de partagé", "아직 공유된 게 없어요"))
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(PollyTheme.text)
                Text("Share one of your topics from its ··· menu and it shows up here for everyone.")
                    .font(.system(size: 13))
                    .foregroundStyle(PollyTheme.text2)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, 36)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            ScrollView {
                VStack(spacing: 0) {
                    ForEach(topics) { topic in
                        row(topic)
                        if topic.id != topics.last?.id {
                            Rectangle()
                                .fill(PollyTheme.borderSoft)
                                .frame(height: 1)
                                .padding(.horizontal, 18)
                        }
                    }
                }
                .padding(.bottom, 32)
            }
            .scrollIndicators(.hidden)
        }
    }

    private func row(_ topic: PollyAPI.CommunityTopic) -> some View {
        HStack(spacing: 12) {
            MiniTopicGlyph(kind: topic.kind, size: 36)
            VStack(alignment: .leading, spacing: 3) {
                Text(topic.displayLabel)
                    .font(.system(size: 15.5, weight: .semibold))
                    .tracking(-0.2)
                    .foregroundStyle(PollyTheme.text)
                    .lineLimit(2)
                Text("by \(topic.author) · \(relative(topic.sharedAt))")
                    .font(.system(size: 12.5))
                    .foregroundStyle(PollyTheme.text3)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            trailingControl(topic)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
    }

    @ViewBuilder
    private func trailingControl(_ topic: PollyAPI.CommunityTopic) -> some View {
        if topic.author == myUsername {
            Text(L("Yours", "Tuo", "À toi", "내 주제"))
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(PollyTheme.text3)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(PollyTheme.surface2, in: Capsule())
        } else if forked.contains(topic.id) {
            Label(L("Added", "Aggiunto", "Ajouté", "추가됨"), systemImage: "checkmark")
                .font(.system(size: 12.5, weight: .semibold))
                .foregroundStyle(PollyTheme.text2)
        } else {
            Button { fork(topic) } label: {
                Group {
                    if forking.contains(topic.id) {
                        ProgressView().controlSize(.mini).tint(PollyTheme.inkOnAccent)
                    } else {
                        Text(L("Add", "Aggiungi", "Ajouter", "추가"))
                            .font(.system(size: 13, weight: .bold))
                    }
                }
                .foregroundStyle(PollyTheme.inkOnAccent)
                .padding(.horizontal, 14)
                .padding(.vertical, 7)
                .background(PollyTheme.accent, in: Capsule())
            }
            .buttonStyle(.plain)
            .disabled(forking.contains(topic.id))
        }
    }

    /// Fork into this account. The copy is theirs to edit — the original
    /// never changes.
    private func fork(_ topic: PollyAPI.CommunityTopic) {
        forking.insert(topic.id)
        Task {
            defer { forking.remove(topic.id) }
            do {
                _ = try await PollyAPI.shared.forkCommunityTopic(id: topic.id)
                forked.insert(topic.id)
                onForked()
            } catch {
                loadError = nil // keep the list; surface failure inline
            }
        }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            topics = try await PollyAPI.shared.listCommunityTopics()
        } catch {
            loadError = "Couldn't load community topics: \(error.localizedDescription)"
        }
    }

    private var handle: some View {
        Capsule()
            .fill(PollyTheme.surface3)
            .frame(width: 38, height: 4)
            .padding(.top, 8)
            .frame(maxWidth: .infinity)
    }

    private var header: some View {
        ZStack {
            VStack(spacing: 2) {
                Text(L("Community topics", "Argomenti della community", "Sujets de la communauté", "커뮤니티 주제"))
                    .font(.system(size: 16, weight: .semibold))
                    .tracking(-0.2)
                    .foregroundStyle(PollyTheme.text)
                Text(L("Shared by other learners — add one to make it yours",
                       "Condivisi da altri studenti — aggiungine uno e diventa tuo",
                       "Partagés par d'autres — ajoutes-en un et il est à toi",
                       "다른 학습자들이 공유했어요 — 추가하면 내 것이 돼요"))
                    .font(.system(size: 12))
                    .foregroundStyle(PollyTheme.text3)
                    .lineLimit(1)
            }
            HStack {
                Spacer()
                Button { closeModal(dismiss) } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(PollyTheme.text2)
                        .frame(width: 36, height: 36)
                        .background(PollyTheme.surface2, in: Circle())
                }
                .buttonStyle(.plain)
                .keyboardShortcut(.cancelAction)
            }
            .padding(.trailing, 14)
        }
        .padding(.top, 12)
        .padding(.bottom, 10)
    }
}
