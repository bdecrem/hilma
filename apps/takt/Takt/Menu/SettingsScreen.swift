import SwiftUI

/// Settings: the account (sign up / log in), sound levels, inputs, the theme, progress, about.
struct SettingsScreen: View {
    let app: AppModel
    @AppStorage("theme") private var theme: Theme = .dark
    @AppStorage("bandLevel") private var bandLevel = 1.0
    @AppStorage("pianoLevel") private var pianoLevel = 1.0
    @AppStorage("inputOffsetMs") private var inputOffsetMs = 0.0
    @AppStorage("menuMusic") private var menuMusic = true
    @AppStorage("countIn") private var countIn = true
    @AppStorage("preferMinor") private var preferMinor = false
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

            ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    AccountSection(account: app.account)

                    DailyTextSection(account: app.account)

                    SettingsSection(title: "Sound") {
                        LevelRow(title: "Band", value: $bandLevel)
                        Hairline()
                        LevelRow(title: "Your piano", value: $pianoLevel)
                        Hairline()
                        Toggle(isOn: $menuMusic) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Band on the menu").bodyText(15).foregroundStyle(Palette.text)
                                Text("Off: the band plays only in a lesson").dataLabel(10).foregroundStyle(Palette.muted)
                            }
                        }
                        .tint(Palette.signal)
                        Hairline()
                        Toggle(isOn: $countIn) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Count-in").bodyText(15).foregroundStyle(Palette.text)
                                Text("Four clicks before the band starts a lesson").dataLabel(10).foregroundStyle(Palette.muted)
                            }
                        }
                        .tint(Palette.signal)
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
                        Hairline()
                        HStack(alignment: .firstTextBaseline) {
                            Text("Timing").bodyText(15).foregroundStyle(Palette.text)
                            Spacer(minLength: 12)
                            Text(inputOffsetMs == 0 ? "Not measured" : Calibration.correction(inputOffsetMs))
                                .dataLabel(11).foregroundStyle(Palette.muted)
                            QuietButton(title: "Calibrate") { app.calibrate(then: .settings) }
                        }
                    }

                    SettingsSection(title: "Taste") {
                        Toggle(isOn: $preferMinor) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Prefer minor keys").bodyText(15).foregroundStyle(Palette.text)
                                Text("Scales in A minor instead of C major").dataLabel(10).foregroundStyle(Palette.muted)
                            }
                        }
                        .tint(Palette.signal)
                        .onChange(of: preferMinor) { app.tasteChanged() }
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
                        Text("Hand").bodyText(15).foregroundStyle(Palette.text).id("display")
                        HandPicker()
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
            #if DEBUG
            // `-SettingsSection display`: open scrolled to a section (screenshots).
            .onAppear {
                if let id = UserDefaults.standard.string(forKey: "SettingsSection") { proxy.scrollTo(id, anchor: .top) }
            }
            #endif
            }
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
            Text(title).bodyText(15).foregroundStyle(Palette.text).frame(minWidth: 110, alignment: .leading)
            Slider(value: $value, in: 0...1.5).tint(Palette.signal)
            // Room for "150%" at any text size.
            Text("150%").dataLabel(11).hidden()
                .overlay(alignment: .trailing) {
                    Text("\(Int((value * 100).rounded()))%").dataLabel(11).foregroundStyle(Palette.muted)
                }
                .fixedSize()
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
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 10) { accountButtons; Spacer(minLength: 0) }
                    VStack(alignment: .leading, spacing: 12) { accountButtons }
                }
            }
        }
    }

    @ViewBuilder private var accountButtons: some View {
                    PrimaryButton(title: account.busy ? "…" : (mode == .signUp ? "Sign up" : "Log in")) {
                        let e = email, p = password
                        Task {
                            if mode == .signUp { await account.signUp(email: e, password: p) } else { await account.logIn(email: e, password: p) }
                            if account.email != nil { password = "" }
                        }
                    }
                    .disabled(account.busy || email.isEmpty || password.isEmpty)
                    Button(mode == .signUp ? "I have an account" : "New here? Sign up") {
                        mode = mode == .signUp ? .logIn : .signUp
                    }
                    .buttonStyle(.plain)
                    .dataLabel(11)
                    .foregroundStyle(Palette.cue)
                    .fixedSize()
    }
}

/// A flat text field in the panel style.
struct Field: View {
    let placeholder: String
    @Binding var text: String
    let secure: Bool
    /// The keyboard for a plain field: email by default, or a phone number or a code.
    var content: UITextContentType = .emailAddress
    var keyboard: UIKeyboardType = .emailAddress

    var body: some View {
        Group {
            if secure {
                SecureField(placeholder, text: $text)
                    .textContentType(.password)
            } else {
                TextField(placeholder, text: $text)
                    .textContentType(content)
                    .keyboardType(keyboard)
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

/// The daily text: your number (verified by a code Takt texts you), on/off, and the hour it
/// comes at. Skipped on days you've already practiced.
struct DailyTextSection: View {
    let account: AccountStore
    @State private var phone = ""
    @State private var code = ""

    var body: some View {
        SettingsSection(title: "Daily text") {
            if let d = account.daily, let number = d.phone, d.verified {
                Toggle(isOn: Binding(get: { d.enabled }, set: { on in Task { await account.setDaily(enabled: on) } })) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Text me today's challenge").bodyText(15).foregroundStyle(Palette.text)
                        Text("Not on days you've practiced").dataLabel(10).foregroundStyle(Palette.muted)
                    }
                }
                .tint(Palette.signal)
                Hairline()
                HStack {
                    Text("At").bodyText(15).foregroundStyle(Palette.text)
                    Spacer()
                    Picker("At", selection: Binding(get: { d.hour }, set: { h in Task { await account.setDaily(hour: h) } })) {
                        ForEach(6..<23, id: \.self) { h in Text(Self.hourName(h)).tag(h) }
                    }
                    .pickerStyle(.menu)
                    .tint(Palette.text)
                }
                Hairline()
                HStack {
                    Text(number).dataLabel(12).foregroundStyle(Palette.text)
                    Spacer()
                    QuietButton(title: "Remove") { Task { await account.removePhone() } }
                }
            } else if let d = account.daily, let number = d.phone {
                Text("We texted a code to \(number).").bodyText(14).foregroundStyle(Palette.muted)
                Field(placeholder: "4-digit code", text: $code, secure: false, content: .oneTimeCode, keyboard: .numberPad)
                HStack(spacing: 10) {
                    PrimaryButton(title: account.busy ? "…" : "Verify") {
                        let c = code
                        Task { await account.verify(code: c); if account.daily?.verified == true { code = "" } }
                    }
                    .disabled(account.busy || code.count < 4)
                    QuietButton(title: "Other number") { Task { await account.removePhone() } }
                }
            } else {
                Text("Once a day, at your hour: your streak and the day's challenge, by iMessage.")
                    .bodyText(14)
                    .foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
                Field(placeholder: "Your phone number", text: $phone, secure: false, content: .telephoneNumber, keyboard: .phonePad)
                PrimaryButton(title: account.busy ? "…" : "Text me a code") {
                    let p = phone
                    Task { await account.sendCode(phone: p) }
                }
                .disabled(account.busy || phone.filter(\.isNumber).count < 10)
            }
            if let e = account.dailyError {
                Text(e).bodyText(13).foregroundStyle(Palette.signal)
            }
        }
        // After the account is known (a first launch makes the guest first).
        .task(id: account.state) {
            guard account.state != .unknown else { return }
            await account.loadDaily()
            #if DEBUG
            // `-DailyPhone <number>` asks for a code, `-DailyCode <code>` verifies it (with a
            // dev server in TAKT_IMESSAGE_DRY mode: the code is in its log, nothing is texted).
            let d = UserDefaults.standard
            if let p = d.string(forKey: "DailyPhone"), account.daily?.phone == nil { await account.sendCode(phone: p) }
            if let c = d.string(forKey: "DailyCode"), account.daily?.verified == false { await account.verify(code: c) }
            #endif
        }
    }

    static func hourName(_ h: Int) -> String {
        h == 12 ? "Noon" : h < 12 ? "\(h) am" : "\(h - 12) pm"
    }
}
