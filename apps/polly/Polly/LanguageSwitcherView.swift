import SwiftUI

// The language switcher (2026-09-19) — Profile → Learning → Language.
//
// Works like switching users on Netflix: each language is its own profile on
// the account (its own topics, cards, Peck, path, streak and level — schema
// 007, src/lib/polly/profiles.ts). Picking another tile signs out of this
// language and into that one: the server re-issues the session cookie for the
// sibling profile (creating it the first time), `Session.switchLanguage`
// swaps the user in, RootView rebuilds the tabs from scratch and plays the
// `LanguageFlipView` hello over them.
//
// This screen is part of Settings, so it stays in English on purpose
// (apps/polly/LOCALIZATION.md).

/// One tile of the switcher, from GET /api/polly/languages.
struct LanguageProfile: Codable, Identifiable, Equatable {
    let language: String
    let name: String
    let native: String
    /// The account already has a profile in this language.
    let started: Bool
    let active: Bool
    let level: Int
    let topicCount: Int
    let streak: Int

    var id: String { language }
    var lang: PollyLanguage? { PollyLanguage(rawValue: language) }

    enum CodingKeys: String, CodingKey {
        case language, name, native, started, active, level, streak
        case topicCount = "topic_count"
    }
}

struct LanguageSwitcherView: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss

    @State private var profiles: [LanguageProfile] = []
    @State private var loadError: String? = nil
    /// A not-yet-started language waiting for its "Start" confirmation.
    @State private var confirming: LanguageProfile? = nil
    /// The language being switched into (its tile spins, the rest lock).
    @State private var switching: String? = nil
    @State private var switchError: String? = nil

    var body: some View {
        ZStack {
            PollyTheme.bg.ignoresSafeArea()
            VStack(spacing: 0) {
                HStack {
                    Spacer()
                    Button { dismiss() } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(PollyTheme.text2)
                            .frame(width: 32, height: 32)
                            .background(PollyTheme.surface2, in: Circle())
                    }
                    .buttonStyle(.plain)
                    .disabled(switching != nil)
                    .accessibilityLabel("Close")
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)

                Spacer(minLength: 12)

                Text("Which language?")
                    .font(.custom("Fredoka", size: 30).weight(.semibold))
                    .foregroundStyle(PollyTheme.text)
                Text("Each language is its own Polly — its own topics, cards, streak and level. Switch back anytime; everything waits for you.")
                    .font(.system(size: 14.5))
                    .foregroundStyle(PollyTheme.text2)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 36)
                    .padding(.top, 8)
                    .padding(.bottom, 26)

                if profiles.isEmpty {
                    if let loadError {
                        Text(loadError)
                            .font(.system(size: 14))
                            .foregroundStyle(PollyTheme.text2)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 36)
                        Button("Try again") { Task { await load() } }
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(PollyTheme.accent)
                            .padding(.top, 10)
                    } else {
                        ProgressView().padding(.vertical, 60)
                    }
                } else {
                    VStack(spacing: 12) {
                        ForEach(profiles) { p in tile(p) }
                    }
                    .padding(.horizontal, 24)
                }

                if let switchError {
                    Text(switchError)
                        .font(.system(size: 13.5))
                        .foregroundStyle(PollyTheme.blush)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 36)
                        .padding(.top, 14)
                }

                Spacer()
                Spacer()
            }
            // The hello starts here, the moment a language is picked, and
            // RootView carries the same screen on once the sheets drop away.
            if let code = switching {
                LanguageFlipView(code: code)
                    .transition(.opacity)
                    .zIndex(1)
            }
        }
        .animation(.easeOut(duration: 0.25), value: switching)
        .interactiveDismissDisabled(switching != nil)
        .task { await load() }
    }

    // MARK: - Tile

    private func tile(_ p: LanguageProfile) -> some View {
        let isConfirming = confirming?.language == p.language
        let isSwitching = switching == p.language
        return VStack(spacing: 0) {
            Button {
                tap(p)
            } label: {
                HStack(spacing: 14) {
                    Text(p.lang?.flag ?? "🌍")
                        .font(.system(size: 34))
                        .frame(width: 54, height: 54)
                        .background(PollyTheme.surface2, in: RoundedRectangle(cornerRadius: 15))
                    VStack(alignment: .leading, spacing: 3) {
                        Text(p.native)
                            .font(.custom("Fredoka", size: 20).weight(.semibold))
                            .foregroundStyle(PollyTheme.text)
                        Text(subtitle(p))
                            .font(.system(size: 13))
                            .foregroundStyle(PollyTheme.text2)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 8)
                    trailing(p, isSwitching: isSwitching)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 13)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            // The active tile is inert but not dimmed (a disabled Button greys its label).
            .allowsHitTesting(!p.active && switching == nil)

            if isConfirming {
                VStack(spacing: 10) {
                    Text("Start \(p.name) from scratch? Your \(currentName) stays exactly as you left it.")
                        .font(.system(size: 13.5))
                        .foregroundStyle(PollyTheme.text2)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 10) {
                        Button {
                            withAnimation(.easeOut(duration: 0.15)) { confirming = nil }
                        } label: {
                            Text("Not now")
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(PollyTheme.text2)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 11)
                                .background(PollyTheme.surface2, in: RoundedRectangle(cornerRadius: 13))
                        }
                        .buttonStyle(.plain)
                        Button {
                            Task { await go(p) }
                        } label: {
                            Text("Start \(p.name)")
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(PollyTheme.inkOnAccent)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 11)
                                .background(PollyTheme.accent, in: RoundedRectangle(cornerRadius: 13))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.bottom, 14)
                .disabled(switching != nil)
                .transition(.opacity)
            }
        }
        .background(PollyTheme.surface, in: RoundedRectangle(cornerRadius: 20))
        .overlay(
            RoundedRectangle(cornerRadius: 20)
                .stroke(p.active || isConfirming ? PollyTheme.accent : PollyTheme.border,
                        lineWidth: p.active || isConfirming ? 2 : 1)
        )
        .opacity(switching != nil && !isSwitching ? 0.45 : 1)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(p.active ? .isSelected : [])
    }

    @ViewBuilder
    private func trailing(_ p: LanguageProfile, isSwitching: Bool) -> some View {
        if isSwitching {
            ProgressView()
        } else if p.active {
            Text("Learning now")
                .font(.system(size: 11.5, weight: .bold))
                .foregroundStyle(PollyTheme.accent)
                .padding(.horizontal, 9)
                .padding(.vertical, 5)
                .background(PollyTheme.accentSoft, in: Capsule())
        } else if p.started {
            HStack(spacing: 4) {
                Text("Switch")
                    .font(.system(size: 14, weight: .semibold))
                Image(systemName: "arrow.right")
                    .font(.system(size: 11, weight: .bold))
            }
            .foregroundStyle(PollyTheme.accent)
        } else {
            HStack(spacing: 4) {
                Image(systemName: "plus")
                    .font(.system(size: 11, weight: .bold))
                Text("Start")
                    .font(.system(size: 14, weight: .semibold))
            }
            .foregroundStyle(PollyTheme.text2)
        }
    }

    private func subtitle(_ p: LanguageProfile) -> String {
        guard p.started else { return "\(p.name) · \(p.lang?.hello ?? "")" }
        var parts = [p.name]
        if p.level > 0 { parts.append("Level \(p.level)") }
        parts.append(p.topicCount == 1 ? "1 topic" : "\(p.topicCount) topics")
        if p.streak > 0 { parts.append("\(p.streak)-day streak") }
        return parts.joined(separator: " · ")
    }

    private var currentName: String {
        profiles.first(where: \.active)?.name ?? "current language"
    }

    // MARK: - Actions

    private func tap(_ p: LanguageProfile) {
        guard !p.active, switching == nil else { return }
        switchError = nil
        if p.started {
            // A language you already study: straight in, like picking a
            // profile on Netflix.
            Task { await go(p) }
        } else {
            withAnimation(.easeOut(duration: 0.18)) {
                confirming = confirming?.language == p.language ? nil : p
            }
        }
    }

    private func go(_ p: LanguageProfile) async {
        switching = p.language
        switchError = nil
        if let error = await session.switchLanguage(to: p.language) {
            switching = nil
            switchError = error
        }
        // On success RootView rebuilds the tabs under this sheet, which
        // takes the sheet down with it — nothing to dismiss here.
    }

    private func load() async {
        loadError = nil
        do {
            profiles = try await PollyAPI.shared.languageProfiles()
        } catch {
            loadError = "Couldn't load your languages. Check the connection and try again."
        }
        #if targetEnvironment(simulator) || (DEBUG && targetEnvironment(macCatalyst))
        // `-AutoSwitchLanguage fr` — headless: flip into that language as
        // soon as the tiles load (starting it if needed).
        if let code = UserDefaults.standard.string(forKey: "AutoSwitchLanguage"),
           let p = profiles.first(where: { $0.language == code }), !p.active,
           LaunchOnce.take("AutoSwitchLanguage") {
            await go(p)
        }
        #endif
    }
}

/// The hello that plays over the rebuilt tabs right after a switch: the new
/// language's flag and greeting, then it fades into the app.
struct LanguageFlipView: View {
    let code: String
    @State private var appeared = false

    private var lang: PollyLanguage? { PollyLanguage(rawValue: code) }

    var body: some View {
        ZStack {
            PollyTheme.bg.ignoresSafeArea()
            VStack(spacing: 14) {
                Text(lang?.flag ?? "🌍")
                    .font(.system(size: 76))
                    .scaleEffect(appeared ? 1 : 0.6)
                Text(lang?.hello ?? "Hello!")
                    .font(.custom("Fredoka", size: 40).weight(.semibold))
                    .foregroundStyle(PollyTheme.text)
                    .opacity(appeared ? 1 : 0)
                    .offset(y: appeared ? 0 : 10)
                Text(lang?.native ?? "")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(PollyTheme.text2)
                    .opacity(appeared ? 1 : 0)
            }
        }
        .onAppear {
            withAnimation(.spring(response: 0.45, dampingFraction: 0.7)) { appeared = true }
        }
        .accessibilityElement(children: .combine)
    }
}

/// Launch-argument hooks live in the argument domain, so `removeObject` can't
/// consume them — and a language switch rebuilds the tabs, which would fire
/// them again. `take` answers true once per process per key.
enum LaunchOnce {
    private static var fired = Set<String>()
    static func take(_ key: String) -> Bool { fired.insert(key).inserted }
}
