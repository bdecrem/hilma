import SwiftUI

struct ProfileView: View {
    @Environment(AppSession.self) private var session

    @State private var switchingTo: Language?
    @State private var switchError: String?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    identity
                        .listRowBackground(Theme.surface)
                }

                Section {
                    ForEach(allLanguages) { lang in
                        languageRow(lang)
                    }
                } header: {
                    Eyebrow(text: "Language")
                } footer: {
                    Text("Progress is kept per language — switch back any time.")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.inkTertiary)
                }
                .listRowBackground(Theme.surface)

                Section {
                    HStack {
                        Text("Email")
                            .foregroundStyle(Theme.ink)
                        Spacer()
                        Text(session.user?.email ?? "")
                            .foregroundStyle(Theme.inkTertiary)
                    }
                    .font(.system(size: 15))

                    Button(role: .destructive) {
                        Task { await session.signOut() }
                    } label: {
                        Text("Sign out")
                            .font(.system(size: 17))
                    }
                } header: {
                    Eyebrow(text: "Account")
                }
                .listRowBackground(Theme.surface)
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Theme.bg)
            .navigationTitle("Profile")
        }
    }

    private var identity: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(session.currentLanguage.nativeName)
                    .font(.target(28, .semibold))
                    .foregroundStyle(Theme.ink)
                Text("Level \(session.progress.level) · \(levelTitle(session.progress.level))")
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.inkSecondary)
            }
            VStack(alignment: .leading, spacing: 6) {
                LevelBar(fraction: session.progress.fraction)
                HStack {
                    Text("Level \(session.progress.level)")
                    Spacer()
                    Text("\(max(0, session.progress.nextLevelXp - session.progress.xp)) XP to Level \(min(6, session.progress.level + 1))")
                }
                .font(.system(size: 13).monospacedDigit())
                .foregroundStyle(Theme.inkTertiary)
            }
            if let switchError {
                Text(switchError)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.correction)
            }
        }
        .padding(.vertical, 8)
    }

    private func languageRow(_ lang: Language) -> some View {
        let isCurrent = lang.code == session.user?.language
        return Button {
            guard !isCurrent, switchingTo == nil else { return }
            switchingTo = lang
            switchError = nil
            Task {
                do {
                    try await session.switchLanguage(lang.code)
                } catch {
                    switchError = error.localizedDescription
                }
                switchingTo = nil
            }
        } label: {
            HStack {
                Text(lang.nativeName)
                    .font(.target(17))
                    .foregroundStyle(Theme.ink)
                Text(lang.name)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.inkTertiary)
                Spacer()
                if switchingTo == lang {
                    ProgressView()
                } else if isCurrent {
                    Image(systemName: "checkmark")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.accent)
                }
            }
        }
        .buttonStyle(.plain)
    }
}
