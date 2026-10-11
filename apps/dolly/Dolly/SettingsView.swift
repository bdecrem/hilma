import SwiftUI

/// The settings — time, language, starting point, objectives, voice, sign
/// out, version — as sections inside the You sheet (no separate Settings
/// screen or gear since build 42).
struct SettingsSections: View {
    @Environment(AppState.self) private var state
    @State private var holdToTalk = UserDefaults.standard.bool(forKey: AppState.holdToTalkKey)
    @State private var saving = false
    @State private var error: String?
    private let skin = Skin.current

    var body: some View {
                VStack(spacing: 16) {
                    if let user = state.user {
                        section("The daily text") {
                            row("Time") {
                                Picker("Time", selection: Binding(get: { user.dailyHour }, set: { h in Task { await save(dailyHour: h) } })) {
                                    ForEach(5...22, id: \.self) { h in Text(hourLabel(h)).tag(h) }
                                }
                                .tint(skin.primary)
                            }
                            row("Number") { Text(user.phone).font(skin.uiBold(15)).foregroundStyle(skin.ink2) }
                        }
                        section("Learning") {
                            row("Language") {
                                Picker("Language", selection: Binding(get: { user.language }, set: { l in Task { await save(language: l) } })) {
                                    Text("Spanish").tag("es")
                                    Text("Mandarin").tag("zh")
                                }
                                .tint(skin.primary)
                            }
                            row("Starting point") {
                                Picker("Level", selection: Binding(get: { user.level }, set: { l in Task { await save(level: l) } })) {
                                    Text("Brand new").tag("new")
                                    Text("I know some").tag("some")
                                    Text("Conversational").tag("conversational")
                                }
                                .tint(skin.primary)
                            }
                        }
                        section("Learning objectives") {
                            row("Learning objectives") {
                                Toggle("", isOn: Binding(get: { user.objectives }, set: { v in Task { await save(objectives: v) } }))
                                    .labelsHidden().tint(skin.primary)
                            }
                            Text(user.objectives
                                 ? "On. After your day, ★ Star the day: a short guided call that works through your level’s objectives. A completed level gets a flag on your map and a short refresher every so often to stay bright. You’re on Level \(user.rung)."
                                 : "Off. Turn it on for a ladder of eight levels (A1 to B2) and a star round after your day that works through each level’s objectives. Everyone starts at Level 1.")
                                .font(skin.ui(13)).foregroundStyle(skin.ink3).frame(maxWidth: .infinity, alignment: .leading)
                            LevelsLink(title: "See all the levels", level: user.objectives ? user.rung : nil)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        section("Voice") {
                            row("Hold to talk") {
                                Toggle("", isOn: $holdToTalk).labelsHidden().tint(skin.primary)
                                    .onChange(of: holdToTalk) { _, v in UserDefaults.standard.set(v, forKey: AppState.holdToTalkKey) }
                            }
                            Text("On: Dolly hears you only while you hold the key. Off: just talk.")
                                .font(skin.ui(13)).foregroundStyle(skin.ink3).frame(maxWidth: .infinity, alignment: .leading)
                            row("Engine") { Text(VoiceEngine.current.label).font(skin.uiBold(15)).foregroundStyle(skin.ink2) }
                        }
                    }

                    if let error {
                        Text(error).font(skin.uiBold(13)).foregroundStyle(skin.bad)
                    }

                    BigButton(title: "Sign out", ghost: true) {
                        Task { await state.signOut() }
                    }
                    .padding(.top, 8)

                    Text("Dolly \(version) · To change your number, sign out and sign in with the new one.")
                        .font(skin.ui(12)).foregroundStyle(skin.ink3).multilineTextAlignment(.center)
                        .padding(.top, 6)
                }
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: @escaping () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title.uppercased()).font(skin.uiBold(11)).tracking(1).foregroundStyle(skin.ink3).padding(.leading, 6)
            Card(padding: 16) { VStack(spacing: 10) { content() } }
        }
    }

    private func row<Content: View>(_ label: String, @ViewBuilder content: @escaping () -> Content) -> some View {
        HStack {
            Text(label).font(skin.uiBold(16)).foregroundStyle(skin.ink)
            Spacer()
            content()
        }
        .frame(minHeight: 32)
    }

    private var version: String {
        let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?"
        let b = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "?"
        return "\(v) (\(b))"
    }

    private func save(dailyHour: Int? = nil, language: String? = nil, level: String? = nil, objectives: Bool? = nil) async {
        saving = true
        defer { saving = false }
        do {
            state.user = try await DollyAPI.shared.updateMe(language: language, level: level, dailyHour: dailyHour, objectives: objectives)
            error = nil
            await state.refresh()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
