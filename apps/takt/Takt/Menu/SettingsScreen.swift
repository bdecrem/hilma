import SwiftUI

/// Settings: the account (sign up / log in), sound levels, inputs, the theme, progress, about.
struct SettingsScreen: View {
    let app: AppModel
    @AppStorage("theme") private var theme: Theme = .dark
    @AppStorage("bandLevel") private var bandLevel = 1.0
    @AppStorage("pianoLevel") private var pianoLevel = 1.0
    @Environment(\.horizontalSizeClass) private var sizeClass
    @State private var confirmReset = false

    var body: some View {
        let compact = sizeClass == .compact
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 16) {
                TransportButton(symbol: "chevron.left", lit: false, size: compact ? 34 : 36, label: "Lessons") {
                    app.route = .lessons
                }
                Text("Settings")
                    .font(.display(compact ? 34 : 44))
                    .textCase(.uppercase)
                    .foregroundStyle(Palette.text)
                StaffLines()
                    .frame(maxWidth: .infinity)
            }
            .padding(.top, compact ? 8 : 24)
            .padding(.bottom, 20)

            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    AccountSection(account: app.account)

                    SettingsSection(title: "Sound") {
                        LevelRow(title: "Band", value: $bandLevel)
                        Hairline()
                        LevelRow(title: "Your piano", value: $pianoLevel)
                    }

                    SettingsSection(title: "Input") {
                        let sources = app.player?.midiSources ?? []
                        if sources.isEmpty {
                            row("MIDI", "No keyboard connected")
                        } else {
                            ForEach(sources, id: \.self) { name in
                                HStack(spacing: 8) {
                                    LED(lit: true, size: 7)
                                    Text(name).bodyText(15).foregroundStyle(Palette.text)
                                    Spacer()
                                }
                            }
                        }
                        #if targetEnvironment(macCatalyst)
                        Hairline()
                        row("Computer keys", "A–; play C3–E4 · Z X octave")
                        #endif
                    }

                    SettingsSection(title: "Display") {
                        HStack {
                            Text("Theme").bodyText(15).foregroundStyle(Palette.text)
                            Spacer()
                            Picker("Theme", selection: $theme) {
                                Text("Dark").tag(Theme.dark)
                                Text("Paper").tag(Theme.paper)
                            }
                            .pickerStyle(.segmented)
                            .frame(width: 180)
                        }
                    }

                    SettingsSection(title: "Progress") {
                        HStack {
                            Text("Start every lesson fresh").bodyText(15).foregroundStyle(Palette.text)
                            Spacer()
                            QuietButton(title: "Reset") { confirmReset = true }
                        }
                    }

                    SettingsSection(title: "About") {
                        row("Version", Self.version)
                        Hairline()
                        Text("Piano, tenor sax and hat foot: Versilian Community Sample Library (CC0). Bass: Finger Bass YR, FreePats (CC0). Drums: MuldjordKit by Lars Muldjord, CC BY 4.0.")
                            .bodyText(13)
                            .foregroundStyle(Palette.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.bottom, 24)
            }
            .scrollBounceBehavior(.basedOnSize)
        }
        .padding(.horizontal, compact ? 16 : 40)
        .frame(maxWidth: compact ? .infinity : 820, alignment: .leading)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Palette.ground.ignoresSafeArea())
        .confirmationDialog("Reset progress? Every lesson starts over.", isPresented: $confirmReset, titleVisibility: .visible) {
            Button("Reset progress", role: .destructive) {
                app.progress.reset()
                app.player?.restartLesson()
            }
        }
    }

    private func row(_ title: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).bodyText(15).foregroundStyle(Palette.text)
            Spacer(minLength: 12)
            Text(value).dataLabel(11).foregroundStyle(Palette.muted).multilineTextAlignment(.trailing)
        }
    }

    static var version: String {
        let info = Bundle.main.infoDictionary
        return "\(info?["CFBundleShortVersionString"] as? String ?? "?") (\(info?["CFBundleVersion"] as? String ?? "?"))"
    }
}

/// A titled panel of rows.
struct SettingsSection<Content: View>: View {
    let title: String
    @ViewBuilder var content: Content

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 8)
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .dataLabel(12, weight: .semibold)
                .foregroundStyle(Palette.muted)
            content
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(shape.fill(Palette.panel))
        .overlay(shape.strokeBorder(Palette.line, lineWidth: 1))
    }
}

/// A level trim, 0...150%.
struct LevelRow: View {
    let title: String
    @Binding var value: Double

    var body: some View {
        HStack(spacing: 14) {
            Text(title).bodyText(15).foregroundStyle(Palette.text).frame(width: 110, alignment: .leading)
            Slider(value: $value, in: 0...1.5).tint(Palette.signal)
            Text("\(Int((value * 100).rounded()))%")
                .dataLabel(11)
                .foregroundStyle(Palette.muted)
                .frame(width: 48, alignment: .trailing)
        }
    }
}

/// Sign up / log in / signed in. A guest account exists from first launch; signing up keeps it.
struct AccountSection: View {
    let account: AccountStore
    @State private var mode: Mode = .signUp
    @State private var email = ""
    @State private var password = ""

    enum Mode { case signUp, logIn }

    var body: some View {
        SettingsSection(title: "Account") {
            if let signedIn = account.email {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(signedIn).bodyText(15, weight: .semibold).foregroundStyle(Palette.text)
                        Text(account.lastSync.map { "Progress synced \($0.formatted(date: .omitted, time: .shortened))" } ?? "Signed in")
                            .dataLabel(11).foregroundStyle(Palette.muted)
                    }
                    Spacer()
                    QuietButton(title: "Log out") { Task { await account.logOut() } }
                }
            } else {
                Text(mode == .signUp ? "Keep your progress on every device. Your lessons so far come with you."
                                     : "Log in to pick up where you left off.")
                    .bodyText(14)
                    .foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
                Field(placeholder: "Email", text: $email, secure: false)
                Field(placeholder: "Password (8 or more)", text: $password, secure: true)
                if let error = account.error {
                    Text(error).bodyText(13).foregroundStyle(Palette.signal)
                }
                HStack(spacing: 10) {
                    PrimaryButton(title: account.busy ? "…" : (mode == .signUp ? "Sign up" : "Log in")) {
                        let e = email, p = password
                        Task {
                            if mode == .signUp { await account.signUp(email: e, password: p) } else { await account.logIn(email: e, password: p) }
                            if account.email != nil { password = "" }
                        }
                    }
                    .disabled(account.busy || email.isEmpty || password.isEmpty)
                    Spacer()
                    Button(mode == .signUp ? "I have an account" : "New here? Sign up") {
                        mode = mode == .signUp ? .logIn : .signUp
                    }
                    .buttonStyle(.plain)
                    .dataLabel(11)
                    .foregroundStyle(Palette.cue)
                }
            }
        }
    }
}

/// A flat text field in the panel style.
struct Field: View {
    let placeholder: String
    @Binding var text: String
    let secure: Bool

    var body: some View {
        Group {
            if secure {
                SecureField(placeholder, text: $text)
                    .textContentType(.password)
            } else {
                TextField(placeholder, text: $text)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }
        }
        .bodyText(15)
        .foregroundStyle(Palette.text)
        .padding(.horizontal, 12)
        .frame(height: 42)
        .background(RoundedRectangle(cornerRadius: 6).fill(Palette.ground))
        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Palette.line, lineWidth: 1))
    }
}
