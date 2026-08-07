import SwiftUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(Session.self) private var session
    @AppStorage("colorSchemePreference") private var colorSchemeRaw = ColorSchemePreference.system.rawValue

    private var pref: ColorSchemePreference {
        ColorSchemePreference(rawValue: colorSchemeRaw) ?? .system
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Appearance") {
                    Picker("Color scheme", selection: Binding(
                        get: { pref },
                        set: { colorSchemeRaw = $0.rawValue }
                    )) {
                        ForEach(ColorSchemePreference.allCases) { p in
                            Text(p.label).tag(p)
                        }
                    }
                    .pickerStyle(.segmented)
                }

                Section("Library") {
                    NavigationLink {
                        PasteView(onSaved: { _ in dismiss() })
                    } label: {
                        Label("Paste text as a topic", systemImage: "doc.text")
                    }
                }

                if case let .signedIn(user) = session.state {
                    Section("Account") {
                        LabeledContent("Signed in as", value: user.username)
                        Button(role: .destructive) {
                            Task {
                                await session.logout()
                                dismiss()
                            }
                        } label: {
                            Text("Sign out")
                        }
                    }
                }

                Section("About") {
                    LabeledContent("App", value: "Dodo")
                    LabeledContent("Version", value: appVersion)
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private var appVersion: String {
        let v = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?"
        let b = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "?"
        return "\(v) (\(b))"
    }
}
