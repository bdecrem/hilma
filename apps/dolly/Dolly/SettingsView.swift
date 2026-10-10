import SwiftUI

/// Time, language, starting point, voice, the number, sign out, version.
struct SettingsView: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    @State private var holdToTalk = UserDefaults.standard.bool(forKey: AppState.holdToTalkKey)
    @State private var saving = false
    @State private var error: String?
    private let skin = Skin.current

    var body: some View {
        ZStack {
            skin.background.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 16) {
                    HStack {
                        Text("Settings").font(skin.display(28)).foregroundStyle(skin.ink)
                        Spacer()
                        CloseButton { dismiss() }
                    }
                    .padding(.top, 18)

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
                        Task {
                            await state.signOut()
                            dismiss()
                        }
                    }
                    .padding(.top, 8)

                    Text("Dolly \(version) · To change your number, sign out and sign in with the new one.")
                        .font(skin.ui(12)).foregroundStyle(skin.ink3).multilineTextAlignment(.center)
                        .padding(.top, 6)
                }
                .padding(.horizontal, 22)
                .padding(.bottom, 30)
            }
        }
        .presentationDragIndicator(.visible)
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

    private func save(dailyHour: Int? = nil, language: String? = nil, level: String? = nil) async {
        saving = true
        defer { saving = false }
        do {
            state.user = try await DollyAPI.shared.updateMe(language: language, level: level, dailyHour: dailyHour)
            error = nil
            await state.refresh()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
